/**
 * Medir sobre la esfera: áreas, longitudes y el reparto por zonas.
 *
 * Todas las capas viven en grados (EPSG:4326), así que no se puede medir con
 * geometría plana: un grado de longitud en Riobamba son 111 km y un grado de
 * latitud también, pero en Quito ya no, y en el Ecuador entero la diferencia
 * se nota. Aquí se mide sobre el elipsoide aproximado como esfera, que para
 * superficies de barrio o de cantón deja un error muy por debajo del que
 * traen los propios datos.
 *
 * La alternativa sería proyectar a UTM 17S y medir en el plano. Da casi lo
 * mismo, obliga a arrastrar la zona por todas partes y se rompe en cuanto
 * alguien cargue una capa de otra provincia.
 */
import { cajaDe, enCaja, enPoligono, poligonosDe, type Anillo, type Caja } from './geo'

/*
 * WGS84. Medir sobre una esfera de radio medio es la salida fácil y aquí no
 * sirve: en Riobamba, a dos grados del ecuador, la esfera se come un 0,45 % en
 * las superficies y un 0,22 % en las longitudes, siempre en la misma
 * dirección. Sobre diez mil hectáreas eso son cuarenta y cinco hectáreas de
 * más, y un error que no se cancela no se puede dejar en una cifra que va a un
 * informe. Las dos funciones de abajo están comprobadas contra pyproj y
 * coinciden hasta la cuarta cifra decimal del porcentaje.
 */
const SEMIEJE_M = 6378137
const APLANAMIENTO = 1 / 298.257223563
const E2 = APLANAMIENTO * (2 - APLANAMIENTO)
const E = Math.sqrt(E2)

const rad = (g: number) => (g * Math.PI) / 180

/**
 * Latitud autálica: la que hay que usar para medir superficie sobre la esfera.
 *
 * Reparte la latitud de modo que a cada trozo de esfera le toque la superficie
 * que de verdad tiene el elipsoide. Con ella, la fórmula esférica de siempre
 * deja de ser una aproximación y pasa a dar el área elipsoidal.
 */
function q(phi: number): number {
  const s = Math.sin(phi)
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)))
}

const QP = q(Math.PI / 2)
/** Radio de la esfera que tiene la misma superficie que el elipsoide. */
const RADIO_AUTALICO = SEMIEJE_M * Math.sqrt(QP / 2)

const senoAutalico = (latGrados: number) => Math.max(-1, Math.min(1, q(rad(latGrados)) / QP))

/**
 * Superficie de un anillo, con signo.
 *
 * El signo dice en qué sentido está dibujado, y eso es justo lo que permite
 * restar los agujeros sin tener que comprobar cuál está dentro de cuál.
 */
function areaAnillo(anillo: Anillo): number {
  const n = anillo.length
  if (n < 4) return 0
  let total = 0
  for (let i = 0; i < n - 1; i++) {
    const [lon1, lat1] = anillo[i]
    const [lon2, lat2] = anillo[i + 1]
    total += rad(lon2 - lon1) * (2 + senoAutalico(lat1) + senoAutalico(lat2))
  }
  return (total * RADIO_AUTALICO * RADIO_AUTALICO) / 2
}

/**
 * Distancia entre dos puntos cercanos, sobre el elipsoide.
 *
 * Se mide con los radios de curvatura del lugar —uno para el norte-sur y otro
 * para el este-oeste— en vez de con un radio único. Para tramos de calle, que
 * es lo que se mide aquí, da lo mismo que la geodésica completa y cuesta una
 * raíz cuadrada.
 *
 * La `distanciaM` de `geo.ts` se queda donde está: viene del visor y la usa la
 * vecindad de Getis-Ord, donde un cuarto de punto porcentual sobre el ancho de
 * la banda no cambia nada. Aquí sí cambia, porque esto va a un informe.
 */
export function distanciaGeo(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const phim = rad((lat1 + lat2) / 2)
  const s = Math.sin(phim)
  const w = 1 - E2 * s * s
  const meridiano = (SEMIEJE_M * (1 - E2)) / Math.pow(w, 1.5)
  const vertical = SEMIEJE_M / Math.sqrt(w)
  const dy = meridiano * rad(lat2 - lat1)
  const dx = vertical * Math.cos(phim) * rad(lon2 - lon1)
  return Math.hypot(dx, dy)
}

/** Metros cuadrados de una geometría; lo que no sea polígono mide cero. */
export function areaM2(g: GeoJSON.Geometry | null | undefined): number {
  if (!g) return 0
  let total = 0
  for (const poligono of poligonosDe(g)) {
    // El primero es el contorno y los demás son huecos: patios interiores,
    // islas de otro uso, una laguna dentro del predio.
    total += Math.abs(areaAnillo(poligono[0] ?? []))
    for (const hueco of poligono.slice(1)) total -= Math.abs(areaAnillo(hueco))
  }
  return Math.max(0, total)
}

export const areaHa = (g: GeoJSON.Geometry | null | undefined) => areaM2(g) / 10000

/** Todas las sartas de puntos de una geometría lineal. */
function sartas(g: GeoJSON.Geometry): Anillo[] {
  if (g.type === 'LineString') return [g.coordinates as Anillo]
  if (g.type === 'MultiLineString') return g.coordinates as Anillo[]
  return []
}

/** Metros de una geometría lineal; lo que no sea línea mide cero. */
export function longitudM(g: GeoJSON.Geometry | null | undefined): number {
  if (!g) return 0
  let total = 0
  for (const sarta of sartas(g)) {
    for (let i = 0; i < sarta.length - 1; i++) {
      total += distanciaGeo(sarta[i][0], sarta[i][1], sarta[i + 1][0], sarta[i + 1][1])
    }
  }
  return total
}

/** Una zona preparada para que preguntarle «¿cae esto dentro?» salga barato. */
export interface Zona {
  indice: number
  poligonos: Anillo[][]
  caja: Caja
  props: Record<string, unknown>
  geo: GeoJSON.Feature
  areaM2: number
}

/**
 * Prepara las zonas de una capa de polígonos.
 *
 * La caja envolvente de cada zona se calcula una sola vez. Con dieciocho
 * plataformas da igual, pero con los barrios o con el catastro la diferencia
 * entre descartar por caja y entrar al polígono es de minutos a segundos.
 */
export function prepararZonas(geo: GeoJSON.FeatureCollection): Zona[] {
  const zonas: Zona[] = []
  geo.features.forEach((f, indice) => {
    if (!f.geometry) return
    const poligonos = poligonosDe(f.geometry)
    if (poligonos.length === 0) return
    zonas.push({
      indice,
      poligonos,
      caja: cajaDe(poligonos.flat()),
      props: (f.properties ?? {}) as Record<string, unknown>,
      geo: f,
      areaM2: areaM2(f.geometry),
    })
  })
  return zonas
}

/** La zona que contiene el punto, o null si cae fuera de todas. */
export function zonaDe(zonas: Zona[], lon: number, lat: number): Zona | null {
  for (const z of zonas) {
    if (!enCaja(lon, lat, z.caja)) continue
    if (z.poligonos.some((p) => enPoligono(lon, lat, p))) return z
  }
  return null
}

/**
 * Paso con el que se trocea una línea para repartirla entre zonas.
 *
 * Cada trocito se asigna entero a la zona donde cae su punto medio, así que el
 * error vive solo en los trocitos que cruzan un límite y no pasa de la mitad
 * del paso por cruce. Con veinticinco metros, una vía que atraviesa cinco
 * barrios se reparte con un error de decenas de metros sobre kilómetros: por
 * debajo de lo que vale la pena discutir, y sin traer una biblioteca de
 * recorte topológico para esto.
 */
export const PASO_TROCEO_M = 25

/** Reparte los metros de una geometría lineal entre las zonas. */
export function longitudPorZona(
  g: GeoJSON.Geometry,
  zonas: Zona[],
): { porZona: Map<number, number>; fuera: number } {
  const porZona = new Map<number, number>()
  let fuera = 0
  for (const sarta of sartas(g)) {
    for (let i = 0; i < sarta.length - 1; i++) {
      const [x1, y1] = sarta[i]
      const [x2, y2] = sarta[i + 1]
      const largo = distanciaGeo(x1, y1, x2, y2)
      if (largo === 0) continue
      const trozos = Math.max(1, Math.ceil(largo / PASO_TROCEO_M))
      const cacho = largo / trozos
      for (let t = 0; t < trozos; t++) {
        // Punto medio del trocito: interpolación lineal en grados, que a esta
        // escala no se distingue de la geodésica.
        const f = (t + 0.5) / trozos
        const z = zonaDe(zonas, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f)
        if (!z) {
          fuera += cacho
          continue
        }
        porZona.set(z.indice, (porZona.get(z.indice) ?? 0) + cacho)
      }
    }
  }
  return { porZona, fuera }
}

/** Rampa para los valores graduados: claro donde hay poco, oscuro donde mucho. */
export const RAMPA_GRADUADA = ['#dce7f1', '#a9c6de', '#6f9ec6', '#3f76ad', '#1b4f82']

/**
 * Cómo se pinta una capa de resultado por uno de sus campos.
 *
 * Dos modos, porque hay dos clases de resultado. Un conteo o unos kilómetros
 * son una escala —poco a mucho— y se parten en tramos. Un grado de Getis-Ord
 * no lo es: va de frío a caliente pasando por el cero, y cada grado tiene su
 * color y su significado, así que se pinta por coincidencia.
 */
export interface Tema {
  campo: string
  /** Para la leyenda: qué mide el campo. */
  unidad: string
  /** Modo escala: hay un color más que cortes. */
  cortes?: number[]
  colores?: string[]
  /** Modo coincidencia: un color por valor exacto. */
  coincidencias?: { valor: number; color: string; rotulo: string }[]
  /** Qué quiere decir que una pieza se quede sin color. */
  notaVacio?: string
}

/**
 * Cortes por cuantiles sobre los valores con dato.
 *
 * Los ceros quedan fuera del reparto a propósito. En un conteo por zona, la
 * mitad de las zonas puede estar vacía, y si los ceros entran en los cuantiles
 * se llevan dos clases enteras y todo lo que tiene algo se pinta igual. El
 * cero se dibuja con el color más claro y se dice en la leyenda.
 */
export function cortesCuantil(valores: number[], clases = 5): number[] {
  const conDato = valores.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (conDato.length === 0) return []
  const cortes: number[] = []
  for (let i = 1; i < clases; i++) {
    const pos = (conDato.length - 1) * (i / clases)
    const bajo = Math.floor(pos)
    const alto = Math.ceil(pos)
    const v = conDato[bajo] + (conDato[alto] - conDato[bajo]) * (pos - bajo)
    // Cortes repetidos no separan nada: con pocos valores distintos salen
    // menos clases, y eso es lo honesto en vez de fingir cinco.
    if (cortes.length === 0 || v > cortes[cortes.length - 1]) cortes.push(v)
  }
  return cortes
}

/**
 * Una cifra de leyenda con los decimales que hagan falta y ni uno más.
 *
 * Vive aquí y no en el panel porque la usan dos: el panel para escribir los
 * tramos y `temaEscala` para decidir si esos tramos se distinguen entre sí. Si
 * cada uno redondeara a su manera, la leyenda podría acabar diciendo dos veces
 * el mismo número sin que nadie lo hubiera previsto.
 */
export function cifraLeyenda(n: number): string {
  const magnitud = Math.abs(n)
  const decimales = magnitud >= 100 ? 0 : magnitud >= 10 ? 1 : magnitud >= 1 ? 2 : 3
  return n.toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
}
