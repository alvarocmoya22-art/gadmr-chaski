/**
 * Las cuentas que acompañan a las agregaciones y al agrupamiento.
 *
 * GOAT ofrece el mismo juego en sus herramientas de agregación —cuántos, suma,
 * media, mínimo, máximo y desviación— y la razón es sencilla: «cuántos
 * equipamientos hay en este barrio» y «cuánta superficie suman» son preguntas
 * distintas y las dos se hacen a diario.
 */

/** Las operaciones que se pueden pedir sobre los valores de una zona. */
export const ESTADISTICOS = [
  { clave: 'cuenta', rotulo: 'Cuántos', nota: 'número de registros' },
  { clave: 'suma', rotulo: 'Suma', nota: 'total del campo' },
  { clave: 'media', rotulo: 'Media', nota: 'promedio del campo' },
  { clave: 'minimo', rotulo: 'Mínimo', nota: 'el valor más bajo' },
  { clave: 'maximo', rotulo: 'Máximo', nota: 'el valor más alto' },
  { clave: 'desviacion', rotulo: 'Desviación', nota: 'cuánto se dispersan' },
] as const

export type Estadistico = (typeof ESTADISTICOS)[number]['clave']

/** Si el estadístico necesita un campo numérico o le basta con contar. */
export const necesitaCampo = (e: Estadistico) => e !== 'cuenta'

/**
 * Aplica el estadístico a una lista de valores.
 *
 * Los valores que no son número ya vienen fuera: una celda vacía no es un cero
 * y meterla como cero hundiría la media sin que nadie se entere.
 */
export function resumir(valores: number[], que: Estadistico): number | null {
  if (que === 'cuenta') return valores.length
  if (valores.length === 0) return null
  if (que === 'suma') return valores.reduce((s, v) => s + v, 0)
  if (que === 'minimo') return Math.min(...valores)
  if (que === 'maximo') return Math.max(...valores)
  const media = valores.reduce((s, v) => s + v, 0) / valores.length
  if (que === 'media') return media
  // Desviación de la población, no de la muestra: aquí se tienen todos los
  // registros de la zona, no un muestreo de ellos.
  const varianza = valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length
  return Math.sqrt(varianza)
}

/** El número que trae una propiedad, o null si no hay número que sacar. */
export function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const limpio = v.trim().replace(',', '.')
  if (!limpio) return null
  const n = Number.parseFloat(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * Agrupamiento por k-medias sobre el plano métrico.
 *
 * Reparte los puntos en el número de grupos que se pida, buscando que cada uno
 * quede lo más compacto posible. Sirve para proponer zonas de trabajo, rutas de
 * recolección o sectores de inspección a partir de dónde están las cosas, en
 * vez de heredar una división que nadie recuerda por qué se trazó.
 *
 * El arranque es k-means++ —cada semilla se elige lejos de las ya puestas— y no
 * al azar: con semillas al azar, dos pueden caer en el mismo racimo y el
 * resultado cambia en cada pasada sin que nadie toque nada.
 */
export function kMedias(
  puntos: [number, number][],
  grupos: number,
  vueltas = 60,
): { asignacion: number[]; centros: [number, number][]; vueltasUsadas: number } {
  const k = Math.max(1, Math.min(grupos, puntos.length))
  const centros: [number, number][] = [puntos[0]]
  /*
   * Semilla a semilla, se toma el punto más lejano de lo ya elegido. Es la
   * variante determinista de k-means++: sin azar, dos corridas con los mismos
   * datos dan el mismo mapa, y eso importa cuando el mapa se va a presentar.
   */
  while (centros.length < k) {
    let mejor = puntos[0]
    let mejorDistancia = -1
    for (const p of puntos) {
      let cerca = Infinity
      for (const c of centros) {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2
        if (d < cerca) cerca = d
      }
      if (cerca > mejorDistancia) {
        mejorDistancia = cerca
        mejor = p
      }
    }
    centros.push(mejor)
  }

  const asignacion = new Array<number>(puntos.length).fill(0)
  let vuelta = 0
  for (; vuelta < vueltas; vuelta++) {
    let cambio = false
    puntos.forEach((p, i) => {
      let mejor = 0
      let cerca = Infinity
      centros.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2
        if (d < cerca) {
          cerca = d
          mejor = j
        }
      })
      if (asignacion[i] !== mejor) {
        asignacion[i] = mejor
        cambio = true
      }
    })
    const sumas = centros.map(() => [0, 0, 0])
    puntos.forEach((p, i) => {
      const s = sumas[asignacion[i]]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += 1
    })
    sumas.forEach((s, j) => {
      if (s[2] > 0) centros[j] = [s[0] / s[2], s[1] / s[2]]
    })
    if (!cambio) break
  }
  return { asignacion, centros, vueltasUsadas: vuelta + 1 }
}
