"""HTTP service for the Ask page: POST /ask streams the agents' progress and the final answer as server-sent events.

Environment:
  ANTHROPIC_API_KEY   required
  DB_PATH             path to midterms.duckdb (default ../data/midterms.duckdb)
  DATA_URL            optional URL of a newer midterms.duckdb; polled every REFRESH_MINUTES
  ALLOWED_ORIGINS     comma-separated origins allowed to call the API (the website)
  DAILY_BUDGET_USD    stop answering for the rest of the UTC day once model spend reaches this (default 5)
  RATE_PER_MINUTE, RATE_PER_DAY   per-IP limits on /ask (defaults 4/minute, 40/day)
  MAX_CONCURRENT      questions answered at once (default 3)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .agents import AgentError, Agents, Meter, final_payload
from .db import Database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("midterms.api")

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("DB_PATH", ROOT / "data" / "midterms.duckdb"))
RATE_PER_MINUTE = os.environ.get("RATE_PER_MINUTE", "4")
RATE_PER_DAY = os.environ.get("RATE_PER_DAY", "40")
MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "3"))
QUEUE_WAIT_S = 20

db = Database(DB_PATH, data_url=os.environ.get("DATA_URL") or None,
              refresh_minutes=int(os.environ.get("REFRESH_MINUTES", "30")))
meter = Meter(float(os.environ.get("DAILY_BUDGET_USD", "5")))
agents: Agents | None = None
slots = asyncio.Semaphore(MAX_CONCURRENT)
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global agents
    if not DB_PATH.exists():
        if not db.refresh_once():
            raise RuntimeError(f"No database at {DB_PATH} and DATA_URL did not provide one.")
    db.start_refresh_loop()
    agents = Agents(db, meter)
    yield


app = FastAPI(title="Midterms 2026 Ask API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Turn(BaseModel):
    question: str = Field(max_length=500)
    answer: str = Field(max_length=2000)
    sql: str | None = Field(default=None, max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    context: list[Turn] = Field(default_factory=list, max_length=3)


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, default=str, separators=(',', ':'))}\n\n"


@app.get("/health")
def health():
    return {"ok": True, "data_as_of": db.data_as_of(), "answering": meter.ok()}


@app.get("/schema")
def schema():
    """Tables and columns, for the Ask page's 'what can I ask about' panel."""
    with db.connect() as con:
        rows = con.execute("SELECT table_name, column_name, description FROM meta_columns ORDER BY rowid").fetchall()
    tables: dict[str, dict] = {}
    for t, c, d in rows:
        entry = tables.setdefault(t, {"table": t, "description": "", "columns": []})
        if c:
            entry["columns"].append({"name": c, "description": d})
        else:
            entry["description"] = d
    return {"data_as_of": db.data_as_of(), "tables": list(tables.values())}


@app.post("/ask")
@limiter.limit(f"{RATE_PER_MINUTE}/minute")
@limiter.limit(f"{RATE_PER_DAY}/day")
async def ask(request: Request, body: AskRequest):
    if not meter.ok():
        return JSONResponse({"detail": "The daily question budget is used up. Please try again tomorrow."}, status_code=503)
    ag = agents
    if ag is None:
        return JSONResponse({"detail": "Starting up; try again in a moment."}, status_code=503)

    async def stream():
        started = time.monotonic()
        try:
            await asyncio.wait_for(slots.acquire(), timeout=QUEUE_WAIT_S)
        except TimeoutError:
            yield sse({"type": "error", "message": "Too many questions at once. Please try again in a minute."})
            return
        try:
            _, as_of = ag.catalog()
            yield sse({"type": "start", "data_as_of": as_of})
            state = {"question": body.question.strip(), "context": [t.model_dump() for t in body.context], "revisions": 0}
            final = state
            async for mode, chunk in ag.graph.astream(state, stream_mode=["custom", "values"]):
                if mode == "custom":
                    yield sse(chunk)
                else:
                    final = chunk
            yield sse({"type": "done", "result": final_payload(final, as_of)})
        except AgentError as e:
            yield sse({"type": "error", "message": str(e)})
        except Exception:
            log.exception("ask failed")
            yield sse({"type": "error", "message": "Something went wrong answering that. Please try again."})
        finally:
            slots.release()
            log.info("ask done in %.1fs", time.monotonic() - started)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
