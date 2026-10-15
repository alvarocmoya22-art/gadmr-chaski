/**
 * Qué se analiza y dónde.
 *
 * El análisis de puntos calientes que trae CHASKI del visor pide dos cosas:
 * una lista de puntos y un ámbito. En el visor las dos estaban dadas —los
 * registros de OpenStreetMap y las plataformas del casco urbano—, pero aquí
 * salen de lo que cada quien cargue, y eso obliga a decidir un par de cosas a
 * la vista.
 */
import { cajaDe, poligonosDe, type Anillo } from './geo'
import type { Capa } from './cargar'

/** Un punto listo para el análisis, con su clase. */
export interface PuntoAnalisis {
  categoria: string
  clase: string
  lon: number
  lat: number
  /** Para poder enseñar la ficha del registro al que corresponde. */
  props: Record<string, unknown>
}

/** La categoría es siempre la misma: lo que separa es el campo elegido. */
export const CATEGORIA = 'capa'

/**
 * El punto que representa a un registro.
 *
 * Una capa de polígonos o de líneas también se puede analizar, usando un punto
 * por registro. Para un predio o un tramo de calle eso es razonable; para una
 * parroquia entera no lo es, y por eso en pantalla se dice con qué se está
 * calculando en lugar de dejarlo implícito.
 */
function representante(g: GeoJSON.Geometry): [number, number] | null {
  if (g.type === 'Point') return g.coordinates as [number, number]
  if (g.type === 'MultiPoint') return (g.coordinates[0] ?? null) as [number, number] | null
  if (g.type === 'LineString') {
    const c = g.coordinates as [number, number][]
    return c[Math.floor(c.length / 2)] ?? null
  }
  if (g.type === 'MultiLineString') {
    const c = (g.coordinates[0] ?? []) as [number, number][]
    return c[Math.floor(c.length / 2)] ?? null
  }
  const anillos = poligonosDe(g)
  const anillo = anillos[0]?.[0]
  if (!anillo?.length) return null
  // Centro del anillo exterior. Para una huella de edificio o un predio cae
  // dentro; para una forma en U puede caer fuera, y se acepta: mueve el punto
  // unas decenas de metros en una rejilla de cien o más.
  const n = anillo.length - 1
  let x = 0
  let y = 0
  for (let i = 0; i < n; i++) {
    x += anillo[i][0]
    y += anillo[i][1]
  }
  return [x / n, y / n]
}

/** Los registros de una capa como puntos, clasificados por un campo. */
export function puntosDe(capa: Capa, campo: string | null): PuntoAnalisis[] {
  const salida: PuntoAnalisis[] = []
  for (const f of capa.geo.features) {
    if (!f.geometry) continue
    const p = representante(f.geometry)
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    const props = (f.properties ?? {}) as Record<string, unknown>
    const bruto = campo ? props[campo] : null
    const clase =
      bruto === null || bruto === undefined || bruto === '' ? '—' : String(bruto)
    salida.push({ categoria: CATEGORIA, clase, lon: p[0], lat: p[1], props })
  }
  return salida
}

/**
 * El ámbito: los polígonos de una capa, unidos.
 *
 * No hay unión geométrica de verdad —eso pide una biblioteca de topología que
 * no traemos—, y tampoco hace falta: el análisis recorre las piezas y pregunta
 * si la celda cae en alguna, así que una lista de polígonos sueltos se comporta
 * igual que su unión. Lo único que cambia es que un solapamiento se evalúa dos
 * veces, y para un límite administrativo eso no pasa.
 */
export function piezasDe(capa: Capa): Anillo[][] {
  const piezas: Anillo[][] = []
  for (const f of capa.geo.features) {
    if (!f.geometry) continue
    for (const poly of poligonosDe(f.geometry)) {
      if (poly[0]?.length >= 4) piezas.push(poly)
    }
  }
  return piezas
}

/** Metros de margen alrededor de los puntos cuando no hay capa de ámbito. */
const MARGEN_M = 500

/**
 * El recuadro de los propios registros, para cuando no hay ámbito cargado.
 *
 * Es el único ámbito que se puede deducir sin inventar nada, y tiene un sesgo
 * que conviene saber: el recuadro incluye esquinas donde no hay ciudad, esas
 * celdas vacías bajan la media y el resultado sale algo más caliente de lo que
 * saldría contra un límite de verdad. De ahí el aviso en el panel.
 */
export function recuadroDe(puntos: { lon: number; lat: number }[]): Anillo[][] {
  if (puntos.length === 0) return []
  const caja = cajaDe([puntos.map((p) => [p.lon, p.lat])])
  const grados = MARGEN_M / 111320
  const [oeste, sur, este, norte] = caja
  const dx = grados / Math.cos(((sur + norte) / 2) * (Math.PI / 180))
  return [
    [
      [
        [oeste - dx, sur - grados],
        [este + dx, sur - grados],
        [este + dx, norte + grados],
        [oeste - dx, norte + grados],
        [oeste - dx, sur - grados],
      ],
    ],
  ]
}

/** La caja envolvente de una capa, para encuadrar la cámara. */
export function cajaDeCapa(capa: Capa): [number, number, number, number] | null {
  let oeste = Infinity
  let sur = Infinity
  let este = -Infinity
  let norte = -Infinity
  const mirar = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [x, y] = c as [number, number]
      if (x < oeste) oeste = x
      if (x > este) este = x
      if (y < sur) sur = y
      if (y > norte) norte = y
      return
    }
    for (const sub of c) mirar(sub)
  }
  for (const f of capa.geo.features) mirar((f.geometry as { coordinates?: unknown })?.coordinates)
  return Number.isFinite(oeste) ? [oeste, sur, este, norte] : null
}
