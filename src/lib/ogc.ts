/**
 * Capas que vienen de una base de datos, no de un archivo.
 *
 * **Un navegador no puede hablar con PostgreSQL.** Postgres tiene su propio
 * protocolo sobre TCP y el navegador solo sabe HTTP, así que entre la base y
 * CHASKI hace falta algo que publique las tablas por HTTP. Lo que encaja es un
 * servicio **OGC API Features** —`pg_featureserv` es un solo ejecutable de
 * solo lectura que lo hace— porque devuelve GeoJSON, que es exactamente lo que
 * esta aplicación ya sabe leer.
 *
 * Así que esto no es «conectarse a PostGIS»: es leer un catálogo publicado,
 * igual que se leen las capas del visor. Y tiene una consecuencia buena: la
 * base nunca queda expuesta al navegador, solo las tablas que alguien haya
 * decidido publicar, y solo para leer.
 *
 * **La versión publicada en internet no podrá ver una base interna**, y está
 * bien que así sea: una página servida por https no puede llamar a un `http://`
 * de la red local, de modo que los datos institucionales no salen a internet
 * por este camino. Para eso, CHASKI se corre dentro de la red del municipio.
 */
import { leerArchivo, type Capa } from './cargar'

/** Una tabla publicada por el servicio. */
export interface Coleccion {
  id: string
  titulo: string
  descripcion: string
  /** Cuántos registros declara tener, si lo dice. */
  registros: number | null
}

/** Cuántos rasgos se piden por vuelta. */
const POR_VUELTA = 1000

/**
 * Tope de rasgos que se traen de una colección.
 *
 * Una tabla de catastro con cuarenta mil predios tarda y pesa; una con dos
 * millones tumbaría la pestaña. Al llegar aquí se corta y se dice que se
 * cortó, que es mejor que quedarse colgado sin explicación.
 */
export const TOPE_RASGOS = 60000

/** Quita la barra final y el `?f=json` que alguien haya pegado de más. */
export function limpiarBase(url: string): string {
  return url.trim().replace(/\?.*$/, '').replace(/\/+$/, '')
}

interface RespuestaColecciones {
  collections?: {
    id: string
    title?: string
    description?: string
    itemCount?: number
  }[]
}

/** Las tablas que el servicio publica. */
export async function listarColecciones(
  base: string,
  cabeceras: Record<string, string> = {},
): Promise<Coleccion[]> {
  const url = `${limpiarBase(base)}/collections?f=json`
  const resp = await fetch(url, { headers: cabeceras })
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      // El usuario vive en la ficha y la clave en su propio campo: decir solo
      // «ponlos en la ficha» manda al sitio equivocado a quien ya tiene usuario.
      'El servicio pide usuario y clave, o los que diste no valen. Revisa el usuario en la ficha de la conexión y vuelve a escribir la clave.',
    )
  }
  if (!resp.ok) throw new Error(`el servicio respondió ${resp.status}`)
  const datos = (await resp.json()) as RespuestaColecciones
  if (!Array.isArray(datos.collections)) {
    throw new Error('la dirección respondió, pero no parece un servicio OGC API Features')
  }
  return datos.collections.map((c) => ({
    id: c.id,
    titulo: c.title || c.id,
    descripcion: c.description ?? '',
    registros: typeof c.itemCount === 'number' ? c.itemCount : null,
  }))
}

interface Pagina {
  type?: string
  features?: GeoJSON.Feature[]
  numberMatched?: number
  numberReturned?: number
  links?: { rel?: string; href?: string; type?: string }[]
}

/**
 * Trae una colección entera, siguiendo la paginación del servicio.
 *
 * OGC API Features devuelve los rasgos por páginas y deja un enlace `next`
 * mientras quedan. Se sigue ese enlace en vez de ir sumando `offset` a mano,
 * porque cada implementación los numera a su manera y el enlace siempre es el
 * que el propio servicio considera correcto.
 */
export async function traerColeccion(
  base: string,
  coleccion: Coleccion,
  alAvanzar?: (traidos: number, total: number | null) => void,
  cabeceras: Record<string, string> = {},
): Promise<{ capa: Capa; cortada: boolean; total: number | null }> {
  const raiz = limpiarBase(base)
  let url: string | null = `${raiz}/collections/${encodeURIComponent(coleccion.id)}/items?f=json&limit=${POR_VUELTA}`
  const rasgos: GeoJSON.Feature[] = []
  let total: number | null = null
  let cortada = false

  while (url) {
    const resp: Response = await fetch(url, { headers: cabeceras })
    if (!resp.ok) throw new Error(`el servicio respondió ${resp.status}`)
    const pagina = (await resp.json()) as Pagina
    for (const f of pagina.features ?? []) {
      if (!f?.geometry) continue
      rasgos.push(f)
    }
    if (typeof pagina.numberMatched === 'number') total = pagina.numberMatched
    alAvanzar?.(rasgos.length, total)

    if (rasgos.length >= TOPE_RASGOS) {
      cortada = true
      break
    }
    // Sin rasgos nuevos no hay nada que seguir: evita dar vueltas si el
    // servicio devuelve un `next` que apunta a una página vacía.
    if ((pagina.numberReturned ?? pagina.features?.length ?? 0) === 0) break
    const siguiente = (pagina.links ?? []).find((l) => l.rel === 'next')?.href
    url = siguiente ? (siguiente.includes('f=json') ? siguiente : `${siguiente}&f=json`) : null
  }

  if (rasgos.length === 0) throw new Error('la colección llegó vacía')

  /*
   * Se pasa por el mismo lector que un archivo soltado a mano: así la capa que
   * viene de la base se describe, se analiza y se exporta igual que las demás,
   * sin un camino aparte que pueda comportarse de otro modo.
   */
  const geo: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: rasgos }
  const archivo = new File([JSON.stringify(geo)], `${coleccion.id}.geojson`)
  const { capa } = await leerArchivo(archivo)
  return {
    capa: {
      ...capa,
      nombre: coleccion.titulo,
      origen: `Base institucional · ${coleccion.id}${cortada ? ` (primeros ${TOPE_RASGOS})` : ''}`,
    },
    cortada,
    total,
  }
}

/**
 * Qué puede fallar al apuntar a una dirección, en lenguaje de persona.
 *
 * Los dos fallos de verdad frecuentes no dicen nada por sí solos en la consola
 * del navegador, así que se traducen aquí.
 */
export function explicarFallo(e: unknown, base: string): string {
  const texto = e instanceof Error ? e.message : String(e)
  const paginaSegura = location.protocol === 'https:'
  const servicioInseguro = limpiarBase(base).startsWith('http://')
  if (paginaSegura && servicioInseguro) {
    return `Esta página va por https y el servicio por http, así que el navegador bloquea la llamada sin más explicación. Para leer una base interna, abre CHASKI dentro de la red del municipio, o publica el servicio por https.`
  }
  if (/:543[23](\/|$)/.test(limpiarBase(base))) {
    return `Esa dirección apunta al puerto de PostgreSQL, y ahí no hay nada que hable HTTP: en el 5432 escucha Postgres con su propio protocolo, que un navegador no sabe hablar. Hace falta un servicio que publique las tablas por HTTP —pg_featureserv, en el 9000— y apuntar la conexión a ese.`
  }
  if (/failed to fetch|networkerror|load failed/i.test(texto)) {
    const limpia = limpiarBase(base)
    // El caso de todos los dias: el servicio local no esta levantado.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(limpia)) {
      return `No hay nada escuchando en ${limpia}. ¿Arrancaste el servicio? En la carpeta pg_featureserv, clic derecho sobre «arrancar.ps1» → Ejecutar con PowerShell, y deja esa ventana abierta.`
    }
    return `No se pudo llegar a ${limpia}. Puede estar apagado, fuera de tu red, o no permitir llamadas desde otra dirección (falta CORS en el servicio).`
  }
  return texto
}
