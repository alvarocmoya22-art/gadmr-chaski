/**
 * Pintar una capa por uno de sus campos, a mano.
 *
 * Esto NO es un sistema de pintado nuevo: es dejar que uno ponga el mismo
 * `Tema` que hasta ahora solo sabían poner las herramientas. El mapa y la
 * leyenda ya lo entienden, así que con esto una capa traída de un shapefile
 * se pinta igual de bien que un resultado calculado.
 *
 * Dos modos, y la capa decide cuál le toca:
 *
 *   - **por categorías**, un color por valor, para un campo de texto o con
 *     pocos valores distintos —`clase`, `tipo`, `estado`—; y
 *   - **graduado**, tramos de claro a oscuro, para un campo numérico, que es
 *     una escala y no una lista.
 *
 * Elegir mal entre los dos es el error clásico: una escala pintada con ocho
 * colores sueltos no se puede leer de menos a más, y una categoría pintada
 * con una rampa insinúa un orden que no existe.
 */
import { PALETA_CAPAS } from "./cargar";
import { RAMPA_GRADUADA, cortesCuantil, type Tema } from "./medidas";
import { VACIO, comoTexto } from "./filtro";
import { valoresDe } from "./filtro";

/** El gris de lo que no entra en la paleta. El mismo de «otros» del inventario. */
const GRIS_OTROS = "#8496a4";

/**
 * Cuántas categorías se pintan antes de agrupar el resto.
 *
 * Ocho, que son los colores de la paleta. Un noveno color no se inventa: a
 * partir de ahí todo cae en «otros», porque dos colores que nadie puede
 * distinguir son peor que un gris honesto.
 */
export const TOPE_CATEGORIAS = PALETA_CAPAS.length;

/** Si un campo se lee como número en la mayoría de sus filas. */
export function esNumerico(
  geo: GeoJSON.FeatureCollection,
  campo: string,
): boolean {
  let con = 0;
  let numericos = 0;
  for (const f of geo.features) {
    const v = comoTexto(f.properties?.[campo]).trim();
    if (v === "") continue;
    con++;
    if (Number.isFinite(Number(v))) numericos++;
  }
  // Nueve de cada diez: una columna de números con tres celdas escritas a
  // mano sigue siendo una columna de números.
  return con > 0 && numericos / con >= 0.9;
}

/**
 * Un color por valor, en el orden en que la paleta los reparte.
 *
 * Los valores vienen ordenados por frecuencia, así que los colores van a lo
 * que más hay. Lo que pase del tope cae en «otros», con su rótulo diciendo
 * cuántos son: un grupo sin nombre es una pregunta sin responder.
 */
export function temaCategorico(
  geo: GeoJSON.FeatureCollection,
  campo: string,
): Tema {
  const valores = valoresDe(geo, campo);
  const dentro = valores.slice(0, TOPE_CATEGORIAS);
  const fuera = valores.slice(TOPE_CATEGORIAS);

  const coincidencias = dentro.map((v, i) => ({
    valor: v.valor,
    color: PALETA_CAPAS[i],
    rotulo: `${v.valor} · ${v.n}`,
  }));

  return {
    campo,
    unidad: "",
    coincidencias,
    // Lo que no casa con ningún valor se pinta igual: un rasgo invisible es
    // un rasgo que no existe para quien mira el mapa.
    respaldo: GRIS_OTROS,
    notaVacio: fuera.length
      ? `En gris, los otros ${fuera.length} valores de «${campo}».`
      : `En gris, lo que no trae «${campo}».`,
  };
}

/**
 * Tramos de claro a oscuro sobre un campo numérico.
 *
 * Por cuantiles y no a partes iguales: con un campo donde casi todo es
 * pequeño y hay tres piezas enormes —que es como son las superficies y las
 * poblaciones— los tramos iguales dejan todo en la primera clase y el mapa
 * sale de un solo color.
 */
export function temaGraduado(
  geo: GeoJSON.FeatureCollection,
  campo: string,
): Tema {
  const valores = geo.features.map((f) =>
    Number(comoTexto(f.properties?.[campo]).trim()),
  );
  const cortes = cortesCuantil(valores, RAMPA_GRADUADA.length);
  return {
    campo,
    unidad: "",
    cortes,
    // Un color más que cortes: cuatro cortes parten la recta en cinco tramos.
    colores: RAMPA_GRADUADA.slice(0, cortes.length + 1),
    notaVacio: `Sin color: filas sin «${campo}» o con cero.`,
  };
}

/** El tema que le toca a un campo, mirando cómo son sus valores. */
export function temaDe(
  geo: GeoJSON.FeatureCollection,
  campo: string,
  modo?: "categorias" | "graduado",
): Tema {
  const cual = modo ?? (esNumerico(geo, campo) ? "graduado" : "categorias");
  return cual === "graduado"
    ? temaGraduado(geo, campo)
    : temaCategorico(geo, campo);
}

/** Cuántos valores distintos tiene un campo, para decidir si merece la pena. */
export const distintosDe = (
  geo: GeoJSON.FeatureCollection,
  campo: string,
): number => valoresDe(geo, campo).filter((v) => v.valor !== VACIO).length;
