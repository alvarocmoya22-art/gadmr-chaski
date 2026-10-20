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
 * ES UNA CADENA, NO UN LIENZO. Los pasos van en fila y cada uno puede tomar
 * como entrada el resultado de cualquier paso anterior; no hay ramas que se
 * junten después. Con las dieciséis herramientas de aquí, la cadena cubre lo
 * que se hace de verdad, y se entiende leyéndola de arriba abajo, que es
 * justo lo que un lienzo con flechas cruzadas deja de ofrecer.
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
  indice: number,
  pasos: Paso[],
  capas: Capa[],
): string | null {
  const h = herramientaDe(paso.herramienta);
  if (!h) return "Esa herramienta ya no existe.";

  if (paso.entrada === "") return "Falta decir qué capa entra.";

  if (esRefPaso(paso.entrada)) {
    const id = refAPaso(paso.entrada);
    const antes = pasos.slice(0, indice).some((p) => p.id === id);
    // Un paso solo puede beber de los que corren ANTES que él. Sin esto, mover
    // un paso hacia arriba dejaría la cadena apuntando hacia adelante y el
    // flujo fallaría a la mitad en vez de avisar al escribirlo.
    if (!antes)
      return "Toma el resultado de un paso que va después, o que ya no está.";
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
export function correrFlujo(
  pasos: Paso[],
  capas: Capa[],
): { marchas: Marcha[]; hechos: Map<string, Capa> } {
  const marchas: Marcha[] = [];
  const hechos = new Map<string, Capa>();
  let roto = false;

  for (let i = 0; i < pasos.length; i++) {
    const paso = pasos[i];
    if (roto) {
      marchas.push({ paso: paso.id, estado: "sin correr" });
      continue;
    }

    const falta = queFaltaEn(paso, i, pasos, capas);
    if (falta) {
      marchas.push({ paso: paso.id, estado: "mal", error: falta });
      roto = true;
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
      roto = true;
      continue;
    }
    if (!h.acepta.includes(entrada.forma)) {
      marchas.push({
        paso: paso.id,
        estado: "mal",
        error: `Le llega una capa de ${entrada.forma === "punto" ? "puntos" : entrada.forma === "linea" ? "líneas" : "áreas"} y «${h.nombre}» no las acepta.`,
      });
      roto = true;
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
      roto = true;
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
