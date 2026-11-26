/**
 * El informe: una sola pantalla que produce el diagnóstico completo.
 *
 * Las otras dos pestañas responden una pregunta cada vez. Esta responde la
 * pregunta que de verdad llega de las direcciones —«¿cómo está el territorio
 * después de la campaña?»— y para eso corre media docena de análisis seguidos
 * y los deja escritos, con su lectura y listos para imprimir.
 */
import type { Capa } from '../lib/cargar'
import { numero } from '../lib/format'

export interface AjustesInforme {
  registros: string
  zonas: string
  ambito: string
  campo: string
  radio: string
  /**
   * Si se añade el diagnóstico general: reparto por zona, desigualdad, patrón
   * espacial, centro de gravedad, cobertura y puntos calientes.
   *
   * Es una batería fija, la misma sea cual sea el estudio. Vale cuando no hay
   * nada más que contar; estorba cuando el informe tiene que hablar de los
   * análisis que uno acaba de correr. Por eso se elige, y por eso el radio
   * —que solo alimenta la sección de cobertura— cuelga de esta casilla.
   */
  bateria: boolean
}

export const INFORME_INICIAL: AjustesInforme = {
  registros: '',
  zonas: '',
  ambito: '',
  campo: '',
  radio: '500',
  bateria: true,
}

interface Props {
  capas: Capa[]
  ajustes: AjustesInforme
  onAjustes: (a: AjustesInforme) => void
  calculando: boolean
  onCorrer: () => void
  hayInforme: boolean
  /** El informe de abajo ya no corresponde a estos ajustes. */
  desfasado?: boolean
  onLamina: () => void
  error: string | null
}

const selectClase =
  'mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]'

export default function PanelInforme({
  capas,
  ajustes,
  onAjustes,
  calculando,
  onCorrer,
  hayInforme,
  desfasado = false,
  onLamina,
  error,
}: Props) {
  if (capas.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
        Carga la capa de la campaña —o prueba con el ejemplo— y aquí se arma el informe.
      </p>
    )
  }

  const capa = capas.find((c) => c.id === ajustes.registros) ?? null
  const areas = capas.filter((c) => c.forma === 'poligono' || c.forma === 'mixta')
  const poner = (parte: Partial<AjustesInforme>) => onAjustes({ ...ajustes, ...parte })

  return (
    <section className="space-y-3">
      <p className="text-xs leading-snug text-[var(--gr-tinta-3)]">
        Recoge los análisis que están en la mesa: cada capa calculada aporta sus cifras y
        su método, en el orden en que se corrieron. Devuelve el informe escrito y una
        lámina para imprimir.
      </p>

      <label className="block">
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
          Los registros de la campaña
        </span>
        <select
          value={ajustes.registros}
          onChange={(e) => poner({ registros: e.target.value, campo: '' })}
          className={selectClase}
        >
          <option value="">Elige la capa…</option>
          {capas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
          Repartidos entre
        </span>
        <select
          value={ajustes.zonas}
          onChange={(e) => poner({ zonas: e.target.value })}
          className={selectClase}
        >
          <option value="">Sin reparto por zonas</option>
          {areas
            .filter((c) => c.id !== ajustes.registros)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </select>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
          Barrios o parroquias. De aquí salen el reparto, la desigualdad y la lista de zonas
          que se quedaron en cero.
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
          Dentro del límite de
        </span>
        <select
          value={ajustes.ambito}
          onChange={(e) => poner({ ambito: e.target.value })}
          className={selectClase}
        >
          <option value="">Recuadro de los propios registros</option>
          {areas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {!ajustes.ambito && (
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
            Sin un límite, la superficie de referencia sale inflada y eso empuja el patrón
            hacia «agrupado» y la cobertura hacia abajo. Para un informe, elige el límite.
          </span>
        )}
      </label>

      {capa && (
        <label className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            Separar por (opcional)
          </span>
          <select
            value={ajustes.campo}
            onChange={(e) => poner({ campo: e.target.value })}
            className={selectClase}
          >
            <option value="">Sin separar</option>
            {capa.campos
              .filter((f) => f.distintos > 1 && f.distintos <= 60)
              .map((f) => (
                <option key={f.nombre} value={f.nombre}>
                  {f.nombre} ({numero(f.distintos)})
                </option>
              ))}
          </select>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Sexo, tipo de campaña, estado… El informe añade el reparto por categoría.
          </span>
        </label>
      )}

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={ajustes.bateria}
          onChange={(e) => poner({ bateria: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          <span className="block text-xs font-semibold text-[var(--gr-tinta-2)]">
            Añadir el diagnóstico general
          </span>
          <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Reparto por zona, desigualdad, patrón espacial, centro de gravedad,
            cobertura y puntos calientes. Son las mismas seis medidas para
            cualquier estudio: útiles cuando no hay más que contar, de más
            cuando el informe ya habla de lo que analizaste.
          </span>
        </span>
      </label>

      {ajustes.bateria && (
        <label className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            Radio de cobertura (m)
          </span>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={ajustes.radio}
            onChange={(e) => poner({ radio: e.target.value })}
            className={selectClase}
          />
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Cuánto territorio quedó a esta distancia de algún registro. Solo
            alimenta esa sección del diagnóstico general.
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={onCorrer}
        disabled={calculando || !ajustes.registros}
        className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* Con un informe ya hecho, «armar» suena a empezar otro. Lo que
            hace es rehacerlo con lo que haya cambiado, y reemplaza sus
            propias capas en vez de añadir dos mas. */}
        {calculando
          ? 'Calculando…'
          : desfasado
            ? 'Rehacer con estos ajustes'
            : hayInforme
              ? 'Rehacer el informe'
              : 'Armar el informe'}
      </button>

      {hayInforme && (
        <button
          type="button"
          onClick={onLamina}
          className="w-full rounded border border-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-[var(--gr-azul-texto)] hover:bg-[var(--gr-azul-100)]"
        >
          Abrir la lámina para imprimir
        </button>
      )}

      {error && (
        <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
          {error}
        </p>
      )}
    </section>
  )
}
