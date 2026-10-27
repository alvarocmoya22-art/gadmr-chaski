/**
 * Las capas: la zona donde se sueltan los archivos y la lista de lo que hay.
 *
 * En la lista no se distingue entre lo cargado y lo calculado más que por una
 * marca, y es a propósito: un resultado es una capa como cualquier otra, con
 * su tabla, su exportación y su sitio en la siguiente herramienta. Lo que sí
 * lleva un resultado es su ficha —las cifras, la leyenda y cómo se obtuvo—,
 * porque sin eso nadie puede defenderlo en una mesa técnica.
 */
import { useMemo, useState } from "react";
import { CAPAS_MUNICIPIO, type CapaMunicipal } from "../lib/municipio";
import type { ReactNode } from "react";
import type { Capa } from "../lib/cargar";
import { descargar } from "../lib/exportar";
import { cifraLeyenda } from "../lib/medidas";
import { numero } from "../lib/format";
import {
  aplicar,
  comoFrase,
  filtraAlgo,
  valoresDe,
  type Filtro,
} from "../lib/filtro";
import { distintosDe, esNumerico, temaDe } from "../lib/estilo";
import type { Tema } from "../lib/medidas";

const FORMA: Record<Capa["forma"], string> = {
  punto: "puntos",
  linea: "líneas",
  poligono: "polígonos",
  mixta: "formas mezcladas",
};

interface Props {
  capas: Capa[];
  cargando: boolean;
  /** La recién calculada, que entra con la ficha abierta. */
  reciente: string | null;
  onArchivos: (archivos: FileList | File[]) => void;
  onEjemplo: () => void;
  onMunicipio: (entradas: CapaMunicipal[]) => void;
  /** El panel de la base institucional, que vive fuera pero se enseña aquí. */
  base?: ReactNode;
  onVisible: (id: string) => void;
  onQuitar: (id: string) => void;
  onEncuadrar: (id: string) => void;
  /** Pone o quita el filtro por tabla de una capa. `null` lo quita. */
  onFiltrar: (id: string, filtro: Filtro | null) => void;
  /** Pinta la capa por un campo. `null` la devuelve a su color plano. */
  onEstilo: (id: string, tema: Tema | null) => void;
  /** Cambia el color plano de la capa. */
  onColor: (id: string, color: string) => void;
  /** Cambia el grosor y la opacidad del trazo. */
  onTrazo: (id: string, trazo: { grosor: number; opacidad: number }) => void;
}

/** Un corte de la leyenda como se lee: «de 12 a 30». */
function tramos(cortes: number[]): string[] {
  const texto = cifraLeyenda;
  if (cortes.length === 0) return ["Todas las piezas"];
  const salida = [`hasta ${texto(cortes[0])}`];
  for (let i = 1; i < cortes.length; i++)
    salida.push(`${texto(cortes[i - 1])} a ${texto(cortes[i])}`);
  salida.push(`más de ${texto(cortes[cortes.length - 1])}`);
  return salida;
}

export default function PanelCapas({
  capas,
  cargando,
  reciente,
  onArchivos,
  onEjemplo,
  onMunicipio,
  base,
  onVisible,
  onQuitar,
  onEncuadrar,
  onFiltrar,
  onEstilo,
  onColor,
  onTrazo,
}: Props) {
  const [encima, setEncima] = useState(false);
  /** Qué tarjeta tiene abierto su panel de filtro. */
  const [filtrando, setFiltrando] = useState("");
  /** Qué tarjeta tiene abierto su panel de estilo. */
  const [pintando, setPintando] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          if (e.dataTransfer.files.length) onArchivos(e.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          encima
            ? "border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)]"
            : "border-[var(--gr-linea-fuerte)] hover:border-[var(--gr-azul-500)]"
        }`}
      >
        <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
          {cargando ? "Leyendo…" : "Suelta tus capas aquí"}
        </span>
        <span className="mt-1 block text-xs leading-snug text-[var(--gr-tinta-3)]">
          GeoJSON · shapefile en <code>.zip</code> · CSV con columnas de
          coordenadas.
          <br />
          Se leen en tu navegador: no se sube nada a ningún servidor.
        </span>
        <input
          type="file"
          multiple
          accept=".geojson,.json,.zip,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onArchivos(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {/*
        Las capas que el municipio ya publica.

        El visor de territorio las tiene preparadas y publicadas; aquí se leen
        de ahí en vivo, sin copiar un archivo ni pesar un mega en este
        repositorio. Es la forma barata de unir las dos mitades: el visor pone
        los datos de casa y CHASKI pone las herramientas.
      */}
      <div className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)]">
        <button
          type="button"
          onClick={() => setCatalogoAbierto((x) => !x)}
          className="flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left"
        >
          <span className="text-sm font-semibold text-[var(--gr-tinta)]">
            Capas del municipio
          </span>
          <span className="text-[11px] text-[var(--gr-tinta-3)]">
            {numero(CAPAS_MUNICIPIO.length)} {catalogoAbierto ? "▾" : "▸"}
          </span>
        </button>
        {catalogoAbierto && (
          <div className="space-y-1.5 border-t border-[var(--gr-linea)] p-2">
            <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              Se traen en vivo del visor de territorio. Marca las que necesites.
            </p>
            <ul className="space-y-1">
              {CAPAS_MUNICIPIO.map((c) => (
                <li key={c.archivo}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={elegidas.has(c.archivo)}
                      onChange={() =>
                        setElegidas((previas) => {
                          const siguiente = new Set(previas);
                          if (siguiente.has(c.archivo))
                            siguiente.delete(c.archivo);
                          else siguiente.add(c.archivo);
                          return siguiente;
                        })
                      }
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[var(--gr-tinta)]">
                        {c.nombre}
                        {c.pesada && (
                          <span className="ml-1 font-normal text-[var(--gr-aviso)]">
                            · {c.peso}, tarda
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                        {c.nota}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={cargando || elegidas.size === 0}
              onClick={() => {
                onMunicipio(
                  CAPAS_MUNICIPIO.filter((c) => elegidas.has(c.archivo)),
                );
                setElegidas(new Set());
              }}
              className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {cargando
                ? "Trayendo…"
                : elegidas.size === 0
                  ? "Marca alguna capa"
                  : `Traer ${numero(elegidas.size)} ${elegidas.size === 1 ? "capa" : "capas"}`}
            </button>
            <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              El catastro trae clave y superficie, nunca el nombre del
              propietario.
            </p>
          </div>
        )}
      </div>

      {base}

      {capas.length === 0 ? (
        <div className="space-y-2">
          {/*
            Probar sin tener que buscar un archivo primero.

            Una zona de arrastre vacía obliga a conseguir un shapefile antes de
            ver nada, y ahí se pierde a casi todo el mundo. Con cuatro capas
            reales de Riobamba a un clic, en diez segundos se puede correr un
            análisis de verdad y entender de qué va esto.
          */}
          <button
            type="button"
            onClick={onEjemplo}
            disabled={cargando}
            className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {cargando ? "Cargando…" : "Probar con el ejemplo de Riobamba"}
          </button>
          <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
            Equipamientos, plataformas, barrios y vialidad. Son datos reales y
            públicos: sirven para ver qué hace esto antes de traer los tuyos.
          </p>
          <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
            Un shapefile hay que soltarlo comprimido: el <code>.shp</code> solo,
            sin su <code>.dbf</code> y su <code>.prj</code>, no trae ni la tabla
            ni el sistema de coordenadas.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {capas.map((c) => {
            const fichaAbierta =
              abierta === c.id || (abierta === null && reciente === c.id);
            return (
              <li
                key={c.id}
                className={`rounded-md border bg-[var(--gr-superficie)] p-2 ${
                  reciente === c.id
                    ? "border-[var(--gr-azul-500)]"
                    : "border-[var(--gr-linea)]"
                }`}
              >
                {/* Apagada se ve apagada: con doce capas en la mesa, si la
                    tarjeta no cambia hay que ir leyendo una por una para
                    saber cuál se dejó de dibujar. */}
                <div
                  className={`flex items-start gap-2 ${c.visible ? "" : "opacity-45"}`}
                >
                  <button
                    type="button"
                    onClick={() => onVisible(c.id)}
                    title={c.visible ? "Apagar" : "Encender"}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border"
                    style={{
                      backgroundColor: c.visible ? c.color : "transparent",
                      borderColor: c.color,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--gr-tinta)]">
                      {c.derivada && (
                        <span
                          title="Calculada por una herramienta"
                          className="mr-1 text-[var(--gr-azul-500)]"
                        >
                          ƒ
                        </span>
                      )}
                      {c.nombre}
                    </p>
                    <p className="text-xs text-[var(--gr-tinta-3)]">
                      {/*
                        Con filtro puesto se dice «14 de 39», no «14».
                        El total es lo que deja saber que hay un recorte: un
                        numero a secas no se distingue de una capa pequeña, y
                        entonces el filtro se olvida y el informe sale mal.
                      */}
                      {filtraAlgo(c.filtro)
                        ? `${numero(aplicar(c.geo, c.filtro).features.length)} de ${numero(c.geo.features.length)}`
                        : numero(c.geo.features.length)}{" "}
                      {FORMA[c.forma]} · {c.campos.length}{" "}
                      {c.campos.length === 1 ? "campo" : "campos"}
                    </p>
                    {filtraAlgo(c.filtro) && (
                      <p className="text-[11px] leading-snug">
                        <span className="font-semibold text-[var(--gr-azul-500)]">
                          Filtrada
                        </span>
                        <span className="text-[var(--gr-tinta-3)]">
                          {` · ${comoFrase(c.filtro)}`}
                        </span>
                      </p>
                    )}
                    {/*
                      Que la capa trae fechas se dice aquí, sin que haya que
                      buscarlo: de eso depende que aparezca el eje temporal, y
                      quien la carga debería enterarse al mirarla.
                    */}
                    {c.fechas && c.fechas.length > 0 && (
                      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                        <span className="font-semibold text-[var(--gr-azul-500)]">
                          {c.fechas.length === 1
                            ? `Fechas en «${c.fechas[0].campo}»`
                            : `${numero(c.fechas.length)} columnas con fechas`}
                        </span>
                        {`: de ${c.fechas[0].desde.toISOString().slice(0, 10)} a ${c.fechas[0].hasta
                          .toISOString()
                          .slice(0, 10)}`}
                        {!c.fechas[0].seguro && " · día/mes asumido"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {/* Apagar la capa ya se podía pulsando el cuadro de color,
                      pero un cuadro de color se lee como una muestra, no como
                      un interruptor: nadie lo encontraba. Con su nombre al
                      lado de las demás acciones, se ve. */}
                  <button
                    type="button"
                    onClick={() => onVisible(c.id)}
                    className="text-[var(--gr-azul-500)] hover:underline"
                  >
                    {c.visible ? "Apagar" : "Encender"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbierta(fichaAbierta ? "" : c.id)}
                    className="text-[var(--gr-tinta-3)] underline decoration-dotted"
                  >
                    {fichaAbierta ? "Ocultar ficha" : "Ver ficha"}
                  </button>
                  {/* El filtro va AQUI, en la capa, y no en un panel aparte:
                      es una propiedad suya y se decide mirandola. */}
                  <button
                    type="button"
                    onClick={() =>
                      setFiltrando(filtrando === c.id ? "" : c.id)
                    }
                    className={
                      filtraAlgo(c.filtro)
                        ? "font-semibold text-[var(--gr-azul-500)] hover:underline"
                        : "text-[var(--gr-azul-500)] hover:underline"
                    }
                  >
                    {filtrando === c.id ? "Cerrar filtro" : "Filtrar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPintando(pintando === c.id ? "" : c.id)}
                    className={
                      c.tema
                        ? "font-semibold text-[var(--gr-azul-500)] hover:underline"
                        : "text-[var(--gr-azul-500)] hover:underline"
                    }
                  >
                    {pintando === c.id ? "Cerrar estilo" : "Estilo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEncuadrar(c.id)}
                    className="text-[var(--gr-azul-500)] hover:underline"
                  >
                    Encuadrar
                  </button>
                  <button
                    type="button"
                    onClick={() => descargar(c)}
                    className="text-[var(--gr-azul-500)] hover:underline"
                    title="Descargar como GeoJSON"
                  >
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuitar(c.id)}
                    className="text-[var(--gr-error)] hover:underline"
                  >
                    Quitar
                  </button>
                </div>

                {pintando === c.id && (
                  <CajaEstilo
                    capa={c}
                    onCambio={(x) => onEstilo(c.id, x)}
                    onColor={(hex) => onColor(c.id, hex)}
                    onTrazo={(x) => onTrazo(c.id, x)}
                  />
                )}

                {filtrando === c.id && (
                  <CajaFiltro
                    capa={c}
                    onCambio={(f) => onFiltrar(c.id, f)}
                  />
                )}

                {fichaAbierta && (
                  <div className="mt-1.5 space-y-1.5 border-t border-[var(--gr-linea)] pt-1.5">
                    {c.resumen && c.resumen.length > 0 && (
                      <table className="w-full text-xs">
                        <tbody>
                          {c.resumen.map((f) => (
                            <tr key={f.etiqueta} className="align-top">
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
                    )}

                    {c.tema && (
                      <ul className="space-y-0.5">
                        {c.tema.coincidencias
                          ? c.tema.coincidencias.map((m) => (
                              <li
                                key={m.valor}
                                className="flex items-center gap-1.5 text-[11px]"
                              >
                                <span
                                  className="h-2.5 w-4 shrink-0 rounded-sm"
                                  style={{ backgroundColor: m.color }}
                                />
                                <span className="text-[var(--gr-tinta-2)]">
                                  {m.rotulo}
                                </span>
                              </li>
                            ))
                          : tramos(c.tema.cortes ?? []).map((t, i) => (
                              <li
                                key={t}
                                className="flex items-center gap-1.5 text-[11px]"
                              >
                                <span
                                  className="h-2.5 w-4 shrink-0 rounded-sm"
                                  style={{
                                    backgroundColor: (c.tema?.colores ?? [])[i],
                                  }}
                                />
                                <span className="text-[var(--gr-tinta-2)]">
                                  {/* Sin tramos no hay escala, y poner la unidad al
                                      lado de «todas» solo sonaría raro. */}
                                  {(c.tema?.cortes ?? []).length === 0
                                    ? t
                                    : `${t} ${c.tema?.unidad}`}
                                </span>
                              </li>
                            ))}
                        {c.tema.notaVacio && (
                          <li className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                            {c.tema.notaVacio}
                          </li>
                        )}
                      </ul>
                    )}

                    {c.metodo && (
                      <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                        <span className="font-semibold">Cómo se obtuvo: </span>
                        {c.metodo}
                      </p>
                    )}

                    <details>
                      <summary className="cursor-pointer text-[11px] text-[var(--gr-tinta-3)]">
                        Campos de la tabla
                      </summary>
                      <table className="mt-1 w-full text-[11px]">
                        <tbody>
                          {c.campos.map((f) => (
                            <tr key={f.nombre} className="align-top">
                              <th className="w-1/3 py-0.5 pr-2 text-left font-semibold text-[var(--gr-tinta-2)]">
                                {f.nombre}
                              </th>
                              <td className="py-0.5 text-[var(--gr-tinta-3)]">
                                {numero(f.distintos)} distintos · p. ej.{" "}
                                {f.ejemplo || "—"}
                              </td>
                            </tr>
                          ))}
                          {c.campos.length === 0 && (
                            <tr>
                              <td className="text-[var(--gr-tinta-3)]">
                                La capa no trae tabla de atributos.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </details>

                    <p
                      className="truncate text-[11px] text-[var(--gr-tinta-3)]"
                      title={c.origen}
                    >
                      Origen: {c.origen}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * El filtro de una capa: un campo y los valores que se dejan pasar.
 *
 * Primero el campo, despues sus valores con cuantos registros tiene cada uno.
 * Esas cuentas son la mitad del valor de esto: antes de marcar nada ya se ve
 * de que hay mucho y de que hay poco, que es la primera pregunta que uno le
 * hace a una tabla que no conoce.
 *
 * Marcar es quedarse, no quitar. Con nada marcado no hay filtro y la capa
 * esta entera, que es lo que uno espera al abrir una caja vacia.
 */
function CajaFiltro({
  capa,
  onCambio,
}: {
  capa: Capa;
  onCambio: (f: Filtro | null) => void;
}) {
  const campos = capa.campos.map((x) => x.nombre);
  /*
   * Entra por el campo MAS filtrable, no por el primero de la tabla.
   *
   * El primero suele ser una superficie o un identificador: abrir el filtro
   * de la clasificacion del suelo y encontrarse 39 valores de `area_ha`, uno
   * por pieza, no invita a nada. El campo con menos valores distintos es casi
   * siempre el que reparte la capa en grupos —`clase`, `tipo`, `estado`—, que
   * es por donde se filtra de verdad.
   *
   * Con un solo valor no reparte nada, asi que esos van al final.
   */
  const porFiltrabilidad = [...capa.campos].sort((a, b) => {
    const util = (n: number) => (n > 1 ? 0 : 1);
    return util(a.distintos) - util(b.distintos) || a.distintos - b.distintos;
  });
  const [campo, setCampo] = useState(
    capa.filtro?.campo ?? porFiltrabilidad[0]?.nombre ?? "",
  );
  const todos = useMemo(
    () => (campo ? valoresDe(capa.geo, campo) : []),
    [capa.geo, campo],
  );
  /*
   * Un buscador en cuanto la lista deja de caber de un vistazo.
   *
   * Con los 197 nombres de barrio, marcar tres concretos era bajar por una
   * lista de doscientos a ojo. Doce es donde deja de verse entera sin hacer
   * esfuerzo; por debajo, el buscador estorba mas de lo que ayuda.
   */
  const [busca, setBusca] = useState("");
  const normal = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const valores = busca.trim()
    ? todos.filter((v) => normal(v.valor).includes(normal(busca.trim())))
    : todos;
  // Los marcados son los del filtro SOLO si es de este campo: al cambiar de
  // campo, los valores de antes no significan nada aqui.
  const marcados = new Set(
    capa.filtro?.campo === campo ? capa.filtro.valores : [],
  );

  const alternar = (v: string) => {
    const nuevos = new Set(marcados);
    if (nuevos.has(v)) nuevos.delete(v);
    else nuevos.add(v);
    onCambio(nuevos.size === 0 ? null : { campo, valores: [...nuevos] });
  };

  if (campos.length === 0) {
    return (
      <p className="mt-1.5 text-xs text-[var(--gr-tinta-3)]">
        Esta capa no trae tabla: no hay por donde filtrarla.
      </p>
    );
  }

  // Sobre TODOS los valores y no sobre los que deja ver la busqueda: lo que
  // queda en la capa no depende de lo que uno tenga escrito en el buscador.
  const quedan = marcados.size
    ? todos.filter((v) => marcados.has(v.valor)).reduce((s, v) => s + v.n, 0)
    : capa.geo.features.length;

  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-[var(--gr-linea)] p-1.5">
      <label className="block text-[11px] text-[var(--gr-tinta-3)]">
        Filtrar por
        <select
          value={campo}
          onChange={(e) => {
            setCampo(e.target.value);
            setBusca("");
            // Cambiar de campo deja la capa entera: arrastrar los valores del
            // campo anterior filtraria por algo que ya no se esta mirando.
            onCambio(null);
          }}
          className="mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1.5 py-1 text-xs text-[var(--gr-tinta)]"
        >
          {campos.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {todos.length > 12 && (
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar entre ${numero(todos.length)} valores`}
          className="w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1.5 py-1 text-xs text-[var(--gr-tinta)]"
        />
      )}

      {/* Lo ya marcado se dice aunque la busqueda lo haya dejado fuera de la
          lista: si no, uno busca «SANTA», ve ninguna marcada y cree que no
          hay filtro puesto. */}
      {marcados.size > 0 && valores.filter((v) => marcados.has(v.valor)).length <
        marcados.size && (
        <p className="text-[11px] text-[var(--gr-tinta-3)]">
          {`${numero(marcados.size)} marcados, algunos fuera de la búsqueda.`}
        </p>
      )}

      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        {valores.length === 0 && (
          <li className="text-xs text-[var(--gr-tinta-3)]">
            Ningún valor con ese texto.
          </li>
        )}
        {valores.map((v) => (
          <li key={v.valor}>
            <label className="flex items-center gap-1.5 text-xs text-[var(--gr-tinta-2)]">
              <input
                type="checkbox"
                checked={marcados.has(v.valor)}
                onChange={() => alternar(v.valor)}
              />
              <span className="flex-1 truncate" title={v.valor}>
                {v.valor}
              </span>
              <span className="text-[var(--gr-tinta-3)]">{numero(v.n)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[var(--gr-tinta-3)]">
          {marcados.size === 0
            ? "Sin filtro: la capa entera"
            : `Quedan ${numero(quedan)} de ${numero(capa.geo.features.length)}`}
        </span>
        {marcados.size > 0 && (
          <button
            type="button"
            onClick={() => onCambio(null)}
            className="text-[var(--gr-rojo-500)] hover:underline"
          >
            Quitar el filtro
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * El estilo de una capa: pintarla por uno de sus campos.
 *
 * Pone el mismo `Tema` que dejan las herramientas, asi que el mapa y la
 * leyenda lo entienden sin tocar nada mas.
 *
 * El modo —categorias o graduado— lo propone la capa mirando el campo, pero
 * se puede cambiar: hay columnas de numeros que son codigos y no cantidades
 * —una clave catastral, un año—, y pintarlas de claro a oscuro insinua un
 * «mas y menos» que no significa nada.
 */
function CajaEstilo({
  capa,
  onCambio,
  onColor,
  onTrazo,
}: {
  capa: Capa;
  onCambio: (t: Tema | null) => void;
  onColor: (hex: string) => void;
  onTrazo: (t: { grosor: number; opacidad: number }) => void;
}) {
  const campos = capa.campos.map((x) => x.nombre);
  const campo = capa.tema?.campo ?? "";
  const modo: "categorias" | "graduado" = capa.tema?.cortes
    ? "graduado"
    : "categorias";

  // Los mismos valores por omision que usa el mapa, para que el deslizador
  // arranque donde esta la capa y no en un sitio inventado.
  const trazo = capa.trazo ?? {
    grosor: 1,
    opacidad: capa.tema ? 0.62 : 0.18,
  };

  const elegirCampo = (n: string) => {
    if (!n) return onCambio(null);
    onCambio(temaDe(capa.geo, n));
  };

  if (campos.length === 0) {
    return (
      <p className="mt-1.5 text-xs text-[var(--gr-tinta-3)]">
        Esta capa no trae tabla: solo se puede pintar de un color.
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-[var(--gr-linea)] p-1.5">
      {/* El color plano se edita siempre, tenga tema o no: es el que llevan
          el borde del area y la capa cuando se le quita el tema. */}
      <label className="flex items-center gap-2 text-[11px] text-[var(--gr-tinta-3)]">
        <span>Color</span>
        <input
          type="color"
          value={capa.color}
          onChange={(e) => onColor(e.target.value)}
          className="h-5 w-8 cursor-pointer rounded border border-[var(--gr-linea)] bg-transparent p-0"
          title="El color de la capa"
        />
        <span className="gr-num">{capa.color}</span>
      </label>

      <label className="block text-[11px] text-[var(--gr-tinta-3)]">
        Pintar por
        <select
          value={campo}
          onChange={(e) => elegirCampo(e.target.value)}
          className="mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1.5 py-1 text-xs text-[var(--gr-tinta)]"
        >
          <option value="">Un solo color</option>
          {campos.map((n) => (
            <option key={n} value={n}>
              {n}
              {esNumerico(capa.geo, n)
                ? " · números"
                : ` · ${distintosDe(capa.geo, n)} valores`}
            </option>
          ))}
        </select>
      </label>

      {campo && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[var(--gr-tinta-3)]">Como</span>
          {(["categorias", "graduado"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onCambio(temaDe(capa.geo, campo, m))}
              className={
                modo === m
                  ? "font-semibold text-[var(--gr-azul-500)]"
                  : "text-[var(--gr-tinta-3)] hover:underline"
              }
            >
              {m === "categorias" ? "categorías" : "escala"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCambio(null)}
            className="ml-auto text-[var(--gr-rojo-500)] hover:underline"
          >
            Quitar el estilo
          </button>
        </div>
      )}

      {/* La leyenda, aqui mismo: un color que hay que ir a buscar a otra
          pestaña para saber que quiere decir no es una leyenda. */}
      {capa.tema?.coincidencias && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {capa.tema.coincidencias.map((m) => (
            <li
              key={String(m.valor)}
              className="flex items-center gap-1.5 text-xs text-[var(--gr-tinta-2)]"
            >
              {/* Cada categoria con su color editable: la paleta reparte una
                  primera version razonable, pero quien conoce el dato sabe
                  que «Salud» tiene que ser rojo. */}
              <input
                type="color"
                value={m.color}
                onChange={(e) =>
                  onCambio({
                    ...capa.tema!,
                    coincidencias: capa.tema!.coincidencias!.map((x) =>
                      x.valor === m.valor
                        ? { ...x, color: e.target.value }
                        : x,
                    ),
                  })
                }
                className="h-3.5 w-5 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                title={`El color de «${String(m.valor)}»`}
              />
              <span className="truncate">{m.rotulo}</span>
            </li>
          ))}
        </ul>
      )}
      {/* La escala tiene su leyenda igual que las categorias: elegir «escala»
          y no ver los tramos deja el color sin significado. */}
      {capa.tema?.cortes && (
        <ul className="space-y-0.5">
          {tramos(capa.tema.cortes).map((r, i) => (
            <li
              key={r}
              className="flex items-center gap-1.5 text-xs text-[var(--gr-tinta-2)]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: (capa.tema?.colores ?? [])[i] }}
              />
              <span className="truncate">{r}</span>
            </li>
          ))}
        </ul>
      )}
      {capa.tema?.notaVacio && (
        <p className="text-[11px] text-[var(--gr-tinta-3)]">
          {capa.tema.notaVacio}
        </p>
      )}

      {/* Grosor y opacidad, que hasta ahora eran numeros fijos del mapa: un
          catastro de cuarenta mil predios y una capa de tres zonas salian con
          el mismo borde, y en el primero eso es una mancha. */}
      <div className="space-y-1 border-t border-[var(--gr-linea)] pt-1.5">
        {(
          [
            ["grosor", "Grosor", 0.25, 4, 0.25, trazo.grosor],
            ["opacidad", "Opacidad", 0.05, 1, 0.05, trazo.opacidad],
          ] as const
        ).map(([clave, rotulo, min, max, paso, valor]) => (
          <label
            key={clave}
            className="flex items-center gap-2 text-[11px] text-[var(--gr-tinta-3)]"
          >
            <span className="w-14 shrink-0">{rotulo}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={paso}
              value={valor}
              onChange={(e) =>
                onTrazo({ ...trazo, [clave]: Number(e.target.value) })
              }
              className="flex-1"
            />
            <span className="gr-num w-8 text-right">
              {clave === "opacidad"
                ? `${Math.round(valor * 100)}%`
                : `${valor}×`}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
