/**
 * El modo Mirar: el territorio de casa, sin herramientas a la vista.
 *
 * Quien entra a mirar no quiere una caja de dieciséis herramientas: quiere
 * ver su ciudad, elegir una plataforma o un barrio y saber qué hay dentro.
 * Esa es la diferencia entre los dos primeros modos, y es la razón de que la
 * aplicación unida tenga tres puertas en vez de una pantalla con todo.
 *
 * Las cifras salen de las mismas capas que publica el visor, más el agregado
 * de población del Censo 2022 que también publica. Aquí no se recalcula nada
 * que el visor ya haya calculado: se lee lo suyo y se mide lo que haga falta.
 */
import { cajaDe, enPoligono, poligonosDe, type Anillo, type Caja } from './geo'
import { areaM2 } from './medidas'
import { ORIGEN_VISOR } from './municipio'
import { numero } from './format'
import type { Capa, Fila } from './cargar'

/** Lo que trae el agregado de población que publica el visor. */
interface Poblacion {
  fuente: string
  barrios: Record<string, { nombre: string; pob: number; viv: number }>
  plataformas: Record<string, { pob: number; viv: number }>
}

let cache: Poblacion | null = null

/** El agregado de población, traído una sola vez. */
export async function cargarPoblacion(): Promise<Poblacion | null> {
  if (cache) return cache
  try {
    const resp = await fetch(`${ORIGEN_VISOR}/poblacion.json`)
    if (!resp.ok) return null
    cache = (await resp.json()) as Poblacion
    return cache
  } catch {
    return null
  }
}

/** Una zona que se puede mirar: todo el urbano, una plataforma o un barrio. */
export interface Ambito {
  clave: string
  titulo: string
  /** De qué capa salió, para saber a qué nivel está. */
  nivel: 'urbano' | 'plataforma' | 'barrio'
  piezas: Anillo[][]
  caja: Caja
  pob: number | null
  viv: number | null
}

const piezasDeRasgo = (f: GeoJSON.Feature): Anillo[][] =>
  f.geometry ? poligonosDe(f.geometry) : []

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/**
 * Los ámbitos que se pueden elegir, a partir de las capas cargadas.
 *
 * La población de las plataformas se une por su clave, que es estable. La de
 * los barrios viene indexada por su posición en la capa, que es frágil, así
 * que **solo se usa cuando el nombre también coincide**: si la capa cambió de
 * orden, se prefiere no decir una población a decir la del barrio de al lado.
 */
export function ambitosDe(
  plataformas: Capa | null,
  barrios: Capa | null,
  poblacion: Poblacion | null,
): Ambito[] {
  const salida: Ambito[] = []

  if (plataformas) {
    const todas = plataformas.geo.features.flatMap(piezasDeRasgo)
    if (todas.length > 0) {
      const pob = poblacion
        ? Object.values(poblacion.plataformas).reduce((s, p) => s + p.pob, 0)
        : null
      const viv = poblacion
        ? Object.values(poblacion.plataformas).reduce((s, p) => s + p.viv, 0)
        : null
      salida.push({
        clave: 'urbano',
        titulo: 'Riobamba urbano · las 18 plataformas',
        nivel: 'urbano',
        piezas: todas,
        caja: cajaDe(todas.flat()),
        pob,
        viv,
      })
    }
    plataformas.geo.features.forEach((f) => {
      const piezas = piezasDeRasgo(f)
      if (piezas.length === 0) return
      const clave = texto(f.properties?.clave)
      const dato = poblacion?.plataformas[clave] ?? null
      salida.push({
        clave: `plataforma:${clave}`,
        titulo: `Plataforma ${clave}`,
        nivel: 'plataforma',
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: dato?.pob ?? null,
        viv: dato?.viv ?? null,
      })
    })
  }

  if (barrios) {
    barrios.geo.features.forEach((f, i) => {
      const piezas = piezasDeRasgo(f)
      if (piezas.length === 0) return
      const nombre = texto(f.properties?.nombre) || `Barrio ${i + 1}`
      const dato = poblacion?.barrios[String(i)] ?? null
      // Solo se cree el dato si el nombre cuadra: el índice por sí solo no basta.
      const cuadra = dato && dato.nombre.trim().toUpperCase() === nombre.trim().toUpperCase()
      salida.push({
        clave: `barrio:${i}`,
        titulo: nombre,
        nivel: 'barrio',
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: cuadra ? dato.pob : null,
        viv: cuadra ? dato.viv : null,
      })
    })
  }

  return salida
}

/** Cierto si el punto cae en el ámbito. */
const dentro = (a: Ambito, lon: number, lat: number) =>
  a.piezas.some((p) => enPoligono(lon, lat, p))

/**
 * Las cifras de un ámbito, listas para la franja.
 *
 * «Equipamientos por cada mil habitantes» es la que de verdad se discute en
 * una mesa: el número a secas premia siempre a la plataforma más grande.
 */
export function leerAmbito(
  a: Ambito,
  equipamientos: Capa | null,
  barrios: Capa | null,
): { cifras: Fila[]; tipos: Fila[] } {
  const ha = a.piezas.reduce(
    (s, poly) => s + areaM2({ type: 'Polygon', coordinates: poly as number[][][] }) / 10000,
    0,
  )

  const cifras: Fila[] = [{ etiqueta: 'Superficie', valor: `${numero(Math.round(ha))} ha` }]
  if (a.pob !== null) {
    cifras.push({ etiqueta: 'Habitantes', valor: numero(a.pob) })
    const km2 = ha / 100
    if (km2 > 0) {
      cifras.push({
        etiqueta: 'Densidad',
        valor: `${numero(Math.round(a.pob / km2))} hab/km²`,
      })
    }
  }
  if (a.viv !== null) cifras.push({ etiqueta: 'Viviendas', valor: numero(a.viv) })

  if (barrios && a.nivel !== 'barrio') {
    let cuantos = 0
    for (const f of barrios.geo.features) {
      const piezas = piezasDeRasgo(f)
      const anillo = piezas[0]?.[0]
      if (!anillo?.length) continue
      // El centro del barrio decide a qué ámbito pertenece.
      const n = anillo.length - 1
      let x = 0
      let y = 0
      for (let i = 0; i < n; i++) {
        x += anillo[i][0]
        y += anillo[i][1]
      }
      if (dentro(a, x / n, y / n)) cuantos++
    }
    cifras.push({ etiqueta: 'Barrios', valor: numero(cuantos) })
  }

  const tipos: Fila[] = []
  if (equipamientos) {
    const cuenta = new Map<string, number>()
    let total = 0
    for (const f of equipamientos.geo.features) {
      const g = f.geometry
      if (!g || g.type !== 'Point') continue
      const [lon, lat] = g.coordinates as [number, number]
      if (!dentro(a, lon, lat)) continue
      total++
      const tipo = texto(f.properties?.tipo) || '—'
      cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1)
    }
    cifras.push({ etiqueta: 'Equipamientos', valor: numero(total) })
    if (a.pob !== null && a.pob > 0) {
      cifras.push({
        etiqueta: 'Por cada 1.000 hab',
        valor: ((total / a.pob) * 1000).toFixed(1).replace('.', ','),
      })
    }
    for (const [tipo, n] of [...cuenta.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6)) {
      tipos.push({
        etiqueta: tipo,
        valor: `${numero(n)} · ${((n / Math.max(1, total)) * 100).toFixed(0)} %`,
      })
    }
  }

  return { cifras, tipos }
}

/** Las capas que el modo Mirar necesita tener cargadas. */
export const CAPAS_MIRAR = [
  { archivo: 'plataformas.geojson', nombre: 'Plataformas' },
  { archivo: 'barrios.geojson', nombre: 'Barrios' },
  { archivo: 'equipamientos.geojson', nombre: 'Equipamientos' },
]
