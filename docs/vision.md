# CHASKI · el territorio que responde

> Esto es el encargo, no la documentación. Describe la aplicación que hay que
> construir uniendo el visor de territorio y CHASKI en una sola, y lo que tiene
> que cumplir para estar lograda. Lo que ya existe y está comprobado se marca
> como tal: no se vuelve a hacer ni se da por bueno sin comprobarlo.

## La idea de fondo

Hoy hay dos aplicaciones. Una **enseña** el territorio de Riobamba con capas que
alguien preparó. La otra **analiza** lo que cada quien traiga. Quien trabaja en
una dirección municipal necesita las dos a la vez, y no debería tener que saber
cuál abrir.

La aplicación que hay que construir es una sola, y la regla que la gobierna es
esta:

> **La interfaz se arma sola según lo que tiene delante.**

No es un formulario que siempre pide lo mismo. Es una pantalla que mira los
datos cargados y ofrece lo que esos datos permiten:

- Si entran **puntos con una columna de fecha**, aparece el eje temporal y la
  pregunta «¿cómo avanzó mes a mes?».
- Si entran **polígonos con un campo numérico**, aparece la coropleta y la
  pregunta «¿cuánto hay de cada clase?».
- Si entran **líneas**, desaparecen los puntos calientes y aparecen los
  kilómetros por zona.
- Si está cargada la **red vial**, la accesibilidad deja de medirse en línea
  recta y pasa a medirse por la calle, y el panel lo dice.
- Si **no hay** un límite cargado, la aplicación avisa de que el ámbito
  deducido infla la superficie y empuja el resultado, en vez de callárselo.

Lo que no se puede responder con lo que hay, no se ofrece. Lo que se ofrece,
se puede responder.

## Qué ya existe y hay que respetar

### Del visor de territorio

Comprobado y publicado en
<https://alvarocmoya22-art.github.io/gadmr-visor-territorio/>:

| Capa | Cuánto |
|---|---|
| Plataformas del casco urbano | 18 |
| Barrios urbanos | 212 |
| Parroquias urbanas | 5 |
| Equipamientos con tipo y estado | 1.083, en 12 tipos |
| Predios con clave y superficie | 41.681 |
| Huellas de edificio con altura | 6.039 |
| Red vial | 17.636 tramos · 1.931,0 km |
| Proyectos 2026 con monto y tipología | 41 |
| Población del Censo 2022 repartida por edificios | 172.885 habitantes |

Más: isócronas a pie sobre la red real con Dijkstra, cobertura por radio de la
ordenanza, densidad en hexágonos, edificación en 3D que se refresca sola desde
OpenStreetMap, y los registros levantados en campo con Every Door.

### De CHASKI

Comprobado y publicado en <https://alvarocmoya22-art.github.io/gadmr-chaski/>:

- Lee **GeoJSON, shapefile en `.zip` y CSV con coordenadas**, incluido UTM 17S
  con reproyección automática y aviso de cuántas filas convirtió.
- **16 herramientas** en las cuatro categorías de GOAT —accesibilidad,
  geoproceso, geoanálisis y datos— y cada resultado vuelve a ser una capa: se
  exporta, se reanaliza y entra en la siguiente herramienta.
- **11 preguntas** en lenguaje normal que se responden completando una frase
  con huecos.
- **Informe de diagnóstico**: Gini del reparto, índice R de Clark-Evans con su
  puntuación z, centro de gravedad, distancia típica y cobertura.
- **Lámina A4 imprimible** con mapa, escala, norte, leyenda y las cifras.

## Los tres modos

Una sola aplicación, un solo mapa, una sola lista de capas. Tres maneras de
entrar, y se cambia de una a otra sin perder nada de lo que haya en pantalla.

**Mirar.** El territorio de casa: las capas del municipio, los filtros por
plataforma y barrio, los análisis ya preparados. Quien entra a mirar no se
tropieza con una caja de herramientas.

**Analizar.** Suelta lo tuyo y crúzalo con lo de casa. Las preguntas primero,
la caja entera para quien la quiera.

**Contar.** El diagnóstico escrito y la lámina. Lo que se adjunta a un oficio.

## Qué la hace distinta de GOAT

GOAT es la referencia y hay que superarla en siete cosas concretas.

1. **Responde, no ofrece.** GOAT da herramientas y hay que saber que lo que uno
   quiere se llama *Aggregate Points*. Aquí se entra por la pregunta y la
   herramienta, sus parámetros y el orden de las capas los pone la aplicación.

2. **Todo es una capa.** Lo del municipio y lo tuyo en la misma lista, sin
   jerarquía, encadenable. El resultado de una herramienta es la entrada de la
   siguiente sin exportar ni volver a cargar.

3. **Cada cifra dice de dónde salió.** Método, ámbito, parámetros, fecha y
   fuente, dentro del archivo exportado y en la lámina. Una cifra sin
   procedencia no entra en un expediente.

4. **Avisa cuando no hay que creerle.** El ámbito deducido infla la superficie.
   La línea recta siempre es optimista. La esfera de radio medio se desvía. Una
   herramienta que dice cuándo desconfiar de ella vale más que una que siempre
   responde con aplomo.

5. **Se imprime.** GOAT no tiene lámina. Esta sí, y en A4 apaisada con escala y
   norte.

6. **Es de aquí.** Sabe qué son las plataformas de Riobamba, conoce los radios
   normativos de la Tabla 3, y sabe que la ciudad está a 2.750 m y sube, así que
   una isócrona cuesta arriba alcanza menos de lo que dibuja.

7. **No necesita servidor.** Corre entera en el navegador. Para información
   municipal sin publicar, esa es la única respuesta aceptable mientras no haya
   base institucional.

## Las reglas que no se negocian

- **El nombre del propietario no sale del catastro.** Clave y superficie sí;
  nombre y número de trámite, nunca. El repositorio es público.
- **Lo de OpenStreetMap es ODbL** y va citado donde se use.
- **Se mide sobre el elipsoide WGS84**, con latitud autálica para las
  superficies y radios de curvatura locales para las distancias. La esfera de
  radio medio se desvía 0,45 % en superficie y 0,22 % en longitud a esta
  latitud, siempre en la misma dirección: no se cancela.
- **Ninguna cifra se publica sin contrastarla** contra geopandas o pyproj. Así
  se hicieron todas las actuales y así salieron los dos errores que el visor
  arrastraba: la plataforma K declaraba 158,148 ha y mide 145,72, y la red
  sumaba 1.934,9 km y son 1.931,0.
- **Evidencia antes que promesas.** No se dice que algo funciona: se enseña la
  cifra y contra qué se comprobó.
- **No se publica ni se hace commit sin permiso.**

## Lo que no debe ser

- **No es un chat que adivina.** Las preguntas son un catálogo que se completa,
  no texto libre que la aplicación interpreta a su gusto.
- **No sustituye a QGIS.** No edita geometría ni gestiona proyectos. Responde
  preguntas de gestión y produce láminas.
- **No inventa datos.** Si falta una capa, lo dice; no rellena.
- **No esconde la incertidumbre** detrás de una cifra redonda.
- **No se le añaden más modos.** Tres, y que los tres estén bien.

## Cómo se sabe que está lograda

Criterios comprobables, no impresiones:

1. Un técnico que no la ha visto nunca llega de la pantalla inicial a **una
   lámina imprimible en menos de tres minutos**, sin que nadie le explique nada.
2. Carga un **CSV de una campaña** —esterilizaciones, vacunación, inspecciones—
   con coordenadas en UTM 17S y obtiene el reparto por barrio, la desigualdad y
   la cobertura, **sin tocar un parámetro**.
3. Un resultado exportado, abierto en QGIS **un mes después**, sigue diciendo
   con qué celda, contra qué ámbito y en qué fecha se calculó.
4. La aplicación **ofrece distintas herramientas** al cargar puntos, líneas o
   polígonos, y nunca ofrece una que no tenga sentido para esa geometría.
5. Toda cifra que aparezca en una lámina **se puede reproducir** con geopandas
   o pyproj y coincide.
6. Quien entra solo a mirar **no ve ninguna herramienta** hasta que la busca.

## Por dónde empezar

El motor base tiene que ser el de CHASKI, no el del visor. El mapa del visor
está escrito para capas declaradas a mano, una por una; el de CHASKI recibe
capas que no conoce, deduce su forma, las ordena por geometría y las pinta.
Meter lo desconocido en el motor del visor es pelear contra su diseño; meter
las capas del visor en el de CHASKI es cargarlas.

El primer paso ya está hecho y funciona: CHASKI lee en vivo las capas que el
visor publica, sin copiar un archivo. Sobre eso se construye lo demás.

Lo que falta, por orden de lo que más cambia las cosas:

1. **Las isócronas sobre la red vial**, portadas del visor. Hoy la accesibilidad
   se mide en línea recta y siempre sale optimista. Es lo que la vuelve
   defendible.
2. **El eje temporal**, que es lo que hace que la interfaz se sienta viva: si la
   capa trae fecha, aparece y se puede ver el avance.
3. **Los tres modos** y el mapa unificado.
4. **Guardar el trabajo**, para que recargar no deje la mesa limpia.
5. **PostGIS**, para que las capas puedan venir de la base institucional. Las
   herramientas no cambian; cambia de dónde salen los registros.
