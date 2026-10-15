/**
 * Lee lo que se suelte en la ventana y lo convierte en una capa.
 *
 * Es la pieza que separa a CHASKI del visor. Allí los datos entran por scripts
 * que alguien corre desde su máquina; aquí entran arrastrando un archivo, y a
 * partir de ese momento se pueden analizar. Todo ocurre en el navegador: nada
 * se sube a ningún sitio, que para datos municipales sin publicar es la única
 * respuesta aceptable mientras no haya servidor propio.
 *
 * Tres formatos, que son los que de verdad circulan por una municipalidad:
 *
 *  - **GeoJSON** (`.geojson`, `.json`), el que ya sale de QGIS y del visor.
 *  - **Shapefile en zip**, que es como viaja: `.shp` solo no sirve de nada sin
 *    su `.dbf` y su `.prj` al lado, y por eso se pide el zip entero.
 *  - **CSV con coordenadas**, el caso de la tabla que alguien llenó a mano.
 */
import shp from 'shpjs'
import type { Tema } from './medidas'
import { detectarFechas, type Fechas } from './tiempo'

/** Punto, línea o polígono; una capa que mezcla formas se marca «mixta». */
export type Forma = 'punto' | 'linea' | 'poligono' | 'mixta'

/** Un par para la ficha del resultado. */
export interface Fila {
  etiqueta: string
  valor: string
}

/**
 * Lo que CHASKI entiende por capa, venga de donde venga.
 *
 * Y vienen de dos sitios: de un archivo que alguien suelta, y del resultado de
 * una herramienta. Que las dos cosas sean lo mismo es lo que permite encadenar
 * —el conteo por barrio se puede volver a analizar, exportar o usar de ámbito—
 * y es la decisión de la que cuelga todo lo demás.
 */
export interface Capa {
  id: string
  nombre: string
  /** De qué archivo salió, o de qué herramienta sobre qué capa. */
  origen: string
  geo: GeoJSON.FeatureCollection
  forma: Forma
  /** Los campos de la tabla, con cuántos valores distintos tiene cada uno. */
  campos: { nombre: string; distintos: number; ejemplo: string }[]
  color: string
  visible: boolean
  /** Cierto si la calculó una herramienta en vez de venir de un archivo. */
  derivada?: boolean
  /** Cómo pintarla por un campo numérico, cuando la herramienta lo decide. */
  tema?: Tema
  /** Las cifras del cálculo, para la ficha del panel. */
  resumen?: Fila[]
  /** Cómo se obtuvo, en una frase, para que el resultado no quede huérfano. */
  metodo?: string
  /**
   * De qué catálogo salió, cuando salió de uno.
   *
   * Lo usa la mesa de trabajo: una capa del municipio no hace falta guardarla
   * entera —el catastro son quince megas— porque basta con apuntar cuál era y
   * volver a traerla al recuperar.
   */
  fuente?: { tipo: 'ejemplo' | 'municipio'; archivo: string }
  /**
   * Las columnas que traen fechas, si las hay.
   *
   * Se detectan al cargar y no cuando alguien las pide: de aquí sale que el
   * eje temporal aparezca solo cuando la capa lo permite, que es la regla que
   * gobierna toda la interfaz.
   */
  fechas?: Fechas[]
}

/** La paleta del sistema, para que cada capa nueva entre con un color propio. */
const COLORES = [
  '#2c6fb5',
  '#2f8f5b',
  '#c9752b',
  '#6a4fa3',
  '#1f7a8c',
  '#b8577e',
  '#8c5a3c',
  '#c0453b',
]

let siguiente = 0

/** El color que le toca a la siguiente capa. */
export const colorSiguiente = () => COLORES[siguiente++ % COLORES.length]

/** Un identificador que no choca con los ya repartidos. */
export const idNuevo = () => `c${Date.now()}${siguiente}`

/**
 * Arma una capa a partir de una colección ya calculada.
 *
 * Es por donde salen los resultados de las herramientas: se les describe la
 * tabla igual que a un archivo recién leído, para que a partir de ahí no haya
 * ninguna diferencia entre una cosa y la otra.
 */
export function capaDerivada(
  nombre: string,
  origen: string,
  geo: GeoJSON.FeatureCollection,
  extra: Partial<Pick<Capa, 'tema' | 'resumen' | 'metodo' | 'color'>> = {},
): Capa {
  const campos = camposDe(geo)
  return {
    id: idNuevo(),
    nombre,
    origen,
    geo,
    forma: formaDe(geo),
    campos,
    fechas: detectarFechas(geo.features, campos),
    color: extra.color ?? colorSiguiente(),
    visible: true,
    derivada: true,
    tema: extra.tema,
    resumen: extra.resumen,
    metodo: extra.metodo,
  }
}

/**
 * Nombres de columna que valen como coordenada.
 *
 * En minúsculas y sin tildes. La lista es corta a propósito: adivinar de más
 * acaba interpretando como coordenada una columna que no lo es.
 */
const COLUMNAS_LON = ['lon', 'lng', 'long', 'longitud', 'longitude', 'x', 'coordenada_x', 'coordenadas_x', 'este']
const COLUMNAS_LAT = ['lat', 'latitud', 'latitude', 'y', 'coordenada_y', 'coordenadas_y', 'norte']

/** Riobamba en UTM 17S. Sirve para reconocer una tabla que viene proyectada. */
const CAJA_UTM = { x: [600000, 900000], y: [9700000, 9900000] }

const sinTildes = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

function formaDe(geo: GeoJSON.FeatureCollection): Capa['forma'] {
  const tipos = new Set<string>()
  for (const f of geo.features) {
    const t = f.geometry?.type ?? ''
    if (t.includes('Point')) tipos.add('punto')
    else if (t.includes('LineString')) tipos.add('linea')
    else if (t.includes('Polygon')) tipos.add('poligono')
  }
  if (tipos.size === 1) return [...tipos][0] as Capa['forma']
  return 'mixta'
}

/**
 * Qué trae la tabla.
 *
 * No es adorno: antes de analizar hay que saber qué columnas hay y cuántos
 * valores distintos tiene cada una, porque de ahí sale qué se puede agrupar y
 * qué no. Una columna con un solo valor distinto no sirve para clasificar nada.
 */
function camposDe(geo: GeoJSON.FeatureCollection): Capa['campos'] {
  const valores = new Map<string, Set<string>>()
  for (const f of geo.features.slice(0, 5000)) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (v === null || v === undefined || v === '') continue
      const set = valores.get(k) ?? new Set<string>()
      if (set.size < 1000) set.add(String(v))
      valores.set(k, set)
    }
  }
  return [...valores.entries()]
    .map(([nombre, set]) => ({
      nombre,
      distintos: set.size,
      ejemplo: [...set][0]?.slice(0, 40) ?? '',
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Separa una línea de CSV respetando las comillas. */
function partir(linea: string, sep: string): string[] {
  const salida: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else entreComillas = !entreComillas
    } else if (c === sep && !entreComillas) {
      salida.push(actual)
      actual = ''
    } else actual += c
  }
  salida.push(actual)
  return salida.map((s) => s.trim())
}

/**
 * CSV a puntos.
 *
 * El separador se deduce de la cabecera —en Ecuador el punto y coma es tan
 * corriente como la coma, porque Excel en español lo usa— y las coordenadas se
 * reconocen por el nombre de la columna. Si vienen en UTM, se detecta por la
 * magnitud y se avisa, porque reproyectar sin decirlo sería adivinar.
 */
function deCsv(texto: string, nombre: string): { geo: GeoJSON.FeatureCollection; aviso?: string } {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim())
  if (lineas.length < 2) throw new Error('El archivo no tiene ni cabecera ni datos.')

  const sep = [';', ',', '\t'].reduce((mejor, s) =>
    partir(lineas[0], s).length > partir(lineas[0], mejor).length ? s : mejor,
  )
  const cabecera = partir(lineas[0], sep)
  const norm = cabecera.map(sinTildes)
  const iLon = norm.findIndex((c) => COLUMNAS_LON.includes(c))
  const iLat = norm.findIndex((c) => COLUMNAS_LAT.includes(c))
  if (iLon < 0 || iLat < 0) {
    throw new Error(
      `No encuentro las coordenadas. Hacen falta dos columnas que se llamen algo como «lon» y «lat», o «x» e «y». La tabla trae: ${cabecera.join(', ')}`,
    )
  }

  const rasgos: GeoJSON.Feature[] = []
  let enUtm = 0
  let descartados = 0
  for (const linea of lineas.slice(1)) {
    const celdas = partir(linea, sep)
    let x = Number.parseFloat((celdas[iLon] ?? '').replace(',', '.'))
    let y = Number.parseFloat((celdas[iLat] ?? '').replace(',', '.'))
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      descartados++
      continue
    }
    // Una abscisa en grados nunca pasa de 180: si pasa, la tabla viene en UTM.
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      const esUtm =
        x > CAJA_UTM.x[0] && x < CAJA_UTM.x[1] && y > CAJA_UTM.y[0] && y < CAJA_UTM.y[1]
      const alReves =
        y > CAJA_UTM.x[0] && y < CAJA_UTM.x[1] && x > CAJA_UTM.y[0] && x < CAJA_UTM.y[1]
      if (!esUtm && !alReves) {
        descartados++
        continue
      }
      if (alReves) [x, y] = [y, x]
      enUtm++
      ;[x, y] = utmAGrados(x, y)
    }
    const props: Record<string, string> = {}
    cabecera.forEach((c, i) => {
      if (i !== iLon && i !== iLat) props[c] = celdas[i] ?? ''
    })
    rasgos.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props })
  }

  const avisos: string[] = []
  if (enUtm) avisos.push(`${enUtm} filas venían en UTM 17S y se reproyectaron`)
  if (descartados) avisos.push(`${descartados} filas sin coordenada válida se descartaron`)
  return {
    geo: { type: 'FeatureCollection', features: rasgos },
    aviso: avisos.length ? `${nombre}: ${avisos.join(' · ')}` : undefined,
  }
}

/**
 * UTM 17S a grados, sin dependencias.
 *
 * Es la inversa de la transversa de Mercator para WGS84. Se escribe aquí
 * entera porque traer proj4 por una sola zona serían doscientos kilobytes para
 * veinte líneas de trigonometría.
 */
function utmAGrados(este: number, norte: number): [number, number] {
  const a = 6378137
  const f = 1 / 298.257223563
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const x = este - 500000
  const y = norte - 10000000 // hemisferio sur
  const m = y / k0
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256))
  const p1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
  const ep2 = e2 / (1 - e2)
  const c1 = ep2 * Math.cos(p1) ** 2
  const t1 = Math.tan(p1) ** 2
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2)
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5
  const d = x / (n1 * k0)
  const lat =
    p1 -
    ((n1 * Math.tan(p1)) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720)
  const lon =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
    Math.cos(p1)
  // La 17S tiene su meridiano central en −81°.
  return [-81 + (lon * 180) / Math.PI, (lat * 180) / Math.PI]
}

/** Lee un archivo y devuelve la capa, o explica por qué no pudo. */
export async function leerArchivo(archivo: File): Promise<{ capa: Capa; aviso?: string }> {
  const nombre = archivo.name
  const ext = nombre.slice(nombre.lastIndexOf('.')).toLowerCase()
  let geo: GeoJSON.FeatureCollection
  let aviso: string | undefined

  if (ext === '.zip') {
    const leido = await shp(await archivo.arrayBuffer())
    // Un zip puede traer varias capas; se unen y se avisa.
    const partes = Array.isArray(leido) ? leido : [leido]
    geo = {
      type: 'FeatureCollection',
      features: partes.flatMap((p) => p.features as GeoJSON.Feature[]),
    }
    if (partes.length > 1) aviso = `${nombre}: el zip traía ${partes.length} capas y se unieron en una.`
  } else if (ext === '.csv' || ext === '.txt') {
    const r = deCsv(await archivo.text(), nombre)
    geo = r.geo
    aviso = r.aviso
  } else if (ext === '.geojson' || ext === '.json') {
    const d = JSON.parse(await archivo.text()) as GeoJSON.FeatureCollection | GeoJSON.Feature
    geo = d.type === 'Feature' ? { type: 'FeatureCollection', features: [d] } : d
  } else {
    throw new Error(
      `No sé leer «${ext}». Puedo con GeoJSON, con shapefile en zip y con CSV que traiga columnas de coordenadas.`,
    )
  }

  if (!geo.features?.length) throw new Error(`${nombre} no trae ni un registro.`)

  // Fuera lo que no tenga geometría: una fila sin sitio no se puede analizar.
  const antes = geo.features.length
  geo.features = geo.features.filter((f) => f.geometry)
  const sinGeometria = antes - geo.features.length
  if (sinGeometria > 0) {
    aviso = [aviso, `${sinGeometria} registros sin geometría se descartaron`].filter(Boolean).join(' · ')
  }

  const campos = camposDe(geo)
  return {
    capa: {
      id: idNuevo(),
      nombre: nombre.replace(/\.[^.]+$/, ''),
      origen: nombre,
      geo,
      forma: formaDe(geo),
      campos,
      fechas: detectarFechas(geo.features, campos),
      color: colorSiguiente(),
      visible: true,
    },
    aviso,
  }
}
