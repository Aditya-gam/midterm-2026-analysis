"""Graph wiring and the SSE endpoint, driven by a scripted fake of the Anthropic client (no API calls, no cost)."""
import json
from pathlib import Path
from types import SimpleNamespace as NS

import httpx
import pytest

from anthropic.lib._parse._transform import transform_schema
from app import main
from app.agents import AgentError, Agents, AnalystAnswer, Meter, Verdict, final_payload
from app.charts import ChartSpec
from app.db import Database

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "midterms.duckdb"
pytestmark = [pytest.mark.skipif(not DB_PATH.exists(), reason="run pipeline/build_db.py first"), pytest.mark.anyio]


@pytest.fixture
def anyio_backend():
    return "asyncio"

SQL = "SELECT office, count(*) AS races FROM races GROUP BY office ORDER BY races DESC"


def usage():
    return NS(input_tokens=1000, output_tokens=200, cache_creation_input_tokens=0, cache_read_input_tokens=3000)


def tool_turn(sql, id_="t1"):
    return NS(content=[NS(type="tool_use", id=id_, name="run_sql", input={"sql": sql})], stop_reason="tool_use", usage=usage())


def answer_turn(answer="Local races dominate.", sql=SQL, out_of_scope=False):
    payload = AnalystAnswer(answer=answer, final_sql=sql, caveats=[], out_of_scope=out_of_scope)
    return NS(content=[NS(type="text", text=payload.model_dump_json())], stop_reason="end_turn", usage=usage())


def parsed(obj, stop_reason="end_turn"):
    return NS(parsed_output=obj, stop_reason=stop_reason, usage=usage())


class FakeMessages:
    def __init__(self, creates, parses):
        self.creates, self.parses, self.create_calls, self.parse_calls = list(creates), list(parses), [], []

    async def create(self, **kw):
        self.create_calls.append({**kw, "messages": list(kw["messages"])})  # the SDK serializes at call time
        return self.creates.pop(0)

    async def parse(self, **kw):
        self.parse_calls.append(kw)
        return self.parses.pop(0)


def make(creates, parses):
    fake = NS(messages=FakeMessages(creates, parses))
    return Agents(Database(DB_PATH), Meter(5), client=fake), fake.messages


BAR = ChartSpec(type="bar", title="Most races are local", x="office", y="races")
PASS = Verdict(verdict="pass", problems=[], caveats_to_add=["Counts are unofficial."])


async def run(ag, question="Which offices had the most races?"):
    events, final = [], None
    async for mode, chunk in ag.graph.astream({"question": question, "revisions": 0}, stream_mode=["custom", "values"]):
        if mode == "custom":
            events.append(chunk)
        else:
            final = chunk
    return events, final


async def test_happy_path_runs_sql_charts_and_verifies():
    ag, msgs = make([tool_turn(SQL), answer_turn()], [parsed(BAR), parsed(PASS)])
    events, final = await run(ag)
    kinds = [e["type"] for e in events]
    assert kinds.index("sql") < kinds.index("answer") < kinds.index("chart") < kinds.index("verdict")
    out = final_payload(final, "x")
    assert out["chart"]["kind"] == "vega-lite" and out["reviewed"] and not out["revised"]
    assert out["caveats"] == ["Counts are unofficial."] and out["row_count"] > 5
    # the analyst call carries the cached catalog and the strict tool, and never forces a tool call
    first = msgs.create_calls[0]
    assert first["system"][0]["cache_control"] == {"type": "ephemeral"} and "## races" in first["system"][0]["text"]
    assert first["tools"][0]["strict"] is True and "tool_choice" not in first
    assert first["output_config"]["effort"] == "medium"


async def test_sql_error_goes_back_to_the_model_as_a_tool_error():
    ag, msgs = make([tool_turn("SELECT * FROM read_csv('/etc/hosts')"), tool_turn(SQL, "t2"), answer_turn()],
                    [parsed(BAR), parsed(PASS)])
    _, final = await run(ag)
    tool_result = msgs.create_calls[1]["messages"][-1]["content"][0]
    assert tool_result["is_error"] is True and "not allowed" in tool_result["content"]
    assert final["queries"][0]["error"]


async def test_verifier_sends_back_once_then_publishes_with_notes():
    revise = Verdict(verdict="revise", problems=["Filter to U.S. House only."], caveats_to_add=[])
    ag, msgs = make([answer_turn(), answer_turn("Fixed."), ],
                    [parsed(BAR), parsed(revise), parsed(BAR), parsed(revise)])
    _, final = await run(ag)
    assert final["revisions"] == 1
    assert "Filter to U.S. House only." in msgs.create_calls[1]["messages"][-1]["content"]
    out = final_payload(final, "x")
    assert out["answer"] == "Fixed." and any(c.startswith("Reviewer note:") for c in out["caveats"])


async def test_out_of_scope_skips_chart_and_review():
    ag, msgs = make([answer_turn("This data covers 2026 only.", "", True)], [])
    _, final = await run(ag, "Who won in 1996?")
    assert final_payload(final, "x")["out_of_scope"] and not msgs.parse_calls


async def test_bad_chart_spec_is_retried_with_the_error():
    bad = ChartSpec(type="bar", title="t", x="nope", y="races")
    ag, msgs = make([answer_turn()], [parsed(bad), parsed(BAR), parsed(PASS)])
    _, final = await run(ag)
    assert "Error:" in msgs.parse_calls[1]["messages"][0]["content"] and final["chart"]["kind"] == "vega-lite"


async def test_refusal_is_reported():
    ag, _ = make([NS(content=[], stop_reason="refusal", usage=usage())], [])
    with pytest.raises(AgentError):
        await run(ag)


def test_meter_prices_sonnet_tokens():
    m = Meter(1.0)
    cost = m.add(NS(input_tokens=1_000_000, output_tokens=100_000, cache_creation_input_tokens=0, cache_read_input_tokens=0))
    assert cost == pytest.approx(3.0) and not m.ok()


def test_output_schemas_transform_for_structured_outputs():
    # parse() runs these through the SDK's transformer; make sure ours survive it with no extras allowed
    for model in (ChartSpec, Verdict):
        schema = transform_schema(model.model_json_schema())
        assert schema["additionalProperties"] is False


async def test_sse_endpoint_streams_events_and_result():
    ag, _ = make([tool_turn(SQL), answer_turn()], [parsed(BAR), parsed(PASS)])
    main.agents = ag
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/ask", json={"question": "Which offices had the most races?"})
        bad = await c.post("/ask", json={"question": "x" * 600})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    assert events[0]["type"] == "start" and events[-1]["type"] == "done"
    assert events[-1]["result"]["chart"]["kind"] == "vega-lite"
    assert bad.status_code == 422
