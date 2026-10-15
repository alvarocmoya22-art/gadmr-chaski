/**
 * Sacar una capa del navegador.
 *
 * Sin esto, un resultado solo existe mientras la pestaña esté abierta, y un
 * análisis que no se puede llevar a QGIS ni adjuntar a un informe sirve para
 * mirar y para poco más. El GeoJSON se arma aquí y el navegador lo descarga:
 * no interviene ningún servidor, igual que al cargarlo.
 */
import type { Capa } from './cargar'

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

/** Descarga la capa como GeoJSON. */
export function descargar(capa: Capa): void {
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
