/**
 * El mapa de CHASKI.
 *
 * Aquí no hay capas conocidas de antemano: se dibuja lo que haya en la lista,
 * venga de un archivo o de una herramienta. Al cambiar la lista se quitan
 * todas las capas de datos y se vuelven a poner en orden. Reconstruir parece
 * derrochador y no lo es a esta escala, y evita el error que de verdad cuesta
 * encontrar: una capa que queda por encima o por debajo de donde debía según
 * el orden en que se cargó.
 *
 * **El orden no es el de la lista, es el de la geometría**: primero todos los
 * rellenos, luego todas las líneas y al final todos los puntos. Una mancha de
 * análisis es siempre más grande que un punto, así que si se respetara el
 * orden de la lista, el resultado de la última herramienta taparía justo los
 * registros que lo explican.
 */
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  MAPAS_BASE,
  MAPA_BASE_INICIAL,
  capaDe,
  capaRotulosDe,
} from '../config/mapasBase'
import type { Capa } from '../lib/cargar'
import type { PuntoAnalisis } from '../lib/ambito'

/** Riobamba, que es para donde se hace esto. */
const CENTRO: [number, number] = [-78.6483, -1.6635]
const ZOOM = 12.5

interface Props {
  capas: Capa[]
  /** Los registros con los que se calculó lo último, para que se vean. */
  puntos: PuntoAnalisis[]
  /** El ámbito que se usó, dibujado como contorno. */
  ambito: GeoJSON.FeatureCollection | null
  mapaBase: string
  onMapaBase: (clave: string) => void
  /** Encuadrar aquí cuando entra una capa nueva. */
  encuadre: [number, number, number, number] | null
  /** Se rellena con la función que saca la foto de la vista, para la lámina. */
  capturaRef?: { current: (() => Promise<Captura | null>) | null }
}

/** Lo que hace falta para montar una lámina: la imagen y su escala. */
export interface Captura {
  /** PNG en base64. */
  imagen: string
  ancho: number
  alto: number
  /** Metros que mide la barra de escala, y su largo en píxeles de la imagen. */
  escalaM: number
  escalaPx: number
  /** Giro del norte, en grados. */
  rumbo: number
}

const FUENTE = (id: string) => `datos-${id}`

/** El color de una capa: plano, o por el tema que dejó la herramienta. */
function pintura(capa: Capa): unknown {
  const t = capa.tema
  if (!t) return capa.color
  if (t.coincidencias) {
    const trozos: (string | number)[] = []
    for (const m of t.coincidencias) trozos.push(m.valor, m.color)
    // Lo que no coincide con ningún grado se deja transparente: no es que
    // valga cero, es que no hay nada que decir de esa celda.
    return ['match', ['get', t.campo], ...trozos, 'rgba(0,0,0,0)']
  }
  const colores = t.colores ?? []
  const cortes = t.cortes ?? []
  if (cortes.length === 0) return colores[0] ?? capa.color
  const expr: unknown[] = ['step', ['get', t.campo], colores[0]]
  cortes.forEach((corte, i) => expr.push(corte, colores[i + 1] ?? colores[colores.length - 1]))
  return expr
}

/** Cuánto se transparenta un relleno: el temático pesa, el plano acompaña. */
const opacidad = (capa: Capa) => (capa.tema ? 0.62 : 0.18)

/** Solo las piezas de esta forma; una capa mixta trae de todo en una fuente. */
const soloPoligonos: maplibregl.FilterSpecification = [
  'match',
  ['geometry-type'],
  ['Polygon', 'MultiPolygon'],
  true,
  false,
]
const soloLineas: maplibregl.FilterSpecification = [
  'match',
  ['geometry-type'],
  ['LineString', 'MultiLineString'],
  true,
  false,
]
const soloPuntos: maplibregl.FilterSpecification = [
  'match',
  ['geometry-type'],
  ['Point', 'MultiPoint'],
  true,
  false,
]

export default function Mapa({
  capas,
  puntos,
  ambito,
  mapaBase,
  onMapaBase,
  encuadre,
  capturaRef,
}: Props) {
  const div = useRef<HTMLDivElement>(null)
  const mapa = useRef<maplibregl.Map | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    if (!div.current || mapa.current) return
    const m = new maplibregl.Map({
      container: div.current,
      center: CENTRO,
      zoom: ZOOM,
      attributionControl: { compact: true },
      /*
       * Sin esto, leer el lienzo devuelve una imagen en blanco: WebGL descarta
       * lo dibujado en cuanto termina de pintar. Cuesta algo de memoria y es
       * lo que permite que la lámina lleve el mapa de verdad y no una captura
       * que alguien tenga que pegar a mano.
       */
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sources: Object.fromEntries(
          MAPAS_BASE.flatMap((b) => {
            const entradas: [string, maplibregl.RasterSourceSpecification][] = [
              [
                capaDe(b.clave),
                {
                  type: 'raster',
                  tiles: b.teselas,
                  tileSize: 256,
                  maxzoom: b.maxzoom,
                  attribution: b.atribucion,
                },
              ],
            ]
            if (b.rotulos) {
              entradas.push([
                capaRotulosDe(b.clave),
                { type: 'raster', tiles: b.rotulos, tileSize: 256, maxzoom: b.maxzoom },
              ])
            }
            return entradas
          }),
        ),
        layers: MAPAS_BASE.flatMap((b) => {
          const visible = b.clave === MAPA_BASE_INICIAL
          const capasBase: maplibregl.RasterLayerSpecification[] = [
            {
              id: capaDe(b.clave),
              type: 'raster',
              source: capaDe(b.clave),
              layout: { visibility: visible ? 'visible' : 'none' },
            },
          ]
          if (b.rotulos) {
            capasBase.push({
              id: capaRotulosDe(b.clave),
              type: 'raster',
              source: capaRotulosDe(b.clave),
              layout: { visibility: visible ? 'visible' : 'none' },
            })
          }
          return capasBase
        }),
      },
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.on('load', () => setListo(true))
    mapa.current = m

    if (capturaRef) {
      /*
       * La foto se saca cuando el mapa está quieto, no cuando se pide.
       *
       * Leer el lienzo mientras todavía está dibujando devuelve una hoja en
       * blanco, y la lámina sale sin mapa sin avisar de nada. Así que se pide
       * un repintado, se espera al «idle» de MapLibre —que es cuando ya no
       * queda nada por dibujar ni tesela por llegar— y recién ahí se lee. El
       * plazo de seguridad está por si el mapa ya estaba quieto y el evento no
       * vuelve a dispararse.
       */
      /**
       * Si el lienzo está en blanco, mejor decirlo que imprimir un recuadro vacío.
       *
       * MapLibre dibuja dentro del bucle de animación del navegador, y ese
       * bucle se detiene cuando la ventana está oculta o minimizada. Si la
       * lámina se pide en ese momento, lo que se lee es un lienzo vacío. Sin
       * esta comprobación, la hoja sale con un cuadro blanco donde debía ir el
       * mapa y nadie se entera hasta que está impresa.
       */
      const pareceVacio = (lienzo: HTMLCanvasElement): boolean => {
        try {
          const aux = document.createElement('canvas')
          aux.width = 60
          aux.height = 45
          const ctx = aux.getContext('2d')
          if (!ctx) return false
          ctx.drawImage(lienzo, 0, 0, aux.width, aux.height)
          const datos = ctx.getImageData(0, 0, aux.width, aux.height).data
          let conColor = 0
          for (let i = 0; i < datos.length; i += 4) {
            if (datos[i + 3] === 0) continue
            if (datos[i] > 245 && datos[i + 1] > 245 && datos[i + 2] > 245) continue
            conColor++
          }
          return conColor < (aux.width * aux.height) / 100
        } catch {
          return false
        }
      }

      const leer = (): Captura | null => {
        try {
          const lienzo = m.getCanvas()
          if (pareceVacio(lienzo)) return null
          /*
           * La barra de escala se calcula aquí y no se copia de la que enseña
           * MapLibre: esa vive en el DOM, fuera del lienzo, así que no sale en
           * la imagen. Se toman los metros por píxel en el centro y se busca
           * una distancia redonda que ocupe alrededor de un quinto del ancho.
           */
          const centro = m.getCenter()
          const metrosPorPixel =
            (156543.03392 * Math.cos((centro.lat * Math.PI) / 180)) / Math.pow(2, m.getZoom())
          const objetivo = (lienzo.width / 5) * metrosPorPixel
          const magnitud = Math.pow(10, Math.floor(Math.log10(objetivo)))
          const redondo = [1, 2, 5, 10]
            .map((x) => x * magnitud)
            .reduce((mejor, x) => (Math.abs(x - objetivo) < Math.abs(mejor - objetivo) ? x : mejor))
          return {
            imagen: lienzo.toDataURL('image/png'),
            ancho: lienzo.width,
            alto: lienzo.height,
            escalaM: redondo,
            escalaPx: redondo / metrosPorPixel,
            rumbo: m.getBearing(),
          }
        } catch {
          // Un lienzo manchado por una tesela sin CORS no se puede leer.
          return null
        }
      }

      capturaRef.current = () =>
        new Promise((resolver) => {
          let hecho = false
          const sacar = () => {
            if (hecho) return
            hecho = true
            resolver(leer())
          }
          /*
           * Nada de `requestAnimationFrame` aquí: con la ventana en segundo
           * plano el navegador deja de dar cuadros y la promesa no se
           * resolvería nunca, dejando la lámina sin abrir y sin explicación.
           * Un plazo corto después del «idle» cumple lo mismo y siempre corre.
           */
          m.once('idle', () => setTimeout(sacar, 60))
          m.triggerRepaint()
          setTimeout(sacar, 2500)
        })
    }
    /*
     * Asa para depurar, solo en desarrollo.
     *
     * Sirve para comprobar desde la consola qué se está dibujando de verdad
     * —`chaski.getStyle().layers`— sin tener que añadir trazas al código. En
     * producción no se expone nada.
     */
    if (import.meta.env.DEV) {
      ;(window as unknown as { chaski?: maplibregl.Map }).chaski = m
    }
    return () => {
      m.remove()
      mapa.current = null
    }
  }, [])

  /* El mapa base: están todos declarados y solo se alterna la visibilidad. */
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    for (const b of MAPAS_BASE) {
      const v = b.clave === mapaBase ? 'visible' : 'none'
      m.setLayoutProperty(capaDe(b.clave), 'visibility', v)
      if (b.rotulos) m.setLayoutProperty(capaRotulosDe(b.clave), 'visibility', v)
    }
  }, [mapaBase, listo])

  /* Las capas de datos. */
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return

    // Fuera todo lo que no sea mapa base, para volver a ponerlo en orden.
    for (const capa of m.getStyle().layers ?? []) {
      if (!capa.id.startsWith('base-')) m.removeLayer(capa.id)
    }
    for (const id of Object.keys(m.getStyle().sources ?? {})) {
      if (!id.startsWith('base-')) m.removeSource(id)
    }

    // Dentro de cada pasada, la primera de la lista manda: se recorre al revés
    // para que acabe dibujándose encima de las demás.
    const alReves = capas.filter((c) => c.visible).reverse()

    for (const capa of alReves) {
      m.addSource(FUENTE(capa.id), { type: 'geojson', data: capa.geo })
    }

    for (const capa of alReves) {
      if (capa.forma !== 'poligono' && capa.forma !== 'mixta') continue
      const fuente = FUENTE(capa.id)
      m.addLayer({
        id: `${fuente}-relleno`,
        type: 'fill',
        source: fuente,
        filter: soloPoligonos,
        paint: {
          'fill-color': pintura(capa) as string,
          'fill-opacity': opacidad(capa),
        },
      })
      m.addLayer({
        id: `${fuente}-borde`,
        type: 'line',
        source: fuente,
        filter: soloPoligonos,
        paint: {
          'line-color': capa.tema ? 'rgba(255,255,255,0.35)' : capa.color,
          'line-width': capa.tema ? 0.6 : 1.1,
        },
      })
    }

    if (ambito) {
      m.addSource('ambito', { type: 'geojson', data: ambito })
      m.addLayer({
        id: 'ambito-borde',
        type: 'line',
        source: 'ambito',
        paint: {
          'line-color': '#9fb0bd',
          'line-width': 1.2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.8,
        },
      })
    }

    for (const capa of alReves) {
      if (capa.forma !== 'linea' && capa.forma !== 'mixta') continue
      const fuente = FUENTE(capa.id)
      m.addLayer({
        id: `${fuente}-linea`,
        type: 'line',
        source: fuente,
        filter: soloLineas,
        paint: { 'line-color': pintura(capa) as string, 'line-width': 1.6 },
      })
    }

    for (const capa of alReves) {
      if (capa.forma !== 'punto' && capa.forma !== 'mixta') continue
      const fuente = FUENTE(capa.id)
      m.addLayer({
        id: `${fuente}-punto`,
        type: 'circle',
        source: fuente,
        filter: soloPuntos,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6],
          'circle-color': pintura(capa) as string,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': 'rgba(255,255,255,0.75)',
        },
      })
    }

    /*
     * Los registros del último cálculo, encima de todo.
     *
     * Enseñar con qué se calculó no es un extra: un resultado sin los puntos a
     * la vista no se puede discutir con nadie, y lo primero que pregunta quien
     * lo mira es cuáles son.
     */
    if (puntos.length > 0) {
      m.addSource('analisis-puntos', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: puntos.map((p) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
            properties: { clase: p.clase },
          })),
        },
      })
      m.addLayer({
        id: 'analisis-puntos',
        type: 'circle',
        source: 'analisis-puntos',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 4.5],
          'circle-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#0f1922',
        },
      })
    }
  }, [capas, puntos, ambito, listo])

  /* La ficha del registro, al hacer clic. */
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    const alClic = (e: maplibregl.MapMouseEvent) => {
      const ids = (m.getStyle().layers ?? [])
        .map((c) => c.id)
        .filter((id) => id.startsWith('datos-'))
      if (ids.length === 0) return
      const f = m.queryRenderedFeatures(e.point, { layers: ids })[0]
      if (!f) return
      const capa = capas.find((c) => FUENTE(c.id) === f.source)
      const filas = Object.entries(f.properties ?? {})
        .filter(([, v]) => v !== null && v !== '' && v !== undefined)
        .slice(0, 16)
        .map(
          ([k, v]) =>
            `<tr><th class="ficha-k">${k}</th><td class="ficha-v">${String(v).slice(0, 80)}</td></tr>`,
        )
        .join('')
      new maplibregl.Popup({ maxWidth: '340px', closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="ficha"><div class="ficha-t">${capa?.nombre ?? 'Registro'}</div><table>${
            filas || '<tr><td>Sin atributos</td></tr>'
          }</table></div>`,
        )
        .addTo(m)
    }
    m.on('click', alClic)
    return () => {
      m.off('click', alClic)
    }
  }, [capas, listo])

  /* Encuadrar cuando entra una capa. */
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo || !encuadre) return
    const [oeste, sur, este, norte] = encuadre
    m.fitBounds([oeste, sur, este, norte], { padding: 60, duration: 700, maxZoom: 17 })
  }, [encuadre, listo])

  const base = MAPAS_BASE.find((b) => b.clave === mapaBase)

  return (
    <div className="relative h-full w-full">
      <div ref={div} className="h-full w-full" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1 rounded-md border border-[var(--gr-linea)] bg-[var(--gr-superficie)] p-1 shadow-sm">
        {MAPAS_BASE.map((b) => (
          <button
            key={b.clave}
            type="button"
            onClick={() => onMapaBase(b.clave)}
            title={b.nota}
            className={`rounded px-2 py-1 text-xs ${
              b.clave === mapaBase
                ? 'bg-[var(--gr-azul-500)] font-semibold text-white'
                : 'text-[var(--gr-tinta-2)] hover:bg-[var(--gr-azul-100)]'
            }`}
          >
            {b.rotulo}
          </button>
        ))}
      </div>
      {base && (
        <p className="pointer-events-none absolute bottom-10 left-3 max-w-xs text-[11px] leading-snug text-[var(--gr-tinta-3)]">
          {base.nota}
        </p>
      )}
    </div>
  )
}
