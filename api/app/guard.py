"""Deterministic check on model-written SQL before it runs.

Prompts are not a security boundary, so every query passes through this parser-based guard AND runs on a
read-only DuckDB connection with external access disabled (see db.py). The guard allows exactly one
read-only query over known tables and wraps it in a row limit.
"""
from __future__ import annotations

import sqlglot
from sqlglot import exp


class SqlRejected(ValueError):
    """The query is not allowed; the message is safe to show the model so it can fix the query."""


# Statement and expression types that can change state, touch files or the network, or configure the engine.
_FORBIDDEN_NAMES = (
    "Insert", "Update", "Delete", "Merge", "Create", "Drop", "Alter", "AlterColumn", "Command", "Copy", "Pragma",
    "Set", "SetItem", "Use", "Transaction", "Commit", "Rollback", "Attach", "Detach", "Install", "Load", "Export",
    "Grant", "Revoke", "Describe", "Summarize", "Kill", "LoadData", "Refresh", "Cache", "Uncache", "Truncate",
    "TruncateTable", "Analyze",
)
FORBIDDEN = tuple(t for t in (getattr(exp, n, None) for n in _FORBIDDEN_NAMES) if isinstance(t, type))

# Functions that read files or URLs, inspect the environment, or run SQL from strings.
BLOCKED_FUNCTIONS = {
    "read_csv", "read_csv_auto", "read_parquet", "parquet_scan", "read_json", "read_json_auto", "read_json_objects",
    "read_ndjson", "read_ndjson_auto", "read_text", "read_blob", "read_xlsx", "glob", "sniff_csv", "parquet_metadata",
    "parquet_schema", "query", "query_table", "getenv", "current_setting", "duckdb_settings", "duckdb_secrets",
    "duckdb_extensions", "pragma_database_list", "iceberg_scan", "delta_scan", "sqlite_scan", "postgres_scan",
    "mysql_scan", "httpfs", "load_extension",
}


def _fn_name(node: exp.Expression) -> str:
    if isinstance(node, exp.Anonymous):
        return str(node.this).lower()
    return (node.sql_name() if hasattr(node, "sql_name") else type(node).__name__).lower()


def check_sql(sql: str, allowed_tables: set[str], max_rows: int = 2000) -> str:
    """Return a safe, row-limited SQL string, or raise SqlRejected with a reason."""
    text = (sql or "").strip().rstrip(";").strip()
    if not text:
        raise SqlRejected("Empty query.")
    if len(text) > 8000:
        raise SqlRejected("Query is too long (8,000 characters max).")
    try:
        statements = [s for s in sqlglot.parse(text, read="duckdb") if s is not None]
    except sqlglot.errors.ParseError as e:
        raise SqlRejected(f"Could not parse the SQL: {str(e).splitlines()[0]}") from None
    if len(statements) != 1:
        raise SqlRejected("Send exactly one SELECT statement.")
    stmt = statements[0]
    if not isinstance(stmt, exp.Query):
        raise SqlRejected("Only SELECT queries are allowed.")

    for node in stmt.walk():
        if isinstance(node, FORBIDDEN):
            raise SqlRejected(f"{type(node).__name__} is not allowed; only read-only SELECT queries.")
        if isinstance(node, (exp.Func, exp.Anonymous)) and _fn_name(node) in BLOCKED_FUNCTIONS:
            raise SqlRejected(f"Function {_fn_name(node)} is not allowed.")

    cte_names = {c.alias_or_name.lower() for c in stmt.find_all(exp.CTE)}
    for table in stmt.find_all(exp.Table):
        if isinstance(table.this, (exp.Func, exp.Anonymous)):
            raise SqlRejected("Table functions are not allowed; query the listed tables.")
        if table.args.get("db") or table.args.get("catalog"):
            raise SqlRejected("Use unqualified table names from the catalog.")
        name = table.name.lower()
        if name and name not in allowed_tables and name not in cte_names:
            raise SqlRejected(f"Unknown table '{table.name}'. Use only: {', '.join(sorted(allowed_tables))}.")

    inner = stmt.sql(dialect="duckdb")
    # max_rows + 1 so the caller can tell the result was cut short
    return f"SELECT * FROM ({inner}) AS q LIMIT {max_rows + 1}"
