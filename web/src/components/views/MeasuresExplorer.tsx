"use client";

import { useMemo, useState } from "react";
import { BarList, MeasureStrip, measureTip, Scatter } from "@/components/charts/charts";
import { FilterBar, SearchBox, Segmented, Select } from "@/components/controls";
import { Panel, Stat } from "@/components/ui";
import { useQueryState } from "@/lib/client";
import { int, pct, tickMargin } from "@/lib/format";
import type { LocalMeasures, Measure, MeasureCounty, MeasureFeatured } from "@/lib/types";

export default function MeasuresExplorer({
  measures,
  local,
  featured,
  counties,
}: {
  measures: Measure[];
  local: LocalMeasures[];
  featured: MeasureFeatured | null;
  counties: MeasureCounty[];
}) {
  const [kind, setKind] = useQueryState("kind", "Ballot measure");
  const [topic, setTopic] = useQueryState("topic", "all");
  const [state, setState] = useQueryState("state", "all");
  const [status, setStatus] = useQueryState("status", "all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Measure | null>(null);

  const topics = useMemo(() => [...new Set(measures.filter((m) => m.kind === "Ballot measure").map((m) => m.topic))].sort(), [measures]);
  const states = useMemo(() => [...new Map(measures.map((m) => [m.state, m.state_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [measures]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return measures.filter(
      (m) =>
        (kind === "all" || m.kind === kind) &&
        (topic === "all" || m.topic === topic) &&
        (state === "all" || m.state === state) &&
        (status === "all" || m.status === status) &&
        (!needle || [m.name, m.title, m.description, m.state_name].some((v) => (v ?? "").toLowerCase().includes(needle))),
    );
  }, [measures, kind, topic, state, status, q]);
  const passing = rows.filter((m) => m.passed).length;
  const show = picked && rows.includes(picked) ? picked : null;

  return (
    <div className="grid gap-4">
      <FilterBar>
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "Ballot measure", label: "Measures" },
            { value: "Judicial retention", label: "Judge retention" },
            { value: "all", label: "Both" },
          ]}
        />
        <Select label="Topic" value={topic} onChange={setTopic} options={[{ value: "all", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]} />
        <Select
          label="State"
          value={state}
          onChange={setState}
          options={[{ value: "all", label: "All states" }, ...states.map(([v, l]) => ({ value: v, label: l }))]}
        />
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "Passing", label: "Passing" },
            { value: "Failing", label: "Failing" },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Title, state or words in the description" />
      </FilterBar>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Measures shown" value={int(rows.length)} />
        <Stat label="Passing so far" value={int(passing)} sub={rows.length ? `${Math.round((100 * passing) / rows.length)}%` : undefined} />
        <Stat label="Failing so far" value={int(rows.length - passing)} />
        <Stat label="States" value={int(new Set(rows.map((m) => m.state)).size)} />
      </div>

      <Panel label="Every measure by topic and Yes share" meta="filled: passing · hollow: failing · click a dot">
        <MeasureStrip measures={rows} onPick={setPicked} />
        {show && (
          <div className="border border-line2 bg-panel2 p-3 text-sm">
            <div className="num text-[11px] uppercase tracking-wider text-accent">
              {show.state_name} · {show.topic}
            </div>
            <div className="mt-1 font-medium">{show.title ?? show.name}</div>
            {show.description && <p className="mt-1 text-xs leading-relaxed text-muted">{show.description}</p>}
            <div className="num mt-2 text-xs text-muted">
              Yes {pct(show.yes_pct)} · needs over {show.threshold}% · {show.status.toLowerCase()} · {pct(show.reporting, 0)} reporting
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Yes share vs the state's 2024 vote" meta="little relation to party">
          <Scatter
            points={rows
              .filter((m) => m.yes_pct != null && m.pres24 != null)
              .map((m) => ({
                key: String(m.id),
                x: m.pres24 ?? 0,
                y: m.yes_pct ?? 0,
                hollow: !m.passed,
                color: "var(--neutral)",
                tip: measureTip(m),
              }))}
            yDomain={[0, 100]}
            fmtX={tickMargin}
            fmtY={(v) => `${v}%`}
            xLabel="2024 presidential margin"
            yLabel="Yes share"
            refY={50}
          />
        </Panel>
        {featured && (
          <Panel label={`Crossed party lines: ${featured.name}`} meta={featured.state}>
            <p className="text-xs leading-relaxed text-muted">{featured.summary}</p>
            <Scatter
              points={counties.map((c) => ({
                key: c.fips,
                x: c.trump24,
                y: c.yes_pct,
                r: Math.max(2, Math.sqrt(c.votes) / 60),
                color: "var(--amber)",
                tip: [
                  { text: c.county, head: true },
                  { text: `Yes ${pct(c.yes_pct)} · Trump 2024 ${pct(c.trump24)}` },
                  { text: `${int(c.votes)} votes` },
                ],
              }))}
              fmtX={(v) => `${v}%`}
              fmtY={(v) => `${v}%`}
              xLabel="Trump share 2024"
              yLabel="Yes share"
              refY={50}
              height={320}
            />
          </Panel>
        )}
      </div>

      <Panel label="Local ballot questions: how often they pass" meta="city, county, school and district questions">
        <BarList
          rows={local.map((l) => ({ key: l.kind, label: l.kind, value: l.pass_rate ?? 0, note: `of ${int(l.measures)} passing` }))}
        />
      </Panel>

      <Panel label={`Measure table · ${int(rows.length)}`}>
        <div className="max-h-[520px] overflow-auto">
          <table className="num w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-panel text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-normal">State</th>
                <th className="py-1.5 pr-3 font-normal">Measure</th>
                <th className="py-1.5 pr-3 font-normal">Topic</th>
                <th className="py-1.5 pr-3 text-right font-normal">Yes</th>
                <th className="py-1.5 pr-3 font-normal">Status</th>
                <th className="py-1.5 text-right font-normal">In</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))
                .map((m) => (
                  <tr key={m.id} className="border-t border-line align-top hover:bg-panel2" onClick={() => setPicked(m)}>
                    <td className="py-1.5 pr-3">{m.state}</td>
                    <td className="py-1.5 pr-3 font-sans text-fg">
                      {m.name}
                      {m.title && <div className="text-[11px] text-dim">{m.title}</div>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{m.topic}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(m.yes_pct)}</td>
                    <td className={`py-1.5 pr-3 ${m.passed ? "text-accent" : "text-muted"}`}>{m.status}</td>
                    <td className="py-1.5 text-right text-muted">{pct(m.reporting, 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
