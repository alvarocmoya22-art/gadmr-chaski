/** Formato es-EC: punto de miles, coma decimal. */

const nf0 = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const fechaCorta = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export const numero = (n: number) => nf0.format(n)
export const porcentaje = (n: number) => `${nf1.format(n)} %`

/** Coordenada con signo menos tipográfico y 6 decimales. */
export const coordenada = (n: number) =>
  n.toFixed(6).replace('-', '\u2212').replace('.', ',')

export const fecha = (iso: string | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : fechaCorta.format(d)
}

/** Meses transcurridos desde una fecha ISO; null si no es interpretable. */
export function mesesDesde(iso: string | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const ahora = new Date()
  return (
    (ahora.getFullYear() - d.getFullYear()) * 12 +
    (ahora.getMonth() - d.getMonth())
  )
}
