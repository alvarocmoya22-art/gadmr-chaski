/**
 * La mesa de trabajo: lo que hay cargado, guardado entre visitas.
 *
 * Hasta ahora recargar la página dejaba la mesa limpia. Para probar la
 * aplicación eso daba igual; para usarla no: alguien que trae su capa, la
 * cruza con tres del municipio y arma un informe no puede perderlo porque
 * cerró la pestaña sin querer.
 *
 * Se guarda en IndexedDB y no en `localStorage`, que tiene unos cinco megas de
 * cuota y aquí una sola capa puede pasarlos. IndexedDB además almacena los
 * objetos tal cual —fechas incluidas— sin tener que convertirlos a texto y de
 * vuelta, que es donde esas conversiones suelen perder cosas.
 *
 * **Lo del municipio no se guarda entero.** Una capa que vino del visor o del
 * ejemplo se apunta por su nombre de archivo y se vuelve a traer al recuperar:
 * el catastro son quince megas que ya están publicados y no tiene sentido
 * duplicarlos aquí. Lo que sí se guarda entero es lo que no se puede volver a
 * pedir: los archivos que alguien soltó y los resultados que calculó.
 *
 * Todo vive en el navegador de quien lo use. No viaja a ningún sitio, igual
 * que el resto de la aplicación.
 */
import type { Capa } from './cargar'

const BASE = 'chaski'
const ALMACEN = 'mesas'
/** Sube cuando la forma de lo guardado cambie y lo viejo deje de servir. */
const VERSION_FORMATO = 1

/** La mesa que se guarda sola; las demás llevan el nombre que les pongan. */
export const MESA_ACTUAL = 'actual'

/** Una capa guardada: entera, o apuntada para volver a traerla. */
type CapaGuardada =
  | { modo: 'datos'; capa: Capa }
  | {
      modo: 'fuente'
      fuente: { tipo: 'ejemplo' | 'municipio'; archivo: string }
      /** Lo que el usuario cambió y hay que respetar al volver a traerla. */
      id: string
      nombre: string
      color: string
      visible: boolean
    }

export interface Mesa {
  nombre: string
  version: number
  guardadaEn: Date
  capas: CapaGuardada[]
  mapaBase: string
  /**
   * En qué modo se estaba trabajando.
   *
   * Hoy son las tres pestañas del panel. Cuando la aplicación se una con el
   * visor en los tres modos —mirar, analizar y contar—, es este mismo campo el
   * que los recuerda: por eso se guarda como texto libre y no como una lista
   * cerrada que habría que migrar.
   */
  modo: string
  /** Cuánto ocupa, para poder decirlo. */
  bytes: number
}

/** Lo que se guarda, sin las cifras que se calculan al vuelo. */
export interface MesaResumen {
  nombre: string
  guardadaEn: Date
  capas: number
  bytes: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, 1)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN, { keyPath: 'nombre' })
    }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error ?? new Error('no se pudo abrir el almacén'))
  })
}

function conBase<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        const trans = bd.transaction(ALMACEN, modo)
        const peticion = fn(trans.objectStore(ALMACEN))
        peticion.onsuccess = () => resolver(peticion.result as T)
        peticion.onerror = () => rechazar(peticion.error ?? new Error('falló la operación'))
        trans.oncomplete = () => bd.close()
      }),
  )
}

/**
 * Cuánto ocupa una mesa, aproximado.
 *
 * Se mide sobre el texto de las geometrías, que es casi todo. No pretende ser
 * exacto: pretende que quien vea «18 MB» entienda por qué guardar tarda.
 */
function pesar(capas: CapaGuardada[]): number {
  let bytes = 0
  for (const c of capas) {
    if (c.modo !== 'datos') continue
    // Una coordenada ronda los veinte caracteres entre corchetes y comas.
    bytes += JSON.stringify(c.capa.geo).length
  }
  return bytes
}

/** Prepara las capas para guardar, apuntando las que se pueden volver a pedir. */
function aGuardadas(capas: Capa[]): CapaGuardada[] {
  return capas.map((capa) =>
    capa.fuente
      ? {
          modo: 'fuente' as const,
          fuente: capa.fuente,
          id: capa.id,
          nombre: capa.nombre,
          color: capa.color,
          visible: capa.visible,
        }
      : { modo: 'datos' as const, capa },
  )
}

/** Guarda la mesa con ese nombre, pisando la anterior si la había. */
export async function guardar(
  nombre: string,
  capas: Capa[],
  mapaBase: string,
  modo: string,
): Promise<Mesa> {
  const guardadas = aGuardadas(capas)
  const mesa: Mesa = {
    nombre,
    version: VERSION_FORMATO,
    guardadaEn: new Date(),
    capas: guardadas,
    mapaBase,
    modo,
    bytes: pesar(guardadas),
  }
  await conBase('readwrite', (s) => s.put(mesa))
  return mesa
}

/** Trae una mesa guardada, o null si no está o es de un formato viejo. */
export async function traer(nombre: string): Promise<Mesa | null> {
  const mesa = await conBase<Mesa | undefined>('readonly', (s) => s.get(nombre))
  if (!mesa) return null
  // Una mesa de un formato anterior no se intenta adivinar: se ignora.
  if (mesa.version !== VERSION_FORMATO) return null
  return mesa
}

/** Las mesas guardadas, de la más reciente a la más antigua. */
export async function listar(): Promise<MesaResumen[]> {
  const todas = await conBase<Mesa[]>('readonly', (s) => s.getAll())
  return todas
    .filter((m) => m.version === VERSION_FORMATO)
    .map((m) => ({
      nombre: m.nombre,
      guardadaEn: m.guardadaEn,
      capas: m.capas.length,
      bytes: m.bytes,
    }))
    .sort((a, b) => b.guardadaEn.getTime() - a.guardadaEn.getTime())
}

export async function olvidar(nombre: string): Promise<void> {
  await conBase('readwrite', (s) => s.delete(nombre))
}

/**
 * Devuelve las capas de una mesa, volviendo a traer las que se apuntaron.
 *
 * Las que vinieron del visor o del ejemplo se piden otra vez; si alguna no
 * llega —porque no hay red o porque el visor cambió— se dice cuál, y las demás
 * se recuperan igual. Perder una capa del catálogo es molesto; perder la mesa
 * entera por eso sería absurdo.
 */
export async function reconstruir(
  mesa: Mesa,
  traerDeCatalogo: (
    tipo: 'ejemplo' | 'municipio',
    archivo: string,
  ) => Promise<Capa | null>,
): Promise<{ capas: Capa[]; fallos: string[] }> {
  const capas: Capa[] = []
  const fallos: string[] = []
  for (const guardada of mesa.capas) {
    if (guardada.modo === 'datos') {
      capas.push(guardada.capa)
      continue
    }
    try {
      const capa = await traerDeCatalogo(guardada.fuente.tipo, guardada.fuente.archivo)
      if (!capa) throw new Error('ya no está en el catálogo')
      capas.push({
        ...capa,
        id: guardada.id,
        nombre: guardada.nombre,
        color: guardada.color,
        visible: guardada.visible,
      })
    } catch (e) {
      fallos.push(
        `${guardada.nombre}: ${e instanceof Error ? e.message : 'no se pudo volver a traer'}.`,
      )
    }
  }
  return { capas, fallos }
}

/** El peso en una frase corta. */
export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Cuándo se guardó, en una frase corta. */
export function cuandoLegible(d: Date): string {
  const minutos = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
