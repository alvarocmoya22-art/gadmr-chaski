/**
 * Geoproceso: recortar, intersecar, unir, borrar, disolver y zonas de influencia.
 *
 * Las operaciones entre polígonos las resuelve `polygon-clipping`, que es la
 * misma biblioteca que usa Turf por debajo. Es la única dependencia que pide
 * todo esto —unos veinte kilobytes— y a cambio deja de haber que aproximar
 * nada: una intersección es la intersección, no los centroides que caen dentro.
 *
 * Todo lo que mezcla áreas se hace en el plano métrico local de `metrico.ts`,
 * porque operar en grados sesga las superficies y deforma los círculos.
 */
import * as pc from 'polygon-clipping'
import { cajaDe, enPoligono, poligonosDe, type Anillo, type Caja } from './geo'
import { banda, circulo, planoDeCaja, type Plano } from './metrico'

/** Una colección de polígonos tal como la entiende `polygon-clipping`. */
export type Multi = number[][][][]

/** Los polígonos de una geometría, en el formato de la biblioteca. */
export function aMulti(g: GeoJSON.Geometry | null | undefined): Multi {
  if (!g) return []
  return poligonosDe(g).map((poly) => poly.map((anillo) => anillo.map((p) => [p[0], p[1]])))
}

/** De vuelta a GeoJSON; null cuando la operación no dejó nada. */
export function deMulti(m: Multi): GeoJSON.Geometry | null {
  const limpio = m.filter((poly) => poly.length > 0 && poly[0].length >= 4)
  if (limpio.length === 0) return null
  if (limpio.length === 1) return { type: 'Polygon', coordinates: limpio[0] }
  return { type: 'MultiPolygon', coordinates: limpio }
}

/** Lleva un multipolígono al plano métrico, o lo trae de vuelta. */
export function mover(m: Multi, fn: (x: number, y: number) => [number, number]): Multi {
  return m.map((poly) => poly.map((anillo) => anillo.map((p) => fn(p[0], p[1]) as number[])))
}

type Op = 'union' | 'intersection' | 'difference'

/**
 * Una operación entre dos conjuntos de polígonos, en el plano métrico.
 *
 * La biblioteca a veces se atraganta con geometrías mal cerradas o con
 * vértices repetidos —en catastro municipal eso es el pan de cada día—, así
 * que se envuelve: si una pieza falla, se devuelve vacío en vez de tumbar el
 * análisis entero, y quien llama cuenta cuántas fallaron.
 */
function operar(op: Op, a: Multi, b: Multi, plano: Plano): Multi | null {
  if (a.length === 0) return []
  try {
    const am = mover(a, plano.aMetros)
    const bm = mover(b, plano.aMetros)
    let r: Multi
    if (op === 'union') r = pc.union(am as never, bm as never) as Multi
    else if (op === 'intersection') r = pc.intersection(am as never, bm as never) as Multi
    else r = pc.difference(am as never, bm as never) as Multi
    return mover(r, plano.aGrados)
  } catch {
    return null
  }
}

export const intersecar = (a: Multi, b: Multi, plano: Plano) => operar('intersection', a, b, plano)
export const restar = (a: Multi, b: Multi, plano: Plano) => operar('difference', a, b, plano)

/** Une varios multipolígonos en uno. */
export function unir(partes: Multi[], plano: Plano): Multi | null {
  const vivas = partes.filter((p) => p.length > 0)
  if (vivas.length === 0) return []
  try {
    const enMetros = vivas.map((p) => mover(p, plano.aMetros))
    const r = pc.union(enMetros[0] as never, ...(enMetros.slice(1) as never[])) as Multi
    return mover(r, plano.aGrados)
  } catch {
    return null
  }
}

/** El plano métrico que le toca a un conjunto de geometrías. */
export function planoDe(geos: (GeoJSON.Geometry | null | undefined)[]): Plano {
  let caja: Caja = [Infinity, Infinity, -Infinity, -Infinity]
  for (const g of geos) {
    if (!g) continue
    const anillos = poligonosDe(g).flat()
    const puntos = anillos.length > 0 ? anillos : [coordenadasSueltas(g)]
    const c = cajaDe(puntos)
    if (c[0] < caja[0]) caja[0] = c[0]
    if (c[1] < caja[1]) caja[1] = c[1]
    if (c[2] > caja[2]) caja[2] = c[2]
    if (c[3] > caja[3]) caja[3] = c[3]
  }
  if (!Number.isFinite(caja[0])) return planoDeCaja([-78.65, -1.67, -78.6, -1.62])
  return planoDeCaja(caja)
}

/** Todas las coordenadas de una geometría, sin importar su tipo. */
function coordenadasSueltas(g: GeoJSON.Geometry): Anillo {
  const salida: Anillo = []
  const mirar = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      salida.push([c[0] as number, c[1] as number])
      return
    }
    for (const sub of c) mirar(sub)
  }
  mirar((g as { coordinates?: unknown }).coordinates)
  return salida.length > 0 ? salida : [[0, 0]]
}

/**
 * La zona de influencia de una geometría, a una distancia en metros.
 *
 * Un punto da un círculo. Una línea o un polígono dan la unión del cuerpo
 * recto de cada tramo con los círculos de cada vértice: así las esquinas salen
 * redondeadas, que es como se comporta una distancia de verdad —a doscientos
 * metros de una esquina se está a doscientos metros en todas direcciones, no
 * en una caja—.
 *
 * Con radio negativo sobre polígonos encoge en vez de crecer, que es lo que
 * hace falta para «la parte del predio que queda a más de x metros del borde».
 */
export function zonaInfluencia(
  g: GeoJSON.Geometry,
  metros: number,
  plano: Plano,
): Multi | null {
  const radio = Math.abs(metros)
  const partes: Multi[] = []

  const porSarta = (sarta: number[][], cerrar: boolean) => {
    const m = sarta.map((p) => plano.aMetros(p[0], p[1]))
    for (const [x, y] of m) partes.push([[circulo(x, y, radio)]])
    const hasta = cerrar ? m.length : m.length - 1
    for (let i = 0; i < hasta; i++) {
      const a = m[i]
      const b = m[(i + 1) % m.length]
      const cuerpo = banda(a[0], a[1], b[0], b[1], radio)
      if (cuerpo) partes.push([[cuerpo]])
    }
  }

  const t = g.type
  if (t === 'Point') {
    const [x, y] = plano.aMetros(...(g.coordinates as [number, number]))
    partes.push([[circulo(x, y, radio)]])
  } else if (t === 'MultiPoint') {
    for (const p of g.coordinates as [number, number][]) {
      const [x, y] = plano.aMetros(p[0], p[1])
      partes.push([[circulo(x, y, radio)]])
    }
  } else if (t === 'LineString') {
    porSarta(g.coordinates as number[][], false)
  } else if (t === 'MultiLineString') {
    for (const s of g.coordinates as number[][][]) porSarta(s, false)
  } else {
    for (const poly of poligonosDe(g)) for (const anillo of poly) porSarta(anillo, false)
  }

  if (partes.length === 0) return []
  try {
    const contorno = pc.union(partes[0] as never, ...(partes.slice(1) as never[])) as Multi
    const base = aMulti(g)
    if (base.length === 0) return mover(contorno, plano.aGrados)
    const baseMetros = mover(base, plano.aMetros)
    // Un polígono tiene que quedar incluido en su propia zona de influencia, y
    // encogido tiene que quedar dentro de sí mismo.
    const r =
      metros >= 0
        ? (pc.union(contorno as never, baseMetros as never) as Multi)
        : (pc.difference(baseMetros as never, contorno as never) as Multi)
    return mover(r, plano.aGrados)
  } catch {
    return null
  }
}

/** Dónde corta un segmento a otro, como fracción del primero. */
function corte(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number | null {
  const r1 = bx - ax
  const r2 = by - ay
  const s1 = dx - cx
  const s2 = dy - cy
  const den = r1 * s2 - r2 * s1
  if (den === 0) return null
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return t
}

/**
 * Recorta una geometría lineal por unos polígonos, partiendo los tramos.
 *
 * `polygon-clipping` solo sabe de áreas, así que esto se hace a mano: de cada
 * segmento se buscan los puntos donde cruza el contorno, se parte por ahí y se
 * conserva cada trocito cuyo punto medio cae dentro. Es exacto, y es lo que
 * hace falta para quedarse con la vialidad de un barrio y poder medirla.
 */
export function recortarLineas(
  g: GeoJSON.Geometry,
  piezas: Anillo[][],
): GeoJSON.Geometry | null {
  const sartas: number[][][] =
    g.type === 'LineString'
      ? [g.coordinates as number[][]]
      : g.type === 'MultiLineString'
        ? (g.coordinates as number[][][])
        : []
  if (sartas.length === 0) return null

  const salida: number[][][] = []
  for (const sarta of sartas) {
    let actual: number[][] = []
    for (let i = 0; i < sarta.length - 1; i++) {
      const [ax, ay] = sarta[i]
      const [bx, by] = sarta[i + 1]
      const cortes: number[] = [0, 1]
      for (const poly of piezas) {
        for (const anillo of poly) {
          for (let j = 0; j < anillo.length - 1; j++) {
            const t = corte(ax, ay, bx, by, anillo[j][0], anillo[j][1], anillo[j + 1][0], anillo[j + 1][1])
            if (t !== null) cortes.push(t)
          }
        }
      }
      cortes.sort((p, q) => p - q)
      for (let k = 0; k < cortes.length - 1; k++) {
        const t0 = cortes[k]
        const t1 = cortes[k + 1]
        if (t1 - t0 < 1e-12) continue
        const tm = (t0 + t1) / 2
        const mx = ax + (bx - ax) * tm
        const my = ay + (by - ay) * tm
        const dentro = piezas.some((poly) => enPoligono(mx, my, poly))
        const p0: number[] = [ax + (bx - ax) * t0, ay + (by - ay) * t0]
        const p1: number[] = [ax + (bx - ax) * t1, ay + (by - ay) * t1]
        if (dentro) {
          if (actual.length === 0) actual.push(p0)
          actual.push(p1)
        } else if (actual.length >= 2) {
          salida.push(actual)
          actual = []
        } else {
          actual = []
        }
      }
    }
    if (actual.length >= 2) salida.push(actual)
  }

  if (salida.length === 0) return null
  return salida.length === 1
    ? { type: 'LineString', coordinates: salida[0] }
    : { type: 'MultiLineString', coordinates: salida }
}
