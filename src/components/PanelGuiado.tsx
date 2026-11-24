/**
 * El modo guiado: se elige una pregunta y se rellenan los huecos de la frase.
 *
 * La frase es la interfaz. En vez de un formulario con etiquetas sueltas
 * —«Capa de entrada», «Zonas», «Estadístico»— se lee «Contar los registros de
 * ___ que caen en cada ___», y los huecos son desplegables dentro del texto.
 * Quien lo rellena está leyendo lo que va a pasar mientras lo elige, así que no
 * hace falta saber cuál es la capa de entrada y cuál la de zonas: lo dice la
 * frase.
 *
 * Y encima de todo está el asistente: se escribe la pregunta y él elige la
 * receta y rellena los huecos. No reemplaza a la frase, la RELLENA — lo que
 * propone acaba en los mismos desplegables, donde se ve entero y se puede
 * corregir antes de correr. Un asistente que ejecuta sin enseñar lo que
 * entendió es un generador de cifras que nadie revisó; `lib/asistente.ts`
 * explica por qué además no lleva modelo de lenguaje dentro.
 */
import { useMemo, useState } from "react";
import type { Capa } from "../lib/cargar";
import { ejemplos, interpretar } from "../lib/asistente";
import {
  ENTRADA,
  RECETAS,
  factibilidad,
  type Hueco,
  type Receta,
} from "../lib/recetas";
import { sugerenciasDe } from "../lib/sugerencias";
import { numero } from "../lib/format";

const FORMA: Record<Capa["forma"], string> = {
  punto: "puntos",
  linea: "líneas",
  poligono: "áreas",
  mixta: "formas mezcladas",
};

interface Props {
  capas: Capa[];
  receta: Receta | null;
  onReceta: (clave: string) => void;
  valores: Record<string, string>;
  onValores: (v: Record<string, string>) => void;
  calculando: boolean;
  onCorrer: () => void;
  error: string | null;
  /** Elegir una pregunta ya concreta: receta y huecos de una vez. */
  onSugerencia: (receta: string, valores: Record<string, string>) => void;
}

/** Las capas que sirven para un hueco. */
const capasPara = (capas: Capa[], h: Hueco) =>
  capas.filter((c) => (h.formas ?? []).includes(c.forma));

export default function PanelGuiado({
  capas,
  receta,
  onReceta,
  valores,
  onValores,
  calculando,
  onCorrer,
  error,
  onSugerencia,
}: Props) {
  /*
   * Lo escrito y lo que se entendio.
   *
   * `escrito` es lo que hay en la caja y `lectura` lo que se interpreto al
   * pulsar. Son dos estados y no uno a proposito: interpretar en cada tecla
   * haria bailar la propuesta mientras se escribe, y lo que se propone acaba
   * rellenando la frase de abajo. Que cambie sola mientras uno teclea es la
   * forma mas rapida de correr algo que no se queria.
   */
  const [escrito, setEscrito] = useState("");
  const [buscado, setBuscado] = useState("");
  const lecturas = useMemo(
    () => (buscado.trim() ? interpretar(buscado, capas) : []),
    [buscado, capas],
  );
  const pistas = useMemo(() => ejemplos(capas), [capas]);

  if (capas.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
        Carga una capa —o prueba con el ejemplo— y aquí aparecen las preguntas
        que se pueden responder.
      </p>
    );
  }

  const huecos = (r: Receta) =>
    r.frase.filter((p): p is Hueco => typeof p !== "string");

  /*
   * Qué se puede responder con lo que hay cargado ahora.
   *
   * Se calcula una sola vez y se reparte en dos listas en vez de dejar las
   * imposibles atenuadas entre las demás: con trece preguntas, «atenuada» se
   * lee como «esta es menos importante», no como «con tus datos, esta no».
   */
  const veredictos = new Map(
    RECETAS.map((r) => [r.clave, factibilidad(r, capas)]),
  );
  const puedo = RECETAS.filter((r) => veredictos.get(r.clave)?.puede);
  const noPuedo = RECETAS.filter((r) => !veredictos.get(r.clave)?.puede);

  /*
   * Las preguntas que estas capas sugieren, ya con nombres dentro.
   *
   * Van arriba porque son la respuesta a «y ahora qué hago con esto», que es
   * donde se atasca quien abre esto por primera vez. La lista entera sigue
   * debajo: esto no quita nada, adelanta.
   */
  const sugeridas = sugerenciasDe(capas);

  const entradaElegida = receta
    ? (capas.find((c) => c.id === valores[ENTRADA]) ?? null)
    : null;

  const listo =
    receta !== null &&
    huecos(receta).every((h) => {
      const v = valores[h.clave];
      if (h.tipo === "numero") return (v ?? h.defecto ?? "") !== "";
      return (v ?? "") !== "";
    });

  const hueco = (h: Hueco, i: number) => {
    const comun =
      "mx-0.5 inline-block rounded border border-[var(--gr-azul-500)] bg-[var(--gr-superficie)] px-1 py-0.5 text-sm font-semibold text-[var(--gr-azul-texto)]";

    if (h.tipo === "numero") {
      return (
        <span key={i}>
          <input
            type="number"
            value={valores[h.clave] ?? h.defecto ?? ""}
            onChange={(e) =>
              onValores({ ...valores, [h.clave]: e.target.value })
            }
            className={`${comun} w-20`}
          />
          {h.unidad ? ` ${h.unidad}` : ""}
        </span>
      );
    }

    if (h.tipo === "campo") {
      const conFecha = new Set(
        (entradaElegida?.fechas ?? []).map((x) => x.campo),
      );
      const campos = (entradaElegida?.campos ?? []).filter((f) =>
        h.soloFecha
          ? conFecha.has(f.nombre)
          : f.distintos > 1 && f.distintos <= 200,
      );
      return (
        <select
          key={i}
          value={valores[h.clave] ?? ""}
          onChange={(e) => onValores({ ...valores, [h.clave]: e.target.value })}
          className={comun}
          disabled={!entradaElegida}
        >
          <option value="">
            {!entradaElegida
              ? "elige antes la capa"
              : campos.length === 0 && h.soloFecha
                ? "esa capa no trae fechas"
                : h.pista}
          </option>
          {campos.map((f) => (
            <option key={f.nombre} value={f.nombre}>
              {f.nombre}
            </option>
          ))}
        </select>
      );
    }

    const candidatas = capasPara(capas, h);
    return (
      <select
        key={i}
        value={valores[h.clave] ?? ""}
        onChange={(e) =>
          onValores(
            // Al cambiar la capa de entrada, el campo elegido deja de valer.
            h.clave === ENTRADA
              ? { ...valores, [h.clave]: e.target.value, campo: "" }
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
    );
  };

  const tarjeta = (r: Receta) => {
    const activa = receta?.clave === r.clave;
    const v = veredictos.get(r.clave);
    const usable = v?.puede ?? false;
    return (
      <li key={r.clave}>
        <button
          type="button"
          onClick={() => onReceta(r.clave)}
          className={`w-full rounded-md border p-2 text-left ${
            activa
              ? "border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)]"
              : usable
                ? "border-[var(--gr-linea)] bg-[var(--gr-superficie)] hover:border-[var(--gr-azul-500)]"
                : "border-[var(--gr-linea)] bg-transparent opacity-70"
          }`}
        >
          <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
            {r.pregunta}
          </span>
          {!usable && (
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-aviso)]">
              {v?.falta} {r.sugerencia}
            </span>
          )}
        </button>

        {activa && (
          <div className="mt-1.5 space-y-2 rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-2">
            <p className="text-sm leading-7 text-[var(--gr-tinta)]">
              {r.frase.map((parte, i) =>
                typeof parte === "string" ? (
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
              {calculando
                ? "Calculando…"
                : listo
                  ? "Ver el resultado"
                  : "Completa la frase"}
            </button>

            {error && (
              <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
                {error}
              </p>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="space-y-2">
      {/*
        EL ASISTENTE.

        Lo que escribe el usuario no se manda a ningun sitio: se compara con
        las doce recetas y con los nombres, columnas y valores de sus propias
        capas. De ahi que pueda decir POR QUE eligio cada cosa, que es lo que
        permite ver el error antes de correr y no despues de publicar.
      */}
      <form
        className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscado(escrito);
        }}
      >
        <label className="mb-1 block text-xs font-bold text-[var(--gr-tinta)]">
          Escribe lo que quieres saber
        </label>
        <div className="flex gap-1">
          <input
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            placeholder={pistas[0] ?? "¿Cuántos hay en cada zona?"}
            className="min-w-0 flex-1 rounded border border-[var(--gr-linea)] bg-[var(--gr-fondo)] px-2 py-1.5 text-sm text-[var(--gr-tinta)]"
          />
          <button
            type="submit"
            className="rounded bg-[var(--gr-azul-500)] px-2.5 text-sm font-semibold text-white"
          >
            Entender
          </button>
        </div>

        {buscado.trim() !== "" && lecturas.length === 0 && (
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--gr-aviso)]">
            No reconozco esa pregunta. Entiendo las doce de abajo, dichas de
            muchas maneras; si la tuya es una de ellas con otras palabras,
            dímelo y la añado al vocabulario.
          </p>
        )}

        {lecturas.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {lecturas.map((l, i) => (
              <button
                key={l.receta.clave}
                type="button"
                onClick={() => onSugerencia(l.receta.clave, l.valores)}
                className={`block w-full rounded border p-1.5 text-left ${
                  i === 0
                    ? "border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)]"
                    : "border-[var(--gr-linea)] hover:border-[var(--gr-azul-500)]"
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wide text-[var(--gr-tinta-3)]">
                  {i === 0 ? "Entendí" : "O quizá"}
                </span>
                <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
                  {l.receta.pregunta}
                </span>
                {l.porque.length > 0 && (
                  <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                    {l.porque.join(" · ")}
                  </span>
                )}
                {l.faltan.length > 0 && (
                  <span className="block text-[11px] leading-snug text-[var(--gr-aviso)]">
                    Falta elegir: {l.faltan.map((h) => h.pista).join(", ")}
                  </span>
                )}
              </button>
            ))}
            <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              Pulsa una y la frase de abajo queda rellena. Nada se corre hasta
              que lo digas, y todo esto se resuelve en tu navegador: no se
              consulta ningún modelo ni sale una palabra de aquí.
            </p>
          </div>
        )}

        {buscado.trim() === "" && pistas.length > 1 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {pistas.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => {
                    setEscrito(p);
                    setBuscado(p);
                  }}
                  className="rounded border border-[var(--gr-linea)] px-1.5 py-0.5 text-[11px] text-[var(--gr-tinta-3)] hover:border-[var(--gr-azul-500)] hover:text-[var(--gr-azul-texto)]"
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {sugeridas.length > 0 && (
        <div className="rounded-md border border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)] p-2">
          <p className="mb-1.5 text-xs font-bold text-[var(--gr-tinta)]">
            Con lo que tienes cargado, puedes preguntar
          </p>
          <ul className="space-y-1">
            {sugeridas.map((s) => (
              <li key={s.clave}>
                <button
                  type="button"
                  onClick={() => onSugerencia(s.receta, s.valores)}
                  className="w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-1.5 text-left hover:border-[var(--gr-azul-500)]"
                >
                  <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
                    {s.pregunta}
                  </span>
                  <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                    {s.porque}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Salen de mirar tus capas —su geometría, cuántos registros traen y
            qué columnas—, aquí en tu navegador. No se consulta nada por fuera.
          </p>
        </div>
      )}

      <p className="text-xs leading-snug text-[var(--gr-tinta-3)]">
        O elige una pregunta de la lista y completa la frase. Por debajo corre
        la misma herramienta que en la otra pestaña.
      </p>

      {puedo.length > 0 && (
        <ul className="space-y-1.5">{puedo.map(tarjeta)}</ul>
      )}

      {noPuedo.length > 0 && (
        <details className="rounded-md border border-[var(--gr-linea)]">
          <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-[var(--gr-tinta-2)]">
            {numero(noPuedo.length)}{" "}
            {noPuedo.length === 1 ? "pregunta necesita" : "preguntas necesitan"}{" "}
            otros datos
          </summary>
          <ul className="space-y-1.5 px-2 pb-2">{noPuedo.map(tarjeta)}</ul>
        </details>
      )}

      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
        {numero(puedo.length)} de {numero(RECETAS.length)} preguntas con lo que
        tienes cargado. Si lo que buscas no está, la pestaña de herramientas
        tiene la caja entera.
      </p>
    </section>
  );
}
