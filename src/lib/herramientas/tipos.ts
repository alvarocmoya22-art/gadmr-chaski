/**
 * El contrato de una herramienta y lo que todas comparten.
 *
 * La estructura es la de GOAT, que reparte su caja en cuatro grupos:
 * accesibilidad, geoproceso, geoanálisis y datos. No es una clasificación
 * caprichosa, responde a para qué se abre la caja: medir a qué distancia queda
 * algo, cortar y combinar geometrías, resumir información sobre zonas, o
 * juntar tablas. Quien busca una herramienta sabe en qué grupo mirar.
 *
 * Dos reglas gobiernan todas:
 *
 * 1. **Cada herramienta declara qué geometría acepta**, y el panel solo ofrece
 *    las que tienen sentido para la capa elegida.
 * 2. **El resultado es una capa**, igual que una cargada de un archivo: se
 *    exporta, se vuelve a analizar y entra en la siguiente herramienta.
 */
import { capaDerivada, type Capa, type Fila, type Forma } from '../cargar'
import { CATEGORIA, puntosDe, type PuntoAnalisis } from '../ambito'
import { TODA_LA_CATEGORIA } from '../hotspot'
import { RAMPA_GRADUADA, cortesCuantil, type Tema } from '../medidas'

export type ClaveCategoria = 'accesibilidad' | 'geoproceso' | 'geoanalisis' | 'datos'

export const CATEGORIAS: {
  clave: ClaveCategoria
  nombre: string
  nota: string
}[] = [
  {
    clave: 'accesibilidad',
    nombre: 'Accesibilidad',
    nota: 'A qué distancia queda lo que la gente necesita.',
  },
  {
    clave: 'geoproceso',
    nombre: 'Geoproceso',
    nota: 'Cortar, combinar y transformar geometrías.',
  },
  {
    clave: 'geoanalisis',
    nombre: 'Geoanálisis',
    nota: 'Resumir información sobre zonas y encontrar patrones.',
  },
  {
    clave: 'datos',
    nombre: 'Datos',
    nota: 'Juntar capas y traer campos de una a otra.',
  },
]

/** Un control del panel. La herramienta los declara y el panel los dibuja. */
export type Parametro =
  | {
      tipo: 'campo'
      clave: string
      rotulo: string
      nota?: string
      opcional?: boolean
      vacio?: string
      /** Solo campos con números dentro. */
      numerico?: boolean
      /** De qué capa salen los campos; por omisión, la de entrada. */
      deCapa?: string
    }
  | {
      tipo: 'valor'
      clave: string
      rotulo: string
      /** La clave del parámetro de tipo campo del que saca los valores. */
      dependeDe: string
    }
  | {
      tipo: 'capa'
      clave: string
      rotulo: string
      formas: Forma[]
      nota?: string
      opcional?: boolean
      vacio?: string
    }
  | {
      tipo: 'opcion'
      clave: string
      rotulo: string
      opciones: { valor: string; rotulo: string; nota?: string }[]
      /** Cuál viene elegida; por omisión, la primera. */
      defecto?: string
      nota?: string
    }
  | {
      tipo: 'numero'
      clave: string
      rotulo: string
      defecto: number
      min?: number
      max?: number
      paso?: number
      unidad?: string
      nota?: string
    }

export interface Contexto {
  capa: Capa
  /** Lo elegido en cada parámetro; cadena vacía quiere decir «sin elegir». */
  valores: Record<string, string>
  /** Todas las capas, para resolver los parámetros que piden una. */
  capas: Capa[]
}

export interface Resultado {
  capa: Capa
  /** Los registros que entraron al cálculo, para dibujarlos encima. */
  puntos?: PuntoAnalisis[]
  /** El ámbito que se usó, para dibujar su contorno. */
  ambito?: GeoJSON.FeatureCollection
  aviso?: string
}

export interface Herramienta {
  clave: string
  categoria: ClaveCategoria
  nombre: string
  /** Qué hace y para qué sirve; se lee en el panel antes de elegirla. */
  nota: string
  acepta: Forma[]
  /** Aviso cuando la capa entra con un punto representante. */
  avisoRepresentante?: boolean
  parametros: Parametro[]
  correr: (ctx: Contexto) => Resultado | { error: string }
}

/* ── Lo que casi todas necesitan ─────────────────────────────────────────── */

/** Los valores que toma un campo, con cuántos registros tiene cada uno. */
export function valoresDe(capa: Capa, campo: string): { valor: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const f of capa.geo.features) {
    const v = (f.properties ?? {})[campo]
    if (v === null || v === undefined || v === '') continue
    const k = String(v)
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, 'es'))
}

/** El filtro por campo y valor, que comparten casi todas las herramientas. */
export const FILTRO: Parametro[] = [
  {
    tipo: 'campo',
    clave: 'campo',
    rotulo: 'Separar por',
    opcional: true,
    vacio: 'Toda la capa, sin separar',
    nota: 'Solo se ofrecen los campos con entre dos y doscientos valores: con uno no separan nada y con cientos cada grupo se queda sin registros.',
  },
  { tipo: 'valor', clave: 'valor', rotulo: 'Valor', dependeDe: 'campo' },
]

/** Los rasgos que pasan el filtro de campo y valor. */
export function rasgosFiltrados(ctx: Contexto): GeoJSON.Feature[] {
  const campo = ctx.valores.campo
  const valor = ctx.valores.valor || TODA_LA_CATEGORIA
  return ctx.capa.geo.features.filter((f) => {
    if (!f.geometry) return false
    if (!campo || valor === TODA_LA_CATEGORIA) return true
    return String((f.properties ?? {})[campo] ?? '—') === valor
  })
}

/** Los registros que pasan el filtro, como puntos representantes. */
export function registrosDe(ctx: Contexto): PuntoAnalisis[] {
  const campo = ctx.valores.campo || null
  const valor = ctx.valores.valor || TODA_LA_CATEGORIA
  const todos = puntosDe(ctx.capa, campo)
  return valor === TODA_LA_CATEGORIA ? todos : todos.filter((p) => p.clase === valor)
}

export { CATEGORIA }

/** Resuelve un parámetro que pide una capa. */
export const capaDe = (ctx: Contexto, clave: string): Capa | null =>
  ctx.capas.find((c) => c.id === ctx.valores[clave]) ?? null

/** Lee un parámetro numérico, con su valor por omisión. */
export function numeroDe(ctx: Contexto, clave: string, defecto: number): number {
  const n = Number.parseFloat(ctx.valores[clave] ?? '')
  return Number.isFinite(n) ? n : defecto
}

/** Cómo se llama el resultado, diciendo de dónde salió. */
export function tituloDe(ctx: Contexto, herramienta: string): { nombre: string; origen: string } {
  const valor = ctx.valores.valor && ctx.valores.valor !== TODA_LA_CATEGORIA ? ctx.valores.valor : ''
  return {
    nombre: valor ? `${herramienta} · ${valor}` : `${herramienta} · ${ctx.capa.nombre}`,
    origen: `${herramienta} sobre ${ctx.capa.nombre}${valor ? ` (${ctx.valores.campo} = ${valor})` : ''}`,
  }
}

/**
 * Añade los campos calculados sin perder los que ya traía la capa.
 *
 * Una capa de barrios suele traer ya su propio `area_ha`, calculado quién sabe
 * cuándo y con qué proyección. El valor que mide CHASKI manda —es el que
 * explica la densidad que aparece al lado— pero el de origen no se tira: se
 * guarda con el sufijo `_origen`, porque cuando las dos cifras no cuadran, eso
 * es justo lo que hay que poder mirar.
 */
export function conCalculados(
  props: Record<string, unknown>,
  calculados: Record<string, unknown>,
): Record<string, unknown> {
  const salida: Record<string, unknown> = { ...props }
  for (const [clave, valor] of Object.entries(calculados)) {
    if (clave in salida && salida[clave] !== valor) salida[`${clave}_origen`] = salida[clave]
    salida[clave] = valor
  }
  return salida
}

/**
 * Un tema de escala a partir de los valores que de verdad salieron.
 *
 * Si todos los valores son prácticamente el mismo, no se parte en tramos: una
 * leyenda que dice «hasta 100 %» y «más de 100 %» sobre valores que van de
 * 99,98 a 100,01 no informa de nada y hace pensar que hay una diferencia donde
 * no la hay. En ese caso se pinta de un color y se dice entre qué valores está.
 */
export function temaEscala(
  valores: number[],
  campo: string,
  unidad: string,
  notaVacio: string,
): Tema {
  const conDato = valores.filter((v) => Number.isFinite(v) && v > 0)
  const cortes = cortesCuantil(valores)
  if (conDato.length > 0) {
    const bajo = Math.min(...conDato)
    const alto = Math.max(...conDato)
    if (alto - bajo <= Math.abs(alto) * 0.01) {
      const cifra = (n: number) =>
        n.toLocaleString('es-EC', { maximumFractionDigits: alto >= 100 ? 0 : 2 })
      return {
        campo,
        unidad,
        cortes: [],
        colores: [RAMPA_GRADUADA[RAMPA_GRADUADA.length - 2]],
        notaVacio: `Todas están entre ${cifra(bajo)} y ${cifra(alto)} ${unidad}: no hay diferencias que graduar. ${notaVacio}`,
      }
    }
  }
  return {
    campo,
    unidad,
    cortes,
    colores: RAMPA_GRADUADA.slice(0, cortes.length + 1),
    notaVacio,
  }
}

/** Arma la capa de salida. */
export { capaDerivada }
export type { Capa, Fila, Forma, PuntoAnalisis }
