"use client";

import { BarList, Dumbbell, ExitShiftChart, StackBars, VoteFlow } from "@/components/charts/charts";
import { Legend } from "@/components/charts/map";
import { FilterBar, Segmented, Select } from "@/components/controls";
import { Panel } from "@/components/ui";
import { useQueryState } from "@/lib/client";
import { margin, tickMargin } from "@/lib/format";
import type { ExitAnswer, ExitShift } from "@/lib/types";

export default function ExitExplorer({
  shift,
  flow,
  issue,
  approval,
  age,
}: {
  shift: ExitShift[];
  flow: ExitAnswer[];
  issue: ExitAnswer[];
  approval: ExitAnswer[];
  age: ExitAnswer[];
}) {
  const [cat, setCat] = useQueryState("group", "all");
  const [cmp, setCmp] = useQueryState("compare", "2022");
  const cats = [...new Set(shift.map((s) => s.category))];
  const rows = shift.filter((s) => cat === "all" || s.category === cat || s.category === "All voters");
  const issues = [...issue].sort((a, b) => b.share - a.share);
  const appr = [...approval].sort((a, b) => a.order - b.order);
  const bands = ["18-29", "30-44", "45-64", "65 or over"];
  const ageColors = ["#1e5c4f", "#25806b", "#2aa387", "var(--neutral)"];

  return (
    <div className="grid gap-4">
      <FilterBar>
        <Select label="Voter group" value={cat} onChange={setCat} options={[{ value: "all", label: "All groups" }, ...cats.filter((c) => c !== "All voters").map((c) => ({ value: c, label: c }))]} />
        <Segmented
          label="Compare 2026 House with"
          value={cmp}
          onChange={setCmp}
          options={[
            { value: "2022", label: "2022 House" },
            { value: "2024", label: "2024 president" },
          ]}
        />
      </FilterBar>

      <Panel label="How each group's vote moved" meta={`hollow: ${cmp} · filled: 2026`}>
        <ExitShiftChart rows={rows} compare={cmp === "2024" ? 2024 : 2022} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="2026 House vote by 2024 presidential vote" meta="column width = share of voters">
          <Legend
            items={[
              { color: "var(--dem)", label: "Voted D for House" },
              { color: "var(--rep)", label: "Voted R" },
              { color: "var(--mid)", label: "Other / no answer" },
            ]}
          />
          <VoteFlow rows={flow} />
        </Panel>
        <Panel label="The issue that mattered most" meta="share of voters · House margin among them">
          <BarList rows={issues.map((i) => ({ key: i.answer, label: i.answer, value: i.share, note: "of voters" }))} max={50} />
          <Dumbbell
            fmt={tickMargin}
            rows={issues.map((i) => ({
              key: i.answer,
              label: i.answer,
              a: 0,
              b: i.margin,
              color: i.margin >= 0 ? "var(--dem)" : "var(--rep)",
              right: margin(i.margin, 0),
              tip: [
                { text: i.answer, head: true },
                { text: `${i.share}% of voters · House ${margin(i.margin)}` },
              ],
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Trump job approval among 2026 voters">
          <StackBars
            bars={[{ label: "", parts: appr.map((a) => ({ key: a.answer, value: a.share })) }]}
            colors={["var(--amber)", "#9a7432", "#6f5aa8", "var(--oth)"]}
            keyLabels={appr.map((a) => a.answer)}
            notes={appr.map((a) => `House ${margin(a.margin, 0)}`)}
          />
        </Panel>
        <Panel label="Who voted, by age" meta="share of the electorate">
          <StackBars
            bars={[2022, 2026].map((y) => ({
              label: String(y),
              parts: bands.map((b) => ({ key: b, value: age.find((a) => a.year === y && a.answer === b)?.share ?? 0 })),
            }))}
            colors={ageColors}
            keyLabels={["18–29", "30–44", "45–64", "65+"]}
          />
        </Panel>
      </div>
    </div>
  );
}
