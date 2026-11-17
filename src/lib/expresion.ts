/**
 * Un lenguaje de expresiones para filtrar una capa, como el de QGIS.
 *
 * Marcar valores de una lista sirve para una categoría y comparar un número
 * sirve para un tramo, pero ninguno de los dos deja decir lo que de verdad se
 * pregunta sobre un catastro:
 *
 *     "area_m2" >= 10000 AND "area_m2" <= 15000
 *     "uso" = 'Residencial' AND "pisos" > 3
 *     "clave" LIKE '0601%' AND NOT "estado" IN ('Malo', 'Ruinoso')
 *     "poblacion" / "viviendas" > 4
 *
 * NO SE USA `eval`. Dos razones, y la primera basta: el texto lo escribe quien
 * usa la página, y pasarlo a `eval` es abrirle la puerta a ejecutar lo que
 * quiera dentro de CHASKI —que lee archivos del disco de esa persona—. La
 * segunda es que la sintaxis no es JavaScript: aquí `=` compara, `AND` es
 * `&&` y `<>` es `!=`, porque es lo que ya escribe quien viene de QGIS o de
 * PostGIS. Así que hay analizador propio: se parte el texto en piezas, se arma
 * un árbol y se recorre por cada registro.
 *
 * LOS CAMPOS SE COMPRUEBAN AL ESCRIBIR. QGIS, ante un campo mal tecleado,
 * devuelve NULL y no selecciona nada: la expresión «funciona» y el resultado
 * vacío parece un dato. Aquí un campo que la capa no tiene es un error con su
 * posición señalada, antes de aplicar nada.
 *
 * LOS VACÍOS NO PASAN, Y HAY QUE PREGUNTAR POR ELLOS. Un registro sin valor
 * en ese campo no pasa ninguna comparación; para buscar justamente esos se
 * escribe `"campo" IS NULL`. Y el vacío se propaga como en SQL —comparar
 * contra nada no da «falso», da «no se sabe»—, porque la alternativa simple
 * no se sostiene: con ella, `NOT "estado" IN ('Malo')` devolvía los registros
 * sin estado y `"estado" NOT IN ('Malo')` no, siendo la misma pregunta
 * escrita de dos maneras. Dos sintaxis que significan lo mismo tienen que
 * responder lo mismo. Al final, lo que no se sabe no pasa.
 *
 * COMPARAR NÚMERO CON NÚMERO AUNQUE VENGAN COMO TEXTO. Una tabla municipal
 * trae la misma cifra unas veces como número y otras como cadena. Si los dos
 * lados parecen números se comparan como números; si no, como texto sin
 * tildes ni mayúsculas. Sin esto, «90» saldría mayor que «1000».
 */
import { aNumero, comoTexto } from "./filtro";

/* ------------------------------------------------------------------ piezas */

type Clase = "num" | "txt" | "campo" | "palabra" | "simbolo" | "fin";
interface Pieza {
  clase: Clase;
  valor: string;
  desde: number;
}

/** Lo que el analizador entiende como palabra y no como nombre de campo. */
const PALABRAS = new Set([
  "AND", "OR", "NOT", "IN", "LIKE", "ILIKE", "IS", "NULL",
  "BETWEEN", "TRUE", "FALSE",
]);

export class ErrorExpresion extends Error {
  // Declarados aparte y no en el constructor: el proyecto compila con
  // `erasableSyntaxOnly`, que prohibe las propiedades de parametro porque no
  // se pueden borrar dejando JavaScript valido.
  desde: number;
  constructor(mensaje: string, desde: number) {
    super(mensaje);
    this.desde = desde;
  }
}

function partir(texto: string): Pieza[] {
  const piezas: Pieza[] = [];
  let i = 0;
  const dobles = ["<=", ">=", "<>", "!=", "||"];
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Un número: 1000, 1000.5, .5
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(texto[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+/.exec(texto.slice(i))!;
      piezas.push({ clase: "num", valor: m[0], desde: i });
      i += m[0].length;
      continue;
    }
    // Un texto entre comillas simples. Dos seguidas son una comilla literal,
    // como en SQL: 'O''Higgins'.
    if (c === "'") {
      let j = i + 1;
      let dentro = "";
      for (;;) {
        if (j >= texto.length) {
          throw new ErrorExpresion("Falta cerrar la comilla", i);
        }
        if (texto[j] === "'") {
          if (texto[j + 1] === "'") {
            dentro += "'";
            j += 2;
            continue;
          }
          break;
        }
        dentro += texto[j++];
      }
      piezas.push({ clase: "txt", valor: dentro, desde: i });
      i = j + 1;
      continue;
    }
    // Un campo entre comillas dobles, que es como se escribe en QGIS.
    if (c === '"') {
      const fin = texto.indexOf('"', i + 1);
      if (fin < 0) throw new ErrorExpresion("Falta cerrar la comilla doble", i);
      piezas.push({ clase: "campo", valor: texto.slice(i + 1, fin), desde: i });
      i = fin + 1;
      continue;
    }
    if (/[A-Za-z_À-ɏ]/.test(c)) {
      const m = /^[A-Za-z0-9_À-ɏ]*/.exec(texto.slice(i))!;
      const p = m[0];
      piezas.push({
        clase: PALABRAS.has(p.toUpperCase()) ? "palabra" : "campo",
        valor: PALABRAS.has(p.toUpperCase()) ? p.toUpperCase() : p,
        desde: i,
      });
      i += p.length;
      continue;
    }
    const dos = texto.slice(i, i + 2);
    if (dobles.includes(dos)) {
      piezas.push({ clase: "simbolo", valor: dos, desde: i });
      i += 2;
      continue;
    }
    if ("=<>+-*/(),%".includes(c)) {
      piezas.push({ clase: "simbolo", valor: c, desde: i });
      i++;
      continue;
    }
    throw new ErrorExpresion(`No entiendo el carácter «${c}»`, i);
  }
  piezas.push({ clase: "fin", valor: "", desde: texto.length });
  return piezas;
}

/* ------------------------------------------------------------------ árbol */

type Nodo =
  | { t: "num"; v: number }
  | { t: "txt"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "nulo" }
  | { t: "campo"; nombre: string }
  | { t: "uni"; op: string; a: Nodo }
  | { t: "bin"; op: string; a: Nodo; b: Nodo }
  | { t: "en"; a: Nodo; lista: Nodo[]; negado: boolean }
  | { t: "entre"; a: Nodo; lo: Nodo; hi: Nodo; negado: boolean }
  | { t: "como"; a: Nodo; patron: Nodo; negado: boolean; sensible: boolean }
  | { t: "esNulo"; a: Nodo; negado: boolean }
  | { t: "fn"; nombre: string; args: Nodo[] };

const FUNCIONES: Record<string, { n: number; f: (...a: unknown[]) => unknown }> = {
  lower: { n: 1, f: (a) => comoTexto(a).toLowerCase() },
  upper: { n: 1, f: (a) => comoTexto(a).toUpperCase() },
  trim: { n: 1, f: (a) => comoTexto(a).trim() },
  length: { n: 1, f: (a) => comoTexto(a).length },
  abs: { n: 1, f: (a) => Math.abs(aNumero(a)) },
  round: { n: 1, f: (a) => Math.round(aNumero(a)) },
  floor: { n: 1, f: (a) => Math.floor(aNumero(a)) },
  ceil: { n: 1, f: (a) => Math.ceil(aNumero(a)) },
};

class Analizador {
  private i = 0;
  private piezas: Pieza[];
  private campos: Set<string>;
  constructor(piezas: Pieza[], campos: Set<string>) {
    this.piezas = piezas;
    this.campos = campos;
  }

  private mira(): Pieza {
    return this.piezas[this.i];
  }
  private come(): Pieza {
    return this.piezas[this.i++];
  }
  private si(valor: string): boolean {
    const p = this.mira();
    if ((p.clase === "palabra" || p.clase === "simbolo") && p.valor === valor) {
      this.i++;
      return true;
    }
    return false;
  }
  private exige(valor: string): void {
    if (!this.si(valor)) {
      throw new ErrorExpresion(`Falta «${valor}»`, this.mira().desde);
    }
  }

  analizar(): Nodo {
    const n = this.o();
    if (this.mira().clase !== "fin") {
      throw new ErrorExpresion(
        `Sobra «${this.mira().valor}»`,
        this.mira().desde,
      );
    }
    return n;
  }

  private o(): Nodo {
    let a = this.y();
    while (this.si("OR")) a = { t: "bin", op: "OR", a, b: this.y() };
    return a;
  }
  private y(): Nodo {
    let a = this.no();
    while (this.si("AND")) a = { t: "bin", op: "AND", a, b: this.no() };
    return a;
  }
  private no(): Nodo {
    if (this.si("NOT")) return { t: "uni", op: "NOT", a: this.no() };
    return this.comparacion();
  }

  private comparacion(): Nodo {
    const a = this.suma();
    const p = this.mira();

    if (p.clase === "palabra" && p.valor === "IS") {
      this.come();
      const negado = this.si("NOT");
      this.exige("NULL");
      return { t: "esNulo", a, negado };
    }

    let negado = false;
    if (p.clase === "palabra" && p.valor === "NOT") {
      const siguiente = this.piezas[this.i + 1];
      if (
        siguiente?.clase === "palabra" &&
        ["IN", "LIKE", "ILIKE", "BETWEEN"].includes(siguiente.valor)
      ) {
        this.come();
        negado = true;
      }
    }

    const q = this.mira();
    if (q.clase === "palabra" && q.valor === "IN") {
      this.come();
      this.exige("(");
      const lista: Nodo[] = [];
      if (!this.si(")")) {
        do lista.push(this.suma());
        while (this.si(","));
        this.exige(")");
      }
      return { t: "en", a, lista, negado };
    }
    if (q.clase === "palabra" && (q.valor === "LIKE" || q.valor === "ILIKE")) {
      this.come();
      return {
        t: "como",
        a,
        patron: this.suma(),
        negado,
        sensible: q.valor === "LIKE",
      };
    }
    if (q.clase === "palabra" && q.valor === "BETWEEN") {
      this.come();
      const lo = this.suma();
      this.exige("AND");
      return { t: "entre", a, lo, hi: this.suma(), negado };
    }

    if (
      q.clase === "simbolo" &&
      ["=", "<>", "!=", "<", "<=", ">", ">="].includes(q.valor)
    ) {
      this.come();
      return { t: "bin", op: q.valor, a, b: this.suma() };
    }
    return a;
  }

  private suma(): Nodo {
    let a = this.producto();
    for (;;) {
      const p = this.mira();
      if (p.clase === "simbolo" && ["+", "-", "||"].includes(p.valor)) {
        this.come();
        a = { t: "bin", op: p.valor, a, b: this.producto() };
      } else return a;
    }
  }
  private producto(): Nodo {
    let a = this.unario();
    for (;;) {
      const p = this.mira();
      if (p.clase === "simbolo" && ["*", "/", "%"].includes(p.valor)) {
        this.come();
        a = { t: "bin", op: p.valor, a, b: this.unario() };
      } else return a;
    }
  }
  private unario(): Nodo {
    if (this.si("-")) return { t: "uni", op: "-", a: this.unario() };
    return this.primario();
  }

  private primario(): Nodo {
    const p = this.come();
    if (p.clase === "num") return { t: "num", v: Number(p.valor) };
    if (p.clase === "txt") return { t: "txt", v: p.valor };
    if (p.clase === "simbolo" && p.valor === "(") {
      const n = this.o();
      this.exige(")");
      return n;
    }
    if (p.clase === "palabra" && p.valor === "NULL") return { t: "nulo" };
    if (p.clase === "palabra" && (p.valor === "TRUE" || p.valor === "FALSE")) {
      return { t: "bool", v: p.valor === "TRUE" };
    }
    if (p.clase === "campo") {
      // Una función se reconoce porque le sigue un paréntesis.
      if (this.mira().clase === "simbolo" && this.mira().valor === "(") {
        const nombre = p.valor.toLowerCase();
        const def = FUNCIONES[nombre];
        if (!def) {
          throw new ErrorExpresion(
            `No conozco la función «${p.valor}». Hay: ` +
              Object.keys(FUNCIONES).join(", "),
            p.desde,
          );
        }
        this.come();
        const args: Nodo[] = [];
        if (!this.si(")")) {
          do args.push(this.o());
          while (this.si(","));
          this.exige(")");
        }
        if (args.length !== def.n) {
          throw new ErrorExpresion(
            `«${nombre}» lleva ${def.n} argumento${def.n === 1 ? "" : "s"}, no ${args.length}`,
            p.desde,
          );
        }
        return { t: "fn", nombre, args };
      }
      if (!this.campos.has(p.valor)) {
        throw new ErrorExpresion(
          `La capa no tiene el campo «${p.valor}»`,
          p.desde,
        );
      }
      return { t: "campo", nombre: p.valor };
    }
    throw new ErrorExpresion(
      p.clase === "fin" ? "La expresión se queda a medias" : `No esperaba «${p.valor}»`,
      p.desde,
    );
  }
}

/* --------------------------------------------------------------- evaluación */

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const vacio = (v: unknown) =>
  v === null || v === undefined || comoTexto(v).trim() === "";

/** Compara dos valores como números si los dos lo parecen; si no, como texto. */
function comparar(a: unknown, b: unknown): number | null {
  if (vacio(a) || vacio(b)) return null;
  const x = aNumero(a);
  const y = aNumero(b);
  if (Number.isFinite(x) && Number.isFinite(y)) return x < y ? -1 : x > y ? 1 : 0;
  const s = sinTildes(comoTexto(a));
  const t = sinTildes(comoTexto(b));
  return s < t ? -1 : s > t ? 1 : 0;
}

/** Un patrón de LIKE a expresión regular: `%` es cualquier cosa, `_` uno. */
function deLike(patron: string, sensible: boolean): RegExp {
  const esc = patron.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    "^" + esc.replace(/%/g, ".*").replace(/_/g, ".") + "$",
    sensible ? "s" : "is",
  );
}

function evaluar(n: Nodo, props: Record<string, unknown>): unknown {
  switch (n.t) {
    case "num":
      return n.v;
    case "txt":
      return n.v;
    case "bool":
      return n.v;
    case "nulo":
      return null;
    case "campo":
      return props?.[n.nombre] ?? null;
    case "fn":
      return FUNCIONES[n.nombre].f(...n.args.map((a) => evaluar(a, props)));
    case "uni": {
      if (n.op === "NOT") {
        const v = evaluar(n.a, props);
        // Lo que no se sabe, negado, se sigue sin saber. Sin esto, un NOT
        // delante convertia los registros vacios en registros que pasan.
        return v === null ? null : !verdad(v);
      }
      return -aNumero(evaluar(n.a, props));
    }
    case "esNulo": {
      const es = vacio(evaluar(n.a, props));
      return n.negado ? !es : es;
    }
    case "en": {
      const a = evaluar(n.a, props);
      if (vacio(a)) return null;
      const dentro = n.lista.some((x) => comparar(a, evaluar(x, props)) === 0);
      return n.negado ? !dentro : dentro;
    }
    case "entre": {
      const a = evaluar(n.a, props);
      const lo = comparar(a, evaluar(n.lo, props));
      const hi = comparar(a, evaluar(n.hi, props));
      if (lo === null || hi === null) return null;
      const dentro = lo >= 0 && hi <= 0;
      return n.negado ? !dentro : dentro;
    }
    case "como": {
      const a = evaluar(n.a, props);
      if (vacio(a)) return null;
      const re = deLike(comoTexto(evaluar(n.patron, props)), n.sensible);
      const casa = re.test(comoTexto(a));
      return n.negado ? !casa : casa;
    }
    case "bin": {
      /* AND y OR con tres valores, como en SQL:
       *   algo-que-no-se-sabe AND falso  es falso   (ya no puede pasar)
       *   algo-que-no-se-sabe AND cierto no se sabe
       *   algo-que-no-se-sabe OR  cierto es cierto  (ya pasa igual)
       *   algo-que-no-se-sabe OR  falso  no se sabe
       * Y al final, lo que no se sabe no pasa. */
      if (n.op === "AND" || n.op === "OR") {
        const tri = (x: unknown) => (x === null ? null : verdad(x));
        const x = tri(evaluar(n.a, props));
        const y = tri(evaluar(n.b, props));
        if (n.op === "AND") {
          if (x === false || y === false) return false;
          return x === null || y === null ? null : true;
        }
        if (x === true || y === true) return true;
        return x === null || y === null ? null : false;
      }
      const a = evaluar(n.a, props);
      const b = evaluar(n.b, props);
      if (["+", "-", "*", "/", "%"].includes(n.op)) {
        const x = aNumero(a);
        const y = aNumero(b);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        switch (n.op) {
          case "+": return x + y;
          case "-": return x - y;
          case "*": return x * y;
          // Dividir entre cero no revienta ni da Infinity: da nada, y una
          // comparación contra nada no pasa. «poblacion / viviendas > 4» en
          // una manzana sin viviendas no es una respuesta, es una pregunta
          // mal planteada para esa fila.
          case "/": return y === 0 ? null : x / y;
          case "%": return y === 0 ? null : x % y;
        }
      }
      if (n.op === "||") return comoTexto(a) + comoTexto(b);
      const c = comparar(a, b);
      if (c === null) return null;
      switch (n.op) {
        case "=": return c === 0;
        case "<>":
        case "!=": return c !== 0;
        case "<": return c < 0;
        case "<=": return c <= 0;
        case ">": return c > 0;
        case ">=": return c >= 0;
      }
      return false;
    }
  }
}

const verdad = (v: unknown): boolean =>
  v === true || (typeof v === "number" && v !== 0) ||
  (typeof v === "string" && v.trim() !== "" && v.trim() !== "0");

export interface Compilada {
  ok: true;
  /** Si el registro pasa la expresión. */
  pasa: (props: Record<string, unknown>) => boolean;
}
export interface Rota {
  ok: false;
  error: string;
  desde: number;
}

/**
 * Convierte el texto en algo que se puede correr sobre cada registro.
 *
 * Devuelve el error en vez de lanzarlo: el panel lo enseña mientras se
 * escribe, y a medio teclear una expresión siempre está rota.
 */
export function compilar(
  texto: string,
  campos: Iterable<string>,
): Compilada | Rota {
  try {
    const arbol = new Analizador(partir(texto), new Set(campos)).analizar();
    return { ok: true, pasa: (props) => verdad(evaluar(arbol, props)) };
  } catch (e) {
    if (e instanceof ErrorExpresion) {
      return { ok: false, error: e.message, desde: e.desde };
    }
    return { ok: false, error: String(e), desde: 0 };
  }
}

/** Los nombres de función que se ofrecen, para la ayuda del panel. */
export const NOMBRES_FUNCION = Object.keys(FUNCIONES);
