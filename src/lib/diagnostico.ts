/**
 * El diagnóstico: todo lo que se puede decir del territorio con una capa.
 *
 * Nace de un encargo concreto: Ambiente mapea los perros esterilizados de una
 * campaña y quiere saber cómo quedó el territorio. Esa pregunta no la responde
 * ninguna herramienta suelta —hacen falta seis o siete, y saber en qué orden
 * corrrerlas y qué mirar de cada una—, así que aquí se corren todas de una vez
 * y se devuelve el informe armado.
 *
 * Lo que sale no es un montón de cifras: es el guion de un informe técnico.
 * Cuánto se hizo, cómo se repartió, si el reparto fue parejo o no, si el
 * patrón está agrupado o disperso, dónde se amontona y cuánto territorio quedó
 * cubierto. Cada cifra con la frase que explica qué quiere decir, porque una
 * tabla de estadísticos sin interpretación no la defiende nadie en una mesa.
 */
import { areaM2, prepararZonas, zonaDe, type Zona } from './medidas'
import { planoLocal } from './metrico'
import { cajaDe, enPoligono, type Anillo } from './geo'
import { numero, porcentaje } from './format'
import type { PuntoAnalisis } from './ambito'
import type { Fila } from './cargar'

/** Un bloque del informe. */
export interface Seccion {
  titulo: string
  filas: Fila[]
  /** La frase que explica qué quiere decir el bloque. */
  lectura?: string
}

export interface Informe {
  titulo: string
  subtitulo: string
  secciones: Seccion[]
  /** Cuándo se calculó, para que la lámina lo lleve impreso. */
  generado: string
  avisos: string[]
}

const cifra = (n: number, decimales = 2) =>
  n.toLocaleString('es-EC', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

/**
 * Coeficiente de Gini del reparto entre zonas.
 *
 * Cero es un reparto perfectamente parejo y uno es todo en una sola zona. Es
 * la medida que usan los informes de equidad territorial, y dice algo que la
 * media esconde: una campaña puede tener un buen promedio por barrio y haber
 * dejado la mitad de los barrios en cero.
 */
function gini(valores: number[]): number {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  const n = v.length
  if (n === 0) return 0
  const suma = v.reduce((s, x) => s + x, 0)
  if (suma === 0) return 0
  let acumulado = 0
  for (let i = 0; i < n; i++) acumulado += (i + 1) * v[i]
  return (2 * acumulado) / (n * suma) - (n + 1) / n
}

/**
 * Índice del vecino más cercano, de Clark y Evans.
 *
 * Compara la distancia media de cada registro a su vecino más próximo con la
 * que habría si estuvieran repartidos al azar sobre la misma superficie.
 * Por debajo de 1 el patrón está agrupado, alrededor de 1 es indistinguible
 * del azar, y por encima está más repartido de lo que estaría por azar.
 *
 * Es el estadístico que pide un informe técnico cuando hay que afirmar que
 * algo «se concentra», y depende por completo de la superficie de referencia:
 * con un ámbito más grande del que de verdad se trabajó, todo sale agrupado.
 * Por eso el aviso cuando el ámbito es deducido.
 */
function vecinoMasCercano(
  enMetros: [number, number][],
  areaM2Ambito: number,
): { observada: number; esperada: number; r: number; z: number } | null {
  const n = enMetros.length
  if (n < 2 || areaM2Ambito <= 0) return null
  let suma = 0
  for (let i = 0; i < n; i++) {
    let cerca = Infinity
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = (enMetros[i][0] - enMetros[j][0]) ** 2 + (enMetros[i][1] - enMetros[j][1]) ** 2
      if (d < cerca) cerca = d
    }
    suma += Math.sqrt(cerca)
  }
  const observada = suma / n
  const densidad = n / areaM2Ambito
  const esperada = 0.5 / Math.sqrt(densidad)
  const error = 0.26136 / Math.sqrt(n * densidad)
  return { observada, esperada, r: observada / esperada, z: (observada - esperada) / error }
}

/** Cómo se lee un índice de vecino más cercano. */
function lecturaPatron(r: number, z: number): string {
  const seguro = Math.abs(z) > 2.58 ? 'con 99 % de confianza' : Math.abs(z) > 1.96 ? 'con 95 % de confianza' : null
  if (!seguro) {
    return `Con R = ${cifra(r)} y z = ${cifra(z)}, el patrón no se distingue de uno al azar: no hay base estadística para decir que se concentra ni que se dispersa.`
  }
  if (r < 1) {
    return `Con R = ${cifra(r)} el patrón está agrupado ${seguro}: los registros están más juntos de lo que estarían repartidos al azar sobre la misma superficie.`
  }
  return `Con R = ${cifra(r)} el patrón está disperso ${seguro}: los registros están más separados de lo que estarían al azar.`
}

export interface EntradaDiagnostico {
  nombreCapa: string
  /** Los registros, ya filtrados. */
  puntos: PuntoAnalisis[]
  /** El ámbito; si es deducido, se avisa. */
  piezas: Anillo[][]
  ambitoDeducido: boolean
  nombreAmbito: string
  /** La capa de zonas para el reparto, si la hay. */
  zonas: { nombre: string; geo: GeoJSON.FeatureCollection } | null
  /** Campo por el que separar en categorías, si lo hay. */
  campo: string | null
  /** Radio de cobertura, en metros. */
  radio: number
}

/** Lado de la rejilla con la que se mide la cobertura, en metros. */
const CELDA_COBERTURA = 100

export function diagnosticar(e: EntradaDiagnostico): Informe {
  const avisos: string[] = []
  const secciones: Seccion[] = []
  const n = e.puntos.length

  const caja = cajaDe(e.piezas.flat())
  const plano = planoLocal((caja[0] + caja[2]) / 2, (caja[1] + caja[3]) / 2)
  const enMetros = e.puntos.map((p) => plano.aMetros(p.lon, p.lat) as [number, number])

  const areaAmbito = e.piezas.reduce(
    (s, poly) => s + areaM2({ type: 'Polygon', coordinates: poly as number[][][] }),
    0,
  )

  if (e.ambitoDeducido) {
    avisos.push(
      'El ámbito es el recuadro de los propios registros, no un límite cargado. Eso infla la superficie de referencia y empuja los indicadores hacia «agrupado» y hacia una cobertura menor. Carga el polígono del área de trabajo y vuelve a correrlo.',
    )
  }

  /* ── 1. Qué se hizo ──────────────────────────────────────────────────── */
  const filasResumen: Fila[] = [
    { etiqueta: 'Registros', valor: numero(n) },
    { etiqueta: 'Ámbito', valor: e.nombreAmbito },
    { etiqueta: 'Superficie del ámbito', valor: `${numero(Math.round(areaAmbito / 1e4))} ha` },
    {
      etiqueta: 'Densidad',
      valor: `${cifra(n / (areaAmbito / 1e6), 1)} por km²`,
    },
  ]
  secciones.push({
    titulo: 'Qué se hizo',
    filas: filasResumen,
    lectura: `${numero(n)} registros sobre ${numero(Math.round(areaAmbito / 1e4))} hectáreas.`,
  })

  /* ── 2. Por categoría ────────────────────────────────────────────────── */
  if (e.campo) {
    const cuenta = new Map<string, number>()
    for (const p of e.puntos) cuenta.set(p.clase, (cuenta.get(p.clase) ?? 0) + 1)
    const ordenadas = [...cuenta.entries()].sort((a, b) => b[1] - a[1])
    secciones.push({
      titulo: `Reparto por «${e.campo}»`,
      filas: ordenadas.map(([clase, c]) => ({
        etiqueta: clase,
        valor: `${numero(c)} · ${porcentaje((c / n) * 100)}`,
      })),
      lectura:
        ordenadas.length > 1
          ? `${ordenadas[0][0]} concentra ${porcentaje((ordenadas[0][1] / n) * 100)} del total, y la categoría más pequeña es ${ordenadas[ordenadas.length - 1][0]}.`
          : undefined,
    })
  }

  /* ── 3. Cómo se repartió entre zonas ─────────────────────────────────── */
  let zonasPreparadas: Zona[] = []
  if (e.zonas) {
    zonasPreparadas = prepararZonas(e.zonas.geo)
    const cuenta = new Map<number, number>()
    let fuera = 0
    for (const p of e.puntos) {
      const z = zonaDe(zonasPreparadas, p.lon, p.lat)
      if (!z) {
        fuera++
        continue
      }
      cuenta.set(z.indice, (cuenta.get(z.indice) ?? 0) + 1)
    }
    const valores = zonasPreparadas.map((z) => cuenta.get(z.indice) ?? 0)
    const conAlgo = valores.filter((v) => v > 0).length
    const ordenadas = [...valores].sort((a, b) => a - b)
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)] ?? 0
    const media = valores.reduce((s, v) => s + v, 0) / Math.max(1, valores.length)
    const g = gini(valores)

    const filas: Fila[] = [
      { etiqueta: `Zonas (${e.zonas.nombre})`, valor: numero(zonasPreparadas.length) },
      {
        etiqueta: 'Zonas con al menos un registro',
        valor: `${numero(conAlgo)} · ${porcentaje((conAlgo / Math.max(1, zonasPreparadas.length)) * 100)}`,
      },
      { etiqueta: 'Zonas sin ninguno', valor: numero(zonasPreparadas.length - conAlgo) },
      { etiqueta: 'Media por zona', valor: cifra(media, 1) },
      { etiqueta: 'Mediana por zona', valor: numero(mediana) },
      { etiqueta: 'La zona con más', valor: numero(ordenadas[ordenadas.length - 1] ?? 0) },
      { etiqueta: 'Desigualdad del reparto (Gini)', valor: cifra(g) },
    ]
    if (fuera > 0) filas.push({ etiqueta: 'Registros fuera de toda zona', valor: numero(fuera) })

    const comoEsta =
      g < 0.3
        ? 'un reparto bastante parejo'
        : g < 0.5
          ? 'un reparto desigual'
          : 'un reparto muy concentrado en pocas zonas'
    secciones.push({
      titulo: 'Cómo se repartió',
      filas,
      lectura: `El índice de Gini es ${cifra(g)}, ${comoEsta}: cero sería que todas las zonas recibieran lo mismo y uno que todo cayera en una sola. ${zonasPreparadas.length - conAlgo} de ${zonasPreparadas.length} zonas no recibieron ningún registro.`,
    })
  }

  /* ── 4. Qué forma tiene el patrón ────────────────────────────────────── */
  const vecino = vecinoMasCercano(enMetros, areaAmbito)
  if (vecino) {
    secciones.push({
      titulo: 'Qué forma tiene el patrón',
      filas: [
        { etiqueta: 'Distancia media al más cercano', valor: `${numero(Math.round(vecino.observada))} m` },
        { etiqueta: 'La que habría por azar', valor: `${numero(Math.round(vecino.esperada))} m` },
        { etiqueta: 'Índice R (Clark-Evans)', valor: cifra(vecino.r) },
        { etiqueta: 'Puntuación z', valor: cifra(vecino.z) },
      ],
      lectura: lecturaPatron(vecino.r, vecino.z),
    })
  }

  /* ── 5. Dónde está el centro ─────────────────────────────────────────── */
  if (n > 0) {
    const cx = enMetros.reduce((s, p) => s + p[0], 0) / n
    const cy = enMetros.reduce((s, p) => s + p[1], 0) / n
    const tipica = Math.sqrt(
      enMetros.reduce((s, p) => s + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / n,
    )
    const [lonC, latC] = plano.aGrados(cx, cy)
    secciones.push({
      titulo: 'Dónde está el centro',
      filas: [
        { etiqueta: 'Centro medio', valor: `${latC.toFixed(5)}, ${lonC.toFixed(5)}` },
        { etiqueta: 'Distancia típica', valor: `${numero(Math.round(tipica))} m` },
      ],
      lectura: `El centro de gravedad de los registros cae en ese punto, y dos tercios de ellos están a menos de ${numero(Math.round(tipica))} m de él. Si la campaña debía cubrir todo el ámbito por igual, el centro debería caer cerca del centro del ámbito.`,
    })
  }

  /* ── 6. Cuánto territorio quedó cubierto ─────────────────────────────── */
  const [x0, y0] = plano.aMetros(caja[0], caja[1])
  const [x1, y1] = plano.aMetros(caja[2], caja[3])
  const columnas = Math.ceil((x1 - x0) / CELDA_COBERTURA)
  const filasRejilla = Math.ceil((y1 - y0) / CELDA_COBERTURA)
  if (columnas * filasRejilla <= 400000 && n > 0) {
    let dentro = 0
    let cubiertas = 0
    const radio2 = e.radio * e.radio
    for (let i = 0; i < columnas; i++) {
      for (let j = 0; j < filasRejilla; j++) {
        const cx = x0 + (i + 0.5) * CELDA_COBERTURA
        const cy = y0 + (j + 0.5) * CELDA_COBERTURA
        const [lon, lat] = plano.aGrados(cx, cy)
        if (!e.piezas.some((poly) => enPoligono(lon, lat, poly))) continue
        dentro++
        for (const p of enMetros) {
          if ((p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= radio2) {
            cubiertas++
            break
          }
        }
      }
    }
    if (dentro > 0) {
      const pct = (cubiertas / dentro) * 100
      const haDentro = (dentro * CELDA_COBERTURA * CELDA_COBERTURA) / 1e4
      secciones.push({
        titulo: `Territorio a menos de ${numero(e.radio)} m`,
        filas: [
          { etiqueta: 'Superficie del ámbito', valor: `${numero(Math.round(haDentro))} ha` },
          {
            etiqueta: 'Cubierta',
            valor: `${numero(Math.round((cubiertas * CELDA_COBERTURA * CELDA_COBERTURA) / 1e4))} ha · ${porcentaje(pct)}`,
          },
          {
            etiqueta: 'Sin cubrir',
            valor: `${numero(Math.round(((dentro - cubiertas) * CELDA_COBERTURA * CELDA_COBERTURA) / 1e4))} ha · ${porcentaje(100 - pct)}`,
          },
        ],
        lectura: `${porcentaje(pct)} del ámbito queda a menos de ${numero(e.radio)} m de algún registro, medido en línea recta sobre una rejilla de ${CELDA_COBERTURA} m. El resto son ${numero(Math.round(((dentro - cubiertas) * CELDA_COBERTURA * CELDA_COBERTURA) / 1e4))} hectáreas donde no llegó nada.`,
      })
    }
  } else {
    avisos.push('El ámbito es demasiado grande para medir la cobertura con una rejilla de 100 m.')
  }

  /* ── 7. Las zonas con más y con menos ────────────────────────────────── */
  if (e.zonas && zonasPreparadas.length > 0) {
    const cuenta = new Map<number, number>()
    for (const p of e.puntos) {
      const z = zonaDe(zonasPreparadas, p.lon, p.lat)
      if (z) cuenta.set(z.indice, (cuenta.get(z.indice) ?? 0) + 1)
    }
    const nombreDe = (z: Zona) => {
      for (const clave of ['nombre', 'NOMBRE', 'barrio', 'clave', 'rotulo', 'name']) {
        const v = z.props[clave]
        if (v !== undefined && v !== null && v !== '') return String(v)
      }
      return `Zona ${z.indice + 1}`
    }
    const lista = zonasPreparadas
      .map((z) => ({
        nombre: nombreDe(z),
        n: cuenta.get(z.indice) ?? 0,
        ha: z.areaM2 / 1e4,
      }))
      .sort((a, b) => b.n - a.n)
    secciones.push({
      titulo: 'Las cinco zonas con más',
      filas: lista.slice(0, 5).map((z) => ({
        etiqueta: z.nombre,
        valor: `${numero(z.n)} · ${cifra(z.n / Math.max(0.01, z.ha / 100), 1)} por km²`,
      })),
    })
    const vacias = lista.filter((z) => z.n === 0)
    if (vacias.length > 0) {
      secciones.push({
        titulo: `Zonas sin ningún registro (${numero(vacias.length)})`,
        filas: vacias.slice(0, 12).map((z) => ({
          etiqueta: z.nombre,
          valor: `${numero(Math.round(z.ha))} ha`,
        })),
        lectura:
          vacias.length > 12
            ? `Se listan las 12 primeras de ${numero(vacias.length)}. La capa de conteo por zona, exportada, las trae todas.`
            : undefined,
      })
    }
  }

  return {
    titulo: `Diagnóstico territorial · ${e.nombreCapa}`,
    subtitulo: `${numero(n)} registros${e.campo ? ` separados por «${e.campo}»` : ''} sobre ${e.nombreAmbito}`,
    secciones,
    generado: new Date().toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' }),
    avisos,
  }
}
