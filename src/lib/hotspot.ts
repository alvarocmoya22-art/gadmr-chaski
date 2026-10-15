/**
 * Puntos calientes y fríos: Getis-Ord Gi*.
 *
 * El visor ya tiene mapas de calor, y un mapa de calor dice **dónde hay
 * muchos**. Eso no es un punto caliente. Un punto caliente es donde hay más de
 * lo que cabría esperar por azar, y para afirmarlo hace falta un contraste, no
 * un degradado bonito: dos barrios con el mismo número de talleres no son lo
 * mismo si uno los tiene apiñados en tres cuadras y el otro repartidos.
 *
 * El estadístico es Gi* de Getis-Ord, el estándar para esto:
 *
 *     Gi* = ( Σ wij·xj − X̄·Σ wij ) / ( S · √[ (n·Σ wij² − (Σ wij)²) / (n−1) ] )
 *
 * donde `x` son los registros por celda, `w` vale 1 para las celdas dentro de
 * la banda de distancia —la propia incluida, que es lo que marca la estrella de
 * Gi*— y 0 fuera. El resultado es una puntuación z: cuántas desviaciones típicas
 * se aparta esa vecindad de la media de la ciudad.
 *
 * **Lo que esto no sabe, y hay que decirlo cada vez:** mide dónde está mapeado,
 * no dónde está. Con el levantamiento al 16 % verificado, un racimo puede ser
 * un racimo de comercios o un racimo de trabajo de campo. Gi* distingue
 * concentración de azar; no distingue realidad de esfuerzo de encuesta.
 */
import { contours } from 'd3-contour'

import { enPoligono, type Anillo } from './geo'

/** Umbrales de la normal estándar, de dos colas. */
const CONFIANZA: { z: number; etiqueta: string; grado: number }[] = [
  { z: 2.576, etiqueta: '99 %', grado: 3 },
  { z: 1.96, etiqueta: '95 %', grado: 2 },
  { z: 1.645, etiqueta: '90 %', grado: 1 },
]

/**
 * Marca de «toda la categoria» en el selector de subcategoria.
 *
 * Lo general antes que el detalle: el comercio en bloque dice donde esta el
 * comercio, y bajar a `shop=car_repair` dice otra cosa. Las dos preguntas son
 * validas y conviene poder hacerlas en ese orden.
 */
export const TODA_LA_CATEGORIA = '*'

/** Lados de celda que ofrece el control, en metros. */
export const CELDAS_HOTSPOT = [100, 150, 250]

/**
 * La banda de vecindad, como múltiplo del lado de celda.
 *
 * Con dos, cada celda mira a las que tiene a dos de distancia: suficiente para
 * que un racimo de barrio se note y poco para que no se diluya en la ciudad.
 * Es el parámetro que más mueve el resultado y por eso está aquí a la vista.
 */
const BANDA_EN_CELDAS = 2

export interface CeldaHotspot {
  /** Esquina suroeste. */
  lon: number
  lat: number
  /** Registros dentro. */
  n: number
  /** Puntuación z de Gi*. */
  z: number
  /**
   * De −3 a 3: negativo punto frío, positivo caliente, 0 sin significación.
   * El valor absoluto es el nivel de confianza (1 = 90 %, 2 = 95 %, 3 = 99 %).
   */
  grado: number
}

export interface Hotspot {
  /** La clase elegida, o `TODA_LA_CATEGORIA`. */
  clase: string
  /** Como llamarlo en pantalla. */
  rotulo: string
  celdaM: number
  bandaM: number
  /** Solo las celdas con alguna significación; las demás no se dibujan. */
  celdas: CeldaHotspot[]
  geo: GeoJSON.FeatureCollection
  /** Cuántas celdas del ámbito entraron en el cálculo. */
  celdasAnalizadas: number
  /** Registros de esa clase en el ámbito. */
  registros: number
  /** Registros que caen en celdas calientes con 95 % o más. */
  registrosEnCaliente: number
  calientes: number
  frias: number
  /** z máximo, para saber cuán marcado es el racimo. */
  zMaximo: number
}

/** Las subcategorías que hay dentro de una categoría, con cuántas de cada una. */
export function clasesDe(
  puntos: { categoria: string; clase: string }[],
  categoria: string,
): { clase: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const p of puntos) {
    if (p.categoria !== categoria) continue
    if (!p.clase || p.clase === '—') continue
    cuenta.set(p.clase, (cuenta.get(p.clase) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .map(([clase, n]) => ({ clase, n }))
    .sort((a, b) => b.n - a.n || a.clase.localeCompare(b.clase))
}

/**
 * Gi* sobre una rejilla regular recortada al ámbito.
 *
 * Las celdas vacías del ámbito **entran en el cálculo**, y no es un detalle: la
 * media y la desviación de la ciudad salen de ellas. Si solo se contaran las
 * celdas con registros, todo saldría caliente.
 */
export function calcularHotspot(
  puntos: { categoria: string; clase: string; lon: number; lat: number }[],
  piezas: Anillo[][],
  categoria: string,
  clase: string,
  celdaM: number,
  rotuloCategoria: string,
): Hotspot | null {
  const todas = clase === TODA_LA_CATEGORIA
  const dentro = puntos.filter((p) =>
    todas ? p.categoria === categoria : p.clase === clase,
  )
  if (piezas.length === 0) return null

  let oeste = Infinity
  let sur = Infinity
  let este = -Infinity
  let norte = -Infinity
  for (const poly of piezas) {
    for (const [x, y] of poly[0] ?? []) {
      if (x < oeste) oeste = x
      if (x > este) este = x
      if (y < sur) sur = y
      if (y > norte) norte = y
    }
  }
  if (!Number.isFinite(oeste)) return null

  const latRef = (sur + norte) / 2
  const mLon = 111320 * Math.cos((latRef * Math.PI) / 180)
  const dLon = celdaM / mLon
  const dLat = celdaM / 111320
  const ancho = Math.ceil((este - oeste) / dLon) + 1
  const alto = Math.ceil((norte - sur) / dLat) + 1

  // Qué celdas caen dentro del ámbito. Fuera no se cuenta ni como cero: no es
  // territorio que se esté analizando.
  const activa = new Uint8Array(ancho * alto)
  const conteo = new Float64Array(ancho * alto)
  let celdasAnalizadas = 0
  for (let j = 0; j < alto; j++) {
    const lat = sur + (j + 0.5) * dLat
    for (let i = 0; i < ancho; i++) {
      const lon = oeste + (i + 0.5) * dLon
      if (!piezas.some((poly) => enPoligono(lon, lat, poly))) continue
      activa[j * ancho + i] = 1
      celdasAnalizadas++
    }
  }
  if (celdasAnalizadas < 30) return null

  for (const p of dentro) {
    const i = Math.floor((p.lon - oeste) / dLon)
    const j = Math.floor((p.lat - sur) / dLat)
    if (i < 0 || j < 0 || i >= ancho || j >= alto) continue
    const k = j * ancho + i
    if (activa[k]) conteo[k] += 1
  }

  // Media y desviación sobre las celdas del ámbito.
  let suma = 0
  let suma2 = 0
  for (let k = 0; k < conteo.length; k++) {
    if (!activa[k]) continue
    suma += conteo[k]
    suma2 += conteo[k] * conteo[k]
  }
  const n = celdasAnalizadas
  const media = suma / n
  const s = Math.sqrt(Math.max(0, suma2 / n - media * media))
  if (s === 0) return null

  const r = BANDA_EN_CELDAS
  // El campo entero, tambien donde no hay significacion: de el salen los
  // contornos, y un contorno necesita saber por donde baja la cuesta.
  const campoZ = new Float64Array(ancho * alto)
  const celdas: CeldaHotspot[] = []
  let calientes = 0
  let frias = 0
  let zMaximo = 0
  let registrosEnCaliente = 0

  for (let j = 0; j < alto; j++) {
    for (let i = 0; i < ancho; i++) {
      const k = j * ancho + i
      if (!activa[k]) continue

      let sw = 0
      let swx = 0
      for (let jj = Math.max(0, j - r); jj <= Math.min(alto - 1, j + r); jj++) {
        for (let ii = Math.max(0, i - r); ii <= Math.min(ancho - 1, i + r); ii++) {
          const kk = jj * ancho + ii
          if (!activa[kk]) continue
          // Banda circular, no cuadrada: con la cuadrada las esquinas pesan lo
          // mismo que el vecino de al lado y eso no es una vecindad.
          if ((ii - i) * (ii - i) + (jj - j) * (jj - j) > r * r) continue
          sw += 1
          swx += conteo[kk]
        }
      }
      const denom = s * Math.sqrt((n * sw - sw * sw) / (n - 1))
      if (denom === 0) continue
      const z = (swx - media * sw) / denom
      campoZ[k] = z
      if (Math.abs(z) > Math.abs(zMaximo)) zMaximo = z

      const nivel = CONFIANZA.find((c) => Math.abs(z) >= c.z)
      if (!nivel) continue
      const grado = z > 0 ? nivel.grado : -nivel.grado
      if (grado > 0) {
        calientes++
        if (grado >= 2) registrosEnCaliente += conteo[k]
      } else frias++
      celdas.push({
        lon: oeste + i * dLon,
        lat: sur + j * dLat,
        n: conteo[k],
        z: Math.round(z * 100) / 100,
        grado,
      })
    }
  }

  /*
   * De la rejilla a la mancha.
   *
   * El analisis es por celda —Gi* necesita una vecindad contable— pero la
   * celda no es la respuesta: es el instrumento. Dibujar el cuadrado hace creer
   * que el punto caliente termina en ese borde, y lo que termina ahi es la
   * rejilla. El contorno del campo z dice lo mismo sin esa mentira, y ademas se
   * lee: una mancha se distingue de un vistazo y un damero de cuadrados grises
   * no.
   *
   * Es la misma marcha de cuadros que usan las isocronas, sobre otro campo.
   */
  const aLon = (gx: number) => oeste + (gx - 0.5) * dLon
  const aLat = (gy: number) => sur + (gy - 0.5) * dLat
  const rasgos: GeoJSON.Feature[] = []

  /*
   * Fuera del ambito, un valor muy por debajo de cualquier umbral.
   *
   * No es un detalle de dibujo. Con un cero ahi, el contorno interpola entre la
   * celda de dentro y la de fuera y acaba cayendo cerca de la de fuera: la
   * mancha se salia del limite hasta casi una celda entera, y daba a entender
   * que el analisis habia mirado un territorio que no habia mirado. Con un
   * valor muy negativo el corte se pega al borde del ambito, que es donde el
   * analisis termina de verdad.
   */
  const FUERA = -1e3

  for (const lado of [1, -1]) {
    // Para el lado frio se contornea el campo con el signo cambiado: d3 saca
    // siempre el recinto de «valor mayor o igual que el umbral».
    const valores = new Float64Array(campoZ.length)
    for (let k = 0; k < campoZ.length; k++) {
      valores[k] = activa[k] ? campoZ[k] * lado : FUERA
    }
    const generar = contours()
      .size([ancho, alto])
      .thresholds(CONFIANZA.map((c) => c.z).reverse())
    // Del umbral mas bajo al mas alto, para que el 99 % quede encima del 90 %.
    for (const c of generar(valores as unknown as number[])) {
      const nivel = CONFIANZA.find((x) => Math.abs(x.z - (c.value ?? 0)) < 1e-6)
      if (!nivel) continue
      for (const pieza of c.coordinates) {
        rasgos.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: pieza.map((anillo) =>
              anillo.map(([gx, gy]) => [aLon(gx), aLat(gy)] as [number, number]),
            ),
          },
          properties: { grado: nivel.grado * lado, confianza: nivel.etiqueta },
        })
      }
    }
  }

  const geo: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: rasgos }

  return {
    clase,
    rotulo: todas ? `${rotuloCategoria} · toda la categoría` : clase,
    celdaM,
    bandaM: celdaM * BANDA_EN_CELDAS,
    celdas,
    geo,
    celdasAnalizadas,
    registros: dentro.length,
    registrosEnCaliente,
    calientes,
    frias,
    zMaximo: Math.round(zMaximo * 100) / 100,
  }
}
