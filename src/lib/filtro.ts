/**
 * El filtro de una capa por su propia tabla de atributos.
 *
 * Es lo que le faltaba a CHASKI para ser un analizador de capas y no el visor
 * de Riobamba metido en otro sitio. Hasta ahora lo único que recortaba era el
 * modo Mirar, y ese sabe de parroquias, plataformas y barrios: con un
 * shapefile cualquiera o una tabla de PostGIS no servía de nada.
 *
 * Esto es lo contrario: no sabe nada del territorio, solo de la capa. Eliges
 * un campo y qué valores dejas pasar.
 *
 * El filtro vive EN LA CAPA, no en un panel aparte, porque es una propiedad de
 * ella: se guarda con la mesa, viaja a las herramientas y al mapa, y se ve
 * desde la misma tarjeta donde se puso. Un filtro que hay que recordar que
 * está puesto es un número equivocado esperando su turno.
 */
import type { Capa } from "./cargar";

/**
 * Un filtro es de una de dos clases, y se distinguen por si traen `op`.
 *
 * NO HAY CAMPO `tipo` NI MIGRACION. Los filtros se guardan en IndexedDB con la
 * mesa, asi que los que ya estan escritos en la maquina de alguien tienen que
 * seguir valiendo: traen `campo` y `valores` y ninguno trae `op`, con lo cual
 * siguen siendo exactamente un filtro por lista. Anadir un `tipo` obligatorio
 * habria roto en silencio toda mesa guardada antes de hoy.
 */
export type Filtro = FiltroLista | FiltroRango;

/** Un campo y los valores que se quedan. Sin valores, la capa entera. */
export interface FiltroLista {
  campo: string;
  valores: string[];
  op?: undefined;
}

/** Las comparaciones que se ofrecen sobre un campo numerico. */
export type Operador = ">=" | ">" | "<=" | "<" | "entre";

/**
 * Un campo numerico y el tramo que pasa.
 *
 * Marcar valores de una lista sirve para un campo con quince valores
 * distintos; no sirve para «predios de 1.000 m2 o mas», donde habria que ir
 * marcando centenares de cifras a mano. Para eso esta esto.
 */
export interface FiltroRango {
  campo: string;
  op: Operador;
  a: number;
  /** Solo con `entre`: el otro extremo, incluido. */
  b?: number;
}

export const esRango = (f: Filtro): f is FiltroRango => f.op !== undefined;

/**
 * El numero que hay dentro de un valor, o NaN si no hay ninguno.
 *
 * El modulo compara por texto a proposito —lo explica `comoTexto`—, pero un
 * tramo numerico no se puede comparar asi: «90» seria menor que «1.000» porque
 * el 9 va despues del 1. Aqui se convierte, y se admiten las dos escrituras
 * que llegan de verdad en una tabla municipal:
 *
 *     1234.56     como lo escribe un GeoJSON o un shapefile
 *     1.234,56    como lo escribe un CSV exportado de Excel en es-EC
 *
 * Lo que no sea una de las dos devuelve NaN y su fila se queda fuera del
 * tramo. No se adivina: «s/d», «—» o «1.234» con el punto como decimal
 * ingles y el mismo aspecto que el de miles no se pueden distinguir sin
 * inventar, y una fila mal convertida es peor que una fila que no pasa.
 */
export function aNumero(v: unknown): number {
  if (typeof v === "number") return v;
  const s = comoTexto(v).trim();
  if (s === "") return NaN;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  return NaN;
}

/**
 * Si un campo admite comparacion numerica, y entre que valores se mueve.
 *
 * Se exige que la gran mayoria de las filas con algo escrito traigan un
 * numero. Con el umbral mas bajo, un campo de texto que empieza por codigos
 * —«0601», «0602»— se ofreceria como numerico y el usuario pediria «mayor que
 * 600» sobre nombres de parroquia.
 *
 * `sinNumero` no es un detalle: son las filas que un tramo deja fuera pase lo
 * que pase, y el panel tiene que decirlo antes de que alguien reste dos
 * totales y no le cuadren.
 */
export function perfilNumerico(
  geo: GeoJSON.FeatureCollection,
  campo: string,
): { numerico: boolean; min: number; max: number; sinNumero: number } {
  let min = Infinity;
  let max = -Infinity;
  let conNumero = 0;
  let conAlgo = 0;
  for (const f of geo.features) {
    const bruto = f.properties?.[campo];
    if (comoTexto(bruto).trim() === "") continue;
    conAlgo++;
    const n = aNumero(bruto);
    if (Number.isFinite(n)) {
      conNumero++;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  return {
    numerico: conAlgo > 0 && conNumero / conAlgo >= 0.9,
    min: conNumero ? min : 0,
    max: conNumero ? max : 0,
    sinNumero: conAlgo - conNumero,
  };
}

/** Si un valor cae dentro del tramo pedido. */
export function enRango(n: number, f: FiltroRango): boolean {
  if (!Number.isFinite(n)) return false;
  switch (f.op) {
    case ">=":
      return n >= f.a;
    case ">":
      return n > f.a;
    case "<=":
      return n <= f.a;
    case "<":
      return n < f.a;
    case "entre": {
      const [lo, hi] = f.b !== undefined && f.b < f.a ? [f.b, f.a] : [f.a, f.b];
      return hi === undefined ? n >= lo : n >= lo && n <= hi;
    }
  }
}

/**
 * El texto de un valor, que es con lo que se compara.
 *
 * Todo se compara como texto a propósito. Un campo de una tabla municipal
 * trae el mismo código unas veces como número y otras como cadena —«0601» y
 * 601—, y comparar por tipo deja fuera la mitad de las filas sin avisar. Para
 * elegir de una lista, el texto es lo que se ve y lo que se marca.
 */
export const comoTexto = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

/** Lo que se enseña cuando un registro no trae nada en ese campo. */
export const VACIO = "(sin valor)";

/**
 * Los valores distintos de un campo, con cuántos registros tiene cada uno.
 *
 * Ordenados por frecuencia y no alfabéticamente: lo que uno busca al abrir
 * esto es «de qué hay mucho y de qué hay poco», y con cuarenta valores en
 * orden alfabético eso no se ve.
 */
export function valoresDe(
  geo: GeoJSON.FeatureCollection,
  campo: string,
): { valor: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const f of geo.features) {
    const v = comoTexto(f.properties?.[campo]).trim();
    const clave = v === "" ? VACIO : v;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "es"));
}

/**
 * Si el filtro de verdad quita algo.
 *
 * Uno sin valores no es un filtro, y uno de tramo sin un numero tampoco: un
 * campo de cifra a medio escribir —el usuario borro el contenido para teclear
 * otro— no puede vaciar la capa mientras tanto.
 */
export const filtraAlgo = (f: Filtro | undefined): f is Filtro => {
  if (!f || !f.campo) return false;
  if (esRango(f)) {
    return Number.isFinite(f.a) && (f.op !== "entre" || Number.isFinite(f.b));
  }
  return f.valores.length > 0;
};

/** La capa con solo las filas que pasan el filtro. */
export function aplicar(
  geo: GeoJSON.FeatureCollection,
  filtro: Filtro,
): GeoJSON.FeatureCollection {
  if (esRango(filtro)) {
    return {
      type: "FeatureCollection",
      features: geo.features.filter((f) =>
        enRango(aNumero(f.properties?.[filtro.campo]), filtro),
      ),
    };
  }
  const deja = new Set(filtro.valores);
  return {
    type: "FeatureCollection",
    features: geo.features.filter((f) => {
      const v = comoTexto(f.properties?.[filtro.campo]).trim();
      return deja.has(v === "" ? VACIO : v);
    }),
  };
}

/**
 * La capa ya filtrada, o la misma si no tiene filtro.
 *
 * Devuelve el MISMO objeto cuando no hay nada que filtrar, para no obligar a
 * React a volver a dibujar ni a las herramientas a recalcular por una copia
 * idéntica.
 */
export const filtrada = (c: Capa): Capa =>
  filtraAlgo(c.filtro) ? { ...c, geo: aplicar(c.geo, c.filtro) } : c;

/** Los signos tal como se leen, no tal como se escriben en el código. */
export const SIGNO: Record<Operador, string> = {
  ">=": "≥",
  ">": ">",
  "<=": "≤",
  "<": "<",
  entre: "entre",
};

/** Cómo se lee un filtro puesto, para decirlo en una línea. */
export function comoFrase(f: Filtro): string {
  if (esRango(f)) {
    const n = (x: number | undefined) =>
      x === undefined || !Number.isFinite(x)
        ? "?"
        : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(x);
    return f.op === "entre"
      ? `${f.campo} entre ${n(f.a)} y ${n(f.b)}`
      : `${f.campo} ${SIGNO[f.op]} ${n(f.a)}`;
  }
  if (f.valores.length === 1) return `${f.campo} = ${f.valores[0]}`;
  return `${f.campo}: ${f.valores.length} valores`;
}
