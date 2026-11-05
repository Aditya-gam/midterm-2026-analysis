// Chart building blocks. Client-only: imported from client views, never from Server Components.
import * as d3 from "d3";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

export interface TipLine {
  text: string;
  color?: string;
  head?: boolean;
}

export interface Tip {
  show: (e: { clientX: number; clientY: number }, lines: TipLine[]) => void;
  hide: () => void;
}

/** Measures its own width and hosts one tooltip that stays inside the chart box. */
export function ChartFrame({
  minHeight = 140,
  className = "",
  children,
}: {
  minHeight?: number;
  className?: string;
  children: (width: number, tip: Tip) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; lines: TipLine[] } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const api = useMemo<Tip>(
    () => ({
      show: (e, lines) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines });
      },
      hide: () => setTip(null),
    }),
    [],
  );

  const flip = tip ? tip.x > w - 240 : false;
  return (
    <div ref={ref} className={`relative min-w-0 ${className}`} style={{ minHeight }} onPointerLeave={api.hide}>
      {w > 0 && children(w, api)}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[260px] border border-line2 bg-panel2/95 px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: flip ? tip.x - 14 : tip.x + 14,
            top: tip.y + 14,
            transform: flip ? "translateX(-100%)" : undefined,
          }}
        >
          {tip.lines.map((l, i) => (
            <div key={i} className={`flex items-center gap-1.5 ${l.head ? "mb-0.5 text-fg" : "num text-muted"}`}>
              {l.color && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />}
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vertical gridlines with labels under them. */
export function XGrid({
  x,
  ticks,
  top,
  bottom,
  fmt,
}: {
  x: (v: number) => number;
  ticks: number[];
  top: number;
  bottom: number;
  fmt: (v: number) => string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top} y2={bottom} stroke={t === 0 ? "var(--line2)" : "var(--line)"} />
          <text x={x(t)} y={bottom + 14} textAnchor="middle">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Horizontal gridlines with labels to their left. */
export function YGrid({
  y,
  ticks,
  left,
  right,
  fmt,
}: {
  y: (v: number) => number;
  ticks: number[];
  left: number;
  right: number;
  fmt: (v: number) => string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={left - 6} y={y(t) + 4} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

export interface Pt<T> {
  x: number;
  y: number;
  d: T;
}

/** Transparent layer that shows the tooltip for the nearest point within `radius` px. */
export function HoverLayer<T>({
  pts,
  width,
  height,
  radius,
  tip,
  lines,
  onPick,
}: {
  pts: Pt<T>[];
  width: number;
  height: number;
  radius: number;
  tip: Tip;
  lines: (d: T) => TipLine[];
  onPick?: (d: T) => void;
}) {
  const delaunay = useMemo(() => d3.Delaunay.from(pts, (p) => p.x, (p) => p.y), [pts]);
  const find = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const i = delaunay.find(mx, my);
    const p = pts[i];
    return p && Math.hypot(p.x - mx, p.y - my) <= radius ? p : null;
  };
  return (
    <rect
      width={width}
      height={height}
      fill="transparent"
      style={{ cursor: onPick ? "pointer" : undefined }}
      onPointerMove={(e) => {
        const p = find(e);
        if (p) tip.show(e, lines(p.d));
        else tip.hide();
      }}
      onClick={(e) => {
        const p = find(e);
        if (p && onPick) onPick(p.d);
      }}
    />
  );
}

/** Beeswarm placement: each item keeps its x and is nudged up or down until it no longer overlaps. */
export function dodge<T>(items: T[], x: (d: T) => number, step: number): { d: T; x: number; oy: number }[] {
  const placed: { d: T; x: number; oy: number }[] = [];
  for (const d of [...items].sort((a, b) => x(a) - x(b))) {
    const px = x(d);
    const near = placed.filter((p) => Math.abs(p.x - px) < step);
    let k = 0;
    let oy = 0;
    for (;;) {
      oy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      const o = oy;
      if (!near.some((p) => Math.abs(p.oy - o) < step)) break;
      k += 1;
    }
    placed.push({ d, x: px, oy });
  }
  return placed;
}

/** Rough text width for layout at 11px monospace (each glyph ~6.6px). */
export const textW = (s: string): number => Math.ceil(s.length * 6.6);
export const maxTextW = (ss: string[]): number => Math.max(0, ...ss.map(textW));

export function Empty({ children }: { children: ReactNode }) {
  return <div className="num flex min-h-[120px] items-center justify-center text-xs text-dim">{children}</div>;
}
