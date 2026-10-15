/**
 * Las capas: la zona donde se sueltan los archivos y la lista de lo que hay.
 *
 * En la lista no se distingue entre lo cargado y lo calculado más que por una
 * marca, y es a propósito: un resultado es una capa como cualquier otra, con
 * su tabla, su exportación y su sitio en la siguiente herramienta. Lo que sí
 * lleva un resultado es su ficha —las cifras, la leyenda y cómo se obtuvo—,
 * porque sin eso nadie puede defenderlo en una mesa técnica.
 */
import { useState } from 'react'
import { CAPAS_MUNICIPIO, type CapaMunicipal } from '../lib/municipio'
import type { ReactNode } from 'react'
import type { Capa } from '../lib/cargar'
import { descargar } from '../lib/exportar'
import { cifraLeyenda } from '../lib/medidas'
import { numero } from '../lib/format'

const FORMA: Record<Capa['forma'], string> = {
  punto: 'puntos',
  linea: 'líneas',
  poligono: 'polígonos',
  mixta: 'formas mezcladas',
}

interface Props {
  capas: Capa[]
  cargando: boolean
  /** La recién calculada, que entra con la ficha abierta. */
  reciente: string | null
  onArchivos: (archivos: FileList | File[]) => void
  onEjemplo: () => void
  onMunicipio: (entradas: CapaMunicipal[]) => void
  /** El panel de la base institucional, que vive fuera pero se enseña aquí. */
  base?: ReactNode
  onVisible: (id: string) => void
  onQuitar: (id: string) => void
  onEncuadrar: (id: string) => void
}

/** Un corte de la leyenda como se lee: «de 12 a 30». */
function tramos(cortes: number[]): string[] {
  const texto = cifraLeyenda
  if (cortes.length === 0) return ['Todas las piezas']
  const salida = [`hasta ${texto(cortes[0])}`]
  for (let i = 1; i < cortes.length; i++) salida.push(`${texto(cortes[i - 1])} a ${texto(cortes[i])}`)
  salida.push(`más de ${texto(cortes[cortes.length - 1])}`)
  return salida
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
}: Props) {
  const [encima, setEncima] = useState(false)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [catalogoAbierto, setCatalogoAbierto] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  return (
    <section className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault()
          setEncima(false)
          if (e.dataTransfer.files.length) onArchivos(e.dataTransfer.files)
        }}
        className={`block cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          encima
            ? 'border-[var(--gr-azul-500)] bg-[var(--gr-azul-100)]'
            : 'border-[var(--gr-linea-fuerte)] hover:border-[var(--gr-azul-500)]'
        }`}
      >
        <span className="block text-sm font-semibold text-[var(--gr-tinta)]">
          {cargando ? 'Leyendo…' : 'Suelta tus capas aquí'}
        </span>
        <span className="mt-1 block text-xs leading-snug text-[var(--gr-tinta-3)]">
          GeoJSON · shapefile en <code>.zip</code> · CSV con columnas de coordenadas.
          <br />
          Se leen en tu navegador: no se sube nada a ningún servidor.
        </span>
        <input
          type="file"
          multiple
          accept=".geojson,.json,.zip,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onArchivos(e.target.files)
            e.target.value = ''
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
            {numero(CAPAS_MUNICIPIO.length)} {catalogoAbierto ? '▾' : '▸'}
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
                          const siguiente = new Set(previas)
                          if (siguiente.has(c.archivo)) siguiente.delete(c.archivo)
                          else siguiente.add(c.archivo)
                          return siguiente
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
                onMunicipio(CAPAS_MUNICIPIO.filter((c) => elegidas.has(c.archivo)))
                setElegidas(new Set())
              }}
              className="w-full rounded bg-[var(--gr-azul-500)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {cargando
                ? 'Trayendo…'
                : elegidas.size === 0
                  ? 'Marca alguna capa'
                  : `Traer ${numero(elegidas.size)} ${elegidas.size === 1 ? 'capa' : 'capas'}`}
            </button>
            <p className="text-[11px] leading-snug text-[var(--gr-tinta-3)]">
              El catastro trae clave y superficie, nunca el nombre del propietario.
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
            {cargando ? 'Cargando…' : 'Probar con el ejemplo de Riobamba'}
          </button>
          <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
            Equipamientos, plataformas, barrios y vialidad. Son datos reales y públicos:
            sirven para ver qué hace esto antes de traer los tuyos.
          </p>
          <p className="text-xs leading-relaxed text-[var(--gr-tinta-3)]">
            Un shapefile hay que soltarlo comprimido: el <code>.shp</code> solo, sin su{' '}
            <code>.dbf</code> y su <code>.prj</code>, no trae ni la tabla ni el sistema de
            coordenadas.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {capas.map((c) => {
            const fichaAbierta = abierta === c.id || (abierta === null && reciente === c.id)
            return (
              <li
                key={c.id}
                className={`rounded-md border bg-[var(--gr-superficie)] p-2 ${
                  reciente === c.id
                    ? 'border-[var(--gr-azul-500)]'
                    : 'border-[var(--gr-linea)]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => onVisible(c.id)}
                    title={c.visible ? 'Ocultar' : 'Mostrar'}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border"
                    style={{
                      backgroundColor: c.visible ? c.color : 'transparent',
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
                      {numero(c.geo.features.length)} {FORMA[c.forma]} · {c.campos.length}{' '}
                      {c.campos.length === 1 ? 'campo' : 'campos'}
                    </p>
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
                        {!c.fechas[0].seguro && ' · día/mes asumido'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setAbierta(fichaAbierta ? '' : c.id)}
                    className="text-[var(--gr-tinta-3)] underline decoration-dotted"
                  >
                    {fichaAbierta ? 'Ocultar ficha' : 'Ver ficha'}
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
                              <li key={m.valor} className="flex items-center gap-1.5 text-[11px]">
                                <span
                                  className="h-2.5 w-4 shrink-0 rounded-sm"
                                  style={{ backgroundColor: m.color }}
                                />
                                <span className="text-[var(--gr-tinta-2)]">{m.rotulo}</span>
                              </li>
                            ))
                          : tramos(c.tema.cortes ?? []).map((t, i) => (
                              <li key={t} className="flex items-center gap-1.5 text-[11px]">
                                <span
                                  className="h-2.5 w-4 shrink-0 rounded-sm"
                                  style={{ backgroundColor: (c.tema?.colores ?? [])[i] }}
                                />
                                <span className="text-[var(--gr-tinta-2)]">
                                  {/* Sin tramos no hay escala, y poner la unidad al
                                      lado de «todas» solo sonaría raro. */}
                                  {(c.tema?.cortes ?? []).length === 0 ? t : `${t} ${c.tema?.unidad}`}
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
                                {numero(f.distintos)} distintos · p. ej. {f.ejemplo || '—'}
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

                    <p className="truncate text-[11px] text-[var(--gr-tinta-3)]" title={c.origen}>
                      Origen: {c.origen}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
