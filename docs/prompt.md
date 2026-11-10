# El encargo, en un prompt

> Esto se pega al empezar una sesión, con cualquier asistente. No es
> documentación: es el estándar contra el que se mide cada cambio. `README.md`
> dice qué hay; [`vision.md`](vision.md) dice a qué aspira; esto dice **cómo se
> trabaja para que cada cambio suba el nivel y no solo añada cosas**.

---

## Quién pide y cómo trabaja

Álvaro Carrera, GADM Riobamba. Planificación de territorio, no desarrollo de
software. Usa **PowerShell 5.1** en Windows 11: `&&` es un error de sintaxis;
los comandos van de uno en uno o separados por `;`. Habla español de Ecuador.

Tres cosas que no se negocian en la forma de trabajar:

1. **Evidencia antes que promesas.** No se dice «ya funciona»: se enseña la
   cifra y contra qué se comprobó. Si no se comprobó, se dice que no se
   comprobó.
2. **No se hace commit ni se publica sin permiso.** Ni uno. Se deja el trabajo
   listo y se pregunta.
3. **Nada de valores metidos a mano** donde debería haber un cálculo. Un número
   escrito en el código es una afirmación que nadie va a volver a revisar.

Y una de fondo: cuando algo no se puede hacer, **se dice que no se puede y por
qué**, con el archivo y la línea delante. No se rodea con una aproximación que
parezca una respuesta.

---

## Qué es CHASKI (y qué no)

> **Un SIG de escritorio, pero en el navegador, para decidir sobre el
> territorio.** No es un visor. Quien lo abre no viene a ver información: viene
> a preparar la que tiene, cruzarla y sacar una cifra que se pueda defender en
> una mesa de trabajo.

Tres etapas, que son las tres de cualquier SIG:

| Etapa | Qué se hace | Dónde vive |
|---|---|---|
| **Preparar** | Traer capas, filtrarlas, acotarlas a una zona | `PanelCapas`, `filtro.ts`, `zona.ts` |
| **Analizar** | Cruzar y medir lo preparado | `herramientas/`, `PanelGuiado`, `flujo.ts` |
| **Contar** | El informe escrito y la lámina A4 | `PanelInforme`, `Lamina.tsx` |

**No se añade una cuarta etapa.** Tres, y que las tres estén bien.

El nombre es el chaski, el mensajero que llevaba información de un tambo al
siguiente por los caminos del Tahuantinsuyo.

---

## Las dos reglas de las que cuelga todo

1. **Cada herramienta declara qué geometría acepta.** Al elegir una capa solo
   se ofrecen las herramientas que tienen sentido para ella. Con la red vial no
   se ofrece superficie por clase: se ofrecen kilómetros por zona.
2. **El resultado es una capa**, igual que una cargada de un archivo. Entra en
   la lista, se exporta, se vuelve a analizar y sirve de zona de la siguiente.

Corolario práctico: **añadir una herramienta es añadir una entrada** a su
archivo en `src/lib/herramientas/`. Declara su geometría y sus controles, y ni
el panel ni el mapa se tocan. Si para añadir algo hay que tocar `Mapa.tsx` o
`App.tsx`, casi siempre es señal de que está mal planteado.

---

## Lo que no se negocia en el producto

- **El nombre del propietario no sale del catastro.** Clave, superficie, tipo y
  estado sí; nombre y número de trámite, nunca. El repositorio es público.
- **La capa de sectores del INEC no se copia ni se publica.** Sus condiciones
  de uso son de copyright. Se lee de `C:/Users/alvar/Downloads/` y lo que sale
  de ahí es un derivado agregado.
- **Lo de OpenStreetMap es ODbL** y va citado donde se use.
- **Se mide sobre el elipsoide WGS84**: latitud autálica para superficies,
  radios de curvatura locales para distancias. La esfera de radio medio se
  desvía 0,45 % en superficie y 0,22 % en longitud a esta latitud, **siempre en
  la misma dirección**: no se cancela.
- **Nada viaja a un servidor.** Los archivos se leen en el navegador y se
  quedan ahí. Para información municipal sin publicar esa es la única respuesta
  aceptable, y es también la razón de que las sugerencias de `sugerencias.ts`
  **no tengan ningún modelo de lenguaje detrás**: mandar las columnas del
  catastro al servidor de otro no es una opción.
- **Lo que no tiene dato se queda vacío, no en cero.** Un cero afirma «aquí no
  vive nadie»; lo que pasa de verdad es que el censo no lo cubre.
- **Ninguna cifra se publica sin contrastarla** contra geopandas o pyproj. Así
  salieron los dos errores que el visor arrastraba: la plataforma K declaraba
  158,148 ha y mide 145,72, y la red sumaba 1.934,9 km y son 1.931,0.

---

## Subir el nivel: los seis filtros

Un cambio sube el nivel cuando pasa los seis. Si falla uno, se dice cuál y se
deja de insistir.

**1 · Responde una pregunta que llega de verdad a una dirección municipal.**
No «sería interesante tener». La prueba es poder escribir la pregunta en
español, tal como la haría un director: *«¿a cuánta gente alcanza esto?»*,
*«¿qué parte del barrio quedó sin cobertura?»*. Si la pregunta no se puede
escribir así, la herramienta no está lista para entrar en `recetas.ts`.

**2 · Está comprobado contra algo independiente.** geopandas, pyproj, QGIS o un
cálculo a mano sobre un caso pequeño. En el mensaje del commit va la tabla de
las dos columnas y la diferencia. *Ejemplo real: «Población alcanzada» da
179.033 frente a 179.091 de geopandas, 0,03 %, y la diferencia es cómo cada uno
segmenta el círculo del radio.*

**3 · Dice cuándo no hay que creerle.** La línea recta siempre sale optimista.
El ámbito deducido infla la superficie. Repartir población por área supone a la
gente esparcida por igual, razonable en una manzana y cada vez menos según la
pieza crece. **Una herramienta que avisa de su límite vale más que una que
responde siempre con aplomo**, y el aviso va donde se lee: en la ficha del
resultado, no en un comentario del código.

**4 · No añade una pantalla donde cabía una capa.** La lista de capas es una
sola, lo del municipio y lo propio sin jerarquía. Antes de abrir una vista
nueva hay que haber descartado que el resultado pueda ser simplemente una capa
más.

**5 · Quita más de lo que pone, cuando se puede.** El refactor que convirtió
Mirar en Preparar borró 470 líneas de `PanelMirar.tsx`, dejó `zona.ts` en 705
de 1.268 y `App.tsx` en 1.264 de 1.518, sin perder una función que alguien
usara. `noUnusedLocals` y `noUnusedParameters` están **encendidos** en
`tsconfig.app.json` a propósito: el compilador va señalando qué quedó huérfano.

**6 · Está escrito para quien lo lea en un año.** Los comentarios explican **por
qué**, no qué. El archivo abre con un bloque que cuenta el problema que resuelve
y la decisión que se tomó. Los nombres van en español —`zona`, `recorteDe`,
`preparadas`— porque quien va a mantener esto piensa en español.

---

## Cómo se contesta

- **Leer antes de escribir.** El archivo entero que se va a tocar, no la línea.
  Mucho de lo que parece faltar ya está resuelto con otro nombre.
- **Proponer antes de codificar** cuando el cambio toca más de un archivo, y
  esperar. Nada de entregar tres pantallas nuevas que nadie pidió.
- **Un commit, una idea.** Asunto en una línea, cuerpo que cuenta el problema,
  la decisión, el porqué y la comprobación. **Todo el mensaje en ASCII, sin
  tildes** —así está el historial entero—; las comillas « » sí. En el código y
  en la interfaz, en cambio, **las tildes van siempre**: un rótulo que diga
  «Poblacion» es un error.
- **Comprobarlo en el navegador**, no solo compilarlo. `npm run dev` queda en
  <http://localhost:5184/gadmr-chaski/>. El puerto es fijo: el visor de
  territorio usa el 5183.
- **Si la página publicada no muestra el cambio**, casi nunca es el despliegue:
  es el navegador sirviendo un `index.html` en caché que apunta al paquete
  viejo. `Ctrl+Shift+R`.

---

## El mapa del código

```
src/
  App.tsx                 La mesa: capas, modo, zona, filtros. 1.264 líneas.
  components/
    Mapa.tsx              MapLibre. Ordena por geometría, no por lista.
    PanelCapas.tsx        Preparar: catálogo, archivos, filtro, estilo
    PanelGuiado.tsx       Las 12 preguntas en lenguaje normal
    PanelFlujo.tsx        Flujos: pasos encadenados
    Constructor.tsx       El mismo flujo en un lienzo (React Flow)
    PanelInforme.tsx      Contar: el diagnóstico
    Lamina.tsx            La hoja A4 apaisada, con sus colores a mano
  lib/
    herramientas/         LAS 20 HERRAMIENTAS, en los 4 grupos de GOAT
      tipos.ts            El contrato: qué acepta, qué controles, qué devuelve
      accesibilidad.ts  geoproceso.ts  geoanalisis.ts  datos.ts
    cargar.ts             GeoJSON, shapefile .zip, CSV con UTM 17S
    municipio.ts          Las 11 capas del visor, leídas en vivo
    filtro.ts             { campo, valores[] } · SOLO valores sueltos
    zona.ts               Recorte a una zona, con rejilla. 705 líneas
    geoproceso.ts         polygon-clipping en el plano métrico local
    metrico.ts            El plano métrico local
    medidas.ts            Elipsoide, cortes por cuantil, rampas
    estadistica.ts        Gini, Clark-Evans, Getis-Ord
    red.ts                El grafo vial y Dijkstra
    recetas.ts            Las 12 preguntas
    sugerencias.ts        Qué ofrecer según lo cargado · SIN modelo detrás
    almacen.ts            La mesa en IndexedDB, autoguardada
    ogc.ts                OGC API Features, para PostGIS por HTTP
```

Stack: React 19 · Vite 8 · TypeScript · Tailwind · **MapLibre 5, no 6** (la 6
sirve su *worker* aparte y con Vite se rompe en desarrollo) · polygon-clipping ·
@xyflow/react.

---

## Lo que falta, por orden de lo que más cambia las cosas

1. **Comparadores numéricos en el filtro.** Hoy `Filtro` es
   `{ campo: string; valores: string[] }`: valores sueltos, **cero
   comparadores**. No hay manera de pedir «área ≥ 1.000 m²».
2. **Campos calculados.** Una columna nueva a partir de la geometría —área,
   perímetro, vértices— o de otras columnas —`equipamientos / habitantes *
   1000`—. Hace falta porque muchas capas no traen el área: las manzanas del
   INEC son `codigo, parroquia_cod, poblacion, viviendas, densidad_hab_km2`, y
   el INEC además advierte que esa cartografía **no tiene precisión métrica**.
   Con esto, «área ≥ 1.000 m²» son dos clics.
3. **Que aprenda de lo que se corre** y reordene las sugerencias por uso. Sin
   clave, sin internet, sin que una columna salga del navegador.
4. **Isócronas sobre la red vial** en lugar de línea recta. El visor ya tiene el
   Dijkstra resuelto; portarlo es lo que vuelve defendible la accesibilidad.
5. **Mesas con nombre.** Hoy hay una sola, la de la última vez.
6. **La base institucional.** El lado de CHASKI está hecho y probado contra un
   servicio OGC API Features real; falta levantar el servicio sobre el Postgres
   del GADM y decidir qué tablas se publican. Ojo: una página `https` no puede
   llamar a un `http://` de la red local, y eso **no es un estorbo, es la
   garantía** de que los datos institucionales no salen a internet por ahí.
7. **La caja de preguntas con modelo, al final.** El criterio está decidido:
   *el modelo propone el análisis, CHASKI hace las cuentas*. El modelo ve el
   catálogo —nombres de capa, geometría, número de registros, nombres de
   columna— y las herramientas; **nunca una fila**. Devuelve un flujo que
   CHASKI corre en local. Opcional, con clave propia, apagado por defecto.

---

## Cómo se sabe que está lograda

1. Un técnico que no la ha visto llega de la pantalla inicial a **una lámina
   imprimible en menos de tres minutos**, sin que nadie le explique nada.
2. Carga un **CSV de campaña** con coordenadas en UTM 17S y obtiene el reparto
   por barrio, la desigualdad y la cobertura **sin tocar un parámetro**.
3. Un resultado exportado y abierto en QGIS **un mes después** sigue diciendo
   con qué celda, contra qué ámbito y en qué fecha se calculó.
4. **Nunca** se ofrece una herramienta que no tenga sentido para esa geometría.
5. Toda cifra de una lámina **se reproduce** con geopandas o pyproj y coincide.
