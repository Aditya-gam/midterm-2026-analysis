"""The guard is the security boundary for model-written SQL, so these cases are the attacks it must stop."""
from pathlib import Path

import duckdb
import pytest

from app.db import Database
from app.guard import SqlRejected, check_sql

TABLES = {"races", "candidates", "federal_races", "county_shift", "county_traits", "measures", "turnout",
          "state_legislatures", "exit_poll_groups", "exit_poll_answers", "states", "meta_columns", "meta_notes", "meta_build"}
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "midterms.duckdb"


@pytest.mark.parametrize("sql", [
    "SELECT state, count(*) FROM races GROUP BY state",
    "WITH t AS (SELECT * FROM measures WHERE passing) SELECT topic, count(*) FROM t GROUP BY 1",
    "SELECT * FROM races r JOIN candidates c USING (race_id) WHERE r.level = 'governor'",
    "SELECT state FROM turnout UNION ALL SELECT state FROM states",
    "SELECT corr(shift, bachelors_pct) FROM county_shift;",
    "select median(shift) filter (where area = 'Rural') from county_shift",
])
def test_allows_read_queries(sql):
    out = check_sql(sql, TABLES, max_rows=100)
    assert out.startswith("SELECT * FROM (") and out.endswith("LIMIT 101")


@pytest.mark.parametrize("sql,why", [
    ("DROP TABLE races", "drop"),
    ("DELETE FROM races", "delete"),
    ("UPDATE races SET called = true", "update"),
    ("INSERT INTO races VALUES (1)", "insert"),
    ("CREATE TABLE x AS SELECT 1", "create"),
    ("SELECT 1; DROP TABLE races", "stacked"),
    ("SELECT * FROM races; SELECT * FROM measures", "two selects"),
    ("ATTACH 'other.db' AS o", "attach"),
    ("PRAGMA database_list", "pragma"),
    ("COPY races TO 'out.csv'", "copy"),
    ("INSTALL httpfs", "install"),
    ("LOAD httpfs", "load"),
    ("SET enable_external_access = true", "set"),
    ("SELECT * FROM read_csv('/etc/passwd')", "read_csv"),
    ("SELECT * FROM read_parquet('https://example.com/x.parquet')", "read_parquet"),
    ("SELECT * FROM '/etc/passwd'", "file path as table"),
    ("SELECT * FROM 'data.csv'", "csv path as table"),
    ("SELECT getenv('ANTHROPIC_API_KEY')", "getenv"),
    ("SELECT * FROM duckdb_settings()", "settings"),
    ("SELECT * FROM glob('*')", "glob"),
    ("SELECT * FROM query('DROP TABLE races')", "query()"),
    ("SELECT * FROM other_db.main.races", "qualified"),
    ("SELECT * FROM pg_catalog.pg_tables", "catalog"),
    ("SELECT * FROM information_schema.tables", "information_schema"),
    ("SELECT * FROM secrets", "unknown table"),
    ("WITH x AS (SELECT 1) DELETE FROM races", "cte-wrapped delete"),
    ("", "empty"),
    ("SELEC * FROM races", "garbage"),
])
def test_rejects(sql, why):
    with pytest.raises(SqlRejected):
        check_sql(sql, TABLES)


@pytest.mark.skipif(not DB_PATH.exists(), reason="run pipeline/build_db.py first")
class TestDatabase:
    db = Database(DB_PATH)

    def test_runs_and_limits(self):
        res = self.db.run("SELECT race_id FROM races", max_rows=50)
        assert len(res.rows) == 50 and res.truncated and res.columns == ["race_id"]

    def test_tables_match_catalog(self):
        assert TABLES - {"meta_columns", "meta_notes", "meta_build"} <= self.db.tables()

    def test_connection_blocks_files_even_without_guard(self):
        # Second layer: if the guard ever missed a file read, the connection itself must refuse it.
        with self.db.connect() as con, pytest.raises(duckdb.Error):
            con.execute("SELECT * FROM read_csv('/etc/hosts')").fetchall()

    def test_connection_cannot_reenable_external_access(self):
        with self.db.connect() as con, pytest.raises(duckdb.Error):
            con.execute("SET enable_external_access = true")

    def test_connection_is_read_only(self):
        with self.db.connect() as con, pytest.raises(duckdb.Error):
            con.execute("CREATE TABLE t AS SELECT 1")

    def test_timeout_interrupts(self):
        with pytest.raises(duckdb.Error):
            # allowed by the guard but far too expensive; the timer must stop it
            self.db.run("SELECT count(*) FROM candidates a, candidates b, candidates c", timeout_s=0.5)
