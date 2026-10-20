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

## El catastro, y la puerta que lleva delante

Entre lo publicado está `gis_catastro`, que trae la columna **`nombre`** —el
propietario— además de `observaciones` y `observacion_2`. Mientras el servicio
corría en `127.0.0.1` eso daba igual, porque solo lo alcanzaba un equipo. En un
servidor lo alcanza la red, y **quien alcance el puerto ve todo lo publicado**:
`pg_featureserv` no tiene usuarios. Su binario tiene seis opciones y ninguna es
de autenticación.

La decisión tomada es **ponerle una puerta con usuario y clave delante**.
CHASKI ya tiene esos campos en la ficha de la conexión y están probados de
punta a punta: sin clave responde 401 y sale el aviso; con ella lista las
tablas y trae las capas.

### Cómo queda

```
   Navegador  ──►  Caddy :9000  ──►  pg_featureserv 127.0.0.1:9100  ──►  Base
                   (pide clave)      (ya no lo alcanza nadie de fuera)
```

La configuración está en [`servidor/Caddyfile`](../servidor/Caddyfile), con los
comentarios de qué cambiar. **Está probada contra Caddy 2.11.7 de verdad**, con
CHASKI delante: clave mala da 401 con el aviso correcto, clave buena lista las
15 tablas y trae la capa. Cuatro cosas que no son evidentes y que costaron
justamente eso, probarlo:

1. **pg_featureserv tiene que volver a `127.0.0.1`**, en otro puerto. Si sigue
   escuchando en `0.0.0.0`, la puerta no pinta nada: se la saltan apuntando al
   puerto de atrás.

2. **El preflight no lleva clave.** Antes de mandar la autenticación, el
   navegador pregunta con un `OPTIONS` que viaja sin credenciales. Si la puerta
   le responde 401, el navegador corta ahí y la clave no llega ni a salir; lo
   que se ve en CHASKI es un fallo de red que no habla de permisos. Por eso el
   `Caddyfile` responde el `OPTIONS` antes de pedir nada.

3. **El 401 de `basic_auth` no sale por la vía normal**, sale por la de error,
   así que lo que se ponga con `header` en el camino de ida no lo toca. Sin un
   `handle_errors` que le añada la cabecera CORS, el navegador bloquea el 401 y
   CHASKI vuelve a ver un fallo de red en vez de «la clave no vale» —el mismo
   mensaje inútil, por otro camino—. Y sin quitarle el `WWW-Authenticate`, el
   navegador saca **su** cuadro de usuario y clave por encima de la aplicación.

4. **Por `http`, la clave viaja legible.** «Basic» no cifra: codifica. Dentro de
   la red del municipio puede darse por bueno —es la misma red por la que ya
   viaja la sesión de pgAdmin—, pero si el servicio va a salir de ahí, la puerta
   tiene que llevar certificado y hablar `https`.

### Lo que queda por hacer en el servidor

- Copiar Caddy (quedó en `C:\Users\alvar\caddy\caddy.exe`, un solo archivo) y
  sacar el cifrado de la clave con `caddy hash-password`.
- Poner el origen real en las dos líneas del `Caddyfile` donde aparece
  `http://servidor-del-gadm`, y el mismo en `CORSOrigins`.
- Cambiar el `pg_featureserv.toml` al puerto de atrás y a `127.0.0.1`.
- Registrar las dos como tarea **al iniciar el equipo**, no al iniciar sesión:
  `automatico.ps1` sirve de molde, pero ahora son dos procesos.
- Probarlo desde otro equipo de la red, no desde el servidor: desde el propio
  servidor `localhost` funciona aunque el cortafuegos esté cerrado.

### Si la institución prefiere no abrir esa puerta

La otra salida sigue en pie y es más limpia cuando el nombre no hace falta para
nada: publicar una vista en vez de la tabla.

```sql
CREATE OR REPLACE VIEW public.gis_catastro_publico AS
SELECT gid, claves, codigo_predio, codigo_manzana, bloque, piso,
       tipo_catastro, estado, area, area_levantamiento, area_escritura,
       geom
FROM public.gis_catastro;
```

Después, en el `.toml`, `public.gis_catastro` se cambia por
`public.gis_catastro_publico`. Las dos cosas no se estorban: se puede tener la
puerta y publicar la vista detrás.

## Y el sitio publicado en internet

Puede quedarse: no alcanza ninguna base y solo carga el ejemplo, que son datos
ya públicos. Sirve para enseñar la herramienta fuera de la red y para que el
repositorio siga publicándose solo en cada cambio. El que se usa de verdad es
el del servidor.
