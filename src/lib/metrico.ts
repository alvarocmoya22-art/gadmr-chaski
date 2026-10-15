/**
 * Trabajar en metros sin salir de los grados.
 *
 * Las operaciones de geoproceso —una zona de influencia, un recorte, una
 * intersección— no se pueden hacer directamente sobre longitud y latitud: un
 * grado no mide lo mismo a lo ancho que a lo alto, así que un círculo de mil
 * metros dibujado en grados sale ovalado y una intersección de áreas sale
 * sesgada.
 *
 * La salida es un plano local en metros, con el origen en el centro de los
 * datos: se proyecta, se opera y se vuelve. Para una ciudad o un cantón el
 * error es de milésimas de porcentaje. Para una capa que cruce medio país
 * dejaría de valer, y por eso el plano se arma con la caja de los datos que de
 * verdad entran, no con una zona fija.
 *
 * No se usa UTM a propósito: obligaría a arrastrar la zona por todas partes y
 * se rompería en cuanto alguien cargue una capa de otra provincia.
 */
import type { Anillo } from './geo'

const SEMIEJE_M = 6378137
const APLANAMIENTO = 1 / 298.257223563
const E2 = APLANAMIENTO * (2 - APLANAMIENTO)
const rad = (g: number) => (g * Math.PI) / 180

/** Un plano local en metros, con su ida y su vuelta. */
export interface Plano {
  aMetros: (lon: number, lat: number) => [number, number]
  aGrados: (x: number, y: number) => [number, number]
}

/**
 * Arma el plano a partir del centro de una caja.
 *
 * Los dos radios de curvatura se calculan una vez, en la latitud central, y de
 * ahí salen los metros por grado en cada dirección.
 */
export function planoLocal(centroLon: number, centroLat: number): Plano {
  const phi = rad(centroLat)
  const s = Math.sin(phi)
  const w = 1 - E2 * s * s
  const meridiano = (SEMIEJE_M * (1 - E2)) / Math.pow(w, 1.5)
  const vertical = SEMIEJE_M / Math.sqrt(w)
  const metrosPorGradoLat = (meridiano * Math.PI) / 180
  const metrosPorGradoLon = (vertical * Math.cos(phi) * Math.PI) / 180
  return {
    aMetros: (lon, lat) => [
      (lon - centroLon) * metrosPorGradoLon,
      (lat - centroLat) * metrosPorGradoLat,
    ],
    aGrados: (x, y) => [centroLon + x / metrosPorGradoLon, centroLat + y / metrosPorGradoLat],
  }
}

/** El plano que le corresponde a una caja [oeste, sur, este, norte]. */
export const planoDeCaja = (c: [number, number, number, number]): Plano =>
  planoLocal((c[0] + c[2]) / 2, (c[1] + c[3]) / 2)

/**
 * Lados con los que se dibuja un círculo de radio.
 *
 * Treinta y dos deja el polígono a tres milésimas del círculo real, por debajo
 * de la precisión con la que se conoce cualquier radio normativo. Subirlo solo
 * engorda el archivo.
 */
export const LADOS_CIRCULO = 32

/** Un círculo en el plano métrico, en sentido horario cerrado. */
export function circulo(cx: number, cy: number, radio: number): Anillo {
  const anillo: Anillo = []
  for (let i = 0; i <= LADOS_CIRCULO; i++) {
    const a = (i / LADOS_CIRCULO) * 2 * Math.PI
    anillo.push([cx + radio * Math.cos(a), cy + radio * Math.sin(a)])
  }
  return anillo
}

/**
 * El rectángulo que envuelve un segmento a una distancia dada.
 *
 * Es la mitad de una zona de influencia: el cuerpo recto. Las esquinas las
 * ponen los círculos de los vértices, y la unión de todo da el contorno
 * redondeado que se espera de un buffer.
 */
export function banda(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radio: number,
): Anillo | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const largo = Math.hypot(dx, dy)
  if (largo === 0) return null
  const nx = (-dy / largo) * radio
  const ny = (dx / largo) * radio
  return [
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
    [x1 + nx, y1 + ny],
  ]
}
