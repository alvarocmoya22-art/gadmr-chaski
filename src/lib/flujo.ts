/**
 * Flujos: encadenar herramientas en vez de ejecutarlas una por una.
 *
 * Es lo que GOAT llama un workflow. Un análisis de verdad casi nunca es una
 * herramienta: es recortar la vialidad al barrio, medir sus kilómetros y
 * repartirlos por zona. Hasta ahora eso eran tres idas y venidas, y para
 * rehacerlo el mes siguiente —o con otro barrio— había que acordarse del
 * orden, de los parámetros y de qué capa intermedia era cuál.
 *
 * Un flujo guarda esos pasos, los corre seguidos y se puede volver a correr
 * cuando los datos cambien.
 *
 * El orden lo marcan las DEPENDENCIAS, no la posición en la lista ni en el
 * lienzo. Un paso corre cuando los pasos de los que bebe ya corrieron, así
 * que se puede colocar los nodos donde se quiera y ramificar: dos pasos
 * pueden beber del mismo resultado y un tercero juntar los dos. Lo único que
 * no se admite es un círculo, y se dice cuál.
 */
import type { Capa } from "./cargar";
import { HERRAMIENTAS, type Herramienta } from "./herramientas";
import { TODA_LA_CATEGORIA } from "./hotspot";

/** Un paso: una herramienta, su entrada y sus parámetros. */
export interface Paso {
  id: string;
  herramienta: string;
  /**
   * De dónde sale la capa de entrada.
   *
   * El identificador de una capa de la mesa, o `paso:<id>` para el resultado
   * de un paso anterior. Lo segundo es lo que convierte una lista en una
   * cadena.
   */
  entrada: string;
  valores: Record<string, string>;
  /**
   * Dónde está el nodo en el lienzo del constructor.
   *
   * Se guarda con el paso porque la colocación es parte del modelo: al
   * volver, los nodos tienen que estar donde uno los dejó o hay que releer
   * el flujo entero para reconocerlo.
   */
  posicion?: { x: number; y: number };
}

export const REF_PASO = "paso:";
export const esRefPaso = (v: string) => v.startsWith(REF_PASO);
export const refAPaso = (v: string) => v.slice(REF_PASO.length);

/**
 * Lo que vale cada parámetro al añadir un paso.
 *
 * Con los huecos vacíos, el control enseña «500» —su valor por omisión— y la
 * herramienta calcula con el suyo, que puede ser otro: se lee una cifra en
 * pantalla y sale otra en el resultado. Es el peor fallo posible en algo que
 * va a un informe, porque no avisa: simplemente da un número equivocado.
 */
export function valoresIniciales(clave: string): Record<string, string> {
  const h = HERRAMIENTAS.find((x) => x.clave === clave);
  const base: Record<string, string> = {};
  for (const p of h?.parametros ?? []) {
    if (p.tipo === "opcion") base[p.clave] = p.defecto ?? p.opciones[0].valor;
    else if (p.tipo === "numero") base[p.clave] = String(p.defecto);
    else if (p.tipo === "valor") base[p.clave] = TODA_LA_CATEGORIA;
    else base[p.clave] = "";
  }
  return base;
}

let contador = 0;
export const idDePaso = () => `p${Date.now().toString(36)}${contador++}`;

/** Cómo quedó cada paso al correr el flujo. */
export interface Marcha {
  paso: string;
  estado: "bien" | "mal" | "sin correr";
  /** Lo que salió, para poder enseñarlo y encadenarlo. */
  capa?: Capa;
  error?: string;
  aviso?: string;
}

export const herramientaDe = (clave: string): Herramienta | null =>
  HERRAMIENTAS.find((h) => h.clave === clave) ?? null;

/**
 * La capa que entra en un paso, resolviendo las referencias.
 *
 * Devuelve null si la referencia no se puede resolver —la capa se quitó de la
 * mesa, o el paso al que apunta todavía no ha corrido—, y quien llama decide
 * si eso es un error o solo que aún no toca.
 */
export function entradaDe(
  paso: Paso,
  capas: Capa[],
  hechos: Map<string, Capa>,
): Capa | null {
  if (esRefPaso(paso.entrada))
    return hechos.get(refAPaso(paso.entrada)) ?? null;
  return capas.find((c) => c.id === paso.entrada) ?? null;
}

/** Lo que falta para que un paso pueda correr, dicho en una línea. */
export function queFaltaEn(
  paso: Paso,
  pasos: Paso[],
  capas: Capa[],
): string | null {
  const h = herramientaDe(paso.herramienta);
  if (!h) return "Esa herramienta ya no existe.";

  if (paso.entrada === "") return "Falta decir qué capa entra.";

  if (esRefPaso(paso.entrada)) {
    const id = refAPaso(paso.entrada);
    if (!pasos.some((p) => p.id === id)) {
      return "Toma el resultado de un paso que ya no está.";
    }
    // Que forme parte de un círculo lo dice `ordenDe` al repartir el orden:
    // aquí solo se comprueba que lo que señala exista.
    return null;
  }

  const capa = capas.find((c) => c.id === paso.entrada);
  if (!capa) return "La capa que tenía elegida ya no está en la mesa.";
  if (!h.acepta.includes(capa.forma)) {
    return `«${h.nombre}» no trabaja con esa forma.`;
  }
  return null;
}

/**
 * Corre el flujo entero, de arriba abajo.
 *
 * Se para en el primer paso que falla y devuelve lo que llevaba hecho: los
 * pasos anteriores ya dieron su capa y sirven, y así se ve dónde se rompió en
 * vez de perderlo todo.
 *
 * No toca la mesa: devuelve las capas y quien llama decide cuáles guarda. Un
 * flujo de cinco pasos deja cinco capas intermedias, y meterlas todas en la
 * mesa cada vez que se corre la llenaría de resultados que nadie pidió.
 */
/** De qué pasos bebe este: su entrada y los parámetros que apuntan a otro. */
export function dependenciasDe(paso: Paso): string[] {
  const refs = [paso.entrada, ...Object.values(paso.valores)]
    .filter(esRefPaso)
    .map(refAPaso);
  return [...new Set(refs)];
}

/**
 * El orden en que hay que correr los pasos.
 *
 * Un paso va después de aquellos de los que bebe, y da igual dónde esté en la
 * lista o en el lienzo. Lo que queda fuera del orden está en un círculo —A
 * bebe de B y B de A— y se devuelve aparte para poder decirlo en vez de
 * colgarse dando vueltas.
 */
export function ordenDe(pasos: Paso[]): { orden: Paso[]; enCirculo: string[] } {
  const porId = new Map(pasos.map((p) => [p.id, p]));
  const pendientes = new Map(
    pasos.map((p) => [p.id, dependenciasDe(p).filter((d) => porId.has(d))]),
  );
  const orden: Paso[] = [];
  let hubo = true;
  while (hubo) {
    hubo = false;
    for (const [id, deps] of pendientes) {
      if (deps.some((d) => pendientes.has(d))) continue;
      orden.push(porId.get(id)!);
      pendientes.delete(id);
      hubo = true;
    }
  }
  return { orden, enCirculo: [...pendientes.keys()] };
}

/**
 * Corre el flujo entero, en orden de dependencias.
 *
 * Un paso cuyo origen fallo no se intenta: se marca «sin correr», porque no
 * es que este mal, es que nunca le llego nada. Y lo que no dependa de la rama
 * rota sigue corriendo, que es la ventaja de ordenar por dependencias y no
 * por posicion.
 *
 * No toca la mesa: devuelve las capas y quien llama decide cuáles guarda. Un
 * flujo de cinco pasos deja cinco capas intermedias, y meterlas todas en la
 * mesa cada vez que se corre la llenaría de resultados que nadie pidió.
 */
export function correrFlujo(
  pasos: Paso[],
  capas: Capa[],
): { marchas: Marcha[]; hechos: Map<string, Capa> } {
  const { orden, enCirculo } = ordenDe(pasos);
  const marchas: Marcha[] = [];
  const hechos = new Map<string, Capa>();
  const rotos = new Set<string>();

  for (const id of enCirculo) {
    marchas.push({
      paso: id,
      estado: "mal",
      /*
       * El mismo texto para los del círculo y para los que cuelgan de él.
       *
       * El reparto deja fuera del orden tanto a los que se muerden la cola
       * como a los que dependen de ellos, y distinguirlos costaría recorrer
       * el grafo otra vez para decir casi lo mismo. Lo que importa es que
       * ninguno puede correr, y por qué.
       */
      error:
        "No corre: está en un círculo o depende de uno. Un paso no puede acabar bebiendo de sí mismo.",
    });
    rotos.add(id);
  }

  for (const paso of orden) {
    const deps = dependenciasDe(paso);
    if (deps.some((d) => rotos.has(d))) {
      marchas.push({ paso: paso.id, estado: "sin correr" });
      rotos.add(paso.id);
      continue;
    }

    const falta = queFaltaEn(paso, pasos, capas);
    if (falta) {
      marchas.push({ paso: paso.id, estado: "mal", error: falta });
      rotos.add(paso.id);
      continue;
    }

    const h = herramientaDe(paso.herramienta)!;
    const entrada = entradaDe(paso, capas, hechos);
    if (!entrada) {
      marchas.push({
        paso: paso.id,
        estado: "mal",
        error: "El paso del que toma la capa no dejó resultado.",
      });
      rotos.add(paso.id);
      continue;
    }
    if (!h.acepta.includes(entrada.forma)) {
      marchas.push({
        paso: paso.id,
        estado: "mal",
        error: `Le llega una capa de ${entrada.forma === "punto" ? "puntos" : entrada.forma === "linea" ? "líneas" : "áreas"} y «${h.nombre}» no las acepta.`,
      });
      rotos.add(paso.id);
      continue;
    }

    /*
     * Las capas de la mesa MÁS las que ha ido dejando el flujo.
     *
     * Hay parámetros que piden otra capa —las zonas de un conteo, el molde de
     * un recorte— y tienen que poder apuntar a un paso anterior igual que la
     * entrada. Sin esto, encadenar solo valdría para la capa principal y el
     * resto habría que elegirlo a mano cada vez.
     */
    const aMano = [...hechos.values(), ...capas];
    const valores = { ...paso.valores };
    for (const [clave, v] of Object.entries(valores)) {
      if (esRefPaso(v)) {
        const c = hechos.get(refAPaso(v));
        if (c) valores[clave] = c.id;
      }
    }

    const salida = h.correr({ capa: entrada, valores, capas: aMano });
    if ("error" in salida) {
      marchas.push({ paso: paso.id, estado: "mal", error: salida.error });
      rotos.add(paso.id);
      continue;
    }

    hechos.set(paso.id, salida.capa);
    marchas.push({
      paso: paso.id,
      estado: "bien",
      capa: salida.capa,
      aviso: salida.aviso,
    });
  }

  return { marchas, hechos };
}
