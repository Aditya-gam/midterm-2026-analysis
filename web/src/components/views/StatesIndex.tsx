"use client";

import Link from "next/link";
import { TileMap } from "@/components/charts/map";
import { Segmented } from "@/components/controls";
import { Panel } from "@/components/ui";
import { useQueryState } from "@/lib/client";
import { binColor, margin, pct, SHIFT_BREAKS, signed } from "@/lib/format";
import type { StateInfo, StatewideVsPres, Turnout } from "@/lib/types";

export default function StatesIndex({ states, turnout, statewide }: { states: StateInfo[]; turnout: Turnout[]; statewide: StatewideVsPres[] }) {
  const [metric, setMetric] = useQueryState("color", "turnout");
  const t = new Map(turnout.map((x) => [x.state, x]));
  const top = new Map<string, StatewideVsPres>();
  for (const s of statewide) if (!top.has(s.state) || s.office === "sen") top.set(s.state, s);
  const info = new Map(states.map((s) => [s.state, s]));

  return (
    <div className="grid gap-4">
      <Panel
        label="Pick a state"
        meta={
          <Segmented
            label=""
            value={metric}
            onChange={setMetric}
            options={[
              { value: "turnout", label: "Turnout" },
              { value: "shift", label: "Top race vs 2024" },
            ]}
          />
        }
      >
        <TileMap
          valueOf={(st) => (metric === "turnout" ? t.get(st)?.turnout : top.get(st)?.over)}
          color={(v) =>
            metric === "turnout"
              ? `color-mix(in oklab, var(--neutral) ${Math.round(Math.min(100, Math.max(12, (v - 25) * 2.4)))}%, var(--panel2))`
              : binColor(v, SHIFT_BREAKS)
          }
          label={(v) => (metric === "turnout" ? `${Math.round(v)}%` : signed(v, 0))}
          tipFor={(st) => {
            const s = info.get(st);
            const tt = t.get(st);
            const tp = top.get(st);
            return [
              { text: s?.name ?? st, head: true },
              { text: tt ? `turnout ${pct(tt.turnout)}` : "turnout: no reliable count" },
              { text: tp ? `${tp.office === "sen" ? "Senate" : "governor"} ${margin(tp.margin)} (${margin(tp.over)} vs 2024)` : "no Senate or governor race" },
            ];
          }}
          hrefFor={(st) => `/states/${st.toLowerCase()}/`}
        />
      </Panel>
      <Panel label="All states">
        <div className="grid gap-x-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
          {states.map((s) => (
            <Link key={s.state} href={`/states/${s.state.toLowerCase()}/`} className="num flex justify-between border-b border-line py-1.5 text-xs hover:text-accent">
              <span className="text-fg">{s.name}</span>
              <span className="text-dim">
                {s.federal_races} fed · {s.local_races.toLocaleString("en-US")} local
              </span>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
