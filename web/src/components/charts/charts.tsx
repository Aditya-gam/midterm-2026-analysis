// Chart components. Client-only: imported from client views, never from Server Components.
import * as d3 from "d3";
import { useMemo } from "react";
import { compact, int, margin, partyColor, partyName, pct, signed, tickMargin, toward } from "@/lib/format";
import type { ExitAnswer, ExitShift, FederalRace, Measure, SwingByType } from "@/lib/types";
import { ChartFrame, dodge, Empty, HoverLayer, maxTextW, type Pt, type TipLine, XGrid, YGrid } from "./core";

/* ---------------------------------------------------------------- House races beeswarm */

export function RaceSwarm({ races, onPick }: { races: FederalRace[]; onPick?: (r: FederalRace) => void }) {
  const rows = races.filter((r) => r.signed_margin != null);
  if (!rows.length) return <Empty>No races match these filters.</Empty>;
  return (
    <ChartFrame minHeight={200}>
      {(w, tip) => <RaceSwarmInner rows={rows} w={w} tip={tip} onPick={onPick} />}
    </ChartFrame>
  );
}

function RaceSwarmInner({
  rows,
  w,
  tip,
  onPick,
}: {
  rows: FederalRace[];
  w: number;
  tip: Parameters<typeof HoverLayer>[0]["tip"];
  onPick?: (r: FederalRace) => void;
}) {
  const r = rows.length > 150 ? (w < 560 ? 2.6 : 4) : w < 560 ? 4 : 6;
  const step = 2 * r + 1;
  const lim = Math.min(100, Math.ceil((d3.max(rows, (d) => Math.abs(d.signed_margin ?? 0)) ?? 60) / 10) * 10);
  const pad = { l: 12, r: 12, t: 8, b: 28 };
  const x = d3.scaleLinear([-lim, lim], [pad.l + r, w - pad.r - r]).clamp(true);
  const placed = useMemo(() => dodge(rows, (d) => x(d.signed_margin ?? 0), step), [rows, x, step]);
  const half = Math.max(d3.max(placed, (p) => Math.abs(p.oy)) ?? 0, 3 * step);
  const h = pad.t + 2 * half + 2 * r + pad.b;
  const cy = pad.t + half + r;
  const pts: Pt<FederalRace>[] = placed.map((p) => ({ x: p.x, y: cy + p.oy, d: p.d }));
  return (
    <svg width={w} height={h} role="img" aria-label="Races placed by margin">
      <XGrid x={x} ticks={x.ticks(w < 560 ? 4 : 8)} top={pad.t} bottom={h - pad.b + 2} fmt={tickMargin} />
      {pts.map((p) => {
        const c = partyColor(p.d.winner_party);
        return (
          <circle
            key={p.d.id}
            cx={p.x}
            cy={p.y}
            r={r}
            fill={p.d.called ? c : "var(--bg)"}
            stroke={p.d.called ? "var(--bg)" : c}
            strokeWidth={p.d.called ? 0.8 : 1.5}
          />
        );
      })}
      <HoverLayer
        pts={pts}
        width={w}
        height={h}
        radius={3 * r + 4}
        tip={tip}
        onPick={onPick}
        lines={(d) => [
          { text: d.race, head: true },
          {
            text: `${d.winner_name ?? "—"} (${d.winner_party ?? "?"}) ${d.called ? "won" : "leads"}`,
            color: partyColor(d.winner_party),
          },
          { text: `${margin(d.signed_margin)} · ${pct(d.reporting, 0)} reporting` },
        ]}
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- Dumbbell rows */

export interface DumbbellRow {
  key: string;
  label: string;
  a: number | null;
  b: number;
  color: string;
  hollow?: boolean;
  right: string;
  highlight?: boolean;
  tip: TipLine[];
}

export function Dumbbell({
  rows,
  fmt,
  rowH = 20,
  zero = true,
}: {
  rows: DumbbellRow[];
  fmt: (v: number) => string;
  rowH?: number;
  zero?: boolean;
}) {
  if (!rows.length) return <Empty>Nothing to show for these filters.</Empty>;
  return (
    <ChartFrame minHeight={rows.length * rowH + 30}>
      {(w, tip) => {
        const lw = Math.min(180, maxTextW(rows.map((r) => r.label)) + 10);
        const rw = Math.min(140, maxTextW(rows.map((r) => r.right)) + 10);
        const vals = rows.flatMap((r) => (r.a == null ? [r.b] : [r.a, r.b]));
        const x = d3.scaleLinear(d3.extent(zero ? [...vals, 0] : vals) as [number, number], [lw, w - rw]).nice();
        const h = rows.length * rowH + 28;
        return (
          <svg width={w} height={h} role="img">
            <XGrid x={x} ticks={x.ticks(w < 560 ? 4 : 7)} top={0} bottom={h - 26} fmt={fmt} />
            {rows.map((r, i) => {
              const y = i * rowH + rowH / 2;
              return (
                <g key={r.key} opacity={rows.some((q) => q.highlight) && !r.highlight ? 0.35 : 1}>
                  <text x={lw - 8} y={y + 4} textAnchor="end" className="strong">
                    {r.label}
                  </text>
                  {r.a != null && (
                    <>
                      <line x1={x(r.a)} x2={x(r.b)} y1={y} y2={y} stroke={r.color} strokeOpacity={0.5} strokeWidth={2} />
                      <circle cx={x(r.a)} cy={y} r={3.5} fill="var(--dim)" />
                    </>
                  )}
                  <circle
                    cx={x(r.b)}
                    cy={y}
                    r={4.5}
                    fill={r.hollow ? "var(--bg)" : r.color}
                    stroke={r.hollow ? r.color : "var(--bg)"}
                    strokeWidth={r.hollow ? 1.8 : 1}
                  />
                  <text x={w - rw + 8} y={y + 4}>
                    {r.right}
                  </text>
                  <rect
                    x={0}
                    y={y - rowH / 2}
                    width={w}
                    height={rowH}
                    fill="transparent"
                    onPointerMove={(e) => tip.show(e, r.tip)}
                  />
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Shift by kind of county */

export function SwingTypes({ rows }: { rows: SwingByType[] }) {
  const dims = [...new Set(rows.map((r) => r.dimension))];
  const rowH = 20;
  const headH = 24;
  return (
    <ChartFrame minHeight={dims.length * headH + rows.length * rowH + 30}>
      {(w, tip) => {
        const lw = maxTextW(rows.map((r) => r.group)) + 12;
        const x = d3
          .scaleLinear(d3.extent(rows.flatMap((r) => [r.p25, r.p75, 0])) as [number, number], [lw, w - 52])
          .nice();
        const h = dims.length * headH + rows.length * rowH + 28;
        let y = 0;
        const out: React.ReactNode[] = [];
        for (const dim of dims) {
          out.push(
            <text key={`h-${dim}`} x={0} y={y + 16} className="strong" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
              {dim}
            </text>,
          );
          y += headH;
          for (const r of rows.filter((q) => q.dimension === dim).sort((a, b) => a.order - b.order)) {
            const cy = y + rowH / 2;
            out.push(
              <g key={`${dim}-${r.group}`}>
                <text x={lw - 10} y={cy + 4} textAnchor="end">
                  {r.group}
                </text>
                <rect x={x(r.p25)} y={cy - 3} width={Math.max(2, x(r.p75) - x(r.p25))} height={6} fill="var(--line2)" rx={3} />
                <circle cx={x(r.median_shift)} cy={cy} r={5} fill="var(--accent)" stroke="var(--bg)" />
                <text x={w - 44} y={cy + 4}>
                  {signed(r.median_shift)}
                </text>
                <rect
                  x={0}
                  y={y}
                  width={w}
                  height={rowH}
                  fill="transparent"
                  onPointerMove={(e) =>
                    tip.show(e, [
                      { text: `${dim}: ${r.group}`, head: true },
                      { text: `median county ${toward(r.median_shift)}` },
                      { text: `middle half ${signed(r.p25)} to ${signed(r.p75)}` },
                      { text: `vote-weighted ${toward(r.weighted_shift)} · ${int(r.counties)} counties` },
                    ])
                  }
                />
              </g>,
            );
            y += rowH;
          }
        }
        return (
          <svg width={w} height={h} role="img">
            <XGrid x={x} ticks={x.ticks(5)} top={0} bottom={h - 26} fmt={(t) => (t === 0 ? "0" : signed(t, 0))} />
            {out}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Scatter */

export interface ScatterPoint {
  key: string;
  x: number;
  y: number;
  r?: number;
  color?: string;
  hollow?: boolean;
  label?: string;
  tip: TipLine[];
}

export function Scatter({
  points,
  xDomain,
  yDomain,
  fmtX,
  fmtY,
  xLabel,
  yLabel,
  diagonal,
  refY,
  height = 380,
}: {
  points: ScatterPoint[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  fmtX: (v: number) => string;
  fmtY: (v: number) => string;
  xLabel: string;
  yLabel: string;
  diagonal?: boolean;
  refY?: number;
  height?: number;
}) {
  if (!points.length) return <Empty>No points for these filters.</Empty>;
  return (
    <ChartFrame minHeight={height}>
      {(w, tip) => {
        const h = Math.min(height, Math.max(240, w * 0.8));
        const pad = { l: 46, r: 12, t: 12, b: 32 };
        const x = d3.scaleLinear(xDomain ?? (d3.extent(points, (p) => p.x) as [number, number]), [pad.l, w - pad.r]).nice();
        const y = d3.scaleLinear(yDomain ?? (d3.extent(points, (p) => p.y) as [number, number]), [h - pad.b, pad.t]).nice();
        const pts: Pt<ScatterPoint>[] = [...points]
          .sort((a, b) => (b.r ?? 4) - (a.r ?? 4))
          .map((p) => ({ x: x(p.x), y: y(p.y), d: p }));
        const [x0, x1] = x.domain();
        const [y0, y1] = y.domain();
        const lo = Math.max(x0, y0);
        const hi = Math.min(x1, y1);
        return (
          <svg width={w} height={h} role="img">
            <XGrid x={x} ticks={x.ticks(w < 560 ? 4 : 6)} top={pad.t} bottom={h - pad.b} fmt={fmtX} />
            <YGrid y={y} ticks={y.ticks(5)} left={pad.l} right={w - pad.r} fmt={fmtY} />
            {diagonal && lo < hi && <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="var(--amber)" strokeDasharray="4 3" />}
            {refY != null && <line x1={pad.l} x2={w - pad.r} y1={y(refY)} y2={y(refY)} stroke="var(--amber)" strokeDasharray="4 3" />}
            <text x={pad.l + 4} y={pad.t + 10}>
              {yLabel} ↑
            </text>
            <text x={w - pad.r} y={h - pad.b - 6} textAnchor="end">
              {xLabel} →
            </text>
            {pts.map((p) => (
              <circle
                key={p.d.key}
                cx={p.x}
                cy={p.y}
                r={p.d.r ?? 4}
                fill={p.d.hollow ? "var(--bg)" : (p.d.color ?? "var(--neutral)")}
                fillOpacity={p.d.hollow ? 1 : 0.75}
                stroke={p.d.hollow ? (p.d.color ?? "var(--muted)") : "var(--bg)"}
                strokeWidth={p.d.hollow ? 1.5 : 0.6}
              />
            ))}
            {pts
              .filter((p) => p.d.label)
              .map((p) => {
                const left = p.x > w - pad.r - (p.d.label?.length ?? 0) * 6.6 - 12; // keep labels inside the chart
                return (
                  <text key={`l-${p.d.key}`} x={left ? p.x - 9 : p.x + 9} y={p.y + 4} textAnchor={left ? "end" : "start"} className="strong">
                    {p.d.label}
                  </text>
                );
              })}
            <HoverLayer pts={pts} width={w} height={h} radius={18} tip={tip} lines={(d) => d.tip} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Horizontal bars (0-100 scale) */

export function BarList({
  rows,
  max = 100,
  color = "var(--neutral)",
  fmt = (v: number) => `${Math.round(v)}%`,
}: {
  rows: { key: string; label: string; value: number; note?: string; color?: string; tip?: TipLine[] }[];
  max?: number;
  color?: string;
  fmt?: (v: number) => string;
}) {
  if (!rows.length) return <Empty>Nothing to show for these filters.</Empty>;
  const rowH = 24;
  return (
    <ChartFrame minHeight={rows.length * rowH + 28}>
      {(w, tip) => {
        const lw = Math.min(200, maxTextW(rows.map((r) => r.label)) + 12);
        const nw = Math.min(200, maxTextW(rows.map((r) => `${fmt(r.value)} ${r.note ?? ""}`)) + 12);
        const x = d3.scaleLinear([0, max], [lw, Math.max(lw + 40, w - nw)]);
        const h = rows.length * rowH + 26;
        return (
          <svg width={w} height={h} role="img">
            <XGrid x={x} ticks={x.ticks(4)} top={0} bottom={h - 24} fmt={fmt} />
            {rows.map((r, i) => {
              const y = i * rowH;
              return (
                <g key={r.key} onPointerMove={(e) => r.tip && tip.show(e, r.tip)}>
                  <text x={lw - 10} y={y + rowH / 2 + 4} textAnchor="end" className="strong">
                    {r.label}
                  </text>
                  <rect x={lw} y={y + 5} width={Math.max(0, x(r.value) - lw)} height={rowH - 10} fill={r.color ?? color} />
                  <text x={x(r.value) + 6} y={y + rowH / 2 + 4}>
                    {fmt(r.value)} {r.note ?? ""}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Small-multiple histograms of winning margins */

export function MarginHistograms({ panels }: { panels: { title: string; bins: { bin: number; races: number }[] }[] }) {
  if (!panels.length) return <Empty>No contested races counted yet for these filters.</Empty>;
  return (
    <ChartFrame minHeight={160}>
      {(w, tip) => {
        const cols = w < 560 ? 1 : 2;
        const gap = 24;
        const pw = (w - (cols - 1) * gap) / cols;
        const ph = 96;
        const h = Math.ceil(panels.length / cols) * (ph + 42);
        const bins = d3.range(0, 100, 5);
        return (
          <svg width={w} height={h} role="img">
            {panels.map((p, i) => {
              const gx = (i % cols) * (pw + gap);
              const gy = Math.floor(i / cols) * (ph + 42);
              const by = new Map(p.bins.map((b) => [b.bin, b.races]));
              const x = d3.scaleBand(bins, [0, pw]).padding(0.15);
              const peak = d3.max(bins, (b) => by.get(b) ?? 0) ?? 1;
              const y = d3.scaleLinear([0, Math.max(peak, 1)], [ph, 18]);
              const total = d3.sum(p.bins, (b) => b.races);
              return (
                <g key={p.title} transform={`translate(${gx},${gy})`}>
                  <text x={0} y={11} className="strong">
                    {p.title} · {int(total)}
                  </text>
                  <line x1={0} x2={pw} y1={ph} y2={ph} stroke="var(--line2)" />
                  {bins.map((b) => {
                    const n = by.get(b) ?? 0;
                    return (
                      <rect
                        key={b}
                        x={x(b)}
                        y={y(n)}
                        width={x.bandwidth()}
                        height={ph - y(n)}
                        fill={b < 5 ? "var(--amber)" : "var(--neutral)"}
                        onPointerMove={(e) =>
                          tip.show(e, [
                            { text: p.title, head: true },
                            { text: `won by ${b}–${b + 5} pts: ${int(n)} races` },
                          ])
                        }
                      />
                    );
                  })}
                  {[0, 25, 50, 75].map((t) => (
                    <text key={t} x={x(t) ?? 0} y={ph + 14}>
                      {t === 75 ? "75+" : t}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Exit polls: group margins over time */

export function ExitShiftChart({ rows, compare }: { rows: ExitShift[]; compare: 2022 | 2024 }) {
  const groups = useMemo(
    () =>
      d3
        .groups(rows, (d) => d.order)
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({
          group: v[0].group,
          category: v[0].category,
          from: v.find((d) => d.year === compare),
          to: v.find((d) => d.year === 2026),
        }))
        .filter((g) => g.to),
    [rows, compare],
  );
  if (!groups.length) return <Empty>No groups for these filters.</Empty>;
  const cats = [...new Set(groups.map((g) => g.category))];
  const rowH = 22;
  const headH = 24;
  return (
    <ChartFrame minHeight={cats.length * headH + groups.length * rowH + 30}>
      {(w, tip) => {
        const lw = maxTextW(groups.map((g) => g.group)) + 12;
        const x = d3.scaleLinear(d3.extent(rows.map((r) => r.margin).concat([0])) as [number, number], [lw, w - 60]).nice();
        const h = cats.length * headH + groups.length * rowH + 28;
        let y = 0;
        const out: React.ReactNode[] = [];
        for (const cat of cats) {
          out.push(
            <text key={`c-${cat}`} x={0} y={y + 16} className="strong" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
              {cat}
            </text>,
          );
          y += headH;
          for (const g of groups.filter((q) => q.category === cat)) {
            const cy = y + rowH / 2;
            const to = g.to!;
            out.push(
              <g key={g.group}>
                <text x={lw - 10} y={cy + 4} textAnchor="end">
                  {g.group}
                </text>
                {g.from && <line x1={x(g.from.margin)} x2={x(to.margin)} y1={cy} y2={cy} stroke="var(--line2)" strokeWidth={2} />}
                {g.from && <circle cx={x(g.from.margin)} cy={cy} r={4} fill="var(--bg)" stroke="var(--muted)" strokeWidth={1.5} />}
                <circle cx={x(to.margin)} cy={cy} r={5} fill={to.margin >= 0 ? "var(--dem)" : "var(--rep)"} stroke="var(--bg)" />
                <text x={w - 54} y={cy + 4}>
                  {margin(to.margin, 0)}
                </text>
                <rect
                  x={0}
                  y={y}
                  width={w}
                  height={rowH}
                  fill="transparent"
                  onPointerMove={(e) =>
                    tip.show(e, [
                      { text: g.group, head: true },
                      { text: `${compare} ${compare === 2024 ? "president" : "House"}: ${g.from ? margin(g.from.margin) : "not asked"}` },
                      {
                        text: `2026 House: ${margin(to.margin)}${to.share != null ? ` · ${to.share}% of voters` : ""}`,
                        color: to.margin >= 0 ? "var(--dem)" : "var(--rep)",
                      },
                    ])
                  }
                />
              </g>,
            );
            y += rowH;
          }
        }
        return (
          <svg width={w} height={h} role="img">
            <XGrid x={x} ticks={x.ticks(w < 560 ? 4 : 8)} top={0} bottom={h - 26} fmt={tickMargin} />
            {out}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Exit polls: 2026 vote by 2024 vote (mosaic) */

export function VoteFlow({ rows }: { rows: ExitAnswer[] }) {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  return (
    <ChartFrame minHeight={300}>
      {(w, tip) => {
        const h = 300;
        const pad = { t: 4, b: 40 };
        const total = d3.sum(sorted, (d) => d.share);
        const gap = 3;
        const usable = w - gap * (sorted.length - 1);
        const y = d3.scaleLinear([0, 100], [pad.t, h - pad.b]);
        let x0 = 0;
        return (
          <svg width={w} height={h} role="img">
            {sorted.map((d) => {
              const cw = (usable * d.share) / total;
              const segs: [string, number, string][] = [
                ["Democrat", d.dem, "var(--dem)"],
                ["Other / no answer", Math.max(0, 100 - d.dem - d.rep), "var(--mid)"],
                ["Republican", d.rep, "var(--rep)"],
              ];
              let acc = 0;
              const left = x0;
              x0 += cw + gap;
              const name = d.answer.replace(/\s*\((Dem|Rep)\)/, "");
              return (
                <g key={d.answer}>
                  {segs.map(([lab, v, c]) => {
                    if (v <= 0) return null;
                    const sy = y(acc);
                    const sh = y(acc + v) - y(acc);
                    acc += v;
                    return (
                      <g key={lab}>
                        <rect
                          x={left}
                          y={sy}
                          width={Math.max(1, cw)}
                          height={Math.max(0, sh - 2)}
                          fill={c}
                          onPointerMove={(e) =>
                            tip.show(e, [
                              { text: `2024: ${d.answer} · ${d.share}% of voters`, head: true },
                              { text: `2026 House: ${lab} ${v.toFixed(0)}%`, color: c },
                            ])
                          }
                        />
                        {sh > 18 && cw > 40 && lab !== "Other / no answer" && (
                          <text x={left + cw / 2} y={sy + sh / 2 + 4} textAnchor="middle" style={{ fill: "#fff" }}>
                            {v.toFixed(0)}%
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {cw > 60 && (
                    <>
                      <text x={left + cw / 2} y={h - pad.b + 16} textAnchor="middle" className="strong">
                        {name}
                      </text>
                      <text x={left + cw / 2} y={h - pad.b + 30} textAnchor="middle">
                        {d.share}% of voters
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- 100% stacked bars with a key below */

export function StackBars({
  bars,
  colors,
  keyLabels,
  notes,
}: {
  bars: { label: string; parts: { key: string; value: number }[] }[];
  colors: string[];
  keyLabels: string[];
  notes?: string[];
}) {
  return (
    <ChartFrame minHeight={bars.length * 40 + keyLabels.length * 20 + 10}>
      {(w, tip) => {
        const barH = 26;
        const lw = Math.max(0, maxTextW(bars.map((b) => b.label)) + (bars.some((b) => b.label) ? 12 : 0));
        const h = bars.length * (barH + 12) + keyLabels.length * 20 + 8;
        return (
          <svg width={w} height={h} role="img">
            {bars.map((b, i) => {
              const total = d3.sum(b.parts, (p) => p.value);
              let x0 = lw;
              const y = i * (barH + 12);
              return (
                <g key={b.label || i}>
                  {b.label && (
                    <text x={0} y={y + barH / 2 + 4} className="strong">
                      {b.label}
                    </text>
                  )}
                  {b.parts.map((p, j) => {
                    const bw = ((w - lw) * p.value) / total;
                    const left = x0;
                    x0 += bw;
                    return (
                      <g key={p.key} onPointerMove={(e) => tip.show(e, [{ text: `${b.label} ${keyLabels[j]}`.trim(), head: true }, { text: `${p.value}%` }])}>
                        <rect x={left} y={y} width={Math.max(1, bw - 2)} height={barH} fill={colors[j]} />
                        {bw > 34 && (
                          <text x={left + bw / 2} y={y + barH / 2 + 4} textAnchor="middle" style={{ fill: "#0a0c0d" }}>
                            {p.value}%
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {keyLabels.map((k, j) => {
              const y = bars.length * (barH + 12) + j * 20 + 10;
              return (
                <g key={k}>
                  <rect x={0} y={y - 9} width={12} height={10} fill={colors[j]} />
                  <text x={20} y={y} className="strong">
                    {k}
                  </text>
                  {notes?.[j] && (
                    <text x={w} y={y} textAnchor="end">
                      {notes[j]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- Ballot measures by topic and Yes share */

export function MeasureStrip({ measures, onPick }: { measures: Measure[]; onPick?: (m: Measure) => void }) {
  const rows = measures.filter((m) => m.yes_pct != null);
  if (!rows.length) return <Empty>No measures match these filters.</Empty>;
  const topics = d3.groups(rows, (m) => m.topic).sort((a, b) => b[1].length - a[1].length);
  return (
    <ChartFrame minHeight={topics.length * 30 + 40}>
      {(w, tip) => {
        const r = w < 560 ? 4 : 5.5;
        const step = 2 * r + 1;
        const lw = Math.min(260, maxTextW(topics.map(([t, m]) => `${t} (${m.length})`)) + 12);
        const x = d3.scaleLinear([0, 100], [lw, w - 10]);
        let y = 6;
        const lanes = topics.map(([t, ms]) => {
          const placed = dodge(ms, (m) => x(m.yes_pct ?? 0), step);
          const half = d3.max(placed, (p) => Math.abs(p.oy)) ?? 0;
          const cy = y + half + r + 4;
          y = cy + half + r + 4;
          return { t, n: ms.length, cy, placed };
        });
        const h = y + 28;
        const pts: Pt<Measure>[] = lanes.flatMap((l) => l.placed.map((p) => ({ x: p.x, y: l.cy + p.oy, d: p.d })));
        return (
          <svg width={w} height={h} role="img">
            <XGrid x={x} ticks={[0, 25, 50, 75, 100]} top={0} bottom={h - 26} fmt={(t) => `${t}%`} />
            <line x1={x(50)} x2={x(50)} y1={0} y2={h - 26} stroke="var(--amber)" strokeDasharray="4 3" />
            {lanes.map((l) => (
              <g key={l.t}>
                <line x1={lw} x2={w - 10} y1={l.cy} y2={l.cy} stroke="var(--line)" />
                <text x={lw - 10} y={l.cy + 4} textAnchor="end" className="strong">
                  {l.t} ({l.n})
                </text>
              </g>
            ))}
            {pts.map((p) => (
              <circle
                key={p.d.id}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={p.d.passed ? "var(--neutral)" : "var(--bg)"}
                stroke={p.d.passed ? "var(--bg)" : "var(--muted)"}
                strokeWidth={1.4}
              />
            ))}
            <HoverLayer
              pts={pts}
              width={w}
              height={h}
              radius={3 * r + 4}
              tip={tip}
              onPick={onPick}
              lines={(m) => measureTip(m)}
            />
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export function measureTip(m: Measure): TipLine[] {
  return [
    { text: `${m.state_name}: ${m.name}`, head: true },
    ...(m.title ? [{ text: m.title.length > 90 ? `${m.title.slice(0, 88)}…` : m.title }] : []),
    {
      text: `Yes ${pct(m.yes_pct)} · needs >${m.threshold}% · ${m.status.toLowerCase()}`,
      color: m.passed ? "var(--neutral)" : "var(--muted)",
    },
    { text: `${int(m.yes_votes + m.no_votes)} votes · ${pct(m.reporting, 0)} reporting` },
  ];
}

export const raceTip = (d: FederalRace): TipLine[] => [
  { text: d.race, head: true },
  { text: `${d.winner_name ?? "—"} (${partyName(d.winner_party)}) ${d.called ? "won" : "leads"}`, color: partyColor(d.winner_party) },
  { text: `${margin(d.signed_margin)} · ${compact(d.total)} votes · ${pct(d.reporting, 0)} in` },
];
