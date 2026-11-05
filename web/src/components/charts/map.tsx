// Maps: county choropleth (pre-projected Albers USA paths from us-atlas) and a state tile grid.
// Client-only: imported from client views.
import { useMemo, useState } from "react";
import { ChartFrame, Empty, type TipLine } from "./core";
import type { GeoShape } from "@/lib/types";

const FULL = { x: 0, y: 0, w: 975, h: 610 };

function bbox(d: string) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]);
    x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]);
    y1 = Math.max(y1, nums[i + 1]);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : FULL;
}

export function CountyMap({
  geo,
  states,
  valueOf,
  color,
  tipFor,
  focus,
  dimmed,
  onPick,
}: {
  geo: GeoShape[] | null;
  states: GeoShape[] | null;
  valueOf: (fips: string) => number | null | undefined;
  color: (v: number) => string;
  tipFor: (fips: string, name: string) => TipLine[];
  /** two-digit state FIPS to zoom to */
  focus?: string;
  dimmed?: (fips: string) => boolean;
  onPick?: (fips: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const view = useMemo(() => {
    if (!focus || !states) return FULL;
    const s = states.find((x) => x.fips === focus);
    if (!s) return FULL;
    const b = bbox(s.d);
    const p = Math.max(b.w, b.h) * 0.06;
    return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p };
  }, [focus, states]);
  if (!geo || !states) return <Empty>Loading map…</Empty>;
  const shown = focus ? geo.filter((c) => c.fips.startsWith(focus)) : geo;
  const names = new Map(geo.map((c) => [c.fips, c.name]));
  const hovered = hover ? geo.find((c) => c.fips === hover) : null;
  return (
    <ChartFrame minHeight={200}>
      {(_w, tip) => (
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          width="100%"
          style={{ display: "block", height: "auto", maxHeight: 640 }}
          role="img"
          aria-label="County map"
        >
          <g
            onPointerMove={(e) => {
              const f = (e.target as Element).getAttribute("data-fips");
              if (f) {
                setHover(f);
                tip.show(e, tipFor(f, names.get(f) ?? f));
              } else {
                setHover(null);
                tip.hide();
              }
            }}
            onPointerLeave={() => {
              setHover(null);
              tip.hide();
            }}
            onClick={(e) => {
              const f = (e.target as Element).getAttribute("data-fips");
              if (f && onPick) onPick(f);
            }}
            style={{ cursor: onPick ? "pointer" : undefined }}
          >
            {shown.map((c) => {
              const v = valueOf(c.fips);
              const has = v != null && !Number.isNaN(v);
              return (
                <path
                  key={c.fips}
                  data-fips={c.fips}
                  d={c.d}
                  fill={has ? color(v) : "transparent"}
                  stroke={has ? (focus ? "var(--bg)" : "none") : "var(--line)"}
                  strokeWidth={focus ? 0.8 : 0.6}
                  vectorEffect="non-scaling-stroke"
                  opacity={dimmed?.(c.fips) ? 0.15 : 1}
                />
              );
            })}
          </g>
          {states
            .filter((s) => !focus || s.fips === focus)
            .map((s) => (
              <path
                key={s.fips}
                d={s.d}
                fill="none"
                stroke="var(--bg)"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          {hovered && (
            <path d={hovered.d} fill="none" stroke="var(--fg)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </svg>
      )}
    </ChartFrame>
  );
}

export function Legend({ items }: { items: { color: string; label: string; outline?: boolean; dot?: boolean }[] }) {
  return (
    <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-block ${i.dot ? "h-2.5 w-2.5 rounded-full" : "h-2.5 w-3.5"}`}
            style={i.outline ? { boxShadow: `inset 0 0 0 1.5px ${i.color}` } : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const GRID: Record<string, [number, number]> = {
  AK: [0, 0], ME: [10, 0], VT: [9, 1], NH: [10, 1], WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2],
  WI: [6, 2], MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2], OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3],
  IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4],
  KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4], AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5],
  NC: [6, 5], SC: [7, 5], DC: [8, 5], OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6], HI: [0, 7], TX: [3, 7], FL: [8, 7],
};

export function TileMap({
  valueOf,
  color,
  label,
  tipFor,
  hrefFor,
  selected,
}: {
  valueOf: (st: string) => number | null | undefined;
  color: (v: number) => string;
  label: (v: number) => string;
  tipFor: (st: string) => TipLine[];
  hrefFor?: (st: string) => string;
  selected?: string;
}) {
  return (
    <ChartFrame minHeight={220}>
      {(w, tip) => {
        const cell = Math.min(60, Math.floor((w - 2) / 11));
        const h = cell * 8 + 2;
        return (
          <svg width={cell * 11 + 2} height={h} role="img" aria-label="States">
            {Object.entries(GRID).map(([st, [c, r]]) => {
              const v = valueOf(st);
              const has = v != null;
              const body = (
                <g
                  transform={`translate(${c * cell + 1},${r * cell + 1})`}
                  onPointerMove={(e) => tip.show(e, tipFor(st))}
                  style={{ cursor: hrefFor ? "pointer" : undefined }}
                >
                  <rect
                    width={cell - 3}
                    height={cell - 3}
                    fill={has ? color(v) : "var(--panel2)"}
                    stroke={selected === st ? "var(--accent)" : "var(--line)"}
                    strokeWidth={selected === st ? 2 : 1}
                  />
                  <text x={(cell - 3) / 2} y={cell * 0.42} textAnchor="middle" className="strong">
                    {st}
                  </text>
                  {has && cell >= 38 && (
                    <text x={(cell - 3) / 2} y={cell * 0.72} textAnchor="middle" className="strong" style={{ fontSize: 10 }}>
                      {label(v)}
                    </text>
                  )}
                </g>
              );
              return hrefFor ? (
                <a key={st} href={hrefFor(st)} aria-label={st}>
                  {body}
                </a>
              ) : (
                <g key={st}>{body}</g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}
