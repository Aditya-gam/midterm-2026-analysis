// Shared helpers for the 2026 Midterm Atlas charts. Exposed as window.MX.
(() => {
  const K = {};
  const nf = d3.format(',');
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  K.int = (v) => (v == null ? '—' : nf(v));
  K.compact = (v) => (v == null ? '—' : v >= 10000 ? compact.format(v) : nf(v));
  K.pct = (v, d = 1) => (v == null ? '—' : `${(+v).toFixed(d)}%`);
  K.margin = (m) => (m == null ? '—' : Math.abs(m) < 0.05 ? 'Even' : `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`);
  K.toward = (s) => (s == null ? '—' : Math.abs(s) < 0.05 ? 'no change' : `${Math.abs(s).toFixed(1)} pts toward ${s > 0 ? 'Democrats' : 'Republicans'}`);
  K.time = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—');
  K.fmt = { int: K.int, compact: K.compact, pct: K.pct, margin: K.margin, time: K.time, text: (v) => (v == null ? '—' : String(v)) };

  K.party = (p) => (p === 'D' ? 'var(--mx-dem)' : p === 'R' ? 'var(--mx-rep)' : 'var(--mx-oth)');
  K.partyName = (p) => ({ D: 'Democrat', R: 'Republican' }[p] || 'Other');

  // Data for a drawing: null (and a skeleton or failure line) until every dataset is ok.
  K.get = (el, ...ids) => {
    const ds = ids.map((id) => dash.data(id));
    const bad = ds.find((d) => d.status !== 'ok');
    el.replaceChildren();
    if (bad) {
      if (bad.status === 'error' || bad.status === 'missing') {
        el.classList.remove('dash-skeleton');
        const f = document.createElement('div');
        f.className = 'mx-fail';
        f.textContent = 'Failed to load';
        el.append(f);
      } else el.classList.add('dash-skeleton');
      return null;
    }
    el.classList.remove('dash-skeleton');
    return ds.map((d) => d.data);
  };

  // An SVG whose user units are CSS pixels at the element's current width.
  K.svg = (el, h) => {
    const w = Math.max(280, el.clientWidth || 600);
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img');
    return { svg, w, h };
  };

  // Widest rendered width among strings, in px, at the chart's caption size.
  K.textWidth = (svg, strings, cls) => {
    const t = svg.append('text').attr('class', cls || null);
    let max = 0;
    for (const s of strings) { t.text(s); max = Math.max(max, t.node().getComputedTextLength()); }
    t.remove();
    return Math.ceil(max);
  };

  // A tooltip inside el. lines: [{text, head?, color?, hollow?}]
  K.tip = (el) => {
    const t = document.createElement('div');
    t.className = 'mx-tip';
    t.hidden = true;
    el.append(t);
    return {
      show(lines, event) {
        t.replaceChildren(...lines.map((l) => {
          const d = document.createElement('div');
          if (l.head) d.className = 'mx-tip-head';
          if (l.color) {
            const s = document.createElement('span');
            s.className = 'mx-sw';
            s.style.background = l.color;
            d.append(s);
          }
          d.append(document.createTextNode(l.text));
          return d;
        }));
        t.hidden = false;
        const r = el.getBoundingClientRect();
        let x = event.clientX - r.left + 14, y = event.clientY - r.top + 14;
        if (x + t.offsetWidth > r.width) x = Math.max(0, event.clientX - r.left - t.offsetWidth - 14);
        if (y + t.offsetHeight > r.height) y = Math.max(0, event.clientY - r.top - t.offsetHeight - 14);
        t.style.left = `${x}px`;
        t.style.top = `${y}px`;
      },
      hide() { t.hidden = true; },
    };
  };

  // Nearest-point hover over a set of [x, y] screen points.
  K.nearest = (svg, pts, w, h, radius, onHit, onMiss) => {
    const dl = d3.Delaunay.from(pts, (p) => p.x, (p) => p.y);
    svg.append('rect').attr('width', w).attr('height', h).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx, my] = d3.pointer(ev);
        const i = dl.find(mx, my);
        const p = pts[i];
        if (p && Math.hypot(p.x - mx, p.y - my) <= radius) onHit(p, ev); else onMiss();
      })
      .on('pointerleave', onMiss);
  };

  K.vgrid = (g, x, ticks, top, bottom, fmt) => {
    for (const t of ticks) {
      g.append('line').datum(t).attr('class', 'mx-grid-line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top).attr('y2', bottom);
      g.append('text').datum(t).attr('x', x(t)).attr('y', bottom + 14).attr('text-anchor', 'middle').text(fmt(t));
    }
  };

  // Text and number fields marked data-draw="field" (or "text") with data-source, data-field and data-where/data-row.
  const field = (el) => {
    const { source, field: f, where, row, fmt } = el.dataset;
    const d = dash.data(source);
    if (d.status !== 'ok') { el.textContent = '—'; return; }
    let r;
    if (row != null) r = d.data[+row];
    else {
      const conds = (where || '').split('&').filter(Boolean).map((s) => s.split('=').map(decodeURIComponent));
      r = d.data.find((x) => conds.every(([k, v]) => String(x[k]) === v));
    }
    const v = r ? r[f] : null;
    el.textContent = (K.fmt[fmt] || K.int)(v);
  };
  dash.draw('field', field);
  dash.draw('text', (el) => { el.dataset.fmt = el.dataset.fmt || 'text'; field(el); });

  window.MX = K;
})();
