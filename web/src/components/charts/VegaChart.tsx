"use client";

// Draws a Vega-Lite spec built by the Ask API (api/app/charts.py). vega-embed is loaded on first use so the
// rest of the site doesn't pay for it.
import { useEffect, useRef, useState } from "react";
import type { VisualizationSpec } from "vega-embed";

export function VegaChart({ spec }: { spec: object }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let finalize: (() => void) | undefined;
    setDrawn(false);
    import("vega-embed")
      .then(({ default: embed }) => {
        if (cancelled || !ref.current) return;
        return embed(ref.current, spec as VisualizationSpec, {
          actions: false,
          renderer: "svg",
          tooltip: { theme: "dark" },
        }).then((r) => {
          if (cancelled) r.finalize();
          else {
            finalize = r.finalize;
            setDrawn(true);
          }
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      finalize?.();
    };
  }, [spec]);
  if (failed) return <p className="text-xs text-muted">The chart could not be drawn; the data table below has the numbers.</p>;
  // Hold roughly a chart's height until it draws, so the page doesn't jump and a new answer can scroll into view.
  return <div ref={ref} className={`w-full min-w-0 ${drawn ? "" : "min-h-[360px]"}`} />;
}
