/**
 * Geoanálisis: resumir información sobre zonas y encontrar patrones.
 *
 * Es el grupo que más se usa en una municipalidad, porque casi toda pregunta
 * de gestión acaba siendo «cuánto de esto hay en cada uno de aquellos».
 *
 * Los puntos calientes no vienen de GOAT —no los trae— sino del visor de
 * territorio, y se quedan aquí porque responden la pregunta contraria y
 * igual de frecuente: no cuánto hay en cada zona, sino dónde se amontona sin
 * que ninguna zona lo explique.
 */
import { poligonosDe } from '../geo'
import { aMulti, intersecar, planoDe } from '../geoproceso'
import { planoDe as _planoDe } from '../geoproceso'
import { areaHa, areaM2, longitudM, longitudPorZona, prepararZonas, zonaDe } from '../medidas'
import { ESTADISTICOS, aNumero, kMedias, necesitaCampo, resumir, type Estadistico } from '../estadistica'
import { CELDAS_HOTSPOT, TODA_LA_CATEGORIA, calcularHotspot } from '../hotspot'
import { piezasDe, puntosDe, recuadroDe } from '../ambito'
import { planoLocal } from '../metrico'
import { numero, porcentaje } from '../format'
import {
  CATEGORIA,
  FILTRO,
  capaDe,
  capaDerivada,
  conCalculados,
  numeroDe,
  rasgosFiltrados,
  registrosDe,
  temaEscala,
  tituloDe,
  type Fila,
  type Herramienta,
} from './tipos'
import { cajaDeGeometria, seTocan } from './geoproceso'

/** El control de estadístico y campo, que comparten las agregaciones. */
const AGREGACION = [
  {
    tipo: 'opcion' as const,
    clave: 'estadistico',
    rotulo: 'Calcular',
    opciones: ESTADISTICOS.map((e) => ({ valor: e.clave, rotulo: e.rotulo, nota: e.nota })),
  },
  {
    tipo: 'campo' as const,
    clave: 'campoValor',
    rotulo: 'Del campo',
    opcional: true,
    numerico: true,
    vacio: 'No hace falta para «Cuántos»',
  },
]

export const GEOANALISIS: Herramienta[] = [
  {
    clave: 'agregar-puntos',
    categoria: 'geoanalisis',
    nombre: 'Agregar puntos',
    nota: 'Resume los registros sobre una capa de zonas: cuántos, o la suma, media, mínimo, máximo o desviación de un campo.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    avisoRepresentante: true,
    parametros: [
      {
        tipo: 'capa',
        clave: 'zonas',
        rotulo: 'Zonas',
        formas: ['poligono', 'mixta'],
        nota: 'La capa de polígonos que reparte: barrios, plataformas, parroquias.',
      },
      ...AGREGACION,
      ...FILTRO,
    ],
    correr(ctx) {
      const capaZonas = capaDe(ctx, 'zonas')
      if (!capaZonas) return { error: 'Elige la capa de zonas que reparte los registros.' }
      const zonas = prepararZonas(capaZonas.geo)
      if (zonas.length === 0) return { error: `«${capaZonas.nombre}» no trae polígonos.` }

      const estadistico = (ctx.valores.estadistico || 'cuenta') as Estadistico
      const campoValor = ctx.valores.campoValor || null
      if (necesitaCampo(estadistico) && !campoValor) {
        return { error: 'Para este cálculo hace falta elegir el campo numérico.' }
      }

      const elegidos = registrosDe(ctx)
      if (elegidos.length === 0) return { error: 'Con este filtro no entra ningún registro.' }

      const porZona = new Map<number, number[]>()
      const cuentaZona = new Map<number, number>()
      let fuera = 0
      for (const p of elegidos) {
        const z = zonaDe(zonas, p.lon, p.lat)
        if (!z) {
          fuera++
          continue
        }
        cuentaZona.set(z.indice, (cuentaZona.get(z.indice) ?? 0) + 1)
        if (campoValor) {
          const v = aNumero(p.props[campoValor])
          if (v !== null) {
            const lista = porZona.get(z.indice) ?? []
            lista.push(v)
            porZona.set(z.indice, lista)
          }
        }
      }

      const campoSalida =
        estadistico === 'cuenta' ? 'registros' : `${estadistico}_${campoValor}`
      const rasgos: GeoJSON.Feature[] = zonas.map((z) => {
        const n = cuentaZona.get(z.indice) ?? 0
        const valores = porZona.get(z.indice) ?? []
        const calculado = estadistico === 'cuenta' ? n : resumir(valores, estadistico)
        const km2 = z.areaM2 / 1e6
        return {
          type: 'Feature',
          geometry: z.geo.geometry,
          properties: conCalculados(z.props, {
            [campoSalida]: calculado === null ? null : +calculado.toFixed(4),
            registros: n,
            area_ha: +(z.areaM2 / 10000).toFixed(2),
            densidad_km2: km2 > 0 ? +(n / km2).toFixed(2) : 0,
          }),
        }
      })

      const conAlgo = rasgos.filter((f) => Number(f.properties?.registros ?? 0) > 0).length
      const mayor = [...rasgos].sort(
        (a, b) => Number(b.properties?.[campoSalida] ?? 0) - Number(a.properties?.[campoSalida] ?? 0),
      )[0]
      const resumen: Fila[] = [
        { etiqueta: 'Registros repartidos', valor: numero(elegidos.length - fuera) },
        { etiqueta: 'Zonas con algún registro', valor: `${numero(conAlgo)} de ${numero(zonas.length)}` },
        {
          etiqueta: 'La que más',
          valor: numero(Number(mayor?.properties?.[campoSalida] ?? 0)),
        },
      ]
      if (fuera > 0) resumen.push({ etiqueta: 'Fuera de toda zona', valor: numero(fuera) })

      const rotuloEstadistico =
        ESTADISTICOS.find((e) => e.clave === estadistico)?.rotulo ?? estadistico
      const comoSeLlama =
        estadistico === 'cuenta' ? 'Conteo por zona' : `${rotuloEstadistico} por zona`
      const { nombre, origen } = tituloDe(ctx, comoSeLlama)
      return {
        capa: capaDerivada(nombre, `${origen}, repartido en ${capaZonas.nombre}`, {
          type: 'FeatureCollection',
          features: rasgos,
        }, {
          tema: temaEscala(
            rasgos.map((f) => Number(f.properties?.[campoSalida] ?? 0)),
            campoSalida,
            estadistico === 'cuenta' ? 'registros' : (campoValor ?? ''),
            'Sin color: esas zonas no recibieron ningún registro.',
          ),
          resumen,
          metodo: `Cada registro se asigna a la zona que lo contiene. La densidad usa la superficie de la zona medida sobre el elipsoide WGS84.${fuera > 0 ? ` ${numero(fuera)} registros cayeron fuera de todas las zonas y no se reparten.` : ''}`,
        }),
        puntos: elegidos,
        aviso:
          fuera > 0
            ? `${numero(fuera)} de ${numero(elegidos.length)} registros caen fuera de todas las zonas.`
            : undefined,
      }
    },
  },

  {
    clave: 'agregar-poligonos',
    categoria: 'geoanalisis',
    nombre: 'Agregar polígonos',
    nota: 'Cuánta superficie de esta capa cae en cada zona, repartiendo las piezas que cruzan el límite. Para el suelo, los usos o la cobertura.',
    acepta: ['poligono', 'mixta'],
    parametros: [
      { tipo: 'capa', clave: 'zonas', rotulo: 'Zonas', formas: ['poligono', 'mixta'] },
      ...FILTRO,
    ],
    correr(ctx) {
      const capaZonas = capaDe(ctx, 'zonas')
      if (!capaZonas) return { error: 'Elige la capa de zonas.' }
      const zonas = prepararZonas(capaZonas.geo)
      if (zonas.length === 0) return { error: `«${capaZonas.nombre}» no trae polígonos.` }
      const rasgos = rasgosFiltrados(ctx).filter((f) => poligonosDe(f.geometry!).length > 0)
      if (rasgos.length === 0) return { error: 'Con este filtro no queda ningún polígono.' }

      const plano = planoDe([...rasgos.map((f) => f.geometry), ...capaZonas.geo.features.map((f) => f.geometry)])
      const haPorZona = new Map<number, number>()
      let fallidas = 0
      for (const f of rasgos) {
        const caja = cajaDeGeometria(f.geometry as GeoJSON.Geometry)
        const a = aMulti(f.geometry)
        for (const z of zonas) {
          if (!seTocan(caja, z.caja)) continue
          const b = z.poligonos.map((poly) => poly.map((an) => an.map((p) => [p[0], p[1]])))
          const r = intersecar(a, b, plano)
          if (!r) {
            fallidas++
            continue
          }
          const g = r.length ? { type: 'MultiPolygon' as const, coordinates: r } : null
          if (!g) continue
          haPorZona.set(z.indice, (haPorZona.get(z.indice) ?? 0) + areaHa(g))
        }
      }

      const salida: GeoJSON.Feature[] = zonas.map((z) => {
        const ha = haPorZona.get(z.indice) ?? 0
        const haZona = z.areaM2 / 10000
        return {
          type: 'Feature',
          geometry: z.geo.geometry,
          properties: conCalculados(z.props, {
            ha_dentro: +ha.toFixed(3),
            area_ha: +haZona.toFixed(2),
            /*
             * Tope en 100: el solape y la zona se miden por separado, así que
             * una zona cubierta entera puede salir en 100,01 por redondeo. Un
             * porcentaje de cobertura mayor que cien solo confunde.
             */
            cobertura_pct: haZona > 0 ? +Math.min(100, (ha / haZona) * 100).toFixed(2) : 0,
          }),
        }
      })

      const total = [...haPorZona.values()].reduce((s, v) => s + v, 0)
      return {
        capa: capaDerivada(
          `Superficie por zona · ${ctx.capa.nombre}`,
          `Superficie de ${ctx.capa.nombre} repartida en ${capaZonas.nombre}`,
          { type: 'FeatureCollection', features: salida },
          {
            tema: temaEscala(
              salida.map((f) => Number(f.properties?.cobertura_pct ?? 0)),
              'cobertura_pct',
              '% de la zona',
              'Sin color: en esas zonas no hay nada de esta capa.',
            ),
            resumen: [
              { etiqueta: 'Superficie repartida', valor: `${numero(Math.round(total))} ha` },
              {
                etiqueta: 'Zonas con algo',
                valor: `${numero(salida.filter((f) => Number(f.properties?.ha_dentro ?? 0) > 0).length)} de ${numero(zonas.length)}`,
              },
            ],
            metodo: `Cada pieza se interseca con cada zona y se mide el solape, así que una que cruce el límite reparte su superficie entre las dos. El campo cobertura_pct dice qué parte de la zona ocupa.${fallidas > 0 ? ` ${numero(fallidas)} pares con geometría inválida se saltaron.` : ''}`,
          },
        ),
      }
    },
  },

  {
    clave: 'km-zona',
    categoria: 'geoanalisis',
    nombre: 'Kilómetros por zona',
    nota: 'Cuántos kilómetros de esta capa de líneas hay dentro de cada zona, y su densidad.',
    acepta: ['linea', 'mixta'],
    parametros: [
      { tipo: 'capa', clave: 'zonas', rotulo: 'Zonas', formas: ['poligono', 'mixta'] },
      ...FILTRO,
    ],
    correr(ctx) {
      const capaZonas = capaDe(ctx, 'zonas')
      if (!capaZonas) return { error: 'Elige la capa de zonas que reparte los kilómetros.' }
      const zonas = prepararZonas(capaZonas.geo)
      if (zonas.length === 0) return { error: `«${capaZonas.nombre}» no trae polígonos.` }
      const lineas = rasgosFiltrados(ctx).filter((f) => longitudM(f.geometry) > 0)
      if (lineas.length === 0) return { error: 'Con este filtro no queda ninguna línea.' }

      const metros = new Map<number, number>()
      let fuera = 0
      let total = 0
      for (const f of lineas) {
        total += longitudM(f.geometry!)
        const r = longitudPorZona(f.geometry!, zonas)
        fuera += r.fuera
        for (const [i, m] of r.porZona) metros.set(i, (metros.get(i) ?? 0) + m)
      }

      const rasgos: GeoJSON.Feature[] = zonas.map((z) => {
        const m = metros.get(z.indice) ?? 0
        const km2 = z.areaM2 / 1e6
        return {
          type: 'Feature',
          geometry: z.geo.geometry,
          properties: conCalculados(z.props, {
            km: +(m / 1000).toFixed(3),
            area_ha: +(z.areaM2 / 10000).toFixed(2),
            km_km2: km2 > 0 ? +(m / 1000 / km2).toFixed(2) : 0,
          }),
        }
      })

      const resumen: Fila[] = [
        { etiqueta: 'Longitud total', valor: `${numero(Math.round(total / 1000))} km` },
        { etiqueta: 'Dentro de las zonas', valor: `${numero(Math.round((total - fuera) / 1000))} km` },
        {
          etiqueta: 'Zonas con alguna línea',
          valor: `${numero(rasgos.filter((f) => Number(f.properties?.km ?? 0) > 0).length)} de ${numero(zonas.length)}`,
        },
      ]
      if (fuera > 1000) {
        resumen.push({ etiqueta: 'Fuera de toda zona', valor: `${numero(Math.round(fuera / 1000))} km` })
      }

      const { nombre, origen } = tituloDe(ctx, 'Kilómetros por zona')
      return {
        capa: capaDerivada(nombre, `${origen}, repartido en ${capaZonas.nombre}`, {
          type: 'FeatureCollection',
          features: rasgos,
        }, {
          tema: temaEscala(
            rasgos.map((f) => Number(f.properties?.km ?? 0)),
            'km',
            'km',
            'Sin color: por esas zonas no pasa ninguna línea de la capa.',
          ),
          resumen,
          metodo:
            'Cada línea se trocea en pasos de 25 m y cada trocito se asigna entero a la zona donde cae su punto medio, así que el error vive solo en los cruces de límite. El campo km_km2 trae la densidad, que es la cifra justa para comparar zonas de distinto tamaño.',
        }),
      }
    },
  },

  {
    clave: 'superficie-clase',
    categoria: 'geoanalisis',
    nombre: 'Superficie por clase',
    nota: 'Cuántas hectáreas y cuántas piezas hay de cada valor del campo, sin fundir las piezas. Para la clasificación del suelo, el uso o la tipología.',
    acepta: ['poligono', 'mixta'],
    parametros: [
      { tipo: 'campo', clave: 'campo', rotulo: 'Clasificar por', nota: 'El campo cuyas clases se van a medir.' },
    ],
    correr(ctx) {
      const campo = ctx.valores.campo
      if (!campo) return { error: 'Elige el campo que clasifica.' }

      const porClase = new Map<string, { ha: number; piezas: number }>()
      let sinClase = 0
      const rasgos: GeoJSON.Feature[] = []
      for (const f of ctx.capa.geo.features) {
        if (!f.geometry) continue
        const ha = areaHa(f.geometry)
        if (ha === 0) continue
        const bruto = (f.properties ?? {})[campo]
        const clase = bruto === null || bruto === undefined || bruto === '' ? '—' : String(bruto)
        if (clase === '—') sinClase++
        const acum = porClase.get(clase) ?? { ha: 0, piezas: 0 }
        acum.ha += ha
        acum.piezas += 1
        porClase.set(clase, acum)
        rasgos.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: conCalculados((f.properties ?? {}) as Record<string, unknown>, {
            area_ha: +ha.toFixed(3),
          }),
        })
      }
      if (rasgos.length === 0) return { error: 'La capa no trae ninguna superficie que medir.' }

      const total = [...porClase.values()].reduce((s, v) => s + v.ha, 0)
      const resumen: Fila[] = [...porClase.entries()]
        .sort((a, b) => b[1].ha - a[1].ha)
        .map(([clase, v]) => ({
          etiqueta: clase,
          valor: `${numero(Math.round(v.ha))} ha · ${porcentaje((v.ha / total) * 100)} · ${numero(v.piezas)} ${v.piezas === 1 ? 'pieza' : 'piezas'}`,
        }))
      resumen.unshift({ etiqueta: 'Superficie total', valor: `${numero(Math.round(total))} ha` })

      return {
        capa: capaDerivada(
          `Superficie · ${ctx.capa.nombre}`,
          `Superficie por «${campo}» sobre ${ctx.capa.nombre}`,
          { type: 'FeatureCollection', features: rasgos },
          {
            tema: temaEscala(
              rasgos.map((f) => Number(f.properties?.area_ha ?? 0)),
              'area_ha',
              'ha',
              'Sin color: piezas sin superficie medible.',
            ),
            resumen,
            metodo: `Superficie medida sobre el elipsoide WGS84, restando los huecos interiores. Cada pieza lleva su área en area_ha, así que la capa exportada ya trae el dato. Las piezas no se funden: si dos se solapan, su superficie cuenta dos veces —para evitarlo, usa Disolver.${sinClase > 0 ? ` ${numero(sinClase)} piezas no traen valor en «${campo}».` : ''}`,
          },
        ),
      }
    },
  },

  {
    clave: 'hotspot',
    categoria: 'geoanalisis',
    nombre: 'Puntos calientes (Gi*)',
    nota: 'Dónde se concentran los registros más de lo que se concentrarían por azar, con su nivel de confianza.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    avisoRepresentante: true,
    parametros: [
      ...FILTRO,
      {
        tipo: 'capa',
        clave: 'ambito',
        rotulo: 'Ámbito',
        formas: ['poligono', 'mixta'],
        opcional: true,
        vacio: 'Recuadro de los propios registros',
        nota: 'Sin un límite cargado, el ámbito es el recuadro de los registros con medio kilómetro de margen. Eso mete en el cálculo esquinas donde no hay ciudad, y esas celdas vacías bajan la media: el resultado sale algo más caliente de lo que saldría contra un límite de verdad.',
      },
      {
        tipo: 'opcion',
        clave: 'celda',
        rotulo: 'Lado de celda',
        defecto: '150',
        opciones: CELDAS_HOTSPOT.map((m) => ({ valor: String(m), rotulo: `${m} m` })),
      },
    ],
    correr(ctx) {
      const elegidos = registrosDe(ctx)
      if (elegidos.length === 0) return { error: 'Con este filtro no entra ningún registro.' }
      const capaAmbito = capaDe(ctx, 'ambito')
      const piezas = capaAmbito ? piezasDe(capaAmbito) : recuadroDe(elegidos)
      if (piezas.length === 0) {
        return { error: `«${capaAmbito?.nombre}» no trae polígonos, así que no sirve de ámbito.` }
      }
      const celda = numeroDe(ctx, 'celda', 150)
      const clase = ctx.valores.valor || TODA_LA_CATEGORIA
      const todos = puntosDe(ctx.capa, ctx.valores.campo || null)
      const h = calcularHotspot(todos, piezas, CATEGORIA, clase, celda, ctx.capa.nombre)
      if (!h) return { error: 'El cálculo no devolvió nada: revisa el ámbito y el tamaño de celda.' }

      const resumen: Fila[] = [
        { etiqueta: 'Registros', valor: numero(h.registros) },
        {
          etiqueta: 'En zona caliente (95 % o más)',
          valor: `${numero(h.registrosEnCaliente)} · ${porcentaje((h.registrosEnCaliente / Math.max(1, h.registros)) * 100)}`,
        },
        { etiqueta: 'Celdas calientes / frías', valor: `${numero(h.calientes)} / ${numero(h.frias)}` },
        { etiqueta: 'Celdas del ámbito', valor: numero(h.celdasAnalizadas) },
        {
          etiqueta: 'z máximo',
          valor: h.zMaximo.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        },
      ]
      const { nombre, origen } = tituloDe(ctx, 'Puntos calientes')
      return {
        capa: capaDerivada(nombre, origen, h.geo, {
          tema: {
            campo: 'grado',
            unidad: 'confianza',
            coincidencias: [
              { valor: 3, color: '#c0453b', rotulo: 'Caliente · 99 %' },
              { valor: 2, color: '#e08a4a', rotulo: 'Caliente · 95 %' },
              { valor: 1, color: '#f2c9a0', rotulo: 'Caliente · 90 %' },
              { valor: -1, color: '#c5d7e4', rotulo: 'Frío · 90 %' },
              { valor: -2, color: '#7fa8c4', rotulo: 'Frío · 95 %' },
              { valor: -3, color: '#2c6fb5', rotulo: 'Frío · 99 %' },
            ],
            notaVacio: 'Sin color: ahí la concentración no se distingue del resto del ámbito.',
          },
          resumen,
          metodo: `Getis-Ord Gi* con celda de ${h.celdaM} m y vecindad de ${numero(h.bandaM)} m, sobre ${capaAmbito ? capaAmbito.nombre : 'el recuadro de los registros'}. Las celdas vacías del ámbito entran en el cálculo.`,
        }),
        puntos: elegidos,
        ambito: {
          type: 'FeatureCollection',
          features: piezas.map((p) => ({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: p as number[][][] },
            properties: {},
          })),
        },
        aviso: capaAmbito
          ? undefined
          : 'Ámbito deducido del recuadro de los registros: el resultado sale algo más caliente de lo que saldría contra un límite cargado.',
      }
    },
  },

  {
    clave: 'agrupamiento',
    categoria: 'geoanalisis',
    nombre: 'Agrupamiento espacial',
    nota: 'Reparte los registros en el número de grupos que pidas, juntando los que están cerca. Para proponer zonas de trabajo, rutas o sectores de inspección.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    avisoRepresentante: true,
    parametros: [
      {
        tipo: 'numero',
        clave: 'grupos',
        rotulo: 'Cuántos grupos',
        defecto: 6,
        min: 2,
        max: 40,
        paso: 1,
        nota: 'El reparto busca que cada grupo quede compacto, no que todos tengan el mismo número de registros.',
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const elegidos = registrosDe(ctx)
      if (elegidos.length < 2) return { error: 'Hacen falta al menos dos registros.' }
      const grupos = Math.round(numeroDe(ctx, 'grupos', 6))
      if (grupos < 2) return { error: 'Hacen falta al menos dos grupos.' }
      if (grupos > elegidos.length) {
        return { error: `Hay ${numero(elegidos.length)} registros: no se pueden hacer ${numero(grupos)} grupos.` }
      }

      let oeste = Infinity
      let sur = Infinity
      let este = -Infinity
      let norte = -Infinity
      for (const p of elegidos) {
        if (p.lon < oeste) oeste = p.lon
        if (p.lon > este) este = p.lon
        if (p.lat < sur) sur = p.lat
        if (p.lat > norte) norte = p.lat
      }
      const plano = planoLocal((oeste + este) / 2, (sur + norte) / 2)
      const enMetros = elegidos.map((p) => plano.aMetros(p.lon, p.lat))
      const { asignacion, centros, vueltasUsadas } = kMedias(enMetros, grupos)

      const rasgos: GeoJSON.Feature[] = elegidos.map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: conCalculados(p.props, { grupo: asignacion[i] + 1 }),
      }))

      const cuenta = new Map<number, number>()
      for (const g of asignacion) cuenta.set(g, (cuenta.get(g) ?? 0) + 1)
      const resumen: Fila[] = [...cuenta.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([g, n]) => ({ etiqueta: `Grupo ${g + 1}`, valor: `${numero(n)} registros` }))
      resumen.unshift({ etiqueta: 'Registros', valor: numero(elegidos.length) })

      const { nombre, origen } = tituloDe(ctx, `Agrupamiento en ${grupos}`)
      return {
        capa: capaDerivada(nombre, origen, { type: 'FeatureCollection', features: rasgos }, {
          tema: temaEscala(
            rasgos.map((f) => Number(f.properties?.grupo ?? 0)),
            'grupo',
            'nº de grupo',
            'El color solo separa grupos: no hay un grupo «más» que otro.',
          ),
          resumen,
          metodo: `K-medias sobre el plano métrico local, con semillas separadas lo más posible y ${numero(vueltasUsadas)} vueltas hasta estabilizarse. Es determinista: con los mismos datos da siempre el mismo reparto. Los centros finales quedan en ${centros.length} grupos.`,
        }),
        puntos: elegidos,
      }
    },
  },
]

export { areaM2, _planoDe }
