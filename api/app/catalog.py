"""The schema text every agent sees: tables, columns, the values of small categorical columns, and data caveats.

Built from the database's own meta tables, so it changes only when the data does, which keeps the prompt cache warm.
"""
from __future__ import annotations

from .db import Database

MAX_LISTED_VALUES = 25


def build_catalog(db: Database) -> tuple[str, str]:
    """Return (catalog_text, data_as_of)."""
    with db.connect() as con:
        cols = con.execute(
            "SELECT table_name, column_name, data_type, description FROM meta_columns ORDER BY rowid").fetchall()
        notes = [r[0] for r in con.execute("SELECT note FROM meta_notes ORDER BY rowid").fetchall()]
        as_of = con.execute("SELECT data_as_of FROM meta_build").fetchone()[0]
        counts = {t: con.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0] for t in {c[0] for c in cols}}

        lines = [f"# Database (data as of {as_of} UTC)", ""]
        for table, column, dtype, desc in cols:
            if not column:  # the table's own description row
                lines += ["", f"## {table} ({counts[table]:,} rows)", desc]
                continue
            line = f"- {column} {dtype}: {desc}"
            if dtype == "VARCHAR" and column not in ("name", "title", "description"):
                n = con.execute(f'SELECT count(DISTINCT "{column}") FROM "{table}"').fetchone()[0]
                if n <= MAX_LISTED_VALUES:
                    vals = [r[0] for r in con.execute(
                        f'SELECT DISTINCT "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL ORDER BY 1').fetchall()]
                    line += " Values: " + ", ".join(f"'{v}'" for v in vals)
            lines.append(line)
    lines += ["", "## Caveats", *[f"- {n}" for n in notes]]
    return "\n".join(lines), as_of
