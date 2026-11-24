# CHASKI

> **Prototipo.** Se publica para probarlo y opinar, no para sacar de aquí una
> cifra oficial sin revisarla. Va en su propio sitio y no toca el
> [visor de territorio](https://alvarocmoya22-art.github.io/gadmr-visor-territorio/),
> que sigue donde estaba.

**<https://alvarocmoya22-art.github.io/gadmr-chaski/>**

Analizador de capas del GADM Riobamba. Se le sueltan capas propias, se les
corre análisis espacial encima y cada resultado vuelve a ser una capa. Todo
dentro del navegador.

El nombre es el chaski, el mensajero que recorría los caminos del
Tahuantinsuyo llevando información de un tambo al siguiente.

## Qué resuelve

El [visor de territorio](../gadmr-visor-territorio) responde preguntas que ya
estaban planteadas: sus capas se preparan con scripts de Python que alguien
corre desde su máquina, y para añadir una pregunta nueva hay que tocar el
código y volver a publicar. Eso está bien para un tablero que se consulta, y
mal para el día en que llega un archivo nuevo y hay que mirarlo.

CHASKI es la otra mitad, y es la idea que se toma de
[GOAT](https://github.com/plan4better/goat): una caja de herramientas con la
que se arma el proceso, en vez de un análisis fijo al que hay que llevarle los
datos ya preparados.

## Tres puertas a lo mismo

Un solo mapa y una sola lista de capas debajo de las tres. Cambiar de modo no
pierde nada de lo que haya en pantalla.

**Mirar.** El territorio de casa: se elige el urbano, una plataforma o un
barrio y se ve qué hay dentro —superficie medida, habitantes del Censo 2022,
densidad, viviendas, equipamientos y cuántos hay por cada mil habitantes—.
Aquí no se ve ni una herramienta, y es a propósito: quien entra a mirar su
ciudad no debería tropezarse con la palabra «Getis-Ord».

**Analizar.** Suelta lo tuyo y crúzalo con lo de casa. Las preguntas primero,
la caja entera para quien la quiera.

**Contar.** El diagnóstico escrito y la lámina para imprimir.

Lo que de verdad las une no es la barra de arriba: es que **la lista de capas
es una sola**. Lo del municipio y lo tuyo conviven sin jerarquía, y el
resultado de una herramienta es una capa más.

### El modo Preguntas

Se elige una pregunta en lenguaje normal —«¿cuántos hay en cada zona?»— y se
completa una frase con huecos: *Contar los registros de ___ que caen en cada
___*. La frase es la interfaz: quien la rellena está leyendo lo que va a pasar
mientras lo elige.

Esto es lo que GOAT no tiene. Su caja está escrita para quien ya sabe SIG: hay
que saber que lo que uno quiere se llama *Aggregate Points* y que los barrios
van en el hueco de las zonas y no al revés.

Las doce preguntas de hoy: cuántos hay en cada zona · qué tan lejos queda lo
que la gente necesita · qué sectores quedan desatendidos · dónde se amontonan ·
qué área cubre un radio · cuánta superficie hay en cada zona · cuántos
kilómetros de vía hay en cada zona · cuánto hay de cada clase · cómo avanzó mes
a mes · cómo reparto esto en sectores de trabajo · qué parte de esta capa cae
dentro de aquella · de qué zona es cada registro.

## Probarlo sin buscar un archivo

El botón **«Probar con el ejemplo de Riobamba»** carga cuatro capas reales:
1.083 equipamientos, las 18 plataformas, 212 barrios y 644,5 km de vialidad.
Son las mismas que publica el visor, así que no se publica nada que no
estuviera ya publicado; lo de OpenStreetMap va citado. Están en
[`public/ejemplo/`](public/ejemplo/LEEME.md).

El catastro, que trae el nombre del propietario, no está ahí ni lo estará.

## Cómo funciona

Dos reglas, y de ellas cuelga todo lo demás:

**1. Cada herramienta declara qué geometría acepta.** Al elegir una capa solo
se ofrecen las herramientas que tienen sentido para ella. Con la red vial no
se ofrece superficie por clase; se ofrecen kilómetros por zona.

**2. El resultado es una capa.** No un dibujo que se pinta y muere: una capa
como cualquier otra, que entra en la lista, se exporta, se vuelve a analizar y
sirve de zona o de ámbito de la siguiente herramienta. Ahí está el
encadenamiento, sin necesidad de un lienzo de cajas unidas por flechas.

Añadir una herramienta es añadir una entrada a `HERRAMIENTAS` en
[`src/lib/herramientas.ts`](src/lib/herramientas.ts): declara su geometría y
sus controles, y ni el panel ni el mapa se tocan.

## Qué hay hoy

**Lee** GeoJSON, shapefile comprimido en `.zip` y CSV con columnas de
coordenadas. El CSV reconoce el separador (coma, punto y coma o tabulador) y
las coordenadas en UTM 17S, que reproyecta avisando de cuántas filas convirtió.

**Describe** cada capa: cuántos registros, de qué forma y qué campos trae, con
cuántos valores distintos tiene cada uno.

**Veinticuatro herramientas**, repartidas en los cuatro grupos de GOAT. La columna
«acepta» es lo que decide si una herramienta aparece o no al elegir una capa.

### Accesibilidad

**Una rutea y las demás miden en línea recta**, y conviene saber cuál es cuál.
Las isócronas recorren la red de calles con un Dijkstra y cobran la cuesta con
la función de Tobler. Las otras cuatro miden sobre el elipsoide, que siempre
sale optimista: en una trama cortada por el río o la quebrada, 400 m en recta
son 700 caminando. Cada resultado lo dice en su ficha.

No es pereza. Una isócrona recorre el grafo desde **un** origen; la gravedad y
el 2SFCA necesitan la distancia de cada zona a cada equipamiento —cientos de
miles de pares— y eso no se rutea en el navegador. Medirlas por la calle es el
paso siguiente y cambia solo la función de distancia, no el indicador.

| Herramienta | Acepta | Qué devuelve |
|---|---|---|
| Isócronas a pie | cualquiera | Hasta dónde se llega andando en N minutos, **por la calle y con la cuesta** |
| Distancia al más cercano | cualquiera | Cada registro con la distancia a lo más próximo de otra capa |
| Mapa de cercanía | cualquiera | Una rejilla que pinta a qué distancia queda lo más próximo |
| Mapa de gravedad | cualquiera | Una rejilla que suma **todas** las oportunidades del entorno, pesadas por distancia |
| Oferta por habitante (2SFCA) | cualquiera | Las zonas con la capacidad que les toca, repartida entre quienes se la disputan |
| Conectividad de la trama | cualquiera | Cuánta calle y cuánto suelo alcanza cada punto andando N minutos, **por la red** |
| Reparto de la demanda (Huff) | cualquiera | Cuánta gente capta cada equipamiento cuando varios compiten por la misma población |

Las dos últimas contestan lo que «distancia al más cercano» no sabe. La
**gravedad** distingue un barrio con seis escuelas a 600 m de otro con una sola
a 500: el primero está mejor servido y la distancia al más cercano los pinta al
revés. El peso cae por media distancia —a 400 m una oportunidad vale la mitad,
al doble la cuarta parte— porque «a 400 m vale la mitad» se puede defender ante
una comisión y «beta = 0,0017» no.

El **2SFCA** añade lo que ninguna de las otras mira: **cuánta gente se lo
reparte**. Un centro de salud a 300 m del que dependen veinte mil personas no
es accesibilidad, es una cola. Primero cada equipamiento divide su capacidad
entre todos los habitantes que lo alcanzan; después cada zona suma lo que le
toca de cada uno. El resultado va por mil habitantes, que es como la norma
escribe estos ratios.

Corrido sobre los 98 equipamientos de salud del inventario contra los 212
barrios con el Censo 2022, a 800 m: **35 barrios sin ninguno al alcance y
21.062 habitantes de 172.885 sin cobertura**, con una mediana de 0,374
equipamientos por mil habitantes.

La **conectividad** es la única de las cinco que rutea, y es la única que
puede: mide la TRAMA. Desde cada punto recorre la red N minutos y contesta
cuántos kilómetros de calle alcanza y cuánto suelo queda a menos de 120 m de
alguna de ellas. Dos esquinas a cien metros una de otra pueden alcanzar el
doble o la mitad según cómo esté cosido el barrio, y eso ninguna medida en
línea recta lo ve. El área se cuenta sobre una rejilla de 20 m y no con una
fórmula: multiplicar los metros de calle por el ancho alcanzable daría de más,
porque en una trama cerrada las franjas de calles paralelas se solapan casi
del todo.

Cuenta también **el trozo de calle que da tiempo a recorrer**, no solo las
aristas alcanzadas enteras. Con una capa de tramos largos y dos minutos de
presupuesto no se completa ninguno, y la primera versión contestaba cero
kilómetros: falso, porque se andan ciento cincuenta metros por cada brazo.

El **Huff** contesta la otra mitad de la pregunta del 2SFCA: no cuánta oferta
le toca a cada zona, sino **cuánta gente le toca a cada equipamiento**. Y no
se la asigna entera al más cercano —la gente tampoco lo hace—: la reparte
según lo grande y lo cerca que esté cada uno. Con el exponente en 2, uno que
esté al doble de lejos atrae la cuarta parte.

Sobre los 196 equipamientos de educación contra los mismos barrios: **mediana
de 753 habitantes por equipamiento y 2.836 el más cargado**. La suma de lo
repartido da 172.887 frente a los 172.885 del censo, dos de diferencia por
redondear cada equipamiento a entero.

### Geoproceso

| Herramienta | Acepta | Qué devuelve |
|---|---|---|
| Centroide | líneas, polígonos | Un punto por registro |
| Zona de influencia | cualquiera | El área a menos de x metros, suelta o fundida |
| Recortar | cualquiera | Lo que cae dentro de otra capa, partiendo las piezas |
| Borrar | cualquiera | Lo que cae fuera |
| Intersecar | polígonos | El solape, con los campos de las dos capas |
| Combinar áreas | polígonos | El solape partido en tres: lo de una, lo de otra y lo común |
| Disolver | polígonos | Las piezas con el mismo valor fundidas en una |

### Geoanálisis

| Herramienta | Acepta | Qué devuelve |
|---|---|---|
| Avance en el tiempo | cualquiera | Cómo cambió mes a mes lo que trae una columna de fecha |
| Población alcanzada | polígonos | Cuánta gente cae dentro de una zona, repartida por densidad |
| Agregar puntos | cualquiera | Las zonas con cuántos, suma, media, mínimo, máximo o desviación |
| Agregar polígonos | polígonos | Las zonas con la superficie y el porcentaje que ocupa la capa |
| Kilómetros por zona | líneas | Las zonas con km y km/km² |
| Superficie por clase | polígonos | Las piezas con su área, y el reparto por clase |
| Puntos calientes (Gi\*) | cualquiera | Las manchas de concentración con su nivel de confianza |
| Agrupamiento espacial | cualquiera | Los registros repartidos en grupos compactos |

### Datos

| Herramienta | Acepta | Qué devuelve |
|---|---|---|
| Unir campos | cualquiera | La capa con los campos de otra, por valor o por ubicación |
| Combinar capas | cualquiera | Las dos capas en una, anotando de cuál viene cada registro |

**Exporta** cualquier capa a GeoJSON, con el nombre, el origen y el método
escritos dentro del archivo.

**Enseña con qué calculó**: los registros que entraron se dibujan encima del
resultado y el ámbito se dibuja punteado.

Nada se sube a ningún servidor: los archivos se leen en el navegador y se
quedan ahí.

## El informe y la lámina

Las dos primeras pestañas responden una pregunta cada vez. La tercera responde
la que de verdad llega de las direcciones —«¿cómo quedó el territorio después
de la campaña?»— corriendo media docena de análisis seguidos:

| Bloque | Qué dice |
|---|---|
| Qué se hizo | Registros, superficie del ámbito, densidad |
| Reparto por categoría | Cuántos de cada tipo, si se eligió un campo |
| Cómo se repartió | Zonas con y sin registros, media, mediana y **Gini** del reparto |
| Qué forma tiene el patrón | **Índice R de Clark-Evans** con su z: agrupado, al azar o disperso |
| Dónde está el centro | Centro de gravedad y distancia típica |
| Territorio cubierto | Qué parte del ámbito queda a menos de x metros |
| Las cinco con más · las que están en cero | El listado para la mesa de trabajo |

Cada bloque viene con la frase que lo interpreta, porque una tabla de
estadísticos sin lectura no la defiende nadie.

**La lámina** pone el mapa tal como se está viendo, su escala, el norte, la
leyenda y todas las cifras en una hoja A4 apaisada, y la manda a imprimir. Desde
el diálogo del navegador se guarda como PDF, que es lo que se adjunta a un
oficio. La hoja lleva sus colores escritos a mano: sale en blanco aunque quien
la imprima tenga el modo oscuro.

Si la ventana está minimizada o detrás de otra, el navegador deja de dibujar el
mapa y la foto sale vacía. La lámina lo detecta, lo dice y se imprime igual con
las cifras, en vez de dejar un recuadro blanco que nadie nota hasta tenerlo en
papel.

### Para una campaña de Ambiente

[`public/ejemplo/plantilla_campania.csv`](public/ejemplo/plantilla_campania.csv)
trae las columnas que se reconocen: fecha, campaña, especie, sexo, edad, barrio
y las coordenadas. Solo las coordenadas son obligatorias, y si vienen en UTM 17S
se reproyectan solas.

## Las capas del municipio

El visor de territorio ya tiene preparadas y publicadas las capas de casa, así
que CHASKI las lee de ahí **en vivo**: no se copia un archivo ni pesa un mega en
este repositorio, y cuando el visor actualice una capa, aquí entra la nueva. Su
sitio responde con `Access-Control-Allow-Origin: *`, de modo que se leen desde
otro origen sin intermediario.

| Capa | Qué trae | Peso |
|---|---|---|
| Plataformas | 18 plataformas del casco urbano | 37 KB |
| Barrios | 212 barrios urbanos | 124 KB |
| Parroquias | 5 parroquias urbanas | 20 KB |
| Equipamientos | 1.083 equipamientos con tipo y estado | 430 KB |
| Proyectos 2026 | 41 proyectos con monto, estado y tipología | 21 KB |
| Vialidad | 17.636 tramos, 1.931 km | 2 MB |
| Polígonos de intervención · PUGS | 170 PIT urbanos con su normativa completa | 625 KB |
| Edificación del cantón | 166.530 edificaciones, altura estimada y parroquia | 12,7 MB |
| Catastro | 41.681 predios con clave y superficie | 15 MB |

La vialidad llega como el grafo que el visor usa para las isócronas y se
convierte a líneas al entrar. El catastro trae clave catastral y superficie;
**el nombre del propietario no sale del visor ni entra aquí**.

La edificación son las 166.530 que el visor extruye, con la altura **estimada
por un modelo sobre imágenes de 10 m, con un error típico de metro y medio a
dos**: sirve para análisis por zonas y para priorizar inspecciones, no para
certificar los pisos de un predio. Es de Google Open Buildings 2023, CC BY 4.0,
y llega como shapefile comprimido —el lector lo abre por la extensión, igual
que si se soltara desde el escritorio—. En el visor esa misma capa va en
teselas, que se recortan por cuadro y por eso sirven para pintarla y no para
contarla; aquí vienen los objetos enteros.

Los **polígonos de intervención** son el cuerpo del PUGS: para cada trozo de
suelo urbano, qué tratamiento le toca, qué lote mínimo, cuántos pisos, cuánto
COS, qué retiros y qué usos. Trece de sus campos son numéricos, así que se
filtran y se cruzan como cualquier otra capa. Traen una columna de aviso,
`texto_cortado`: el origen es un shapefile y ahí un campo de texto no pasa de
254 bytes, de modo que **156 de los 170 llegan con alguna lista de usos
cortada** —140 el uso prohibido—. Lo que acaba en «…» sigue en la ordenanza y
no en el archivo.

**Es la única de edificación, a propósito.** Estuvo al lado la de
OpenStreetMap, 6.039 huellas urbanas con la altura declarada, y dos capas que
se llaman casi igual y dan cifras distintas sobre la misma manzana convierten
«¿cuántas edificaciones hay?» en una pregunta con dos respuestas. El archivo
sigue publicado en el visor para quien lo quiera soltar a mano.

Esto es la forma barata de unir las dos mitades: el visor pone los datos de
casa y CHASKI pone las herramientas, sin fusionar los dos programas ni tocar
lo que ya funciona.

Las cuatro capas de `public/ejemplo/` se quedan como copia local a propósito:
probar la aplicación no debería depender de que otro sitio esté arriba.

## La mesa de trabajo

Lo que hay cargado se guarda solo, un segundo y medio después del último
cambio, y al volver se ofrece recuperarlo. No se restaura sin preguntar:
encontrarse quince capas que uno no acaba de cargar desconcierta más de lo que
ayuda.

Se guarda en IndexedDB, dentro del navegador de quien lo use. No viaja a ningún
sitio, igual que el resto.

**Lo del catálogo no se guarda entero.** Una capa que vino del visor o del
ejemplo se apunta por su nombre de archivo y se vuelve a traer al recuperar: el
catastro son quince megas que ya están publicados. Lo que sí se guarda entero
es lo que no se puede volver a pedir —los archivos que alguien soltó y los
resultados que calculó—, así que una mesa con cuatro capas del municipio, un
CSV propio y un conteo por barrio ocupa unos 150 KB.

La mesa recuerda también en qué modo se estaba trabajando. Hoy eso son las tres
pestañas del panel; cuando la aplicación se una con el visor en los tres modos
—mirar, analizar y contar— es ese mismo campo el que los recuerda, y por eso se
guarda como texto libre y no como una lista cerrada que habría que migrar
después.

## Capas desde una base de datos

Un navegador no puede hablar con PostgreSQL: Postgres tiene su propio protocolo
sobre TCP y el navegador solo sabe HTTP. Entre la base y CHASKI hace falta algo
que publique las tablas por HTTP, y lo que encaja es un servicio **OGC API
Features** —[`pg_featureserv`](https://github.com/CrunchyData/pg_featureserv)
es un solo ejecutable de solo lectura que lo hace— porque devuelve GeoJSON, que
es lo que esta aplicación ya sabe leer.

Las conexiones se guardan con nombre y se eligen de una lista, como las de
QGIS: nombre, anfitrión y puerto. Lo que esa ficha no tiene es usuario ni
contraseña, y la propia pantalla dice por qué —la credencial de la base vive en
el servicio, no en el navegador—. Se eligen las tablas y se traen las que hagan
falta. A partir de ahí son capas como cualquier otra. La base nunca queda
expuesta al navegador: solo se ve lo que alguien haya decidido publicar, y solo
para leer.

**La versión publicada en internet no podrá ver una base interna.** Una página
servida por `https` no puede llamar a un `http://` de la red local: el navegador
lo bloquea. Eso no es un estorbo, es la garantía de que los datos
institucionales no salen a internet por este camino. Para leer la base, CHASKI
se abre dentro de la red del municipio.

Comprobado contra un servicio OGC API Features real y público: se listan sus 17
tablas, una colección de 25 polígonos llega entera, y otra que el servicio
entrega de diez en diez se trae completa siguiendo 188 páginas —1.872 registros,
el número exacto que tiene—. Los dos fallos frecuentes se explican en lenguaje
de persona: el servicio apagado o fuera de la red, y la página segura llamando
a un servicio inseguro.

## Lo que no está, y por qué

GOAT tiene hoy 24 herramientas en los cuatro grupos. **Geoproceso y datos están
igualados, 7 de 7 y 2 de 2.** En geoanálisis van 3 de 5, y en accesibilidad,
que es su especialidad, 7 de 9.

| De GOAT | Qué haría falta |
|---|---|
| Travel Cost Matrix | «Distancia al más cercano» es media pieza; falta la matriz completa de pares |
| ÖV-Güteklassen · Trip Count | GTFS del transporte público, que Riobamba no publica. No es trabajo, es un dato que no existe |
| Geocoding | GOAT usa Pelias, un servicio externo. Mandaría las direcciones fuera del navegador, que es justo lo que este desarrollo evita. Con el índice de calles que ya prepara el visor se puede hacer aquí dentro |
| Origin Destination | Una tabla de pares origen-destino que todavía no se puede cargar como tal |

Y cinco que GOAT no trae y CHASKI sí: **puntos calientes de Getis-Ord**,
**población alcanzada**, **avance en el tiempo**, **kilómetros por zona** y
**superficie por clase**. Las tres primeras vienen del visor de territorio.

### Y dos cosas que no se pueden copiar de GOAT

**Su código es GPL-3.0.** Tomar sus ideas —la caja repartida en cuatro grupos,
qué herramientas tiene cada uno— es libre y es lo que se ha hecho desde el
principio. Copiar su código obligaría a que CHASKI fuera GPL-3.0 también, y eso
es una decisión del municipio, no del programador.

**Y GOAT es un servidor, no una página.** Next.js, FastAPI, PostgreSQL con
PostGIS, Keycloak, Redis, almacenamiento S3 y un motor de trabajos. CHASKI es
un sitio estático donde nada sale del navegador; igualarlo «tal cual» sería
cambiar eso por una infraestructura que hoy no hay. Lo que sí se puede igualar,
y es lo que se persigue, es **qué preguntas sabe contestar**.

## Lo que falta

- **Apuntar a la base del GADM.** El lado de CHASKI está hecho y probado; falta
  levantar el servicio sobre el Postgres institucional y decidir qué tablas se
  publican.
- **Guardar el filtro como una capa nueva.** El filtro ya vive EN la capa —por
  lista de valores, por tramo numérico o escribiendo una expresión como la de
  QGIS— y viaja con ella a todas las herramientas y al mapa. Lo que falta es el
  botón de GOAT: dejar el recorte como una capa aparte, para poder comparar la
  filtrada con la entera en la misma mesa.
- **Mesas con nombre.** Hoy hay una sola mesa, la de la última vez. Poder
  guardar varias con su nombre es el paso siguiente.

## Correrlo

```bash
npm install
npm run dev
```

Queda en <http://localhost:5184/gadmr-chaski/>. El puerto es fijo a propósito: el
visor de territorio usa el 5183 y no conviene que se pisen.

## Decisiones que conviene conocer

- **Se mide sobre el elipsoide, no sobre una esfera.** A dos grados del
  ecuador, la esfera de radio medio se come un 0,45 % en las superficies y un
  0,22 % en las longitudes, siempre en la misma dirección. Sobre las 99.782 ha
  del cantón eso serían 450 ha de más. Las superficies usan latitud autálica y
  las distancias los radios de curvatura locales; las dos están comprobadas
  contra `pyproj` y coinciden hasta la cuarta cifra decimal del porcentaje.
- **Lo calculado no pisa lo que traía la capa.** Si una capa de barrios ya
  tenía su `area_ha`, el valor medido manda —es el que explica la densidad que
  aparece al lado— pero el de origen se guarda como `area_ha_origen`. Cuando
  las dos cifras no cuadran, eso es justo lo que hay que poder mirar.
- **El orden del mapa es el de la geometría, no el de la lista**: primero los
  rellenos, luego las líneas y al final los puntos. Si no, el resultado de la
  última herramienta taparía los registros que lo explican.
- **El ámbito importa.** Sin una capa de límites cargada, el ámbito del Gi\* es
  el recuadro de los propios registros con medio kilómetro de margen. Eso mete
  en el cálculo esquinas donde no hay ciudad y el resultado sale algo más
  caliente de lo que saldría contra un límite de verdad. El panel lo avisa; la
  respuesta es cargar el polígono del área y elegirlo.
- **Las celdas vacías cuentan.** La media y la desviación con las que Gi\*
  compara salen de todas las celdas del ámbito, también de las que no tienen ni
  un registro. Si solo se contaran las celdas con datos, todo saldría caliente.
- **MapLibre 5, no 6.** La 6 sirve su *worker* como un archivo aparte que hay
  que servir junto al paquete, y con Vite eso se rompe en desarrollo. La 5 lo
  trae dentro, es la que corre el visor y no hay motivo para abrir ese frente.
