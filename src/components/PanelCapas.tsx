/**
 * Las capas: la zona donde se sueltan los archivos y la lista de lo que hay.
 *
 * En la lista no se distingue entre lo cargado y lo calculado más que por una
 * marca, y es a propósito: un resultado es una capa como cualquier otra, con
 * su tabla, su exportación y su sitio en la siguiente herramienta. Lo que sí
 * lleva un resultado es su ficha —las cifras, la leyenda y cómo se obtuvo—,
 * porque sin eso nadie puede defenderlo en una mesa técnica.
 */
import { Fragment, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CAPAS_MUNICIPIO, type CapaMunicipal } from "../lib/municipio";
import type { ReactNode } from "react";
import type { Capa } from "../lib/cargar";
import { descargar } from "../lib/exportar";
import { cifraLeyenda } from "../lib/medidas";
import { numero } from "../lib/format";
import {
  aNumero,
  aplicar,
  comoFrase,
  enRango,
  esExpresion,
  esRango,
  filtraAlgo,
  perfilNumerico,
  SIGNO,
  valoresDe,
  type Filtro,
  type Operador,
} from "../lib/filtro";
import { compilar, NOMBRES_FUNCION } from "../lib/expresion";
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
  /** La capa que hace de zona ahora mismo, si alguna. */
  zonaId: string | null;
  /** Usa esta capa como zona, o la suelta si ya lo era. */
  onZona: (id: string | null) => void;
  /** El nuevo orden de la lista, que es el del dibujo en el mapa. */
  onOrden: (ids: string[]) => void;
  /** Mete la capa en una carpeta, o la saca con `null`. */
  onGrupo: (id: string, grupo: string | null) => void;
  /**
   * Solo la lista de capas, sin lo de traerlas.
   *
   * En Analizar y en Contar, la zona de soltar archivos, el catálogo del
   * municipio y las bases de datos son tres bloques que hay que pasar de
   * largo cada vez para llegar a lo que se va a usar. Son de Preparar y en
   * Preparar se quedan; aquí la lista sigue porque mientras se analiza hay
   * que ver qué capas hay, encenderlas y apagarlas.
   */
  compacto?: boolean;
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
  zonaId,
  onZona,
  onOrden,
  onGrupo,
  compacto = false,
}: Props) {
  const [encima, setEncima] = useState(false);
  /** Qué tarjeta tiene abierto su panel de filtro. */
  const [filtrando, setFiltrando] = useState("");
  /** Qué tarjeta tiene abierto su panel de estilo. */
  const [pintando, setPintando] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  /*
   * Que fila tiene el menu desplegado, y cuales traen la leyenda abierta.
   *
   * Las ocho acciones de una capa estaban escritas a la vista, en dos lineas
   * de enlaces por tarjeta. Con siete capas en la mesa eran cincuenta y seis
   * enlaces azules compitiendo por la atencion, y la lista dejaba de leerse
   * como una lista. Las que se usan a cada rato —encender y apagar— se quedan
   * fuera; el resto se recoge en el menu, que es lo que hace GOAT.
   */
  const [menu, setMenu] = useState("");
  const [leyendas, setLeyendas] = useState<Set<string>>(new Set());
  /*
   * Que capa se esta arrastrando y sobre cual esta el cursor.
   *
   * `encima` solo sirve para pintar la raya de donde va a caer. Sin esa raya
   * uno suelta a ciegas y acierta a la tercera, que en una lista de doce
   * capas es insufrible.
   */
  const [arrastrando, setArrastrando] = useState("");
  const [sobre, setSobre] = useState("");
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  /*
   * Que capa esta esperando nombre de carpeta nueva.
   *
   * Con `prompt()` serian dos lineas, pero esa ventana la bloquean algunos
   * navegadores dentro de un marco y encima tapa la lista que uno esta
   * mirando para decidir el nombre.
   */
  const [nombrando, setNombrando] = useState("");

  /** Los nombres de carpeta que ya existen, para ofrecerlos en el menu. */
  const grupos = useMemo(
    () => [...new Set(capas.map((c) => c.grupo).filter((g): g is string => !!g))],
    [capas],
  );

  /**
   * Suelta la capa arrastrada justo ANTES de `destino`.
   *
   * Y le pone el grupo del destino. Soltar una capa en medio de una carpeta y
   * que se quedara fuera de ella romperia la regla de que un grupo es un
   * tramo seguido: apareceria su rotulo dos veces, con una capa ajena en
   * medio.
   */
  const soltarSobre = (destino: string) => {
    setSobre("");
    const id = arrastrando;
    setArrastrando("");
    if (!id || id === destino) return;
    const dest = capas.find((c) => c.id === destino);
    const orden = capas.filter((c) => c.id !== id).map((c) => c.id);
    const i = orden.indexOf(destino);
    orden.splice(i === -1 ? orden.length : i, 0, id);
    const actual = capas.find((c) => c.id === id);
    if (actual && (actual.grupo ?? "") !== (dest?.grupo ?? "")) {
      onGrupo(id, dest?.grupo ?? null);
    }
    onOrden(orden);
  };

  /** Una linea del menu de la capa. Se cierra sola al elegir. */
  const opcion = (
    rotulo: string,
    alPulsar: () => void,
    activa: boolean,
    peligro = false,
  ) => (
    <button
      type="button"
      onClick={() => {
        alPulsar();
        setMenu("");
      }}
      className={`block w-full px-2.5 py-1 text-left text-xs hover:bg-[var(--gr-azul-100)] ${
        peligro
          ? "text-[var(--gr-error)]"
          : activa
            ? "font-semibold text-[var(--gr-azul-texto)]"
            : "text-[var(--gr-tinta-2)]"
      }`}
    >
      {rotulo}
      {/* Lo que ya esta puesto se dice con un punto, no solo con negrita:
          en una lista de siete lineas la negrita sola no salta. */}
      {activa && !peligro && <span className="float-right">•</span>}
    </button>
  );

  return (
    <section className="space-y-3">
      {!compacto && (
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
      )}

      {/*
        Las capas que el municipio ya publica.

        El visor de territorio las tiene preparadas y publicadas; aquí se leen
        de ahí en vivo, sin copiar un archivo ni pesar un mega en este
        repositorio. Es la forma barata de unir las dos mitades: el visor pone
        los datos de casa y CHASKI pone las herramientas.
      */}
      {!compacto && (
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
      )}

      {!compacto && base}

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
          {capas.map((c, i) => {
            const fichaAbierta =
              abierta === c.id || (abierta === null && reciente === c.id);
            /*
             * Un grupo abre cuando la capa anterior no era del mismo. Los
             * grupos no son un arbol: son tramos seguidos de esta lista, asi
             * que la cabecera se deduce al recorrerla y no hay que mantener
             * ninguna estructura aparte en sincronia con el orden.
             */
            const abreGrupo = !!c.grupo && capas[i - 1]?.grupo !== c.grupo;
            const oculta = !!c.grupo && plegados.has(c.grupo);
            const delGrupo = c.grupo
              ? capas.filter((x) => x.grupo === c.grupo)
              : [];
            return (
              <Fragment key={c.id}>
                {abreGrupo && c.grupo && (
                  <li
                    onDragOver={(e) => {
                      e.preventDefault();
                      setSobre(`grupo:${c.grupo}`);
                    }}
                    onDragLeave={() => setSobre("")}
                    onDrop={() => {
                      const id = arrastrando;
                      setSobre("");
                      setArrastrando("");
                      if (id) onGrupo(id, c.grupo ?? null);
                    }}
                    className={`flex items-center gap-1.5 rounded px-1 py-1 ${
                      sobre === `grupo:${c.grupo}`
                        ? "bg-[var(--gr-azul-100)] ring-1 ring-[var(--gr-azul-500)]"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setPlegados((s) => {
                          const n = new Set(s);
                          const g = c.grupo as string;
                          if (n.has(g)) n.delete(g);
                          else n.add(g);
                          return n;
                        })
                      }
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      title={
                        plegados.has(c.grupo)
                          ? "Desplegar la carpeta"
                          : "Plegar la carpeta"
                      }
                    >
                      <span className="w-3 shrink-0 text-[10px] text-[var(--gr-tinta-3)]">
                        {plegados.has(c.grupo) ? "▸" : "▾"}
                      </span>
                      <span className="text-[13px]">🗀</span>
                      <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--gr-tinta-2)]">
                        {c.grupo}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--gr-tinta-3)]">
                        {delGrupo.length}
                      </span>
                    </button>
                    {/* Apagar la carpeta entera: con ocho capas dentro,
                        apagarlas una por una son ocho clics y el mapa
                        parpadea otras tantas veces. */}
                    <button
                      type="button"
                      onClick={() => {
                        const encendidas = delGrupo.filter((x) => x.visible);
                        const apagarlas = encendidas.length > 0;
                        for (const x of delGrupo) {
                          if (x.visible === apagarlas) onVisible(x.id);
                        }
                      }}
                      title="Encender o apagar toda la carpeta"
                      className="shrink-0 rounded px-1 text-[12px] text-[var(--gr-tinta-3)] hover:bg-[var(--gr-azul-100)] hover:text-[var(--gr-tinta)]"
                    >
                      {delGrupo.some((x) => x.visible) ? "◉" : "○"}
                    </button>
                  </li>
                )}
                {!oculta && (
              <li
                draggable
                onDragStart={() => setArrastrando(c.id)}
                onDragEnd={() => {
                  setArrastrando("");
                  setSobre("");
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (arrastrando && arrastrando !== c.id) setSobre(c.id);
                }}
                onDragLeave={() => setSobre((v) => (v === c.id ? "" : v))}
                onDrop={() => soltarSobre(c.id)}
                className={`rounded-md border bg-[var(--gr-superficie)] p-2 ${
                  c.grupo ? "ml-3" : ""
                } ${arrastrando === c.id ? "opacity-40" : ""} ${
                  sobre === c.id
                    ? "border-t-2 border-t-[var(--gr-azul-500)]"
                    : ""
                } ${
                  reciente === c.id
                    ? "border-[var(--gr-azul-500)]"
                    : "border-[var(--gr-linea)]"
                }`}
              >
                {/* Apagada se ve apagada: con doce capas en la mesa, si la
                    tarjeta no cambia hay que ir leyendo una por una para
                    saber cuál se dejó de dibujar. */}
                <div
                  className={`flex items-start gap-1.5 ${c.visible ? "" : "opacity-45"}`}
                >
                  {/* El galon solo aparece si hay leyenda que desplegar: un
                      triangulo que no abre nada se pulsa una vez y nunca mas,
                      pero deja la duda de si la capa esta rota. */}
                  {c.tema ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLeyendas((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      title={leyendas.has(c.id) ? "Plegar la leyenda" : "Ver la leyenda"}
                      className="mt-0.5 w-3 shrink-0 text-[10px] leading-4 text-[var(--gr-tinta-3)] hover:text-[var(--gr-tinta)]"
                    >
                      {leyendas.has(c.id) ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="mt-0.5 w-3 shrink-0" />
                  )}
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-sm border"
                    style={{
                      backgroundColor: c.visible ? c.color : "transparent",
                      borderColor: c.color,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Con el ojo y el menu ocupando la derecha, un nombre
                        largo se corta. El titulo lo devuelve al pasar por
                        encima: «Oferta por habitante · Educacion» y «Oferta
                        por habitante · Salud» se cortan en el mismo sitio. */}
                    <p
                      title={c.nombre}
                      className="truncate text-sm font-semibold text-[var(--gr-tinta)]"
                    >
                      {c.derivada && (
                        <span
                          title="Calculada por una herramienta"
                          className="mr-1 text-[var(--gr-azul-texto)]"
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
                    {zonaId === c.id && (
                      <p className="text-[11px] leading-snug">
                        <span className="font-semibold text-[var(--gr-azul-texto)]">
                          Es la zona
                        </span>
                        <span className="text-[var(--gr-tinta-3)]">
                          {" · las demás capas se recortan a ésta"}
                        </span>
                      </p>
                    )}
                    {filtraAlgo(c.filtro) && (
                      <p className="text-[11px] leading-snug">
                        <span className="font-semibold text-[var(--gr-azul-texto)]">
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
                        <span className="font-semibold text-[var(--gr-azul-texto)]">
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

                  <button
                    type="button"
                    onClick={() => onVisible(c.id)}
                    title={c.visible ? "Apagar la capa" : "Encender la capa"}
                    aria-label={c.visible ? "Apagar la capa" : "Encender la capa"}
                    className="shrink-0 rounded px-1 text-[13px] leading-5 text-[var(--gr-tinta-3)] hover:bg-[var(--gr-azul-100)] hover:text-[var(--gr-tinta)]"
                  >
                    {c.visible ? "◉" : "○"}
                  </button>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setMenu(menu === c.id ? "" : c.id)}
                      title="Mas acciones"
                      aria-label="Mas acciones"
                      className="rounded px-1 text-[13px] leading-5 text-[var(--gr-tinta-3)] hover:bg-[var(--gr-azul-100)] hover:text-[var(--gr-tinta)]"
                    >
                      ⋮
                    </button>
                    {menu === c.id && (
                      <>
                        {/* Un telon invisible para cerrar al pulsar fuera. Sin
                            el, el menu se queda abierto mientras se usa otra
                            cosa y tapa la capa de abajo. */}
                        <button
                          type="button"
                          aria-label="Cerrar el menu"
                          onClick={() => setMenu("")}
                          className="fixed inset-0 z-40 cursor-default"
                        />
                        <div className="absolute right-0 top-6 z-50 w-48 overflow-hidden rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] py-1 text-left shadow-2xl">
                          {opcion("Ver ficha", () => setAbierta(fichaAbierta ? "" : c.id), fichaAbierta)}
                          {opcion("Filtrar", () => setFiltrando(filtrando === c.id ? "" : c.id), filtraAlgo(c.filtro))}
                          {opcion("Estilo", () => setPintando(pintando === c.id ? "" : c.id), !!c.tema)}
                          {(c.forma === "poligono" || c.forma === "mixta") &&
                            opcion(
                              zonaId === c.id ? "Dejar de ser zona" : "Usar como zona",
                              () => onZona(zonaId === c.id ? null : c.id),
                              zonaId === c.id,
                            )}
                          {opcion("Encuadrar", () => onEncuadrar(c.id), false)}
                          <div className="my-1 border-t border-[var(--gr-linea)]" />
                          {grupos
                            .filter((g) => g !== c.grupo)
                            .map((g) =>
                              <Fragment key={g}>
                                {opcion(`Mover a «${g}»`, () => onGrupo(c.id, g), false)}
                              </Fragment>,
                            )}
                          {opcion("Nueva carpeta…", () => setNombrando(c.id), false)}
                          {c.grupo &&
                            opcion("Sacar de la carpeta", () => onGrupo(c.id, null), false)}
                          <div className="my-1 border-t border-[var(--gr-linea)]" />
                          {opcion("Exportar a GeoJSON", () => descargar(c), false)}
                          {opcion("Quitar de la mesa", () => onQuitar(c.id), false, true)}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {nombrando === c.id && (
                  <form
                    className="mt-1.5 flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const campo = new FormData(e.currentTarget).get("g");
                      const g = String(campo ?? "").trim();
                      setNombrando("");
                      if (g) onGrupo(c.id, g);
                    }}
                  >
                    <input
                      name="g"
                      autoFocus
                      maxLength={40}
                      placeholder="Nombre de la carpeta"
                      className="min-w-0 flex-1 rounded border border-[var(--gr-linea)] bg-[var(--gr-fondo)] px-1.5 py-1 text-xs text-[var(--gr-tinta)]"
                    />
                    <button
                      type="submit"
                      className="rounded bg-[var(--gr-azul-500)] px-2 text-xs font-semibold text-white"
                    >
                      Crear
                    </button>
                    <button
                      type="button"
                      onClick={() => setNombrando("")}
                      className="rounded px-1 text-xs text-[var(--gr-tinta-3)]"
                    >
                      ✕
                    </button>
                  </form>
                )}

                {/*
                  LA LEYENDA, DENTRO DE LA FILA Y PLEGADA.
                  
                  Estaba solo en la ficha, asi que para saber que significaba
                  un color habia que abrir un panel aparte y volver. Es lo
                  primero que se mira de una capa pintada, y aqui se despliega
                  sin salir de la lista.
                */}
                {c.tema && leyendas.has(c.id) && (
                  <div className="mt-1 pl-[1.6rem]">
                    <Leyenda capa={c} />
                  </div>
                )}

                {/*
                  ESTILO, FILTRO Y FICHA SE VAN A LA DERECHA.
                  
                  Estaban los tres desplegandose DENTRO de la tarjeta de la
                  capa, en la columna de la izquierda. Eso empujaba hacia abajo
                  todas las capas siguientes, asi que abrir el estilo de la
                  primera escondia las otras seis; y la caja de filtro, que es
                  alta, dejaba la lista inservible mientras estaba abierta.
                  
                  En la derecha no empujan nada, caben enteras y se leen al
                  lado del mapa que estan cambiando, que es lo que uno mira
                  mientras toca un color o un tramo. Es la disposicion de GOAT
                  y la razon es esa, no el parecido.
                  
                  SE DIBUJA EN EL BODY, con un portal, y no donde esta
                  escrita. Dos motivos, y el segundo costo encontrarlo: el
                  panel de capas tiene `overflow-y-auto`, asi que un hijo suyo
                  se recortaria al llegar a su borde; y tiene `backdrop-blur`,
                  que convierte al panel en bloque contenedor de cualquier
                  descendiente `fixed`. Con eso, `right-3` no media desde la
                  ventana sino desde el panel, y la tarjeta aparecia pegada a
                  la izquierda, encima de la lista. El portal la saca del
                  arbol y las dos cosas dejan de pasar.
                  
                  Y por debajo de 1.000 px las dos tarjetas no caben a la vez
                  —23 rem la de capas mas 21 rem esta—, asi que ahi esta se
                  extiende de lado a lado y la tapa, que es lo que uno quiere
                  mientras ajusta un estilo en una ventana estrecha.
                */}
                {(pintando === c.id || filtrando === c.id || fichaAbierta) &&
                  createPortal(
                  <div className="fixed right-3 top-[4.2rem] z-30 flex max-h-[calc(100vh-5.5rem)] w-[21rem] flex-col overflow-hidden rounded-lg border border-[var(--gr-linea)] bg-[var(--gr-fondo)] shadow-2xl max-[1000px]:left-3 max-[1000px]:w-auto">
                    <div className="flex items-center gap-2 border-b border-[var(--gr-linea)] px-2.5 py-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate text-sm font-semibold text-[var(--gr-tinta)]">
                        {c.nombre}
                      </span>
                      <button
                        type="button"
                        aria-label="Cerrar"
                        onClick={() => {
                          setPintando("");
                          setFiltrando("");
                          setAbierta("");
                        }}
                        className="ml-auto rounded px-1 text-[var(--gr-tinta-3)] hover:bg-[var(--gr-azul-100)] hover:text-[var(--gr-tinta)]"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex border-b border-[var(--gr-linea)]">
                      {(
                        [
                          ["estilo", "Estilo"],
                          ["filtro", "Filtro"],
                          ["ficha", "Ficha"],
                        ] as const
                      ).map(([clave, rotulo]) => {
                        const activa =
                          clave === "estilo"
                            ? pintando === c.id
                            : clave === "filtro"
                              ? filtrando === c.id
                              : fichaAbierta;
                        return (
                          <button
                            key={clave}
                            type="button"
                            onClick={() => {
                              setPintando(clave === "estilo" ? c.id : "");
                              setFiltrando(clave === "filtro" ? c.id : "");
                              setAbierta(clave === "ficha" ? c.id : "");
                            }}
                            className={`flex-1 border-b-2 px-2 py-1.5 text-[11px] uppercase tracking-wide ${
                              activa
                                ? "border-[var(--gr-azul-500)] font-semibold text-[var(--gr-azul-texto)]"
                                : "border-transparent text-[var(--gr-tinta-3)] hover:text-[var(--gr-tinta)]"
                            }`}
                          >
                            {rotulo}
                          </button>
                        );
                      })}
                    </div>

                    <div className="overflow-y-auto p-2.5">
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
                  <div className="space-y-1.5">
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

                    {c.tema && <Leyenda capa={c} />}

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
                    </div>
                  </div>,
                  document.body,
                )}
              </li>
                )}
              </Fragment>
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

  /*
   * MARCAR VALORES NO SIRVE PARA UNA CIFRA.
   *
   * Pedir «predios de 1.000 m2 o mas» con una lista de casillas obliga a
   * marcar a mano cada superficie distinta que haya por encima: centenares.
   * Por eso, cuando el campo trae numeros, la caja ofrece tambien comparar.
   *
   * Y entra directamente en ese modo si ademas la lista es larga, que es
   * justo donde marcar no es una opcion. Con pocos valores distintos —un
   * codigo de uno a cinco, por ejemplo— la lista sigue siendo mejor: se ve de
   * que hay mucho y de que hay poco.
   */
  const perfil = useMemo(
    () => (campo ? perfilNumerico(capa.geo, campo) : null),
    [capa.geo, campo],
  );
  const cajaTexto = useRef<HTMLTextAreaElement | null>(null);
  const [texto, setTexto] = useState(() =>
    capa.filtro && esExpresion(capa.filtro) ? capa.filtro.expr : "",
  );
  const compilada = useMemo(
    () => (texto.trim() ? compilar(texto, campos) : null),
    [texto, campos],
  );
  const pasanExpr = useMemo(() => {
    if (!compilada?.ok) return null;
    return capa.geo.features.filter((f) => compilada.pasa(f.properties ?? {}))
      .length;
  }, [compilada, capa.geo]);

  const [modo, setModo] = useState<"lista" | "rango" | "expr">(() => {
    if (capa.filtro && esExpresion(capa.filtro)) return "expr";
    // La misma regla que al cambiar de campo, tambien al abrir: si no, la
    // caja se abria en la lista justo sobre el campo donde la lista no sirve.
    if (capa.filtro?.campo === campo) {
      return esRango(capa.filtro) ? "rango" : "lista";
    }
    const p = perfilNumerico(capa.geo, campo);
    const distintos = capa.campos.find((c) => c.nombre === campo)?.distintos ?? 0;
    return p.numerico && distintos > 12 ? "rango" : "lista";
  });
  const [op, setOp] = useState<Operador>(() =>
    capa.filtro && esRango(capa.filtro) ? capa.filtro.op : ">=",
  );
  // De texto y no de numero: mientras alguien borra una cifra para teclear
  // otra, el campo esta vacio, y un `number` vacio es NaN. Se guarda lo
  // tecleado y se convierte al usarlo.
  const [desde, setDesde] = useState(() =>
    capa.filtro && esRango(capa.filtro) ? String(capa.filtro.a) : "",
  );
  const [hasta, setHasta] = useState(() =>
    capa.filtro && esRango(capa.filtro) && capa.filtro.b !== undefined
      ? String(capa.filtro.b)
      : "",
  );
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
    capa.filtro?.campo === campo &&
    !esRango(capa.filtro) &&
    !esExpresion(capa.filtro)
      ? capa.filtro.valores
      : [],
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
  const rangoPedido = (): Filtro | null => {
    // Vacio NO es cero. `Number("")` da 0, asi que una casilla en blanco se
    // leia como «>= 0» y el boton ofrecia dejar las 3.757 de 3.757 filas: un
    // filtro que no filtra, presentado como si filtrara.
    const cifra = (s: string) =>
      s.trim() === "" ? NaN : Number(s.replace(",", "."));
    const x = cifra(desde);
    const y = cifra(hasta);
    if (!Number.isFinite(x)) return null;
    if (op === "entre" && !Number.isFinite(y)) return null;
    return { campo, op, a: x, ...(op === "entre" ? { b: y } : {}) };
  };
  const rango = modo === "rango" ? rangoPedido() : null;

  // Se cuenta recorriendo la capa y no sumando los de la lista: un tramo no
  // tiene lista que sumar, y el numero que se ensena tiene que salir del
  // mismo calculo que luego recorta de verdad.
  const quedan =
    modo === "expr"
      ? (pasanExpr ?? capa.geo.features.length)
      : modo === "rango"
      ? rango && esRango(rango)
        ? capa.geo.features.filter((f) =>
            enRango(aNumero(f.properties?.[campo]), rango),
          ).length
        : capa.geo.features.length
      : marcados.size
        ? todos.filter((v) => marcados.has(v.valor)).reduce((s, v) => s + v.n, 0)
        : capa.geo.features.length;

  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-[var(--gr-linea)] p-1.5">
      <label className="block text-[11px] text-[var(--gr-tinta-3)]">
        Filtrar por
        <select
          value={campo}
          onChange={(e) => {
            const nuevo = e.target.value;
            setCampo(nuevo);
            setBusca("");
            setDesde("");
            setHasta("");
            // El modo lo elige el campo, no lo que hubiera puesto antes: un
            // tramo heredado sobre un campo de texto no filtraria nada y
            // pareceria roto.
            const p = perfilNumerico(capa.geo, nuevo);
            const distintos =
              capa.campos.find((c) => c.nombre === nuevo)?.distintos ?? 0;
            setModo(p.numerico && distintos > 12 ? "rango" : "lista");
            // Y deja la capa entera: arrastrar los valores del campo anterior
            // filtraria por algo que ya no se esta mirando.
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

      {/* Las dos maneras de filtrar, y solo cuando las dos valen. Sobre un
          campo de texto no se ofrece comparar: «mayor que» sobre nombres de
          barrio es una pregunta sin respuesta. */}
      {/* El tercer modo se ofrece SIEMPRE: una expresion no depende de que el
          campo elegido traiga numeros, porque puede hablar de varios campos a
          la vez. Es justamente lo que los otros dos no saben hacer. */}
      <div className="flex gap-1">
          {(
            [
              ["lista", "Por valor"],
              ...(perfil?.numerico ? [["rango", "Por número"] as const] : []),
              ["expr", "Expresión"],
            ] as const
          ).map(([k, r]) => (
            <button
              key={k}
              type="button"
              aria-pressed={modo === k}
              onClick={() => {
                setModo(k);
                onCambio(null);
              }}
              className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                modo === k
                  ? "border-[var(--gr-azul-500)] bg-[var(--gr-azul-500)] text-white"
                  : "border-[var(--gr-linea)] text-[var(--gr-tinta-2)]"
              }`}
            >
              {r}
            </button>
          ))}
      </div>

      {modo === "expr" && (
        <div className="space-y-1.5">
          <textarea
            ref={cajaTexto}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'"area_m2" >= 10000 AND "area_m2" <= 15000'}
            className="w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1.5 py-1 font-mono text-[11px] text-[var(--gr-tinta)]"
          />

          {/* Los campos se pinchan en vez de teclearse: escribir mal un
              nombre es el error numero uno de cualquier editor de
              expresiones, y aqui no hay por que cometerlo. */}
          <div className="flex flex-wrap gap-1">
            {campos.slice(0, 14).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  const ta = cajaTexto.current;
                  const trozo = `"${n}"`;
                  if (!ta) return setTexto(texto + trozo);
                  const i = ta.selectionStart ?? texto.length;
                  const j = ta.selectionEnd ?? i;
                  setTexto(texto.slice(0, i) + trozo + texto.slice(j));
                  requestAnimationFrame(() => {
                    ta.focus();
                    ta.setSelectionRange(i + trozo.length, i + trozo.length);
                  });
                }}
                className="rounded border border-[var(--gr-linea)] px-1 py-0.5 font-mono text-[10px] text-[var(--gr-tinta-3)] hover:border-[var(--gr-azul-500)] hover:text-[var(--gr-azul-texto)]"
              >
                {n}
              </button>
            ))}
          </div>

          {compilada && !compilada.ok && (
            <p className="text-[11px] text-[var(--gr-rojo-500)]">
              {compilada.error}
              {` · columna ${compilada.desde + 1}`}
            </p>
          )}

          <button
            type="button"
            disabled={!compilada?.ok}
            onClick={() =>
              compilada?.ok && onCambio({ expr: texto.trim() })
            }
            className="w-full rounded border border-[var(--gr-azul-500)] px-1.5 py-1 text-[11px] text-[var(--gr-azul-texto)] disabled:opacity-40"
          >
            {compilada?.ok && pasanExpr !== null
              ? `Dejar ${numero(pasanExpr)} de ${numero(capa.geo.features.length)}`
              : texto.trim()
                ? "La expresión no se entiende"
                : "Escriba una condición"}
          </button>

          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            {`= <> < <= > >= · AND OR NOT · IN (…) · BETWEEN … AND … · LIKE '0601%' · IS NULL · + - * / · `}
            {NOMBRES_FUNCION.join(" ")}
            {". Un registro sin valor no pasa ninguna comparación: para buscarlos, IS NULL."}
          </p>
        </div>
      )}

      {modo === "rango" && perfil && (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            <select
              value={op}
              onChange={(e) => {
                const o = e.target.value as Operador;
                setOp(o);
                onCambio(null);
              }}
              className="rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1 py-1 text-xs text-[var(--gr-tinta)]"
            >
              {(Object.keys(SIGNO) as Operador[]).map((o) => (
                <option key={o} value={o}>
                  {SIGNO[o]}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="decimal"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              placeholder={numero(Math.round(perfil.min))}
              className="w-full min-w-0 rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1.5 py-1 text-xs text-[var(--gr-tinta)]"
            />
            {op === "entre" && (
              <input
                type="number"
                inputMode="decimal"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                placeholder={numero(Math.round(perfil.max))}
                className="w-full min-w-0 rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-1.5 py-1 text-xs text-[var(--gr-tinta)]"
              />
            )}
          </div>

          <button
            type="button"
            disabled={!rango}
            onClick={() => rango && onCambio(rango)}
            className="w-full rounded border border-[var(--gr-azul-500)] px-1.5 py-1 text-[11px] text-[var(--gr-azul-texto)] disabled:opacity-40"
          >
            {rango
              ? `Dejar ${numero(quedan)} de ${numero(capa.geo.features.length)}`
              : "Escriba una cifra"}
          </button>

          {/* De cuanto a cuanto va el campo: sin esto uno teclea 1000 sobre
              un campo que no pasa de 40 y se queda con la capa vacia sin
              entender por que. */}
          <p className="text-[11px] text-[var(--gr-tinta-3)]">
            {`${campo} va de ${numero(perfil.min)} a ${numero(perfil.max)}.`}
            {perfil.sinNumero > 0 &&
              ` ${numero(perfil.sinNumero)} ${
                perfil.sinNumero === 1
                  ? "fila no trae un número y queda fuera"
                  : "filas no traen un número y quedan fuera"
              }.`}
          </p>
        </div>
      )}

      {modo === "lista" && todos.length > 12 && (
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
      {modo === "lista" &&
        marcados.size > 0 &&
        valores.filter((v) => marcados.has(v.valor)).length <
          marcados.size && (
        <p className="text-[11px] text-[var(--gr-tinta-3)]">
          {`${numero(marcados.size)} marcados, algunos fuera de la búsqueda.`}
        </p>
      )}

      {modo === "lista" && (
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
      )}

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[var(--gr-tinta-3)]">
          {filtraAlgo(capa.filtro) &&
          (esExpresion(capa.filtro) || capa.filtro.campo === campo)
            ? `Quedan ${numero(quedan)} de ${numero(capa.geo.features.length)}`
            : "Sin filtro: la capa entera"}
        </span>
        {filtraAlgo(capa.filtro) && (
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
                  ? "font-semibold text-[var(--gr-azul-texto)]"
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


/**
 * La leyenda de una capa pintada: un color y lo que significa.
 *
 * Vive aparte porque se dibuja en dos sitios —plegada dentro de la fila de la
 * capa y entera en la ficha— y una leyenda que dijera dos cosas distintas
 * segun donde se mire seria peor que no tenerla.
 */
function Leyenda({ capa: c }: { capa: Capa }) {
  if (!c.tema) return null;
  return (
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
  );
}
