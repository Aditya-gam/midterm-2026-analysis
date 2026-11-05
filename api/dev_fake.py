"""Run the Ask API with scripted model responses, for working on the website without an API key or any cost.

Everything except the model is real: the FastAPI app, the LangGraph graph, the SQL guard, DuckDB and the chart
builder. Questions are matched by keyword to a scripted analyst/designer/reviewer exchange.

    ../.venv/bin/python dev_fake.py      # serves http://localhost:8000
"""
from __future__ import annotations

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace as NS

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app import main  # noqa: E402
from app.agents import AnalystAnswer, Agents, Verdict  # noqa: E402
from app.charts import ChartSpec  # noqa: E402

U = NS(input_tokens=0, output_tokens=0, cache_creation_input_tokens=0, cache_read_input_tokens=0)

SCRIPTS = [
    ("map", "SELECT fips, county, shift AS shift_pts FROM county_shift WHERE state = 'PA'",
     "Every Pennsylvania county with a comparable race moved toward Democrats; the median shift was about 10 points.",
     ChartSpec(type="county_map", title="Pennsylvania counties moved toward Democrats", subtitle="Shift since 2024, D-minus-R points",
               geo="fips", y="shift_pts", label="county", value_format="margin")),
    ("turnout", "SELECT state, turnout_pct FROM turnout ORDER BY turnout_pct DESC",
     "Turnout ranged widely by state; the table and map show each state's share of eligible voters who voted.",
     ChartSpec(type="state_map", title="Turnout by state", subtitle="Votes counted so far / eligible voters, %", geo="state",
               y="turnout_pct", value_format="percent")),
    ("college", "SELECT county, state, bachelors_pct, shift AS shift_pts, votes FROM county_shift WHERE bachelors_pct IS NOT NULL",
     "Counties with more college graduates moved further toward Democrats, but every kind of county moved the same way.",
     ChartSpec(type="scatter", title="More college graduates, bigger shift toward Democrats",
               subtitle="Each dot is a county; shift in D-minus-R points since 2024", x="bachelors_pct", y="shift_pts",
               size="votes", label="county", color="shift_pts", value_format="margin")),
    ("", "SELECT state, round(median(shift), 1) AS median_shift_pts, count(*) AS counties FROM county_shift "
         "GROUP BY state HAVING count(*) >= 5 ORDER BY median_shift_pts DESC LIMIT 20",
     "Every state with comparable county results moved toward Democrats since 2024; the twenty largest median county shifts are shown.",
     ChartSpec(type="bar", title="The biggest median county shifts toward Democrats",
               subtitle="Median county shift since 2024, D-minus-R points", x="state", y="median_shift_pts", value_format="margin")),
]


class ScriptedMessages:
    """Answers each call from the script that matches the question; sleeps so the stream looks like the real one."""

    async def create(self, **kw):
        msgs = kw["messages"]
        question = msgs[0]["content"].rsplit("Question:", 1)[-1].lower()
        _, sql, answer, _ = next(s for s in SCRIPTS if s[0] in question)
        await asyncio.sleep(1.2)
        if "1996" in question or "weather" in question:
            text = AnalystAnswer(answer="This database covers the 2026 election (with 2020-2024 baselines), so it can't answer that.",
                                 final_sql="", caveats=[], out_of_scope=True).model_dump_json()
            return NS(content=[NS(type="text", text=text)], stop_reason="end_turn", usage=U)
        if len(msgs) == 1:  # first turn: look at the data
            return NS(content=[NS(type="tool_use", id="t1", name="run_sql", input={"sql": sql})], stop_reason="tool_use", usage=U)
        text = AnalystAnswer(answer=answer, final_sql=sql, caveats=["Counts are unofficial and still changing."],
                             out_of_scope=False).model_dump_json()
        return NS(content=[NS(type="text", text=text)], stop_reason="end_turn", usage=U)

    async def parse(self, **kw):
        await asyncio.sleep(0.8)
        content = kw["messages"][0]["content"]
        if kw["output_format"] is ChartSpec:
            question = content.split("\n")[0].lower()
            return NS(parsed_output=next(s for s in SCRIPTS if s[0] in question)[3], stop_reason="end_turn", usage=U)
        return NS(parsed_output=Verdict(verdict="pass", problems=[], caveats_to_add=[]), stop_reason="end_turn", usage=U)


if __name__ == "__main__":
    main.agents = Agents(main.db, main.meter, client=NS(messages=ScriptedMessages()))
    @asynccontextmanager
    async def keep_scripted(_):  # the real lifespan would replace the scripted agents with real ones
        yield

    main.app.router.lifespan_context = keep_scripted
    uvicorn.run(main.app, host="127.0.0.1", port=8000)
