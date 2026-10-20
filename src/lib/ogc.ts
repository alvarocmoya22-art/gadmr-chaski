/**
 * Capas que vienen de una base de datos, no de un archivo.
 *
 * **Un navegador no puede hablar con PostgreSQL.** Postgres tiene su propio
 * protocolo sobre TCP y el navegador solo sabe HTTP, así que entre la base y
 * CHASKI hace falta algo que publique las tablas por HTTP. Lo que encaja es un
 * servicio **OGC API Features** —`pg_featureserv` es un solo ejecutable de
 * solo lectura que lo hace— porque devuelve GeoJSON, que es exactamente lo que
 * esta aplicación ya sabe leer.
 *
 * Así que esto no es «conectarse a PostGIS»: es leer un catálogo publicado,
 * igual que se leen las capas del visor. Y tiene una consecuencia buena: la
 * base nunca queda expuesta al navegador, solo las tablas que alguien haya
 * decidido publicar, y solo para leer.
 *
 * **La versión publicada en internet no podrá ver una base interna**, y está
 * bien que así sea: una página servida por https no puede llamar a un `http://`
 * de la red local, de modo que los datos institucionales no salen a internet
 * por este camino. Para eso, CHASKI se corre dentro de la red del municipio.
 */
import { leerArchivo, type Capa } from "./cargar";

/** Una tabla publicada por el servicio. */
export interface Coleccion {
  id: string;
  titulo: string;
  descripcion: string;
  /** Cuántos registros declara tener, si lo dice. */
  registros: number | null;
}

/** Cuántos rasgos se piden por vuelta. */
const POR_VUELTA = 1000;

/**
 * Tope de rasgos que se traen de una colección.
 *
 * Una tabla de catastro con cuarenta mil predios tarda y pesa; una con dos
 * millones tumbaría la pestaña. Al llegar aquí se corta y se dice que se
 * cortó, que es mejor que quedarse colgado sin explicación.
 */
export const TOPE_RASGOS = 100000;

/**
 * El nombre de una tabla, para enseñarlo.
 *
 * `public.gis_licenaprob_a_phdu` no es un nombre: es una dirección. Se le
 * quita el esquema, el `gis_` de delante y el sufijo de geometría y
 * departamento de detrás, que son los mismos en todas y no distinguen nada.
 * Lo que queda es lo que esa capa es.
 *
 * El identificador completo no se pierde: sigue en el origen de la capa, que
 * es donde hace falta para saber de dónde salió un dato.
 */
export function nombreCorto(titulo: string): string {
  const limpio = titulo
    .replace(/^[a-z_]+\./i, "")
    .replace(/^gis_/i, "")
    .replace(/_(a|l|p)_(phdu|gir|acs)$/i, "")
    .replace(/_/g, " ")
    .trim();
  if (limpio === "") return titulo;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Quita la barra final y el `?f=json` que alguien haya pegado de más. */
export function limpiarBase(url: string): string {
  return url.trim().replace(/\?.*$/, "").replace(/\/+$/, "");
}

interface RespuestaColecciones {
  collections?: {
    id: string;
    title?: string;
    description?: string;
    itemCount?: number;
  }[];
}

/** Las tablas que el servicio publica. */
export async function listarColecciones(
  base: string,
  cabeceras: Record<string, string> = {},
): Promise<Coleccion[]> {
  const url = `${limpiarBase(base)}/collections?f=json`;
  const resp = await fetch(url, { headers: cabeceras });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      // El usuario vive en la ficha y la clave en su propio campo: decir solo
      // «ponlos en la ficha» manda al sitio equivocado a quien ya tiene usuario.
      "El servicio pide usuario y clave, o los que diste no valen. Revisa el usuario en la ficha de la conexión y vuelve a escribir la clave.",
    );
  }
  if (!resp.ok) throw new Error(`el servicio respondió ${resp.status}`);
  const datos = (await resp.json()) as RespuestaColecciones;
  if (!Array.isArray(datos.collections)) {
    throw new Error(
      "la dirección respondió, pero no parece un servicio OGC API Features",
    );
  }
  return datos.collections.map((c) => ({
    id: c.id,
    titulo: c.title || c.id,
    descripcion: c.description ?? "",
    registros: typeof c.itemCount === "number" ? c.itemCount : null,
  }));
}

interface Pagina {
  type?: string;
  features?: GeoJSON.Feature[];
  numberMatched?: number;
  numberReturned?: number;
  links?: { rel?: string; href?: string; type?: string }[];
}

/**
 * Trae una colección entera, siguiendo la paginación del servicio.
 *
 * OGC API Features devuelve los rasgos por páginas y deja un enlace `next`
 * mientras quedan. Se sigue ese enlace en vez de ir sumando `offset` a mano,
 * porque cada implementación los numera a su manera y el enlace siempre es el
 * que el propio servicio considera correcto.
 */
/**
 * La columna por la que ordenar al paginar.
 *
 * SIN ORDEN NO HAY PAGINACIÓN QUE VALGA. PostgreSQL no promete ningún orden
 * si no se lo pides, y `pg_featureserv` no lo pide: comprobado contra la base
 * —el mismo `offset` devolvió tres juegos de filas distintos en tres
 * peticiones seguidas—. Paginar así trae unas filas dos veces y se deja otras
 * sin traer, y nada avisa: la capa carga, con su número de registros, y es
 * otra.
 *
 * Se prefieren los nombres de clave de siempre y, si no hay ninguno, la
 * primera columna numérica. Si la tabla no tiene ninguna, se devuelve null y
 * se pagina sin orden, que es lo que había: peor, pero mejor que no traerla.
 */
async function columnaDeOrden(
  raiz: string,
  id: string,
  cabeceras: Record<string, string>,
): Promise<string | null> {
  try {
    const resp = await fetch(
      `${raiz}/collections/${encodeURIComponent(id)}?f=json`,
      { headers: cabeceras },
    );
    if (!resp.ok) return null;
    const datos = (await resp.json()) as {
      properties?: { name: string; type: string }[];
    };
    const props = datos.properties ?? [];
    const numericas = props.filter((p) => p.type === "number");
    for (const nombre of ["gid", "id", "objectid", "fid"]) {
      if (numericas.some((p) => p.name === nombre)) return nombre;
    }
    return numericas[0]?.name ?? null;
  } catch {
    return null;
  }
}

/** Lo que trae una ventana de filas, con las que hubo que saltarse. */
interface Ventana {
  rasgos: GeoJSON.Feature[];
  /** Filas que el servicio no supo devolver, aisladas una a una. */
  saltadas: number;
  /** Filas que el servicio recorrió, incluidas las saltadas. */
  recorridas: number;
}

/**
 * Una ventana de filas, partiéndola si el servicio se atraganta.
 *
 * Una sola fila mala tumba la página entera: el catastro tiene dos predios
 * cuya geometría `pg_featureserv` no sabe convertir a GeoJSON —responde «500
 * Error encoding response»— y por esas dos filas no se podía traer ninguna de
 * las 77.882. Aquí la ventana se parte en dos hasta aislar la fila que falla,
 * se salta, y se dice cuántas fueron.
 *
 * Esto solo es correcto con un orden estable: sin él, al repetir la petición
 * vendrían filas distintas y partir no aislaría nada.
 */
async function traerVentana(
  raiz: string,
  id: string,
  orden: string | null,
  limite: number,
  desde: number,
  cabeceras: Record<string, string>,
): Promise<Ventana> {
  const url =
    `${raiz}/collections/${encodeURIComponent(id)}/items?f=json` +
    `&limit=${limite}&offset=${desde}` +
    (orden ? `&sortby=${encodeURIComponent(orden)}` : "");

  const resp = await fetch(url, { headers: cabeceras });

  if (resp.ok) {
    const pagina = (await resp.json()) as Pagina;
    const todas = pagina.features ?? [];
    return {
      rasgos: todas.filter((f) => f?.geometry),
      saltadas: 0,
      recorridas: pagina.numberReturned ?? todas.length,
    };
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      "El servicio pide usuario y clave, o los que diste no valen. Revisa el usuario en la ficha de la conexión y vuelve a escribir la clave.",
    );
  }

  // Sin orden estable no se puede partir: se repetiría con otras filas.
  if (resp.status !== 500 || orden === null) {
    throw new Error(`el servicio respondió ${resp.status}`);
  }

  if (limite === 1) return { rasgos: [], saltadas: 1, recorridas: 1 };

  const mitad = Math.floor(limite / 2);
  const a = await traerVentana(raiz, id, orden, mitad, desde, cabeceras);
  const b = await traerVentana(
    raiz,
    id,
    orden,
    limite - mitad,
    desde + mitad,
    cabeceras,
  );
  return {
    rasgos: [...a.rasgos, ...b.rasgos],
    saltadas: a.saltadas + b.saltadas,
    recorridas: a.recorridas + b.recorridas,
  };
}

export async function traerColeccion(
  base: string,
  coleccion: Coleccion,
  alAvanzar?: (traidos: number, total: number | null) => void,
  cabeceras: Record<string, string> = {},
): Promise<{
  capa: Capa;
  cortada: boolean;
  total: number | null;
  /** Filas que la base devolvió sin geometría y no se pudieron dibujar. */
  sinGeometria: number;
  /** Filas que el servicio no supo devolver y hubo que saltar. */
  ilegibles: number;
}> {
  const raiz = limpiarBase(base);
  const orden = await columnaDeOrden(raiz, coleccion.id, cabeceras);

  const rasgos: GeoJSON.Feature[] = [];
  let cortada = false;
  /*
   * Filas recorridas, no rasgos guardados.
   *
   * Para el `offset` hace falta saber por cuántas FILAS va el servicio, y en
   * `rasgos` no entran ni las que vienen sin geometría ni las que hubo que
   * saltar. Usar su longitud haría que cada fila descartada corriera la
   * ventana hacia atrás y volviera a pedir filas ya traídas.
   */
  let recorridas = 0;
  let saltadas = 0;

  for (;;) {
    const v = await traerVentana(
      raiz,
      coleccion.id,
      orden,
      POR_VUELTA,
      recorridas,
      cabeceras,
    );
    rasgos.push(...v.rasgos);
    recorridas += v.recorridas;
    saltadas += v.saltadas;
    alAvanzar?.(rasgos.length, coleccion.registros);

    if (rasgos.length >= TOPE_RASGOS) {
      cortada = true;
      break;
    }
    // Una ventana a medias es la última: no hay más filas que pedir.
    if (v.recorridas < POR_VUELTA) break;
  }

  if (rasgos.length === 0) throw new Error("la colección llegó vacía");

  /*
   * Se pasa por el mismo lector que un archivo soltado a mano: así la capa que
   * viene de la base se describe, se analiza y se exporta igual que las demás,
   * sin un camino aparte que pueda comportarse de otro modo.
   */
  const geo: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: rasgos,
  };
  const archivo = new File([JSON.stringify(geo)], `${coleccion.id}.geojson`);
  const { capa } = await leerArchivo(archivo);
  return {
    sinGeometria: recorridas - rasgos.length - saltadas,
    ilegibles: saltadas,
    capa: {
      ...capa,
      nombre: nombreCorto(coleccion.titulo),
      origen: `Base institucional · ${coleccion.id}${cortada ? ` (primeros ${TOPE_RASGOS})` : ""}`,
    },
    cortada,
    // Solo lo que el servicio AFIRME. `recorridas` es hasta dónde se llegó,
    // no cuántas hay: decir «los primeros 60.998 de 61.000» con una tabla de
    // 77.882 es inventarse un total y dar la capa por casi completa.
    total: coleccion.registros,
  };
}

/**
 * Qué puede fallar al apuntar a una dirección, en lenguaje de persona.
 *
 * Los dos fallos de verdad frecuentes no dicen nada por sí solos en la consola
 * del navegador, así que se traducen aquí.
 */
export function explicarFallo(e: unknown, base: string): string {
  const texto = e instanceof Error ? e.message : String(e);
  const paginaSegura = location.protocol === "https:";
  const servicioInseguro = limpiarBase(base).startsWith("http://");
  if (paginaSegura && servicioInseguro) {
    return `Esta página va por https y el servicio por http, así que el navegador bloquea la llamada sin más explicación. Para leer una base interna, abre CHASKI dentro de la red del municipio, o publica el servicio por https.`;
  }
  if (/:543[23](\/|$)/.test(limpiarBase(base))) {
    return `Esa dirección apunta al puerto de PostgreSQL, y ahí no hay nada que hable HTTP: en el 5432 escucha Postgres con su propio protocolo, que un navegador no sabe hablar. Hace falta un servicio que publique las tablas por HTTP —pg_featureserv, en el 9000— y apuntar la conexión a ese.`;
  }
  if (/failed to fetch|networkerror|load failed/i.test(texto)) {
    const limpia = limpiarBase(base);
    // El caso de todos los dias: el servicio local no esta levantado.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(limpia)) {
      return `No hay nada escuchando en ${limpia}. ¿Arrancaste el servicio? En la carpeta pg_featureserv, clic derecho sobre «arrancar.ps1» → Ejecutar con PowerShell, y deja esa ventana abierta.`;
    }
    return `No se pudo llegar a ${limpia}. Puede estar apagado, fuera de tu red, o no permitir llamadas desde otra dirección (falta CORS en el servicio).`;
  }
  return texto;
}
