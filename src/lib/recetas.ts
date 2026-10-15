/**
 * El modo guiado: preguntas en vez de herramientas.
 *
 * Esto es lo que GOAT no tiene, y es la diferencia que de verdad importa para
 * una municipalidad. La caja de herramientas de GOAT está escrita para quien ya
 * sabe SIG: hay que saber que lo que uno quiere se llama «Aggregate Points»,
 * que la capa de barrios va en el hueco de las zonas y no al revés, y qué es
 * una agregación ponderada por área.
 *
 * Aquí se entra por la pregunta —«¿cuántos equipamientos hay en cada
 * barrio?»— y la herramienta, sus parámetros y el orden de las capas los pone
 * la receta. Por debajo corre exactamente lo mismo: una receta no es un
 * análisis aparte, es la misma herramienta con los huecos ya rellenos.
 *
 * Quien sepa SIG tiene la caja entera a un clic, en la otra pestaña.
 */
import type { Forma } from './cargar'

/** Un hueco de la frase, que el usuario rellena. */
export interface Hueco {
  /** La clave del parámetro de la herramienta; `entrada` es la capa de entrada. */
  clave: string
  tipo: 'capa' | 'numero' | 'campo'
  /** Para los huecos de capa: qué formas sirven. */
  formas?: Forma[]
  /** Lo que se lee mientras está vacío. */
  pista: string
  defecto?: string
  unidad?: string
}

export interface Receta {
  clave: string
  /** La pregunta, tal como la haría alguien que no sabe SIG. */
  pregunta: string
  /** La frase con huecos: los textos y los huecos, en orden. */
  frase: (string | Hueco)[]
  /** Qué devuelve, en una línea. */
  devuelve: string
  herramienta: string
  /** Parámetros que la receta fija sin preguntar. */
  fijos?: Record<string, string>
  /** Con los datos de ejemplo, qué elegir; se enseña como sugerencia. */
  sugerencia?: string
}

/** La capa de entrada de la herramienta. */
const ENTRADA = 'entrada'

const CUALQUIERA: Forma[] = ['punto', 'linea', 'poligono', 'mixta']
const AREAS: Forma[] = ['poligono', 'mixta']

export const RECETAS: Receta[] = [
  {
    clave: 'contar',
    pregunta: '¿Cuántos hay en cada zona?',
    frase: [
      'Contar los registros de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
      'que caen en cada',
      { clave: 'zonas', tipo: 'capa', formas: AREAS, pista: 'capa de zonas' },
    ],
    devuelve: 'Las zonas pintadas según cuántos registros recibió cada una, con su densidad.',
    herramienta: 'agregar-puntos',
    fijos: { estadistico: 'cuenta' },
    sugerencia: 'Equipamientos en cada barrio.',
  },
  {
    clave: 'lejos',
    pregunta: '¿Qué tan lejos queda lo que la gente necesita?',
    frase: [
      'Medir desde cada registro de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
      'hasta lo más cercano de',
      { clave: 'destinos', tipo: 'capa', formas: CUALQUIERA, pista: 'la capa de destinos' },
      ', avisando de lo que pase de',
      { clave: 'umbral', tipo: 'numero', pista: '500', defecto: '500', unidad: 'm' },
    ],
    devuelve: 'Cada registro con su distancia, y cuántos quedan por encima del umbral.',
    herramienta: 'distancia-cercano',
    fijos: { cuantos: '1' },
    sugerencia: 'Desde cada barrio hasta el equipamiento más cercano.',
  },
  {
    clave: 'desatendidos',
    pregunta: '¿Qué sectores quedan desatendidos?',
    frase: [
      'Pintar el territorio de',
      { clave: 'ambito', tipo: 'capa', formas: AREAS, pista: 'una capa de límites' },
      'según lo lejos que queda',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'lo que se busca' },
    ],
    devuelve: 'Una rejilla donde se ve de un vistazo el sector peor servido.',
    herramienta: 'mapa-cercania',
    fijos: { celda: '150', cuantos: '1' },
    sugerencia: 'Las plataformas según lo lejos que quedan los equipamientos.',
  },
  {
    clave: 'concentracion',
    pregunta: '¿Dónde se amontonan?',
    frase: [
      'Buscar dónde se concentran los registros de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
      'dentro de',
      { clave: 'ambito', tipo: 'capa', formas: AREAS, pista: 'una capa de límites' },
    ],
    devuelve: 'Las manchas donde hay más de lo que habría por azar, con su nivel de confianza.',
    herramienta: 'hotspot',
    fijos: { celda: '150' },
    sugerencia: 'Equipamientos dentro de las plataformas.',
  },
  {
    clave: 'cobertura',
    pregunta: '¿Qué área cubre un radio?',
    frase: [
      'Dibujar lo que queda a menos de',
      { clave: 'metros', tipo: 'numero', pista: '500', defecto: '500', unidad: 'm' },
      'de cada registro de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
    ],
    devuelve: 'El área cubierta, fundida en una sola pieza para que no se cuente dos veces.',
    herramienta: 'zona-influencia',
    fijos: { fundir: 'si' },
    sugerencia: '500 m alrededor de cada equipamiento.',
  },
  {
    clave: 'superficie-zona',
    pregunta: '¿Cuánta superficie hay en cada zona?',
    frase: [
      'Medir cuánta superficie de',
      { clave: ENTRADA, tipo: 'capa', formas: AREAS, pista: 'una capa de áreas' },
      'cae en cada',
      { clave: 'zonas', tipo: 'capa', formas: AREAS, pista: 'capa de zonas' },
    ],
    devuelve: 'Las zonas con las hectáreas que les toca y el porcentaje que ocupan.',
    herramienta: 'agregar-poligonos',
    sugerencia: 'Hace falta cargar una capa de suelo o de uso.',
  },
  {
    clave: 'kilometros',
    pregunta: '¿Cuántos kilómetros de vía hay en cada zona?',
    frase: [
      'Medir los kilómetros de',
      { clave: ENTRADA, tipo: 'capa', formas: ['linea', 'mixta'], pista: 'una capa de líneas' },
      'que hay en cada',
      { clave: 'zonas', tipo: 'capa', formas: AREAS, pista: 'capa de zonas' },
    ],
    devuelve: 'Las zonas con sus kilómetros y su densidad en km por km².',
    herramienta: 'km-zona',
    sugerencia: 'Vialidad en cada barrio.',
  },
  {
    clave: 'clases',
    pregunta: '¿Cuánto hay de cada clase?',
    frase: [
      'Medir cuántas hectáreas hay de cada valor de',
      { clave: 'campo', tipo: 'campo', pista: 'un campo' },
      'en',
      { clave: ENTRADA, tipo: 'capa', formas: AREAS, pista: 'una capa de áreas' },
    ],
    devuelve: 'El reparto por clase, en hectáreas y en porcentaje.',
    herramienta: 'superficie-clase',
    sugerencia: 'Hace falta una capa de clasificación del suelo.',
  },
  {
    clave: 'sectores',
    pregunta: '¿Cómo reparto esto en sectores de trabajo?',
    frase: [
      'Repartir los registros de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
      'en',
      { clave: 'grupos', tipo: 'numero', pista: '6', defecto: '6' },
      'sectores compactos',
    ],
    devuelve: 'Cada registro con el sector que le toca, juntando los que están cerca.',
    herramienta: 'agrupamiento',
    sugerencia: 'Los equipamientos en 6 sectores.',
  },
  {
    clave: 'dentro',
    pregunta: '¿Qué parte de esta capa cae dentro de aquella?',
    frase: [
      'Quedarme solo con lo de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
      'que cae dentro de',
      { clave: 'molde', tipo: 'capa', formas: AREAS, pista: 'una capa de áreas' },
    ],
    devuelve: 'Una capa nueva recortada, partiendo las piezas por el límite.',
    herramienta: 'recortar',
    sugerencia: 'La vialidad dentro de un barrio.',
  },
  {
    clave: 'juntar',
    pregunta: '¿De qué zona es cada registro?',
    frase: [
      'Traer a cada registro de',
      { clave: ENTRADA, tipo: 'capa', formas: CUALQUIERA, pista: 'una capa' },
      'los datos de',
      { clave: 'otra', tipo: 'capa', formas: AREAS, pista: 'la capa de zonas' },
      'donde cae',
    ],
    devuelve: 'La misma capa con los campos de la zona añadidos a cada registro.',
    herramienta: 'unir-campos',
    fijos: { modo: 'ubicacion' },
    sugerencia: 'A cada equipamiento, el barrio donde está.',
  },
]

export { ENTRADA }
