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

## Dos puertas a lo mismo

**Preguntas.** Se elige una pregunta en lenguaje normal —«¿cuántos hay en cada
zona?»— y se completa una frase con huecos: *Contar los registros de ___ que
caen en cada ___*. La frase es la interfaz: quien la rellena está leyendo lo
que va a pasar mientras lo elige, así que no hace falta saber cuál es la capa
de entrada y cuál la de zonas.

Esto es lo que GOAT no tiene, y es la diferencia que importa para una
municipalidad. Su caja está escrita para quien ya sabe SIG: hay que saber que
lo que uno quiere se llama *Aggregate Points* y que los barrios van en el hueco
de las zonas y no al revés.

**Herramientas.** La caja entera, con la estructura de GOAT. Por debajo corre
exactamente lo mismo: una pregunta no es un análisis aparte, es la misma
herramienta con los huecos ya puestos en su sitio.

Las once preguntas de hoy: cuántos hay en cada zona · qué tan lejos queda lo
que la gente necesita · qué sectores quedan desatendidos · dónde se amontonan ·
qué área cubre un radio · cuánta superficie hay en cada zona · cuántos
kilómetros de vía hay en cada zona · cuánto hay de cada clase · cómo reparto
esto en sectores de trabajo · qué parte de esta capa cae dentro de aquella · de
qué zona es cada registro.

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

**Dieciséis herramientas**, repartidas en los cuatro grupos de GOAT. La columna
«acepta» es lo que decide si una herramienta aparece o no al elegir una capa.

### Accesibilidad

Se mide **en línea recta, no por la calle**. Es la diferencia honesta con GOAT,
que rutea sobre la red vial y el transporte público. La línea recta siempre sale
optimista, y cada resultado lo dice en su ficha.

| Herramienta | Acepta | Qué devuelve |
|---|---|---|
| Distancia al más cercano | cualquiera | Cada registro con la distancia a lo más próximo de otra capa |
| Mapa de cercanía | cualquiera | Una rejilla que pinta a qué distancia queda lo más próximo |

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
| Edificación | 6.039 huellas con su altura | 1,6 MB |
| Catastro | 41.681 predios con clave y superficie | 15 MB |

La vialidad llega como el grafo que el visor usa para las isócronas y se
convierte a líneas al entrar. El catastro trae clave catastral y superficie;
**el nombre del propietario no sale del visor ni entra aquí**.

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

## Lo que no está, y por qué

De las 23 herramientas de GOAT faltan siete, todas por la misma razón: piden
algo que hoy no hay.

| De GOAT | Qué haría falta |
|---|---|
| Catchment Area (isócronas) | La red vial de OSM y un Dijkstra. El visor ya los tiene resueltos |
| Heatmap Connectivity | Lo mismo: red vial |
| Heatmap Gravity · 2SFCA · Huff | Se pueden hacer en línea recta; faltan por tiempo, no por imposibilidad |
| ÖV-Güteklassen · Trip Count | GTFS del transporte público, que Riobamba no publica |
| Geocoding | Un servicio externo. Mandaría las direcciones fuera del navegador, que es justo lo que este desarrollo evita |
| Origin Destination | Una tabla de pares origen-destino que todavía no se puede cargar como tal |

Y una que GOAT no trae y CHASKI sí: **puntos calientes de Getis-Ord**, que viene
del visor de territorio.

## Lo que falta

- **PostGIS.** El siguiente paso es que estas mismas capas puedan venir de la
  base institucional en lugar de un archivo. Las herramientas no cambian;
  cambia de dónde salen los registros.
- **Filtrar una capa a una capa nueva.** Hoy el filtro por campo y valor actúa
  dentro de cada herramienta, pero no deja una capa filtrada que se pueda usar
  como destino de otra.
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
