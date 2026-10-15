/**
 * Los datos de ejemplo, para poder probar sin buscar un archivo primero.
 *
 * Una herramienta que al abrirse muestra una zona de arrastre vacía obliga a
 * quien llega a conseguir un shapefile antes de ver nada. Con cuatro capas
 * reales de Riobamba a un clic, en diez segundos se puede correr un análisis y
 * entender de qué va esto; después ya se traen los datos propios.
 *
 * Son las mismas que publica el visor de territorio, así que no se publica
 * nada que no estuviera publicado. Lo que viene de OpenStreetMap va citado.
 */
import { leerArchivo, type Capa } from './cargar'

export const CAPAS_EJEMPLO = [
  {
    archivo: 'equipamientos.geojson',
    nombre: 'Equipamientos',
    nota: '1.083 equipamientos con su tipo y su estado',
  },
  {
    archivo: 'plataformas.geojson',
    nombre: 'Plataformas',
    nota: 'Las 18 plataformas del casco urbano',
  },
  { archivo: 'barrios.geojson', nombre: 'Barrios', nota: '212 barrios urbanos' },
  {
    archivo: 'vialidad.geojson',
    nombre: 'Vialidad',
    nota: '9.571 tramos de vía, 644,5 km dentro del urbano',
  },
]

export const FUENTE_EJEMPLO =
  'Datos de ejemplo: inventario del GADM Riobamba y OpenStreetMap (ODbL).'

/**
 * Trae las capas de ejemplo.
 *
 * Pasan por el mismo lector que un archivo soltado a mano: así no hay un
 * camino especial para el ejemplo que pueda funcionar cuando el de verdad no.
 */
export async function cargarEjemplo(): Promise<{ capas: Capa[]; fallos: string[] }> {
  const base = import.meta.env.BASE_URL
  const capas: Capa[] = []
  const fallos: string[] = []
  for (const entrada of CAPAS_EJEMPLO) {
    try {
      const resp = await fetch(`${base}ejemplo/${entrada.archivo}`)
      if (!resp.ok) throw new Error(`no se pudo traer (${resp.status})`)
      const archivo = new File([await resp.blob()], entrada.archivo)
      const { capa } = await leerArchivo(archivo)
      capas.push({ ...capa, nombre: entrada.nombre, origen: `Ejemplo · ${entrada.nota}` })
    } catch (e) {
      fallos.push(`${entrada.nombre}: ${e instanceof Error ? e.message : 'no se pudo cargar'}`)
    }
  }
  return { capas, fallos }
}
