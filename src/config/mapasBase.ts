/**
 * Mapas base disponibles. Todos son teselas públicas sin credencial.
 *
 * Se declaran todos a la vez en el estilo y solo se alterna su visibilidad:
 * cambiar el estilo entero obligaría a reconstruir todas las capas de datos y a
 * volver a cargar los GeoJSON.
 *
 * Antes de publicar el visor fuera de la red municipal conviene revisar la
 * política de uso de cada proveedor: la de OpenStreetMap, en particular, no
 * admite tráfico alto.
 */
export interface MapaBase {
  clave: string
  rotulo: string
  /** Para qué sirve mejor; se muestra en el selector. */
  nota: string
  teselas: string[]
  /**
   * Teselas de rótulos, cuando el proveedor los sirve aparte del fondo.
   *
   * Los lienzos de Esri vienen sin una sola palabra: el nombre de las calles y
   * los barrios va en una capa transparente encima. Sin ella el fondo es
   * bonito y no se sabe dónde está uno.
   */
  rotulos?: string[]
  atribucion: string
  maxzoom: number
  /** Cierto si el fondo es oscuro: los rótulos claros necesitan saberlo. */
  oscuro?: boolean
}

/**
 * Los lienzos de Esri, que son los dos fondos neutros de esta lista, dejan de
 * tener teselas propias a partir de este zoom y devuelven un cuadro gris con
 * «Map data not yet available». Declarándolo, MapLibre estira la última que
 * tiene en vez de enseñar ese cartel.
 */
const MAXZOOM_LIENZO_ESRI = 16

export const MAPAS_BASE: MapaBase[] = [
  {
    clave: 'osm',
    rotulo: 'OpenStreetMap',
    nota: 'callejero con nombres y comercios',
    teselas: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    atribucion: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxzoom: 19,
  },
  {
    // Sustituye a CARTO Positron, que desde algun momento exige clave: sus
    // teselas siguen devolviendo 200, pero con la marca «API KEY REQUIRED»
    // impresa encima. Un 200 no basta para dar por bueno un mapa base.
    clave: 'humanitario',
    rotulo: 'Humanitario',
    nota: 'trazado limpio: resaltan los puntos y los límites',
    teselas: [
      'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    ],
    atribucion:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · teselas: <a href="https://www.hotosm.org/">HOT</a> / <a href="https://openstreetmap.fr/">OSM France</a>',
    maxzoom: 19,
  },
  {
    /*
     * El fondo oscuro no es cuestión de gusto: sobre gris casi negro, una
     * mancha de color translúcida —una isócrona, un mapa de calor, una columna
     * de deck.gl— se lee por sí sola, mientras que sobre el callejero compite
     * con las calles rojas y los parques verdes que ya trae el fondo.
     *
     * CARTO Dark Matter, que sería el candidato obvio, ya no sirve: sus
     * teselas siguen devolviendo 200 pero con «API KEY REQUIRED» impreso
     * encima, igual que le pasó a Positron.
     */
    clave: 'oscuro',
    rotulo: 'Oscuro',
    nota: 'fondo casi negro: el color de los análisis destaca',
    teselas: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    ],
    rotulos: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    ],
    atribucion: 'Lienzo oscuro: Esri, HERE, Garmin, © OpenStreetMap y colaboradores',
    maxzoom: MAXZOOM_LIENZO_ESRI,
    oscuro: true,
  },
  {
    clave: 'gris',
    rotulo: 'Gris claro',
    nota: 'el mismo lienzo en claro, para imprimir y para informes',
    teselas: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    ],
    rotulos: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    ],
    atribucion: 'Lienzo claro: Esri, HERE, Garmin, © OpenStreetMap y colaboradores',
    maxzoom: MAXZOOM_LIENZO_ESRI,
  },
  {
    clave: 'satelite',
    rotulo: 'Satélite',
    nota: 'ortofoto: para ver construcción y ocupación real',
    teselas: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    atribucion: 'Imágenes: Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
    oscuro: true,
  },
  {
    clave: 'topografico',
    rotulo: 'Topográfico',
    nota: 'relieve y curvas de nivel; tarda unos segundos en cargar',
    teselas: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
    atribucion:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxzoom: 17,
  },
]

/**
 * Con qué fondo abre el visor.
 *
 * El lienzo oscuro, y no el callejero: lo primero que se ve al entrar son los
 * puntos del levantamiento y las capas de análisis, y sobre gris casi negro se
 * leen solos. El callejero sigue a un clic, que es lo que hace falta cuando lo
 * que se busca es el nombre de una calle o un comercio.
 */
export const MAPA_BASE_INICIAL = 'oscuro'

/** Identificador de la capa raster de un mapa base. */
export const capaDe = (clave: string) => `base-${clave}`

/** Identificador de su capa de rótulos, cuando la tiene. */
export const capaRotulosDe = (clave: string) => `base-${clave}-rotulos`
