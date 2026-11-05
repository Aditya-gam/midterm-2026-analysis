"use client";

import { useMemo } from "react";
import { Scatter, SwingTypes } from "@/components/charts/charts";
import { Empty } from "@/components/charts/core";
import { CountyMap, Legend } from "@/components/charts/map";
import { FilterBar, Segmented, Select } from "@/components/controls";
import { Panel, Stat } from "@/components/ui";
import { useJson, useQueryState } from "@/lib/client";
import { binColor, DIVERGING, int, margin, MARGIN_BREAKS, SHIFT_BREAKS, signed, tickMargin, toward } from "@/lib/format";
import type { CountySwing, GeoShape, StateInfo, SwingByType } from "@/lib/types";

const PLACES = ["Big metro", "Mid-size metro", "Small metro", "Small town", "Rural"];
const METRICS = {
  shift: { label: "Shift since 2024", breaks: SHIFT_BREAKS, legend: ["R 20+", "R 10–20", "R 3–10", "±3", "D 3–10", "D 10–20", "D 20+"] },
  m26: { label: "2026 margin", breaks: MARGIN_BREAKS, legend: ["R 40+", "R 20–40", "R 5–20", "±5", "D 5–20", "D 20–40", "D 40+"] },
  m24: { label: "2024 president", breaks: MARGIN_BREAKS, legend: ["R 40+", "R 20–40", "R 5–20", "±5", "D 5–20", "D 20–40", "D 40+"] },
} as const;
type Metric = keyof typeof METRICS;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};

export default function MapExplorer({ states, types }: { states: StateInfo[]; types: SwingByType[] }) {
  const [metricQ, setMetric] = useQueryState("metric", "shift");
  const [state, setState] = useQueryState("state", "all");
  const [place, setPlace] = useQueryState("place", "all");
  const metric: Metric = metricQ in METRICS ? (metricQ as Metric) : "shift";
  const geo = useJson<GeoShape[]>("geo_counties");
  const geoStates = useJson<GeoShape[]>("geo_states");
  const swing = useJson<CountySwing[]>("county_swing");

  const all = useMemo(() => swing.data ?? [], [swing.data]);
  const by = useMemo(() => new Map(all.map((c) => [c.fips, c])), [all]);
  const shown = all.filter((c) => (state === "all" || c.state === state) && (place === "all" || c.area === place));
  const focus = state === "all" ? undefined : states.find((s) => s.state === state)?.fips;
  const med = median(shown.map((c) => c.shift));
  const towardD = shown.filter((c) => c.shift > 0).length;
  const movers = [...shown].sort((a, b) => b.shift - a.shift);
  const m = METRICS[metric];

  return (
    <div className="grid gap-4">
      <FilterBar>
        <Segmented
          label="Color by"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRICS) as Metric[]).map((k) => ({ value: k, label: METRICS[k].label }))}
        />
        <Select
          label="State"
          value={state}
          onChange={setState}
          options={[{ value: "all", label: "Whole country" }, ...states.map((s) => ({ value: s.state, label: s.name }))]}
        />
        <Select
          label="Kind of place"
          value={place}
          onChange={setPlace}
          options={[{ value: "all", label: "All counties" }, ...PLACES.map((p) => ({ value: p, label: p }))]}
        />
      </FilterBar>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Counties shown" value={swing.data ? int(shown.length) : "…"} />
        <Stat label="Moved toward Dems" value={shown.length ? `${Math.round((100 * towardD) / shown.length)}%` : "—"} tone="dem" />
        <Stat label="Median shift" value={med == null ? "—" : signed(med)} sub={med == null ? undefined : toward(med)} />
        <Stat label="Votes counted" value={int(shown.reduce((s, c) => s + c.votes, 0))} />
      </div>

      <Panel label={`County map · ${m.label}`} meta={place === "all" ? "hover a county" : `${place} counties highlighted`}>
        <Legend
          items={[...m.legend.map((l, i) => ({ color: DIVERGING[i], label: l })), { color: "var(--line2)", label: "no comparable race", outline: true }]}
        />
        {swing.error ? (
          <Empty>The map data didn&apos;t load. Reload the page to try again.</Empty>
        ) : (
          <CountyMap
            geo={geo.data}
            states={geoStates.data}
            focus={focus}
            valueOf={(f) => by.get(f)?.[metric]}
            color={(v) => binColor(v, m.breaks)}
            dimmed={place === "all" ? undefined : (f) => by.get(f)?.area !== place}
            tipFor={(f, name) => {
              const c = by.get(f);
              return c
                ? [
                    { text: `${c.county}, ${c.state}`, head: true },
                    { text: `2024 president ${margin(c.m24)}` },
                    { text: `2026 ${c.office === "sen" ? "Senate" : "governor"} ${margin(c.m26)}` },
                    { text: toward(c.shift), color: binColor(c.shift, SHIFT_BREAKS) },
                    { text: `${c.area ?? "—"} · ${int(c.votes)} votes` },
                  ]
                : [{ text: name, head: true }, { text: "no comparable race" }];
            }}
          />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="2024 president vs 2026 margin" meta="above the line = moved toward Dems">
          <Scatter
            points={shown.map((c) => ({
              key: c.fips,
              x: c.m24,
              y: c.m26,
              r: Math.max(1.5, Math.sqrt(c.votes) / 70),
              color: "var(--neutral)",
              tip: [
                { text: `${c.county}, ${c.state}`, head: true },
                { text: `2024 ${margin(c.m24)} → 2026 ${margin(c.m26)}` },
                { text: toward(c.shift) },
              ],
            }))}
            xDomain={[-100, 100]}
            yDomain={[-100, 100]}
            fmtX={tickMargin}
            fmtY={tickMargin}
            xLabel="2024 margin"
            yLabel="2026 margin"
            diagonal
          />
        </Panel>
        <Panel label="Biggest movers" meta={state === "all" ? "national" : state}>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: "Toward Democrats", list: movers.slice(0, 10), tone: "text-dem" },
              { title: "Toward Republicans", list: movers.slice(-10).reverse(), tone: "text-rep" },
            ].map((g) => (
              <div key={g.title} className="min-w-0">
                <div className="num mb-1 text-[11px] uppercase tracking-wider text-muted">{g.title}</div>
                <ol className="num grid gap-1 text-xs">
                  {g.list.map((c) => (
                    <li key={c.fips} className="flex justify-between gap-2 border-b border-line py-1">
                      <span className="truncate text-fg">
                        {c.county}, {c.state}
                      </span>
                      <span className={g.tone}>{signed(c.shift)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel label="Which kinds of places moved most" meta="national · median and middle half of counties">
        <SwingTypes rows={types} />
      </Panel>
    </div>
  );
}
