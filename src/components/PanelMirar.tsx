/**
 * El panel de Mirar: elegir una zona y ver qué hay dentro.
 *
 * Aquí no hay ni una herramienta, y es a propósito. Quien entra a mirar su
 * ciudad no debería tropezarse con una caja de dieciséis utilidades ni con la
 * palabra «Getis-Ord». Si quiere analizar, cambia de modo arriba.
 */
import type { Fila } from "../lib/cargar";
import { colorDeTipo, type Ambito } from "../lib/mirar";
import { numero } from "../lib/format";

interface Props {
  listo: boolean;
  cargando: boolean;
  onTraerCapas: () => void;
  ambitos: Ambito[];
  elegido: string;
  onElegir: (clave: string) => void;
  cifras: Fila[];
  tipos: Fila[];
  fuentePoblacion: string | null;
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
          Para mirar el territorio hacen falta las plataformas, los barrios y
          los equipamientos. Se traen del visor y se quedan en tu navegador.
        </p>
        <button
          type="button"
          onClick={onTraerCapas}
          disabled={cargando}
          className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {cargando ? "Trayendo…" : "Traer el territorio"}
        </button>
      </section>
    );
  }

  const urbano = ambitos.find((a) => a.nivel === "urbano");
  const plataformas = ambitos.filter((a) => a.nivel === "plataforma");
  const actual = ambitos.find((a) => a.clave === elegido) ?? urbano ?? null;

  /*
   * El ámbito y el barrio se eligen en dos pasos, no en una lista de 231.
   *
   * Antes era un solo desplegable con las 18 plataformas y los 212 barrios
   * seguidos: encontrar el barrio que a uno le interesa ahí dentro es ir
   * leyendo. Así, el barrio se elige **dentro** de la plataforma, y el rótulo
   * dice cuántos hay para que se vea que la lista se acortó a propósito.
   */
  const plataformaActiva =
    actual?.nivel === "plataforma" ? actual.clave : (actual?.padre ?? "");

  const barrios = ambitos.filter(
    (a) =>
      a.nivel === "barrio" &&
      (plataformaActiva === "" || a.padre === plataformaActiva),
  );

  const sup = (a: Ambito) => `${numero(Math.round(a.ha))} ha`;
  const rotulo =
    "text-[11px] font-semibold uppercase tracking-wide text-[var(--gr-tinta-3)]";
  const campo =
    "mt-1 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1.5 text-sm text-[var(--gr-tinta)]";

  return (
    <section className="space-y-3">
      <div>
        <span className={rotulo}>Ámbito</span>
        <select
          value={plataformaActiva || urbano?.clave || ""}
          onChange={(e) => onElegir(e.target.value)}
          className={campo}
        >
          {urbano && <option value={urbano.clave}>{urbano.titulo}</option>}
          {plataformas.map((a) => (
            <option key={a.clave} value={a.clave}>
              {a.titulo} · {sup(a)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={rotulo}>
          Barrio
          {plataformaActiva
            ? ` · los ${numero(barrios.length)} de la ${actual?.nivel === "barrio" ? (ambitos.find((x) => x.clave === plataformaActiva)?.titulo ?? "") : (actual?.titulo ?? "")}`
            : ` · los ${numero(barrios.length)} del urbano`}
        </span>
        <select
          // Al volver a «todos», se sube al ámbito que contiene a estos barrios.
          value={actual?.nivel === "barrio" ? actual.clave : ""}
          onChange={(e) =>
            onElegir(e.target.value || plataformaActiva || urbano?.clave || "")
          }
          className={campo}
        >
          <option value="">Todos los barrios</option>
          {barrios.map((a) => (
            <option key={a.clave} value={a.clave}>
              {a.titulo} · {sup(a)}
            </option>
          ))}
        </select>
      </div>

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
          <p className="mb-1.5 text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            El color es el del anillo en el mapa.
          </p>
          <table className="w-full text-xs">
            <tbody>
              {tipos.map((f) => (
                <tr key={f.etiqueta}>
                  {/* El punto no decora: es la leyenda del mapa. Sin él hay
                      doce anillos de colores y una tabla que no los nombra. */}
                  <th className="py-0.5 pr-2 text-left font-normal text-[var(--gr-tinta-3)]">
                    <span
                      aria-hidden
                      // El borde va en estilo y no en clase: `ring-2` de
                      // Tailwind usa su propio color y pintaba los doce tipos
                      // del mismo azul, con una leyenda debajo diciendo que
                      // ese era el color del mapa.
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 align-middle"
                      style={{ borderColor: colorDeTipo(f.etiqueta) }}
                    />
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
          : "Sin el agregado de población: solo se muestran superficie y equipamientos."}{" "}
        Las superficies se miden sobre el elipsoide WGS84, no son las declaradas
        en los shapefiles.
      </p>

      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
        ¿Quieres cruzar esto con datos tuyos? Pásate a <strong>Analizar</strong>
        , ahí arriba. Las capas que ya están cargadas te siguen.
      </p>
    </section>
  );
}
