/**
 * El panel de Mirar: elegir una zona y ver qué hay dentro.
 *
 * Aquí no hay ni una herramienta, y es a propósito. Quien entra a mirar su
 * ciudad no debería tropezarse con una caja de dieciséis utilidades ni con la
 * palabra «Getis-Ord». Si quiere analizar, cambia de modo arriba.
 */
import type { Fila } from '../lib/cargar'
import type { Ambito } from '../lib/mirar'
import { numero } from '../lib/format'

interface Props {
  listo: boolean
  cargando: boolean
  onTraerCapas: () => void
  ambitos: Ambito[]
  elegido: string
  onElegir: (clave: string) => void
  cifras: Fila[]
  tipos: Fila[]
  fuentePoblacion: string | null
}

export default function PanelMirar({
  listo,
  cargando,
  onTraerCapas,
  ambitos,
  elegido,
  onElegir,
  cifras,
  tipos,
  fuentePoblacion,
}: Props) {
  if (!listo) {
    return (
      <section className="space-y-2">
        <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
          Para mirar el territorio hacen falta las plataformas, los barrios y los
          equipamientos. Se traen del visor y se quedan en tu navegador.
        </p>
        <button
          type="button"
          onClick={onTraerCapas}
          disabled={cargando}
          className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {cargando ? 'Trayendo…' : 'Traer el territorio'}
        </button>
      </section>
    )
  }

  const plataformas = ambitos.filter((a) => a.nivel === 'plataforma')
  const barrios = ambitos.filter((a) => a.nivel === 'barrio')

  return (
    <section className="space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">Qué miramos</span>
        <select
          value={elegido}
          onChange={(e) => onElegir(e.target.value)}
          className="mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]"
        >
          {ambitos
            .filter((a) => a.nivel === 'urbano')
            .map((a) => (
              <option key={a.clave} value={a.clave}>
                {a.titulo}
              </option>
            ))}
          {plataformas.length > 0 && (
            <optgroup label="Plataformas">
              {plataformas.map((a) => (
                <option key={a.clave} value={a.clave}>
                  {a.titulo}
                </option>
              ))}
            </optgroup>
          )}
          {barrios.length > 0 && (
            <optgroup label={`Barrios (${numero(barrios.length)})`}>
              {barrios.map((a) => (
                <option key={a.clave} value={a.clave}>
                  {a.titulo}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {cifras.length > 0 && (
        <div className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-2">
          <table className="w-full text-xs">
            <tbody>
              {cifras.map((f) => (
                <tr key={f.etiqueta}>
                  <th className="py-0.5 pr-2 text-left font-normal text-[var(--gr-tinta-3)]">
                    {f.etiqueta}
                  </th>
                  <td className="py-0.5 text-right font-semibold text-[var(--gr-tinta)]">
                    {f.valor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tipos.length > 0 && (
        <div className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-2">
          <p className="mb-1 text-xs font-bold text-[var(--gr-tinta)]">
            Qué equipamientos hay
          </p>
          <table className="w-full text-xs">
            <tbody>
              {tipos.map((f) => (
                <tr key={f.etiqueta}>
                  <th className="py-0.5 pr-2 text-left font-normal text-[var(--gr-tinta-3)]">
                    {f.etiqueta}
                  </th>
                  <td className="py-0.5 text-right font-semibold text-[var(--gr-tinta)]">
                    {f.valor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
        {fuentePoblacion
          ? `Población: ${fuentePoblacion}`
          : 'Sin el agregado de población: solo se muestran superficie y equipamientos.'}{' '}
        Las superficies se miden sobre el elipsoide WGS84, no son las declaradas en los
        shapefiles.
      </p>

      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
        ¿Quieres cruzar esto con datos tuyos? Pásate a <strong>Analizar</strong>, ahí
        arriba. Las capas que ya están cargadas te siguen.
      </p>
    </section>
  )
}
