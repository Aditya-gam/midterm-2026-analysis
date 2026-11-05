"use client";

// Ask the data: a chat over the Ask API (api/app/main.py). Each question streams the agents' steps as
// server-sent events, then the reviewed answer, its chart, the SQL and the rows.
import { format as d3format, interpolateRgb, scaleSequential } from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountyMap, Legend, TileMap } from "@/components/charts/map";
import { VegaChart } from "@/components/charts/VegaChart";
import { Panel } from "@/components/ui";
import { useJson } from "@/lib/client";
import { asOf, binColor, DIVERGING, int, margin, MARGIN_BREAKS, pct, SHIFT_BREAKS } from "@/lib/format";
import type { GeoShape } from "@/lib/types";

// The API's address is fixed at build time. Only `next dev` falls back to a local API: a deployed build without
// NEXT_PUBLIC_ASK_API would otherwise send every visitor's questions to their own machine.
const API = (process.env.NEXT_PUBLIC_ASK_API ?? (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")).replace(/\/$/, "");
const CONNECTED = API !== "";
const MAX_LEN = 500;

const EXAMPLES = [
  "Which states moved most toward Democrats since 2024?",
  "Map the shift since 2024 by county in Pennsylvania",
  "Did turnout change more in states with a Senate race?",
  "Which ballot measure topics passed most often?",
  "How did counties shift by share of college graduates?",
  "How many school board races were uncontested, by state?",
];

type Cell = string | number | boolean | null;
type MapChart = {
  kind: "county_map" | "state_map";
  title: string;
  subtitle: string | null;
  scheme: "margin" | "sequential";
  format: "number" | "percent" | "margin" | "votes";
  value_title: string;
  values: { key: string; value: number | null; label: Cell }[];
};
type Chart =
  | { kind: "vega-lite"; title: string; subtitle: string | null; spec: object }
  | { kind: "table"; title: string; subtitle: string | null; columns: string[]; rows: Cell[][] }
  | MapChart;
type Result = {
  answer: string;
  out_of_scope: boolean;
  caveats: string[];
  sql: string | null;
  columns: string[];
  rows: Cell[][];
  row_count: number;
  chart: Chart | null;
  queries: { sql: string; row_count: number; error: string | null }[];
  reviewed: boolean;
  revised: boolean;
  data_as_of: string;
};
type Step = { agent?: string; text: string; sql?: string; error?: boolean };
type Turn = { id: number; question: string; steps: Step[]; result: Result | null; error: string | null; running: boolean };

const AGENT_LABEL: Record<string, string> = { analyst: "ANALYST", designer: "DESIGNER", verifier: "REVIEWER" };

function fmtValue(f: MapChart["format"]) {
  const g = d3format(",.4~g");
  return (v: number) => (f === "margin" ? margin(v) : f === "percent" ? pct(v) : f === "votes" ? int(v) : g(v));
}

function AskMap({ chart }: { chart: MapChart }) {
  const county = chart.kind === "county_map";
  const geo = useJson<GeoShape[]>(county ? "geo_counties" : null);
  const states = useJson<GeoShape[]>(county ? "geo_states" : null);
  const by = useMemo(() => new Map(chart.values.map((v) => [v.key, v])), [chart]);
  const nums = chart.values.map((v) => v.value).filter((v): v is number => v != null);
  const fmt = fmtValue(chart.format);
  const breaks = /shift|swing/i.test(chart.value_title) ? SHIFT_BREAKS : MARGIN_BREAKS;
  const seq = scaleSequential(interpolateRgb("#12322a", "#34e0a1")).domain([Math.min(...nums), Math.max(...nums)]);
  const color = (v: number) => (chart.scheme === "margin" ? binColor(v, breaks) : seq(v));
  const prefixes = new Set(chart.values.map((v) => v.key.slice(0, 2)));
  const focus = county && prefixes.size === 1 ? [...prefixes][0] : undefined;
  const legend =
    chart.scheme === "margin" ? (
      <Legend
        items={DIVERGING.map((c, i) => ({
          color: c,
          label: i === 0 ? `R ${-breaks[0]}+` : i === DIVERGING.length - 1 ? `D ${breaks[breaks.length - 1]}+` : i === 3 ? `±${breaks[3]}` : i < 3 ? `R ${-breaks[i]}–${-breaks[i - 1]}` : `D ${breaks[i - 1]}–${breaks[i]}`,
        }))}
      />
    ) : (
      <p className="num text-[11px] text-muted">
        {chart.value_title}: {fmt(Math.min(...nums))} <span className="inline-block h-2 w-16 align-middle" style={{ background: "linear-gradient(90deg,#12322a,#34e0a1)" }} /> {fmt(Math.max(...nums))}
      </p>
    );
  const tip = (key: string, name: string) => {
    const v = by.get(key);
    return v?.value != null
      ? [{ text: String(v.label ?? name), head: true }, { text: `${chart.value_title}: ${fmt(v.value)}` }]
      : [{ text: name, head: true }, { text: "no value" }];
  };
  return (
    <div className="grid gap-2">
      {legend}
      {county ? (
        <CountyMap geo={geo.data} states={states.data} focus={focus} valueOf={(f) => by.get(f)?.value} color={color} tipFor={tip} />
      ) : (
        <TileMap valueOf={(st) => by.get(st)?.value} color={color} label={fmt} tipFor={(st) => tip(st, st)} />
      )}
    </div>
  );
}

function DataTable({ columns, rows, max = 200 }: { columns: string[]; rows: Cell[][]; max?: number }) {
  return (
    <div className="max-h-96 overflow-auto border border-line">
      <table className="num w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-panel2 text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1 font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((v, j) => (
                <td key={j} className={`whitespace-nowrap px-2 py-1 ${typeof v === "number" ? "text-right" : ""}`}>
                  {v == null ? "—" : typeof v === "number" ? d3format(",.4~g")(v) : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <p className="px-2 py-1 text-[11px] text-dim">First {max} of {int(rows.length)} rows; download the CSV for all.</p>}
    </div>
  );
}

function downloadCsv(columns: string[], rows: Cell[][]) {
  const esc = (v: Cell) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const text = [columns, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "midterms-answer.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ResultView({ r }: { r: Result }) {
  const [showSql, setShowSql] = useState(false);
  const [showRows, setShowRows] = useState(false);
  const chart = r.chart;
  return (
    <div className="grid gap-3">
      <p className="max-w-3xl text-sm leading-relaxed text-fg">{r.answer}</p>
      {r.caveats.length > 0 && (
        <ul className="grid max-w-3xl gap-1 text-xs leading-relaxed text-amber">
          {r.caveats.map((c) => (
            <li key={c}>▲ {c}</li>
          ))}
        </ul>
      )}
      {chart && (
        <div className="min-w-0 border border-line bg-bg p-3">
          {chart.kind !== "vega-lite" && (
            <div className="mb-2">
              <div className="num text-sm text-fg">{chart.title}</div>
              {chart.subtitle && <div className="num text-[11px] text-muted">{chart.subtitle}</div>}
            </div>
          )}
          {chart.kind === "vega-lite" && <VegaChart spec={chart.spec} />}
          {(chart.kind === "county_map" || chart.kind === "state_map") && <AskMap chart={chart} />}
          {chart.kind === "table" && <DataTable columns={chart.columns} rows={chart.rows} />}
        </div>
      )}
      {!r.out_of_scope && (
        <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className={r.reviewed ? "text-accent" : "text-amber"}>
            {r.reviewed ? (r.revised ? "✓ checked by reviewer, revised once" : "✓ checked by reviewer") : "▲ reviewer flagged issues (see notes)"}
          </span>
          {r.sql && (
            <button type="button" className="underline underline-offset-2 hover:text-accent" onClick={() => setShowSql((s) => !s)}>
              {showSql ? "hide SQL" : "show SQL"}
            </button>
          )}
          {r.row_count > 0 && (
            <button type="button" className="underline underline-offset-2 hover:text-accent" onClick={() => setShowRows((s) => !s)}>
              {showRows ? "hide rows" : `rows (${int(r.row_count)})`}
            </button>
          )}
          {r.row_count > 0 && (
            <button type="button" className="underline underline-offset-2 hover:text-accent" onClick={() => downloadCsv(r.columns, r.rows)}>
              CSV
            </button>
          )}
          <span className="text-dim">data as of {asOf(r.data_as_of)}</span>
        </div>
      )}
      {showSql && r.sql && <pre className="num overflow-x-auto border border-line bg-panel2 p-2 text-[11px] leading-relaxed text-fg">{r.sql}</pre>}
      {showRows && <DataTable columns={r.columns} rows={r.rows} />}
    </div>
  );
}

function TurnView({ t, onStop }: { t: Turn; onStop: () => void }) {
  return (
    <Panel id={`turn-${t.id}`} className="scroll-mt-16" label={t.running ? "Working" : t.error ? "Error" : "Answer"} meta={t.running ? <button type="button" className="underline hover:text-accent" onClick={onStop}>stop</button> : undefined}>
      <p className="num text-sm text-accent">&gt; {t.question}</p>
      {(t.running || !t.result) && t.steps.length > 0 && (
        <ol className="num grid gap-1 text-[11px] leading-relaxed text-muted">
          {t.steps.map((s, i) => (
            <li key={i} className={s.error ? "text-rep" : undefined}>
              {s.agent && <span className="mr-2 text-dim">[{AGENT_LABEL[s.agent] ?? s.agent}]</span>}
              {s.sql ? <code className="break-all text-fg">{s.sql}</code> : s.text}
            </li>
          ))}
          {t.running && <li className="animate-pulse text-accent">▍</li>}
        </ol>
      )}
      {t.result && <ResultView r={t.result} />}
      {t.error && <p className="text-sm text-rep">{t.error}</p>}
      {t.result && t.steps.some((s) => s.sql) && (
        <details className="num text-[11px] text-dim">
          <summary className="cursor-pointer hover:text-accent">how this was answered ({t.steps.filter((s) => s.sql).length} queries)</summary>
          <ol className="mt-1 grid gap-1">
            {t.steps.map((s, i) => (
              <li key={i} className={s.error ? "text-rep" : undefined}>
                {s.agent && <span className="mr-2">[{AGENT_LABEL[s.agent] ?? s.agent}]</span>}
                {s.sql ? <code className="break-all text-muted">{s.sql}</code> : s.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Panel>
  );
}

export function AskView() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [server, setServer] = useState<{ state: "waking" | "ready" | "offline" | "paused" | "unset"; asOf?: string }>({
    state: CONNECTED ? "waking" : "unset",
  });
  const abort = useRef<AbortController | null>(null);
  const running = turns.some((t) => t.running);

  // Wake the server as soon as the page opens: free hosting sleeps when idle and takes up to a minute to start.
  useEffect(() => {
    if (!CONNECTED) return;
    let live = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90_000);
    fetch(`${API}/health`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((h: { data_as_of: string; answering: boolean }) => live && setServer({ state: h.answering ? "ready" : "paused", asOf: h.data_as_of }))
      .catch(() => live && setServer({ state: "offline" }))
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      ctl.abort();
    };
  }, []);

  // Bring the newest question to the top when it is asked and again when its answer lands: at the first moment the
  // page may not yet be tall enough to scroll it all the way up.
  const last = turns.at(-1);
  const lastKey = last ? `${last.id}:${last.running ? "run" : "done"}` : "";
  useEffect(() => {
    if (!lastKey) return;
    document.getElementById(`turn-${lastKey.split(":")[0]}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lastKey]);

  const update = (id: number, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? f(t) : t)));

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 3 || running || !CONNECTED) return;
    const id = Date.now();
    const context = turns
      .filter((t) => t.result && !t.result.out_of_scope)
      .slice(-3)
      .map((t) => ({ question: t.question, answer: t.result!.answer.slice(0, 2000), sql: t.result!.sql?.slice(0, 4000) ?? null }));
    setTurns((ts) => [...ts, { id, question: q, steps: [], result: null, error: null, running: true }]);
    setDraft("");
    const ctl = new AbortController();
    abort.current = ctl;
    const step = (s: Step) => update(id, (t) => ({ ...t, steps: [...t.steps, s] }));
    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, context }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        const msg =
          res.status === 429
            ? "You've hit the question limit for now (a few per minute, a few dozen per day). Try again shortly."
            : typeof body.detail === "string"
              ? body.detail
              : `The server answered ${res.status}.`;
        throw new Error(msg);
      }
      setServer((s) => ({ ...s, state: "ready" }));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "status") step({ agent: ev.agent, text: ev.text });
          else if (ev.type === "sql") step({ agent: "analyst", text: "", sql: ev.sql });
          else if (ev.type === "sql_result")
            step(ev.error ? { text: `error: ${ev.error}`, error: true } : { text: `→ ${int(ev.row_count)}${ev.more ? "+" : ""} rows` });
          else if (ev.type === "verdict")
            step({ agent: "verifier", text: ev.verdict === "pass" ? "No problems found" : `Sent back: ${ev.problems.join(" ")}` });
          else if (ev.type === "done") update(id, (t) => ({ ...t, result: ev.result, running: false }));
          else if (ev.type === "error") update(id, (t) => ({ ...t, error: ev.message, running: false }));
        }
      }
      update(id, (t) => (t.running ? { ...t, running: false, error: t.result ? null : "The answer stopped before it finished." } : t));
    } catch (e) {
      const stopped = ctl.signal.aborted;
      update(id, (t) => ({
        ...t,
        running: false,
        error: stopped ? "Stopped." : e instanceof TypeError ? "Couldn't reach the Ask server. It may be starting up; try again in a minute." : (e as Error).message,
      }));
    } finally {
      abort.current = null;
    }
  }

  return (
    <div className="grid gap-4">
      <div className="num flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${server.state === "ready" ? "bg-accent" : server.state === "waking" ? "animate-pulse bg-amber" : "bg-rep"}`}
          aria-hidden
        />
        {server.state === "ready" && <span>server ready · data as of {server.asOf ? asOf(server.asOf) : "—"}</span>}
        {server.state === "waking" && <span>waking the server (free hosting sleeps when idle; up to a minute)</span>}
        {server.state === "paused" && <span>today&apos;s question budget is used up; back tomorrow (UTC)</span>}
        {server.state === "offline" && <span>the Ask server isn&apos;t reachable right now</span>}
        {server.state === "unset" && <span>the Ask service isn&apos;t connected to this site yet</span>}
      </div>

      {turns.length === 0 && (
        <div className="grid gap-2">
          <p className="num text-[11px] uppercase tracking-wider text-dim">Try one</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                disabled={!CONNECTED}
                className="border border-line bg-panel px-2.5 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-fg"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((t) => (
        <TurnView key={t.id} t={t} onStop={() => abort.current?.abort()} />
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }} className="sticky bottom-0 z-20 grid gap-1 border-t border-line bg-bg/95 py-3 backdrop-blur">
        <div className="flex gap-2">
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <input
            id="ask-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            placeholder={turns.length ? "Ask a follow-up, e.g. “now just rural counties”" : "Ask about any race, county, measure or turnout figure"}
            className="num min-w-0 flex-1 border border-line2 bg-panel px-3 py-2 text-sm text-fg placeholder:text-dim focus:border-accent focus:outline-none"
            disabled={running || !CONNECTED}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={running || draft.trim().length < 3}
            className="num border border-accent px-4 text-xs uppercase tracking-wider text-accent hover:bg-accent hover:text-bg disabled:border-line2 disabled:text-dim disabled:hover:bg-transparent"
          >
            {running ? "…" : "Ask"}
          </button>
        </div>
        <p className="text-[11px] text-dim">
          Answers are written by AI (Claude) from this site&apos;s data and checked by a second AI step; they can still be wrong. Each answer shows its SQL. Don&apos;t
          enter personal information.
        </p>
      </form>
    </div>
  );
}
