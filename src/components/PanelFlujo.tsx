/**
 * El constructor de flujos: la pestaña de Herramientas, encadenada.
 *
 * Se lee de arriba abajo como una receta: cada paso dice qué herramienta
 * corre, de dónde saca la capa y con qué parámetros. La entrada de un paso
 * puede ser el resultado de otro anterior, y eso es lo que lo convierte en
 * cadena y no en lista.
 *
 * Un flujo de un solo paso es exactamente lo que había antes, así que nada se
 * pierde al entrar por aquí.
 */
import { useState } from "react";
import type { Capa } from "../lib/cargar";
// CATALOGO es el catálogo entero, para cuando aún no se sabe qué forma entra.
import {
  CATEGORIAS,
  HERRAMIENTAS as CATALOGO,
  herramientasPara,
} from "../lib/herramientas";
import {
  REF_PASO,
  entradaDe,
  esRefPaso,
  herramientaDe,
  idDePaso,
  queFaltaEn,
  refAPaso,
  valoresIniciales,
  type Marcha,
  type Paso,
} from "../lib/flujo";
import ControlesHerramienta, {
  FORMA,
  selectClase,
} from "./ControlesHerramienta";
import { numero } from "../lib/format";

interface Props {
  capas: Capa[];
  pasos: Paso[];
  onPasos: (p: Paso[]) => void;
  marchas: Marcha[];
  corriendo: boolean;
  onCorrer: () => void;
  /** Guarda en la mesa la capa que dejó un paso. */
  onGuardar: (capa: Capa) => void;
  /** Abre el lienzo de abajo, que es donde se arma de verdad. */
  onConstructor: () => void;
}

export default function PanelFlujo({
  capas,
  pasos,
  onPasos,
  marchas,
  corriendo,
  onCorrer,
  onGuardar,
  onConstructor,
}: Props) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);

  if (capas.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
        Carga una capa y aquí puedes encadenar herramientas: el resultado de una
        entra en la siguiente.
      </p>
    );
  }

  const marchaDe = (id: string) => marchas.find((m) => m.paso === id) ?? null;

  const cambiar = (id: string, cambio: Partial<Paso>) =>
    onPasos(pasos.map((p) => (p.id === id ? { ...p, ...cambio } : p)));

  const quitar = (id: string) => onPasos(pasos.filter((p) => p.id !== id));

  const mover = (i: number, a: number) => {
    if (a < 0 || a >= pasos.length) return;
    const copia = [...pasos];
    const [x] = copia.splice(i, 1);
    copia.splice(a, 0, x);
    onPasos(copia);
  };

  const anadir = (clave: string) => {
    const previo = pasos[pasos.length - 1];
    onPasos([
      ...pasos,
      {
        id: idDePaso(),
        herramienta: clave,
        /*
         * El paso nuevo bebe del anterior por omisión.
         *
         * Es lo que se quiere nueve de cada diez veces, y es lo que hace que
         * encadenar no cueste nada: añades y ya está encadenado. Cambiarlo a
         * una capa de la mesa es un clic.
         */
        entrada: previo ? `${REF_PASO}${previo.id}` : (capas[0]?.id ?? ""),
        valores: valoresIniciales(clave),
      },
    ]);
    setAnadiendo(false);
  };

  /** Las herramientas que aceptan lo que va a entrar en el paso nuevo. */
  const paraElFinal = (() => {
    const previo = pasos[pasos.length - 1];
    if (!previo) return herramientasPara(capas[0] ?? null);
    const m = marchaDe(previo.id);
    // Si el flujo ya corrió, se sabe la forma del resultado; si no, se
    // ofrecen todas y el paso avisará cuando no cuadre.
    return m?.capa ? herramientasPara(m.capa) : null;
  })();

  const hechos = new Map(
    marchas.filter((m) => m.capa).map((m) => [m.paso, m.capa as Capa]),
  );

  return (
    <section className="space-y-2">
      <p className="text-xs leading-snug text-[var(--gr-tinta-3)]">
        Encadena herramientas: el resultado de un paso entra en el siguiente. Se
        corre entero y se puede volver a correr cuando cambien los datos.
      </p>

      {/* La lista de aquí sirve para mirar y retocar; para armar —y sobre todo
          para ver las ramas— está el lienzo de abajo. */}
      <button
        type="button"
        onClick={onConstructor}
        className="w-full rounded border border-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-[var(--gr-azul-500)] hover:bg-[var(--gr-azul-100)]"
      >
        Abrir el constructor ▾
      </button>

      <ol className="space-y-1.5">
        {pasos.map((paso, i) => {
          const h = herramientaDe(paso.herramienta);
          const m = marchaDe(paso.id);
          const falta = queFaltaEn(paso, pasos, capas);
          const entrada = entradaDe(paso, capas, hechos);
          const estaAbierto = abierto === paso.id;
          const borde =
            m?.estado === "mal"
              ? "border-[var(--gr-error)]"
              : m?.estado === "bien"
                ? "border-[var(--gr-exito,var(--gr-azul-500))]"
                : "border-[var(--gr-linea)]";

          return (
            <li key={paso.id}>
              <div
                className={`rounded-md border ${borde} bg-[var(--gr-superficie)] p-2`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--gr-azul-100)] text-[11px] font-bold text-[var(--gr-azul-500)]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--gr-tinta)]">
                      {h?.nombre ?? paso.herramienta}
                    </p>
                    <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                      {esRefPaso(paso.entrada)
                        ? `entra el resultado del paso ${
                            pasos.findIndex(
                              (p) => p.id === refAPaso(paso.entrada),
                            ) + 1
                          }`
                        : `entra «${capas.find((c) => c.id === paso.entrada)?.nombre ?? "—"}»`}
                      {m?.capa &&
                        ` · deja ${numero(m.capa.geo.features.length)} ${FORMA[m.capa.forma]}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => mover(i, i - 1)}
                      disabled={i === 0}
                      title="Subir"
                      className="px-1 text-xs text-[var(--gr-tinta-3)] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, i + 1)}
                      disabled={i === pasos.length - 1}
                      title="Bajar"
                      className="px-1 text-xs text-[var(--gr-tinta-3)] disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>

                {(falta || m?.error) && (
                  <p className="mt-1 rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
                    {m?.error ?? falta}
                  </p>
                )}
                {m?.aviso && (
                  <p className="mt-1 text-[11px] leading-snug text-[var(--gr-aviso)]">
                    {m.aviso}
                  </p>
                )}

                <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setAbierto(estaAbierto ? null : paso.id)}
                    className="text-[var(--gr-azul-500)] hover:underline"
                  >
                    {estaAbierto ? "Cerrar" : "Ajustar"}
                  </button>
                  {m?.capa && (
                    <button
                      type="button"
                      onClick={() => onGuardar(m.capa as Capa)}
                      className="text-[var(--gr-azul-500)] hover:underline"
                      title="Dejarlo como capa en la mesa"
                    >
                      Guardar en la mesa
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => quitar(paso.id)}
                    className="text-[var(--gr-error)] hover:underline"
                  >
                    Quitar
                  </button>
                </div>

                {estaAbierto && h && (
                  <div className="mt-2 space-y-2 border-t border-[var(--gr-linea)] pt-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
                        Qué capa entra
                      </span>
                      <select
                        value={paso.entrada}
                        onChange={(e) =>
                          cambiar(paso.id, { entrada: e.target.value })
                        }
                        className={selectClase}
                      >
                        {pasos.slice(0, i).map((p, j) => (
                          <option key={p.id} value={`${REF_PASO}${p.id}`}>
                            El resultado del paso {j + 1} ·{" "}
                            {herramientaDe(p.herramienta)?.nombre ??
                              p.herramienta}
                          </option>
                        ))}
                        {capas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} ({FORMA[c.forma]})
                          </option>
                        ))}
                      </select>
                    </label>

                    {entrada ? (
                      <ControlesHerramienta
                        capa={entrada}
                        capas={[...hechos.values(), ...capas]}
                        herramienta={h}
                        valores={paso.valores}
                        onValores={(v) => cambiar(paso.id, { valores: v })}
                      />
                    ) : (
                      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                        Los parámetros aparecen cuando se sepa qué capa entra.
                        Si toma el resultado de otro paso, corre el flujo una
                        vez.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {i < pasos.length - 1 && (
                <p
                  aria-hidden
                  className="py-0.5 text-center text-xs text-[var(--gr-tinta-3)]"
                >
                  ↓
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {anadiendo ? (
        <div className="rounded-md border border-[var(--gr-linea)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
              Qué herramienta añades
            </span>
            <button
              type="button"
              onClick={() => setAnadiendo(false)}
              className="text-xs text-[var(--gr-tinta-3)] hover:underline"
            >
              Cancelar
            </button>
          </div>
          {paraElFinal === null && (
            <p className="mb-1 text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              El flujo aún no ha corrido, así que no se sabe qué forma dejará el
              último paso: se ofrecen todas y el paso avisará si no cuadra.
            </p>
          )}
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {CATEGORIAS.map((cat) => {
              const lista = (paraElFinal ?? CATALOGO).filter(
                (h) => h.categoria === cat.clave,
              );
              if (lista.length === 0) return null;
              return (
                <div key={cat.clave}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gr-tinta-3)]">
                    {cat.nombre}
                  </p>
                  {lista.map((h) => (
                    <button
                      key={h.clave}
                      type="button"
                      onClick={() => anadir(h.clave)}
                      title={h.nota}
                      className="block w-full rounded px-1.5 py-1 text-left text-xs text-[var(--gr-tinta)] hover:bg-[var(--gr-azul-100)]"
                    >
                      {h.nombre}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAnadiendo(true)}
          className="w-full rounded border border-dashed border-[var(--gr-linea-fuerte)] px-3 py-2 text-sm text-[var(--gr-tinta-2)] hover:border-[var(--gr-azul-500)]"
        >
          + Añadir un paso
        </button>
      )}

      {pasos.length > 0 && (
        <button
          type="button"
          onClick={onCorrer}
          disabled={corriendo}
          className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {corriendo
            ? "Corriendo…"
            : `Correr el flujo (${numero(pasos.length)} ${pasos.length === 1 ? "paso" : "pasos"})`}
        </button>
      )}
    </section>
  );
}
