/**
 * Accesibilidad: a qué distancia queda lo que la gente necesita.
 *
 * **Se mide en línea recta, no por la calle.** Es la diferencia honesta con
 * GOAT, que rutea sobre la red vial y el transporte público. La línea recta
 * siempre sale optimista —en Riobamba, con la trama en damero y el río y la
 * quebrada partiendo la ciudad, un equipamiento a 400 m de distancia recta
 * puede quedar a 700 m de caminata— y por eso cada resultado lo dice en su
 * ficha en vez de dejarlo entender.
 *
 * Aun así sirve, y mucho: para comparar barrios entre sí, para encontrar el
 * sector peor servido o para descartar lo que claramente no llega. Cuando haga
 * falta la cifra fina, el camino es traer la red vial e isócronas de verdad,
 * que el visor de territorio ya tiene resueltas.
 */
import { distanciaGeo, prepararZonas, zonaDe } from '../medidas'
import { piezasDe, recuadroDe } from '../ambito'
import { cajaDe, enPoligono, type Anillo } from '../geo'
import { planoLocal } from '../metrico'
import { numero } from '../format'
import {
  FILTRO,
  capaDe,
  capaDerivada,
  conCalculados,
  numeroDe,
  registrosDe,
  temaEscala,
  tituloDe,
  type Fila,
  type Herramienta,
  type PuntoAnalisis,
} from './tipos'
import { puntosDe } from '../ambito'

/** Tope de parejas que se calculan antes de rendirse con un aviso claro. */
const TOPE_PAREJAS = 40_000_000

/** La media de las distancias a los n destinos más cercanos. */
function alosMasCercanos(
  lon: number,
  lat: number,
  destinos: { lon: number; lat: number; etiqueta: string }[],
  cuantos: number,
): { media: number; primera: number; quien: string } | null {
  if (destinos.length === 0) return null
  const n = Math.min(cuantos, destinos.length)
  /*
   * Con pocos destinos ordenar entero es más barato que mantener un montículo,
   * y con muchos el coste lo manda el recorrido, no la ordenación. Así que se
   * calculan todas y se ordenan: menos código y ningún caso raro.
   */
  const ds = destinos.map((d) => ({ d: distanciaGeo(lon, lat, d.lon, d.lat), q: d.etiqueta }))
  ds.sort((a, b) => a.d - b.d)
  const tomados = ds.slice(0, n)
  return {
    media: tomados.reduce((s, x) => s + x.d, 0) / n,
    primera: tomados[0].d,
    quien: tomados[0].q,
  }
}

/** Los destinos de una capa, como puntos con una etiqueta. */
function destinosDe(
  capa: { geo: GeoJSON.FeatureCollection; nombre: string },
  campoEtiqueta: string | null,
): { lon: number; lat: number; etiqueta: string }[] {
  return puntosDe(capa as never, campoEtiqueta).map((p: PuntoAnalisis) => ({
    lon: p.lon,
    lat: p.lat,
    etiqueta: campoEtiqueta ? p.clase : capa.nombre,
  }))
}

export const ACCESIBILIDAD: Herramienta[] = [
  {
    clave: 'distancia-cercano',
    categoria: 'accesibilidad',
    nombre: 'Distancia al más cercano',
    nota: 'Para cada registro, a qué distancia tiene el equipamiento más próximo de otra capa, y cuál es.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    avisoRepresentante: true,
    parametros: [
      {
        tipo: 'capa',
        clave: 'destinos',
        rotulo: 'Hasta',
        formas: ['punto', 'linea', 'poligono', 'mixta'],
        nota: 'La capa de lo que se busca: escuelas, centros de salud, paradas.',
      },
      {
        tipo: 'numero',
        clave: 'cuantos',
        rotulo: 'Cuántos más cercanos',
        defecto: 1,
        min: 1,
        max: 20,
        paso: 1,
        nota: 'Con uno, la distancia al más próximo. Con tres, la media de los tres más próximos, que castiga a quien solo tiene uno cerca.',
      },
      {
        tipo: 'numero',
        clave: 'umbral',
        rotulo: 'Umbral aceptable',
        defecto: 500,
        min: 0,
        max: 20000,
        paso: 50,
        unidad: 'm',
        nota: 'Solo para la ficha: cuántos registros quedan por encima de esta distancia.',
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const capaDestinos = capaDe(ctx, 'destinos')
      if (!capaDestinos) return { error: 'Elige la capa de destinos.' }
      const origenes = registrosDe(ctx)
      if (origenes.length === 0) return { error: 'Con este filtro no entra ningún registro.' }
      const destinos = destinosDe(capaDestinos, null)
      if (destinos.length === 0) return { error: `«${capaDestinos.nombre}» no trae ningún punto.` }
      if (origenes.length * destinos.length > TOPE_PAREJAS) {
        return {
          error: `Son ${numero(origenes.length)} × ${numero(destinos.length)} parejas: demasiadas. Filtra alguna de las dos capas.`,
        }
      }

      const cuantos = Math.round(numeroDe(ctx, 'cuantos', 1))
      const umbral = numeroDe(ctx, 'umbral', 500)
      const campoSalida = cuantos === 1 ? 'dist_m' : `dist_media_${cuantos}_m`

      const rasgos: GeoJSON.Feature[] = []
      const distancias: number[] = []
      for (const o of origenes) {
        const r = alosMasCercanos(o.lon, o.lat, destinos, cuantos)
        if (!r) continue
        distancias.push(r.media)
        rasgos.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [o.lon, o.lat] },
          properties: conCalculados(o.props, {
            [campoSalida]: Math.round(r.media),
            dist_cercano_m: Math.round(r.primera),
          }),
        })
      }
      if (rasgos.length === 0) return { error: 'No se pudo medir ninguna distancia.' }

      const ordenadas = [...distancias].sort((a, b) => a - b)
      const mediana = ordenadas[Math.floor(ordenadas.length / 2)]
      const pasados = distancias.filter((d) => d > umbral).length
      const resumen: Fila[] = [
        { etiqueta: 'Registros medidos', valor: numero(rasgos.length) },
        { etiqueta: 'Distancia mediana', valor: `${numero(Math.round(mediana))} m` },
        {
          etiqueta: 'Media',
          valor: `${numero(Math.round(distancias.reduce((s, d) => s + d, 0) / distancias.length))} m`,
        },
        { etiqueta: 'La más lejana', valor: `${numero(Math.round(ordenadas[ordenadas.length - 1]))} m` },
        {
          etiqueta: `Por encima de ${numero(umbral)} m`,
          valor: `${numero(pasados)} · ${((pasados / distancias.length) * 100).toFixed(1).replace('.', ',')} %`,
        },
      ]

      const { nombre, origen } = tituloDe(ctx, 'Distancia al más cercano')
      return {
        capa: capaDerivada(nombre, `${origen}, hasta ${capaDestinos.nombre}`, {
          type: 'FeatureCollection',
          features: rasgos,
        }, {
          tema: temaEscala(
            rasgos.map((f) => Number(f.properties?.[campoSalida] ?? 0)),
            campoSalida,
            'm',
            'Sin color: registros sin distancia medible.',
          ),
          resumen,
          metodo: `Distancia en línea recta sobre el elipsoide, no por la calle: la cifra real caminando siempre es mayor, y en una trama cortada por el río o la quebrada bastante mayor. ${cuantos === 1 ? 'Se toma el destino más próximo.' : `Se promedian los ${numero(cuantos)} destinos más próximos.`} Medido contra ${numero(destinos.length)} destinos de ${capaDestinos.nombre}.`,
        }),
        puntos: origenes,
      }
    },
  },

  {
    clave: 'mapa-cercania',
    categoria: 'accesibilidad',
    nombre: 'Mapa de cercanía',
    nota: 'Una rejilla que pinta, en cada punto del territorio, a qué distancia queda lo más próximo. Para ver de un vistazo qué sectores quedan desatendidos.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    avisoRepresentante: true,
    parametros: [
      {
        tipo: 'capa',
        clave: 'ambito',
        rotulo: 'Ámbito',
        formas: ['poligono', 'mixta'],
        opcional: true,
        vacio: 'Recuadro de los registros',
        nota: 'La rejilla se recorta a esta capa. Sin ella se cubre el recuadro de los propios registros, que incluye suelo donde no hay ciudad.',
      },
      {
        tipo: 'numero',
        clave: 'celda',
        rotulo: 'Lado de celda',
        defecto: 150,
        min: 50,
        max: 1000,
        paso: 50,
        unidad: 'm',
        nota: 'Celdas más pequeñas dan un mapa más fino y tardan más.',
      },
      {
        tipo: 'numero',
        clave: 'cuantos',
        rotulo: 'Cuántos más cercanos',
        defecto: 1,
        min: 1,
        max: 10,
        paso: 1,
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const elegidos = registrosDe(ctx)
      if (elegidos.length === 0) return { error: 'Con este filtro no entra ningún registro.' }
      const capaAmbito = capaDe(ctx, 'ambito')
      const piezas: Anillo[][] = capaAmbito ? piezasDe(capaAmbito) : recuadroDe(elegidos)
      if (piezas.length === 0) return { error: `«${capaAmbito?.nombre}» no trae polígonos.` }

      const celda = numeroDe(ctx, 'celda', 150)
      const cuantos = Math.round(numeroDe(ctx, 'cuantos', 1))
      const destinos = elegidos.map((p) => ({ lon: p.lon, lat: p.lat, etiqueta: '' }))

      const caja = cajaDe(piezas.flat())
      const plano = planoLocal((caja[0] + caja[2]) / 2, (caja[1] + caja[3]) / 2)
      const [x0, y0] = plano.aMetros(caja[0], caja[1])
      const [x1, y1] = plano.aMetros(caja[2], caja[3])
      const columnas = Math.ceil((x1 - x0) / celda)
      const filas = Math.ceil((y1 - y0) / celda)
      if (columnas * filas > 120000) {
        return {
          error: `Con celdas de ${numero(celda)} m salen ${numero(columnas * filas)} celdas: usa un lado mayor o un ámbito más pequeño.`,
        }
      }
      if (columnas * filas * destinos.length > TOPE_PAREJAS) {
        return { error: 'Son demasiadas cuentas: sube el lado de celda o filtra los registros.' }
      }

      const rasgos: GeoJSON.Feature[] = []
      const valores: number[] = []
      for (let i = 0; i < columnas; i++) {
        for (let j = 0; j < filas; j++) {
          const cx = x0 + (i + 0.5) * celda
          const cy = y0 + (j + 0.5) * celda
          const [lon, lat] = plano.aGrados(cx, cy)
          if (!piezas.some((poly) => enPoligono(lon, lat, poly))) continue
          const r = alosMasCercanos(lon, lat, destinos, cuantos)
          if (!r) continue
          const [oeste, sur] = plano.aGrados(x0 + i * celda, y0 + j * celda)
          const [este, norte] = plano.aGrados(x0 + (i + 1) * celda, y0 + (j + 1) * celda)
          valores.push(r.media)
          rasgos.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [oeste, sur],
                  [este, sur],
                  [este, norte],
                  [oeste, norte],
                  [oeste, sur],
                ],
              ],
            },
            properties: { dist_m: Math.round(r.media) },
          })
        }
      }
      if (rasgos.length === 0) return { error: 'La rejilla no cayó dentro del ámbito.' }

      const ordenadas = [...valores].sort((a, b) => a - b)
      const resumen: Fila[] = [
        { etiqueta: 'Celdas', valor: numero(rasgos.length) },
        {
          etiqueta: 'Distancia mediana',
          valor: `${numero(Math.round(ordenadas[Math.floor(ordenadas.length / 2)]))} m`,
        },
        { etiqueta: 'La peor servida', valor: `${numero(Math.round(ordenadas[ordenadas.length - 1]))} m` },
      ]

      const { nombre, origen } = tituloDe(ctx, 'Mapa de cercanía')
      return {
        capa: capaDerivada(nombre, origen, { type: 'FeatureCollection', features: rasgos }, {
          tema: temaEscala(valores, 'dist_m', 'm', 'Sin color: celdas sin distancia medible.'),
          resumen,
          metodo: `Rejilla de ${numero(celda)} m recortada a ${capaAmbito ? capaAmbito.nombre : 'el recuadro de los registros'}. Cada celda guarda la distancia en línea recta desde su centro ${cuantos === 1 ? 'al registro más próximo' : `a los ${numero(cuantos)} más próximos, promediada`}. En línea recta, no por la calle: la caminata real siempre es mayor.`,
        }),
        puntos: elegidos,
      }
    },
  },
]

export { prepararZonas, zonaDe }
