"""Read-only access to the midterms DuckDB file, with a time limit per query and hot swapping on refresh."""
from __future__ import annotations

import datetime as dt
import decimal
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import duckdb

from .guard import check_sql

log = logging.getLogger("midterms.db")

# External access off: no file or network reads even if a query slipped past the guard. Locked so a query can't re-enable it.
# Memory is capped low because the free host has about 512 MB for everything and up to 3 questions run at once.
CONFIG = {"enable_external_access": "false", "lock_configuration": "true", "threads": "2", "memory_limit": "192MB"}


@dataclass
class QueryResult:
    sql: str
    columns: list[str]
    types: list[str]
    rows: list[list]
    truncated: bool


def _jsonable(v):
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return v


class Database:
    def __init__(self, path: Path, data_url: str | None = None, refresh_minutes: int = 30):
        self.path = Path(path)
        self.data_url = data_url
        self.refresh_minutes = refresh_minutes
        self._etag: str | None = None
        self._lock = threading.Lock()

    def connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.path), read_only=True, config=CONFIG)

    def tables(self) -> set[str]:
        with self.connect() as con:
            names = {r[0] for r in con.execute("SELECT DISTINCT table_name FROM meta_columns").fetchall()}
        return names

    def run(self, sql: str, max_rows: int = 2000, timeout_s: float = 8.0) -> QueryResult:
        """Guard, then execute with a hard time limit. Raises SqlRejected or duckdb.Error."""
        safe = check_sql(sql, self.tables(), max_rows=max_rows)
        con = self.connect()
        timer = threading.Timer(timeout_s, con.interrupt)
        timer.start()
        try:
            cur = con.execute(safe)
            columns = [d[0] for d in cur.description]
            types = [str(d[1]) for d in cur.description]
            rows = cur.fetchall()
        finally:
            timer.cancel()
            con.close()
        truncated = len(rows) > max_rows
        rows = [[_jsonable(v) for v in r] for r in rows[:max_rows]]
        return QueryResult(sql=sql.strip(), columns=columns, types=types, rows=rows, truncated=truncated)

    # ---- refresh: download a newer database file when DATA_URL changes; queries open the file per call,
    # so replacing it atomically never disturbs a running query.
    def refresh_once(self) -> bool:
        if not self.data_url:
            return False
        req = urllib.request.Request(self.data_url, headers={"User-Agent": "midterms-agent/1.0"})
        if self._etag:
            req.add_header("If-None-Match", self._etag)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                tmp = self.path.with_suffix(".download")
                tmp.write_bytes(resp.read())
                with duckdb.connect(str(tmp), read_only=True) as check:  # refuse a truncated or wrong file
                    check.execute("SELECT count(*) FROM meta_build").fetchone()
                with self._lock:
                    os.replace(tmp, self.path)
                self._etag = resp.headers.get("ETag")
                log.info("database refreshed from %s", self.data_url)
                return True
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return False
            log.warning("refresh failed: HTTP %s", e.code)
        except Exception as e:  # keep serving the current file
            log.warning("refresh failed: %s", e)
        return False

    def start_refresh_loop(self) -> None:
        if not self.data_url:
            return

        def loop():
            while True:
                self.refresh_once()
                time.sleep(self.refresh_minutes * 60)

        threading.Thread(target=loop, name="db-refresh", daemon=True).start()

    def data_as_of(self) -> str | None:
        with self.connect() as con:
            row = con.execute("SELECT data_as_of FROM meta_build").fetchone()
        return row[0] if row else None
