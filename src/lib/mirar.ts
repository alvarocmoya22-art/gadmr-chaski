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
import { aMulti, intersecar, planoDe, type Multi } from "./geoproceso";
import type { Plano } from "./metrico";
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
  /**
   * A qué altura de la división está.
   *
   * De lo macro a lo pequeño: el cantón entero, su mitad urbana o rural, una
   * parroquia, una plataforma, un barrio. Las plataformas y los barrios solo
   * existen en el casco, así que por la rama rural la escalera se acaba en la
   * parroquia; el panel lo dice en vez de ofrecer listas vacías.
   */
  /**
   * A qué altura de la división está.
   *
   * De lo macro a lo pequeño. En la rama urbana: cantón, urbano, parroquia
   * urbana, plataforma, barrio. En la rural: cantón, rural, parroquia rural y
   * su CABECERA, que es lo urbano que hay dentro y ocupa el mismo escalón que
   * la plataforma. Antes la rama rural se acababa en la parroquia y la parte
   * donde vive la gente no se podía mirar sola.
   */
  nivel:
    | "canton"
    | "urbano"
    | "rural"
    | "parroquia"
    | "plataforma"
    | "cabecera"
    | "barrio";
  /** Para una parroquia, de qué lado del cantón es. */
  tipo?: "urbana" | "rural";
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
  limiteUrbano: Capa | null,
  clasificacion: Capa | null,
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
    const urbanas: Anillo[][] = [];
    const rurales: Anillo[][] = [];
    parroquias.geo.features.forEach((f, i) => {
      const piezas = piezasDeRasgo(f);
      if (piezas.length === 0) return;
      const nombre = texto(f.properties?.nombre) || `Parroquia ${i + 1}`;
      // La capa publicada trae el tipo; sin él se asume rural, que es lo que
      // más hay, y el panel lo enseñará donde toca aunque no sea exacto.
      const tipo = texto(f.properties?.tipo) === "urbana" ? "urbana" : "rural";
      (tipo === "urbana" ? urbanas : rurales).push(...piezas);
      salida.push({
        clave: `parroquia:${texto(f.properties?.clave) || i}`,
        titulo: nombre,
        nivel: "parroquia",
        tipo,
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: null,
        viv: null,
        ha: haDe(piezas),
      });
    });

    /*
     * El cantón entero y su mitad rural.
     *
     * Son el primer escalón del filtro: antes de preguntar por una parroquia
     * hay que decir si se mira el casco o el campo, que es lo que separa de
     * verdad este territorio. La mitad urbana se arma abajo, con las
     * plataformas, porque ahí es donde está su población.
     */
    /*
     * El cantón, solo si no hay clasificación.
     *
     * Con ella, el cantón se arma abajo sumando sus dos clases, y así las
     * tres cifras del primer desplegable cuadran entre sí. Armándolo aquí
     * salía de las parroquias y las otras dos de la clasificación: dos capas
     * distintas, cinco hectáreas de diferencia y ninguna explicación.
     */
    const todas = [...urbanas, ...rurales];
    if (!clasificacion && todas.length > 0) {
      salida.push({
        clave: "canton",
        titulo: "Todo el cantón",
        nivel: "canton",
        piezas: todas,
        caja: cajaDe(todas.flat()),
        // El censo que se publica viene por plataforma y por barrio, es decir
        // solo del casco: poner esa cifra aquí daría la población urbana por
        // la del cantón.
        pob: null,
        viv: null,
        ha: haDe(todas),
      });
    }
  }

  /*
   * Urbano y rural, del reparto oficial del suelo.
   *
   * NO de las parroquias. Lo urbano del cantón no es solo la ciudad: son
   * 3.095 ha de casco más trece cabeceras de parroquias rurales que suman
   * 461. Tomando «urbano» como las cinco parroquias urbanas, esos manchones
   * —Licán 98 ha, los tres núcleos de San Luis, Cubijíes, Licto…— quedaban
   * contados como campo, y son suelo urbano igual que el centro.
   *
   * Las dos clases reparten el cantón sin solaparse: 96.316 y 3.555 ha.
   */
  if (clasificacion) {
    const porClase = (cual: string) =>
      clasificacion.geo.features
        .filter((f) => texto(f.properties?.clase).toLowerCase() === cual)
        .flatMap(piezasDeRasgo);

    const loUrbano = porClase("urbano");
    const loRural = porClase("rural");

    const todoElSuelo = [...loUrbano, ...loRural];
    if (todoElSuelo.length > 0) {
      salida.push({
        clave: "canton",
        titulo: "Todo el cantón",
        nivel: "canton",
        piezas: todoElSuelo,
        caja: cajaDe(todoElSuelo.flat()),
        // El censo publicado es por plataforma y por barrio, o sea solo del
        // casco: ponerlo aquí daría la población urbana por la del cantón.
        pob: null,
        viv: null,
        ha: haDe(todoElSuelo),
      });
    }

    if (loUrbano.length > 0) {
      salida.push({
        clave: "urbano",
        titulo: "Urbano",
        nivel: "urbano",
        piezas: loUrbano,
        caja: cajaDe(loUrbano.flat()),
        // El censo publicado viene por plataforma, que cubre el casco. Las
        // cabeceras no traen el suyo, así que esta cifra es la del casco y
        // se queda corta por lo que vive en ellas.
        pob: poblacion
          ? Object.values(poblacion.plataformas).reduce((s, p) => s + p.pob, 0)
          : null,
        viv: poblacion
          ? Object.values(poblacion.plataformas).reduce((s, p) => s + p.viv, 0)
          : null,
        ha: haDe(loUrbano),
      });
    }
    if (loRural.length > 0) {
      salida.push({
        clave: "rural",
        titulo: "Rural",
        nivel: "rural",
        piezas: loRural,
        caja: cajaDe(loRural.flat()),
        pob: null,
        viv: null,
        ha: haDe(loRural),
      });
    }
  }

  /*
   * Las cabeceras urbanas de las parroquias rurales.
   *
   * Van después de las parroquias porque cuelgan de ellas, y antes que las
   * plataformas porque ocupan su mismo escalón: lo urbano de dentro. La
   * pieza de la ciudad —«ciudad» en la capa— no entra aquí: esa es el casco
   * entero y ya la representan las plataformas.
   */
  if (limiteUrbano) {
    const parroquiasDe = salida.filter((a) => a.nivel === "parroquia");
    limiteUrbano.geo.features.forEach((f, i) => {
      if (texto(f.properties?.clase) !== "cabecera") return;
      const piezas = piezasDeRasgo(f);
      if (piezas.length === 0) return;
      const donde = texto(f.properties?.parroquia);
      const padre = padreDe(f, parroquiasDe);
      salida.push({
        clave: `cabecera:${i}`,
        // Hay parroquias con más de un núcleo —San Luis tiene tres—, así que
        // el nombre solo no distingue: se añade su superficie al elegirlas.
        titulo: donde ? `Cabecera de ${donde}` : `Cabecera ${i + 1}`,
        nivel: "cabecera",
        piezas,
        caja: cajaDe(piezas.flat()),
        pob: null,
        viv: null,
        ha: haDe(piezas),
        padre,
      });
    });
  }

  if (plataformas) {
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

/** El centro de un área: la media de los vértices de su anillo mayor. */
function centroDeRasgo(f: GeoJSON.Feature): [number, number] | null {
  const anillo = piezasDeRasgo(f)[0]?.[0];
  if (!anillo?.length) return null;
  const n = anillo.length - 1;
  if (n <= 0) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += anillo[i][0];
    y += anillo[i][1];
  }
  return [x / n, y / n];
}

/** Cierto si el punto cae en el ámbito. */
const dentro = (a: Ambito, lon: number, lat: number) => {
  // Por la caja de cada pieza antes de recorrer sus esquinas: lo rural son
  // veinticinco piezas y 8.343 esquinas, y un punto cae como mucho en una.
  const { cajas } = rejaDe(a);
  for (let i = 0; i < a.piezas.length; i++) {
    const [o, s, e, n] = cajas[i];
    if (lon < o || lon > e || lat < s || lat > n) continue;
    if (enPoligono(lon, lat, a.piezas[i])) return true;
  }
  return false;
};

/**
 * Por dónde pasa el contorno de una zona, en una rejilla.
 *
 * EL PORQUÉ. El descarte por caja que hay al entrar en `perteneceA` funciona
 * con una plataforma —su caja es un trozo de ciudad y tira el 99 % de los
 * rasgos de golpe—, pero NO funciona con «Rural»: su caja es el cantón
 * entero, así que no descarta ni uno. Medido sobre el catastro: de sus 41.681
 * predios, con «Urbano» 41.677 se resuelven por el centro y solo 4 llegan al
 * camino caro; con «Rural» llegan 41.679. Y ese camino caro es cortar el
 * predio contra las 8.343 esquinas de lo rural: 12,3 ms cada uno, o sea ocho
 * minutos y medio de pantalla colgada por elegir «Rural».
 *
 * LA SALIDA. Un rasgo que no toca el CONTORNO de la zona está entero dentro o
 * entero fuera, y eso lo dice cualquiera de sus puntos: no hay nada que
 * cortar. Solo hace falta saber deprisa si el contorno le pasa cerca, y para
 * eso se marca de antemano por qué celdas pasa. Mirar un puñado de celdas es
 * aritmética; cortar polígonos no.
 *
 * Se marca la CAJA de cada segmento, no las celdas exactas que pisa. Marca de
 * más, nunca de menos: alguna celda queda señalada sin que el contorno la
 * cruce y ese rasgo se va al camino caro igual que antes —lento, pero
 * correcto—. Al revés sí importaría, y por eso no se hace al revés.
 */
interface Reja {
  cols: number;
  filas: number;
  anchoX: number;
  anchoY: number;
  /** Una marca por celda: si el contorno de la zona pasa por ella. */
  ocupada: Uint8Array;
  /** La caja de cada pieza, para no recorrerlas todas en cada punto. */
  cajas: Caja[];
  /** El ámbito entero, ya en forma de multipolígono. */
  entero: Multi;
  /**
   * El plano métrico de la zona, uno solo para todos sus cortes.
   *
   * Tiene que ser el mismo para que los trozos encajen entre sí. No afecta a
   * ninguna cifra: las superficies se siguen midiendo sobre el elipsoide, a
   * partir de la geometría en grados que devuelve el corte.
   */
  plano: Plano;
  /** La zona recortada a cada cuadro, según se va necesitando. */
  trozos: Map<string, Multi>;
  /**
   * Si la zona es tan pequeña que partirla no compensa.
   *
   * Una plataforma o un barrio tienen unas pocas decenas de esquinas: cortar
   * contra ellos ya era barato y aquí no había ningún problema que resolver.
   */
  menuda: boolean;
}

/**
 * Se arma una sola vez por ámbito.
 *
 * En un mapa débil para que se vaya con el ámbito: al recargar las capas los
 * ámbitos son otros objetos y las rejas viejas sobran.
 */
const rejas = new WeakMap<Ambito, Reja>();

/** Celdas a lo ancho. En lo rural, unos doscientos metros cada una. */
const CELDAS = 256;

function rejaDe(a: Ambito): Reja {
  const hecha = rejas.get(a);
  if (hecha) return hecha;

  const [o, s, e, n] = a.caja;
  const anchoX = Math.max((e - o) / CELDAS, 1e-9);
  const anchoY = Math.max((n - s) / CELDAS, 1e-9);
  const cols = Math.max(1, Math.min(CELDAS, Math.ceil((e - o) / anchoX)));
  const filas = Math.max(1, Math.min(CELDAS, Math.ceil((n - s) / anchoY)));
  const ocupada = new Uint8Array(cols * filas);

  for (const pieza of a.piezas) {
    for (const anillo of pieza) {
      for (let i = 1; i < anillo.length; i++) {
        const [x1, y1] = anillo[i - 1];
        const [x2, y2] = anillo[i];
        const ci = Math.max(0, Math.floor((Math.min(x1, x2) - o) / anchoX));
        const cf = Math.min(cols - 1, Math.floor((Math.max(x1, x2) - o) / anchoX));
        const fi = Math.max(0, Math.floor((Math.min(y1, y2) - s) / anchoY));
        const ff = Math.min(filas - 1, Math.floor((Math.max(y1, y2) - s) / anchoY));
        for (let c = ci; c <= cf; c++) {
          for (let f = fi; f <= ff; f++) ocupada[f * cols + c] = 1;
        }
      }
    }
  }

  const reja: Reja = {
    cols,
    filas,
    anchoX,
    anchoY,
    ocupada,
    cajas: a.piezas.map((pieza) => cajaDe(pieza)),
    entero: a.piezas.map((pieza) => pieza.map((anillo) => anillo.map((p) => [p[0], p[1]]))),
    plano: planoDe([comoArea(a)]),
    trozos: new Map(),
    menuda: a.piezas.reduce((s, p) => s + p.reduce((q, an) => q + an.length, 0), 0) < 500,
  };
  rejas.set(a, reja);
  return reja;
}

/**
 * Si el contorno de la zona pasa por la caja de un rasgo.
 *
 * Falso quiere decir algo fuerte: dentro de esa caja la zona es todo o es
 * nada, así que el rasgo está entero a un lado y basta con mirar un punto
 * suyo. Las celdas que caen fuera de la caja de la zona no se miran y no hace
 * falta: ahí tampoco hay contorno, y son terreno de fuera.
 */
function rozaElContorno(
  a: Ambito,
  oeste: number,
  sur: number,
  este: number,
  norte: number,
): boolean {
  const r = rejaDe(a);
  const [o, s] = a.caja;
  const ci = Math.max(0, Math.floor((oeste - o) / r.anchoX));
  const cf = Math.min(r.cols - 1, Math.floor((este - o) / r.anchoX));
  const fi = Math.max(0, Math.floor((sur - s) / r.anchoY));
  const ff = Math.min(r.filas - 1, Math.floor((norte - s) / r.anchoY));
  for (let c = ci; c <= cf; c++) {
    for (let f = fi; f <= ff; f++) if (r.ocupada[f * r.cols + c]) return true;
  }
  return false;
}

/**
 * A cuántos cuadros se parte la zona por lado: treinta y dos.
 *
 * En lo rural eso son cuadros de kilómetro y medio, con unas pocas centenas
 * de esquinas cada uno en vez de las 8.343 de la zona entera.
 */
const NIVEL_TROZO = 5;

/**
 * La zona recortada a un cuadro del mapa.
 *
 * SE PARTE EN DOS EL PROBLEMA. Cortar un predio contra lo rural cuesta 12,3
 * ms porque lo caro no es el predio —cinco esquinas— sino la zona. Así que
 * se corta la zona UNA VEZ contra una cuadrícula, y cada predio se corta
 * después contra el cuadro que le toca, que es pequeño.
 *
 * Y el recorte de cada cuadro no se hace contra la zona entera, sino contra
 * su cuadro padre, que ya está recortado: bajar los cinco niveles cuesta
 * cinco cortes contra algo cada vez más pequeño, en lugar de uno contra las
 * 8.343 esquinas. Medido sobre el catastro contra lo rural: 39 cuadros
 * calculados y 559 ms en total, frente a los 513 s de cortar predio a predio.
 *
 * Solo se calculan los cuadros por los que alguien pregunta, y se guardan.
 */
function trozoDe(a: Ambito, nivel: number, cx: number, cy: number): Multi {
  const r = rejaDe(a);
  if (nivel === 0) return r.entero;

  const clave = `${nivel}:${cx}:${cy}`;
  const hecho = r.trozos.get(clave);
  if (hecho) return hecho;

  const padre = trozoDe(a, nivel - 1, cx >> 1, cy >> 1);
  let trozo: Multi = [];
  // Si en el cuadro de arriba no había zona, aquí tampoco: no hay nada que
  // cortar y el vacío se guarda igual, para no volver a preguntarlo.
  if (padre.length > 0) {
    const [o, s, e, n] = a.caja;
    const lado = 1 << nivel;
    const anchoX = (e - o) / lado;
    const anchoY = (n - s) / lado;
    const x1 = o + cx * anchoX;
    const x2 = x1 + anchoX;
    const y1 = s + cy * anchoY;
    const y2 = y1 + anchoY;
    const cuadro: Multi = [
      [
        [
          [x1, y1],
          [x2, y1],
          [x2, y2],
          [x1, y2],
          [x1, y1],
        ],
      ],
    ];
    trozo = intersecar(padre, cuadro, r.plano) ?? [];
  }
  r.trozos.set(clave, trozo);
  return trozo;
}

/**
 * La zona, pero solo donde cae la caja de un rasgo.
 *
 * Vale para medir lo que comparten: lo que el rasgo tenga fuera de esta caja
 * no puede estar dentro de la zona, así que no hay superficie que perder. Los
 * bordes que la cuadrícula introduce son de mentira, y por eso esto NO se usa
 * para saber si un contorno cruza el otro —ahí se mira la zona de verdad—,
 * solo para medir.
 */
function ambitoCerca(
  a: Ambito,
  oeste: number,
  sur: number,
  este: number,
  norte: number,
): Multi {
  const r = rejaDe(a);
  if (r.menuda) return r.entero;

  const [o, s, e, n] = a.caja;
  const lado = 1 << NIVEL_TROZO;
  const anchoX = (e - o) / lado;
  const anchoY = (n - s) / lado;
  const ci = Math.max(0, Math.floor((oeste - o) / anchoX));
  const cf = Math.min(lado - 1, Math.floor((este - o) / anchoX));
  const fi = Math.max(0, Math.floor((sur - s) / anchoY));
  const ff = Math.min(lado - 1, Math.floor((norte - s) / anchoY));

  const salida: Multi = [];
  for (let c = ci; c <= cf; c++) {
    for (let f = fi; f <= ff; f++) salida.push(...trozoDe(a, NIVEL_TROZO, c, f));
  }
  return salida;
}

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
  /*
   * Los barrios de la zona.
   *
   * Todos son del casco, así que el cantón y lo urbano los tienen todos; una
   * parroquia o una plataforma, los que cuelguen de ella. Por la rama rural
   * no hay ninguno, y ahí la fila NO se pone: un «Barrios 0» junto a una
   * parroquia de 27.900 ha se lee como que algo falló al contar, no como que
   * los barrios son cosa del casco.
   */
  const puedeTenerBarrios =
    a.nivel === "canton" ||
    a.nivel === "urbano" ||
    a.nivel === "plataforma" ||
    (a.nivel === "parroquia" && a.tipo === "urbana");

  if (puedeTenerBarrios) {
    const todos = a.nivel === "canton" || a.nivel === "urbano";
    const cuantos = ambitos.filter(
      (x) =>
        x.nivel === "barrio" &&
        (todos || x.padre === a.clave || x.abuelo === a.clave),
    ).length;
    cifras.push({ etiqueta: "Barrios", valor: numero(cuantos) });
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
  /** El límite urbano: la ciudad y las trece cabeceras parroquiales. */
  limiteUrbano: Capa | null;
  /** La clasificación del suelo: lo urbano y lo rural del cantón. */
  clasificacion: Capa | null;
  plataformas: Capa | null;
  barrios: Capa | null;
  equipamientos: Capa | null;
}

export const VACIA: GeoJSON.FeatureCollection = {
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

function perteneceA(a: Ambito, f: GeoJSON.Feature): boolean {
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

  const esArea = g.type === "Polygon" || g.type === "MultiPolygon";

  /*
   * Y ahora lo que de verdad salva lo rural: ¿le pasa el contorno por encima?
   *
   * Si no le pasa, el rasgo está entero dentro o entero fuera de la zona, y
   * lo dice una esquina cualquiera suya. Sin esto, elegir «Rural» mandaba los
   * 41.679 predios del catastro que quedan fuera a cortarse uno a uno contra
   * las 8.343 esquinas de lo rural. Con esto solo se cortan los del borde,
   * que son los únicos dudosos.
   *
   * Esto NO cambia ninguna respuesta: cuando el contorno sí pasa cerca, la
   * decisión la siguen tomando las mismas reglas de abajo, intactas.
   */
  if (!rozaElContorno(a, oeste, sur, este, norte)) {
    const [x, y] = vertices[0];
    return dentro(a, x, y);
  }

  /*
   * Puntos y líneas: con que algo suyo caiga dentro, basta.
   *
   * Para las ÁREAS no vale ese atajo. Un punto que cae justo en el límite
   * cuenta como dentro, y dos dibujos del mismo límite comparten vértices,
   * así que al elegir la cabecera de Licán entraban seis barrios del casco
   * —cuatro de ellos compartiendo 0,00 ha, solo la raya—. Un área se mide,
   * no se roza.
   */
  if (!esArea && vertices.some(([x, y]) => dentro(a, x, y))) return true;

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
  if (!esArea) return cortaElBorde(g, a);

  /*
   * El área se queda si su CENTRO está dentro, y si no, si comparte
   * superficie de verdad.
   *
   * Lo del centro es el camino rápido y cubre la inmensa mayoría: con el
   * catastro dentro de una plataforma son decenas de miles de predios, y
   * cortar polígonos uno a uno para saber lo que el centro ya dice sería
   * pagar segundos por nada. Lo caro se reserva para los del borde, que son
   * pocos y los únicos dudosos.
   */
  const c = centroDeRasgo(f);
  if (c && dentro(a, c[0], c[1])) return true;

  /*
   * Y si solo se cruzan los contornos, hay que mirar CUÁNTO comparten.
   *
   * Dos dibujos del mismo límite nunca coinciden al milímetro, así que dos
   * áreas que apenas se tocan por el borde producen cruces de verdad. Con
   * eso bastaba para dibujarlas enteras: al elegir la cabecera de Licán
   * salían seis barrios del casco, y cuatro de ellos compartían 0,00 ha —solo
   * la línea—. Un barrio entero traído por rozar una raya es ruido.
   *
   * Se exige un solape de verdad. La cuenta solo se hace aquí, que es el caso
   * dudoso y el raro: lo que tiene un vértice dentro ya salió por arriba.
   */
  const cerca = ambitoCerca(a, oeste, sur, este, norte);
  if (cerca.length === 0) return false;
  const trozos = intersecar(aMulti(g), cerca, rejaDe(a).plano) ?? [];
  const compartido = trozos.reduce(
    (s, poly) =>
      s + areaM2({ type: "Polygon", coordinates: poly as number[][][] }),
    0,
  );
  if (compartido <= SOLAPE_MINIMO_M2) return false;

  /*
   * Y además tiene que ser un pedazo de algo, no una esquina.
   *
   * Con el mínimo absoluto solo, una parroquia de 2.100 ha se dibujaba entera
   * porque la plataforma D le pisaba 1.116 m²: el 0,005 % de ella. En pantalla
   * eso es Licán apareciendo al lado de una plataforma del centro sin que nada
   * lo explique.
   *
   * Vale con que al menos el 1 % del RASGO esté dentro. Y solo eso: que la
   * zona quepa entera dentro del rasgo no basta, porque entonces una
   * parroquia de 5.186 ha se dibujaba por contener una cabecera de 41, y al
   * mirar lo urbano aparecía el campo que lo rodea. Lo que envuelve la zona
   * no está en la zona; dónde estás ya lo dicen los desplegables de arriba.
   */
  const suya = poligonosDe(g).reduce(
    (s, piezas) =>
      s + areaM2({ type: "Polygon", coordinates: piezas as number[][][] }),
    0,
  );
  return compartido >= PARTE_MINIMA * suya;
}

/** Qué parte hay que compartir para contar como «dentro»: el uno por ciento. */
const PARTE_MINIMA = 0.01;

/**
 * Cuánto hay que compartir para contar como «dentro».
 *
 * Cien metros cuadrados: por debajo de eso no es territorio compartido, es el
 * desajuste entre dos dibujos del mismo límite.
 */
const SOLAPE_MINIMO_M2 = 100;

/** Un ámbito como geometría, para las operaciones entre polígonos. */
const comoArea = (a: Ambito): GeoJSON.Geometry => ({
  type: "MultiPolygon",
  coordinates: a.piezas as number[][][][],
});

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
  const { barrios } = capas;

  /*
   * Esto dice QUE PERTENECE A LA ZONA, no qué se pinta.
   *
   * Antes dejaba las plataformas vacías aquí mismo, porque en el modo Mirar
   * las pinta el mapa aparte para poder destacar la elegida. Pero eso es una
   * decisión de dibujo, y mezclarla aquí significaba que al usar este recorte
   * para ANALIZAR las plataformas desaparecían de la mesa. Ahora el vaciado
   * vive donde se decide el dibujo, y esta función responde una sola
   * pregunta.
   */
  if (a.nivel === "canton") return salida;

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

  for (const capa of todas) {
    // Las plataformas tambien se recortan. Antes se saltaban porque el mapa
    // las pinta aparte, y asi este recorte nunca supo cuantas caen en la
    // zona: al analizar «lo urbano» entraban las dieciocho.
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
      soloCon(capa, (f) => perteneceA(a, f)),
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
  { archivo: "limite_urbano.geojson", nombre: "Límite urbano" },
  { archivo: "clasificacion_suelo.geojson", nombre: "Clasificación del suelo" },
  { archivo: "plataformas.geojson", nombre: "Plataformas" },
  { archivo: "barrios.geojson", nombre: "Barrios" },
  { archivo: "equipamientos.geojson", nombre: "Equipamientos" },
];
