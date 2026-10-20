/**
 * Leer las fechas de una capa sin equivocarse de mes.
 *
 * Una tabla de campaña casi siempre trae una columna de fecha, y casi nunca en
 * el mismo formato: lo que sale de un formulario viene en `2026-03-14`, lo que
 * sale de Excel en español viene en `14/03/2026`, y lo que alguien copió de un
 * sistema en inglés puede venir en `03/14/2026`.
 *
 * **Ahí es donde esto se rompe en silencio.** `03/04/2026` es el 3 de abril o
 * el 4 de marzo según quién lo escribiera, y elegir mal no da ningún error:
 * da un informe con la campaña repartida en los meses equivocados. Así que el
 * orden no se asume: se deduce del propio dato siempre que se pueda, y cuando
 * no se puede, se dice que se asumió.
 */

/** Cómo se leyeron el día y el mes de una columna. */
/**
 * Cómo hay que leer los números de una fecha.
 *
 * `palabras` no es un orden: es la señal de que el mes viene escrito —«31 de
 * agosto de 2026»— y de que, por tanto, no hay nada que deducir. Vale la pena
 * distinguirlo porque es la diferencia entre decir «asumido, podría salir
 * cambiado» y decir que no puede estar cambiado.
 */
export type OrdenFecha = "iso" | "dia-mes" | "mes-dia" | "palabras";

export interface Fechas {
  campo: string;
  /** Valores que se pudieron leer. */
  leidas: number;
  /** Valores con algo escrito que no se pudo leer como fecha. */
  ilegibles: number;
  desde: Date;
  hasta: Date;
  orden: OrdenFecha;
  /**
   * Cierto si el orden salió del dato —porque algún día pasa de 12— y falso si
   * no había forma de saberlo y se tomó el del país.
   */
  seguro: boolean;
}

/** Qué parte del calendario agrupa cada registro. */
export type Paso = "dia" | "semana" | "mes" | "anio";

export const PASOS: { clave: Paso; rotulo: string }[] = [
  { clave: "dia", rotulo: "Día" },
  { clave: "semana", rotulo: "Semana" },
  { clave: "mes", rotulo: "Mes" },
  { clave: "anio", rotulo: "Año" },
];

/** Los tres números de una fecha escrita con separadores, sin interpretarlos. */
/**
 * Las fechas escritas con el mes en palabras.
 *
 * «31 DE JULIO DEL 2022» es como están escritas las fechas de resolución en
 * las tablas de trámite del municipio —licencias, reconocimientos,
 * habilitaciones—. Sin esto, esas columnas no se reconocen como fechas y la
 * pregunta «¿cómo avanzó mes a mes?» no se puede hacer justo sobre los datos
 * que más se consultan.
 *
 * Se aceptan «de» y «del», con y sin tildes, en mayúsculas o minúsculas,
 * porque las tres formas conviven en la misma columna.
 */
const MES_POR_NOMBRE: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function fechaEnPalabras(texto: string): [number, number, number] | null {
  const limpio = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = limpio.match(/(\d{1,2})\s+de[l]?\s+([a-z]+)\s+de[l]?\s+(\d{4})/);
  if (!m) return null;
  const mes = MES_POR_NOMBRE[m[2]];
  if (!mes) return null;
  return [Number.parseInt(m[3], 10), mes, Number.parseInt(m[1], 10)];
}

function trozos(texto: string): [number, number, number] | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  // Se corta por el primer espacio: lo que sigue es la hora, que aquí no importa.
  const soloFecha = limpio.split(/[ T]/)[0];
  const partes = soloFecha.split(/[/\-.]/);
  if (partes.length !== 3) return null;
  const n = partes.map((p) => Number.parseInt(p, 10));
  if (n.some((x) => !Number.isFinite(x))) return null;
  return [n[0], n[1], n[2]];
}

/** Cierto si la cadena empieza por un año de cuatro cifras. */
const pareceIso = (texto: string) => /^\d{4}[-/.]/.test(texto.trim());

/**
 * Qué orden tienen el día y el mes en una columna.
 *
 * Se recorren todos los valores buscando uno que lo resuelva: si alguno tiene
 * un primer número mayor que 12, solo puede ser el día; si alguno tiene el
 * segundo mayor que 12, solo puede ser el mes el primero. Si ninguno lo
 * resuelve —una campaña que duró del 3 al 9 de un mes, por ejemplo— se toma el
 * orden de aquí, día y mes, y se marca como no seguro.
 */
function deducirOrden(valores: string[]): {
  orden: OrdenFecha;
  seguro: boolean;
} {
  // Con el mes escrito no hay orden que deducir ni duda que advertir.
  const enPalabras = valores.filter((v) => fechaEnPalabras(v) !== null).length;
  if (enPalabras / valores.length >= 0.8)
    return { orden: "palabras", seguro: true };

  let iso = 0;
  let conSeparador = 0;
  let diaPrimero = false;
  let mesPrimero = false;
  for (const v of valores) {
    if (pareceIso(v)) {
      iso++;
      continue;
    }
    const t = trozos(v);
    if (!t) continue;
    conSeparador++;
    if (t[0] > 12) diaPrimero = true;
    if (t[1] > 12) mesPrimero = true;
  }
  if (iso > conSeparador) return { orden: "iso", seguro: true };
  // Si el dato dice las dos cosas, está mezclado; se avisa dejándolo inseguro.
  if (diaPrimero && !mesPrimero) return { orden: "dia-mes", seguro: true };
  if (mesPrimero && !diaPrimero) return { orden: "mes-dia", seguro: true };
  return { orden: "dia-mes", seguro: false };
}

/** Una fecha a partir de su texto, con el orden ya decidido. */
export function leerFecha(texto: unknown, orden: OrdenFecha): Date | null {
  if (texto === null || texto === undefined) return null;
  const s = String(texto);
  let anio: number;
  let mes: number;
  let dia: number;

  // Con el mes en palabras no hay ambigüedad posible: se lee y se acabó.
  const enPalabras = fechaEnPalabras(s);
  if (enPalabras) {
    [anio, mes, dia] = enPalabras;
    return armar(anio, mes, dia);
  }

  const t = trozos(s);
  if (!t) return null;
  if (orden === "iso" || pareceIso(s)) {
    [anio, mes, dia] = t;
  } else if (orden === "mes-dia") {
    [mes, dia, anio] = t;
  } else {
    [dia, mes, anio] = t;
  }
  return armar(anio, mes, dia);
}

/** Comprueba y arma la fecha. Compartido por los dos caminos de lectura. */
function armar(anio: number, mes: number, dia: number): Date | null {
  // Un año de dos cifras se completa al siglo en curso; antes de 1900 no hay
  // campaña municipal que valga.
  if (anio < 100) anio += 2000;
  if (anio < 1900 || anio > 2200) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  // Rebota el 31 de febrero y cualquier otra fecha que no existe.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

/** Cuántos valores hay que mirar para decidir si una columna son fechas. */
const MUESTRA = 400;

/**
 * Las columnas que traen fechas, con su rango y cómo se leyeron.
 *
 * Una columna cuenta como de fechas si al menos cuatro de cada cinco de sus
 * valores escritos se pueden leer. Por debajo de eso suele ser otra cosa —un
 * código con guiones, una medida— y ofrecerla como eje de tiempo solo despista.
 */
export function detectarFechas(
  rasgos: GeoJSON.Feature[],
  campos: { nombre: string }[],
): Fechas[] {
  const salida: Fechas[] = [];
  for (const { nombre } of campos) {
    const valores: string[] = [];
    for (const f of rasgos) {
      if (valores.length >= MUESTRA) break;
      const v = (f.properties ?? {})[nombre];
      if (v === null || v === undefined || v === "") continue;
      valores.push(String(v));
    }
    if (valores.length < 3) continue;

    const { orden, seguro } = deducirOrden(valores);
    let leidas = 0;
    for (const v of valores) if (leerFecha(v, orden)) leidas++;
    if (leidas / valores.length < 0.8) continue;

    // Ya sabemos que es de fechas: ahora el rango, con todos los registros.
    let desde: Date | null = null;
    let hasta: Date | null = null;
    let total = 0;
    let malas = 0;
    for (const f of rasgos) {
      const v = (f.properties ?? {})[nombre];
      if (v === null || v === undefined || v === "") continue;
      const d = leerFecha(v, orden);
      if (!d) {
        malas++;
        continue;
      }
      total++;
      if (!desde || d < desde) desde = d;
      if (!hasta || d > hasta) hasta = d;
    }
    if (!desde || !hasta) continue;
    salida.push({
      campo: nombre,
      leidas: total,
      ilegibles: malas,
      desde,
      hasta,
      orden,
      seguro,
    });
  }
  return salida;
}

/** El periodo al que pertenece una fecha: una clave ordenable y su rótulo. */
export function periodoDe(d: Date, paso: Paso): { n: number; rotulo: string } {
  const a = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const dia = d.getUTCDate();
  if (paso === "anio") return { n: a, rotulo: String(a) };
  if (paso === "mes") {
    return { n: a * 100 + m, rotulo: `${MESES[m - 1]} ${a}` };
  }
  if (paso === "dia") {
    return {
      n: a * 10000 + m * 100 + dia,
      rotulo: `${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`,
    };
  }
  /*
   * La semana se nombra por el lunes en que empieza, no por su número.
   * «Semana del 9 de marzo» se entiende en una mesa de trabajo; «semana 11»
   * obliga a ir a buscar un calendario.
   */
  const lunes = new Date(d);
  const diaSemana = (d.getUTCDay() + 6) % 7;
  lunes.setUTCDate(d.getUTCDate() - diaSemana);
  const la = lunes.getUTCFullYear();
  const lm = lunes.getUTCMonth() + 1;
  const ld = lunes.getUTCDate();
  return {
    n: la * 10000 + lm * 100 + ld,
    rotulo: `Semana del ${ld} ${MESES[lm - 1].toLowerCase()}`,
  };
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Cómo se leyó la columna, en una frase para la ficha. */
export function comoSeLeyo(f: Fechas): string {
  if (f.orden === "palabras") {
    return "Leído con el mes escrito en palabras, así que no hay orden que confundir.";
  }
  const formato =
    f.orden === "iso"
      ? "año-mes-día"
      : f.orden === "dia-mes"
        ? "día/mes/año"
        : "mes/día/año";
  const seguridad = f.seguro
    ? "y el propio dato lo confirma"
    : "asumido, porque ningún valor de la columna lo resuelve: si la tabla viniera en mes/día/año, los periodos saldrían cambiados";
  return `Leído como ${formato}, ${seguridad}.`;
}
