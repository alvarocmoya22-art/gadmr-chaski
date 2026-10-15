/**
 * Las capas del municipio, traídas en vivo del visor de territorio.
 *
 * El visor y CHASKI son las dos mitades de lo mismo: el visor tiene los datos
 * de casa preparados y publicados, y CHASKI tiene las herramientas para
 * cruzarlos con lo que traiga cada quien. Unirlos no pedía fusionar los dos
 * programas: bastaba con que CHASKI leyera lo que el visor ya publica.
 *
 * Y lo publica de verdad: las capas están en su sitio de GitHub Pages, que
 * responde con `Access-Control-Allow-Origin: *`, así que se leen desde aquí sin
 * intermediario. No se copia ni un archivo, no pesa ni un mega en este
 * repositorio, y cuando el visor actualice una capa, aquí entra la nueva.
 *
 * La contrapartida está dicha donde se usa: esto depende de que el visor siga
 * publicado. Por eso las cuatro capas del ejemplo siguen viviendo en
 * `public/ejemplo/`, para que probar la aplicación nunca dependa de internet.
 */
import { leerArchivo, type Capa } from './cargar'

/** De dónde salen. Es la dirección pública del visor, sin credencial ninguna. */
export const ORIGEN_VISOR =
  'https://alvarocmoya22-art.github.io/gadmr-visor-territorio/datos'

export const FUENTE_MUNICIPIO =
  'Capas del visor de territorio del GADM Riobamba. Lo derivado de OpenStreetMap es ODbL.'

export interface CapaMunicipal {
  archivo: string
  nombre: string
  nota: string
  /** Lo que ocupa, para que nadie se lleve una sorpresa con el catastro. */
  peso: string
  /** Las que tardan y conviene traer solo cuando hacen falta. */
  pesada?: boolean
  /**
   * `red` es el grafo de la vialidad, que no es GeoJSON y hay que convertir.
   * Las demás se leen con el mismo lector que un archivo soltado a mano.
   */
  formato?: 'geojson' | 'red'
}

export const CAPAS_MUNICIPIO: CapaMunicipal[] = [
  {
    archivo: 'plataformas.geojson',
    nombre: 'Plataformas',
    nota: '18 plataformas del casco urbano',
    peso: '37 KB',
  },
  {
    archivo: 'barrios.geojson',
    nombre: 'Barrios',
    nota: '212 barrios urbanos',
    peso: '124 KB',
  },
  {
    archivo: 'parroquias.geojson',
    nombre: 'Parroquias',
    nota: '5 parroquias urbanas',
    peso: '20 KB',
  },
  {
    archivo: 'equipamientos.geojson',
    nombre: 'Equipamientos',
    nota: '1.083 equipamientos con su tipo y estado',
    peso: '430 KB',
  },
  {
    archivo: 'proyectos.geojson',
    nombre: 'Proyectos 2026',
    nota: '41 proyectos con monto, estado y tipología',
    peso: '21 KB',
  },
  {
    archivo: 'red.json',
    nombre: 'Vialidad',
    nota: '17.636 tramos de la red vial completa, 1.931 km',
    peso: '2 MB',
    pesada: true,
    formato: 'red',
  },
  {
    archivo: 'edificios.geojson',
    nombre: 'Edificación',
    nota: '6.039 huellas de edificio con su altura',
    peso: '1,6 MB',
    pesada: true,
  },
  {
    archivo: 'catastro.geojson',
    nombre: 'Catastro',
    nota: '41.681 predios con clave catastral y superficie',
    peso: '15 MB',
    pesada: true,
  },
]

/** Una arista del grafo: nodo, nodo, metros y la sarta de puntos. */
type Arista = [number, number, number, number[][]]

/**
 * El grafo de la vialidad, convertido a líneas.
 *
 * `red.json` no es GeoJSON: es la red que usa el visor para calcular isócronas,
 * con sus nodos y sus aristas. Cada arista ya trae su trazado y sus metros
 * medidos, así que pasarla a líneas es recorrerla, y a cambio la vialidad entra
 * en CHASKI como una capa más.
 */
function deRed(datos: { aristas?: Arista[] }): GeoJSON.FeatureCollection {
  const rasgos: GeoJSON.Feature[] = []
  for (const a of datos.aristas ?? []) {
    const trazado = a[3]
    if (!trazado || trazado.length < 2) continue
    rasgos.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: trazado },
      properties: { metros: a[2] },
    })
  }
  return { type: 'FeatureCollection', features: rasgos }
}

/** Trae una capa del visor y la deja lista para analizar. */
export async function traerDelVisor(entrada: CapaMunicipal): Promise<Capa> {
  const resp = await fetch(`${ORIGEN_VISOR}/${entrada.archivo}`)
  if (!resp.ok) throw new Error(`el visor respondió ${resp.status}`)

  if (entrada.formato === 'red') {
    const geo = deRed(await resp.json())
    if (geo.features.length === 0) throw new Error('la red vial llegó vacía')
    // Se vuelve a pasar por el lector normal para que describa su tabla igual
    // que cualquier otra capa, sin un camino especial que pueda divergir.
    const archivo = new File([JSON.stringify(geo)], `${entrada.nombre}.geojson`)
    const { capa } = await leerArchivo(archivo)
    return {
      ...capa,
      nombre: entrada.nombre,
      origen: `Visor · ${entrada.nota}`,
      fuente: { tipo: 'municipio', archivo: entrada.archivo },
    }
  }

  const archivo = new File([await resp.blob()], entrada.archivo)
  const { capa } = await leerArchivo(archivo)
  return {
    ...capa,
    nombre: entrada.nombre,
    origen: `Visor · ${entrada.nota}`,
    fuente: { tipo: 'municipio', archivo: entrada.archivo },
  }
}

/** Una sola capa del municipio, por su nombre de archivo. */
export async function traerPorArchivo(archivo: string): Promise<Capa | null> {
  const entrada = CAPAS_MUNICIPIO.find((c) => c.archivo === archivo)
  return entrada ? traerDelVisor(entrada) : null
}

/** Trae varias, y dice cuáles fallaron en vez de rendirse con la primera. */
export async function traerVarias(
  entradas: CapaMunicipal[],
): Promise<{ capas: Capa[]; fallos: string[] }> {
  const capas: Capa[] = []
  const fallos: string[] = []
  for (const entrada of entradas) {
    try {
      capas.push(await traerDelVisor(entrada))
    } catch (e) {
      fallos.push(
        `${entrada.nombre}: ${e instanceof Error ? e.message : 'no se pudo traer'}.`,
      )
    }
  }
  return { capas, fallos }
}
