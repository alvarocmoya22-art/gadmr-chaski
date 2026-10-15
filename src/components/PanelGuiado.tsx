/**
 * El modo guiado: se elige una pregunta y se rellenan los huecos de la frase.
 *
 * La frase es la interfaz. En vez de un formulario con etiquetas sueltas
 * —«Capa de entrada», «Zonas», «Estadístico»— se lee «Contar los registros de
 * ___ que caen en cada ___», y los huecos son desplegables dentro del texto.
 * Quien lo rellena está leyendo lo que va a pasar mientras lo elige, así que no
 * hace falta saber cuál es la capa de entrada y cuál la de zonas: lo dice la
 * frase.
 */
import type { Capa } from '../lib/cargar'
import { ENTRADA, RECETAS, type Hueco, type Receta } from '../lib/recetas'
import { numero } from '../lib/format'

const FORMA: Record<Capa['forma'], string> = {
  punto: 'puntos',
  linea: 'líneas',
  poligono: 'áreas',
  mixta: 'formas mezcladas',
}

interface Props {
  capas: Capa[]
  receta: Receta | null
  onReceta: (clave: string) => void
  valores: Record<string, string>
  onValores: (v: Record<string, string>) => void
  calculando: boolean
  onCorrer: () => void
  error: string | null
}

/** Las capas que sirven para un hueco. */
const capasPara = (capas: Capa[], h: Hueco) =>
  capas.filter((c) => (h.formas ?? []).includes(c.forma))

export default function PanelGuiado({
  capas,
  receta,
  onReceta,
  valores,
  onValores,
  calculando,
  onCorrer,
  error,
}: Props) {
  if (capas.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
        Carga una capa —o prueba con el ejemplo— y aquí aparecen las preguntas que se
        pueden responder.
      </p>
    )
  }

  const huecos = (r: Receta) => r.frase.filter((p): p is Hueco => typeof p !== 'string')
  /** Una receta se puede usar si hay capa para cada hueco que pide una. */
  const sePuede = (r: Receta) =>
    huecos(r)
      .filter((h) => h.tipo === 'capa')
      .every((h) => capasPara(capas, h).length > 0)

  const entradaElegida = receta
    ? (capas.find((c) => c.id === valores[ENTRADA]) ?? null)
    : null

  const listo =
    receta !== null &&
    huecos(receta).every((h) => {
      const v = valores[h.clave]
      if (h.tipo === 'numero') return (v ?? h.defecto ?? '') !== ''
      return (v ?? '') !== ''
    })

  const hueco = (h: Hueco, i: number) => {
    const comun =
      'mx-0.5 inline-block rounded border border-[var(--gr-azul-500)] bg-[var(--gr-superficie)] px-1 py-0.5 text-sm font-semibold text-[var(--gr-azul-500)]'

    if (h.tipo === 'numero') {
      return (
        <span key={i}>
          <input
            type="number"
            value={valores[h.clave] ?? h.defecto ?? ''}
            onChange={(e) => onValores({ ...valores, [h.clave]: e.target.value })}
            className={`${comun} w-20`}
          />
          {h.unidad ? ` ${h.unidad}` : ''}
        </span>
      )
    }

    if (h.tipo === 'campo') {
      const campos = (entradaElegida?.campos ?? []).filter(
        (f) => f.distintos > 1 && f.distintos <= 200,
      )
      return (
        <select
          key={i}
          value={valores[h.clave] ?? ''}
          onChange={(e) => onValores({ ...valores, [h.clave]: e.target.value })}
          className={comun}
          disabled={!entradaElegida}
        >
          <option value="">{entradaElegida ? h.pista : 'elige antes la capa'}</option>
          {campos.map((f) => (
            <option key={f.nombre} value={f.nombre}>
              {f.nombre}
            </option>
          ))}
        </select>
      )
    }

    const candidatas = capasPara(capas, h)
    return (
      <select
        key={i}
        value={valores[h.clave] ?? ''}
        onChange={(e) =>
          onValores(
            // Al cambiar la capa de entrada, el campo elegido deja de valer.
            h.clave === ENTRADA
              ? { ...valores, [h.clave]: e.target.value, campo: '' }
              : { ...valores, [h.clave]: e.target.value },
          )
        }
        className={comun}
      >
        <option value="">{h.pista}</option>
        {candidatas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({FORMA[c.forma]})
          </option>
        ))}
      </select>
    )
  }

  return (
    <section className="space-y-2">
      <p className="text-xs leading-snug text-[var(--gr-tinta-3)]">
        Elige una pregunta y completa la frase. Por debajo corre la misma herramienta
        que en la otra pestaña, con los huecos ya puestos en su sitio.
      </p>

      <ul className="space-y-1.5">
        {RECETAS.map((r) => {
          const activa = receta?.clave === r.clave
          const usable = sePuede(r)
          return (
            <li key={r.clave}>
              <button
                type="button"
                onClick={() => onReceta(r.clave)}
                className={`w-full rounded-md border p-2 text-left ${
                  activa
                    ? 'border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)]'
                    : usable
                      ? 'border-[var(--gr-linea)] bg-[var(--gr-superficie)] hover:border-[var(--gr-azul-500)]'
                      : 'border-[var(--gr-linea)] bg-transparent opacity-60'
                }`}
              >
                <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
                  {r.pregunta}
                </span>
                {!usable && (
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
                    Falta cargar una capa que sirva. {r.sugerencia}
                  </span>
                )}
              </button>

              {activa && (
                <div className="mt-1.5 space-y-2 rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-2">
                  <p className="text-sm leading-7 text-[var(--gr-tinta)]">
                    {r.frase.map((parte, i) =>
                      typeof parte === 'string' ? (
                        <span key={i}> {parte} </span>
                      ) : (
                        hueco(parte, i)
                      ),
                    )}
                  </p>

                  <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                    <span className="font-semibold">Devuelve: </span>
                    {r.devuelve}
                  </p>

                  <button
                    type="button"
                    onClick={onCorrer}
                    disabled={calculando || !listo}
                    className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {calculando ? 'Calculando…' : listo ? 'Ver el resultado' : 'Completa la frase'}
                  </button>

                  {error && (
                    <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
        {numero(RECETAS.length)} preguntas. Si lo que buscas no está, la pestaña de
        herramientas tiene la caja entera.
      </p>
    </section>
  )
}
