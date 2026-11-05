"use client";

import { useMemo } from "react";
import { BarList, MarginHistograms } from "@/components/charts/charts";
import { Legend } from "@/components/charts/map";
import { FilterBar, Select } from "@/components/controls";
import { Panel, Stat } from "@/components/ui";
import { useQueryState } from "@/lib/client";
import { int } from "@/lib/format";
import type { Legislature, MarginBin, OfficeByState, StateInfo } from "@/lib/types";

export function LegislatureGrid({ rows }: { rows: Legislature[] }) {
  const byState = useMemo(() => {
    const m = new Map<string, Legislature[]>();
    for (const r of rows) m.set(r.state_name, [...(m.get(r.state_name) ?? []), r]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  if (!rows.length) return <p className="text-xs text-dim">No state legislative seats in this view.</p>;
  return (
    <div className="grid gap-x-5 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
      {byState.map(([name, chambers]) => (
        <div key={name} className="grid gap-1">
          <div className="text-xs font-medium text-fg">{name}</div>
          {[...chambers]
            .sort((a, b) => b.chamber.localeCompare(a.chamber))
            .map((c) => {
              const total = c.dem + c.rep + c.other;
              return (
                <div key={c.chamber} className="grid gap-0.5">
                  <div className="flex h-2.5 gap-[2px] overflow-hidden bg-panel2">
                    {total > 0 &&
                      (
                        [
                          [c.dem, "var(--dem)"],
                          [c.rep, "var(--rep)"],
                          [c.other, "var(--oth)"],
                        ] as const
                      ).map(([n, col], i) => (n > 0 ? <span key={i} style={{ flex: `${n} 0 0`, background: col }} /> : null))}
                  </div>
                  <div className="num text-[11px] text-muted">
                    {c.chamber.replace("State ", "")}: <span className="text-dem">D {c.dem}</span> · <span className="text-rep">R {c.rep}</span>
                    {c.other ? ` · other ${c.other}` : ""}
                    {total === 0 ? " · no counts yet" : ""}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

export default function LocalExplorer({
  states,
  offices,
  margins,
  legislatures,
}: {
  states: StateInfo[];
  offices: OfficeByState[];
  margins: MarginBin[];
  legislatures: Legislature[];
}) {
  const [state, setState] = useQueryState("state", "all");
  const [office, setOffice] = useQueryState("office", "all");
  const groups = useMemo(() => [...new Set(offices.map((o) => o.office))].sort(), [offices]);

  const agg = useMemo(() => {
    const m = new Map<string, { races: number; uncontested: number; measured: number; close: number }>();
    for (const o of offices) {
      if (state !== "all" && o.state !== state) continue;
      const a = m.get(o.office) ?? { races: 0, uncontested: 0, measured: 0, close: 0 };
      a.races += o.races;
      a.uncontested += o.uncontested;
      a.measured += o.measured;
      a.close += o.close;
      m.set(o.office, a);
    }
    return [...m.entries()].map(([k, v]) => ({ office: k, ...v })).sort((a, b) => b.uncontested / b.races - a.uncontested / a.races);
  }, [offices, state]);

  const panels = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    for (const b of margins) {
      if (state !== "all" && b.state !== state) continue;
      if (office !== "all" && b.office !== office) continue;
      const bins = m.get(b.office) ?? new Map<number, number>();
      bins.set(b.bin, (bins.get(b.bin) ?? 0) + b.races);
      m.set(b.office, bins);
    }
    return [...m.entries()].map(([title, bins]) => ({ title, bins: [...bins.entries()].map(([bin, races]) => ({ bin, races })) }));
  }, [margins, state, office]);

  const sel = agg.filter((a) => office === "all" || a.office === office);
  const races = sel.reduce((s, a) => s + a.races, 0);
  const unc = sel.reduce((s, a) => s + a.uncontested, 0);
  const measured = sel.reduce((s, a) => s + a.measured, 0);
  const close = sel.reduce((s, a) => s + a.close, 0);
  const leg = legislatures.filter((l) => state === "all" || l.state === state);

  return (
    <div className="grid gap-4">
      <FilterBar>
        <Select
          label="State"
          value={state}
          onChange={setState}
          options={[{ value: "all", label: "All states" }, ...states.map((s) => ({ value: s.state, label: s.name }))]}
        />
        <Select label="Office" value={office} onChange={setOffice} options={[{ value: "all", label: "All offices" }, ...groups.map((g) => ({ value: g, label: g }))]} />
      </FilterBar>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Races with results" value={int(races)} />
        <Stat label="No contest" value={races ? `${Math.round((100 * unc) / races)}%` : "—"} sub={`${int(unc)} races`} />
        <Stat label="Contested, counted" value={int(measured)} sub="single-seat, half or more counted" />
        <Stat label="Decided by < 5 pts" value={measured ? `${Math.round((100 * close) / measured)}%` : "—"} sub={`${int(close)} races`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Share of races with no contest" meta="no more candidates than seats">
          <BarList
            rows={agg.map((a) => ({
              key: a.office,
              label: a.office,
              value: (100 * a.uncontested) / a.races,
              note: `of ${int(a.races)}`,
              color: office === "all" || office === a.office ? "var(--neutral)" : "var(--line2)",
            }))}
          />
        </Panel>
        <Panel label="How close the contested races were" meta="winner's lead, 5-pt bins · amber: under 5">
          <MarginHistograms panels={panels} />
        </Panel>
      </div>

      <Panel label="State legislative seats on the ballot, won or leading" meta="seats decided this year, not full chambers">
        <Legend
          items={[
            { color: "var(--dem)", label: "Democrat" },
            { color: "var(--rep)", label: "Republican" },
            { color: "var(--oth)", label: "Other / nonpartisan" },
          ]}
        />
        <LegislatureGrid rows={leg} />
      </Panel>
    </div>
  );
}
