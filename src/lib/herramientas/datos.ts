/**
 * Datos: juntar capas y traer campos de una a otra.
 *
 * Es el grupo menos vistoso y el que más tiempo ahorra. La mitad del trabajo
 * de un municipio es cruzar una tabla con otra —el listado de la dirección con
 * la capa del catastro, el padrón con los barrios— y hasta ahora eso se hacía
 * a mano en Excel, con los errores que eso trae.
 */
import { enPoligono } from '../geo'
import { prepararZonas, zonaDe } from '../medidas'
import { aNumero, resumir, ESTADISTICOS, necesitaCampo, type Estadistico } from '../estadistica'
import { puntosDe } from '../ambito'
import { numero } from '../format'
import {
  capaDe,
  capaDerivada,
  conCalculados,
  type Fila,
  type Herramienta,
} from './tipos'

export const DATOS: Herramienta[] = [
  {
    clave: 'unir-campos',
    categoria: 'datos',
    nombre: 'Unir campos',
    nota: 'Trae los campos de otra capa a esta, emparejando por un campo con el mismo valor o por ubicación.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    parametros: [
      {
        tipo: 'capa',
        clave: 'otra',
        rotulo: 'Traer campos de',
        formas: ['punto', 'linea', 'poligono', 'mixta'],
      },
      {
        tipo: 'opcion',
        clave: 'modo',
        rotulo: 'Emparejar',
        opciones: [
          { valor: 'campo', rotulo: 'Por campo', nota: 'mismo valor en las dos' },
          { valor: 'ubicacion', rotulo: 'Por ubicación', nota: 'cae dentro del polígono' },
        ],
      },
      {
        tipo: 'campo',
        clave: 'campoA',
        rotulo: 'Campo de esta capa',
        opcional: true,
        vacio: 'Solo para «Por campo»',
      },
      {
        tipo: 'campo',
        clave: 'campoB',
        rotulo: 'Campo de la otra',
        opcional: true,
        vacio: 'Solo para «Por campo»',
        deCapa: 'otra',
      },
    ],
    correr(ctx) {
      const otra = capaDe(ctx, 'otra')
      if (!otra) return { error: 'Elige la capa de la que traer los campos.' }
      const modo = ctx.valores.modo || 'campo'

      const rasgos: GeoJSON.Feature[] = []
      let emparejados = 0

      if (modo === 'ubicacion') {
        const zonas = prepararZonas(otra.geo)
        if (zonas.length === 0) {
          return { error: `Para emparejar por ubicación, «${otra.nombre}» tiene que traer polígonos.` }
        }
        const puntos = puntosDe(ctx.capa, null)
        if (puntos.length !== ctx.capa.geo.features.length) {
          // Puede haber registros sin geometría usable; se recorre por puntos.
        }
        for (let i = 0; i < puntos.length; i++) {
          const p = puntos[i]
          const z = zonaDe(zonas, p.lon, p.lat)
          const extra: Record<string, unknown> = {}
          if (z) {
            emparejados++
            for (const [k, v] of Object.entries(z.props)) extra[`b_${k}`] = v
          }
          const original = ctx.capa.geo.features[i]
          rasgos.push({
            type: 'Feature',
            geometry: original?.geometry ?? { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: { ...p.props, ...extra },
          })
        }
      } else {
        const campoA = ctx.valores.campoA
        const campoB = ctx.valores.campoB
        if (!campoA || !campoB) return { error: 'Elige el campo de cada capa que se tiene que emparejar.' }
        const indice = new Map<string, Record<string, unknown>>()
        for (const f of otra.geo.features) {
          const v = (f.properties ?? {})[campoB]
          if (v === null || v === undefined || v === '') continue
          const clave = String(v).trim().toLowerCase()
          // El primero gana: si la otra capa repite la clave, avisamos abajo.
          if (!indice.has(clave)) indice.set(clave, (f.properties ?? {}) as Record<string, unknown>)
        }
        for (const f of ctx.capa.geo.features) {
          const v = (f.properties ?? {})[campoA]
          const clave = v === null || v === undefined ? '' : String(v).trim().toLowerCase()
          const encontrado = clave ? indice.get(clave) : undefined
          const extra: Record<string, unknown> = {}
          if (encontrado) {
            emparejados++
            for (const [k, val] of Object.entries(encontrado)) {
              if (k !== campoB) extra[`b_${k}`] = val
            }
          }
          rasgos.push({
            type: 'Feature',
            geometry: f.geometry,
            properties: { ...(f.properties ?? {}), ...extra },
          })
        }
      }

      if (rasgos.length === 0) return { error: 'No quedó ningún registro.' }
      const sinPareja = rasgos.length - emparejados
      const resumen: Fila[] = [
        { etiqueta: 'Registros', valor: numero(rasgos.length) },
        { etiqueta: 'Con pareja', valor: numero(emparejados) },
        { etiqueta: 'Sin pareja', valor: numero(sinPareja) },
      ]

      return {
        capa: capaDerivada(
          `${ctx.capa.nombre} + ${otra.nombre}`,
          `${ctx.capa.nombre} con los campos de ${otra.nombre}`,
          { type: 'FeatureCollection', features: rasgos },
          {
            resumen,
            metodo:
              modo === 'ubicacion'
                ? `Cada registro recibe los campos del polígono de ${otra.nombre} que lo contiene. Los campos traídos llevan el prefijo b_.`
                : `Emparejado por el valor del campo, ignorando mayúsculas y espacios sobrantes. Si la otra capa repite un valor, se toma el primero. Los campos traídos llevan el prefijo b_.`,
          },
        ),
        aviso:
          sinPareja > 0
            ? `${numero(sinPareja)} de ${numero(rasgos.length)} registros se quedaron sin pareja y sus campos nuevos van vacíos.`
            : undefined,
      }
    },
  },

  {
    clave: 'combinar-capas',
    categoria: 'datos',
    nombre: 'Combinar capas',
    nota: 'Junta dos capas en una sola, conservando los campos de ambas y anotando de cuál viene cada registro.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    parametros: [
      {
        tipo: 'capa',
        clave: 'otra',
        rotulo: 'Juntar con',
        formas: ['punto', 'linea', 'poligono', 'mixta'],
        nota: 'Los campos que se llaman igual se juntan en una sola columna; los demás se añaden.',
      },
    ],
    correr(ctx) {
      const otra = capaDe(ctx, 'otra')
      if (!otra) return { error: 'Elige la capa con la que juntar.' }
      const rasgos: GeoJSON.Feature[] = []
      for (const [capa, f] of [
        ...ctx.capa.geo.features.map((f) => [ctx.capa, f] as const),
        ...otra.geo.features.map((f) => [otra, f] as const),
      ]) {
        if (!f.geometry) continue
        rasgos.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: conCalculados((f.properties ?? {}) as Record<string, unknown>, {
            capa_origen: capa.nombre,
          }),
        })
      }
      if (rasgos.length === 0) return { error: 'Ninguna de las dos capas trae geometría.' }

      return {
        capa: capaDerivada(
          `${ctx.capa.nombre} + ${otra.nombre}`,
          `Combinación de ${ctx.capa.nombre} y ${otra.nombre}`,
          { type: 'FeatureCollection', features: rasgos },
          {
            resumen: [
              { etiqueta: ctx.capa.nombre, valor: numero(ctx.capa.geo.features.length) },
              { etiqueta: otra.nombre, valor: numero(otra.geo.features.length) },
              { etiqueta: 'Total', valor: numero(rasgos.length) },
            ],
            metodo:
              'Los registros de las dos capas se ponen uno detrás de otro. El campo capa_origen dice de cuál viene cada uno, que es lo que permite volver a separarlos después.',
          },
        ),
      }
    },
  },
]

export { enPoligono, aNumero, resumir, ESTADISTICOS, necesitaCampo }
export type { Estadistico }
