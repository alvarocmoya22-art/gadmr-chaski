/**
 * Conexiones con nombre, como las de QGIS.
 *
 * En QGIS una conexión se guarda con su nombre —«base_grafica»— y después se
 * elige de una lista: nadie reescribe el anfitrión y el puerto cada vez. Aquí
 * igual, y por la misma razón.
 *
 * Lo que cambia es qué hay al otro lado. QGIS habla con PostgreSQL en el 5432;
 * esto habla con el servicio que publica esas tablas por HTTP, normalmente en
 * el 9000. Por eso **no hay usuario ni contraseña en esta ficha**: la
 * credencial de la base vive en la configuración de ese servicio, en el equipo
 * donde corre, y nunca llega al navegador.
 */
import { ALMACEN_CONEXIONES, conAlmacen } from './almacen'

export interface Conexion {
  /** El nombre con el que se guarda y se elige; es su clave. */
  nombre: string
  anfitrion: string
  puerto: number
  /** Cierto si el servicio va por https. */
  seguro: boolean
  /** Ruta, cuando el servicio cuelga de una: por ejemplo `/featureserv`. */
  ruta: string
  guardadaEn: Date
}

export const CONEXION_NUEVA: Omit<Conexion, 'guardadaEn'> = {
  nombre: '',
  anfitrion: '',
  puerto: 9000,
  seguro: false,
  ruta: '',
}

/** La dirección que de verdad se llama. */
export function urlDe(c: Pick<Conexion, 'anfitrion' | 'puerto' | 'seguro' | 'ruta'>): string {
  const esquema = c.seguro ? 'https' : 'http'
  const ruta = c.ruta.trim().replace(/\/+$/, '')
  const camino = ruta === '' || ruta.startsWith('/') ? ruta : `/${ruta}`
  return `${esquema}://${c.anfitrion.trim()}:${c.puerto}${camino}`
}

/** Qué le falta a una ficha para poder guardarse. */
export function queFalta(c: Omit<Conexion, 'guardadaEn'>): string | null {
  if (c.nombre.trim() === '') return 'Ponle un nombre, para reconocerla después.'
  if (c.anfitrion.trim() === '') return 'Falta el anfitrión: el equipo donde corre el servicio.'
  if (!Number.isFinite(c.puerto) || c.puerto < 1 || c.puerto > 65535) {
    return 'El puerto tiene que ser un número entre 1 y 65535.'
  }
  if (/^https?:\/\//i.test(c.anfitrion)) {
    return 'El anfitrión va sin «http://»: solo el nombre o la dirección del equipo.'
  }
  return null
}

export const listar = () =>
  conAlmacen<Conexion[]>(ALMACEN_CONEXIONES, 'readonly', (s) => s.getAll()).then((cs) =>
    cs.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  )

export async function guardar(c: Omit<Conexion, 'guardadaEn'>): Promise<Conexion> {
  const entera: Conexion = { ...c, nombre: c.nombre.trim(), guardadaEn: new Date() }
  await conAlmacen(ALMACEN_CONEXIONES, 'readwrite', (s) => s.put(entera))
  return entera
}

export const olvidar = (nombre: string) =>
  conAlmacen<void>(ALMACEN_CONEXIONES, 'readwrite', (s) => s.delete(nombre))
