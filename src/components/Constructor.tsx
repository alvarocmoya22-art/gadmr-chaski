/**
 * El constructor de modelos: el flujo en un lienzo, abajo.
 *
 * La lista del panel lateral sirve para un flujo de tres pasos y deja de
 * servir en cuanto hay ramas: dos pasos que beben del mismo resultado, o uno
 * que junta dos. Eso en una lista no se ve —hay que leer de qué paso bebe
 * cada uno—, y en un lienzo se ve de un vistazo, que es justo la razón de que
 * los constructores de modelos existan.
 *
 * Se despliega sobre el mapa en vez de abrirse en otra pantalla: lo que se
 * está armando habla de unas capas que están ahí detrás, y cambiar de
 * pantalla para montar el modelo obliga a recordar lo que se acaba de ver.
 *
 * El lienzo es React Flow, que es lo que usa GOAT para lo mismo. Las flechas,
 * el arrastre y el encuadre son trabajo fino y con trampas; aquí lo que vale
 * es el modelo que se arma, no volver a escribir un lienzo.
 */
import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Capa } from "../lib/cargar";
import { CATEGORIAS, HERRAMIENTAS as CATALOGO } from "../lib/herramientas";
import {
  REF_PASO,
  entradaDe,
  esRefPaso,
  herramientaDe,
  idDePaso,
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
  abierto: boolean;
  onCerrar: () => void;
  capas: Capa[];
  pasos: Paso[];
  onPasos: (p: Paso[]) => void;
  marchas: Marcha[];
  corriendo: boolean;
  onCorrer: () => void;
  onGuardar: (capa: Capa) => void;
}

/** Lo que cada nodo necesita saber de sí mismo para pintarse. */
interface DatosNodo extends Record<string, unknown> {
  paso: Paso;
  marcha: Marcha | null;
  fuente: string;
  elegido: boolean;
}

/*
 * El nodo.
 *
 * Dos asideros: uno arriba para recibir la capa y otro abajo para entregar la
 * suya. Que la entrada esté arriba y la salida abajo hace que el modelo se lea
 * cayendo, que es como se leen estas cosas.
 */
function Nodo({ data }: NodeProps) {
  const { paso, marcha, fuente, elegido } = data as unknown as DatosNodo;
  const h = herramientaDe(paso.herramienta);
  const color =
    marcha?.estado === "mal"
      ? "var(--gr-error)"
      : marcha?.estado === "bien"
        ? "var(--gr-azul-500)"
        : "var(--gr-linea-fuerte)";

  return (
    <div
      className="w-52 rounded-md border-2 bg-[var(--gr-superficie)] px-2 py-1.5 shadow"
      style={{ borderColor: elegido ? "var(--gr-azul-500)" : color }}
    >
      <Handle type="target" position={Position.Top} />
      <p className="truncate text-xs font-bold text-[var(--gr-tinta)]">
        {h?.nombre ?? paso.herramienta}
      </p>
      <p className="truncate text-[10px] leading-snug text-[var(--gr-tinta-3)]">
        {fuente}
      </p>
      {marcha?.capa && (
        <p className="text-[10px] leading-snug text-[var(--gr-azul-500)]">
          {numero(marcha.capa.geo.features.length)} {FORMA[marcha.capa.forma]}
        </p>
      )}
      {marcha?.error && (
        <p className="text-[10px] leading-snug text-[var(--gr-error)]">
          {marcha.error}
        </p>
      )}
      {/* Un nodo que no corrió tiene que decirlo: sin esto se queda igual que
          uno que no se ha corrido nunca, y parece que el modelo va bien. */}
      {marcha?.estado === "sin correr" && (
        <p className="text-[10px] leading-snug text-[var(--gr-aviso)]">
          sin correr: falló algo de lo que bebe
        </p>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const TIPOS = { paso: Nodo };

/** Dónde cae un nodo que todavía no tiene sitio. */
const sitioDe = (p: Paso, i: number) =>
  p.posicion ?? { x: 40 + (i % 3) * 230, y: 40 + Math.floor(i / 3) * 150 };

export default function Constructor({
  abierto,
  onCerrar,
  capas,
  pasos,
  onPasos,
  marchas,
  corriendo,
  onCorrer,
  onGuardar,
}: Props) {
  const [elegido, setElegido] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);

  const hechos = useMemo(
    () =>
      new Map(
        marchas.filter((m) => m.capa).map((m) => [m.paso, m.capa as Capa]),
      ),
    [marchas],
  );

  const nombreDe = useCallback(
    (paso: Paso) => {
      if (!esRefPaso(paso.entrada)) {
        return (
          capas.find((c) => c.id === paso.entrada)?.nombre ?? "sin entrada"
        );
      }
      const otro = pasos.find((p) => p.id === refAPaso(paso.entrada));
      return otro
        ? `← ${herramientaDe(otro.herramienta)?.nombre ?? "otro paso"}`
        : "origen perdido";
    },
    [capas, pasos],
  );

  const nodos: Node[] = useMemo(
    () =>
      pasos.map((p, i) => ({
        id: p.id,
        type: "paso",
        position: sitioDe(p, i),
        data: {
          paso: p,
          marcha: marchas.find((m) => m.paso === p.id) ?? null,
          fuente: nombreDe(p),
          elegido: elegido === p.id,
        } satisfies DatosNodo,
      })),
    [pasos, marchas, elegido, nombreDe],
  );

  /*
   * Una flecha por cada dependencia, no solo por la entrada.
   *
   * Un conteo bebe de la capa que cuenta Y de la de zonas; si la flecha fuera
   * solo la de la entrada, el lienzo enseñaría media verdad y mover un nodo
   * parecería no romper nada cuando sí.
   */
  const flechas: Edge[] = useMemo(() => {
    const salida: Edge[] = [];
    for (const p of pasos) {
      if (esRefPaso(p.entrada)) {
        salida.push({
          id: `${p.id}-entrada`,
          source: refAPaso(p.entrada),
          target: p.id,
          animated: true,
        });
      }
      for (const [clave, v] of Object.entries(p.valores)) {
        if (!esRefPaso(v)) continue;
        salida.push({
          id: `${p.id}-${clave}`,
          source: refAPaso(v),
          target: p.id,
          label: clave,
          style: { strokeDasharray: "4 3" },
        });
      }
    }
    return salida.filter((e) => pasos.some((p) => p.id === e.source));
  }, [pasos]);

  const cambiar = (id: string, cambio: Partial<Paso>) =>
    onPasos(pasos.map((p) => (p.id === id ? { ...p, ...cambio } : p)));

  const alMover = useCallback(
    (_e: unknown, nodo: Node) => cambiar(nodo.id, { posicion: nodo.position }),
    // `cambiar` se rehace en cada render; las dependencias de verdad son estas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pasos, onPasos],
  );

  /** Conectar dos nodos es decir que el de abajo bebe del de arriba. */
  const alConectar = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      cambiar(c.target, { entrada: `${REF_PASO}${c.source}` });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pasos, onPasos],
  );

  const anadir = (clave: string) => {
    const id = idDePaso();
    const previo = pasos[pasos.length - 1];
    onPasos([
      ...pasos,
      {
        id,
        herramienta: clave,
        entrada: previo ? `${REF_PASO}${previo.id}` : (capas[0]?.id ?? ""),
        valores: valoresIniciales(clave),
        posicion: sitioDe({ id } as Paso, pasos.length),
      },
    ]);
    setElegido(id);
    setAnadiendo(false);
  };

  if (!abierto) return null;

  const paso = pasos.find((p) => p.id === elegido) ?? null;
  const h = paso ? herramientaDe(paso.herramienta) : null;
  const entrada = paso ? entradaDe(paso, capas, hechos) : null;
  const marcha = paso
    ? (marchas.find((m) => m.paso === paso.id) ?? null)
    : null;

  return (
    <section
      className="flex h-[46vh] shrink-0 flex-col border-t-2 border-[var(--gr-linea-fuerte)] bg-[var(--gr-fondo)]"
      aria-label="Constructor de modelos"
    >
      <header className="flex items-center gap-2 border-b border-[var(--gr-linea)] px-3 py-1.5">
        <h2 className="text-sm font-bold text-[var(--gr-tinta)]">
          Constructor del modelo
        </h2>
        <span className="text-[11px] text-[var(--gr-tinta-3)]">
          {numero(pasos.length)} {pasos.length === 1 ? "paso" : "pasos"} ·
          arrastra de un asidero a otro para encadenar
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnadiendo((v) => !v)}
            className="rounded border border-[var(--gr-linea-fuerte)] px-2 py-1 text-xs text-[var(--gr-tinta-2)] hover:border-[var(--gr-azul-500)]"
          >
            + Paso
          </button>
          <button
            type="button"
            onClick={onCorrer}
            disabled={corriendo || pasos.length === 0}
            className="rounded bg-[var(--gr-azul-500)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {corriendo ? "Corriendo…" : "Correr"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="px-1 text-sm text-[var(--gr-tinta-3)] hover:text-[var(--gr-tinta)]"
            title="Cerrar el constructor"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-[220px] flex-1">
          <ReactFlow
            nodes={nodos}
            edges={flechas}
            nodeTypes={TIPOS}
            onNodeDragStop={alMover}
            onConnect={alConectar}
            onNodeClick={(_e, n) => setElegido(n.id)}
            onPaneClick={() => setElegido(null)}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>

          {pasos.length === 0 && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-[var(--gr-tinta-3)]">
              Añade un paso para empezar a armar el modelo.
            </p>
          )}

          {anadiendo && (
            <div className="absolute left-2 top-2 max-h-[80%] w-56 overflow-y-auto rounded-md border border-[var(--gr-linea-fuerte)] bg-[var(--gr-superficie)] p-2 shadow-lg">
              {CATEGORIAS.map((cat) => {
                const lista = CATALOGO.filter((x) => x.categoria === cat.clave);
                if (lista.length === 0) return null;
                return (
                  <div key={cat.clave}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gr-tinta-3)]">
                      {cat.nombre}
                    </p>
                    {lista.map((x) => (
                      <button
                        key={x.clave}
                        type="button"
                        title={x.nota}
                        onClick={() => anadir(x.clave)}
                        className="block w-full rounded px-1.5 py-1 text-left text-xs text-[var(--gr-tinta)] hover:bg-[var(--gr-azul-100)]"
                      >
                        {x.nombre}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* El paso elegido, a la derecha: sus parámetros sin salir del lienzo. */}
        {/*
          El panel del paso no puede comerse el lienzo.
          Con la ventana estrecha, un ancho fijo de 288 px dejaba el lienzo en
          97: React Flow no llegaba a medir los nodos, los dejaba ocultos y no
          dibujaba ni una flecha. Se queda en un tercio como mucho, y el
          lienzo nunca baja de 220.
        */}
        <aside className="w-72 max-w-[38%] shrink-0 overflow-y-auto border-l border-[var(--gr-linea)] p-2">
          {!paso || !h ? (
            <p className="text-xs leading-snug text-[var(--gr-tinta-3)]">
              Pincha un paso del lienzo para ajustarlo aquí.
            </p>
          ) : (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-bold text-[var(--gr-tinta)]">
                  {h.nombre}
                </p>
                <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  {h.nota}
                </p>
              </div>

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
                  <option value="">Elige…</option>
                  {pasos
                    .filter((p) => p.id !== paso.id)
                    .map((p) => (
                      <option key={p.id} value={`${REF_PASO}${p.id}`}>
                        ←{" "}
                        {herramientaDe(p.herramienta)?.nombre ?? p.herramienta}
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
                  Los parámetros aparecen cuando se sepa qué capa entra. Si bebe
                  de otro paso, corre el modelo una vez.
                </p>
              )}

              {marcha?.error && (
                <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
                  {marcha.error}
                </p>
              )}
              {marcha?.aviso && (
                <p className="text-[11px] leading-snug text-[var(--gr-aviso)]">
                  {marcha.aviso}
                </p>
              )}

              <div className="flex flex-wrap gap-x-3 text-xs">
                {marcha?.capa && (
                  <button
                    type="button"
                    onClick={() => onGuardar(marcha.capa as Capa)}
                    className="text-[var(--gr-azul-500)] hover:underline"
                  >
                    Guardar en la mesa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onPasos(pasos.filter((p) => p.id !== paso.id));
                    setElegido(null);
                  }}
                  className="text-[var(--gr-error)] hover:underline"
                >
                  Quitar el paso
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
