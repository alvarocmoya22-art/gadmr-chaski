/**
 * Las capas que vienen de una base de datos publicada.
 *
 * Se escribe la dirección del servicio, se miran sus tablas y se traen las que
 * hagan falta. A partir de ahí son capas como cualquier otra: se analizan, se
 * encadenan y se exportan igual.
 */
import { useState } from 'react'
import type { Coleccion } from '../lib/ogc'
import { numero } from '../lib/format'

interface Props {
  base: string
  onBase: (v: string) => void
  colecciones: Coleccion[]
  conectando: boolean
  trayendo: string | null
  avance: string | null
  error: string | null
  onConectar: () => void
  onTraer: (c: Coleccion) => void
}

export default function PanelBase({
  base,
  onBase,
  colecciones,
  conectando,
  trayendo,
  avance,
  error,
  onConectar,
  onTraer,
}: Props) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)]">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        className="flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="text-sm font-semibold text-[var(--gr-tinta)]">Base institucional</span>
        <span className="text-[11px] text-[var(--gr-tinta-3)]">
          {colecciones.length > 0 ? `${numero(colecciones.length)} tablas ` : ''}
          {abierto ? '▾' : '▸'}
        </span>
      </button>

      {abierto && (
        <div className="space-y-2 border-t border-[var(--gr-linea)] p-2">
          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Dirección de un servicio OGC API Features —por ejemplo{' '}
            <code>pg_featureserv</code> sobre PostGIS—. Se leen las tablas que ese servicio
            publique; la base nunca queda expuesta al navegador.
          </p>

          <div className="flex gap-1">
            <input
              type="url"
              value={base}
              onChange={(e) => onBase(e.target.value)}
              placeholder="http://servidor-gadmr:9000"
              className="min-w-0 flex-1 rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]"
            />
            <button
              type="button"
              onClick={onConectar}
              disabled={conectando || base.trim() === ''}
              className="rounded bg-[var(--gr-azul-500)] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
            >
              {conectando ? 'Mirando…' : 'Ver tablas'}
            </button>
          </div>

          {error && (
            <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
              {error}
            </p>
          )}

          {avance && (
            <p className="text-[11px] leading-snug text-[var(--gr-tinta-2)]">{avance}</p>
          )}

          {colecciones.length > 0 && (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {colecciones.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onTraer(c)}
                    disabled={trayendo !== null}
                    className="w-full rounded border border-transparent p-1.5 text-left hover:border-[var(--gr-linea-fuerte)] disabled:opacity-50"
                  >
                    <span className="block text-xs font-semibold text-[var(--gr-tinta)]">
                      {c.titulo}
                      {trayendo === c.id && (
                        <span className="font-normal text-[var(--gr-azul-500)]"> · trayendo…</span>
                      )}
                    </span>
                    <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                      {c.registros !== null && `${numero(c.registros)} registros · `}
                      {c.descripcion || c.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Solo lectura. Lo que se publique en el servicio es lo que se ve aquí: el nombre
            del propietario del catastro no debe estar entre las tablas publicadas.
          </p>
        </div>
      )}
    </div>
  )
}
