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
  /**
   * Qué base hay al otro lado.
   *
   * **No se envía a ninguna parte**: cuál es la base la decide el servicio en
   * su propia configuración. Se apunta aquí para reconocer la conexión, como
   * en el diálogo de QGIS, y para que dos conexiones al mismo equipo contra
   * bases distintas no se confundan.
   */
  baseDatos: string
  /**
   * Usuario del **servicio**, si está protegido con una clave propia.
   *
   * No es el usuario de PostgreSQL: ese vive en la configuración del servicio
   * que publica las tablas. Este solo hace falta cuando alguien ha puesto una
   * puerta delante del servicio, y entonces viaja como autenticación HTTP.
   */
  usuario: string
  guardadaEn: Date
}

export const CONEXION_NUEVA: Omit<Conexion, 'guardadaEn'> = {
  nombre: '',
  anfitrion: '',
  puerto: 9000,
  seguro: false,
  ruta: '',
  baseDatos: '',
  usuario: '',
}

/**
 * La cabecera de autenticación, cuando hay usuario y clave.
 *
 * **La clave no se guarda.** Vive en memoria mientras la pestaña esté abierta
 * y se vuelve a pedir en la siguiente visita. Dejar una contraseña escrita en
 * el almacén del navegador es dejarla a mano de cualquiera que se siente en
 * ese equipo, y aquí no hace falta para que la cosa funcione.
 */
export function cabeceraDe(usuario: string, clave: string): Record<string, string> {
  if (!usuario.trim() || !clave) return {}
  return { Authorization: `Basic ${btoa(`${usuario.trim()}:${clave}`)}` }
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
  /*
   * El error que de verdad comete todo el mundo, y con razón.
   *
   * Quien viene de QGIS pone aquí el puerto de PostgreSQL, porque es el que
   * conoce. Pero en el 5432 no hay nada que hable HTTP: ahí escucha Postgres
   * con su propio protocolo, y el navegador no sabe hablarlo. Mejor decirlo
   * antes de intentarlo que dejar que falle con un «no se pudo llegar».
   */
  if (c.puerto === 5432 || c.puerto === 5433) {
    return `El ${c.puerto} es el puerto de PostgreSQL, y ahí no hay nada que hable HTTP. Aquí va el puerto del servicio que publica las tablas —pg_featureserv usa el 9000—. La base, el 5432 y tu usuario de Postgres van en la configuración de ese servicio, no aquí.`
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
