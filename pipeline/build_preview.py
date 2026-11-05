"""Build a local preview of the dashboard page: preview/index.html + preview/data.js.

The live dashboard runs the page inside claude.ai with its own runtime (`dash`) and theme tokens.
This preview stands in for both: a minimal `dash` that serves data/processed/*.json and runs
drawings for visible elements, and approximate dark-theme token values. It is for checking layout
locally (python -m http.server, then open /preview/), not a copy of the real runtime.
Usage: python pipeline/build_preview.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE, DATA, OUT = ROOT / "site", ROOT / "data" / "processed", ROOT / "preview"

TOKENS = """
:root{color-scheme:dark;--color-fg:#ecebe8;--color-fg-muted:#9a9893;--color-bg:#121211;--color-panel:#1b1b1a;
--color-border-line:#2c2c2a;--color-bad:#e5484d;--color-ok:#0ca30c;--color-warn:#fab219;
--cds-chart-categorical-1:#3987e5;--cds-chart-categorical-2:#d95926;--cds-chart-categorical-3:#199e70;
--cds-chart-categorical-7:#9085e9;--cds-chart-categorical-8:#e66767;
--cds-chart-diverging-1:#6da7ec;--cds-chart-diverging-2:#2a78d6;--cds-chart-diverging-3:#184f95;--cds-chart-diverging-4:#383835;
--cds-chart-diverging-5:#8f2d2c;--cds-chart-diverging-6:#d24443;--cds-chart-diverging-7:#ef8a89;
--cds-chart-muted:#6b6a66;--cds-chart-grid:rgba(255,255,255,.07);--cds-chart-axis:#383835;--cds-chart-reference:#7a7974;
--cds-surface-popover:#232322;--cds-border:rgba(255,255,255,.1);--cds-shadow-popover:0 4px 16px rgba(0,0,0,.4);
--cds-text-secondary:#b5b3ac;--cds-radius:8px;--cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-lg:20px;
--cds-gap-xs:4px;--cds-gap-sm:8px;--cds-gap-md:16px;--cds-gap-lg:24px;--cds-font-size-caption:12px;--cds-font-size-body:14px;
--cds-font-size-heading:15px;--cds-font-size-title:28px;--cds-font-weight-medium:500;--cds-dur-slow:.45s;
--cds-ease-out:cubic-bezier(.165,.84,.44,1);--font-anthropic-sans:system-ui,-apple-system,sans-serif;--font-anthropic-serif:Georgia,serif}
html,body{margin:0;background:var(--color-bg);color:var(--color-fg);font:14px system-ui}
#dash-root{padding:24px max(16px,3vw)}
"""

STUB = """
window.__errors = [];
(() => {
  const regs = {};
  const visible = (el) => !el.closest('[hidden]');
  const run = (name) => {
    const fn = regs[name];
    if (!fn) return;
    document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
      if (!visible(el)) return;
      try { fn(el); } catch (e) { console.error('draw failed', name, e); window.__errors.push(`${name}: ${e.message}`); }
    });
  };
  const all = () => Object.keys(regs).forEach(run);
  window.dash = {
    data: (id) => (window.__DATA[id] ? { status: 'ok', data: window.__DATA[id], columns: Object.keys(window.__DATA[id][0] || {}) }
                                     : { status: 'missing', data: [] }),
    draw: (name, fn) => { if (typeof fn === 'function') regs[name] = fn; run(name); },
    onData: (fn) => fn(), setLink: () => setTimeout(all), params: () => ({}), setParams() {}, resetParams() {},
    refresh() {}, calc() {}, loader() {}, colors: [],
  };
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(all, 150); });
})();
"""


def main() -> None:
    OUT.mkdir(exist_ok=True)
    data = {f.stem: json.loads(f.read_text()) for f in sorted(DATA.glob("*.json"))}
    (OUT / "data.js").write_text("window.__DATA = " + json.dumps(data, separators=(",", ":")) + ";")
    page = (SITE / "index.html").read_text()
    page = re.sub(r'<script src="([a-z]+\.js)"></script>', r'<script src="../site/\1"></script>', page)
    html = ("<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>Midterm Atlas preview</title><style>{TOKENS}</style>"
            "<script src='https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'></script>"
            f"<script src='data.js'></script><script>{STUB}</script></head>"
            f"<body><div id='dash-root'>{page}</div></body></html>")
    (OUT / "index.html").write_text(html)
    print(f"preview: {len(data)} datasets, {(OUT / 'data.js').stat().st_size:,} bytes of data")


if __name__ == "__main__":
    main()
