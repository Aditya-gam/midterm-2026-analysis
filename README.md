# 2026 Midterm Atlas

A visual analysis of the November 3, 2026 U.S. midterm elections: federal, state and local races,
ballot measures, turnout and exit polls. The charts live in a claude.ai dashboard
(https://claude.ai/artifact/LqVHJua1DdEJB8E9AW5UB5); this folder holds the pipeline that builds its data.

## Pipeline

Run from this folder with the project's virtual environment (`.venv`; `pipeline/requirements.txt`).

```bash
.venv/bin/python -I pipeline/fetch_civic.py --refresh      # all races, every state, from civicAPI (~25 min)
.venv/bin/python -I pipeline/fetch_baselines.py            # 2024 county results, turnout, demographics, exit polls
.venv/bin/python -I pipeline/build_geo.py                  # county and state outlines as SVG paths
.venv/bin/python -I pipeline/build_exit.py                 # NBC exit-poll tables
.venv/bin/python pipeline/build_results.py                 # every other analysis table
```

Outputs land in `data/processed/*.json`; each file is one dataset on the dashboard. The page itself is
`site/` (index.html, kit.js, national.js, more.js).

## Website (web/)

A static Next.js 16 site: a scrolling story, five explorers with URL filters (races, county map, ballot measures,
local offices, exit polls), 51 state pages and a methods page. D3 computes the charts; React draws them.

```bash
.venv/bin/python pipeline/export_web.py     # copy the analysis tables into web/public/data
cd web && npm install && npm run dev        # http://localhost:3000
npm run build                               # static site in web/out/, ready for Vercel or any static host
```

On Vercel, import the repository with Root Directory `web`. Set `NEXT_PUBLIC_ASK_API` to the Ask API's URL
(below); everything else is static. It is read at build time: a build without it shows the Ask page as "not
connected" (only `npm run dev` falls back to `http://localhost:8000`), so redeploy after setting it, and set it for
a local static build too (`NEXT_PUBLIC_ASK_API=http://localhost:8000 npm run build`).

## Ask the data (api/)

The site's Ask page lets readers type a question and get an answer with a chart. Three Claude Sonnet 5.5 agents
run in a LangGraph graph behind a FastAPI service:

| Agent | Job | How |
|---|---|---|
| Analyst | answers the question from the data | writes DuckDB SQL through a strict `run_sql` tool (up to 6 queries), returns `{answer, final_sql, caveats, out_of_scope}` as structured output |
| Chart designer | picks the chart | returns a small chart spec (type + column names); `api/app/charts.py` turns it into Vega-Lite in the site's colors, or a county or state map drawn by the site's own map components |
| Reviewer | checks before the reader sees it | compares the SQL, numbers, margin signs, caveats and chart against the question; can send the answer back to the analyst once |

Model-written SQL is never trusted: `api/app/guard.py` parses it (sqlglot) and allows one read-only SELECT over the
catalog tables, and the DuckDB connection itself is read-only with file and network access switched off and
locked. Each query has an 8-second limit. Progress streams to the browser as server-sent events.

```bash
.venv/bin/python pipeline/build_db.py          # data/midterms.duckdb, the database the agents query
cd api && ../.venv/bin/python -m pytest        # guard, chart builder, graph and endpoint tests (no API calls)
../.venv/bin/python dev_fake.py                # the API with scripted model replies: no key, no cost
ANTHROPIC_API_KEY=... ../.venv/bin/uvicorn app.main:app --port 8000   # the real thing
```

Limits for a public page: 4 questions a minute and 40 a day per IP, 3 answered at once, and a daily model-spend
cap (`DAILY_BUDGET_USD`, default $5) after which the API stops answering until the next UTC day. The cap is kept
in memory, so a restart resets it; set a spend limit in the Anthropic Console as the hard ceiling.

## Keeping data current

`.github/workflows/refresh-data.yml` refreshes race totals every 2 hours and county detail once a day, rebuilds
everything, publishes `data/midterms.duckdb` as the `data-latest` release asset, and commits `web/public/data`
(which redeploys the site). The API (`render.yaml`, Render free plan) downloads that asset at startup and checks
for a newer one every 30 minutes. On the free plan the API sleeps after 15 idle minutes and takes about a minute
to wake; the Ask page pings it when it opens.

## Dashboard preview (older claude.ai artifact)

The dashboard only runs inside claude.ai. To look at the page locally with a stand-in runtime and
approximate dark-theme colors:

```bash
.venv/bin/python -I pipeline/build_preview.py
python3 -m http.server 8777 --bind 127.0.0.1
```

Then open http://localhost:8777/preview/.

## Publishing a refresh

1. Upload each changed `data/processed/<id>.json` to the dashboard as an asset and put its `/_blob/...`
   link in `site/asset_urls.json`.
2. `.venv/bin/python -I pipeline/make_store_docs.py` writes every store document to `site/store/`.
3. Write the changed documents to the dashboard's store (`datasets/<id>`, `files/<name>`), each pinned
   to its current version.

## Sources

| Data | Source | License / terms |
|---|---|---|
| 2026 results (all levels) | civicAPI, https://civicapi.org | free; attribution required for non-personal use |
| 2024 and 2020 county presidential results | tonmcg/US_County_Level_Election_Results_08-24 | MIT |
| Eligible voters (VEP), 2022 turnout | UF Election Lab | public |
| County education, income, rural-urban codes | USDA Economic Research Service | public domain |
| Town-to-county lookup | U.S. Census Bureau, 2020 county subdivisions | public domain |
| County outlines | us-atlas 3.0.1 (Albers USA) | ISC |
| Exit polls 2022, 2024, 2026 | NBC News national exit polls | published tables; curated subset, credited |
| Ballot measure titles | Wikipedia, "2026 United States ballot measures" | CC BY-SA |

## Known data issues (found 2026-11-04)

- civicAPI's raw vote counts for New York are about three times too high (vote shares look right). New York is
  left out of turnout and national vote totals; its margins are still used.
- Mail-voting states (California, Washington, Oregon, Utah) report "100% of precincts" while ballots are still
  being counted, so their turnout reads low until counting ends.
- Alaska's 2024 results are reported by legislative district, so it has no county-level comparison.
- Several redrawn congressional maps (Texas, California, Florida, North Carolina, Ohio, Utah and others) make
  district-to-district comparisons with 2024 invalid; comparisons are made by county instead.
- 43 of 125 statewide measures are listed only by number in both sources, so their topic is "Not described
  in source". Topics come from each measure's title first, then its Wikipedia description.
- civicAPI had no state legislative counts yet for Indiana, North Carolina, South Carolina, Texas and the
  Kentucky Senate; Louisiana, Virginia and Mississippi hold legislative elections in odd years (specials only).
- civicAPI's incumbent flags are incomplete (about 50 House incumbents marked), so incumbency is not charted.
  Alaska races report 0% "reporting" while carrying votes.
- Large civicAPI responses fetched with Python's urllib were often cut off mid-transfer; the fetcher calls
  curl instead.
