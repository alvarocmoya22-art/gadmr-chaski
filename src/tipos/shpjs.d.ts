/**
 * shpjs no publica tipos, y de su interfaz aquí solo se usa una función.
 *
 * Se declara a mano en lugar de traer `@types/shpjs`: son estas cinco líneas
 * contra una dependencia más que mantener, y así queda escrito qué se espera
 * de la biblioteca —un zip entero, y a la vuelta una capa o varias—.
 */
declare module 'shpjs' {
  export default function shp(
    datos: ArrayBuffer | string,
  ): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>
}
