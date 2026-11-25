/**
 * Sacar una capa del navegador.
 *
 * Sin esto, un resultado solo existe mientras la pestaña esté abierta, y un
 * análisis que no se puede llevar a QGIS ni adjuntar a un informe sirve para
 * mirar y para poco más. El GeoJSON se arma aquí y el navegador lo descarga:
 * no interviene ningún servidor, igual que al cargarlo.
 */
import type { Capa } from './cargar'
import { comoFrase, filtraAlgo, filtrada } from './filtro'

/** Un nombre de archivo que Windows acepte y que se entienda al verlo. */
function nombreArchivo(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return `${limpio || 'capa'}.geojson`
}

/**
 * Descarga la capa como GeoJSON, YA FILTRADA.
 *
 * Se exportaba `capa.geo`, que es la coleccion entera: el filtro vive aparte,
 * en `capa.filtro`, y lo aplicaban el mapa y las herramientas pero no esto.
 * Asi que uno recortaba una capa a veinticinco registros, veia «25 de 1.083»
 * en su tarjeta, pulsaba exportar y se llevaba las 1.083 sin que nada se lo
 * dijera. Es el peor fallo posible en una exportacion: el archivo no se
 * parece a lo que estaba en pantalla y el error viaja a QGIS, al informe y a
 * quien lo reciba.
 *
 * Y el recorte se escribe DENTRO del archivo, al lado del metodo: un GeoJSON
 * con veinticinco de mil registros tiene que decir cuales son los que faltan.
 */
export function descargar(bruta: Capa): void {
  const capa = filtrada(bruta)
  /*
   * Cómo se obtuvo viaja dentro del archivo.
   *
   * Un GeoJSON suelto en una carpeta no dice de dónde salió, y dentro de un mes
   * nadie se acuerda de con qué celda ni contra qué ámbito se calculó. Como
   * GeoJSON no tiene un sitio para metadatos, se escriben en la raíz: los
   * programas que lo leen ignoran lo que no conocen, así que QGIS lo abre igual.
   */
  const salida = {
    ...capa.geo,
    nombre: capa.nombre,
    origen: capa.origen,
    metodo: capa.metodo,
    filtro: filtraAlgo(bruta.filtro)
      ? `${comoFrase(bruta.filtro)} · ${capa.geo.features.length} de ${bruta.geo.features.length} registros`
      : undefined,
    generado: new Date().toISOString(),
    generado_por: 'CHASKI · GADM Riobamba',
  }
  const blob = new Blob([JSON.stringify(salida)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo(capa.nombre)
  a.click()
  // El objeto queda retenido hasta que se suelta; con capas grandes son megas.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
