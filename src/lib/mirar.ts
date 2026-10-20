/**
 * El modo Mirar: el territorio de casa, sin herramientas a la vista.
 *
 * Quien entra a mirar no quiere una caja de dieciséis herramientas: quiere
 * ver su ciudad, elegir una plataforma o un barrio y saber qué hay dentro.
 * Esa es la diferencia entre los dos primeros modos, y es la razón de que la
 * aplicación unida tenga tres puertas en vez de una pantalla con todo.
 *
 * Las cifras salen de las mismas capas que publica el visor, más el agregado
 * de población del Censo 2022 que también publica. Aquí no se recalcula nada
 * que el visor ya haya calculado: se lee lo suyo y se mide lo que haga falta.
 */
import { cajaDe, enPoligono, poligonosDe, type Anillo, type Caja } from "./geo";
import { areaM2 } from "./medidas";
import { aMulti, intersecar, planoDe } from "./geoproceso";
import { ORIGEN_VISOR } from "./municipio";
import { numero } from "./format";
import type { Capa, Fila } from "./cargar";
import type { Tema } from "./medidas";

/** Lo que trae el agregado de población que publica el visor. */
interface Poblacion {
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

/** Una zona que se puede mirar: todo el urbano, una plataforma o un barrio. */
export interface Ambito {
  clave: string;
  titulo: string;
  /** De qué capa salió, para saber a qué nivel está. */
  nivel: "urbano" | "parroquia" | "plataforma" | "barrio";
  piezas: Anillo[][];
  caja: Caja;
  pob: number | null;
  viv: number | null;
  /** Superficie medida sobre el elipsoide, no la declarada en el shapefile. */
  ha: number;
  /**
   * El ámbito que lo contiene, un nivel por encima.
   *
   * Un barrio cuelga de su plataforma, una plataforma de su parroquia. Es lo
   * que permite que los desplegables se encadenen —«los 24 de la plataforma
   * C»— en vez de enseñar los 212 barrios de la ciudad seguidos. Lo que caiga
   * fuera de todo se queda sin padre: no inventarle uno es mejor que colgarlo
   * de la vecina.
   *
   * Es lo que permite que el desplegable de barrios enseñe «los 24 de la
   * plataforma C» en vez de los 212 de la ciudad seguidos. Los barrios que
   * caen fuera de toda plataforma se quedan sin padre y solo aparecen con el
   * ámbito urbano: no inventarles una es mejor que colgarlos de la vecina.
   */
  padre?: string;
  /**
   * La parroquia de un barrio, decidida por SU centro y no por la de su
   * plataforma.
   *
   * Parece lo mismo y no lo es: cinco barrios de Lizarzaburu cuelgan de una
   * plataforma que pertenece a otra parroquia. Yendo por la plataforma, el
   * desplegable ofrecía 102 barrios mientras la cifra de al lado decía 107.
   * Dos números para la misma pregunta, y ninguno explicaba al otro.
   */
  abuelo?: string;
}

const piezasDeRasgo = (f: GeoJSON.Feature): Anillo[][] =>
  f.geometry ? poligonosDe(f.geometry) : [];

const texto = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

/** Las hectáreas de un conjunto de piezas, sobre el elipsoide. */
const haDe = (piezas: Anillo[][]): number =>
  piezas.reduce(
    (s, poly) =>
      s +
      areaM2({ type: "Polygon", coordinates: poly as number[][][] }) / 10000,
    0,
  );

/**
 * Los ámbitos que se pueden elegir, a partir de las capas cargadas.
 *
 * La población de las plataformas se une por su clave, que es estable. La de
 * los barrios viene indexada por su posición en la capa, que es frágil, así
 * que **solo se usa cuando el nombre también coincide**: si la capa cambió de
 * orden, se prefiere no decir una población a decir la del barrio de al lado.
 */
export function ambitosDe(
  parroquias: Capa | null,
  plataformas: Capa | null,
  barrios: Capa | null,
  poblacion: Poblacion | null,
): Ambito[] {
  const salida: Ambito[] = [];

  /*
   * Las parroquias, el nivel de arriba.
   *
   * Van primero porque las plataformas necesitan saber de cuál cuelgan, y eso
   * se decide buscándolas entre las que ya están en la lista.
   *
   * Su población y sus viviendas se suman de las plataformas que contienen y
   * no se leen de ningún agregado propio: el censo que se publica viene por
   * plataforma y por barrio, y repartir al revés —de la parroquia hacia
   * abajo— sería inventarse un reparto.
   */
  if (parroquias) {
    parroquias.geo.features.forEach((f, i) => {
      const piezas = piezasDeRasgo(f);
      if (piezas.length === 0) return;
      const nombre = texto(f.properties?.nombre) || `Parroquia ${i + 1}`;
      salida.push({
        clave: `parroquia:${texto(f.properties?.clave) || i}`,
        titulo: nombre,
        nivel: "parroquia",
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: null,
        viv: null,
        ha: haDe(piezas),
      });
    });
  }

  if (plataformas) {
    const todas = plataformas.geo.features.flatMap(piezasDeRasgo);
    if (todas.length > 0) {
      const pob = poblacion
        ? Object.values(poblacion.plataformas).reduce((s, p) => s + p.pob, 0)
        : null;
      const viv = poblacion
        ? Object.values(poblacion.plataformas).reduce((s, p) => s + p.viv, 0)
        : null;
      salida.push({
        clave: "urbano",
        titulo: "Riobamba urbano · las 18 plataformas",
        nivel: "urbano",
        piezas: todas,
        caja: cajaDe(todas.flat()),
        pob,
        viv,
        ha: haDe(todas),
      });
    }
    plataformas.geo.features.forEach((f) => {
      const piezas = piezasDeRasgo(f);
      if (piezas.length === 0) return;
      const clave = texto(f.properties?.clave);
      const dato = poblacion?.plataformas[clave] ?? null;
      // De qué parroquia es, por su centro. Está comprobado contra los datos
      // publicados: las 18 caen dentro de una de las cinco, ninguna huérfana.
      const padre = padreDe(
        f,
        salida.filter((a) => a.nivel === "parroquia"),
      );
      salida.push({
        clave: `plataforma:${clave}`,
        titulo: `Plataforma ${clave}`,
        nivel: "plataforma",
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: dato?.pob ?? null,
        viv: dato?.viv ?? null,
        ha: haDe(piezas),
        padre,
      });
    });
  }

  if (barrios) {
    barrios.geo.features.forEach((f, i) => {
      const piezas = piezasDeRasgo(f);
      if (piezas.length === 0) return;
      const nombre = texto(f.properties?.nombre) || `Barrio ${i + 1}`;
      const dato = poblacion?.barrios[String(i)] ?? null;
      // Solo se cree el dato si el nombre cuadra: el índice por sí solo no basta.
      const cuadra =
        dato &&
        dato.nombre.trim().toUpperCase() === nombre.trim().toUpperCase();
      // De qué plataforma es, por su centro: el mismo criterio con el que se
      // cuentan los barrios de una plataforma en las cifras.
      const padre = padreDe(
        f,
        salida.filter((a) => a.nivel === "plataforma"),
      );
      // Y su parroquia por sí mismo, no por la de su plataforma: cinco
      // barrios de Lizarzaburu cuelgan de una plataforma de otra parroquia.
      const abuelo = padreDe(
        f,
        salida.filter((a) => a.nivel === "parroquia"),
      );
      salida.push({
        clave: `barrio:${i}`,
        titulo: nombre,
        nivel: "barrio",
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: cuadra ? dato.pob : null,
        viv: cuadra ? dato.viv : null,
        ha: haDe(piezas),
        padre,
        abuelo,
      });
    });
  }

  return salida;
}

/**
 * A qué ámbito pertenece un rasgo, de entre los candidatos.
 *
 * Primero por su centro, que es lo correcto casi siempre. Y si ese centro no
 * cae en ninguno —pasa con las formas cóncavas, donde la media de los
 * vértices se sale de la propia pieza—, vale con que caiga uno de sus
 * vértices: sin ese resguardo, Yaruquíes se quedaba con cero plataformas y
 * tres barrios no pertenecían a ninguna parroquia.
 */
function padreDe(f: GeoJSON.Feature, candidatos: Ambito[]): string | undefined {
  const g = f.geometry;
  if (!g || candidatos.length === 0) return undefined;

  /*
   * Gana el que se queda con MÁS superficie del rasgo.
   *
   * Es la única regla que resiste. Por el centro se pierden las formas
   * cóncavas, donde la media de los vértices se sale de la propia pieza. Por
   * el primer vértice que acierte gana tantas veces el vecino como el dueño,
   * porque el límite es común. Y contando vértices gana el lado que esté más
   * finamente dibujado: con esa regla, la plataforma N —68 % de Yaruquíes y
   * 16 % de Veloz— acababa contada en Veloz.
   *
   * Se mide con las mismas herramientas que los geoprocesos, en un plano
   * métrico local, así que no hace falta nada nuevo.
   */
  const caja = cajaDe(piezasDeRasgo(f).flat());
  const comoArea = (a: Ambito): GeoJSON.Geometry => ({
    type: "MultiPolygon",
    coordinates: a.piezas as number[][][][],
  });
  const plano = planoDe([g, ...candidatos.map(comoArea)]);
  const mio = aMulti(g);

  let mejor: string | undefined;
  let mayor = 0;
  for (const a of candidatos) {
    // Descarte por caja: lo caro es cortar polígonos y casi ninguno se toca.
    const [o, s, e, n] = a.caja;
    if (caja[2] < o || caja[0] > e || caja[3] < s || caja[1] > n) continue;
    const trozos = intersecar(mio, aMulti(comoArea(a)), plano) ?? [];
    const area = trozos.reduce(
      (acc, poly) =>
        acc + areaM2({ type: "Polygon", coordinates: poly as number[][][] }),
      0,
    );
    if (area > mayor) {
      mejor = a.clave;
      mayor = area;
    }
  }
  return mejor;
}

/** Cierto si el punto cae en el ámbito. */
const dentro = (a: Ambito, lon: number, lat: number) =>
  a.piezas.some((p) => enPoligono(lon, lat, p));

/**
 * Las cifras de un ámbito, listas para la franja.
 *
 * «Equipamientos por cada mil habitantes» es la que de verdad se discute en
 * una mesa: el número a secas premia siempre a la plataforma más grande.
 */
export function leerAmbito(
  a: Ambito,
  equipamientos: Capa | null,
  ambitos: Ambito[],
): { cifras: Fila[]; tipos: Fila[] } {
  const ha = a.ha;

  const cifras: Fila[] = [
    { etiqueta: "Superficie", valor: `${numero(Math.round(ha))} ha` },
  ];
  if (a.pob !== null) {
    cifras.push({ etiqueta: "Habitantes", valor: numero(a.pob) });
    const km2 = ha / 100;
    if (km2 > 0) {
      cifras.push({
        etiqueta: "Densidad",
        valor: `${numero(Math.round(a.pob / km2))} hab/km²`,
      });
    }
  }
  if (a.viv !== null)
    cifras.push({ etiqueta: "Viviendas", valor: numero(a.viv) });

  /*
   * Los barrios se cuentan de la lista de ámbitos, no volviendo a mirar la
   * capa.
   *
   * Así la cifra y el desplegable no pueden discrepar: son el mismo reparto.
   * Cuando eran dos cuentas separadas, el desplegable ofrecía 102 barrios de
   * Lizarzaburu y la cifra de al lado decía 107, y ninguno de los dos números
   * explicaba al otro.
   */
  if (a.nivel !== "barrio") {
    const cuantos = ambitos.filter(
      (x) =>
        x.nivel === "barrio" && (x.padre === a.clave || x.abuelo === a.clave),
    ).length;
    if (cuantos > 0 || a.nivel !== "urbano") {
      cifras.push({ etiqueta: "Barrios", valor: numero(cuantos) });
    }
  }

  const tipos: Fila[] = [];
  if (equipamientos) {
    const cuenta = new Map<string, number>();
    let total = 0;
    for (const f of equipamientos.geo.features) {
      const g = f.geometry;
      if (!g || g.type !== "Point") continue;
      const [lon, lat] = g.coordinates as [number, number];
      if (!dentro(a, lon, lat)) continue;
      total++;
      const tipo = texto(f.properties?.tipo) || "—";
      cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1);
    }
    cifras.push({ etiqueta: "Equipamientos", valor: numero(total) });
    if (a.pob !== null && a.pob > 0) {
      cifras.push({
        etiqueta: "Por cada 1.000 hab",
        valor: ((total / a.pob) * 1000).toFixed(1).replace(".", ","),
      });
    }
    for (const [tipo, n] of [...cuenta.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)) {
      tipos.push({
        etiqueta: tipo,
        valor: `${numero(n)} · ${((n / Math.max(1, total)) * 100).toFixed(0)} %`,
      });
    }
  }

  return { cifras, tipos };
}

/** Las tres capas de Mirar, cada una con la que toca. */
export interface CapasMirar {
  parroquias: Capa | null;
  plataformas: Capa | null;
  barrios: Capa | null;
  equipamientos: Capa | null;
}

const VACIA: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const soloCon = (
  capa: Capa,
  quedarse: (f: GeoJSON.Feature, i: number) => boolean,
) => ({
  type: "FeatureCollection" as const,
  features: capa.geo.features.filter(quedarse),
});

/**
 * Si un rasgo pertenece al ámbito, y por tanto se queda al recortar.
 *
 * La regla cambia con la geometría, y cada caso tiene su razón:
 *
 * - **Punto**: cae dentro, o no. No hay más que discutir.
 * - **Área**: manda su centro. Es el mismo criterio con el que se cuentan los
 *   barrios en las cifras, y tiene que seguir siendo el mismo: si el mapa
 *   enseñara toda área que roza el límite y la cuenta solo las que tienen el
 *   centro dentro, los dos números del panel dejarían de cuadrar con el dibujo.
 * - **Línea**: basta con que entre. Una calle que cruza la plataforma es de la
 *   plataforma; quedarse solo con el trozo de dentro le cambiaría la longitud
 *   a cada tramo, y entonces medir kilómetros sobre la capa recortada daría un
 *   número que no es el de ninguna calle real.
 *
 * El recorte **no corta geometrías**: deja pasar el rasgo entero o no lo deja
 * pasar. Para cortar de verdad por un límite está la herramienta «recortar»,
 * que es una operación con resultado, no una forma de mirar.
 */
/** Las cadenas de puntos de una geometría: los anillos de un área, el trazo de una línea. */
function cadenasDe(g: GeoJSON.Geometry): [number, number][][] {
  const salida: [number, number][][] = [];
  const recoger = (c: unknown, prof: number): void => {
    if (!Array.isArray(c)) return;
    if (prof === 0) {
      const cadena = (c as number[][]).filter(
        (p) => Array.isArray(p) && typeof p[0] === "number",
      ) as [number, number][];
      if (cadena.length > 1) salida.push(cadena);
      return;
    }
    for (const s of c) recoger(s, prof - 1);
  };
  switch (g.type) {
    case "LineString":
      recoger(g.coordinates, 0);
      break;
    case "MultiLineString":
    case "Polygon":
      recoger(g.coordinates, 1);
      break;
    case "MultiPolygon":
      recoger(g.coordinates, 2);
      break;
    default:
      break;
  }
  return salida;
}

const lado = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

/** Si dos segmentos se cruzan. Sin tocar los casos degenerados: aquí sobra. */
function seCruzan(
  p: [number, number],
  q: [number, number],
  r: [number, number],
  s: [number, number],
): boolean {
  const d1 = lado(p[0], p[1], q[0], q[1], r[0], r[1]);
  const d2 = lado(p[0], p[1], q[0], q[1], s[0], s[1]);
  const d3 = lado(r[0], r[1], s[0], s[1], p[0], p[1]);
  const d4 = lado(r[0], r[1], s[0], s[1], q[0], q[1]);
  return d1 !== d2 && d3 !== d4;
}

/**
 * Si el contorno del rasgo corta el de la zona.
 *
 * Es la última prueba y la más cara, y hace falta: dos polígonos pueden
 * solaparse sin que ningún vértice de uno caiga dentro del otro —basta con
 * que se crucen los lados—, y una calle recta puede atravesar la plataforma
 * entera sin tener un solo vértice dentro. Sin esto, el panel decía «se
 * dibuja lo que toca esta zona» y se dejaba fuera 3 de cada 30 barrios.
 *
 * Solo llegan aquí los rasgos que ya pasaron el descarte por caja y fallaron
 * las pruebas baratas, que son pocos.
 */
function cortaElBorde(g: GeoJSON.Geometry, a: Ambito): boolean {
  const suyas = cadenasDe(g);
  if (suyas.length === 0) return false;
  for (const cadena of suyas) {
    for (let i = 1; i < cadena.length; i++) {
      for (const pieza of a.piezas) {
        for (const anillo of pieza) {
          for (let j = 1; j < anillo.length; j++) {
            if (
              seCruzan(
                cadena[i - 1],
                cadena[i],
                anillo[j - 1] as [number, number],
                anillo[j] as [number, number],
              )
            ) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

function perteneceA(
  a: Ambito,
  f: GeoJSON.Feature,
  sonda: [number, number] | null,
): boolean {
  const g = f.geometry;
  if (!g || g.type === "GeometryCollection") return false;

  /*
   * Primero la caja, que es barata.
   *
   * Lo caro es el punto-en-polígono, y con el catastro son cuarenta mil
   * predios: sin este descarte previo, elegir una plataforma dejaría la
   * pantalla colgada unos segundos cada vez.
   */
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;
  const vertices: [number, number][] = [];
  const recorrer = (c: unknown): void => {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      const x = c[0];
      const y = c[1];
      if (x < oeste) oeste = x;
      if (x > este) este = x;
      if (y < sur) sur = y;
      if (y > norte) norte = y;
      vertices.push([x, y]);
      return;
    }
    if (Array.isArray(c)) for (const s of c) recorrer(s);
  };
  recorrer(g.coordinates);
  if (vertices.length === 0) return false;
  const [o, s, e, n] = a.caja;
  if (este < o || oeste > e || norte < s || sur > n) return false;

  // Puntos y líneas: con que algo suyo caiga dentro, basta.
  if (vertices.some(([x, y]) => dentro(a, x, y))) return true;

  /*
   * Y un área puede contener la zona sin tener ni un vértice dentro.
   *
   * Es el caso de todas las capas gruesas: el límite urbano, las parroquias,
   * la clasificación del suelo. Ninguno de sus rasgos tiene el centro ni un
   * vértice dentro de una plataforma, y con la regla del centro —que es la
   * que usan las cifras para decir de quién es cada barrio— desaparecían
   * enteras: se elegía una plataforma y la clasificación del suelo se
   * quedaba en «0 de 41», que se lee como «aquí no hay nada».
   *
   * Así que se prueba al revés: un punto de la zona contra el rasgo. Medido
   * contra la intersección de verdad sobre seis capas de la base, esta regla
   * da 2/2, 12/12, 4/4, 4/4, 30/30 y 201 de 202 manzanas.
   */
  if (
    sonda &&
    (g.type === "Polygon" || g.type === "MultiPolygon") &&
    poligonosDe(g).some((piezas) => enPoligono(sonda[0], sonda[1], piezas))
  ) {
    return true;
  }

  return cortaElBorde(g, a);
}

/**
 * Un punto de dentro de la zona, para probar si un área la contiene.
 *
 * Se prefiere el centro de su pieza mayor; en una zona con forma de ele ese
 * centro puede caer fuera, y entonces sirve un vértice de su contorno, que
 * está en el borde pero sigue siendo de la zona.
 */
function sondaDe(a: Ambito): [number, number] | null {
  const mayor = a.piezas.reduce(
    (mejor, p) => (p[0].length > (mejor?.[0].length ?? 0) ? p : mejor),
    a.piezas[0],
  );
  const anillo = mayor?.[0];
  if (!anillo?.length) return null;
  const n = anillo.length - 1;
  if (n <= 0) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += anillo[i][0];
    y += anillo[i][1];
  }
  if (dentro(a, x / n, y / n)) return [x / n, y / n];
  return [anillo[0][0], anillo[0][1]];
}

/**
 * Lo que el mapa debe dibujar de cada capa cuando hay una zona elegida.
 *
 * Elegir una plataforma y que el mapa siga pintando los 1.083 equipamientos y
 * los 212 barrios de toda la ciudad no es un detalle: el panel pasa a hablar
 * de la plataforma mientras el mapa sigue hablando de Riobamba entera, y lo
 * que se lee encima del mapa deja de corresponder con lo que se ve.
 *
 * Devuelve un recorte por identificador de capa. Vacío significa «dibújalo
 * todo», que es lo que toca en el ámbito urbano.
 *
 * Esto **no toca la mesa**: la capa sigue entera: lo que cambia es lo que se
 * enseña. Al volver a «Riobamba urbano» reaparece todo sin recargar nada.
 */
export function recorteDe(
  a: Ambito,
  todas: Capa[],
  capas: CapasMirar,
): Map<string, GeoJSON.FeatureCollection> {
  const salida = new Map<string, GeoJSON.FeatureCollection>();
  const { plataformas, barrios } = capas;
  const urbano = a.nivel === "urbano";

  if (plataformas) {
    // Las plataformas no las dibuja la capa de datos en este modo: las pinta
    // el mapa aparte, que es el único sitio donde se puede distinguir la
    // elegida —relleno y contorno grueso— de las vecinas —contorno fino, para
    // no perder la orientación—. Dejarlas también aquí las pintaría dos veces.
    salida.set(plataformas.id, VACIA);
  }

  if (urbano) return salida;

  /*
   * Todas las demás capas se recortan, no solo las tres del municipio.
   *
   * Es lo que hace que el filtro signifique algo: si se elige la plataforma D
   * y la vialidad que uno acaba de traer de la base sigue dibujada de punta a
   * punta del cantón, lo que se lee en el panel habla de D y lo que se ve
   * habla de otra cosa. Vale para cualquier capa —un archivo soltado, una
   * tabla de PostGIS o el resultado de una herramienta—, porque todas se
   * miran igual.
   */
  const elBarrio =
    a.nivel === "barrio" ? Number(a.clave.slice("barrio:".length)) : null;
  const sonda = sondaDe(a);

  for (const capa of todas) {
    if (capa.id === plataformas?.id) continue;
    // Elegido un barrio, de la capa de barrios se deja ese y no sus vecinos:
    // por el centro pasarían también los que comparten límite.
    if (elBarrio !== null && capa.id === barrios?.id) {
      salida.set(
        capa.id,
        soloCon(capa, (_f, i) => i === elBarrio),
      );
      continue;
    }
    salida.set(
      capa.id,
      soloCon(capa, (f) => perteneceA(a, f, sonda)),
    );
  }

  return salida;
}

/** La letra de una plataforma, puesta en el mapa. */
export interface Marca {
  clave: string;
  letra: string;
  /** Lo que se lee al pasar por encima. */
  titulo: string;
  lon: number;
  lat: number;
}

/**
 * Dónde va la letra de cada plataforma.
 *
 * Como marcador de HTML y no como rótulo del estilo: poner texto en el mapa
 * obliga a servir una fuente de glifos entera, y aquí son dieciocho letras.
 *
 * El punto es el centro de la pieza más grande. En una plataforma con forma de
 * ele el centro puede caer fuera del polígono; se acepta, porque la letra es
 * una referencia para orientarse y no una afirmación sobre la geometría.
 */
export function marcasDe(ambitos: Ambito[]): Marca[] {
  const salida: Marca[] = [];
  for (const a of ambitos) {
    if (a.nivel !== "plataforma") continue;
    const mayor = a.piezas.reduce(
      (mejor, p) => (p[0].length > (mejor?.[0].length ?? 0) ? p : mejor),
      a.piezas[0],
    );
    const anillo = mayor?.[0];
    if (!anillo?.length) continue;
    const n = anillo.length - 1;
    if (n <= 0) continue;
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += anillo[i][0];
      y += anillo[i][1];
    }
    salida.push({
      clave: a.clave,
      letra: a.clave.slice("plataforma:".length),
      titulo: `${a.titulo} · ${Math.round(a.ha)} ha`,
      lon: x / n,
      lat: y / n,
    });
  }
  return salida;
}

/**
 * El color de cada tipo de equipamiento.
 *
 * Fijo y escrito a mano, no repartido por orden de aparición. Dos mapas de dos
 * plataformas distintas tienen que poder ponerse uno al lado del otro, y si el
 * color se asignara según los tipos que aparecen en cada zona, «Salud» sería
 * rojo en uno y verde en el otro.
 *
 * Son los doce tipos del inventario municipal. Lo que no esté en la lista cae
 * en el gris de «otros», que es más honesto que colarlo en un color con
 * significado.
 */
export const COLOR_TIPO: Record<string, string> = {
  Educación: "#2c6fb5",
  Salud: "#c0453b",
  Transporte: "#c9752b",
  "Recreativo y Deporte": "#2f8f5b",
  Religioso: "#6a4fa3",
  "Administración Pública": "#1f7a8c",
  Cultural: "#b8577e",
  Infraestructura: "#8c5a3c",
  Seguridad: "#7f8c3a",
  "Bienestar Social": "#d4a017",
  Especial: "#5c6b73",
  "Servicios Funerarios": "#4a4458",
};

const GRIS_OTROS = "#8496a4";

/** El color de un tipo, o el gris de «otros» si no es de los doce. */
export const colorDeTipo = (tipo: string): string =>
  COLOR_TIPO[tipo] ?? GRIS_OTROS;

/** El tema que pinta los equipamientos por su tipo. */
export const temaDeTipos = (): Tema => ({
  campo: "tipo",
  unidad: "tipo de equipamiento",
  coincidencias: Object.entries(COLOR_TIPO).map(([valor, color]) => ({
    valor,
    color,
    rotulo: valor,
  })),
  respaldo: GRIS_OTROS,
});

/** Las capas que el modo Mirar necesita tener cargadas. */
export const CAPAS_MIRAR = [
  /*
   * Las parroquias primero: son el nivel de arriba del filtro.
   *
   * Se usa `parroquias_canton`, que son las diecisiete —cinco urbanas, once
   * rurales y el área rural de la propia parroquia Riobamba—, y no
   * `parroquias.geojson`, que solo trae las cinco urbanas y dejaría fuera del
   * filtro todo lo que no sea casco.
   */
  { archivo: "parroquias_canton.geojson", nombre: "Parroquias" },
  { archivo: "plataformas.geojson", nombre: "Plataformas" },
  { archivo: "barrios.geojson", nombre: "Barrios" },
  { archivo: "equipamientos.geojson", nombre: "Equipamientos" },
];
