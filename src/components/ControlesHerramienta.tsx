/**
 * Los controles de una herramienta: un campo por cada parámetro que declare.
 *
 * Vive aquí fuera porque lo usan dos sitios: la herramienta suelta y cada
 * paso del flujo. Mientras estuvo dentro del panel de análisis, montar el
 * flujo obligaba a copiar ciento sesenta líneas de formulario, y dos copias
 * de un formulario se separan a la primera corrección.
 */
import type { Capa } from "../lib/cargar";
import {
  valoresDe,
  type Herramienta,
  type Parametro,
} from "../lib/herramientas";
import { TODA_LA_CATEGORIA } from "../lib/hotspot";
import { aNumero } from "../lib/estadistica";
import { numero } from "../lib/format";

export const FORMA: Record<Capa["forma"], string> = {
  punto: "puntos",
  linea: "líneas",
  poligono: "polígonos",
  mixta: "formas mezcladas",
};

export const selectClase =
  "mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]";

/** Si un campo trae números en la mayoría de sus registros. */
function esNumerico(capa: Capa, campo: string): boolean {
  let vistos = 0;
  let numeros = 0;
  for (const f of capa.geo.features.slice(0, 200)) {
    const v = (f.properties ?? {})[campo];
    if (v === null || v === undefined || v === "") continue;
    vistos++;
    if (aNumero(v) !== null) numeros++;
  }
  return vistos > 0 && numeros / vistos > 0.8;
}

interface Props {
  /** La capa de entrada del paso: de ella salen los campos. */
  capa: Capa;
  /** Todas las de la mesa, para los parámetros que piden otra capa. */
  capas: Capa[];
  herramienta: Herramienta;
  valores: Record<string, string>;
  onValores: (v: Record<string, string>) => void;
}

export default function ControlesHerramienta({
  capa,
  capas,
  herramienta,
  valores,
  onValores,
}: Props) {
  const poner = (clave: string, valor: string) =>
    onValores({ ...valores, [clave]: valor });

  const control = (p: Parametro) => {
    if (p.tipo === "campo") {
      const fuente = p.deCapa
        ? (capas.find((c) => c.id === valores[p.deCapa!]) ?? null)
        : capa;
      if (!fuente) return null;
      let campos = fuente.campos;
      if (p.fecha) {
        // Solo las que de verdad traen fechas, detectadas al cargar la capa.
        const conFecha = new Set((fuente.fechas ?? []).map((f) => f.campo));
        campos = campos.filter((f) => conFecha.has(f.nombre));
      } else if (p.numerico)
        campos = campos.filter((f) => esNumerico(fuente, f.nombre));
      else campos = campos.filter((f) => f.distintos > 1 && f.distintos <= 200);
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            {p.rotulo}
          </span>
          <select
            value={valores[p.clave] ?? ""}
            onChange={(e) =>
              onValores(
                p.clave === "campo"
                  ? {
                      ...valores,
                      campo: e.target.value,
                      valor: TODA_LA_CATEGORIA,
                    }
                  : { ...valores, [p.clave]: e.target.value },
              )
            }
            className={selectClase}
          >
            <option value="">
              {p.opcional ? (p.vacio ?? "Sin elegir") : "Elige un campo…"}
            </option>
            {campos.map((f) => (
              <option key={f.nombre} value={f.nombre}>
                {f.nombre} ({numero(f.distintos)})
              </option>
            ))}
          </select>
          {campos.length === 0 && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
              {p.fecha
                ? "Esta capa no trae ninguna columna con fechas."
                : p.numerico
                  ? "Esta capa no trae ningún campo con números."
                  : "Esta capa no trae campos que sirvan para separar."}
            </span>
          )}
          {p.nota && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              {p.nota}
            </span>
          )}
        </label>
      );
    }

    if (p.tipo === "valor") {
      const campo = valores[p.dependeDe];
      if (!capa || !campo) return null;
      const opciones = valoresDe(capa, campo);
      const total = opciones.reduce((s, o) => s + o.n, 0);
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            {p.rotulo}
          </span>
          <select
            value={valores[p.clave] ?? TODA_LA_CATEGORIA}
            onChange={(e) => poner(p.clave, e.target.value)}
            className={selectClase}
          >
            <option value={TODA_LA_CATEGORIA}>
              Todos juntos ({numero(total)})
            </option>
            {opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.valor} ({numero(o.n)})
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (p.tipo === "capa") {
      const candidatas = capas.filter(
        (c) => c.id !== capa?.id && p.formas.includes(c.forma),
      );
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            {p.rotulo}
          </span>
          <select
            value={valores[p.clave] ?? ""}
            onChange={(e) => poner(p.clave, e.target.value)}
            className={selectClase}
          >
            <option value="">{p.vacio ?? "Elige una capa…"}</option>
            {candidatas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {candidatas.length === 0 && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
              No hay otra capa cargada que sirva aquí. Hace falta una de{" "}
              {p.formas.map((f) => FORMA[f]).join(" o ")}.
            </span>
          )}
          {p.nota && !valores[p.clave] && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              {p.nota}
            </span>
          )}
        </label>
      );
    }

    if (p.tipo === "numero") {
      return (
        <label key={p.clave} className="block">
          <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
            {p.rotulo}
            {p.unidad ? ` (${p.unidad})` : ""}
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
      );
    }

    return (
      <div key={p.clave}>
        <span className="text-xs font-semibold text-[var(--gr-tinta-2)]">
          {p.rotulo}
        </span>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {p.opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              title={o.nota}
              onClick={() => poner(p.clave, o.valor)}
              className={`flex-1 rounded border px-2 py-1 text-xs ${
                (valores[p.clave] || p.defecto || p.opciones[0].valor) ===
                o.valor
                  ? "border-[var(--gr-azul-500)] bg-[var(--gr-azul-500)] font-semibold text-white"
                  : "border-[var(--gr-linea)] text-[var(--gr-tinta-2)] hover:bg-[var(--gr-azul-100)]"
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
    );
  };

  return <>{herramienta.parametros.map(control)}</>;
}
