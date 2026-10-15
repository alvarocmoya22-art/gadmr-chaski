/**
 * El panel de análisis, que no sabe nada de ningún análisis en concreto.
 *
 * Lee el catálogo: ofrece las herramientas que aceptan la forma de la capa
 * elegida, agrupadas en las cuatro categorías, y dibuja los controles que cada
 * una declara. Añadir una herramienta no obliga a tocar este archivo.
 */
import { useState } from 'react'
import type { Capa } from '../lib/cargar'
import {
  CATEGORIAS,
  herramientasPara,
  valoresDe,
  type Herramienta,
  type Parametro,
} from '../lib/herramientas'
import { TODA_LA_CATEGORIA } from '../lib/hotspot'
import { aNumero } from '../lib/estadistica'
import { numero } from '../lib/format'

const FORMA: Record<Capa['forma'], string> = {
  punto: 'puntos',
  linea: 'líneas',
  poligono: 'polígonos',
  mixta: 'formas mezcladas',
}

interface Props {
  capas: Capa[]
  capa: Capa | null
  onCapa: (id: string) => void
  herramienta: Herramienta | null
  onHerramienta: (clave: string) => void
  valores: Record<string, string>
  onValores: (v: Record<string, string>) => void
  calculando: boolean
  onCorrer: () => void
  error: string | null
}

const selectClase =
  'mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]'

/** Si un campo trae números en la mayoría de sus registros. */
function esNumerico(capa: Capa, campo: string): boolean {
  let vistos = 0
  let numeros = 0
  for (const f of capa.geo.features.slice(0, 200)) {
    const v = (f.properties ?? {})[campo]
    if (v === null || v === undefined || v === '') continue
    vistos++
    if (aNumero(v) !== null) numeros++
  }
  return vistos > 0 && numeros / vistos > 0.8
}

export default function PanelAnalisis({
  capas,
  capa,
  onCapa,
  herramienta,
  onHerramienta,
  valores,
  onValores,
  calculando,
  onCorrer,
  error,
}: Props) {
  /*
   * Varias categorías pueden estar abiertas a la vez.
   *
   * Con una sola, abrir Geoproceso cerraba Geoanálisis, y comparar dos
   * herramientas de grupos distintos obligaba a ir y volver. La lista es corta
   * y cabe entera.
   */
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  if (capas.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
        Carga una capa y aquí aparecen las herramientas que se le pueden aplicar.
      </p>
    )
  }

  const disponibles = herramientasPara(capa)
  const poner = (clave: string, valor: string) => onValores({ ...valores, [clave]: valor })

  /** Un control, según lo que la herramienta haya declarado. */
  const control = (p: Parametro) => {
    if (p.tipo === 'campo') {
      const fuente = p.deCapa ? (capas.find((c) => c.id === valores[p.deCapa!]) ?? null) : capa
      if (!fuente) return null
      let campos = fuente.campos
      if (p.fecha) {
        // Solo las que de verdad traen fechas, detectadas al cargar la capa.
        const conFecha = new Set((fuente.fechas ?? []).map((f) => f.campo))
        campos = campos.filter((f) => conFecha.has(f.nombre))
      } else if (p.numerico) campos = campos.filter((f) => esNumerico(fuente, f.nombre))
      else campos = campos.filter((f) => f.distintos > 1 && f.distintos <= 200)
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">{p.rotulo}</span>
          <select
            value={valores[p.clave] ?? ''}
            onChange={(e) =>
              onValores(
                p.clave === 'campo'
                  ? { ...valores, campo: e.target.value, valor: TODA_LA_CATEGORIA }
                  : { ...valores, [p.clave]: e.target.value },
              )
            }
            className={selectClase}
          >
            <option value="">{p.opcional ? (p.vacio ?? 'Sin elegir') : 'Elige un campo…'}</option>
            {campos.map((f) => (
              <option key={f.nombre} value={f.nombre}>
                {f.nombre} ({numero(f.distintos)})
              </option>
            ))}
          </select>
          {campos.length === 0 && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
              {p.fecha
                ? 'Esta capa no trae ninguna columna con fechas.'
                : p.numerico
                  ? 'Esta capa no trae ningún campo con números.'
                  : 'Esta capa no trae campos que sirvan para separar.'}
            </span>
          )}
          {p.nota && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              {p.nota}
            </span>
          )}
        </label>
      )
    }

    if (p.tipo === 'valor') {
      const campo = valores[p.dependeDe]
      if (!capa || !campo) return null
      const opciones = valoresDe(capa, campo)
      const total = opciones.reduce((s, o) => s + o.n, 0)
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">{p.rotulo}</span>
          <select
            value={valores[p.clave] ?? TODA_LA_CATEGORIA}
            onChange={(e) => poner(p.clave, e.target.value)}
            className={selectClase}
          >
            <option value={TODA_LA_CATEGORIA}>Todos juntos ({numero(total)})</option>
            {opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.valor} ({numero(o.n)})
              </option>
            ))}
          </select>
        </label>
      )
    }

    if (p.tipo === 'capa') {
      const candidatas = capas.filter((c) => c.id !== capa?.id && p.formas.includes(c.forma))
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">{p.rotulo}</span>
          <select
            value={valores[p.clave] ?? ''}
            onChange={(e) => poner(p.clave, e.target.value)}
            className={selectClase}
          >
            <option value="">{p.vacio ?? 'Elige una capa…'}</option>
            {candidatas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {candidatas.length === 0 && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
              No hay otra capa cargada que sirva aquí. Hace falta una de{' '}
              {p.formas.map((f) => FORMA[f]).join(' o ')}.
            </span>
          )}
          {p.nota && !valores[p.clave] && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              {p.nota}
            </span>
          )}
        </label>
      )
    }

    if (p.tipo === 'numero') {
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            {p.rotulo}
            {p.unidad ? ` (${p.unidad})` : ''}
          </span>
          <input
            type="number"
            value={valores[p.clave] ?? String(p.defecto)}
            min={p.min}
            max={p.max}
            step={p.paso ?? 1}
            onChange={(e) => poner(p.clave, e.target.value)}
            className={selectClase}
          />
          {p.nota && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              {p.nota}
            </span>
          )}
        </label>
      )
    }

    return (
      <div key={p.clave}>
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">{p.rotulo}</span>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {p.opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              title={o.nota}
              onClick={() => poner(p.clave, o.valor)}
              className={`flex-1 rounded border px-2 py-1 text-xs ${
                (valores[p.clave] || p.defecto || p.opciones[0].valor) === o.valor
                  ? 'border-[var(--gr-azul-500)] bg-[var(--gr-azul-500)] font-semibold text-white'
                  : 'border-[var(--gr-linea)] text-[var(--gr-tinta-2)] hover:bg-[var(--gr-azul-100)]'
              }`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        {p.nota && (
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            {p.nota}
          </span>
        )}
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">Capa de entrada</span>
        <select value={capa?.id ?? ''} onChange={(e) => onCapa(e.target.value)} className={selectClase}>
          <option value="">Elige una capa…</option>
          {capas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({FORMA[c.forma]})
            </option>
          ))}
        </select>
      </label>

      {capa && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--gr-tinta-3)]">
            {disponibles.length === 0
              ? 'Todavía no hay ninguna herramienta para esta forma.'
              : `${numero(disponibles.length)} herramientas para ${FORMA[capa.forma]}.`}
          </p>
          {CATEGORIAS.map((cat) => {
            const dentro = disponibles.filter((h) => h.categoria === cat.clave)
            if (dentro.length === 0) return null
            const desplegada =
              abiertas.has(cat.clave) || dentro.some((h) => h.clave === herramienta?.clave)
            return (
              <div key={cat.clave} className="rounded-md border border-[var(--gr-linea)]">
                <button
                  type="button"
                  onClick={() =>
                    setAbiertas((previas) => {
                      const siguiente = new Set(previas)
                      if (siguiente.has(cat.clave)) siguiente.delete(cat.clave)
                      else siguiente.add(cat.clave)
                      return siguiente
                    })
                  }
                  className="flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left"
                >
                  <span className="text-sm font-semibold text-[var(--gr-tinta)]">{cat.nombre}</span>
                  <span className="text-[11px] text-[var(--gr-tinta-3)]">
                    {numero(dentro.length)} {desplegada ? '▾' : '▸'}
                  </span>
                </button>
                {desplegada && (
                  <div className="space-y-1 border-t border-[var(--gr-linea)] p-1.5">
                    <p className="px-0.5 text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                      {cat.nota}
                    </p>
                    {dentro.map((h) => (
                      <button
                        key={h.clave}
                        type="button"
                        onClick={() => onHerramienta(h.clave)}
                        className={`w-full rounded border p-2 text-left ${
                          herramienta?.clave === h.clave
                            ? 'border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)]'
                            : 'border-transparent bg-[var(--gr-superficie)] hover:border-[var(--gr-linea-fuerte)]'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
                          {h.nombre}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                          {h.nota}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {capa && herramienta && (
        <div className="space-y-3 border-t border-[var(--gr-linea)] pt-3">
          <p className="text-sm font-bold text-[var(--gr-tinta)]">{herramienta.nombre}</p>

          {herramienta.avisoRepresentante && capa.forma !== 'punto' && (
            <p className="rounded border border-[var(--gr-linea)] bg-[var(--gr-azul-100)] p-2 text-[11px] leading-snug text-[var(--gr-tinta-2)]">
              Esta capa no es de puntos: cada registro entra por un punto que lo representa
              —el centro, en los polígonos; el vértice medio, en las líneas—. Para predios o
              tramos de calle es razonable; para piezas grandes conviene mirarlo con reserva.
            </p>
          )}

          {herramienta.parametros.map(control)}

          <button
            type="button"
            onClick={onCorrer}
            disabled={calculando}
            className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {calculando ? 'Calculando…' : `Correr ${herramienta.nombre.toLowerCase()}`}
          </button>

          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            El resultado entra como una capa más: se puede exportar, volver a analizar o usar
            de zona de la siguiente herramienta.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
          {error}
        </p>
      )}
    </section>
  )
}
