"""Three agents in a LangGraph graph: analyst (SQL tool loop) -> chart designer -> verifier, with one revision.

    START -> analyst --out of scope--> END
                |
                v
             designer -> verifier --pass, or already revised--> END
                            |
                            +--revise (once)--> analyst

Progress goes to the browser through LangGraph's custom stream (get_stream_writer), so the reader sees each query
as it runs instead of a spinner.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
import threading
from typing import Any, Literal, TypedDict

import duckdb
from anthropic import AsyncAnthropic
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict

from .catalog import build_catalog
from .charts import ChartError, ChartSpec, build
from .db import Database, QueryResult
from .guard import SqlRejected
from .prompts import ANALYST, DESIGNER, VERIFIER

log = logging.getLogger("midterms.agents")

MODEL = os.environ.get("MODEL", "claude-sonnet-5-5")
MAX_QUERIES = 6
SAMPLE_ROWS = 50
CHART_ROWS = 3500  # every county (about 3,150) fits, so county maps are never cut off
# USD per million tokens for claude-sonnet-5-5: input, 5-minute cache write, cache read, output
PRICES = {"input": 2.0, "cache_write": 2.5, "cache_read": 0.2, "output": 10.0}


class AgentError(RuntimeError):
    """A failure the reader can be told about in plain words."""


class Declined(AgentError):
    pass


class BudgetExceeded(AgentError):
    pass


class AnalystAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str
    final_sql: str
    caveats: list[str]
    out_of_scope: bool


class Verdict(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdict: Literal["pass", "revise"]
    problems: list[str]
    caveats_to_add: list[str]


# Written by hand (not generated) so it stays inside what structured outputs accept: every field required, no extras.
ANALYST_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "answer": {"type": "string"},
            "final_sql": {"type": "string"},
            "caveats": {"type": "array", "items": {"type": "string"}},
            "out_of_scope": {"type": "boolean"},
        },
        "required": ["answer", "final_sql", "caveats", "out_of_scope"],
        "additionalProperties": False,
    },
}

RUN_SQL = {
    "name": "run_sql",
    "description": ("Run one read-only DuckDB SELECT over the catalog tables. Returns the column names and types, the "
                    "total row count, and up to 50 rows. A rejected or failing query returns the error so you can fix it."),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {"sql": {"type": "string", "description": "One SELECT (or WITH ... SELECT) statement."}},
        "required": ["sql"],
        "additionalProperties": False,
    },
}


class Meter:
    """Running cost per UTC day. In memory, so a restart resets it: the Anthropic Console spend limit is the hard cap."""

    def __init__(self, daily_budget_usd: float):
        self.daily_budget = daily_budget_usd
        self._day = dt.datetime.now(dt.UTC).date()
        self.spent = 0.0
        self._lock = threading.Lock()

    def _roll(self) -> None:
        today = dt.datetime.now(dt.UTC).date()
        if today != self._day:
            self._day, self.spent = today, 0.0

    def ok(self) -> bool:
        with self._lock:
            self._roll()
            return self.spent < self.daily_budget

    def add(self, usage: Any) -> float:
        cost = ((usage.input_tokens or 0) * PRICES["input"]
                + (getattr(usage, "cache_creation_input_tokens", 0) or 0) * PRICES["cache_write"]
                + (getattr(usage, "cache_read_input_tokens", 0) or 0) * PRICES["cache_read"]
                + (usage.output_tokens or 0) * PRICES["output"]) / 1e6
        with self._lock:
            self._roll()
            self.spent += cost
        log.info("usage in=%s cache_w=%s cache_r=%s out=%s cost=$%.4f day=$%.2f", usage.input_tokens,
                 getattr(usage, "cache_creation_input_tokens", 0), getattr(usage, "cache_read_input_tokens", 0),
                 usage.output_tokens, cost, self.spent)
        return cost


class AskState(TypedDict, total=False):
    question: str
    context: list[dict]          # earlier turns from the same reader: question, answer, sql
    messages: list               # the analyst's conversation, kept so a revision continues it (and its cache)
    queries: list[dict]          # every run_sql call, for the verifier and the reader
    analysis: dict               # AnalystAnswer
    result: dict                 # final_sql's result: sql, columns, types, rows, truncated
    chart: dict | None
    chart_spec: dict | None
    verdict: dict | None
    revisions: int


def _result_text(res: QueryResult, limit: int = SAMPLE_ROWS) -> str:
    return json.dumps({"columns": res.columns, "types": res.types, "row_count": len(res.rows),
                       "more_rows_exist": res.truncated, "rows": res.rows[:limit]}, default=str, separators=(",", ":"))


class Agents:
    def __init__(self, db: Database, meter: Meter, client: AsyncAnthropic | None = None):
        self.db = db
        self.meter = meter
        self.client = client or AsyncAnthropic()
        self._catalog: tuple[str, str] | None = None
        self.graph = self._build_graph()

    # ---- shared helpers
    def catalog(self) -> tuple[str, str]:
        as_of = self.db.data_as_of()
        if self._catalog is None or self._catalog[1] != as_of:
            self._catalog = build_catalog(self.db)
        catalog = self._catalog
        return catalog

    def _system(self, role: str) -> list[dict]:
        text, _ = self.catalog()
        return [{"type": "text", "text": f"{role}\n\n{text}", "cache_control": {"type": "ephemeral"}}]

    def _check(self, resp: Any) -> None:
        self.meter.add(resp.usage)
        if resp.stop_reason == "refusal":
            raise Declined("The model declined to answer this question.")
        if resp.stop_reason == "max_tokens":
            raise AgentError("The answer ran too long. Try a narrower question.")

    async def _run(self, sql: str, max_rows: int) -> QueryResult:
        return await asyncio.to_thread(self.db.run, sql, max_rows)

    # ---- nodes
    async def analyst(self, state: AskState) -> dict:
        write = get_stream_writer()
        messages = list(state.get("messages") or [])
        queries = list(state.get("queries") or [])
        revisions = state.get("revisions", 0)
        if not messages:
            earlier = "".join(f"Earlier question: {t['question']}\nEarlier answer: {t['answer']}\n"
                              f"Earlier final_sql: {t.get('sql') or '(none)'}\n\n" for t in state.get("context") or [])
            messages = [{"role": "user", "content": f"{earlier}Question: {state['question']}"}]
            write({"type": "status", "agent": "analyst", "text": "Reading the catalog and planning queries"})
        else:  # sent back by the verifier
            revisions += 1
            problems = "\n".join(f"- {p}" for p in state["verdict"]["problems"])
            messages.append({"role": "user", "content": "A reviewer checked your answer before publication and found "
                             f"these problems:\n{problems}\nFix each one and return the complete JSON again."})
            write({"type": "status", "agent": "analyst", "text": "Revising after review"})

        n_sql = sum(1 for q in queries if q.get("by") == "analyst")
        for _ in range(MAX_QUERIES + 3):
            resp = await self.client.messages.create(
                model=MODEL, max_tokens=16000, system=self._system(ANALYST), tools=[RUN_SQL],
                output_config={"effort": "medium", "format": ANALYST_FORMAT}, messages=messages)
            self._check(resp)
            messages.append({"role": "assistant", "content": resp.content})
            tool_uses = [b for b in resp.content if b.type == "tool_use"]

            if tool_uses:
                results = []
                for tu in tool_uses:
                    sql = (tu.input or {}).get("sql", "")
                    n_sql += 1
                    if n_sql > MAX_QUERIES:
                        results.append({"type": "tool_result", "tool_use_id": tu.id, "is_error": True,
                                        "content": "Query limit reached. Answer with the results you have."})
                        continue
                    write({"type": "sql", "agent": "analyst", "sql": sql})
                    try:
                        res = await self._run(sql, SAMPLE_ROWS)
                        queries.append({"by": "analyst", "sql": sql, "row_count": len(res.rows), "error": None})
                        write({"type": "sql_result", "row_count": len(res.rows), "more": res.truncated})
                        results.append({"type": "tool_result", "tool_use_id": tu.id, "content": _result_text(res)})
                    except (SqlRejected, duckdb.Error) as e:
                        msg = str(e).splitlines()[0][:500]
                        queries.append({"by": "analyst", "sql": sql, "row_count": 0, "error": msg})
                        write({"type": "sql_result", "error": msg})
                        results.append({"type": "tool_result", "tool_use_id": tu.id, "is_error": True, "content": msg})
                messages.append({"role": "user", "content": results})
                continue

            text = next((b.text for b in resp.content if b.type == "text"), "")
            try:
                answer = AnalystAnswer.model_validate_json(text)
            except ValueError:
                raise AgentError("The analyst returned an unreadable answer.") from None
            if answer.out_of_scope or not answer.final_sql.strip():
                write({"type": "answer", "text": answer.answer, "caveats": answer.caveats, "out_of_scope": True})
                return {"messages": messages, "queries": queries, "analysis": answer.model_dump(), "result": None,
                        "chart": None, "chart_spec": None, "revisions": revisions}
            try:
                res = await self._run(answer.final_sql, CHART_ROWS)
            except (SqlRejected, duckdb.Error) as e:
                msg = str(e).splitlines()[0][:500]
                messages.append({"role": "user", "content": f"final_sql failed: {msg}\nFix it and return the JSON again."})
                continue
            queries.append({"by": "final", "sql": answer.final_sql, "row_count": len(res.rows), "error": None})
            write({"type": "answer", "text": answer.answer, "caveats": answer.caveats, "out_of_scope": False})
            return {"messages": messages, "queries": queries, "analysis": answer.model_dump(), "revisions": revisions,
                    "result": {"sql": res.sql, "columns": res.columns, "types": res.types, "rows": res.rows,
                               "truncated": res.truncated}}
        raise AgentError("The analyst did not finish within its query budget.")

    async def designer(self, state: AskState) -> dict:
        write = get_stream_writer()
        write({"type": "status", "agent": "designer", "text": "Choosing a chart"})
        res, analysis = state["result"], state["analysis"]
        if not res["rows"]:
            write({"type": "chart", "chart": None})
            return {"chart": None, "chart_spec": None}
        base = (f"Question: {state['question']}\nAnalyst's answer: {analysis['answer']}\n"
                f"Result columns (name: type): {', '.join(f'{c}: {t}' for c, t in zip(res['columns'], res['types']))}\n"
                f"Row count: {len(res['rows'])}\nFirst rows: {json.dumps(res['rows'][:25], default=str)}")
        note = ""
        for _ in range(2):
            resp = await self.client.messages.parse(
                model=MODEL, max_tokens=4000, system=DESIGNER, output_config={"effort": "low"},
                output_format=ChartSpec, messages=[{"role": "user", "content": base + note}])
            self._check(resp)
            spec = resp.parsed_output
            try:
                chart = build(spec, res["columns"], res["rows"])
                break
            except ChartError as e:
                note = f"\n\nAn earlier spec failed validation.\nSpec: {spec.model_dump_json()}\nError: {e}"
        else:
            spec = ChartSpec(type="table", title="Query result")
            chart = build(spec, res["columns"], res["rows"])
        write({"type": "chart", "chart": chart})
        return {"chart": chart, "chart_spec": spec.model_dump()}

    async def verifier(self, state: AskState) -> dict:
        write = get_stream_writer()
        write({"type": "status", "agent": "verifier", "text": "Checking the answer against the data"})
        res, analysis, spec = state["result"], state["analysis"], state.get("chart_spec")
        ran = "\n".join(f"- [{q['by']}] {q['sql']}  -> " + (f"error: {q['error']}" if q["error"] else f"{q['row_count']} rows")
                        for q in state["queries"])
        prompt = (f"Reader's question: {state['question']}\n\nQueries run:\n{ran}\n\n"
                  f"Final query result: columns {res['columns']}, {len(res['rows'])} rows"
                  f"{' (cut at the row limit)' if res['truncated'] else ''}; first 40 rows:\n"
                  f"{json.dumps(res['rows'][:40], default=str)}\n\n"
                  f"Answer: {analysis['answer']}\nCaveats given: {analysis['caveats']}\n\n"
                  f"Chart spec: {json.dumps(spec) if spec else 'none (no rows)'}")
        resp = await self.client.messages.parse(
            model=MODEL, max_tokens=4000, system=self._system(VERIFIER), output_config={"effort": "low"},
            output_format=Verdict, messages=[{"role": "user", "content": prompt}])
        self._check(resp)
        verdict = resp.parsed_output.model_dump()
        write({"type": "verdict", **verdict})
        return {"verdict": verdict}

    def _after_analyst(self, state: AskState) -> str:
        return END if state.get("result") is None else "designer"

    def _after_verifier(self, state: AskState) -> str:
        if state["verdict"]["verdict"] == "revise" and state.get("revisions", 0) < 1:
            return "analyst"
        return END

    def _build_graph(self):
        g = StateGraph(AskState)
        g.add_node("analyst", self.analyst)
        g.add_node("designer", self.designer)
        g.add_node("verifier", self.verifier)
        g.add_edge(START, "analyst")
        g.add_conditional_edges("analyst", self._after_analyst, ["designer", END])
        g.add_edge("designer", "verifier")
        g.add_conditional_edges("verifier", self._after_verifier, ["analyst", END])
        return g.compile()


def final_payload(state: AskState, data_as_of: str) -> dict:
    """What the reader gets at the end: the published answer, its chart, the SQL, and the data."""
    analysis = state.get("analysis") or {}
    verdict = state.get("verdict") or {}
    caveats = list(analysis.get("caveats") or [])
    caveats += [c for c in verdict.get("caveats_to_add") or [] if c not in caveats]
    if verdict.get("verdict") == "revise":  # still failing after the one revision: say so rather than hide it
        caveats += [f"Reviewer note: {p}" for p in verdict.get("problems") or []]
    res = state.get("result")
    return {
        "answer": analysis.get("answer", ""),
        "out_of_scope": bool(analysis.get("out_of_scope")),
        "caveats": caveats,
        "sql": res["sql"] if res else None,
        "columns": res["columns"] if res else [],
        "rows": res["rows"] if res else [],
        "row_count": len(res["rows"]) if res else 0,
        "chart": state.get("chart"),
        "queries": [{"sql": q["sql"], "row_count": q["row_count"], "error": q["error"]} for q in state.get("queries") or []],
        "reviewed": verdict.get("verdict") == "pass",
        "revised": state.get("revisions", 0) > 0,
        "data_as_of": data_as_of,
    }
