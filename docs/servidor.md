# Ponerlo en un servidor del municipio

Es lo que resuelve de verdad el problema de tener que abrirlo en local: dentro
de la red del GADM, CHASKI y el servicio de capas conviven y el navegador deja
de bloquear nada, porque ya no hay una página de internet llamando a una red
privada. Y nadie tiene que instalar ni arrancar nada: abren una dirección.

## Las dos piezas

```
   Equipo de quien lo usa          Servidor del municipio        Base
   ──────────────────────          ──────────────────────        ────
   Navegador  ──────────────►  CHASKI (archivos estáticos)
                               pg_featureserv  ──────────►  172.16.0.234:5432
```

Las dos en el mismo servidor, o en dos de la misma red. Lo que importa es que
quien abra CHASKI pueda alcanzar también el puerto del servicio.

## CHASKI

Son archivos estáticos: no necesita Node ni nada corriendo. Se construyen una
vez y se copian.

**De qué ruta va a colgar** hay que decirlo al construir, porque los archivos
se buscan a sí mismos por esa ruta:

```bash
# Si va en la raíz del sitio:   http://servidor/
set CHASKI_BASE=/ && npm run build

# Si va en una carpeta:         http://servidor/chaski/
set CHASKI_BASE=/chaski/ && npm run build
```

Lo que queda en `dist/` se copia al servidor. Si la ruta no coincide, la página
sale **en blanco y sin ningún error que lo explique**: busca sus archivos donde
no están.

Con IIS hay que añadir el tipo MIME de `.geojson` si no está, o los datos de
ejemplo no se sirven.

## El servicio de capas

El mismo `pg_featureserv` que ya corre, con dos cambios en su `.toml`:

```toml
[Server]
# Para que lo alcancen otros equipos, no solo el servidor.
HttpHost = "0.0.0.0"
HttpPort = 9000
# El origen desde el que se va a abrir CHASKI. Acepta UNO SOLO: una lista
# separada por comas hace que deje de enviar la cabecera y no conecta nadie.
CORSOrigins = "http://servidor-del-gadm"
```

En Windows se deja arrancado con la misma tarea programada que ya está hecha
(`automatico.ps1`), pero conviene registrarla para que corra **al iniciar el
equipo** y no al iniciar sesión, para que no dependa de que alguien entre.

## Lo que hay que decidir antes, y no después

**Quien alcance el puerto 9000 ve todo lo publicado, sin contraseña.**
`pg_featureserv` no tiene usuarios. Mientras corría en `127.0.0.1` eso daba
igual, porque solo lo alcanzaba un equipo. En un servidor, lo alcanza la red.

Y entre lo publicado está `gis_catastro`, que trae la columna **`nombre`** —el
propietario— además de `observaciones` y `observacion_2`.

Hay tres salidas, y conviene elegir una a conciencia:

1. **Publicar una vista en vez de la tabla.** La más limpia: se ve el predio,
   su clave y su superficie, y el nombre no sale de la base.

   ```sql
   CREATE OR REPLACE VIEW public.gis_catastro_publico AS
   SELECT gid, claves, codigo_predio, codigo_manzana, bloque, piso,
          tipo_catastro, estado, area, area_levantamiento, area_escritura,
          geom
   FROM public.gis_catastro;
   ```

   Después, en el `.toml`, se cambia `public.gis_catastro` por
   `public.gis_catastro_publico`.

2. **Poner una puerta delante**, con usuario y clave por HTTP. CHASKI ya tiene
   los campos para eso en la ficha de la conexión.

3. **Dejarlo abierto dentro de la red**, si en la institución el catastro con
   nombres ya es de consulta interna general. Es una decisión de quien responde
   por ese dato, no técnica.

## Y el sitio publicado en internet

Puede quedarse: no alcanza ninguna base y solo carga el ejemplo, que son datos
ya públicos. Sirve para enseñar la herramienta fuera de la red y para que el
repositorio siga publicándose solo en cada cambio. El que se usa de verdad es
el del servidor.
