"""Saca las tablas de un esquema de PostGIS a GeoJSON, para traerlas a CHASKI.

Es el puente que funciona hoy, sin instalar nada: con psycopg2 --que ya viene
con QGIS-- se leen las tablas publicadas y se escribe un GeoJSON por cada una.
Despues se sueltan en CHASKI como cualquier otro archivo.

No sustituye a `pg_featureserv`: ahi las capas llegan solas y aqui hay que
volver a correr el guion cuando cambien los datos. Pero no hace falta bajar ni
levantar nada, y sirve para empezar a trabajar mientras tanto.

**La contraseña no se escribe aqui.** Se lee del mismo `pg_featureserv.toml`
que ya tiene la conexion, de modo que la credencial vive en un solo sitio. Si
ese archivo no existe todavia, se puede pasar la cadena por la variable de
entorno DATABASE_URL.

    python exportar_base.py
    python exportar_base.py --toml "C:/Users/alvar/pg_featureserv/pg_featureserv.toml"
    python exportar_base.py --salida "C:/capas" --esquema base_grafica

Lo que sale es de solo lectura: este guion no escribe nada en la base.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tomllib
from pathlib import Path

try:
    import psycopg2
except ImportError:  # pragma: no cover
    sys.exit("Falta psycopg2. Viene con QGIS: prueba con el «OSGeo4W Shell».")

TOML_POR_OMISION = Path.home() / "pg_featureserv" / "pg_featureserv.toml"


def leer_configuracion(ruta: Path) -> tuple[str, list[str]]:
    """Saca la cadena de conexion y los esquemas publicados del toml."""
    if not ruta.exists():
        cadena = os.environ.get("DATABASE_URL", "")
        if not cadena:
            sys.exit(
                f"No encuentro {ruta} ni la variable DATABASE_URL.\n"
                "Pasa --toml con la ruta del archivo, o define DATABASE_URL."
            )
        return cadena, []

    datos = tomllib.loads(ruta.read_text(encoding="utf-8"))
    base = datos.get("Database", {})
    cadena = os.environ.get("DATABASE_URL") or base.get("DbConnection", "")
    if not cadena:
        sys.exit(f"{ruta} no tiene DbConnection ni hay DATABASE_URL definida.")
    if "TU-CLAVE" in cadena:
        sys.exit(
            f"La contraseña sigue sin poner en {ruta}:\n"
            "  cambia TU-CLAVE por la tuya en la linea DbConnection."
        )
    esquemas = [str(x) for x in base.get("TableIncludes", [])]
    return cadena, esquemas


def tablas_con_geometria(cur, esquemas: list[str]) -> list[tuple[str, str, str, int]]:
    """Las tablas que tienen geometria, con su columna y su sistema."""
    cur.execute(
        """
        SELECT f_table_schema, f_table_name, f_geometry_column, srid
        FROM geometry_columns
        WHERE (%s::text[] IS NULL OR f_table_schema = ANY(%s::text[]))
          AND f_table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY f_table_schema, f_table_name
        """,
        (esquemas or None, esquemas or None),
    )
    return cur.fetchall()


def exportar(cur, esquema: str, tabla: str, geom: str, destino: Path) -> int:
    """Escribe una tabla como GeoJSON en 4326 y devuelve cuantos rasgos salieron."""
    # Las columnas que no son la geometria salen como propiedades. Se piden por
    # nombre y no con «*» para no arrastrar la geometria dos veces.
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name <> %s
        ORDER BY ordinal_position
        """,
        (esquema, tabla, geom),
    )
    columnas = [c[0] for c in cur.fetchall()]
    propiedades = (
        "json_build_object("
        + ", ".join(f"'{c}', t.{psycopg2.extensions.quote_ident(c, cur)}" for c in columnas)
        + ")"
        if columnas
        else "'{}'::json"
    )

    completo = f"{psycopg2.extensions.quote_ident(esquema, cur)}.{psycopg2.extensions.quote_ident(tabla, cur)}"
    columna = psycopg2.extensions.quote_ident(geom, cur)
    cur.execute(
        f"""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(t.{columna}, 4326))::json,
                'properties', {propiedades}
            )), '[]'::json)
        )
        FROM {completo} AS t
        WHERE t.{columna} IS NOT NULL
        """
    )
    coleccion = cur.fetchone()[0]
    destino.write_text(json.dumps(coleccion, ensure_ascii=False), encoding="utf-8")
    return len(coleccion.get("features", []))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--toml", type=Path, default=TOML_POR_OMISION)
    p.add_argument("--salida", type=Path, default=Path.cwd() / "capas")
    p.add_argument("--esquema", action="append", default=None,
                   help="Esquema a exportar; se puede repetir. Por omision, los del toml.")
    args = p.parse_args()

    cadena, esquemas_toml = leer_configuracion(args.toml)
    esquemas = args.esquema or esquemas_toml

    args.salida.mkdir(parents=True, exist_ok=True)
    # Solo lectura, y dicho tambien a la base: si algo intentara escribir, falla.
    with psycopg2.connect(cadena) as conexion:
        conexion.set_session(readonly=True)
        with conexion.cursor() as cur:
            tablas = tablas_con_geometria(cur, esquemas)
            if not tablas:
                sys.exit(
                    "No hay ninguna tabla con geometria en "
                    + (", ".join(esquemas) if esquemas else "la base")
                    + ".\nRevisa el nombre del esquema."
                )
            print(f"{len(tablas)} tablas con geometria\n")
            for esquema, tabla, geom, srid in tablas:
                destino = args.salida / f"{tabla}.geojson"
                cuantos = exportar(cur, esquema, tabla, geom, destino)
                peso = destino.stat().st_size / 1_048_576
                print(f"  {esquema}.{tabla:<28} {cuantos:>8,} rasgos  "
                      f"{peso:>6.1f} MB  (origen EPSG:{srid})")

    print(f"\nListo. Los archivos estan en {args.salida}")
    print("Sueltalos en CHASKI: https://alvarocmoya22-art.github.io/gadmr-chaski/")


if __name__ == "__main__":
    main()
