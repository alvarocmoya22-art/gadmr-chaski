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
import type { Capa, Forma } from "./cargar";

/** Un hueco de la frase, que el usuario rellena. */
export interface Hueco {
  /** La clave del parámetro de la herramienta; `entrada` es la capa de entrada. */
  clave: string;
  tipo: "capa" | "numero" | "campo";
  /** Para los huecos de capa: qué formas sirven. */
  formas?: Forma[];
  /** Lo que se lee mientras está vacío. */
  pista: string;
  defecto?: string;
  unidad?: string;
  /** Para los huecos de campo: solo los que traen fechas. */
  soloFecha?: boolean;
}

export interface Receta {
  clave: string;
  /** La pregunta, tal como la haría alguien que no sabe SIG. */
  pregunta: string;
  /** La frase con huecos: los textos y los huecos, en orden. */
  frase: (string | Hueco)[];
  /** Qué devuelve, en una línea. */
  devuelve: string;
  herramienta: string;
  /** Parámetros que la receta fija sin preguntar. */
  fijos?: Record<string, string>;
  /** Un ejemplo de lo que esta pregunta responde. Acompaña al aviso de qué falta. */
  sugerencia?: string;
  /**
   * La pregunta dicha en concreto, con los nombres de las capas dentro.
   *
   * `{entrada}` y los demás se sustituyen por lo que se haya elegido. Es lo
   * que permite proponer «¿Cuántos Equipamientos hay en cada Barrio?» en vez
   * de «¿Cuántos hay en cada zona?»: la misma pregunta, pero ya hablando de
   * los datos que hay encima de la mesa.
   */
  plantilla: string;
}

/** La capa de entrada de la herramienta. */
const ENTRADA = "entrada";

const CUALQUIERA: Forma[] = ["punto", "linea", "poligono", "mixta"];
const AREAS: Forma[] = ["poligono", "mixta"];

export const RECETAS: Receta[] = [
  {
    clave: "avance",
    plantilla: "¿Cómo avanzaron los registros de {entrada} mes a mes?",
    pregunta: "¿Cómo avanzó mes a mes?",
    frase: [
      "Ver cómo avanzaron los registros de",
      {
        clave: ENTRADA,
        tipo: "capa",
        formas: CUALQUIERA,
        pista: "una capa con fechas",
      },
      "según la fecha de",
      {
        clave: "campoFecha",
        tipo: "campo",
        pista: "la columna",
        soloFecha: true,
      },
    ],
    devuelve:
      "Los registros pintados del más antiguo al más reciente, y la cuenta de cada mes con su acumulado.",
    herramienta: "avance-tiempo",
    fijos: { paso: "mes" },
    sugerencia: "Los trámites por su fecha de ingreso.",
  },
  {
    clave: "contar",
    plantilla: "¿Cuántos {entrada} hay en cada {zonas:uno}?",
    pregunta: "¿Cuántos hay en cada zona?",
    frase: [
      "Contar los registros de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
      "que caen en cada",
      { clave: "zonas", tipo: "capa", formas: AREAS, pista: "capa de zonas" },
    ],
    devuelve:
      "Las zonas pintadas según cuántos registros recibió cada una, con su densidad.",
    herramienta: "agregar-puntos",
    fijos: { estadistico: "cuenta" },
    sugerencia: "Equipamientos en cada barrio.",
  },
  {
    clave: "lejos",
    plantilla: "¿Qué tan lejos queda {destinos} desde cada {entrada:uno}?",
    pregunta: "¿Qué tan lejos queda lo que la gente necesita?",
    frase: [
      "Medir desde cada registro de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
      "hasta lo más cercano de",
      {
        clave: "destinos",
        tipo: "capa",
        formas: CUALQUIERA,
        pista: "la capa de destinos",
      },
      ", avisando de lo que pase de",
      {
        clave: "umbral",
        tipo: "numero",
        pista: "500",
        defecto: "500",
        unidad: "m",
      },
    ],
    devuelve:
      "Cada registro con su distancia, y cuántos quedan por encima del umbral.",
    herramienta: "distancia-cercano",
    fijos: { cuantos: "1" },
    sugerencia: "Desde cada barrio hasta el equipamiento más cercano.",
  },
  {
    clave: "desatendidos",
    plantilla: "¿Qué parte de {ambito} queda lejos de {entrada}?",
    pregunta: "¿Qué sectores quedan desatendidos?",
    frase: [
      "Pintar el territorio de",
      {
        clave: "ambito",
        tipo: "capa",
        formas: AREAS,
        pista: "una capa de límites",
      },
      "según lo lejos que queda",
      {
        clave: ENTRADA,
        tipo: "capa",
        formas: CUALQUIERA,
        pista: "lo que se busca",
      },
    ],
    devuelve: "Una rejilla donde se ve de un vistazo el sector peor servido.",
    herramienta: "mapa-cercania",
    fijos: { celda: "150", cuantos: "1" },
    sugerencia: "Las plataformas según lo lejos que quedan los equipamientos.",
  },
  {
    clave: "concentracion",
    plantilla: "¿Dónde se amontonan los {entrada}?",
    pregunta: "¿Dónde se amontonan?",
    frase: [
      "Buscar dónde se concentran los registros de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
      "dentro de",
      {
        clave: "ambito",
        tipo: "capa",
        formas: AREAS,
        pista: "una capa de límites",
      },
    ],
    devuelve:
      "Las manchas donde hay más de lo que habría por azar, con su nivel de confianza.",
    herramienta: "hotspot",
    fijos: { celda: "150" },
    sugerencia: "Equipamientos dentro de las plataformas.",
  },
  {
    clave: "cobertura",
    plantilla: "¿Qué área cubre un radio alrededor de cada {entrada}?",
    pregunta: "¿Qué área cubre un radio?",
    frase: [
      "Dibujar lo que queda a menos de",
      {
        clave: "metros",
        tipo: "numero",
        pista: "500",
        defecto: "500",
        unidad: "m",
      },
      "de cada registro de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
    ],
    devuelve:
      "El área cubierta, fundida en una sola pieza para que no se cuente dos veces.",
    herramienta: "zona-influencia",
    fijos: { fundir: "si" },
    sugerencia: "500 m alrededor de cada equipamiento.",
  },
  {
    clave: "superficie-zona",
    plantilla: "¿Cuánta superficie de {entrada} hay en cada {zonas:uno}?",
    pregunta: "¿Cuánta superficie hay en cada zona?",
    frase: [
      "Medir cuánta superficie de",
      {
        clave: ENTRADA,
        tipo: "capa",
        formas: AREAS,
        pista: "una capa de áreas",
      },
      "cae en cada",
      { clave: "zonas", tipo: "capa", formas: AREAS, pista: "capa de zonas" },
    ],
    devuelve:
      "Las zonas con las hectáreas que les toca y el porcentaje que ocupan.",
    herramienta: "agregar-poligonos",
    sugerencia: "El uso del suelo en cada plataforma.",
  },
  {
    clave: "kilometros",
    plantilla: "¿Cuántos kilómetros de {entrada} hay en cada {zonas:uno}?",
    pregunta: "¿Cuántos kilómetros de vía hay en cada zona?",
    frase: [
      "Medir los kilómetros de",
      {
        clave: ENTRADA,
        tipo: "capa",
        formas: ["linea", "mixta"],
        pista: "una capa de líneas",
      },
      "que hay en cada",
      { clave: "zonas", tipo: "capa", formas: AREAS, pista: "capa de zonas" },
    ],
    devuelve: "Las zonas con sus kilómetros y su densidad en km por km².",
    herramienta: "km-zona",
    sugerencia: "Vialidad en cada barrio.",
  },
  {
    clave: "clases",
    plantilla: "¿Cuántas hectáreas hay de cada «{campo}» en {entrada}?",
    pregunta: "¿Cuánto hay de cada clase?",
    frase: [
      "Medir cuántas hectáreas hay de cada valor de",
      { clave: "campo", tipo: "campo", pista: "un campo" },
      "en",
      {
        clave: ENTRADA,
        tipo: "capa",
        formas: AREAS,
        pista: "una capa de áreas",
      },
    ],
    devuelve: "El reparto por clase, en hectáreas y en porcentaje.",
    herramienta: "superficie-clase",
    sugerencia: "Las hectáreas de cada clase de suelo.",
  },
  {
    clave: "sectores",
    plantilla: "¿Cómo reparto {entrada} en sectores de trabajo?",
    pregunta: "¿Cómo reparto esto en sectores de trabajo?",
    frase: [
      "Repartir los registros de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
      "en",
      { clave: "grupos", tipo: "numero", pista: "6", defecto: "6" },
      "sectores compactos",
    ],
    devuelve:
      "Cada registro con el sector que le toca, juntando los que están cerca.",
    herramienta: "agrupamiento",
    sugerencia: "Los equipamientos en 6 sectores.",
  },
  {
    clave: "dentro",
    plantilla: "¿Qué parte de {entrada} cae dentro de {molde}?",
    pregunta: "¿Qué parte de esta capa cae dentro de aquella?",
    frase: [
      "Quedarme solo con lo de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
      "que cae dentro de",
      {
        clave: "molde",
        tipo: "capa",
        formas: AREAS,
        pista: "una capa de áreas",
      },
    ],
    devuelve: "Una capa nueva recortada, partiendo las piezas por el límite.",
    herramienta: "recortar",
    sugerencia: "La vialidad dentro de un barrio.",
  },
  {
    clave: "juntar",
    plantilla: "¿De qué {otra:uno} es cada registro de {entrada}?",
    pregunta: "¿De qué zona es cada registro?",
    frase: [
      "Traer a cada registro de",
      { clave: ENTRADA, tipo: "capa", formas: CUALQUIERA, pista: "una capa" },
      "los datos de",
      { clave: "otra", tipo: "capa", formas: AREAS, pista: "la capa de zonas" },
      "donde cae",
    ],
    devuelve:
      "La misma capa con los campos de la zona añadidos a cada registro.",
    herramienta: "unir-campos",
    fijos: { modo: "ubicacion" },
    sugerencia: "A cada equipamiento, el barrio donde está.",
  },
];

export { ENTRADA };

/* ------------------------------------------------------------------ *
 * Qué se puede responder con lo que hay cargado
 * ------------------------------------------------------------------ */

/** El veredicto de una pregunta frente a las capas de la mesa. */
export interface Veredicto {
  puede: boolean;
  /** Qué falta exactamente, en una línea. Vacío cuando sí se puede. */
  falta: string;
}

const NOMBRE_FORMA: Record<Forma, string> = {
  punto: "de puntos",
  linea: "de líneas",
  poligono: "de áreas",
  mixta: "de formas mezcladas",
};

/** Cómo se llama lo que pide un hueco: «una capa de áreas», «una capa». */
function pideCapa(formas: Forma[]): string {
  // «mixta» acompaña siempre a otra forma: nombrarla no añade nada y
  // «una capa de áreas o de formas mezcladas» no lo entiende nadie.
  const propias = formas.filter((f) => f !== "mixta");
  if (propias.length === 0 || propias.length >= 3) return "una capa";
  return `una capa ${propias.map((f) => NOMBRE_FORMA[f]).join(" o ")}`;
}

const capasPara = (capas: Capa[], h: Hueco) =>
  capas.filter((c) => (h.formas ?? []).includes(c.forma));

/** Un campo sirve para agrupar si repite valores y no es un identificador. */
const tieneClases = (c: Capa) =>
  c.campos.some((f) => f.distintos > 1 && f.distintos <= 200);

/**
 * Si una pregunta se puede responder ahora mismo, y si no, qué falta.
 *
 * Antes esto solo miraba las capas, y por eso «¿Cómo avanzó mes a mes?» se
 * ofrecía como disponible con cualquier capa cargada: la pregunta pide además
 * una columna de fechas, y eso no se veía hasta abrir la frase y encontrarse
 * el desplegable diciendo «esa capa no trae fechas». La comprobación del campo
 * va contra las capas que pueden ocupar el hueco de entrada, porque el campo
 * se elige siempre sobre esa capa.
 */
export function factibilidad(r: Receta, capas: Capa[]): Veredicto {
  const huecos = r.frase.filter((x): x is Hueco => typeof x !== "string");

  for (const h of huecos) {
    if (h.tipo !== "capa") continue;
    if (capasPara(capas, h).length === 0) {
      return {
        puede: false,
        falta: `No hay cargada ${pideCapa(h.formas ?? [])}.`,
      };
    }
  }

  const entrada = huecos.find((h) => h.clave === ENTRADA && h.tipo === "capa");
  const posibles = entrada ? capasPara(capas, entrada) : capas;

  for (const h of huecos) {
    if (h.tipo !== "campo") continue;
    if (h.soloFecha) {
      if (!posibles.some((c) => (c.fechas ?? []).length > 0)) {
        return {
          puede: false,
          falta: "Ninguna capa que sirva trae una columna de fechas.",
        };
      }
    } else if (!posibles.some(tieneClases)) {
      return {
        puede: false,
        falta:
          "Ninguna capa que sirva trae una columna con valores que se repitan.",
      };
    }
  }

  return { puede: true, falta: "" };
}
