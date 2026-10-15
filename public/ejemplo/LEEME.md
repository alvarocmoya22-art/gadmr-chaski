# Datos de ejemplo

Cuatro capas reales de Riobamba, para poder probar CHASKI sin tener que buscar
un archivo primero. Son las mismas que publica el
[visor de territorio](https://alvarocmoya22-art.github.io/gadmr-visor-territorio/).

| Archivo | Qué es | Procedencia |
|---|---|---|
| `equipamientos.geojson` | 1.083 equipamientos con su tipo | Inventario del GADM Riobamba y OpenStreetMap |
| `plataformas.geojson` | Las 18 plataformas del casco urbano | GADM Riobamba |
| `barrios.geojson` | 212 barrios urbanos | GADM Riobamba |
| `vialidad.geojson` | 9.571 tramos de vía, 644,5 km, recortados al urbano | OpenStreetMap |

Lo que viene de OpenStreetMap está bajo
[ODbL](https://www.openstreetmap.org/copyright): se puede usar y redistribuir
citando la fuente, que es lo que hace la propia aplicación al cargarlas.

La vialidad va recortada al casco urbano a propósito: entera son 1.931 km y
tres veces el peso, y para probar las herramientas no aporta nada.

Ninguna de estas capas trae datos personales. El catastro, que sí trae el
nombre del propietario, no está aquí ni lo estará.

## Plantilla para una campaña

`plantilla_campania.csv` tiene las columnas que CHASKI reconoce para cargar los
registros de una jornada —esterilizaciones, vacunación, inspecciones—. Las dos
filas que trae están marcadas para borrar: son solo el ejemplo del formato, no
datos de nadie.

Lo único obligatorio son las coordenadas, en columnas que se llamen `lat` y
`lon` (también valen `latitud`/`longitud` o `x`/`y`). Si vienen en UTM 17S, se
reproyectan solas y la aplicación avisa de cuántas filas convirtió. El
separador puede ser punto y coma —el que pone Excel en español— coma o
tabulador: se reconoce solo.

Las demás columnas son libres. Cada una se puede usar después para separar el
análisis: por `sexo`, por `especie`, por `campania` o por lo que se haya
anotado.
