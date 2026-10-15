/**
 * La caja de herramientas, montada.
 *
 * La estructura es la de GOAT —accesibilidad, geoproceso, geoanálisis y
 * datos—, y cada grupo vive en su archivo dentro de `herramientas/`. Este solo
 * los junta y responde a la pregunta que hace el panel: qué se puede correr
 * sobre la capa que hay elegida.
 */
import { ACCESIBILIDAD } from './herramientas/accesibilidad'
import { GEOPROCESO } from './herramientas/geoproceso'
import { GEOANALISIS } from './herramientas/geoanalisis'
import { DATOS } from './herramientas/datos'
import { CATEGORIAS, type Capa, type Herramienta } from './herramientas/tipos'

export const HERRAMIENTAS: Herramienta[] = [
  ...ACCESIBILIDAD,
  ...GEOPROCESO,
  ...GEOANALISIS,
  ...DATOS,
]

/** Las herramientas que tienen sentido para una capa, en orden de categoría. */
export function herramientasPara(capa: Capa | null): Herramienta[] {
  if (!capa) return []
  const orden = new Map(CATEGORIAS.map((c, i) => [c.clave, i]))
  return HERRAMIENTAS.filter((h) => h.acepta.includes(capa.forma)).sort(
    (a, b) => (orden.get(a.categoria) ?? 9) - (orden.get(b.categoria) ?? 9),
  )
}

export { CATEGORIAS }
export { valoresDe } from './herramientas/tipos'
export type {
  ClaveCategoria,
  Contexto,
  Herramienta,
  Parametro,
  Resultado,
} from './herramientas/tipos'
