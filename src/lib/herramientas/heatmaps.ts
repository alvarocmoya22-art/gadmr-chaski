/**
 * Los dos indicadores de accesibilidad que faltaban: gravedad y 2SFCA.
 *
 * Hasta aquí la accesibilidad de CHASKI contestaba **a qué distancia queda lo
 * más cercano**. Es la pregunta correcta para un bombero y la equivocada para
 * un planificador, porque no sabe nada de dos cosas que deciden si un servicio
 * sirve:
 *
 *   - **Cuántos hay cerca, no solo el más cercano.** Un barrio con seis
 *     escuelas a 600 m está mejor servido que uno con una sola a 500 m, y
 *     «distancia al más cercano» los pinta al revés.
 *   - **Cuánta gente se los reparte.** Un centro de salud a 300 m del que
 *     dependen veinte mil personas no es accesibilidad, es una cola.
 *
 * GRAVEDAD contesta lo primero: suma todas las oportunidades del entorno,
 * pesando cada una por lo lejos que está. 2SFCA contesta lo segundo: reparte
 * la capacidad de cada equipamiento entre la población que lo tiene a su
 * alcance, y luego suma lo que le toca a cada zona.
 *
 * SE MIDE EN LÍNEA RECTA, igual que «Mapa de cercanía» y a diferencia de
 * «Isócronas a pie», que sí rutea. No es pereza: la isócrona recorre un grafo
 * desde UN origen, y estas dos necesitan la distancia de cada zona a cada
 * equipamiento —cientos de miles de pares—. La recta siempre sale optimista y
 * cada resultado lo dice en su ficha. Medirlas por la calle es el paso
 * siguiente y cambia solo la función de distancia, no el indicador.
 */
/*
 * `cifraLeyenda` y no `numero` para los valores de los indicadores.
 *
 * `numero` redondea a entero, y estos dos indicadores viven por debajo del
 * uno: una mediana de 0,213 equipamientos por mil habitantes salia en el
 * resumen como «0», al lado de una leyenda cuyo primer tramo decia «hasta
 * 0,213». Ademas es la MISMA funcion que usa la leyenda, asi que las dos
 * cifras no pueden discrepar por redondear cada una a su manera.
 */
import { cifraLeyenda, distanciaGeo } from '../medidas'
import { numero } from '../format'
import { representante } from '../ambito'
import { piezasDe, recuadroDe } from '../ambito'
import { cajaDe, enPoligono, type Anillo } from '../geo'
import { planoLocal } from '../metrico'
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
} from './tipos'

/**
 * Tope de parejas que se consienten.
 *
 * Las dos herramientas son un producto cartesiano: zonas por equipamientos.
 * Con 3.757 manzanas y 1.083 equipamientos son cuatro millones de distancias,
 * que el navegador hace en un segundo. Con celdas de 50 m sobre el cantón y
 * los mismos equipamientos serían mil millones y la pestaña se cuelga sin
 * decir por qué. Mejor negarse y explicar qué subir.
 */
const TOPE_PAREJAS = 40_000_000

/** Lee un campo numérico de un registro; NaN si no trae número. */
function num(props: Record<string, unknown>, campo: string): number {
  const v = props[campo]
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim()
  if (s === '') return NaN
  // Las dos escrituras que llegan de verdad: 1234.56 y 1.234,56.
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'))
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'))
  return NaN
}

/** Cada registro con geometría, con su punto representante al lado. */
function conPunto(geo: GeoJSON.FeatureCollection) {
  const salida: { props: Record<string, unknown>; lon: number; lat: number; f: GeoJSON.Feature }[] = []
  for (const f of geo.features) {
    if (!f.geometry) continue
    const p = representante(f.geometry)
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    salida.push({ props: (f.properties ?? {}) as Record<string, unknown>, lon: p[0], lat: p[1], f })
  }
  return salida
}

export const HEATMAPS: Herramienta[] = [
  {
    clave: 'heatmap-gravedad',
    categoria: 'accesibilidad',
    nombre: 'Mapa de gravedad',
    nota: 'Una rejilla que suma TODAS las oportunidades del entorno, no solo la más cercana, pesando cada una por lo lejos que queda. Un barrio con seis escuelas cerca sale mejor que uno con una sola, que es lo que «Mapa de cercanía» no sabe distinguir.',
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
      },
      {
        tipo: 'numero',
        clave: 'mitad',
        rotulo: 'Distancia de media caída',
        defecto: 400,
        min: 50,
        max: 5000,
        paso: 50,
        unidad: 'm',
        nota: 'A esta distancia una oportunidad vale la mitad; al doble, la cuarta parte. Es la forma legible de la sensibilidad: 400 m es lo que la ordenanza pide caminar a un parque de proximidad.',
      },
      {
        tipo: 'numero',
        clave: 'tope',
        rotulo: 'Dejar de contar más allá de',
        defecto: 2000,
        min: 100,
        max: 20000,
        paso: 100,
        unidad: 'm',
        nota: 'Más allá el peso es tan pequeño que no cambia el resultado, y recortar ahí es lo que hace que el cálculo termine.',
      },
      {
        tipo: 'campo',
        clave: 'peso',
        rotulo: 'Peso de cada oportunidad',
        opcional: true,
        numerico: true,
        vacio: 'Todas valen igual',
        nota: 'Aulas, camas, metros cuadrados. Sin campo, cada registro vale uno y el resultado cuenta equipamientos, no capacidad.',
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
      const mitad = numeroDe(ctx, 'mitad', 400)
      const tope = numeroDe(ctx, 'tope', 2000)
      const campoPeso = ctx.valores.peso || ''

      /*
       * El peso de una oportunidad a distancia d.
       *
       * Decaimiento exponencial escrito por su media caída en vez de por un
       * beta: `0,5^(d/mitad)` vale 1 en la puerta, 0,5 a `mitad` y 0,25 al
       * doble. Un planificador puede defender «a 400 m vale la mitad»; nadie
       * puede defender «beta = 0,0017».
       */
      const k = Math.LN2 / mitad
      const peso = (d: number) => Math.exp(-k * d)

      const destinos = elegidos.map((p) => {
        const w = campoPeso ? num(p.props, campoPeso) : 1
        return { lon: p.lon, lat: p.lat, w: Number.isFinite(w) && w > 0 ? w : 0 }
      })
      const sinPeso = campoPeso ? destinos.filter((d) => d.w === 0).length : 0
      if (campoPeso && sinPeso === destinos.length) {
        return { error: `Ningún registro trae un número positivo en «${campoPeso}».` }
      }

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
        return { error: 'Son demasiadas cuentas: sube el lado de celda, baja el tope o filtra los registros.' }
      }

      const rasgos: GeoJSON.Feature[] = []
      const valores: number[] = []
      let maximo = 0
      for (let i = 0; i < columnas; i++) {
        for (let j = 0; j < filas; j++) {
          const cx = x0 + (i + 0.5) * celda
          const cy = y0 + (j + 0.5) * celda
          const [lon, lat] = plano.aGrados(cx, cy)
          if (!piezas.some((poly) => enPoligono(lon, lat, poly))) continue

          let suma = 0
          let cuantos = 0
          for (const d of destinos) {
            if (d.w === 0) continue
            const m = distanciaGeo(lon, lat, d.lon, d.lat)
            if (m > tope) continue
            suma += d.w * peso(m)
            cuantos++
          }
          if (suma > maximo) maximo = suma

          const [oeste, sur] = plano.aGrados(x0 + i * celda, y0 + j * celda)
          const [este, norte] = plano.aGrados(x0 + (i + 1) * celda, y0 + (j + 1) * celda)
          valores.push(suma)
          rasgos.push({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[oeste, sur], [este, sur], [este, norte], [oeste, norte], [oeste, sur]]],
            },
            properties: { gravedad: Math.round(suma * 1000) / 1000, oportunidades: cuantos },
          })
        }
      }
      if (rasgos.length === 0) return { error: 'La rejilla no cayó dentro del ámbito.' }

      /*
       * El índice de 0 a 100 va APARTE y no sustituye a la gravedad.
       *
       * La gravedad cruda tiene unidades —oportunidades pesadas— y se puede
       * comparar entre dos corridas. El índice se reescala con el máximo de
       * ESTA corrida, así que un 100 no quiere decir «bien servido» sino «lo
       * mejor servido de aquí»: dos mapas con índices parecidos pueden tener
       * ciudades distintas debajo. Se publica porque es lo que se pinta y se
       * lee, pero con la cruda al lado para que el engaño no sea posible.
       */
      for (const r of rasgos) {
        const g = Number((r.properties as Record<string, unknown>).gravedad)
        ;(r.properties as Record<string, unknown>).indice =
          maximo > 0 ? Math.round((g / maximo) * 1000) / 10 : 0
      }

      const conAlgo = valores.filter((v) => v > 0).length
      const ordenadas = [...valores].sort((a, b) => a - b)
      const resumen: Fila[] = [
        { etiqueta: 'Celdas', valor: numero(rasgos.length) },
        { etiqueta: 'Sin ninguna oportunidad cerca', valor: numero(rasgos.length - conAlgo) },
        {
          etiqueta: 'Gravedad mediana',
          valor: cifraLeyenda(ordenadas[Math.floor(ordenadas.length / 2)]),
        },
        { etiqueta: 'Máxima', valor: cifraLeyenda(maximo) },
      ]
      if (sinPeso > 0) {
        resumen.push({ etiqueta: `Sin número en «${campoPeso}»`, valor: numero(sinPeso) })
      }

      const { nombre, origen } = tituloDe(ctx, 'Mapa de gravedad')
      return {
        capa: capaDerivada(nombre, origen, { type: 'FeatureCollection', features: rasgos }, {
          tema: temaEscala(valores, 'indice', '', 'Sin color: celdas sin ninguna oportunidad dentro del tope.'),
          resumen,
          metodo:
            `Rejilla de ${numero(celda)} m recortada a ${capaAmbito ? capaAmbito.nombre : 'el recuadro de los registros'}. ` +
            `Cada celda suma las oportunidades a menos de ${numero(tope)} m pesando cada una por 0,5^(d/${numero(mitad)} m): ` +
            `vale entera en la puerta, la mitad a ${numero(mitad)} m y la cuarta parte al doble. ` +
            (campoPeso ? `El peso de cada una sale de «${campoPeso}». ` : 'Cada registro vale uno, así que cuenta equipamientos y no capacidad. ') +
            `«indice» reescala a 0-100 con el máximo DE ESTA corrida, así que no se compara entre mapas; «gravedad» sí. ` +
            `En línea recta, no por la calle: la caminata real siempre es mayor.`,
        }),
        puntos: elegidos,
      }
    },
  },

  {
    clave: 'heatmap-2sfca',
    categoria: 'accesibilidad',
    nombre: 'Oferta por habitante (2SFCA)',
    nota: 'Reparte la capacidad de cada equipamiento entre toda la población que lo tiene a su alcance, y luego le suma a cada zona lo que le toca de cada uno. Es la diferencia entre «tengo un centro de salud cerca» y «tengo un centro de salud cerca que no está desbordado».',
    acepta: ['punto', 'linea', 'poligono', 'mixta'],
    avisoRepresentante: true,
    parametros: [
      {
        tipo: 'capa',
        clave: 'demanda',
        rotulo: 'Zonas con población',
        formas: ['punto', 'linea', 'poligono', 'mixta'],
        nota: 'Barrios, manzanas o sectores con sus habitantes. El resultado es ESTA capa con una columna más.',
      },
      {
        tipo: 'campo',
        clave: 'poblacion',
        rotulo: 'Habitantes',
        numerico: true,
        deCapa: 'demanda',
        nota: 'La columna de población de las zonas. Sin ella no hay demanda que repartir.',
      },
      {
        tipo: 'campo',
        clave: 'capacidad',
        rotulo: 'Capacidad de cada equipamiento',
        opcional: true,
        numerico: true,
        vacio: 'Todos valen igual',
        nota: 'Camas, aulas, puestos. Sin campo cada equipamiento vale uno y el resultado son equipamientos por mil habitantes, no capacidad.',
      },
      {
        tipo: 'numero',
        clave: 'radio',
        rotulo: 'Alcance',
        defecto: 800,
        min: 100,
        max: 10000,
        paso: 100,
        unidad: 'm',
        nota: 'Hasta dónde se considera que un equipamiento sirve a una zona, y a la vez hasta dónde se cuenta la población que se lo reparte. Es el mismo radio en los dos pasos, como en el 2SFCA estándar.',
      },
      ...FILTRO,
    ],
    correr(ctx) {
      const oferta = registrosDe(ctx)
      if (oferta.length === 0) return { error: 'Con este filtro no entra ningún equipamiento.' }

      const capaDemanda = capaDe(ctx, 'demanda')
      if (!capaDemanda) return { error: 'Falta la capa de zonas con población.' }
      const campoPob = ctx.valores.poblacion || ''
      if (!campoPob) return { error: 'Falta decir qué columna trae los habitantes.' }

      const zonas = conPunto(capaDemanda.geo)
      if (zonas.length === 0) return { error: `«${capaDemanda.nombre}» no trae geometría.` }
      if (zonas.length * oferta.length > TOPE_PAREJAS) {
        return { error: 'Son demasiadas cuentas: filtra los equipamientos o usa zonas más grandes.' }
      }

      const pob = zonas.map((z) => {
        const p = num(z.props, campoPob)
        return Number.isFinite(p) && p > 0 ? p : 0
      })
      const sinPob = pob.filter((p) => p === 0).length
      const totalPob = pob.reduce((a, b) => a + b, 0)
      if (totalPob === 0) {
        return { error: `Ninguna zona trae un número positivo en «${campoPob}».` }
      }

      const campoCap = ctx.valores.capacidad || ''
      const capacidad = oferta.map((o) => {
        if (!campoCap) return 1
        const c = num(o.props, campoCap)
        return Number.isFinite(c) && c > 0 ? c : 0
      })
      const sinCap = campoCap ? capacidad.filter((c) => c === 0).length : 0
      if (campoCap && sinCap === capacidad.length) {
        return { error: `Ningún equipamiento trae un número positivo en «${campoCap}».` }
      }

      const radio = numeroDe(ctx, 'radio', 800)

      /*
       * PASO 1. Para cada equipamiento, cuánta capacidad le toca a cada
       * habitante que lo tiene a su alcance: Rj = Sj / Σ Pk.
       *
       * Un equipamiento sin nadie dentro del radio NO vale infinito ni cero:
       * se queda fuera. No tiene demanda que repartir, y dividir entre cero
       * daría un valor enorme que luego se le sumaría a cualquier zona que
       * entrara después en su radio, que es imposible por construcción.
       */
      const razon: number[] = []
      let aislados = 0
      for (let j = 0; j < oferta.length; j++) {
        if (capacidad[j] === 0) {
          razon.push(0)
          continue
        }
        let demanda = 0
        for (let i = 0; i < zonas.length; i++) {
          if (pob[i] === 0) continue
          if (distanciaGeo(oferta[j].lon, oferta[j].lat, zonas[i].lon, zonas[i].lat) <= radio) {
            demanda += pob[i]
          }
        }
        if (demanda === 0) {
          aislados++
          razon.push(0)
        } else {
          razon.push(capacidad[j] / demanda)
        }
      }

      // PASO 2. Cada zona suma las razones de los equipamientos a su alcance.
      const acceso: number[] = []
      const cuantos: number[] = []
      for (let i = 0; i < zonas.length; i++) {
        let suma = 0
        let n = 0
        for (let j = 0; j < oferta.length; j++) {
          if (razon[j] === 0) continue
          if (distanciaGeo(zonas[i].lon, zonas[i].lat, oferta[j].lon, oferta[j].lat) <= radio) {
            suma += razon[j]
            n++
          }
        }
        acceso.push(suma)
        cuantos.push(n)
      }

      /*
       * Se publica POR MIL HABITANTES y no el índice crudo.
       *
       * El 2SFCA sale en unidades de capacidad por habitante, y en salud eso
       * son números como 0,0007 que no se leen ni se comparan con nada. Por
       * mil habitantes es la forma en que la norma escribe estos ratios —camas
       * por mil, médicos por mil— así que el resultado se puede poner al lado
       * de un estándar sin convertir nada.
       */
      const porMil = acceso.map((a) => a * 1000)

      const rasgos: GeoJSON.Feature[] = zonas.map((z, i) => ({
        ...z.f,
        properties: conCalculados(z.props, {
          acceso_por_1000: Math.round(porMil[i] * 1000) / 1000,
          equipamientos_al_alcance: cuantos[i],
          habitantes: pob[i] || null,
        }),
      }))

      const servidas = cuantos.filter((n) => n > 0).length
      const pobServida = pob.reduce((a, p, i) => a + (cuantos[i] > 0 ? p : 0), 0)
      const ordenadas = porMil.filter((_, i) => pob[i] > 0).sort((a, b) => a - b)
      const resumen: Fila[] = [
        { etiqueta: 'Zonas', valor: numero(zonas.length) },
        { etiqueta: 'Sin ningún equipamiento al alcance', valor: numero(zonas.length - servidas) },
        {
          etiqueta: 'Población sin cobertura',
          valor: `${numero(Math.round(totalPob - pobServida))} de ${numero(Math.round(totalPob))}`,
        },
        {
          etiqueta: `Mediana (${campoCap ? campoCap : 'equipamientos'} por 1.000 hab)`,
          valor: ordenadas.length
            ? cifraLeyenda(ordenadas[Math.floor(ordenadas.length / 2)])
            : '—',
        },
      ]
      if (sinPob > 0) resumen.push({ etiqueta: `Zonas sin número en «${campoPob}»`, valor: numero(sinPob) })
      if (sinCap > 0) resumen.push({ etiqueta: `Equipamientos sin «${campoCap}»`, valor: numero(sinCap) })
      if (aislados > 0) {
        resumen.push({ etiqueta: 'Equipamientos sin nadie dentro del radio', valor: numero(aislados) })
      }

      const { nombre, origen } = tituloDe(ctx, 'Oferta por habitante')
      return {
        capa: capaDerivada(nombre, origen, { type: 'FeatureCollection', features: rasgos }, {
          tema: temaEscala(porMil, 'acceso_por_1000', '', 'Sin color: zonas sin ningún equipamiento dentro del alcance.'),
          resumen,
          metodo:
            `Dos pasos sobre un alcance de ${numero(radio)} m. Primero, cada equipamiento reparte su ` +
            (campoCap ? `«${campoCap}»` : 'unidad') +
            ` entre todos los habitantes que lo tienen dentro del alcance. Después, cada zona suma lo que le toca de cada equipamiento que alcanza. ` +
            `El resultado va por 1.000 habitantes, que es como la norma escribe estos ratios. ` +
            `Población de «${campoPob}» en ${capaDemanda.nombre}; ${numero(oferta.length)} equipamientos de ${ctx.capa.nombre}` +
            (aislados > 0 ? `, de los que ${numero(aislados)} no tienen a nadie dentro del alcance y no reparten nada` : '') +
            `. En línea recta, no por la calle: el alcance real caminando siempre es menor.`,
        }),
        puntos: oferta,
      }
    },
  },
]
