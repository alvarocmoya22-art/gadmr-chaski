/**
 * De las calles alcanzables a la mancha en el suelo.
 *
 * Hasta aquí la isócrona eran las calles, pintadas como líneas. Es exacto —el
 * tiempo solo se mide donde hay calle— pero no es lo que se lee: en un plano
 * de accesibilidad se espera la superficie servida, que es lo que se compara
 * con un barrio, con un predio o con un radio de la ordenanza.
 *
 * El paso de una cosa a la otra no es cosmético y conviene decir cómo se hace,
 * porque cualquier isócrona dibujada como área lleva dentro este supuesto:
 *
 *   1. Se recorre cada calle alcanzable interpolando el tiempo entre sus dos
 *      extremos, que Dijkstra ya calculó.
 *   2. Cada punto del recorrido «moja» el suelo a su alrededor hasta
 *      `ALCANCE_FUERA_DE_CALLE_M`, sumando lo que se tarda en andar esos
 *      metros. Es el tramo final —de la calzada a la puerta— que ninguna red
 *      de calles contiene.
 *   3. De ese campo de minutos se sacan los contornos.
 *
 * O sea: la mancha es más generosa que las líneas, a propósito, y el ancho de
 * esa generosidad es un parámetro a la vista y no un efecto del dibujo.
 */
import { contours } from 'd3-contour'
import { enPoligono, type Anillo } from './geo'
import { MINUTOS, VELOCIDAD_KMH, type Isocrona, type Red } from './red'

/**
 * Cuánto se alcanza desde la calzada, en metros.
 *
 * La isócrona se calcula sobre la calle, pero nadie vive en la calzada: se
 * anda un trecho desde la esquina hasta la puerta. Ensanchando lo alcanzable
 * este tanto a cada lado, la mancha cubre la manzana y no solo el eje de la
 * vía, que es lo que se ve en una isócrona de verdad.
 */
export const ALCANCE_FUERA_DE_CALLE_M = 120

/**
 * Lado de la celda del campo de tiempos, en metros.
 *
 * Con 40 m el contorno sigue la forma de las manzanas sin que se vea el
 * escalón. Bajar más cuadruplica las celdas cada vez que se parte el lado y el
 * contorno no mejora, porque el dato de partida —la calle— no tiene esa
 * resolución.
 */
const PASO_RASTER_M = 40

/** Techo de celdas; por encima se agranda la celda en vez de colgar el navegador. */
const MAX_CELDAS = 1_500_000

/** Campo de minutos de caminata sobre una rejilla regular. */
export interface Campo {
  /** Minutos hasta el origen más cercano en cada celda; Infinity si no se llega. */
  minutos: Float32Array
  ancho: number
  alto: number
  /** Centro de la celda (0,0). */
  lon0: number
  lat0: number
  dLon: number
  dLat: number
  /** Lado real de la celda en metros, que puede no ser `PASO_RASTER_M`. */
  paso: number
  /** Superficie de una celda, en hectáreas. */
  celdaHa: number
}

/** Una banda: todo lo que queda a `minutos` de caminata o menos. */
export interface Banda {
  minutos: number
  /**
   * Trozos de la banda. Cada trozo es una lista de anillos en lon/lat: el
   * primero es su contorno y los demás, sus huecos.
   */
  piezas: [number, number][][][]
  /** Superficie de la banda entera, en hectáreas. */
  hectareas: number
}

const metrosPorGradoLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)

/**
 * Convierte la isócrona de calles en un campo de minutos sobre el suelo.
 *
 * Devuelve null cuando no hay nada alcanzable, que es el caso real de un tipo
 * de equipamiento sin ningún ejemplar en el ámbito.
 */
export function campoDeTiempos(
  red: Red,
  iso: Isocrona,
  minutosMax: number,
  velocidadKmh = VELOCIDAD_KMH,
): Campo | null {
  const porMinuto = (velocidadKmh * 1000) / 60
  let oeste = Infinity
  let sur = Infinity
  let este = -Infinity
  let norte = -Infinity
  for (const { arista } of iso.alcanzables) {
    for (const [x, y] of red.trazados[arista]) {
      if (x < oeste) oeste = x
      if (x > este) este = x
      if (y < sur) sur = y
      if (y > norte) norte = y
    }
  }
  if (!Number.isFinite(oeste)) return null

  const latRef = (sur + norte) / 2
  const mLon = metrosPorGradoLon(latRef)
  // El margen deja sitio al alcance fuera de la calle; sin él la mancha se
  // cortaría en recta contra el borde de la caja.
  const margen = ALCANCE_FUERA_DE_CALLE_M * 1.5
  oeste -= margen / mLon
  este += margen / mLon
  sur -= margen / 111320
  norte += margen / 111320

  let paso = PASO_RASTER_M
  let dLon = paso / mLon
  let dLat = paso / 111320
  let ancho = Math.ceil((este - oeste) / dLon) + 1
  let alto = Math.ceil((norte - sur) / dLat) + 1
  while (ancho * alto > MAX_CELDAS) {
    paso *= 1.5
    dLon = paso / mLon
    dLat = paso / 111320
    ancho = Math.ceil((este - oeste) / dLon) + 1
    alto = Math.ceil((norte - sur) / dLat) + 1
  }

  const minutos = new Float32Array(ancho * alto).fill(Infinity)
  const lon0 = oeste
  const lat0 = sur
  const radio = ALCANCE_FUERA_DE_CALLE_M
  const r = Math.ceil(radio / paso)

  /** Moja el suelo alrededor de un punto de calle al que se llega en `t`. */
  const mojar = (x: number, y: number, t: number) => {
    const gx = Math.round((x - lon0) / dLon)
    const gy = Math.round((y - lat0) / dLat)
    for (let j = Math.max(0, gy - r); j <= Math.min(alto - 1, gy + r); j++) {
      const dy = (lat0 + j * dLat - y) * 111320
      for (let i = Math.max(0, gx - r); i <= Math.min(ancho - 1, gx + r); i++) {
        const dx = (lon0 + i * dLon - x) * mLon
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > radio) continue
        const cand = t + d / porMinuto
        const k = j * ancho + i
        if (cand < minutos[k]) minutos[k] = cand
      }
    }
  }

  /*
   * Se recorre cada calle alcanzable interpolando el tiempo entre sus extremos.
   * El paso del recorrido es medio lado de celda: con uno entero quedarían
   * celdas sin mojar entre dos puntos seguidos y la mancha saldría con
   * agujeros que no existen.
   */
  const salto = paso / 2
  for (const { arista } of iso.alcanzables) {
    const [a, b] = red.aristas[arista]
  const trazado = red.trazados[arista]
    const tA = iso.minutos[a]
    const tB = iso.minutos[b]
    if (!Number.isFinite(tA) || !Number.isFinite(tB)) continue

    // Largo medido sobre el trazado, no el declarado: el tiempo se reparte
    // sobre la misma geometría que se está recorriendo.
    const tramos: number[] = []
    let largo = 0
    for (let k = 1; k < trazado.length; k++) {
      const dx = (trazado[k][0] - trazado[k - 1][0]) * mLon
      const dy = (trazado[k][1] - trazado[k - 1][1]) * 111320
      const l = Math.sqrt(dx * dx + dy * dy)
      tramos.push(l)
      largo += l
    }
    if (largo === 0) {
      const t = Math.min(tA, tB)
      if (t <= minutosMax) mojar(trazado[0][0], trazado[0][1], t)
      continue
    }

    let recorrido = 0
    for (let k = 0; k < tramos.length; k++) {
      const l = tramos[k]
      const n = Math.max(1, Math.ceil(l / salto))
      for (let p = 0; p < n; p++) {
        const f = p / n
        const x = trazado[k][0] + (trazado[k + 1][0] - trazado[k][0]) * f
        const y = trazado[k][1] + (trazado[k + 1][1] - trazado[k][1]) * f
        const d = recorrido + l * f
        const t = Math.min(tA + d / porMinuto, tB + (largo - d) / porMinuto)
        if (t <= minutosMax) mojar(x, y, t)
      }
      recorrido += l
    }
    const ultimo = trazado[trazado.length - 1]
    if (tB <= minutosMax) mojar(ultimo[0], ultimo[1], tB)
  }

  /*
   * Lo que pasa del tiempo pedido no es parte de la isócrona. Se descarta aquí
   * y no al pintar, para que el contorno, la superficie y la población midan
   * exactamente lo mismo.
   */
  for (let k = 0; k < minutos.length; k++) {
    if (minutos[k] > minutosMax) minutos[k] = Infinity
  }

  return { minutos, ancho, alto, lon0, lat0, dLon, dLat, paso, celdaHa: (paso * paso) / 10000 }
}

/**
 * Recorta el campo al ámbito elegido, en el sitio.
 *
 * El alcance se calcula con **todos** los equipamientos del urbano y se recorta
 * después, nunca al revés. Son dos cosas distintas y confundirlas falsea el
 * resultado: la escuela que está cien metros fuera del límite de la plataforma
 * sigue sirviendo a quien vive dentro, y no contarla haría aparecer un vacío de
 * cobertura que en la calle no existe. El límite administrativo decide qué se
 * mira, no por dónde se puede andar.
 *
 * Recortar aquí —y no al dibujar— hace que el contorno, las hectáreas y los
 * habitantes salgan los tres del mismo campo ya recortado, así que no pueden
 * contradecirse.
 */
export function recortarCampo(campo: Campo, piezas: Anillo[][]): void {
  if (piezas.length === 0) return

  // Caja de cada pieza: con dieciocho plataformas, probar celda contra todas
  // sería diecisiete pruebas de más por celda.
  const cajas = piezas.map((poly) => {
    let oeste = Infinity
    let sur = Infinity
    let este = -Infinity
    let norte = -Infinity
    for (const [x, y] of poly[0] ?? []) {
      if (x < oeste) oeste = x
      if (x > este) este = x
      if (y < sur) sur = y
      if (y > norte) norte = y
    }
    return [oeste, sur, este, norte]
  })

  for (let j = 0; j < campo.alto; j++) {
    const lat = campo.lat0 + j * campo.dLat
    for (let i = 0; i < campo.ancho; i++) {
      const k = j * campo.ancho + i
      // Lo que ya es inalcanzable no hace falta mirarlo: ahorra la mayor parte
      // del trabajo, porque la mancha ocupa una fracción de la caja.
      if (!Number.isFinite(campo.minutos[k])) continue
      const lon = campo.lon0 + i * campo.dLon
      let dentro = false
      for (let p = 0; p < piezas.length && !dentro; p++) {
        const [oeste, sur, este, norte] = cajas[p]
        if (lon < oeste || lon > este || lat < sur || lat > norte) continue
        if (enPoligono(lon, lat, piezas[p])) dentro = true
      }
      if (!dentro) campo.minutos[k] = Infinity
    }
  }
}

/** Minutos de caminata en un punto cualquiera, leídos del campo. */
export function minutosDelCampo(campo: Campo, lon: number, lat: number): number {
  const i = Math.round((lon - campo.lon0) / campo.dLon)
  const j = Math.round((lat - campo.lat0) / campo.dLat)
  if (i < 0 || j < 0 || i >= campo.ancho || j >= campo.alto) return Infinity
  return campo.minutos[j * campo.ancho + i]
}

/**
 * Las calles alcanzables que quedan dentro del recorte.
 *
 * Sin esto, la columna de kilómetros seguiría contando toda la red del urbano
 * mientras las hectáreas y los habitantes ya hablan solo de la plataforma: tres
 * columnas de la misma fila midiendo territorios distintos. Se decide con el
 * propio campo ya recortado —si el centro del tramo cae en celda alcanzable,
 * el tramo está dentro— y no con otra prueba contra el polígono, para que la
 * línea dibujada no pueda salirse de la mancha que la contiene.
 */
export function recortarCalles(
  red: Red,
  iso: Isocrona,
  campo: Campo,
): { alcanzables: { arista: number; minutos: number }[]; metrosPorTramo: Map<number, number> } {
  const alcanzables: { arista: number; minutos: number }[] = []
  const metrosPorTramo = new Map<number, number>()
  for (const tramo of iso.alcanzables) {
    const largo = red.aristas[tramo.arista][2]
    const trazado = red.trazados[tramo.arista]
    const medio = trazado[Math.floor(trazado.length / 2)]
    if (!medio || !Number.isFinite(minutosDelCampo(campo, medio[0], medio[1]))) continue
    alcanzables.push(tramo)
    const corte = MINUTOS.find((m) => tramo.minutos <= m) ?? tramo.minutos
    metrosPorTramo.set(corte, (metrosPorTramo.get(corte) ?? 0) + largo)
  }
  return { alcanzables, metrosPorTramo }
}

/**
 * Contornos de las bandas de tiempo, en lon/lat.
 *
 * Salen de la más lejana a la más cercana, que es el orden en que hay que
 * dibujarlas: la de 5 minutos va encima de la de 15, no debajo.
 */
export function bandasDe(campo: Campo, tramos: number[]): Banda[] {
  const orden = [...tramos].sort((a, b) => b - a)

  /*
   * d3 saca el contorno de «valor mayor o igual que el umbral», así que se le
   * pasa el tiempo en negativo: «−t ≥ −5» es «se llega en 5 minutos o menos».
   *
   * Lo inalcanzable necesita un número y no Infinity, porque d3 interpola
   * entre las dos celdas para decidir en qué punto exacto cruza el contorno.
   * El número no puede ser cualquiera: con uno enorme el corte se pega al
   * centro de la última celda alcanzable y el contorno encierra menos suelo
   * del que cuentan las hectáreas. Con un minuto más del máximo pedido, el
   * corte cae hacia el borde de la celda, que es donde de verdad termina.
   */
  const SIN_ALCANCE = -(orden[0] + 1)
  const valores = new Float64Array(campo.minutos.length)
  for (let k = 0; k < valores.length; k++) {
    valores[k] = Number.isFinite(campo.minutos[k]) ? -campo.minutos[k] : SIN_ALCANCE
  }

  // La superficie se cuenta en celdas, no midiendo el polígono: el contorno es
  // una simplificación del campo y el campo es el dato.
  const superficie = new Map<number, number>(orden.map((t) => [t, 0]))
  for (let k = 0; k < campo.minutos.length; k++) {
    const m = campo.minutos[k]
    if (!Number.isFinite(m)) continue
    for (const t of orden) {
      if (m <= t) superficie.set(t, (superficie.get(t) ?? 0) + campo.celdaHa)
    }
  }

  const generar = contours()
    .size([campo.ancho, campo.alto])
    .thresholds(orden.map((t) => -t))
  const salida = generar(valores as unknown as number[])

  // El vértice del contorno cae en la esquina de la celda y no en su centro:
  // de ahí el medio paso que se resta al pasar a coordenadas.
  const aLon = (gx: number) => campo.lon0 + (gx - 0.5) * campo.dLon
  const aLat = (gy: number) => campo.lat0 + (gy - 0.5) * campo.dLat

  return salida.map((c, i) => ({
    minutos: orden[i],
    hectareas: superficie.get(orden[i]) ?? 0,
    piezas: c.coordinates.map((pieza) =>
      pieza.map((anillo) => anillo.map(([gx, gy]) => [aLon(gx), aLat(gy)] as [number, number])),
    ),
  }))
}
