# Leer la base del GADM desde CHASKI

## Por qué no puede ser como la conexión de QGIS

QGIS es un programa de escritorio: abre una conexión TCP contra
`172.16.0.234:5432` y habla el protocolo de PostgreSQL. **Un navegador no
puede hacer eso.** No existe ninguna forma, en una página web, de abrir una
conexión TCP cruda: solo sabe hacer peticiones HTTP. Un formulario con
anfitrión, puerto, base, usuario y contraseña dentro de CHASKI sería un
formulario sin nada detrás.

Y aunque se pudiera, no convendría: significaría que la contraseña de la base
vive dentro de una página web, y cualquiera que la abriera se la llevaría.

## Cómo queda entonces

```
  QGIS  ───────────────────────────►  PostgreSQL 172.16.0.234:5432
        (protocolo Postgres, TCP)            │
                                             │ la contraseña vive aquí
                                   pg_featureserv (puerto 9000)
                                             │
  CHASKI ────────────────────────────────────┘
        (HTTP, GeoJSON — sin contraseña)
```

`pg_featureserv` es un solo ejecutable, de solo lectura, que se pone al lado de
la base y publica por HTTP las tablas que se le digan. CHASKI no se conecta a
la base: lee lo que ese servicio publica, igual que lee las capas del visor.

**La contraseña de la base queda en la configuración de `pg_featureserv`, en la
máquina donde corra, y nunca llega al navegador.**

## Lo que hay que decidir antes

### Qué se publica

`pg_featureserv` **no tiene usuarios ni contraseña propios**: quien alcance su
puerto ve lo que publique. Así que lo que se publique tiene que ser lo que
cualquiera de la red municipal pueda ver.

Por eso está bien tener un esquema aparte, como el que ya tienes. Lo que yo
pondría ahí son **vistas**, no las tablas de producción, con solo las columnas
que pueden salir. Para el catastro: clave catastral y superficie sí; nombre del
propietario y número de trámite, nunca.

```sql
-- Ejemplo: una vista que publica el predio sin el propietario.
CREATE OR REPLACE VIEW base_grafica.predios_publicos AS
SELECT claves, area, tipo_catas, estado, geom
FROM catastro.predios;
```

### Con qué usuario se conecta

Un rol de solo lectura que **solo vea el esquema publicado**. Así, si alguien
se equivoca al configurar, el error no puede llegar a las tablas que no deben
salir:

```sql
CREATE ROLE chaski_lector LOGIN PASSWORD 'la-que-pongas';
REVOKE ALL ON SCHEMA public FROM chaski_lector;
GRANT USAGE ON SCHEMA base_grafica TO chaski_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA base_grafica TO chaski_lector;
```

### Dónde corre el servicio

Lo más barato para empezar: **en tu propia máquina**, conectándose a
`172.16.0.234`. No hay que instalar nada en el servidor, no hay que pedirle
nada a nadie y no queda nada expuesto. CHASKI se abre en local y le apunta.

Si después lo quiere usar toda la dirección, se mueve a un servidor del GADM y
la dirección cambia; en CHASKI eso es escribir otra URL.

## La configuración

`pg_featureserv.toml`, al lado del ejecutable. **La contraseña la escribes tú**:

```toml
[Server]
HttpHost = "127.0.0.1"
HttpPort = 9000
# Desde dónde se permite llamar. Con CHASKI en local, es su dirección.
CORSOrigins = "http://localhost:5184"

[Database]
# Usuario de solo lectura, no el de administración.
DbConnection = "postgresql://chaski_lector:LA-CONTRASEÑA@172.16.0.234:5432/riobamba"
# Solo el esquema publicado. Lo que no esté aquí, no se ve.
TableIncludes = ["base_grafica"]

[Paging]
LimitDefault = 1000
LimitMax = 10000

[Metadata]
Title = "Base gráfica · GADM Riobamba"
Description = "Capas publicadas para CHASKI. Solo lectura."
```

`HttpHost = "127.0.0.1"` hace que el servicio **solo escuche en tu máquina**.
Para que lo alcancen otros equipos habría que poner `0.0.0.0`, y entonces hay
que estar seguro de que lo publicado puede verlo toda la red.

## Cómo se prueba

1. Arrancar el servicio: `pg_featureserv --config pg_featureserv.toml`
2. Abrirlo en el navegador: <http://localhost:9000/collections?f=json>. Tiene
   que salir la lista de tablas del esquema.
3. En CHASKI, abrir **Bases de datos** → **Nueva**, y rellenar la ficha como
   la de QGIS: nombre `base_grafica`, anfitrión `localhost`, puerto `9000`.
   Guardar y pulsar **Ver tablas**. La conexión queda guardada: la próxima vez
   se elige de la lista.
4. Traer una tabla pequeña primero y mirar que los campos son los que deben ser
   —y que no está ninguno que no debería—.

## Lo que no va a funcionar, y está bien

**CHASKI publicado en internet no podrá leer esta base.** Una página servida
por `https` no puede llamar a un `http://` de la red interna: el navegador lo
bloquea, y la aplicación lo explica cuando pasa.

No es un estorbo: es la garantía de que los datos institucionales no salen a
internet por este camino. Para leer la base, CHASKI se abre dentro de la red
del municipio.

## Orden que conviene seguir

1. Levantar el servicio contra **una copia o el esquema de publicación**, nunca
   directamente contra producción la primera vez.
2. Apuntar CHASKI ahí y comprobar que sale lo esperado.
3. Revisar columna por columna que no se publica nada que no deba salir.
4. Recién entonces decidir si se deja fijo y para quién.
