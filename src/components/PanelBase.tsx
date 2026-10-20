/**
 * Las bases: conexiones con nombre y las tablas que publican.
 *
 * La ficha tiene la misma forma que la de QGIS —nombre, anfitrión, puerto— y
 * por la misma razón: una conexión se escribe una vez y después se elige de la
 * lista. Lo que no tiene es usuario ni contraseña, y eso se dice aquí mismo:
 * la credencial de la base vive en el servicio que publica las tablas, no en
 * el navegador.
 */
import { useMemo, useState } from "react";
import {
  CONEXIONES_SUGERIDAS,
  CONEXION_NUEVA,
  esSugerida,
  queFalta,
  urlDe,
  type Conexion,
} from "../lib/conexiones";
import type { Coleccion } from "../lib/ogc";
import { numero } from "../lib/format";

type Ficha = Omit<Conexion, "guardadaEn">;

interface Props {
  conexiones: Conexion[];
  elegida: string;
  onElegir: (nombre: string) => void;
  onGuardar: (c: Ficha) => void;
  onOlvidar: (nombre: string) => void;
  colecciones: Coleccion[];
  conectando: boolean;
  trayendo: string | null;
  avance: string | null;
  error: string | null;
  onConectar: () => void;
  onTraer: (c: Coleccion) => void;
  /** La clave del servicio, si lo pide. No se guarda. */
  clave: string;
  onClave: (v: string) => void;
}

const campo =
  "mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]";
const rotulo = "text-xs font-semibold text-[var(--gr-tinta-2)]";

export default function PanelBase({
  conexiones,
  elegida,
  onElegir,
  onGuardar,
  onOlvidar,
  colecciones,
  conectando,
  trayendo,
  avance,
  error,
  onConectar,
  onTraer,
  clave,
  onClave,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [busqueda, setBusqueda] = useState("");

  /*
   * Las tablas que casan con lo que se escribe.
   *
   * Busca en el nombre, en el identificador y en la descripción, porque los
   * nombres de la base no se parecen a como se llaman las cosas: quien busca
   * «riesgo» tiene que encontrar `gis_zona_riesgos_prel_a_gir`, y quien busca
   * «calles» tiene que encontrar también `gis_ejesviales_l_phdu`. Sin tildes
   * ni mayúsculas: nadie escribe «clasificación» con tilde en un buscador.
   */
  const filtradas = useMemo(() => {
    const limpiar = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const q = limpiar(busqueda.trim());
    if (q === "") return colecciones;
    const partes = q.split(/\s+/);
    return colecciones.filter((c) => {
      /*
       * El esquema y la descripción automática fuera del texto que se busca.
       *
       * El identificador viene como `public.gis_x` y la descripción que manda
       * pg_featureserv es «Data for table public.gis_x»: puro ruido repetido
       * en las sesenta y dos. Y hace daño, porque «public» es prefijo de
       * «publicidad» y buscar esa palabra devolvía la lista entera.
       */
      const propio = (s: string) => s.replace(/\bpublic\./g, " ");
      const descripcion = /^Data for table /i.test(c.descripcion)
        ? ""
        : c.descripcion;
      const heno = limpiar(propio(`${c.titulo} ${c.id} ${descripcion}`));
      const trozos = heno.split(/[^a-z0-9]+/);
      return partes.every(
        (p) =>
          heno.includes(p) ||
          /*
           * Y al revés: que la palabra de la tabla empiece lo que se escribió.
           *
           * Los nombres de la base vienen recortados —`gis_clasifica_a_phdu`,
           * `gis_habilit_a_phdu`— y quien busca escribe la palabra entera.
           * Sin esto, «clasificación» no encontraba la clasificación del
           * suelo, que es exactamente lo que uno teclea.
           */
          (p.length >= 4 &&
            trozos.some((x) => x.length >= 4 && p.startsWith(x))),
      );
    });
  }, [colecciones, busqueda]);

  /*
   * La elegida puede ser de las guardadas o de las que vienen puestas.
   *
   * Buscar solo entre las guardadas dejaba el boton «Ver tablas» muerto al
   * elegir una sugerida: no habia error ni explicacion, simplemente no pasaba
   * nada al pulsar.
   */
  const actual =
    conexiones.find((c) => c.nombre === elegida) ??
    CONEXIONES_SUGERIDAS.find((c) => c.nombre === elegida) ??
    null;
  const falta = ficha ? queFalta(ficha) : null;

  const editar = (c: Conexion | null) =>
    setFicha(c ? { ...c } : { ...CONEXION_NUEVA });

  return (
    <div className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)]">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        className="flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="text-sm font-semibold text-[var(--gr-tinta)]">
          Bases de datos
        </span>
        <span className="text-[11px] text-[var(--gr-tinta-3)]">
          {conexiones.length > 0 ? `${numero(conexiones.length)} ` : ""}
          {abierto ? "▾" : "▸"}
        </span>
      </button>

      {abierto && (
        <div className="space-y-2 border-t border-[var(--gr-linea)] p-2">
          {!ficha && (
            <>
              <label className="block">
                <span className={rotulo}>Conexión</span>
                <select
                  value={elegida}
                  onChange={(e) => onElegir(e.target.value)}
                  className={campo}
                >
                  <option value="">Elige una conexión…</option>
                  {conexiones.length > 0 && (
                    <optgroup label="Tuyas">
                      {conexiones.map((c) => (
                        <option key={c.nombre} value={c.nombre}>
                          {c.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Ya puestas">
                    {CONEXIONES_SUGERIDAS.filter(
                      (s) => !conexiones.some((c) => c.nombre === s.nombre),
                    ).map((c) => (
                      <option key={c.nombre} value={c.nombre}>
                        {c.nombre}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              {actual && (
                <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  {urlDe(actual)}
                  {actual.baseDatos && ` · base ${actual.baseDatos}`}
                </p>
              )}

              {actual?.usuario && (
                <label className="block">
                  <span className={rotulo}>Clave de {actual.usuario}</span>
                  <input
                    type="password"
                    value={clave}
                    onChange={(e) => onClave(e.target.value)}
                    autoComplete="off"
                    className={campo}
                  />
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                    No se guarda: se vuelve a pedir la próxima vez. Dejarla
                    escrita en el navegador la deja a mano de cualquiera que se
                    siente en este equipo.
                  </span>
                </label>
              )}

              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={onConectar}
                  disabled={conectando || !actual}
                  className="flex-1 rounded bg-[var(--gr-azul-500)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {conectando ? "Mirando…" : "Ver tablas"}
                </button>
                <button
                  type="button"
                  onClick={() => editar(null)}
                  className="rounded border border-[var(--gr-linea-fuerte)] px-2 py-1.5 text-sm text-[var(--gr-tinta-2)]"
                >
                  Nueva
                </button>
                {actual && (
                  <>
                    <button
                      type="button"
                      onClick={() => editar(actual)}
                      className="rounded border border-[var(--gr-linea-fuerte)] px-2 py-1.5 text-sm text-[var(--gr-tinta-2)]"
                    >
                      Editar
                    </button>
                    {!esSugerida(actual.nombre) && (
                      <button
                        type="button"
                        onClick={() => onOlvidar(actual.nombre)}
                        className="rounded px-2 py-1.5 text-sm text-[var(--gr-error)]"
                      >
                        Borrar
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {ficha && (
            <div className="space-y-2 rounded border border-[var(--gr-azul-500)] p-2">
              <label className="block">
                <span className={rotulo}>Nombre</span>
                <input
                  value={ficha.nombre}
                  onChange={(e) =>
                    setFicha({ ...ficha, nombre: e.target.value })
                  }
                  placeholder="base_grafica"
                  className={campo}
                />
              </label>
              <label className="block">
                <span className={rotulo}>Anfitrión</span>
                <input
                  value={ficha.anfitrion}
                  onChange={(e) =>
                    setFicha({ ...ficha, anfitrion: e.target.value })
                  }
                  placeholder="localhost"
                  className={campo}
                />
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  El equipo donde corre{" "}
                  <strong>el servicio que publica las tablas</strong>, que
                  normalmente no es el de la base. Si lo corres en tu propia
                  máquina, es <code>localhost</code>.
                </span>
              </label>
              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className={rotulo}>Puerto del servicio</span>
                  <input
                    type="number"
                    value={ficha.puerto}
                    onChange={(e) =>
                      setFicha({
                        ...ficha,
                        puerto: Number.parseInt(e.target.value, 10),
                      })
                    }
                    className={campo}
                  />
                </label>
                <label className="block flex-1">
                  <span className={rotulo}>Ruta (opcional)</span>
                  <input
                    value={ficha.ruta}
                    onChange={(e) =>
                      setFicha({ ...ficha, ruta: e.target.value })
                    }
                    placeholder="/featureserv"
                    className={campo}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--gr-tinta-2)]">
                <input
                  type="checkbox"
                  checked={ficha.seguro}
                  onChange={(e) =>
                    setFicha({ ...ficha, seguro: e.target.checked })
                  }
                />
                El servicio va por https
              </label>

              <label className="block">
                <span className={rotulo}>Base de datos</span>
                <input
                  value={ficha.baseDatos}
                  onChange={(e) =>
                    setFicha({ ...ficha, baseDatos: e.target.value })
                  }
                  placeholder="riobamba"
                  className={campo}
                />
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  Solo para reconocer la conexión: no se envía. Cuál es la base
                  lo decide el servicio en su configuración.
                </span>
              </label>

              <label className="block">
                <span className={rotulo}>Usuario del servicio (opcional)</span>
                <input
                  value={ficha.usuario}
                  onChange={(e) =>
                    setFicha({ ...ficha, usuario: e.target.value })
                  }
                  autoComplete="off"
                  className={campo}
                />
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  Solo si alguien puso una puerta delante del servicio.{" "}
                  <strong>No es el usuario de PostgreSQL</strong>: ese va en la
                  configuración del servicio, no aquí.
                </span>
              </label>

              <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                Quedaría en <code>{urlDe(ficha) || "—"}</code>
              </p>

              {/*
                Por qué no hay usuario ni contraseña, dicho donde se busca.
              */}
              <p className="rounded border border-[var(--gr-linea)] bg-[var(--gr-azul-100)] p-1.5 text-[11px] leading-snug text-[var(--gr-tinta-2)]">
                Aquí no van usuario ni contraseña. Un navegador no puede hablar
                con PostgreSQL, así que esto se conecta al servicio que publica
                las tablas por HTTP; la credencial de la base vive en ese
                servicio y nunca llega al navegador.
              </p>

              {falta && (
                <p className="text-[11px] leading-snug text-[var(--gr-aviso)]">
                  {falta}
                </p>
              )}

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onGuardar(ficha);
                    setFicha(null);
                  }}
                  disabled={falta !== null}
                  className="flex-1 rounded bg-[var(--gr-azul-500)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setFicha(null)}
                  className="rounded border border-[var(--gr-linea-fuerte)] px-2 py-1.5 text-sm text-[var(--gr-tinta-2)]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded border border-[var(--gr-error)] px-2 py-1 text-[11px] leading-snug text-[var(--gr-error)]">
              {error}
            </p>
          )}

          {avance && (
            <p className="text-[11px] leading-snug text-[var(--gr-tinta-2)]">
              {avance}
            </p>
          )}

          {colecciones.length > 0 && !ficha && (
            <>
              <p className={rotulo}>
                Tablas publicadas
                {busqueda.trim() !== "" && (
                  <span className="font-normal text-[var(--gr-tinta-3)]">
                    {" "}
                    · {numero(filtradas.length)} de {numero(colecciones.length)}
                  </span>
                )}
              </p>
              {/* Con sesenta y dos tablas, una lista sin buscador es un
                  cajón: se encuentra lo que ya se sabe que está. */}
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar tabla: vialidad, catastro, riesgo…"
                className={campo}
              />
              {filtradas.length === 0 ? (
                <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  Ninguna de las {numero(colecciones.length)} tablas publicadas
                  dice «{busqueda.trim()}».
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {filtradas.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onTraer(c)}
                        disabled={trayendo !== null}
                        className="w-full rounded border border-transparent p-1.5 text-left hover:border-[var(--gr-linea-fuerte)] disabled:opacity-50"
                      >
                        <span className="block text-xs font-semibold text-[var(--gr-tinta)]">
                          {c.titulo}
                          {trayendo === c.id && (
                            <span className="font-normal text-[var(--gr-azul-500)]">
                              {" "}
                              · trayendo…
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                          {c.registros !== null &&
                            `${numero(c.registros)} registros · `}
                          {c.descripcion || c.id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Solo lectura: CHASKI no escribe en la base. Se ve lo que el servicio
            publique; si ahí va el catastro con el nombre del propietario, ese
            servicio tiene que pedir clave.
          </p>
        </div>
      )}
    </div>
  );
}
