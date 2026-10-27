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

/** Un campo y los valores que se quedan. Sin valores, la capa entera. */
export interface Filtro {
  campo: string;
  valores: string[];
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

/** Si el filtro de verdad quita algo. Uno sin valores no es un filtro. */
export const filtraAlgo = (f: Filtro | undefined): f is Filtro =>
  Boolean(f && f.campo && f.valores.length > 0);

/** La capa con solo las filas que pasan el filtro. */
export function aplicar(
  geo: GeoJSON.FeatureCollection,
  filtro: Filtro,
): GeoJSON.FeatureCollection {
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

/** Cómo se lee un filtro puesto, para decirlo en una línea. */
export function comoFrase(f: Filtro): string {
  if (f.valores.length === 1) return `${f.campo} = ${f.valores[0]}`;
  return `${f.campo}: ${f.valores.length} valores`;
}
