/**
 * Las bases: conexiones con nombre y las tablas que publican.
 *
 * La ficha tiene la misma forma que la de QGIS —nombre, anfitrión, puerto— y
 * por la misma razón: una conexión se escribe una vez y después se elige de la
 * lista. Lo que no tiene es usuario ni contraseña, y eso se dice aquí mismo:
 * la credencial de la base vive en el servicio que publica las tablas, no en
 * el navegador.
 */
import { useState } from 'react'
import { CONEXION_NUEVA, queFalta, urlDe, type Conexion } from '../lib/conexiones'
import type { Coleccion } from '../lib/ogc'
import { numero } from '../lib/format'

type Ficha = Omit<Conexion, 'guardadaEn'>

interface Props {
  conexiones: Conexion[]
  elegida: string
  onElegir: (nombre: string) => void
  onGuardar: (c: Ficha) => void
  onOlvidar: (nombre: string) => void
  colecciones: Coleccion[]
  conectando: boolean
  trayendo: string | null
  avance: string | null
  error: string | null
  onConectar: () => void
  onTraer: (c: Coleccion) => void
  /** La clave del servicio, si lo pide. No se guarda. */
  clave: string
  onClave: (v: string) => void
}

const campo =
  'mt-0.5 w-full rounded border border-[var(--gr-linea)] bg-[var(--gr-superficie)] px-2 py-1 text-sm text-[var(--gr-tinta)]'
const rotulo = 'text-xs font-semibold text-[var(--gr-tinta-2)]'

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
  const [abierto, setAbierto] = useState(false)
  const [ficha, setFicha] = useState<Ficha | null>(null)

  const actual = conexiones.find((c) => c.nombre === elegida) ?? null
  const falta = ficha ? queFalta(ficha) : null

  const editar = (c: Conexion | null) =>
    setFicha(c ? { ...c } : { ...CONEXION_NUEVA })

  return (
    <div className="rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)]">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        className="flex w-full items-baseline justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="text-sm font-semibold text-[var(--gr-tinta)]">Bases de datos</span>
        <span className="text-[11px] text-[var(--gr-tinta-3)]">
          {conexiones.length > 0 ? `${numero(conexiones.length)} ` : ''}
          {abierto ? '▾' : '▸'}
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
                  {conexiones.map((c) => (
                    <option key={c.nombre} value={c.nombre}>
                      {c.nombre}
                    </option>
                  ))}
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
                    No se guarda: se vuelve a pedir la próxima vez. Dejarla escrita en el
                    navegador la deja a mano de cualquiera que se siente en este equipo.
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
                  {conectando ? 'Mirando…' : 'Ver tablas'}
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
                    <button
                      type="button"
                      onClick={() => onOlvidar(actual.nombre)}
                      className="rounded px-2 py-1.5 text-sm text-[var(--gr-error)]"
                    >
                      Borrar
                    </button>
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
                  onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })}
                  placeholder="base_grafica"
                  className={campo}
                />
              </label>
              <label className="block">
                <span className={rotulo}>Anfitrión</span>
                <input
                  value={ficha.anfitrion}
                  onChange={(e) => setFicha({ ...ficha, anfitrion: e.target.value })}
                  placeholder="localhost"
                  className={campo}
                />
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  El equipo donde corre <strong>el servicio que publica las tablas</strong>, que
                  normalmente no es el de la base. Si lo corres en tu propia máquina, es{' '}
                  <code>localhost</code>.
                </span>
              </label>
              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className={rotulo}>Puerto del servicio</span>
                  <input
                    type="number"
                    value={ficha.puerto}
                    onChange={(e) =>
                      setFicha({ ...ficha, puerto: Number.parseInt(e.target.value, 10) })
                    }
                    className={campo}
                  />
                </label>
                <label className="block flex-1">
                  <span className={rotulo}>Ruta (opcional)</span>
                  <input
                    value={ficha.ruta}
                    onChange={(e) => setFicha({ ...ficha, ruta: e.target.value })}
                    placeholder="/featureserv"
                    className={campo}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--gr-tinta-2)]">
                <input
                  type="checkbox"
                  checked={ficha.seguro}
                  onChange={(e) => setFicha({ ...ficha, seguro: e.target.checked })}
                />
                El servicio va por https
              </label>

              <label className="block">
                <span className={rotulo}>Base de datos</span>
                <input
                  value={ficha.baseDatos}
                  onChange={(e) => setFicha({ ...ficha, baseDatos: e.target.value })}
                  placeholder="riobamba"
                  className={campo}
                />
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  Solo para reconocer la conexión: no se envía. Cuál es la base lo decide el
                  servicio en su configuración.
                </span>
              </label>

              <label className="block">
                <span className={rotulo}>Usuario del servicio (opcional)</span>
                <input
                  value={ficha.usuario}
                  onChange={(e) => setFicha({ ...ficha, usuario: e.target.value })}
                  autoComplete="off"
                  className={campo}
                />
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                  Solo si alguien puso una puerta delante del servicio.{' '}
                  <strong>No es el usuario de PostgreSQL</strong>: ese va en la configuración
                  del servicio, no aquí.
                </span>
              </label>

              <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                Quedaría en <code>{urlDe(ficha) || '—'}</code>
              </p>

              {/*
                Por qué no hay usuario ni contraseña, dicho donde se busca.
              */}
              <p className="rounded border border-[var(--gr-linea)] bg-[var(--gr-azul-100)] p-1.5 text-[11px] leading-snug text-[var(--gr-tinta-2)]">
                Aquí no van usuario ni contraseña. Un navegador no puede hablar con
                PostgreSQL, así que esto se conecta al servicio que publica las tablas por
                HTTP; la credencial de la base vive en ese servicio y nunca llega al
                navegador.
              </p>

              {falta && (
                <p className="text-[11px] leading-snug text-[var(--gr-aviso)]">{falta}</p>
              )}

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onGuardar(ficha)
                    setFicha(null)
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

          {avance && <p className="text-[11px] leading-snug text-[var(--gr-tinta-2)]">{avance}</p>}

          {colecciones.length > 0 && !ficha && (
            <>
              <p className={rotulo}>Tablas publicadas</p>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {colecciones.map((c) => (
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
                            {' '}
                            · trayendo…
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] leading-snug text-[var(--gr-tinta-3)]">
                        {c.registros !== null && `${numero(c.registros)} registros · `}
                        {c.descripcion || c.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
            Solo lectura. Se ve lo que el servicio publique: el nombre del propietario del
            catastro no debe estar entre esas tablas.
          </p>
        </div>
      )}
    </div>
  )
}
