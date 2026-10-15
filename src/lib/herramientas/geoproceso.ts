/**
 * Geoproceso: cortar, combinar y transformar geometrías.
 *
 * Son las siete que trae GOAT en este grupo, y son la base de lo demás: sin
 * una intersección de verdad no hay forma de decir cuántas hectáreas de suelo
 * rural caen dentro de una plataforma, y sin una zona de influencia no hay
 * forma de preguntar qué queda a trescientos metros de un colector.
 */
import { cajaDe, enPoligono, poligonosDe, type Anillo, type Caja } from '../geo'
import {
  aMulti,
  deMulti,
  intersecar,
  planoDe,
  recortarLineas,
  restar,
  unir,
  zonaInfluencia,
  type Multi,
} from '../geoproceso'
import { areaHa, longitudM, prepararZonas, type Zona } from '../medidas'
import { ESTADISTICOS, aNumero, necesitaCampo, resumir, type Estadistico } from '../estadistica'
import { numero } from '../format'
import {
  FILTRO,
  capaDe,
  capaDerivada,
  numeroDe,
  rasgosFiltrados,
  temaEscala,
  tituloDe,
  type Fila,
  type Herramienta,
} from './tipos'

/** La caja de una geometría, para descartar pares que no se tocan. */
function cajaDeGeometria(g: GeoJSON.Geometry): Caja {
  const anillos = poligonosDe(g).flat()
  if (anillos.length > 0) return cajaDe(anillos)
  const sueltos: Anillo = []
  const mirar = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      sueltos.push([c[0] as number, c[1] as number])
      return
    }
    for (const sub of c) mirar(sub)
  }
  mirar((g as { coordinates?: unknown }).coordinates)
  return cajaDe([sueltos.length ? sueltos : [[0, 0]]])
}

const seTocan = (a: Caja, b: Caja) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1])

/** El punto representante de un registro, para los que no son polígonos. */
function puntoDe(g: GeoJSON.Geometry): [number, number] | null {
  if (g.type === 'Point') return g.coordinates as [number, number]
  if (g.type === 'MultiPoint') return (g.coordinates[0] ?? null) as [number, number] | null
  return null
}

/** Cuántos registros se dejan procesar antes de avisar de la espera. */
const AVISO_PESADO = 20000

export const GEOPROCESO: Herramienta[] = [
  {
    clave: 'centroide',
    categoria: 'geoproceso',
    nombre: 'Centroide',
    nota: 'Convierte cada polígono o línea en un punto, para poder contarlos, agruparlos o analizarlos como puntos.',
    acepta: ['linea', 'poligono', 'mixta'],
    parametros: [...FILTRO],
    correr(ctx) {
      const rasgos = rasgosFiltrados(ctx)
      if (rasgos.length === 0) return { error: 'Con este filtro no queda ningún registro.' }
      const salida: GeoJSON.Feature[] = []
      for (const f of rasgos) {
        const g = f.geometry
        if (!g) continue
        let p: [number, number] | null = puntoDe(g)
        if (!p) {
          const anillos = poligonosDe(g)
          const anillo = anillos[0]?.[0]
          if (anillo?.length) {
            const n = anillo.length - 1
            let x = 0
            let y = 0
            for (let i = 0; i < n; i++) {
              x += anillo[i][0]
              y += anillo[i][1]
            }
            p = [x / n, y / n]
          } else if (g.type === 'LineString') {
            const c = g.coordinates as [number, number][]
            p = c[Math.floor(c.length / 2)] ?? null
          } else if (g.type === 'MultiLineString') {
            const c = (g.coordinates[0] ?? []) as [number, number][]
            p = c[Math.floor(c.length / 2)] ?? null
          }
        }
        if (!p) continue
        salida.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p },
          properties: { ...(f.properties ?? {}) },
        })
      }
      if (salida.length === 0) return { error: 'No se pudo sacar ningún punto.' }
      const { nombre, origen } = tituloDe(ctx, 'Centroide')
      return {
        capa: capaDerivada(nombre, origen, { type: 'FeatureCollection', features: salida }, {
          resumen: [{ etiqueta: 'Puntos', valor: numero(salida.length) }],
          metodo:
            'El centro del contorno exterior, en los polígonos; el vértice medio, en las líneas. En una forma en U el centro puede caer fuera de la pieza, que es lo propio de un centroide.',
        }),
      }
    },
  },

  {
    clave: 'zona-influencia',
    categoria: 'geoproceso',
    nombre: 'Zona de influencia',
    nota: 'El área que queda a menos de una distancia de cada registro. Para «qué hay a 300 m del colector» o «qué cubre un radio de 500 m».',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    parametros: [
      {
        tipo: 'numero',
        clave: 'metros',
        rotulo: 'Distancia',
        defecto: 300,
        min: -5000,
        max: 20000,
        paso: 50,
        unidad: 'm',
        nota: 'En negativo y sobre polígonos, encoge en vez de crecer: sirve para la parte del predio que queda lejos del borde.',
      },
      {
        tipo: 'opcion',
        clave: 'fundir',
        rotulo: 'Solapes',
        opciones: [
          { valor: 'no', rotulo: 'Una por registro' },
          { valor: 'si', rotulo: 'Fundidas en una' },
        ],
        nota: 'Fundidas, el área cubierta se mide una sola vez aunque dos radios se pisen.',
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const rasgos = rasgosFiltrados(ctx)
      if (rasgos.length === 0) return { error: 'Con este filtro no queda ningún registro.' }
      const metros = numeroDe(ctx, 'metros', 300)
      if (metros === 0) return { error: 'Una distancia de cero no deja ninguna zona.' }
      const plano = planoDe(rasgos.map((f) => f.geometry))
      const fundir = ctx.valores.fundir === 'si'

      const piezas: Multi[] = []
      const salida: GeoJSON.Feature[] = []
      let fallidas = 0
      for (const f of rasgos) {
        if (!f.geometry) continue
        const z = zonaInfluencia(f.geometry, metros, plano)
        if (!z || z.length === 0) {
          fallidas++
          continue
        }
        if (fundir) piezas.push(z)
        else {
          const g = deMulti(z)
          if (g) salida.push({ type: 'Feature', geometry: g, properties: { ...(f.properties ?? {}) } })
          else fallidas++
        }
      }

      if (fundir) {
        const todo = unir(piezas, plano)
        const g = todo ? deMulti(todo) : null
        if (!g) return { error: 'No se pudo fundir las zonas; prueba sin fundir.' }
        salida.push({
          type: 'Feature',
          geometry: g,
          properties: { metros, registros: rasgos.length - fallidas },
        })
      }
      if (salida.length === 0) return { error: 'No salió ninguna zona de influencia.' }

      const ha = salida.reduce((s, f) => s + areaHa(f.geometry), 0)
      const { nombre, origen } = tituloDe(ctx, `Zona de ${numero(metros)} m`)
      return {
        capa: capaDerivada(nombre, origen, { type: 'FeatureCollection', features: salida }, {
          resumen: [
            { etiqueta: 'Registros', valor: numero(rasgos.length - fallidas) },
            { etiqueta: 'Piezas', valor: numero(salida.length) },
            { etiqueta: 'Superficie cubierta', valor: `${numero(Math.round(ha))} ha` },
          ],
          metodo: `Contorno a ${numero(Math.abs(metros))} m con esquinas redondeadas, calculado en un plano métrico local y con el círculo dibujado en 32 lados.${fundir ? ' Las zonas se fundieron, así que el área solapada se cuenta una sola vez.' : ' Sin fundir: si dos zonas se pisan, la superficie total suma dos veces lo solapado.'}${fallidas > 0 ? ` ${numero(fallidas)} registros con geometría inválida quedaron fuera.` : ''}`,
        }),
        aviso:
          fallidas > 0
            ? `${numero(fallidas)} registros tienen geometría que la biblioteca no pudo procesar y quedaron fuera.`
            : undefined,
      }
    },
  },

  {
    clave: 'recortar',
    categoria: 'geoproceso',
    nombre: 'Recortar',
    nota: 'Deja solo lo que cae dentro de otra capa de polígonos, partiendo las piezas por el límite.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    parametros: [
      {
        tipo: 'capa',
        clave: 'molde',
        rotulo: 'Recortar con',
        formas: ['poligono', 'mixta'],
        nota: 'La capa de polígonos que hace de molde. Sus campos no pasan al resultado.',
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const molde = capaDe(ctx, 'molde')
      if (!molde) return { error: 'Elige la capa de polígonos que hace de molde.' }
      const zonas = prepararZonas(molde.geo)
      if (zonas.length === 0) return { error: `«${molde.nombre}» no trae polígonos.` }
      const rasgos = rasgosFiltrados(ctx)
      if (rasgos.length === 0) return { error: 'Con este filtro no queda ningún registro.' }

      const piezasMolde = zonas.map((z) => z.poligonos).flat()
      const plano = planoDe([...rasgos.map((f) => f.geometry), ...molde.geo.features.map((f) => f.geometry)])
      const moldeMulti: Multi = piezasMolde.map((poly) => poly.map((a) => a.map((p) => [p[0], p[1]])))

      const salida: GeoJSON.Feature[] = []
      for (const f of rasgos) {
        const g = f.geometry
        if (!g) continue
        const caja = cajaDeGeometria(g)
        const cerca = zonas.filter((z) => seTocan(caja, z.caja))
        if (cerca.length === 0) continue
        const props = { ...(f.properties ?? {}) }

        const punto = puntoDe(g)
        if (punto) {
          if (cerca.some((z) => z.poligonos.some((p) => enPoligono(punto[0], punto[1], p))))
            salida.push({ type: 'Feature', geometry: g, properties: props })
          continue
        }
        if (g.type === 'LineString' || g.type === 'MultiLineString') {
          const trozo = recortarLineas(g, cerca.map((z) => z.poligonos).flat())
          if (trozo) salida.push({ type: 'Feature', geometry: trozo, properties: props })
          continue
        }
        const r = intersecar(aMulti(g), moldeMulti, plano)
        const trozo = r ? deMulti(r) : null
        if (trozo) salida.push({ type: 'Feature', geometry: trozo, properties: props })
      }

      if (salida.length === 0) return { error: 'Nada de esta capa cae dentro del molde.' }
      const resumen: Fila[] = [
        { etiqueta: 'Registros que entran', valor: numero(rasgos.length) },
        { etiqueta: 'Registros que quedan', valor: numero(salida.length) },
      ]
      const ha = salida.reduce((s, f) => s + areaHa(f.geometry), 0)
      const km = salida.reduce((s, f) => s + longitudM(f.geometry), 0) / 1000
      if (ha > 0) resumen.push({ etiqueta: 'Superficie', valor: `${numero(Math.round(ha))} ha` })
      if (km > 0) resumen.push({ etiqueta: 'Longitud', valor: `${numero(Math.round(km))} km` })

      const { nombre, origen } = tituloDe(ctx, 'Recorte')
      return {
        capa: capaDerivada(nombre, `${origen}, recortado con ${molde.nombre}`, {
          type: 'FeatureCollection',
          features: salida,
        }, {
          resumen,
          metodo:
            'Los polígonos se intersecan y las líneas se parten en el cruce del límite, conservando solo los tramos de dentro. Los puntos se conservan enteros si caen dentro. Los campos del molde no pasan al resultado.',
        }),
      }
    },
  },

  {
    clave: 'borrar',
    categoria: 'geoproceso',
    nombre: 'Borrar',
    nota: 'Lo contrario de recortar: quita lo que cae dentro de la otra capa y deja lo de fuera.',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    parametros: [
      {
        tipo: 'capa',
        clave: 'molde',
        rotulo: 'Quitar lo que caiga en',
        formas: ['poligono', 'mixta'],
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const molde = capaDe(ctx, 'molde')
      if (!molde) return { error: 'Elige la capa de polígonos que hace de molde.' }
      const zonas = prepararZonas(molde.geo)
      if (zonas.length === 0) return { error: `«${molde.nombre}» no trae polígonos.` }
      const rasgos = rasgosFiltrados(ctx)
      if (rasgos.length === 0) return { error: 'Con este filtro no queda ningún registro.' }

      const plano = planoDe([...rasgos.map((f) => f.geometry), ...molde.geo.features.map((f) => f.geometry)])
      const moldeMulti: Multi = zonas
        .map((z) => z.poligonos)
        .flat()
        .map((poly) => poly.map((a) => a.map((p) => [p[0], p[1]])))

      const salida: GeoJSON.Feature[] = []
      for (const f of rasgos) {
        const g = f.geometry
        if (!g) continue
        const props = { ...(f.properties ?? {}) }
        const caja = cajaDeGeometria(g)
        const cerca = zonas.filter((z) => seTocan(caja, z.caja))

        const punto = puntoDe(g)
        if (punto) {
          const dentro = cerca.some((z) => z.poligonos.some((p) => enPoligono(punto[0], punto[1], p)))
          if (!dentro) salida.push({ type: 'Feature', geometry: g, properties: props })
          continue
        }
        if (cerca.length === 0) {
          salida.push({ type: 'Feature', geometry: g, properties: props })
          continue
        }
        if (g.type === 'LineString' || g.type === 'MultiLineString') {
          const dentro = recortarLineas(g, cerca.map((z) => z.poligonos).flat())
          const largoDentro = dentro ? longitudM(dentro) : 0
          if (largoDentro === 0) {
            salida.push({ type: 'Feature', geometry: g, properties: props })
            continue
          }
          // Lo de fuera es lo que queda al restar, y se obtiene recortando por
          // el complemento: aquí basta con quedarse con los tramos que no están
          // dentro, que es lo mismo que recortar invirtiendo la pregunta.
          const fuera = recortarLineasFuera(g, cerca.map((z) => z.poligonos).flat())
          if (fuera) salida.push({ type: 'Feature', geometry: fuera, properties: props })
          continue
        }
        const r = restar(aMulti(g), moldeMulti, plano)
        const trozo = r ? deMulti(r) : null
        if (trozo) salida.push({ type: 'Feature', geometry: trozo, properties: props })
      }

      if (salida.length === 0) return { error: 'No queda nada fuera del molde.' }
      const ha = salida.reduce((s, f) => s + areaHa(f.geometry), 0)
      const { nombre, origen } = tituloDe(ctx, 'Sin')
      return {
        capa: capaDerivada(nombre, `${origen}, quitando ${molde.nombre}`, {
          type: 'FeatureCollection',
          features: salida,
        }, {
          resumen: [
            { etiqueta: 'Registros que entran', valor: numero(rasgos.length) },
            { etiqueta: 'Registros que quedan', valor: numero(salida.length) },
            ...(ha > 0 ? [{ etiqueta: 'Superficie', valor: `${numero(Math.round(ha))} ha` }] : []),
          ],
          metodo: 'Resta geométrica sobre los polígonos y partición de las líneas en el límite.',
        }),
      }
    },
  },

  {
    clave: 'intersecar',
    categoria: 'geoproceso',
    nombre: 'Intersecar',
    nota: 'El solape de dos capas de polígonos, con los campos de las dos. Para saber cuántas hectáreas de cada clase de suelo caen en cada zona.',
    acepta: ['poligono', 'mixta'],
    parametros: [
      {
        tipo: 'capa',
        clave: 'otra',
        rotulo: 'Cruzar con',
        formas: ['poligono', 'mixta'],
        nota: 'Cada pieza del resultado lleva los campos de las dos capas; los de esta llevan el prefijo b_.',
      },
    ],
    correr(ctx) {
      const otra = capaDe(ctx, 'otra')
      if (!otra) return { error: 'Elige la capa con la que cruzar.' }
      const zonas = prepararZonas(otra.geo)
      if (zonas.length === 0) return { error: `«${otra.nombre}» no trae polígonos.` }
      const rasgos = ctx.capa.geo.features.filter((f) => f.geometry && poligonosDe(f.geometry).length)
      if (rasgos.length === 0) return { error: 'La capa de entrada no trae polígonos.' }

      const plano = planoDe([...rasgos.map((f) => f.geometry), ...otra.geo.features.map((f) => f.geometry)])
      const salida: GeoJSON.Feature[] = []
      let fallidas = 0
      for (const f of rasgos) {
        const caja = cajaDeGeometria(f.geometry as GeoJSON.Geometry)
        const a = aMulti(f.geometry)
        for (const z of zonas) {
          if (!seTocan(caja, z.caja)) continue
          const b: Multi = z.poligonos.map((poly) => poly.map((an) => an.map((p) => [p[0], p[1]])))
          const r = intersecar(a, b, plano)
          if (!r) {
            fallidas++
            continue
          }
          const g = deMulti(r)
          if (!g) continue
          const props: Record<string, unknown> = { ...(f.properties ?? {}) }
          for (const [k, v] of Object.entries(z.props)) props[`b_${k}`] = v
          props.area_ha = +areaHa(g).toFixed(4)
          salida.push({ type: 'Feature', geometry: g, properties: props })
        }
      }

      if (salida.length === 0) return { error: 'Las dos capas no se solapan en ninguna parte.' }
      const ha = salida.reduce((s, f) => s + Number(f.properties?.area_ha ?? 0), 0)
      return {
        capa: capaDerivada(
          `Intersección · ${ctx.capa.nombre} × ${otra.nombre}`,
          `Intersección de ${ctx.capa.nombre} con ${otra.nombre}`,
          { type: 'FeatureCollection', features: salida },
          {
            tema: temaEscala(
              salida.map((f) => Number(f.properties?.area_ha ?? 0)),
              'area_ha',
              'ha',
              'Sin color: piezas sin superficie medible.',
            ),
            resumen: [
              { etiqueta: 'Piezas de solape', valor: numero(salida.length) },
              { etiqueta: 'Superficie solapada', valor: `${numero(Math.round(ha))} ha` },
            ],
            metodo: `Cada pieza es el solape de un registro de ${ctx.capa.nombre} con uno de ${otra.nombre}, con el área ya medida en area_ha. Los campos de ${otra.nombre} llevan el prefijo b_.${fallidas > 0 ? ` ${numero(fallidas)} pares con geometría inválida se saltaron.` : ''}`,
          },
        ),
        aviso:
          fallidas > 0
            ? `${numero(fallidas)} pares tienen geometría que la biblioteca no pudo procesar.`
            : undefined,
      }
    },
  },

  {
    clave: 'combinar-areas',
    categoria: 'geoproceso',
    nombre: 'Combinar áreas',
    nota: 'Junta dos capas de polígonos partiendo el solape en tres: lo que solo está en una, lo que solo está en la otra y lo común.',
    acepta: ['poligono', 'mixta'],
    parametros: [
      { tipo: 'capa', clave: 'otra', rotulo: 'Combinar con', formas: ['poligono', 'mixta'] },
    ],
    correr(ctx) {
      const otra = capaDe(ctx, 'otra')
      if (!otra) return { error: 'Elige la capa con la que combinar.' }
      const a = ctx.capa.geo.features.flatMap((f) => aMulti(f.geometry))
      const b = otra.geo.features.flatMap((f) => aMulti(f.geometry))
      if (a.length === 0 || b.length === 0) return { error: 'Alguna de las dos capas no trae polígonos.' }

      const plano = planoDe([...ctx.capa.geo.features, ...otra.geo.features].map((f) => f.geometry))
      const unidaA = unir([a], plano)
      const unidaB = unir([b], plano)
      if (!unidaA || !unidaB) return { error: 'No se pudo fundir alguna de las dos capas.' }

      const comun = intersecar(unidaA, unidaB, plano)
      const soloA = restar(unidaA, unidaB, plano)
      const soloB = restar(unidaB, unidaA, plano)

      const salida: GeoJSON.Feature[] = []
      const añadir = (m: Multi | null, parte: string) => {
        const g = m ? deMulti(m) : null
        if (g) salida.push({ type: 'Feature', geometry: g, properties: { parte, area_ha: +areaHa(g).toFixed(3) } })
      }
      añadir(soloA, `Solo ${ctx.capa.nombre}`)
      añadir(comun, 'En las dos')
      añadir(soloB, `Solo ${otra.nombre}`)
      if (salida.length === 0) return { error: 'La combinación no dejó ninguna pieza.' }

      return {
        capa: capaDerivada(
          `Combinación · ${ctx.capa.nombre} + ${otra.nombre}`,
          `Combinación de ${ctx.capa.nombre} con ${otra.nombre}`,
          { type: 'FeatureCollection', features: salida },
          {
            resumen: salida.map((f) => ({
              etiqueta: String(f.properties?.parte),
              valor: `${numero(Math.round(Number(f.properties?.area_ha ?? 0)))} ha`,
            })),
            metodo:
              'Cada capa se funde primero en una sola pieza y después se reparte en tres: lo propio de cada una y lo común. Las superficies no se pisan, así que suman el total combinado.',
          },
        ),
      }
    },
  },

  {
    clave: 'disolver',
    categoria: 'geoproceso',
    nombre: 'Disolver',
    nota: 'Funde las piezas que comparten un valor en una sola, borrando los límites de dentro. Para pasar de predios a manzanas o de parroquias a cantón.',
    acepta: ['poligono', 'mixta'],
    parametros: [
      {
        tipo: 'campo',
        clave: 'campo',
        rotulo: 'Fundir por',
        opcional: true,
        vacio: 'Todo en una sola pieza',
      },
      {
        tipo: 'opcion',
        clave: 'estadistico',
        rotulo: 'Y calcular',
        opciones: ESTADISTICOS.map((e) => ({ valor: e.clave, rotulo: e.rotulo, nota: e.nota })),
      },
      {
        tipo: 'campo',
        clave: 'campoValor',
        rotulo: 'Del campo',
        opcional: true,
        numerico: true,
        vacio: 'No hace falta para «Cuántos»',
      },
    ],
    correr(ctx) {
      const campo = ctx.valores.campo || null
      const estadistico = (ctx.valores.estadistico || 'cuenta') as Estadistico
      const campoValor = ctx.valores.campoValor || null
      if (necesitaCampo(estadistico) && !campoValor) {
        return { error: `Para «${estadistico}» hace falta elegir el campo numérico.` }
      }

      const grupos = new Map<string, GeoJSON.Feature[]>()
      for (const f of ctx.capa.geo.features) {
        if (!f.geometry || poligonosDe(f.geometry).length === 0) continue
        const clave = campo ? String((f.properties ?? {})[campo] ?? '—') : 'todo'
        const lista = grupos.get(clave) ?? []
        lista.push(f)
        grupos.set(clave, lista)
      }
      if (grupos.size === 0) return { error: 'La capa no trae polígonos.' }
      if (grupos.size > 400) {
        return { error: `«${campo}» tiene ${numero(grupos.size)} valores distintos: elige un campo con menos grupos.` }
      }

      const plano = planoDe(ctx.capa.geo.features.map((f) => f.geometry))
      const salida: GeoJSON.Feature[] = []
      let fallidos = 0
      for (const [clave, rasgos] of grupos) {
        const m = unir(rasgos.map((f) => aMulti(f.geometry)), plano)
        const g = m ? deMulti(m) : null
        if (!g) {
          fallidos++
          continue
        }
        const valores = campoValor
          ? rasgos.map((f) => aNumero((f.properties ?? {})[campoValor])).filter((v): v is number => v !== null)
          : []
        const calculado = resumir(valores, estadistico)
        const props: Record<string, unknown> = {
          [campo ?? 'grupo']: clave,
          piezas: rasgos.length,
          area_ha: +areaHa(g).toFixed(3),
        }
        if (estadistico !== 'cuenta' && calculado !== null) {
          props[`${estadistico}_${campoValor}`] = +calculado.toFixed(4)
        }
        salida.push({ type: 'Feature', geometry: g, properties: props })
      }
      if (salida.length === 0) return { error: 'No se pudo fundir ninguna pieza.' }

      const total = salida.reduce((s, f) => s + Number(f.properties?.area_ha ?? 0), 0)
      const resumen: Fila[] = salida
        .slice()
        .sort((a, b) => Number(b.properties?.area_ha ?? 0) - Number(a.properties?.area_ha ?? 0))
        .slice(0, 20)
        .map((f) => ({
          etiqueta: String(f.properties?.[campo ?? 'grupo']),
          valor: `${numero(Math.round(Number(f.properties?.area_ha ?? 0)))} ha · ${numero(Number(f.properties?.piezas ?? 0))} piezas`,
        }))
      resumen.unshift({ etiqueta: 'Superficie total', valor: `${numero(Math.round(total))} ha` })

      const { nombre } = tituloDe(ctx, 'Disuelto')
      return {
        capa: capaDerivada(nombre, `Disuelto por «${campo ?? 'todo'}» sobre ${ctx.capa.nombre}`, {
          type: 'FeatureCollection',
          features: salida,
        }, {
          tema: temaEscala(
            salida.map((f) => Number(f.properties?.area_ha ?? 0)),
            'area_ha',
            'ha',
            'Sin color: piezas sin superficie medible.',
          ),
          resumen,
          metodo: `Las piezas con el mismo valor se funden en una y los límites interiores desaparecen, así que la superficie ya no cuenta dos veces lo que se solapaba.${fallidos > 0 ? ` ${numero(fallidos)} grupos con geometría inválida quedaron fuera.` : ''}`,
        }),
      }
    },
  },
]

/** Los tramos de una línea que quedan FUERA de los polígonos. */
function recortarLineasFuera(
  g: GeoJSON.Geometry,
  piezas: Anillo[][],
): GeoJSON.Geometry | null {
  /*
   * Se resuelve con la misma partición que el recorte, invirtiendo la
   * pregunta: en vez de quedarse con los trocitos de dentro, con los de fuera.
   * Reusar `recortarLineas` con el complemento no se puede —el complemento de
   * un polígono no es un polígono— así que la caja envolvente hace de marco.
   */
  const caja = cajaDe(piezas.flat())
  const margen = 1
  const marco: Anillo[][] = [
    [
      [
        [caja[0] - margen, caja[1] - margen],
        [caja[2] + margen, caja[1] - margen],
        [caja[2] + margen, caja[3] + margen],
        [caja[0] - margen, caja[3] + margen],
        [caja[0] - margen, caja[1] - margen],
      ],
    ],
  ]
  const dentroDelMarco = recortarLineas(g, marco)
  if (!dentroDelMarco) return null
  if (dentroDelMarco.type !== 'LineString' && dentroDelMarco.type !== 'MultiLineString') return null
  const sartas: number[][][] =
    dentroDelMarco.type === 'LineString'
      ? [dentroDelMarco.coordinates as number[][]]
      : (dentroDelMarco.coordinates as number[][][])
  const salida: number[][][] = []
  for (const sarta of sartas) {
    let actual: number[][] = []
    for (let i = 0; i < sarta.length - 1; i++) {
      const mx = (sarta[i][0] + sarta[i + 1][0]) / 2
      const my = (sarta[i][1] + sarta[i + 1][1]) / 2
      const fuera = !piezas.some((poly) => enPoligono(mx, my, poly))
      if (fuera) {
        if (actual.length === 0) actual.push(sarta[i])
        actual.push(sarta[i + 1])
      } else if (actual.length >= 2) {
        salida.push(actual)
        actual = []
      } else actual = []
    }
    if (actual.length >= 2) salida.push(actual)
  }
  if (salida.length === 0) return null
  return salida.length === 1
    ? { type: 'LineString', coordinates: salida[0] }
    : { type: 'MultiLineString', coordinates: salida }
}

export { AVISO_PESADO, cajaDeGeometria, seTocan, puntoDe, type Zona }
