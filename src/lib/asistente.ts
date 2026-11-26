/**
 * El asistente: se escribe la pregunta y él arma el análisis.
 *
 * GOAT resolvió esto con un modelo de lenguaje —GOAT AI— y por ese camino no
 * se podía ir. CHASKI es un sitio estático: una clave de API metida aquí
 * viajaría dentro del JavaScript publicado y cualquiera podría leerla. Y un
 * asistente con modelo manda fuera qué capa tienes abierta y qué columnas
 * trae, que es justo lo que la pantalla de inicio promete que no pasa.
 *
 * Así que esto NO GENERA TEXTO: **elige** entre lo que ya existe. Lee la
 * frase, la compara con las doce recetas y con los nombres de tus capas, sus
 * campos y sus valores, y devuelve la receta con los huecos rellenos. Después
 * la enseña entera antes de correr nada.
 *
 * De ahí salen tres propiedades que un modelo no puede dar, y que para una
 * cifra que va a un informe municipal valen más que entender cualquier frase:
 *
 *  1. **No puede inventarse nada.** Si propone «Equipamientos», es porque hay
 *     una capa que se llama así; si propone «tipo = Salud», es porque ese
 *     valor está en esa columna. No hay ningún paso donde se escriba algo que
 *     no estuviera ya en los datos.
 *  2. **Es determinista.** La misma frase con las mismas capas da siempre lo
 *     mismo. No hay temperatura, ni versión del modelo, ni día bueno.
 *  3. **Se explica.** Devuelve por qué eligió cada cosa, de modo que el error
 *     se ve antes de correr y no después de publicar.
 *
 * Lo que pierde: entiende menos frases. No sabe de sinónimos que no estén
 * escritos aquí abajo ni de preguntas que no sean una de las doce. Cuando no
 * entiende lo dice, y ofrece lo más parecido en vez de adivinar.
 */
import { RECETAS, type Hueco, type Receta } from "./recetas";
import { valoresDe } from "./herramientas";
import { esNumerico } from "./estilo";
import type { Capa } from "./cargar";

/** Sin tildes, sin mayúsculas y sin signos: así se compara todo. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

const palabras = (s: string) => normalizar(s).split(" ").filter(Boolean);

/**
 * Palabras que delatan a cada receta.
 *
 * Es el vocabulario del asistente, y está escrito a mano a propósito: es la
 * única parte que «sabe» algo, así que tiene que poder leerse y discutirse de
 * un vistazo. Si alguien pregunta algo que no entiende, se arregla añadiendo
 * la palabra aquí, no reentrenando nada.
 *
 * No hace falta meter las que ya están en la pregunta de la receta —esas se
 * añaden solas—; aquí van las otras formas de decir lo mismo.
 *
 * **Una entrada con espacios es una FRASE y se busca entera.** No es un
 * detalle: cuando se partían en palabras sueltas, el «cuanto falta» de la
 * receta de la distancia dejaba suelto un «falta» que es justo la palabra de
 * la receta de lo desatendido, y «dónde faltan equipamientos» acababa
 * midiendo distancias. Una frase vale el doble que una palabra, porque
 * acertar tres seguidas no pasa por casualidad.
 */
const VOCABULARIO: Record<string, string[]> = {
  avance: ["avance", "evolucion", "meses", "fecha", "fechas", "cuando", "historico", "crecio", "crecimiento", "mes a mes"],
  // Sin «en cada» ni «por zona»: salen en media docena de preguntas, asi que
  // no distinguen ninguna. Con ellas, «cuanta superficie hay en cada barrio»
  // se iba a contar registros.
  /*
   * «media» y «promedio» mandan, pero no bastan.
   *
   * «cuantos hay de media por barrio» tambien lleva «media» y es un conteo;
   * por eso la receta de contar conserva sus palabras y aqui gana quien
   * sume mas, que es lo que hace el marcador. Lo que si es inequivoco es
   * «altura media» o «promedio de», y esas van como frase entera.
   */
  "media-zona": [
    "media",
    "promedio",
    "media de",
    "promedio de",
    "valor medio",
    "altura media",
    "media por",
    "promedio por",
    "que altura",
    "de media",
  ],
  contar: ["cuantos", "cuantas", "contar", "cuenta", "numero", "total", "densidad", "tienen", "mayor", "ranking", "cuales tienen"],
  lejos: ["lejos", "lejania", "cerca", "cercano", "cercania", "distancia", "acceso", "accesibilidad", "a que distancia", "mas proximo", "cuanto queda"],
  desatendidos: ["desatendido", "desatendidos", "desierto", "carencia", "deficit", "rejilla", "faltan", "sin servicio", "sin cobertura", "sin equipamiento", "peor servido", "mal servido", "no llega", "donde faltan"],
  concentracion: ["amontonan", "amontona", "concentra", "concentracion", "aglomeracion", "caliente", "calientes", "hotspot", "racimo", "cumulo", "puntos calientes"],
  cobertura: ["radio", "cubre", "alrededor", "buffer", "influencia", "redonda", "area de influencia", "radio de"],
  "superficie-zona": ["superficie", "hectareas", "cuanta", "ocupa", "ocupacion", "porcentaje", "que parte de cada"],
  kilometros: ["kilometros", "longitud", "metros de via", "km de"],
  clases: ["clase", "clases", "tipos", "categoria", "categorias", "desglose", "cuanto de cada", "de cada tipo"],
  sectores: ["sectores", "sector", "rutas", "brigadas", "cuadrillas", "grupos", "agrupar", "dividir", "repartir", "reparto de trabajo"],
  dentro: ["dentro", "recortar", "recorte", "cortar", "intersecta", "solapa", "limitar", "cae dentro", "parte de"],
  juntar: ["etiquetar", "asignar", "pegar", "pertenece", "de que zona", "a que zona", "en que barrio", "con su barrio", "el nombre del"],
};

/** Una lectura de la frase: qué receta, con qué huecos rellenos. */
export interface Lectura {
  receta: Receta;
  valores: Record<string, string>;
  /** Cuánto encaja la frase con esta receta. Solo sirve para ordenar. */
  puntos: number;
  /** Por qué eligió cada cosa, en una línea cada una. */
  porque: string[];
  /** Los huecos que no supo rellenar y hay que elegir a mano. */
  faltan: Hueco[];
  /** Si gana con claridad. Si no, se ofrece como pregunta y no como respuesta. */
  seguro?: boolean;
}

/** Los huecos de una receta, sin los textos. */
const huecosDe = (r: Receta): Hueco[] =>
  r.frase.filter((x): x is Hueco => typeof x !== "string");

/**
 * Cuánto se parece el nombre de una capa a lo que hay escrito.
 *
 * Cuenta las palabras del nombre que aparecen en la frase, no al revés: así
 * «barrios» encuentra a «Barrios» y también «en cada barrio» lo encuentra,
 * porque se compara por raíz de cinco letras y no por igualdad. Sin eso,
 * singular y plural no se tocarían, que es la mitad de las frases.
 */
function parecido(nombre: string, dichas: string[]): number {
  const suyas = palabras(nombre).filter((p) => p.length > 2);
  if (suyas.length === 0) return 0;
  let aciertos = 0;
  for (const p of suyas) {
    const raiz = p.slice(0, 5);
    if (dichas.some((d) => d.startsWith(raiz) || p.startsWith(d.slice(0, 5)))) {
      aciertos++;
    }
  }
  return aciertos / suyas.length;
}

/**
 * LA PREPOSICION DE LA RECETA DICE QUE HUECO ES CUAL.
 *
 * «La altura media de las edificaciones EN CADA poligono de intervencion» y
 * «la altura media de los poligonos de intervencion EN CADA edificacion» usan
 * las mismas dos capas y son preguntas opuestas. Lo que las distingue es el
 * «en cada», y la receta lo lleva escrito: su frase es «Calcular la media de
 * ___ de ___ en cada ___», asi que el hueco de zonas viene precedido de «en
 * cada» y el de entrada, de «de».
 *
 * Sin esto, cuando las dos capas son poligonos y las dos se nombran, el
 * reparto lo decidia el parecido del nombre: las 170 manzanas del PUGS
 * entraban como la capa a medir y las 166.530 edificaciones como las zonas,
 * que es la pregunta del reves y ademas tarda un cuarto de hora.
 *
 * Devuelve las ultimas palabras del texto que precede al hueco, que son las
 * que de verdad marcan —«en cada», «de», «desde cada»—.
 */
function conectorDe(receta: Receta, clave: string): string[] {
  let previo = "";
  for (const parte of receta.frase) {
    if (typeof parte === "string") previo = parte;
    else if (parte.clave === clave) break;
  }
  return palabras(previo).slice(-2);
}

/**
 * Si el nombre de la capa viene precedido en la frase por ese conector.
 *
 * Se mira justo delante: una preposicion a cinco palabras de distancia ya no
 * dice de que capa habla.
 */
function traeConector(
  nombre: string,
  dichas: string[],
  conector: string[],
): boolean {
  const i = dondeAparece(nombre, dichas);
  if (!Number.isFinite(i) || conector.length === 0) return false;
  const antes = dichas.slice(Math.max(0, i - conector.length), i);
  return (
    antes.length > 0 && antes[antes.length - 1] === conector[conector.length - 1]
  );
}

/** Dónde aparece por primera vez el nombre de una capa en la frase. */
function dondeAparece(nombre: string, dichas: string[]): number {
  const suyas = palabras(nombre).filter((p) => p.length > 2);
  for (let i = 0; i < dichas.length; i++) {
    if (suyas.some((p) => dichas[i].startsWith(p.slice(0, 5)))) return i;
  }
  return Infinity;
}

/**
 * Un filtro deducido de la frase, mirando los valores que la capa trae.
 *
 * «equipamientos de salud» sale de que la columna `tipo` de esa capa tiene un
 * valor que se llama «Salud». No se adivina la palabra: se busca.
 *
 * Solo en columnas con menos de doscientos valores distintos. En una de
 * cuarenta mil claves catastrales no hay ninguna que alguien vaya a escribir
 * en una pregunta, y recorrerlas todas por cada frase cuesta de más.
 */
/**
 * La columna numérica que la frase nombra, si hay una sola candidata.
 *
 * Compara los trozos del nombre de la columna con las palabras dichas: un
 * trozo cuenta si alguna palabra de la frase empieza por él, de tres letras en
 * adelante. Así `alt_med_m` puntúa dos veces con «altura media» —«alt» por
 * «altura» y «med» por «media»— y el «m» suelto no cuenta, que si contara
 * engancharía cualquier cosa.
 */
function campoNumericoDe(capa: Capa, dichas: string[]): string | null {
  const marcador = capa.campos
    .filter((f) => esNumerico(capa.geo, f.nombre))
    .map((f) => {
      const trozos = palabras(f.nombre).filter((t) => t.length >= 3);
      const aciertos = trozos.filter((t) =>
        dichas.some((d) => d.startsWith(t) || t.startsWith(d)),
      ).length;
      return { nombre: f.nombre, aciertos };
    })
    .filter((x) => x.aciertos > 0)
    .sort((a, b) => b.aciertos - a.aciertos);
  if (marcador.length === 0) return null;
  // Empate: no se adivina.
  if (marcador[1] && marcador[1].aciertos === marcador[0].aciertos) return null;
  return marcador[0].nombre;
}

function filtroDe(capa: Capa, dichas: string[]): { campo: string; valor: string } | null {
  const frase = ` ${dichas.join(" ")} `;
  for (const campo of capa.campos) {
    if (campo.distintos < 2 || campo.distintos > 200) continue;
    for (const { valor } of valoresDe(capa, campo.nombre)) {
      const v = normalizar(valor);
      if (v.length < 4) continue;
      if (frase.includes(` ${v} `)) return { campo: campo.nombre, valor };
    }
  }
  return null;
}

/** El primer número con unidad que aparezca: «400 m», «10 minutos». */
function numeroDe(texto: string, unidad: "m" | "min"): string | null {
  const re =
    unidad === "m"
      ? /(\d[\d.]*)\s*(m\b|mts\b|metros\b)/i
      : /(\d[\d.]*)\s*(min\b|minutos\b)/i;
  const m = texto.match(re);
  return m ? m[1].replace(/\./g, "") : null;
}

/**
 * Lee la frase y devuelve las lecturas posibles, la mejor primero.
 *
 * Devuelve varias a propósito. Cuando dos recetas empatan —«cuántos hay en
 * cada barrio» puede ser contar o unir— enseñar la segunda al lado cuesta una
 * línea y evita que el usuario se quede pensando que el programa no le
 * entiende, cuando lo que pasa es que su pregunta tenía dos lecturas.
 */
export function interpretar(texto: string, capas: Capa[]): Lectura[] {
  const dichas = palabras(texto);
  if (dichas.length === 0) return [];

  const dicho = ` ${dichas.join(" ")} `;
  /*
   * Las raices de los nombres de las capas que hay cargadas.
   *
   * Sirven para descontarlas del vocabulario: una palabra que nombra una capa
   * esta diciendo SOBRE QUE, no QUE HACER, y dejarla puntuar hace que la
   * receta cuyo vocabulario contenga ese nombre gane siempre que se mencione.
   */
  const nombresDeCapa = new Set(
    capas.flatMap((c) =>
      palabras(c.nombre).filter((p) => p.length > 3).map((p) => p.slice(0, 5)),
    ),
  );

  const lecturas: Lectura[] = [];
  for (const receta of RECETAS) {
    /*
     * SOLO PALABRAS DE CUATRO LETRAS O MAS, en los dos lados.
     *
     * Con tres bastaba para que «lo» —de «lo que la gente necesita»— casara
     * con «los» de cualquier frase, y entonces la receta de la distancia
     * puntuaba en todas y ganaba casi siempre. Una palabra de tres letras no
     * distingue una pregunta de otra; lo unico que hace es colarse.
     */
    const entradas = [
      ...palabras(receta.pregunta),
      ...(VOCABULARIO[receta.clave] ?? []).map(normalizar),
    ];
    const frases = entradas.filter((v) => v.includes(" "));
    const vocab = new Set(
      entradas.filter((v) => !v.includes(" ") && v.length >= 4),
    );
    for (const p of ["cada", "esta", "esto", "como", "cual", "hace", "para"]) {
      vocab.delete(p);
    }

    let acertadas = 0;
    for (const d of dichas) {
      if (d.length < 4) continue;
      // El nombre de una capa NO es vocabulario: es el operando, no la
      // operacion. «Recortar vialidad a los barrios» puntuaba para la receta
      // de los kilometros porque «vialidad» esta en su vocabulario, cuando
      // ahi solo esta nombrando la capa que se quiere recortar.
      if (nombresDeCapa.has(d.slice(0, 5))) continue;
      const raiz = d.slice(0, 5);
      if ([...vocab].some((v) => v.startsWith(raiz) || d.startsWith(v.slice(0, 5)))) {
        acertadas += 1;
      }
    }
    // Una frase entera acertada vale por dos palabras: tres seguidas no
    // coinciden por casualidad.
    for (const f of frases) if (dicho.includes(f)) acertadas += 2;
    if (acertadas === 0) continue;

    /*
     * LA RECETA LA ELIGEN LAS PALABRAS, no cuantos huecos se dejan llenos.
     *
     * Antes cada capa reconocida sumaba lo mismo que una palabra acertada, y
     * como unas recetas tienen dos huecos de capa y otras uno, la de dos
     * ganaba aunque la frase hablara claramente de la otra. Los huecos solo
     * desempatan: por eso van multiplicados por uno y las palabras por diez.
     */
    let puntos = acertadas * 10;

    // --- rellenar los huecos ---------------------------------------------
    const huecos = huecosDe(receta);
    const valores: Record<string, string> = { ...(receta.fijos ?? {}) };
    const porque: string[] = [];
    const faltan: Hueco[] = [];
    const usadas = new Set<string>();
    const nombresUsados = new Set<string>();

    /*
     * LOS HUECOS MAS EXIGENTES PRIMERO, no en el orden de la frase.
     *
     * «En que barrio cae cada equipamiento» tiene dos huecos: uno admite
     * cualquier forma y el otro solo areas. Rellenando por orden de frase, el
     * primero se quedaba con los barrios —se nombran antes— y al segundo, que
     * solo admite areas, ya no le quedaba ninguna: acababa cogiendo la OTRA
     * capa llamada «Barrios», y los equipamientos no entraban en la frase.
     *
     * Empezando por el hueco que menos capas admite, los barrios van a su
     * sitio y los equipamientos caen solos en el que acepta cualquier cosa.
     */
    const porExigencia = [...huecos].sort((a, b) => {
      const caben = (h: Hueco) =>
        h.tipo === "capa"
          ? capas.filter((c) => (h.formas ?? []).includes(c.forma)).length
          : 99;
      return caben(a) - caben(b);
    });

    for (const h of porExigencia) {
      if (h.tipo === "capa") {
        const conector = conectorDe(receta, h.clave);
        const sirven = capas
          .filter((c) => (h.formas ?? []).includes(c.forma) && !usadas.has(c.id))
          .map((c) => ({
            c,
            p: parecido(c.nombre, dichas),
            donde: dondeAparece(c.nombre, dichas),
            conecta: traeConector(c.nombre, dichas, conector),
          }))
          /*
           * Medio nombre no basta. «Mapa de gravedad · Equipamientos» comparte
           * una palabra con «equipamientos» y se colaba en el segundo hueco de
           * cualquier frase que la mencionara. Se exige que coincida la mitad
           * larga del nombre.
           */
          .filter((x) => x.p >= 0.5 && !nombresUsados.has(normalizar(x.c.nombre)))
          // Primero la que lleva la preposicion del hueco delante; despues, el
          // parecido del nombre; y a igualdad, la que se nombra antes.
          .sort(
            (a, b) =>
              Number(b.conecta) - Number(a.conecta) ||
              b.p - a.p ||
              a.donde - b.donde,
          );
        if (sirven.length > 0) {
          valores[h.clave] = sirven[0].c.id;
          usadas.add(sirven[0].c.id);
          /*
           * Y no se repite el NOMBRE, no solo la capa. Con dos «Barrios» en la
           * mesa —el del ejemplo y el del municipio— la frase salia hablando
           * de barrios en los dos huecos, que no es lo que nadie pregunta.
           */
          nombresUsados.add(normalizar(sirven[0].c.nombre));
          porque.push(`«${sirven[0].c.nombre}» porque la nombras`);
          puntos += 1;
          /*
           * LA FORMA DE LA CAPA DESEMPATA.
           *
           * «Cuánta vialidad hay en cada barrio» no dice ni «kilómetros» ni
           * «longitud», así que por palabras empata con contar registros. Pero
           * la receta de los kilómetros solo admite líneas en ese hueco y la de
           * contar admite cualquier cosa: la que pone condiciones y las cumple
           * encaja mejor que la que no pide nada. Vale menos que una palabra
           * —tres frente a diez—, así que desempata y nunca manda.
           */
          if ((h.formas ?? []).length < 4) puntos += 3;
        } else {
          faltan.push(h);
        }
      } else if (h.tipo === "numero") {
        const n = numeroDe(texto, h.unidad === "min" ? "min" : "m");
        if (n) {
          valores[h.clave] = n;
          porque.push(`${n} ${h.unidad ?? ""} porque lo escribes`.trim());
          puntos += 1;
        } else if (h.defecto) {
          valores[h.clave] = h.defecto;
        } else {
          faltan.push(h);
        }
      } else {
        /*
         * EL CAMPO SE BUSCA EN LA FRASE, igual que el filtro.
         *
         * Quien escribe «altura media de las edificaciones por plataforma» ya
         * dijo qué quiere medir. La columna se llama `alt_med_m`, que no es la
         * palabra pero empieza por ella: se parte el nombre de la columna en
         * trozos y se mira cuáles aparecen en la frase. Si una columna gana
         * sola, se propone diciendo por qué; si empatan dos, se deja el hueco
         * vacío, porque proponer la equivocada es peor que no proponer.
         *
         * Nunca se inventa: la columna existe y es numérica, y eso se
         * comprueba sobre los datos que están cargados.
         */
        const deLaCapa = capas.find((c) => c.id === valores.entrada);
        const c = h.soloNumero && deLaCapa ? campoNumericoDe(deLaCapa, dichas) : null;
        if (c) {
          valores[h.clave] = c;
          porque.push(`la columna «${c}» porque la nombras`);
          puntos += 2;
        } else if (h.defecto) valores[h.clave] = h.defecto;
        else faltan.push(h);
      }
    }

    // --- el filtro, de los valores que la capa de entrada trae -------------
    const entrada = capas.find((c) => c.id === valores.entrada);
    if (entrada) {
      const f = filtroDe(entrada, dichas);
      if (f) {
        valores.campo = f.campo;
        valores.valor = f.valor;
        porque.push(`solo «${f.valor}» porque la columna «${f.campo}» lo tiene`);
        puntos += 1;
      }
    }

    lecturas.push({ receta, valores, puntos, porque, faltan });
  }

  /*
   * SIN VERBO PERO CON CAPAS: se pregunta, no se calla.
   *
   * «Equipamientos por barrio» no trae ni una palabra de operacion —las dos
   * nombran capas— asi que ninguna receta puntua y antes contestaba que no
   * entendia. Pero es como se escribe de verdad, y la pregunta no es
   * imposible: es ambigua. Un humano responderia «¿contarlos o etiquetarlos?»
   * y eso es justo lo que se hace aqui: se ofrecen las recetas que encajan con
   * las capas nombradas, ninguna como segura.
   */
  if (lecturas.length === 0) {
    const nombradas = capas.filter((c) => parecido(c.nombre, dichas) >= 0.5);
    if (nombradas.length >= 2) {
      for (const receta of RECETAS) {
        const h = huecosDe(receta).filter((x) => x.tipo === "capa");
        if (h.length < 2) continue;
        const valores: Record<string, string> = { ...(receta.fijos ?? {}) };
        const usadas = new Set<string>();
        let llenos = 0;
        for (const hueco of h) {
          const sirve = nombradas.find(
            (c) => (hueco.formas ?? []).includes(c.forma) && !usadas.has(c.id),
          );
          if (sirve) {
            valores[hueco.clave] = sirve.id;
            usadas.add(sirve.id);
            llenos++;
          }
        }
        if (llenos === h.length) {
          lecturas.push({
            receta,
            valores,
            puntos: llenos,
            porque: [`encaja con ${[...usadas].length} capas que nombras`],
            faltan: [],
          });
        }
      }
    }
  }

  /*
   * UN HUECO SIN RELLENAR RESTA, y resta antes de decidir si hay certeza.
   *
   * «Cuantos equipamientos de salud hay en cada barrio» empataba con la
   * receta de la superficie, porque «cuantos» y «cuanta» comparten raiz y era
   * la unica palabra de operacion de la frase. Pero la de superficie solo
   * admite areas en su primer hueco, asi que los equipamientos no le caben y
   * se quedaba a medias: una lectura que ni siquiera se puede completar con
   * lo que el usuario nombro es peor lectura, y tenia que notarse en la
   * cuenta y no solo en el orden.
   */
  for (const l of lecturas) l.puntos -= l.faltan.length * 5;

  const orden = lecturas
    .sort((a, b) => b.puntos - a.puntos || a.faltan.length - b.faltan.length)
    .slice(0, 4);

  /*
   * SEGURO SOLO SI GANA POR UNA PALABRA ENTERA.
   *
   * Decir «entendí» de una lectura que gano por un pelo es peor que no
   * entender: el usuario la pulsa sin leerla, porque el programa ha sonado
   * convencido. «Zonas sin cobertura de equipamientos» y «dónde faltan
   * equipamientos» eran empates de una palabra que se presentaban como
   * certezas. Si no hay diez puntos —una palabra acertada— entre la primera y
   * la segunda, se ofrecen todas como pregunta y no como respuesta.
   */
  if (orden.length > 0) {
    const gana = orden[0];
    const segunda = orden[1];
    /*
     * Hay dos maneras de estar seguro, y son de distinta naturaleza.
     *
     * Por PALABRAS: la primera acierta una palabra de operacion mas que la
     * segunda. Diez puntos es exactamente eso.
     *
     * O por ENCAJE: la primera se completa con las capas que el usuario
     * nombro y la segunda no. «Cuantos equipamientos de salud hay en cada
     * barrio» empata en palabras con la receta de la superficie —«cuantos» y
     * «cuanta» son la misma— pero esa solo admite areas donde van los
     * equipamientos, que son puntos, y se queda a medias. Poder completarla
     * es una razon tan buena como una palabra, y es la que usaria cualquiera:
     * de unos puntos no se pregunta la superficie.
     *
     * Mezclar las dos en un solo numero fue el error de la primera version:
     * los bonos de encaje nunca llegaban a los diez puntos del umbral de
     * palabras, asi que no decidian nada.
     */
    gana.seguro =
      !segunda ||
      gana.puntos - segunda.puntos >= 10 ||
      (gana.faltan.length === 0 && segunda.faltan.length > 0);
    if (!gana.seguro) for (const l of orden) l.seguro = false;
  }
  return orden;
}

/**
 * Ejemplos para cuando la caja está vacía, hechos con las capas que hay.
 *
 * Una caja de texto en blanco con «escribe tu pregunta» no dice qué clase de
 * preguntas entiende, y la primera que se prueba suele ser la que no. Con los
 * nombres de las capas de encima de la mesa dentro, el ejemplo enseña a la vez
 * la forma de la frase y que el programa ya sabe qué tienes cargado.
 */
export function ejemplos(capas: Capa[]): string[] {
  /*
   * Los ejemplos se hacen con las capas CARGADAS, no con las calculadas.
   *
   * Una capa derivada se llama «Agrupamiento en 6 · Equipamientos», y un
   * ejemplo hecho con dos de ellas sale como «¿Cuantos Agrupamiento en 6 ·
   * Equipamientos hay en cada Conteo por zona · Equipamientos?», que no
   * enseña la forma de la frase: la esconde. Si no hay cargadas se usan las
   * que haya, que es mejor que no poner ejemplo.
   */
  const propias = capas.filter((c) => !c.derivada);
  const donde = propias.length > 0 ? propias : capas;
  const puntos = donde.find((c) => c.forma === "punto");
  const areas = donde.find((c) => c.forma === "poligono" || c.forma === "mixta");
  const lineas = donde.find((c) => c.forma === "linea");
  const salida: string[] = [];
  if (puntos && areas) {
    salida.push(`¿Cuántos ${puntos.nombre} hay en cada ${areas.nombre}?`);
    salida.push(`¿Dónde se amontonan los ${puntos.nombre}?`);
  }
  if (puntos) salida.push(`¿Qué área cubre un radio de 400 m alrededor de ${puntos.nombre}?`);
  if (lineas && areas) salida.push(`¿Cuántos kilómetros de ${lineas.nombre} hay en cada ${areas.nombre}?`);
  if (puntos && areas) salida.push(`¿Qué tan lejos queda ${puntos.nombre} desde cada ${areas.nombre}?`);
  return salida.slice(0, 4);
}
