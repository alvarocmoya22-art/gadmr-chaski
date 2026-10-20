/**
 * Las preguntas que se proponen solas al ver los datos.
 *
 * El modo guiado tenía doce preguntas fijas y, como mucho, avisaba de cuáles
 * no se podían responder. Eso sigue siendo una lista: hay que leerla entera y
 * traducir cada hueco a las capas de uno. Aquí es al revés — se miran las
 * capas que hay encima de la mesa y se proponen preguntas **ya concretas**:
 * «¿Cuántos Equipamientos hay en cada Barrio?», no «¿Cuántos hay en cada
 * zona?».
 *
 * NO HAY NINGÚN MODELO DE LENGUAJE DETRÁS, y es a propósito. Un chatbot
 * tendría que recibir las columnas —y con el catastro, los nombres de los
 * propietarios— en el servidor de otro, además de una clave y una conexión a
 * internet que dentro del municipio puede no haber. Lo que hace falta para
 * proponer buenas preguntas no es entender el español: es saber qué geometría
 * tiene cada capa, cuántos registros trae y qué columnas. Eso está aquí.
 *
 * Las reglas son las de alguien que lleva tiempo haciendo esto a mano:
 *
 * - lo que se cuenta suele ser lo numeroso, y las zonas lo poco numeroso: con
 *   plataformas y equipamientos, la pregunta es cuántos equipamientos hay en
 *   cada plataforma, nunca al revés;
 * - una capa de 40.000 predios no es una capa de zonas, aunque sean áreas;
 * - y lo recién traído manda, porque es lo que quien mira acaba de pedir.
 */
import type { Capa } from "./cargar";
import {
  ENTRADA,
  RECETAS,
  factibilidad,
  type Hueco,
  type Receta,
} from "./recetas";

/** Una pregunta concreta, lista para correr. */
export interface Sugerencia {
  clave: string;
  receta: string;
  /** La pregunta con los nombres de las capas dentro. */
  pregunta: string;
  /** Por qué se propone, en una línea. */
  porque: string;
  /** Los huecos ya rellenos. */
  valores: Record<string, string>;
}

const huecosDe = (r: Receta) =>
  r.frase.filter((x): x is Hueco => typeof x !== "string");

/**
 * Cuánto sirve una capa como «lo que se cuenta».
 *
 * Los puntos primero, porque casi todo inventario municipal son puntos, y
 * cuantos más registros mejor: contar cuatro cosas no responde nada.
 */
function pesoDato(c: Capa): number {
  const n = c.geo.features.length;
  const forma = c.forma === "punto" ? 3 : c.forma === "linea" ? 2 : 1;
  return forma * 10 + Math.min(10, Math.log10(Math.max(1, n)) * 3);
}

/**
 * Cuánto sirve una capa como «las zonas».
 *
 * Una capa de zonas tiene pocas piezas y grandes. Con 41.681 predios el
 * resultado es una tabla de 41.681 filas con un 0 o un 1 en cada una, que no
 * es una respuesta: es el mismo dato otra vez.
 */
function pesoZona(c: Capa): number {
  if (c.forma !== "poligono" && c.forma !== "mixta") return -1;
  /*
   * El resultado de una herramienta no es una capa de zonas.
   *
   * Sin esto se proponía «¿Cuántos Equipamientos hay en cada Conteo por zona ·
   * Equipamientos?»: contar otra vez lo mismo dentro del resultado de haberlo
   * contado. Se puede hacer a mano desde la lista de abajo; proponerlo es
   * ruido.
   */
  if (c.derivada) return -1;
  const n = c.geo.features.length;
  if (n < 2 || n > 2000) return -1;
  // El mejor número de zonas para leer una tabla está por las decenas.
  return 20 - Math.abs(Math.log10(n) - 1.6) * 8;
}

/** El mejor campo para agrupar: ni un identificador ni una constante. */
function campoDeClases(c: Capa): string | null {
  const bueno = c.campos
    .filter((f) => f.distintos > 1 && f.distintos <= 40)
    .sort((a, b) => a.distintos - b.distintos);
  return bueno[0]?.nombre ?? null;
}

/**
 * La columna de fechas que de verdad cuenta una historia.
 *
 * No vale la primera que se detecte. Una tabla de trámites suele traer dos:
 * la fecha del trámite y un `fecha_actualizacion` que es cuándo se cargó, y
 * esa segunda es idéntica en las 2.131 filas. Agrupar por ella da un único
 * mes con el total dentro: un gráfico de una sola barra que parece un fallo.
 *
 * Así que gana la que más valores distintos tiene, y si ninguna varía, no se
 * propone la pregunta.
 */
function campoDeFecha(c: Capa): string | null {
  const conFecha = new Set((c.fechas ?? []).map((f) => f.campo));
  const mejor = c.campos
    .filter((f) => conFecha.has(f.nombre) && f.distintos > 1)
    .sort((a, b) => b.distintos - a.distintos)[0];
  return mejor?.nombre ?? null;
}

/**
 * «Plataformas» → «Plataforma», para que se lea «en cada plataforma».
 *
 * Las capas se nombran en plural y las preguntas las necesitan en singular
 * después de «cada» o de «de qué». No es un singularizador de español: son
 * las tres terminaciones que aparecen en los nombres de capa. Si no reconoce
 * la palabra la deja como está, que es mejor que inventarse una.
 */
function enSingular(nombre: string): string {
  if (/ces$/i.test(nombre)) return nombre.slice(0, -3) + "z";
  if (/[^aeiou]es$/i.test(nombre)) return nombre.slice(0, -2);
  if (/[aeiou]s$/i.test(nombre)) return nombre.slice(0, -1);
  return nombre;
}

/** Rellena la plantilla con los nombres de verdad. */
function decir(
  r: Receta,
  valores: Record<string, string>,
  capas: Capa[],
): string {
  return r.plantilla.replace(
    /\{(\w+)(:uno)?\}/g,
    (_todo, clave: string, uno: string | undefined) => {
      const v = valores[clave] ?? "";
      const nombre = capas.find((c) => c.id === v)?.nombre ?? v;
      return uno ? enSingular(nombre) : nombre;
    },
  );
}

/**
 * Las preguntas que estas capas responden, ya concretas y ordenadas.
 *
 * Se devuelven pocas a propósito. Con cinco capas cargadas las combinaciones
 * posibles pasan de cien, y cien sugerencias no son una ayuda: son la lista
 * de antes, más larga.
 */
export function sugerenciasDe(capas: Capa[], tope = 6): Sugerencia[] {
  const vivas = capas.filter((c) => c.visible);
  if (vivas.length === 0) return [];

  /*
   * Lo más nuevo pesa más: es lo que quien mira acaba de traer.
   *
   * Las capas entran al final de la lista, así que el índice MAYOR es la más
   * reciente. Al revés —que es como estaba— la capa recién traída de la base
   * no salía en ninguna sugerencia, que es exactamente cuando más falta hace.
   */
  const frescura = new Map(vivas.map((c, i) => [c.id, i + 1]));

  const salida: { s: Sugerencia; peso: number }[] = [];

  for (const receta of RECETAS) {
    if (!factibilidad(receta, vivas).puede) continue;
    const huecos = huecosDe(receta);
    const deCapa = huecos.filter((h) => h.tipo === "capa");
    const deCampo = huecos.filter((h) => h.tipo === "campo");

    const candidatas = (h: Hueco) =>
      vivas.filter((c) => (h.formas ?? []).includes(c.forma));

    /** Qué papel hace este hueco, que es lo que decide cómo se puntúa. */
    const esZona = (h: Hueco) =>
      h.clave === "zonas" ||
      h.clave === "ambito" ||
      h.clave === "molde" ||
      h.clave === "otra";

    // Para cada hueco, las dos mejores capas segun su papel. Dos y no todas:
    // con tres huecos, probar todas da cientos de combinaciones casi iguales.
    const opciones = deCapa.map((h) => {
      const puntuar = (c: Capa) =>
        (esZona(h) ? pesoZona(c) : pesoDato(c)) + (frescura.get(c.id) ?? 0);
      /*
       * Si la pregunta pide una columna, la capa de entrada tiene que
       * tenerla.
       *
       * El campo se elige siempre sobre la capa de entrada, así que filtrar
       * después no sirve: «¿Cómo avanzaron mes a mes?» se quedaba sin
       * proponer porque de candidatas a entrada ganaban las de puntos —que
       * pesan más— y ninguna traía fechas, aunque la capa recién llegada de
       * la base sí las trajera. Era la pregunta más útil de todas justo
       * cuando acabas de traer un registro de trámites.
       */
      const sirveParaCampos = (c: Capa) =>
        deCampo.every(
          (hc) => (hc.soloFecha ? campoDeFecha(c) : campoDeClases(c)) !== null,
        );
      return {
        h,
        capas: candidatas(h)
          .filter((c) => !esZona(h) || pesoZona(c) > 0)
          .filter((c) => h.clave !== ENTRADA || sirveParaCampos(c))
          .sort((a, b) => puntuar(b) - puntuar(a))
          .slice(0, 2),
      };
    });

    if (opciones.some((o) => o.capas.length === 0)) continue;

    // El producto de las opciones, descartando lo que se repite.
    let combos: Record<string, string>[] = [{}];
    for (const { h, capas: cs } of opciones) {
      const siguiente: Record<string, string>[] = [];
      for (const base of combos) {
        for (const c of cs) {
          if (Object.values(base).includes(c.id)) continue;
          siguiente.push({ ...base, [h.clave]: c.id });
        }
      }
      combos = siguiente;
    }

    for (const combo of combos) {
      const valores: Record<string, string> = { ...combo };
      for (const h of huecos) {
        if (h.tipo === "numero" && h.defecto) valores[h.clave] = h.defecto;
      }

      const entrada = vivas.find((c) => c.id === valores[ENTRADA]) ?? null;
      let sirve = true;
      let porque = "";

      for (const h of deCampo) {
        if (!entrada) {
          sirve = false;
          break;
        }
        const campo = h.soloFecha
          ? campoDeFecha(entrada)
          : campoDeClases(entrada);
        if (!campo) {
          sirve = false;
          break;
        }
        valores[h.clave] = campo;
        porque = h.soloFecha
          ? `«${entrada.nombre}» trae la columna de fechas «${campo}».`
          : `«${entrada.nombre}» se puede agrupar por «${campo}».`;
      }
      if (!sirve) continue;

      /*
       * Si el motivo no es una columna concreta, se dice qué devuelve.
       *
       * Antes se decía siempre el recuento —«1.083 puntos contra 18 zonas»—,
       * y con las mismas dos capas salía idéntico en cinco preguntas
       * seguidas: un motivo que no distingue no es un motivo.
       */
      if (porque === "") porque = receta.devuelve;

      /*
       * Las que nacen de una columna van por delante.
       *
       * «¿Cómo avanzaron mes a mes?» solo aparece si alguna capa trae fechas,
       * y «¿cuántas hectáreas de cada clase?» solo si alguna se puede
       * agrupar: son las que de verdad dependen de lo que uno acaba de
       * traer. Las demás —contar puntos en zonas— se pueden proponer siempre
       * y por eso llenaban las seis plazas.
       */
      const peso =
        Object.values(valores).reduce((s, v) => s + (frescura.get(v) ?? 0), 0) +
        (entrada ? pesoDato(entrada) / 10 : 0) +
        (deCampo.length > 0 ? 25 : 0);

      salida.push({
        peso,
        s: {
          clave: `${receta.clave}:${Object.values(combo).join("|")}`,
          receta: receta.clave,
          pregunta: decir(receta, valores, vivas),
          porque,
          valores,
        },
      });
    }
  }

  salida.sort((a, b) => b.peso - a.peso);

  // Como mucho una por receta: dos variantes de la misma pregunta ocupan el
  // sitio de una pregunta distinta, y lo que falta es variedad, no matices.
  const vistas = new Set<string>();
  const finales: Sugerencia[] = [];
  for (const { s } of salida) {
    if (vistas.has(s.receta)) continue;
    vistas.add(s.receta);
    finales.push(s);
    if (finales.length >= tope) break;
  }
  return finales;
}
