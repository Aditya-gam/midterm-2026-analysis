"use client";

import { useMemo, useState } from "react";
import { Dumbbell, measureTip, MeasureStrip, RaceSwarm } from "@/components/charts/charts";
import { Empty } from "@/components/charts/core";
import { CountyMap, Legend } from "@/components/charts/map";
import { FilterBar, SearchBox, Segmented, Select } from "@/components/controls";
import { Panel, Stat } from "@/components/ui";
import { LegislatureGrid } from "@/components/views/LocalExplorer";
import { useJson } from "@/lib/client";
import { binColor, compact, DIVERGING, int, MARGIN_BREAKS, margin, partyColor, pct, SHIFT_BREAKS, tickMargin, toward } from "@/lib/format";
import type { CountySwing, FederalRace, GeoShape, Legislature, LocalRace, Measure, StateInfo, StatewideVsPres, Turnout } from "@/lib/types";

const LEG7 = ["R 20+", "R 10–20", "R 3–10", "±3", "D 3–10", "D 10–20", "D 20+"];

export default function StateView({
  info,
  races,
  statewide,
  measures,
  legislature,
  turnout,
}: {
  info: StateInfo;
  races: FederalRace[];
  statewide: StatewideVsPres[];
  measures: Measure[];
  legislature: Legislature[];
  turnout: Turnout | null;
}) {
  const [metric, setMetric] = useState<"shift" | "m26">("shift");
  const geo = useJson<GeoShape[]>("geo_counties");
  const geoStates = useJson<GeoShape[]>("geo_states");
  const swing = useJson<CountySwing[]>("county_swing");
  const local = useJson<LocalRace[]>(`local/${info.state}`);
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");

  const by = useMemo(() => new Map((swing.data ?? []).filter((c) => c.state === info.state).map((c) => [c.fips, c])), [swing.data, info.state]);
  const house = races.filter((r) => r.office === "house");
  const top = races.filter((r) => r.office !== "house");
  const groups = useMemo(() => [...new Set((local.data ?? []).map((r) => r.group))].sort(), [local.data]);
  const localRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (local.data ?? []).filter((r) => {
      const contested = r.cands.length > r.seats;
      return (
        (group === "all" || r.group === group) &&
        (only === "all" || (only === "contested" ? contested : !contested)) &&
        (!needle || r.name.toLowerCase().includes(needle) || r.place.toLowerCase().includes(needle) || r.cands.some((c) => c[0].toLowerCase().includes(needle)))
      );
    });
  }, [local.data, group, only, q]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Turnout so far" value={turnout ? pct(turnout.turnout, 1) : "—"} sub={turnout?.turnout22 != null ? `2022: ${pct(turnout.turnout22)}` : "no reliable count"} />
        <Stat
          label="House seats D · R"
          value={`${house.filter((r) => r.winner_party === "D").length} · ${house.filter((r) => r.winner_party === "R").length}`}
          sub={`of ${info.house_seats} · won or leading`}
        />
        <Stat label="Statewide measures" value={int(measures.filter((m) => m.kind === "Ballot measure").length)} sub={`${measures.filter((m) => m.passed && m.kind === "Ballot measure").length} passing`} />
        <Stat label="Local races" value={int(info.local_races)} sub="all reported state and local contests" />
      </div>

      {top.length > 0 && (
        <Panel label="Senate and governor" meta="gray: 2024 president · color: 2026 leader">
          <div className="grid gap-2 sm:grid-cols-2">
            {top.map((r) => (
              <div key={r.id} className="border border-line bg-panel2 p-3">
                <div className="num text-[11px] uppercase tracking-wider text-muted">
                  {r.office === "sen" ? "U.S. Senate" : "Governor"} · {r.called ? "called" : "counting"} · {pct(r.reporting, 0)} in
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{r.winner_name ?? "—"}</span>
                  <span className="num text-lg" style={{ color: partyColor(r.winner_party) }}>
                    {margin(r.signed_margin)}
                  </span>
                </div>
                <div className="num mt-1 text-xs text-muted">
                  <span className="text-dem">{r.dem_name ?? "no Democrat"} {pct(r.dem_pct)}</span> ·{" "}
                  <span className="text-rep">{r.rep_name ?? "no Republican"} {pct(r.rep_pct)}</span> · {compact(r.total)} votes
                </div>
              </div>
            ))}
          </div>
          {statewide.length > 0 && (
            <Dumbbell
              fmt={tickMargin}
              rows={statewide.map((s) => ({
                key: String(s.id),
                label: s.office === "sen" ? "Senate" : "Governor",
                a: s.pres24,
                b: s.margin,
                color: partyColor(s.winner_party),
                hollow: !s.called,
                right: `${margin(s.over)} vs '24`,
                tip: [{ text: s.race, head: true }, { text: `2026 ${margin(s.margin)} · 2024 ${margin(s.pres24)}` }],
              }))}
            />
          )}
        </Panel>
      )}

      {house.length > 0 && (
        <Panel label={`House · ${house.length} districts`} meta="hollow: not yet called">
          <RaceSwarm races={house} />
          <div className="num grid gap-x-6 text-xs [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
            {house
              .sort((a, b) => (a.district ?? 0) - (b.district ?? 0))
              .map((r) => (
                <div key={r.id} className="flex justify-between gap-2 border-b border-line py-1">
                  <span className="truncate text-muted">
                    {info.state}-{String(r.district ?? 0).padStart(2, "0")} <span className="text-fg">{r.winner_name ?? "—"}</span>
                  </span>
                  <span style={{ color: partyColor(r.winner_party) }}>
                    {margin(r.signed_margin)}
                    {r.called ? "" : "*"}
                  </span>
                </div>
              ))}
          </div>
          <p className="text-[11px] text-dim">* not yet called</p>
        </Panel>
      )}

      <Panel
        label="Counties"
        meta={
          <Segmented
            label=""
            value={metric}
            onChange={(v) => setMetric(v as "shift" | "m26")}
            options={[
              { value: "shift", label: "Shift vs 2024" },
              { value: "m26", label: "2026 margin" },
            ]}
          />
        }
      >
        {info.state === "AK" ? (
          <Empty>Alaska reports 2024 results by legislative district, so there is no county comparison.</Empty>
        ) : by.size === 0 && swing.data ? (
          <Empty>No Senate or governor race with both parties here, so there is no county comparison.</Empty>
        ) : (
          <>
            <Legend items={(metric === "shift" ? LEG7 : ["R 40+", "R 20–40", "R 5–20", "±5", "D 5–20", "D 20–40", "D 40+"]).map((l, i) => ({ color: DIVERGING[i], label: l }))} />
            <CountyMap
              geo={geo.data}
              states={geoStates.data}
              focus={info.fips}
              valueOf={(f) => by.get(f)?.[metric]}
              color={(v) => binColor(v, metric === "shift" ? SHIFT_BREAKS : MARGIN_BREAKS)}
              tipFor={(f, name) => {
                const c = by.get(f);
                return c
                  ? [
                      { text: c.county, head: true },
                      { text: `2024 ${margin(c.m24)} → 2026 ${margin(c.m26)}` },
                      { text: toward(c.shift) },
                      { text: `${int(c.votes)} votes · ${c.area ?? ""}` },
                    ]
                  : [{ text: name, head: true }, { text: "no comparable race" }];
              }}
            />
          </>
        )}
      </Panel>

      {measures.length > 0 && (
        <Panel label={`Statewide measures · ${measures.length}`} meta="filled: passing · hollow: failing">
          <MeasureStrip measures={measures} />
          <div className="grid gap-1">
            {measures.map((m) => (
              <div key={m.id} className="grid gap-0.5 border-b border-line py-1.5 text-xs" title={measureTip(m).map((l) => l.text).join("\n")}>
                <div className="flex justify-between gap-3">
                  <span className="text-fg">{m.title ?? m.name}</span>
                  <span className={`num shrink-0 ${m.passed ? "text-accent" : "text-muted"}`}>
                    {pct(m.yes_pct)} yes · {m.status.toLowerCase()}
                  </span>
                </div>
                <span className="num text-[11px] text-dim">
                  {m.name} · {m.topic}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {legislature.length > 0 && (
        <Panel label="State legislative seats on the ballot" meta="won or leading">
          <LegislatureGrid rows={legislature} />
        </Panel>
      )}

      <Panel label={`Every local race · ${int(localRows.length)} shown`} meta="leaders shown; local winners are rarely called in the source">
        <FilterBar>
          <Select label="Office" value={group} onChange={setGroup} options={[{ value: "all", label: "All offices" }, ...groups.map((g) => ({ value: g, label: g }))]} />
          <Segmented
            label="Contest"
            value={only}
            onChange={setOnly}
            options={[
              { value: "all", label: "All" },
              { value: "contested", label: "Contested" },
              { value: "uncontested", label: "Uncontested" },
            ]}
          />
          <SearchBox value={q} onChange={setQ} placeholder="Office, place or candidate" />
        </FilterBar>
        {local.error ? (
          <Empty>Local races didn&apos;t load. Reload the page to try again.</Empty>
        ) : !local.data ? (
          <Empty>Loading local races…</Empty>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="num sticky top-0 bg-panel text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Race</th>
                  <th className="py-1.5 pr-3 font-normal">Leading</th>
                  <th className="py-1.5 pr-3 font-normal">Runner-up</th>
                  <th className="py-1.5 text-right font-normal">In</th>
                </tr>
              </thead>
              <tbody>
                {localRows.slice(0, 600).map((r) => {
                  const [a, b] = r.cands;
                  return (
                    <tr key={r.id} className="border-t border-line align-top hover:bg-panel2">
                      <td className="py-1.5 pr-3">
                        <div className="text-fg">{r.name}</div>
                        <div className="num text-[11px] text-dim">
                          {r.group}
                          {r.seats > 1 ? ` · ${r.seats} seats` : ""}
                          {r.cands.length <= r.seats ? " · uncontested" : ""}
                        </div>
                      </td>
                      <td className="num py-1.5 pr-3" style={{ color: a && a[1] !== "O" ? partyColor(a[1]) : undefined }}>
                        {a ? `${a[0]} ${pct(a[3])}` : "—"}
                      </td>
                      <td className="num py-1.5 pr-3 text-muted">{b ? `${b[0]} ${pct(b[3])}` : "—"}</td>
                      <td className="num py-1.5 text-right text-muted">{pct(r.reporting, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {localRows.length > 600 && <p className="num mt-2 text-[11px] text-dim">Showing the first 600; narrow the filters to see the rest.</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}
