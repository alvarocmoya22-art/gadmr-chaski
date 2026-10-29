/**
 * Las capas del municipio, traídas en vivo del visor de territorio.
 *
 * El visor y CHASKI son las dos mitades de lo mismo: el visor tiene los datos
 * de casa preparados y publicados, y CHASKI tiene las herramientas para
 * cruzarlos con lo que traiga cada quien. Unirlos no pedía fusionar los dos
 * programas: bastaba con que CHASKI leyera lo que el visor ya publica.
 *
 * Y lo publica de verdad: las capas están en su sitio de GitHub Pages, que
 * responde con `Access-Control-Allow-Origin: *`, así que se leen desde aquí sin
 * intermediario. No se copia ni un archivo, no pesa ni un mega en este
 * repositorio, y cuando el visor actualice una capa, aquí entra la nueva.
 *
 * La contrapartida está dicha donde se usa: esto depende de que el visor siga
 * publicado. Por eso las cuatro capas del ejemplo siguen viviendo en
 * `public/ejemplo/`, para que probar la aplicación nunca dependa de internet.
 */
import { leerArchivo, type Capa } from "./cargar";

/** De dónde salen. Es la dirección pública del visor, sin credencial ninguna. */
export const ORIGEN_VISOR =
  "https://alvarocmoya22-art.github.io/gadmr-visor-territorio/datos";

export const FUENTE_MUNICIPIO =
  "Capas del visor de territorio del GADM Riobamba. Lo derivado de OpenStreetMap es ODbL.";

export interface CapaMunicipal {
  archivo: string;
  nombre: string;
  nota: string;
  /** Lo que ocupa, para que nadie se lleve una sorpresa con el catastro. */
  peso: string;
  /** Las que tardan y conviene traer solo cuando hacen falta. */
  pesada?: boolean;
  /**
   * `red` es el grafo de la vialidad, que no es GeoJSON y hay que convertir.
   * Las demás se leen con el mismo lector que un archivo soltado a mano.
   */
  formato?: "geojson" | "red";
  /**
   * Que la capa llegue con el censo pegado, y por qué lado se pega.
   *
   * El visor publica la población aparte, en `poblacion.json`, porque no tiene
   * geometría propia: son cifras DE los barrios y DE las plataformas. Hasta
   * ahora solo las leía el modo Mirar para sus tarjetas, así que la capa que
   * uno se traía a la mesa venía sin una sola cifra de gente y no había manera
   * de filtrarla ni de pintarla por ahí.
   */
  poblacion?: "barrios" | "plataformas";
}

export const CAPAS_MUNICIPIO: CapaMunicipal[] = [
  {
    archivo: "plataformas.geojson",
    nombre: "Plataformas",
    nota: "18 plataformas del casco, con habitantes y viviendas del Censo 2022",
    peso: "37 KB",
    poblacion: "plataformas",
  },
  {
    archivo: "barrios.geojson",
    nombre: "Barrios",
    nota: "212 barrios urbanos, con habitantes y viviendas del Censo 2022",
    peso: "124 KB",
    poblacion: "barrios",
  },
  {
    archivo: "clasificacion_suelo.geojson",
    nombre: "Clasificación del suelo",
    nota: "Lo urbano y lo rural del cantón, el reparto oficial",
    peso: "234 KB",
  },
  {
    archivo: "limite_urbano.geojson",
    nombre: "Límite urbano",
    nota: "La ciudad y las 13 cabeceras de las parroquias rurales",
    peso: "28 KB",
  },
  {
    archivo: "parroquias_canton.geojson",
    nombre: "Parroquias",
    nota: "17: las 5 urbanas, las 11 rurales y el área rural de Riobamba",
    peso: "207 KB",
  },
  {
    archivo: "equipamientos.geojson",
    nombre: "Equipamientos",
    nota: "1.083 equipamientos con su tipo y estado",
    peso: "430 KB",
  },
  {
    archivo: "proyectos.geojson",
    nombre: "Proyectos 2026",
    nota: "41 proyectos con monto, estado y tipología",
    peso: "21 KB",
  },
  {
    archivo: "red.json",
    nombre: "Vialidad",
    nota: "17.636 tramos de la red vial completa, 1.931 km",
    peso: "2 MB",
    pesada: true,
    formato: "red",
  },
  {
    archivo: "edificios.geojson",
    nombre: "Edificación",
    nota: "6.039 huellas de edificio con su altura",
    peso: "1,6 MB",
    pesada: true,
  },
  {
    archivo: "catastro.geojson",
    nombre: "Catastro",
    nota: "41.681 predios con clave catastral y superficie",
    peso: "15 MB",
    pesada: true,
  },
];

/** Lo que trae el agregado de población que publica el visor. */
export interface Poblacion {
  fuente: string;
  barrios: Record<string, { nombre: string; pob: number; viv: number }>;
  plataformas: Record<string, { pob: number; viv: number }>;
}

let cache: Poblacion | null = null;

/** El agregado de población, traído una sola vez. */
export async function cargarPoblacion(): Promise<Poblacion | null> {
  if (cache) return cache;
  try {
    const resp = await fetch(`${ORIGEN_VISOR}/poblacion.json`);
    if (!resp.ok) return null;
    cache = (await resp.json()) as Poblacion;
    return cache;
  } catch {
    return null;
  }
}

/**
 * El dato de un barrio, que se busca por su puesto pero se confirma por su
 * nombre.
 *
 * El agregado va indexado por la posición del barrio en el archivo, así que
 * basta con que el visor publique los barrios en otro orden para que cada uno
 * se lleve la población de su vecino, y nada en el mapa lo delataría: las
 * cifras seguirían siendo plausibles. Por eso se compara el nombre, y si no
 * cuadra se prefiere dejar al barrio sin cifra. Es la misma regla con la que
 * el modo Mirar arma sus tarjetas; aquí no se afloja.
 */
function datoDeBarrio(
  censo: Poblacion,
  f: GeoJSON.Feature,
  i: number,
): { pob: number; viv: number } | null {
  const dato = censo.barrios[String(i)];
  if (!dato) return null;
  const nombre = String(f.properties?.nombre ?? "")
    .trim()
    .toUpperCase();
  return dato.nombre.trim().toUpperCase() === nombre ? dato : null;
}

/**
 * La capa con el censo pegado a cada pieza.
 *
 * Tres columnas: `habitantes`, `viviendas` y `densidad_hab_km2`. La densidad
 * no es un adorno: los barrios van de 1,7 a 33 hectáreas, y un mapa pintado
 * por habitantes sobre piezas tan distintas dice sobre todo cuál es grande.
 *
 * A lo que no tiene dato no se le pone un cero: se le deja la columna vacía.
 * Un cero es una afirmación —«aquí no vive nadie»— y lo que pasa de verdad es
 * que el censo no lo cubre. El pintado graduado ya ignora lo vacío, así que
 * esas piezas salen sin color en vez de salir como las más despobladas.
 */
function conPoblacion(
  geo: GeoJSON.FeatureCollection,
  lado: "barrios" | "plataformas",
  censo: Poblacion | null,
): GeoJSON.FeatureCollection {
  if (!censo) return geo;
  return {
    ...geo,
    features: geo.features.map((f, i) => {
      const dato =
        lado === "plataformas"
          ? (censo.plataformas[String(f.properties?.clave ?? "")] ?? null)
          : datoDeBarrio(censo, f, i);
      if (!dato) return f;
      const props: NonNullable<GeoJSON.GeoJsonProperties> = {
        ...f.properties,
        habitantes: dato.pob,
        viviendas: dato.viv,
      };
      // La superficie que publica el visor, que es la que la capa ya enseña en
      // su tabla: la densidad tiene que cuadrar con lo que se ve al lado.
      const ha = Number(f.properties?.area_ha);
      if (Number.isFinite(ha) && ha > 0) {
        props.densidad_hab_km2 = Math.round((dato.pob * 100) / ha);
      }
      return { ...f, properties: props };
    }),
  };
}

/** Una arista del grafo: nodo, nodo, metros y la sarta de puntos. */
type Arista = [number, number, number, number[][]];

/**
 * El grafo de la vialidad, convertido a líneas.
 *
 * `red.json` no es GeoJSON: es la red que usa el visor para calcular isócronas,
 * con sus nodos y sus aristas. Cada arista ya trae su trazado y sus metros
 * medidos, así que pasarla a líneas es recorrerla, y a cambio la vialidad entra
 * en CHASKI como una capa más.
 */
function deRed(datos: { aristas?: Arista[] }): GeoJSON.FeatureCollection {
  const rasgos: GeoJSON.Feature[] = [];
  for (const a of datos.aristas ?? []) {
    const trazado = a[3];
    if (!trazado || trazado.length < 2) continue;
    rasgos.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: trazado },
      properties: { metros: a[2] },
    });
  }
  return { type: "FeatureCollection", features: rasgos };
}

/** Trae una capa del visor y la deja lista para analizar. */
export async function traerDelVisor(entrada: CapaMunicipal): Promise<Capa> {
  const resp = await fetch(`${ORIGEN_VISOR}/${entrada.archivo}`);
  if (!resp.ok) throw new Error(`el visor respondió ${resp.status}`);

  if (entrada.formato === "red") {
    const geo = deRed(await resp.json());
    if (geo.features.length === 0) throw new Error("la red vial llegó vacía");
    // Se vuelve a pasar por el lector normal para que describa su tabla igual
    // que cualquier otra capa, sin un camino especial que pueda divergir.
    const archivo = new File(
      [JSON.stringify(geo)],
      `${entrada.nombre}.geojson`,
    );
    const { capa } = await leerArchivo(archivo);
    return {
      ...capa,
      nombre: entrada.nombre,
      origen: `Visor · ${entrada.nota}`,
      fuente: { tipo: "municipio", archivo: entrada.archivo },
    };
  }

  // Con censo hay que abrir el GeoJSON para pegarle las columnas y volverlo a
  // cerrar. Si el agregado no llega, la capa entra igual pero sin ellas: que
  // falte la población no es motivo para quedarse sin los barrios.
  const archivo = entrada.poblacion
    ? new File(
        [
          JSON.stringify(
            conPoblacion(
              JSON.parse(await resp.text()) as GeoJSON.FeatureCollection,
              entrada.poblacion,
              await cargarPoblacion(),
            ),
          ),
        ],
        entrada.archivo,
      )
    : new File([await resp.blob()], entrada.archivo);
  const { capa } = await leerArchivo(archivo);
  return {
    ...capa,
    nombre: entrada.nombre,
    origen: `Visor · ${entrada.nota}`,
    fuente: { tipo: "municipio", archivo: entrada.archivo },
  };
}

/** Una sola capa del municipio, por su nombre de archivo. */
export async function traerPorArchivo(archivo: string): Promise<Capa | null> {
  const entrada = CAPAS_MUNICIPIO.find((c) => c.archivo === archivo);
  return entrada ? traerDelVisor(entrada) : null;
}

/** Trae varias, y dice cuáles fallaron en vez de rendirse con la primera. */
export async function traerVarias(
  entradas: CapaMunicipal[],
): Promise<{ capas: Capa[]; fallos: string[] }> {
  const capas: Capa[] = [];
  const fallos: string[] = [];
  for (const entrada of entradas) {
    try {
      capas.push(await traerDelVisor(entrada));
    } catch (e) {
      fallos.push(
        `${entrada.nombre}: ${e instanceof Error ? e.message : "no se pudo traer"}.`,
      );
    }
  }
  return { capas, fallos };
}
