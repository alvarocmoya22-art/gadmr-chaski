/**
 * La red por la que se camina, armada desde una capa de líneas cualquiera.
 *
 * El visor de territorio trae su red ya preparada —un grafo con sus nodos y
 * sus aristas, construido por un script—. Aquí no se puede dar eso por hecho:
 * la red entra como una capa de líneas más, sea la vialidad del municipio o la
 * que alguien traiga en un shapefile, y el grafo se arma al vuelo.
 *
 * Eso es lo que permite medir la accesibilidad **por la calle y no en línea
 * recta**, que es la diferencia entre un número orientativo y uno que se puede
 * defender. En Riobamba, con el río y la quebrada partiendo la ciudad, un
 * equipamiento a 400 m en recta puede quedar a 700 m de caminata.
 *
 * **Dos tramos se conectan si comparten un vértice**, no si se cruzan. Los
 * datos de OpenStreetMap vienen así, con nodo compartido en cada cruce, pero
 * una capa dibujada en CAD puede tener dos calles que se cruzan sin tocarse en
 * ningún punto. Por eso `construirRed` devuelve cuánto conecta la pieza mayor:
 * si ese número es bajo, el resultado no vale y hay que decirlo.
 */
import { distanciaGeo } from './medidas'
import type { Capa } from './cargar'

/** Velocidad de caminata por omisión, en km/h. La que usa el visor. */
export const VELOCIDAD_KMH = 4.5

/** Tramos de tiempo que se ofrecen, en minutos. */
export const MINUTOS = [5, 10, 15]

/** Arista: los dos nodos que une y su longitud en metros. */
export type Arista = [number, number, number]

export interface Red {
  nodos: [number, number][]
  aristas: Arista[]
  /** El trazado de cada arista, para poder dibujarla y rasterizarla. */
  trazados: number[][][]
  /** Vecinos de cada nodo: pares [otroNodo, índiceDeArista]. */
  vecinos: [number, number][][]
  /** Cuántos nodos tiene la pieza conectada más grande. */
  mayorPieza: number
  /** Metros de línea que entraron al grafo. */
  metros: number
}

/**
 * Con cuántos decimales se redondea un vértice para decidir si dos son el mismo.
 *
 * Seis decimales son unos once centímetros. Más fino separa vértices que el
 * dibujante puso en el mismo sitio; más grueso junta esquinas distintas de una
 * manzana estrecha.
 */
const DECIMALES = 6

const clave = (lon: number, lat: number) =>
  `${lon.toFixed(DECIMALES)},${lat.toFixed(DECIMALES)}`

/** Las sartas de puntos de una geometría lineal. */
function sartas(g: GeoJSON.Geometry | null | undefined): number[][][] {
  if (!g) return []
  if (g.type === 'LineString') return [g.coordinates as number[][]]
  if (g.type === 'MultiLineString') return g.coordinates as number[][][]
  return []
}

/** Arma el grafo a partir de una capa de líneas. */
export function construirRed(capa: Capa): Red {
  const indices = new Map<string, number>()
  const nodos: [number, number][] = []
  const aristas: Arista[] = []
  const trazados: number[][][] = []
  let metros = 0

  const nodoDe = (lon: number, lat: number): number => {
    const k = clave(lon, lat)
    const ya = indices.get(k)
    if (ya !== undefined) return ya
    const i = nodos.length
    nodos.push([lon, lat])
    indices.set(k, i)
    return i
  }

  for (const f of capa.geo.features) {
    for (const sarta of sartas(f.geometry)) {
      for (let i = 0; i < sarta.length - 1; i++) {
        const [x1, y1] = sarta[i]
        const [x2, y2] = sarta[i + 1]
        const largo = distanciaGeo(x1, y1, x2, y2)
        if (largo === 0) continue
        const a = nodoDe(x1, y1)
        const b = nodoDe(x2, y2)
        if (a === b) continue
        aristas.push([a, b, largo])
        trazados.push([sarta[i], sarta[i + 1]])
        metros += largo
      }
    }
  }

  const vecinos: [number, number][][] = Array.from({ length: nodos.length }, () => [])
  aristas.forEach(([a, b], i) => {
    vecinos[a].push([b, i])
    vecinos[b].push([a, i])
  })

  return { nodos, aristas, trazados, vecinos, mayorPieza: piezaMayor(vecinos), metros }
}

/**
 * Cuántos nodos tiene la pieza conectada más grande.
 *
 * Es el aviso que decide si la red sirve. Una capa bien formada da una pieza
 * que abarca casi todo; una con las calles dibujadas sueltas da cientos de
 * piezas pequeñas, y entonces la isócrona solo recorre el trozo donde cayó el
 * origen y da un resultado que parece bueno y no lo es.
 */
function piezaMayor(vecinos: [number, number][][]): number {
  const visto = new Uint8Array(vecinos.length)
  let mayor = 0
  const pila: number[] = []
  for (let inicio = 0; inicio < vecinos.length; inicio++) {
    if (visto[inicio]) continue
    let tam = 0
    pila.length = 0
    pila.push(inicio)
    visto[inicio] = 1
    while (pila.length) {
      const u = pila.pop()!
      tam++
      for (const [v] of vecinos[u]) {
        if (!visto[v]) {
          visto[v] = 1
          pila.push(v)
        }
      }
    }
    if (tam > mayor) mayor = tam
  }
  return mayor
}

/** Rejilla de nodos para encontrar el más cercano sin recorrerlos todos. */
export class IndiceNodos {
  private celdas = new Map<string, number[]>()
  /** Lado de la celda en grados; unos 200 m a esta latitud. */
  private lado = 0.002

  private nodos: [number, number][]

  constructor(nodos: [number, number][]) {
    this.nodos = nodos
    nodos.forEach((n, i) => {
      const c = this.clave(n[0], n[1])
      const ya = this.celdas.get(c)
      if (ya) ya.push(i)
      else this.celdas.set(c, [i])
    })
  }

  private clave(lon: number, lat: number) {
    return `${Math.floor(lon / this.lado)},${Math.floor(lat / this.lado)}`
  }

  /** Nodo más cercano dentro de un radio razonable; -1 si no hay ninguno. */
  cercano(lon: number, lat: number): number {
    const cx = Math.floor(lon / this.lado)
    const cy = Math.floor(lat / this.lado)
    let mejor = -1
    let mejorD = Infinity
    // Se abre en anillos hasta encontrar algo: un registro en el borde puede
    // tener su calle más cercana a varias celdas de distancia.
    for (let r = 0; r <= 3 && mejor === -1; r++) {
      for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
          if (r > 0 && Math.abs(i) !== r && Math.abs(j) !== r) continue
          for (const n of this.celdas.get(`${cx + i},${cy + j}`) ?? []) {
            const dx = this.nodos[n][0] - lon
            const dy = this.nodos[n][1] - lat
            const d = dx * dx + dy * dy
            if (d < mejorD) {
              mejorD = d
              mejor = n
            }
          }
        }
      }
    }
    return mejor
  }
}

export interface Isocrona {
  /** Minutos de caminata hasta cada nodo; Infinity si no se alcanza. */
  minutos: Float64Array
  /** Aristas alcanzables, con el tiempo de su extremo peor. */
  alcanzables: { arista: number; minutos: number }[]
  /** Metros de calle dentro de cada tramo de tiempo. */
  metrosPorTramo: Map<number, number>
  /** Orígenes que engancharon con la red. */
  origenes: number
  /** Orígenes que no tenían ninguna línea cerca. */
  sueltos: number
}

/**
 * Hasta dónde se llega andando desde un conjunto de orígenes.
 *
 * Es un Dijkstra con todos los orígenes a la vez, no uno por origen: lo que
 * interesa es el tiempo hasta el **más cercano**, que es la pregunta de
 * accesibilidad, y así el coste no crece con el número de orígenes.
 */
export function calcularIsocrona(
  red: Red,
  origenes: { lon: number; lat: number }[],
  minutosMax: number,
  velocidadKmh = VELOCIDAD_KMH,
  indice?: IndiceNodos,
): Isocrona {
  const porMinuto = (velocidadKmh * 1000) / 60
  const idx = indice ?? new IndiceNodos(red.nodos)
  const n = red.nodos.length
  const minutos = new Float64Array(n).fill(Infinity)
  const cola: [number, number][] = []

  let enganchados = 0
  let sueltos = 0
  for (const o of origenes) {
    const nodo = idx.cercano(o.lon, o.lat)
    if (nodo < 0) {
      sueltos++
      continue
    }
    enganchados++
    if (minutos[nodo] > 0) {
      minutos[nodo] = 0
      cola.push([0, nodo])
    }
  }

  /*
   * Cola de prioridad mínima. Con decenas de miles de nodos un montículo
   * binario escrito a mano basta y sobra; traer una dependencia por esto sería
   * desproporcionado.
   */
  const subir = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (cola[p][0] <= cola[i][0]) break
      ;[cola[p], cola[i]] = [cola[i], cola[p]]
      i = p
    }
  }
  const bajar = (i: number) => {
    for (;;) {
      const izq = 2 * i + 1
      const der = izq + 1
      let m = i
      if (izq < cola.length && cola[izq][0] < cola[m][0]) m = izq
      if (der < cola.length && cola[der][0] < cola[m][0]) m = der
      if (m === i) break
      ;[cola[m], cola[i]] = [cola[i], cola[m]]
      i = m
    }
  }
  for (let i = cola.length - 1; i >= 0; i--) bajar(i)

  while (cola.length) {
    const [t, u] = cola[0]
    cola[0] = cola[cola.length - 1]
    cola.pop()
    if (cola.length) bajar(0)
    if (t > minutos[u]) continue
    if (t >= minutosMax) continue
    for (const [v, ia] of red.vecinos[u]) {
      const nuevo = t + red.aristas[ia][2] / porMinuto
      if (nuevo < minutos[v] && nuevo <= minutosMax) {
        minutos[v] = nuevo
        cola.push([nuevo, v])
        subir(cola.length - 1)
      }
    }
  }

  const alcanzables: { arista: number; minutos: number }[] = []
  const metrosPorTramo = new Map<number, number>()
  red.aristas.forEach(([a, b, largo], i) => {
    const peor = Math.max(minutos[a], minutos[b])
    if (!Number.isFinite(peor) || peor > minutosMax) return
    alcanzables.push({ arista: i, minutos: peor })
    for (const tramo of MINUTOS) {
      if (peor <= tramo) {
        metrosPorTramo.set(tramo, (metrosPorTramo.get(tramo) ?? 0) + largo)
        break
      }
    }
  })

  return { minutos, alcanzables, metrosPorTramo, origenes: enganchados, sueltos }
}
