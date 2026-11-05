"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dumbbell, RaceSwarm } from "@/components/charts/charts";
import { FilterBar, SearchBox, Segmented, Select } from "@/components/controls";
import { Panel, Stat } from "@/components/ui";
import { useQueryState } from "@/lib/client";
import { compact, int, margin, partyColor, pct, tickMargin } from "@/lib/format";
import type { FederalRace, StatewideVsPres } from "@/lib/types";

const OFFICES = [
  { value: "house", label: "House" },
  { value: "sen", label: "Senate" },
  { value: "gov", label: "Governor" },
];

export default function RacesExplorer({
  races,
  statewide,
  excluded,
}: {
  races: FederalRace[];
  statewide: StatewideVsPres[];
  excluded: string[];
}) {
  const [office, setOffice] = useQueryState("office", "house");
  const [state, setState] = useQueryState("state", "all");
  const [status, setStatus] = useQueryState("status", "all");
  const [winner, setWinner] = useQueryState("winner", "all");
  const [close, setClose] = useQueryState("close", "all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"close" | "state" | "margin">("close");

  const states = useMemo(() => [...new Map(races.map((r) => [r.state, r.state_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [races]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return races.filter(
      (r) =>
        r.office === (office === "statewide" ? r.office : office) &&
        (office !== "statewide" || r.office !== "house") &&
        (state === "all" || r.state === state) &&
        (status === "all" || (status === "called" ? r.called : !r.called)) &&
        (winner === "all" || r.winner_party === winner) &&
        (close === "all" || Math.abs(r.signed_margin ?? 100) < Number(close)) &&
        (!needle || [r.race, r.dem_name, r.rep_name, r.winner_name].some((v) => (v ?? "").toLowerCase().includes(needle))),
    );
  }, [races, office, state, status, winner, close, q]);

  const sorted = useMemo(() => {
    const s = [...rows];
    if (sort === "close") s.sort((a, b) => Math.abs(a.signed_margin ?? 999) - Math.abs(b.signed_margin ?? 999));
    else if (sort === "margin") s.sort((a, b) => (b.signed_margin ?? -999) - (a.signed_margin ?? -999));
    else s.sort((a, b) => a.state.localeCompare(b.state) || (a.district ?? 0) - (b.district ?? 0));
    return s;
  }, [rows, sort]);

  const d = rows.filter((r) => r.winner_party === "D").length;
  const rr = rows.filter((r) => r.winner_party === "R").length;
  const uncalled = rows.filter((r) => !r.called).length;
  const counted = rows.filter((r) => !excluded.includes(r.state));
  const votesD = counted.reduce((s, r) => s + r.dem_votes, 0);
  const votesR = counted.reduce((s, r) => s + r.rep_votes, 0);
  const votesT = counted.reduce((s, r) => s + r.total, 0);
  const left = excluded.filter((s) => rows.some((r) => r.state === s));
  const sv = statewide.filter((s) => (office === "statewide" || s.office === office) && (state === "all" || s.state === state));

  return (
    <div className="grid gap-4">
      <FilterBar>
        <Segmented label="Office" value={office} onChange={setOffice} options={[...OFFICES, { value: "statewide", label: "Senate + Gov" }]} />
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
            { value: "called", label: "Called" },
            { value: "uncalled", label: "Uncalled" },
          ]}
        />
        <Segmented
          label="Winner / leader"
          value={winner}
          onChange={setWinner}
          options={[
            { value: "all", label: "Any" },
            { value: "D", label: "Dem" },
            { value: "R", label: "GOP" },
          ]}
        />
        <Segmented
          label="Margin under"
          value={close}
          onChange={setClose}
          options={[
            { value: "all", label: "Any" },
            { value: "10", label: "10 pts" },
            { value: "5", label: "5 pts" },
            { value: "2", label: "2 pts" },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Candidate or race" />
      </FilterBar>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Races shown" value={int(rows.length)} sub={`${int(uncalled)} not yet called`} />
        <Stat label="Dem won/leading" value={int(d)} tone="dem" />
        <Stat label="GOP won/leading" value={int(rr)} tone="rep" />
        <Stat
          label="Combined vote"
          value={votesT ? margin((100 * (votesD - votesR)) / votesT) : "—"}
          sub={`${compact(votesT)} votes${left.length ? ` · excludes ${left.join(", ")} (inflated counts in source)` : ""}`}
        />
      </div>

      <Panel label="Every race by margin" meta="click a dot for its state">
        <RaceSwarm races={rows} onPick={(r) => (window.location.href = `/states/${r.state.toLowerCase()}/`)} />
      </Panel>

      {office !== "house" && (
        <Panel label="2026 result vs 2024 presidential margin" meta="gray: 2024 · color: 2026 leader">
          <Dumbbell
            fmt={tickMargin}
            rows={[...sv]
              .sort((a, b) => a.over - b.over)
              .map((s) => ({
                key: String(s.id),
                label: `${s.state} ${s.office === "sen" ? "SEN" : "GOV"}`,
                a: s.pres24,
                b: s.margin,
                color: partyColor(s.winner_party),
                hollow: !s.called,
                right: `${margin(s.over)} vs '24`,
                tip: [
                  { text: s.race, head: true },
                  { text: `${s.dem_name ?? "—"} (D) vs ${s.rep_name ?? "—"} (R)` },
                  { text: `2026 ${margin(s.margin)} · 2024 ${margin(s.pres24)}`, color: partyColor(s.winner_party) },
                ],
              }))}
          />
        </Panel>
      )}

      <Panel
        label={`Race table · ${int(sorted.length)}`}
        meta={
          <span className="flex gap-2">
            {(["close", "margin", "state"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSort(s)} className={sort === s ? "text-accent" : "hover:text-fg"}>
                {s === "close" ? "closest" : s === "margin" ? "most D" : "by state"}
              </button>
            ))}
          </span>
        }
      >
        <div className="max-h-[520px] overflow-auto">
          <table className="num w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-panel text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-normal">Race</th>
                <th className="py-1.5 pr-3 font-normal">Democrat</th>
                <th className="py-1.5 pr-3 font-normal">Republican</th>
                <th className="py-1.5 pr-3 text-right font-normal">Margin</th>
                <th className="py-1.5 pr-3 text-right font-normal">In</th>
                <th className="py-1.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-panel2">
                  <td className="py-1.5 pr-3">
                    <Link href={`/states/${r.state.toLowerCase()}/`} className="text-fg hover:text-accent">
                      {r.office === "house" ? `${r.state}-${String(r.district ?? 0).padStart(2, "0")}` : r.race.replace(r.state_name, r.state)}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">
                    {r.dem_name ?? "—"} {r.dem_pct != null && <span className="text-dem">{pct(r.dem_pct)}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-muted">
                    {r.rep_name ?? "—"} {r.rep_pct != null && <span className="text-rep">{pct(r.rep_pct)}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right" style={{ color: partyColor(r.winner_party) }}>
                    {margin(r.signed_margin)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-muted">{pct(r.reporting, 0)}</td>
                  <td className="py-1.5 text-muted">{r.called ? "called" : "counting"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
