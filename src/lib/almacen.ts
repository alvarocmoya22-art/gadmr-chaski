/**
 * El almacén del navegador, compartido.
 *
 * Dos cosas guardan aquí: la mesa de trabajo y las conexiones a bases. Las dos
 * tienen que abrir la base con el mismo número de versión, porque IndexedDB
 * falla si un módulo la abre con la 1 y otro con la 2. Por eso el abridor vive
 * en un solo sitio y las versiones se suben aquí.
 */

const BASE = 'chaski'
/** Sube cuando haya que crear un almacén nuevo. */
const VERSION = 2

export const ALMACEN_MESAS = 'mesas'
export const ALMACEN_CONEXIONES = 'conexiones'

export function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, VERSION)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(ALMACEN_MESAS)) {
        bd.createObjectStore(ALMACEN_MESAS, { keyPath: 'nombre' })
      }
      if (!bd.objectStoreNames.contains(ALMACEN_CONEXIONES)) {
        bd.createObjectStore(ALMACEN_CONEXIONES, { keyPath: 'nombre' })
      }
    }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error ?? new Error('no se pudo abrir el almacén'))
  })
}

/** Una operación sobre un almacén, abierta y cerrada sola. */
export function conAlmacen<T>(
  almacen: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        const trans = bd.transaction(almacen, modo)
        const peticion = fn(trans.objectStore(almacen))
        peticion.onsuccess = () => resolver(peticion.result as T)
        peticion.onerror = () => rechazar(peticion.error ?? new Error('falló la operación'))
        trans.oncomplete = () => bd.close()
      }),
  )
}
