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
  /** Cuánto queda de cada capa dentro de la zona elegida. */
  enZona: { nombre: string; dentro: number; total: number }[];
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
  enZona,
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
  const actual = ambitos.find((a) => a.clave === elegido) ?? urbano ?? null;

  /*
   * Se baja en tres pasos, de lo macro a lo pequeño: parroquia, plataforma,
   * barrio.
   *
   * Un solo desplegable con las 18 plataformas y los 212 barrios seguidos
   * obliga a ir leyendo hasta dar con el que uno quiere. Así cada lista se
   * acorta con la elección de arriba, y el rótulo dice cuántos quedan para
   * que se vea que se acortó a propósito y no que faltan.
   */
  const parroquias = ambitos.filter((a) => a.nivel === "parroquia");

  const plataformaActiva =
    actual?.nivel === "plataforma" ? actual.clave : (actual?.padre ?? "");

  /** La parroquia, que puede estar a uno o a dos saltos del ámbito elegido. */
  const parroquiaActiva =
    actual?.nivel === "parroquia"
      ? actual.clave
      : (ambitos.find((a) => a.clave === plataformaActiva)?.padre ?? "");

  const plataformas = ambitos.filter(
    (a) =>
      a.nivel === "plataforma" &&
      (parroquiaActiva === "" || a.padre === parroquiaActiva),
  );

  /*
   * Los barrios de la plataforma elegida y, si no hay ninguna, los de toda la
   * parroquia: un salto más arriba, por la plataforma de la que cuelgan.
   */
  /*
   * Los de la parroquia se filtran por la parroquia del BARRIO, no por la de
   * su plataforma. Yendo por la plataforma salían 102 donde la cifra de al
   * lado decía 107: cinco barrios de Lizarzaburu cuelgan de una plataforma
   * que pertenece a otra parroquia, y la lista y el número contaban cosas
   * distintas sin decirlo.
   */
  const barrios = ambitos.filter((a) => {
    if (a.nivel !== "barrio") return false;
    if (plataformaActiva !== "") return a.padre === plataformaActiva;
    if (parroquiaActiva !== "") return a.abuelo === parroquiaActiva;
    return true;
  });

  const sup = (a: Ambito) => `${numero(Math.round(a.ha))} ha`;
  /** «las 7» / «la 1», porque «las 1 de Yaruquíes» se lee fatal. */
  const cuantas = (n: number) => (n === 1 ? "la 1" : `las ${numero(n)}`);
  const cuantos = (n: number) => (n === 1 ? "el 1" : `los ${numero(n)}`);
  const rotulo =
    "text-[11px] font-semibold uppercase tracking-wide text-[var(--gr-tinta-3)]";
  const campo =
    "mt-1 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1.5 text-sm text-[var(--gr-tinta)]";

  return (
    <section className="space-y-3">
      {parroquias.length > 0 && (
        <div>
          <span className={rotulo}>
            Parroquia
            {parroquias.length > 0 && ` · ${numero(parroquias.length)}`}
          </span>
          <select
            value={parroquiaActiva || urbano?.clave || ""}
            onChange={(e) => onElegir(e.target.value)}
            className={campo}
          >
            {urbano && <option value={urbano.clave}>{urbano.titulo}</option>}
            {parroquias.map((a) => (
              <option key={a.clave} value={a.clave}>
                {a.titulo} · {sup(a)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className={rotulo}>
          Plataforma
          {parroquiaActiva
            ? ` · ${cuantas(plataformas.length)} de ${ambitos.find((x) => x.clave === parroquiaActiva)?.titulo ?? ""}`
            : ` · ${cuantas(plataformas.length)} del urbano`}
        </span>
        <select
          // Al volver a «todas», se sube a la parroquia que las contiene.
          value={plataformaActiva}
          onChange={(e) =>
            onElegir(e.target.value || parroquiaActiva || urbano?.clave || "")
          }
          className={campo}
        >
          <option value="">Todas las plataformas</option>
          {plataformas.map((a) => (
            <option key={a.clave} value={a.clave}>
              {a.titulo} · {sup(a)}
            </option>
          ))}
        </select>
      </div>

      {actual && actual.nivel !== "urbano" && (
        <div className="rounded border border-[var(--gr-linea)] px-2 py-1.5">
          {enZona.length > 0 && (
            <table className="mb-1.5 w-full text-[11px]">
              <caption className="mb-0.5 text-left text-[11px] font-semibold text-[var(--gr-tinta-2)]">
                Lo que se dibuja aquí
              </caption>
              <tbody>
                {enZona.map((c) => (
                  <tr key={c.nombre}>
                    <th className="py-0.5 pr-2 text-left font-normal text-[var(--gr-tinta-3)]">
                      {c.nombre}
                    </th>
                    <td className="py-0.5 text-right text-[var(--gr-tinta-2)]">
                      <span className="font-semibold text-[var(--gr-tinta)]">
                        {numero(c.dentro)}
                      </span>{" "}
                      de {numero(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Se dibuja lo que toca esta zona, entero: una calle o un predio que
            cruzan el límite no se parten, porque cortarlos les cambiaría la
            longitud y la superficie. Por eso aquí puede salir algún área más
            que en las cifras de abajo, que cuentan solo las que{" "}
            <em>pertenecen</em> a la zona por su centro. Para cortar de verdad
            está «¿Qué parte de esta capa cae dentro de aquella?», en Analizar.
          </p>
        </div>
      )}

      <div>
        <span className={rotulo}>
          Barrio
          {` · ${cuantos(barrios.length)} de `}
          {plataformaActiva
            ? (ambitos.find((x) => x.clave === plataformaActiva)?.titulo ?? "")
            : parroquiaActiva
              ? (ambitos.find((x) => x.clave === parroquiaActiva)?.titulo ?? "")
              : "todo el urbano"}
        </span>
        <select
          // Al volver a «todos», se sube al ámbito que contiene a estos barrios.
          value={actual?.nivel === "barrio" ? actual.clave : ""}
          onChange={(e) =>
            onElegir(
              e.target.value ||
                plataformaActiva ||
                parroquiaActiva ||
                urbano?.clave ||
                "",
            )
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
