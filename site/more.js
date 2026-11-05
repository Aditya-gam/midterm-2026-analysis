// Turnout, ballot measure, state and local, and exit poll charts.
(() => {
  const K = window.MX;
  const tickMargin = (t) => (t === 0 ? 'Even' : `${t > 0 ? 'D' : 'R'}+${Math.abs(t)}`);
  const mix = (p) => `color-mix(in oklab, var(--mx-neutral) ${p}%, var(--color-panel))`;
  const legendKey = (color, text, sq) => {
    const k = document.createElement('span');
    k.className = 'mx-key';
    const s = document.createElement('span');
    s.className = sq ? 'mx-sw mx-sq' : 'mx-sw';
    s.style.background = color;
    k.append(s, document.createTextNode(text));
    return k;
  };

  // ---------- Turnout ----------
  const T_BINS = [40, 45, 50, 55, 60];  // turnout %, class breaks
  const T_SHADES = [18, 34, 50, 66, 82, 100];
  const tColor = (v) => (v == null ? 'var(--cds-chart-muted)' : mix(T_SHADES[d3.bisectRight(T_BINS, v)]));
  const T_LABELS = ['Under 40%', '40–45%', '45–50%', '50–55%', '55–60%', '60% or more'];
  const GRID = { AK: [0, 0], ME: [10, 0], VT: [9, 1], NH: [10, 1], WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2], MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2], OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4], AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5], OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6], HI: [0, 7], TX: [3, 7], FL: [8, 7] };

  dash.draw('turnout-legend', (el) => {
    el.replaceChildren(...T_LABELS.map((t, i) => legendKey(mix(T_SHADES[i]), t, true)), legendKey('var(--cds-chart-muted)', 'No reliable count', true));
  });

  dash.draw('turnout-tiles', (el) => {
    const got = K.get(el, 'turnout_state');
    if (!got) return;
    const by = new Map(got[0].map((d) => [d.state, d]));
    const w0 = Math.max(280, el.clientWidth || 600);
    const cell = Math.min(64, Math.floor((w0 - 2) / 11));
    const h = cell * 8 + 2;
    const { svg } = K.svg(el, h);
    const tip = K.tip(el);
    for (const [st, [c, r]] of Object.entries(GRID)) {
      const d = by.get(st);
      const g = svg.append('g').attr('transform', `translate(${c * cell + 1},${r * cell + 1})`);
      g.append('rect').attr('width', cell - 3).attr('height', cell - 3).attr('rx', 4).style('fill', tColor(d?.turnout));
      g.append('text').attr('x', (cell - 3) / 2).attr('y', cell * 0.42).attr('text-anchor', 'middle').attr('class', 'mx-strong').text(st);
      if (d && cell >= 40) g.append('text').attr('x', (cell - 3) / 2).attr('y', cell * 0.72).attr('text-anchor', 'middle').attr('class', 'mx-strong').text(`${Math.round(d.turnout)}%`);
      g.append('rect').attr('width', cell - 3).attr('height', cell - 3).attr('fill', 'transparent')
        .on('pointermove', (ev) => tip.show(d ? [
          { text: d.state_name, head: true },
          { text: `Turnout ${K.pct(d.turnout)} of ${K.compact(d.vep)} eligible` },
          { text: `${K.int(d.votes)} votes in ${d.basis}` },
          { text: d.turnout22 != null ? `2022: ${K.pct(d.turnout22)}` : '2022: not available' },
        ] : [{ text: st, head: true }, { text: 'No reliable count yet' }], ev)).on('pointerleave', tip.hide);
    }
  });

  dash.draw('turnout-change', (el) => {
    const got = K.get(el, 'turnout_state');
    if (!got) return;
    const rows = got[0].filter((d) => d.turnout22 != null).sort((a, b) => b.change - a.change);
    const rowH = 17, pad = { t: 6, b: 28 };
    const h = pad.t + rows.length * rowH + pad.b;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, rows.map((d) => d.state_name)) + 10;
    const rw = K.textWidth(svg, ['+00.0']) + 8;
    const x = d3.scaleLinear(d3.extent(rows.flatMap((d) => [d.turnout, d.turnout22])), [lw, w - rw]).nice();
    K.vgrid(svg.append('g'), x, x.ticks(w < 520 ? 4 : 6), pad.t, h - pad.b + 2, (t) => `${t}%`);
    const tip = K.tip(el);
    rows.forEach((d, i) => {
      const y = pad.t + i * rowH + rowH / 2;
      svg.append('text').attr('x', lw - 10).attr('y', y + 4).attr('text-anchor', 'end').text(d.state_name);
      svg.append('line').attr('x1', x(d.turnout22)).attr('x2', x(d.turnout)).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-muted)').style('stroke-width', 2);
      svg.append('circle').attr('cx', x(d.turnout22)).attr('cy', y).attr('r', 4).style('fill', 'var(--color-panel)').style('stroke', 'var(--color-fg-muted)').style('stroke-width', 1.5);
      svg.append('circle').attr('cx', x(d.turnout)).attr('cy', y).attr('r', 4.5).style('fill', 'var(--mx-neutral)').style('stroke', 'var(--color-panel)').style('stroke-width', 1);
      svg.append('text').attr('x', w - rw + 8).attr('y', y + 4).text(`${d.change > 0 ? '+' : ''}${d.change.toFixed(1)}`);
      svg.append('rect').attr('x', 0).attr('y', y - rowH / 2).attr('width', w).attr('height', rowH).attr('fill', 'transparent')
        .on('pointermove', (ev) => tip.show([{ text: d.state_name, head: true }, { text: `2022: ${K.pct(d.turnout22)} → 2026 so far: ${K.pct(d.turnout)}` }], ev))
        .on('pointerleave', tip.hide);
    });
  });

  dash.draw('turnout-close', (el) => {
    const got = K.get(el, 'turnout_state');
    if (!got) return;
    const rows = got[0].filter((d) => d.closest_margin != null);
    const w0 = Math.max(280, el.clientWidth || 600);
    const h = Math.min(420, Math.max(260, w0 * 0.75));
    const { svg, w } = K.svg(el, h);
    const pad = { l: 40, r: 14, t: 10, b: 30 };
    const x = d3.scaleLinear([0, d3.max(rows, (d) => d.closest_margin) || 30], [pad.l, w - pad.r]).nice();
    const y = d3.scaleLinear(d3.extent(rows, (d) => d.turnout), [h - pad.b, pad.t]).nice();
    const g = svg.append('g');
    K.vgrid(g, x, x.ticks(5), pad.t, h - pad.b, (t) => `${t} pts`);
    for (const t of y.ticks(5)) {
      g.append('line').attr('class', 'mx-grid-line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t));
      g.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(`${t}%`);
    }
    const pts = rows.map((d) => ({ d, x: x(d.closest_margin), y: y(d.turnout) }));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', 5)
      .style('fill', 'var(--mx-neutral)').style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
    const ranked = [...pts].sort((a, b) => b.d.turnout - a.d.turnout);
    const labelled = new Set([...ranked.slice(0, 3), ...ranked.slice(-3)]);
    for (const p of labelled) svg.append('text').attr('x', p.x + 8).attr('y', p.y + 4).text(p.d.state);
    const tip = K.tip(el);
    K.nearest(svg, pts, w, h, 16, (p, ev) => tip.show([
      { text: p.d.state_name, head: true }, { text: `Turnout ${K.pct(p.d.turnout)}` }, { text: `Closest statewide race: ${p.d.closest_margin.toFixed(1)} pts` },
    ], ev), tip.hide);
  });

  // ---------- Ballot measures ----------
  const measureTip = (d) => [
    { text: `${d.state_name}: ${d.name}`, head: true },
    ...(d.title ? [{ text: d.title }] : []),
    { text: `Yes ${K.pct(d.yes_pct)} · needs over ${d.threshold}% · ${d.status.toLowerCase()}`, color: d.passed ? 'var(--mx-neutral)' : 'var(--cds-chart-muted)' },
    { text: `${K.pct(d.reporting, 0)} reporting` },
  ];

  dash.draw('measure-strip', (el) => {
    const got = K.get(el, 'measures_statewide');
    if (!got) return;
    const rows = got[0].filter((d) => d.kind === 'Ballot measure' && d.yes_pct != null);
    const topics = d3.groups(rows, (d) => d.topic).sort((a, b) => b[1].length - a[1].length);
    const w0 = Math.max(280, el.clientWidth || 600);
    const r = w0 < 520 ? 4 : 5.5, step = 2 * r + 1;
    const probe = K.svg(el, 10);
    const lw = K.textWidth(probe.svg, topics.map(([t, m]) => `${t} (${m.length})`)) + 12;
    el.replaceChildren();
    const x = d3.scaleLinear([0, 100], [lw, w0 - 12]);
    const layout = topics.map(([t, ms]) => {
      const placed = [];
      for (const d of [...ms].sort((a, b) => a.yes_pct - b.yes_pct)) {
        const px = x(d.yes_pct);
        let k = 0, oy = 0;
        for (;;) {
          oy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
          if (!placed.some((p) => Math.abs(p.x - px) < step && Math.abs(p.oy - oy) < step)) break;
          k += 1;
        }
        placed.push({ x: px, oy, d });
      }
      return { t, n: ms.length, placed, half: d3.max(placed, (p) => Math.abs(p.oy)) || 0 };
    });
    const pad = { t: 6, b: 28 };
    let h = pad.t;
    for (const L of layout) { L.y = h + L.half + r + 6; h = L.y + L.half + r + 6; }
    h += pad.b;
    const { svg, w } = K.svg(el, h);
    K.vgrid(svg.append('g'), x, [0, 25, 50, 75, 100], pad.t, h - pad.b + 2, (t) => `${t}%`);
    svg.append('line').attr('class', 'mx-ref').attr('x1', x(50)).attr('x2', x(50)).attr('y1', pad.t).attr('y2', h - pad.b);
    const pts = [];
    for (const L of layout) {
      svg.append('line').attr('class', 'mx-grid-line').attr('x1', lw).attr('x2', w - 12).attr('y1', L.y).attr('y2', L.y);
      svg.append('text').attr('x', lw - 12).attr('y', L.y + 4).attr('text-anchor', 'end').attr('class', 'mx-strong').text(`${L.t} (${L.n})`);
      for (const p of L.placed) pts.push({ ...p, y: L.y + p.oy });
    }
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', r)
      .style('fill', (p) => (p.d.passed ? 'var(--mx-neutral)' : 'var(--color-panel)'))
      .style('stroke', (p) => (p.d.passed ? 'var(--color-panel)' : 'var(--color-fg-muted)')).style('stroke-width', 1.5);
    const tip = K.tip(el);
    K.nearest(svg, pts, w, h, 3 * r, (p, ev) => tip.show(measureTip(p.d), ev), tip.hide);
  });

  dash.draw('measure-partisan', (el) => {
    const got = K.get(el, 'measures_statewide');
    if (!got) return;
    const rows = got[0].filter((d) => d.kind === 'Ballot measure' && d.yes_pct != null && d.pres24 != null);
    const w0 = Math.max(280, el.clientWidth || 600);
    const h = Math.min(420, Math.max(260, w0 * 0.75));
    const { svg, w } = K.svg(el, h);
    const pad = { l: 40, r: 12, t: 10, b: 30 };
    const x = d3.scaleLinear(d3.extent(rows, (d) => d.pres24), [pad.l, w - pad.r]).nice();
    const y = d3.scaleLinear([0, 100], [h - pad.b, pad.t]);
    const g = svg.append('g');
    K.vgrid(g, x, x.ticks(w < 520 ? 4 : 6), pad.t, h - pad.b, tickMargin);
    for (const t of [0, 25, 50, 75, 100]) {
      g.append('line').attr('class', t === 50 ? 'mx-ref' : 'mx-grid-line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t));
      g.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(`${t}%`);
    }
    g.append('text').attr('x', pad.l + 4).attr('y', pad.t + 12).text('Yes share ↑');
    g.append('text').attr('x', w - pad.r).attr('y', h - pad.b - 8).attr('text-anchor', 'end').text('2024 presidential margin in the state →');
    const pts = rows.map((d) => ({ d, x: x(d.pres24), y: y(d.yes_pct) }));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', 5)
      .style('fill', (p) => (p.d.passed ? 'var(--mx-neutral)' : 'var(--color-panel)'))
      .style('stroke', (p) => (p.d.passed ? 'var(--color-panel)' : 'var(--color-fg-muted)')).style('stroke-width', 1.5);
    const tip = K.tip(el);
    K.nearest(svg, pts, w, h, 16, (p, ev) => tip.show([...measureTip(p.d), { text: `State voted ${K.margin(p.d.pres24)} for president in 2024` }], ev), tip.hide);
  });

  dash.draw('measure-featured', (el) => {
    const got = K.get(el, 'measure_counties');
    if (!got) return;
    const rows = got[0];
    const w0 = Math.max(280, el.clientWidth || 600);
    const h = Math.min(420, Math.max(260, w0 * 0.75));
    const { svg, w } = K.svg(el, h);
    const pad = { l: 40, r: 12, t: 10, b: 30 };
    const x = d3.scaleLinear(d3.extent(rows, (d) => d.trump24), [pad.l, w - pad.r]).nice();
    const y = d3.scaleLinear(d3.extent(rows.map((d) => d.yes_pct).concat([50])), [h - pad.b, pad.t]).nice();
    const size = d3.scaleSqrt([0, d3.max(rows, (d) => d.votes) || 1], [2, 12]);
    const g = svg.append('g');
    K.vgrid(g, x, x.ticks(5), pad.t, h - pad.b, (t) => `${t}%`);
    for (const t of y.ticks(5)) {
      g.append('line').attr('class', t === 50 ? 'mx-ref' : 'mx-grid-line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t));
      g.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(`${t}%`);
    }
    g.append('text').attr('x', pad.l + 4).attr('y', pad.t + 12).text('Yes share ↑');
    g.append('text').attr('x', w - pad.r).attr('y', h - pad.b - 8).attr('text-anchor', 'end').text('Trump share in 2024 →');
    const pts = [...rows].sort((a, b) => b.votes - a.votes).map((d) => ({ d, x: x(d.trump24), y: y(d.yes_pct) }));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', (p) => size(p.d.votes))
      .style('fill', 'var(--mx-neutral)').style('fill-opacity', 0.6).style('stroke', 'var(--color-panel)').style('stroke-width', 1);
    const tip = K.tip(el);
    K.nearest(svg, pts, w, h, 16, (p, ev) => tip.show([
      { text: p.d.county, head: true }, { text: `Yes ${K.pct(p.d.yes_pct)} · Trump 2024 ${K.pct(p.d.trump24)}` }, { text: `${K.int(p.d.votes)} votes on the measure` },
    ], ev), tip.hide);
  });

  // Horizontal bars of a percentage with a count label; shared by local measures and uncontested races.
  const pctBars = (el, rows, label, value, note) => {
    const rowH = 26, pad = { t: 4, b: 26 };
    const h = pad.t + rows.length * rowH + pad.b;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, rows.map(label)) + 12;
    const nw = K.textWidth(svg, rows.map(note)) + 10;
    const x = d3.scaleLinear([0, 100], [lw, Math.max(lw + 40, w - nw)]);
    K.vgrid(svg.append('g'), x, [0, 25, 50, 75, 100], pad.t, h - pad.b + 2, (t) => `${t}%`);
    rows.forEach((d, i) => {
      const y = pad.t + i * rowH;
      svg.append('text').attr('x', lw - 12).attr('y', y + rowH / 2 + 4).attr('text-anchor', 'end').attr('class', 'mx-strong').text(label(d));
      svg.append('rect').attr('x', lw).attr('y', y + 5).attr('width', Math.max(0, x(value(d)) - lw)).attr('height', rowH - 10).attr('rx', 3).style('fill', 'var(--mx-neutral)');
      svg.append('text').attr('x', x(value(d)) + 6).attr('y', y + rowH / 2 + 4).text(note(d));
    });
  };

  dash.draw('local-measures', (el) => {
    const got = K.get(el, 'measures_local');
    if (!got) return;
    pctBars(el, got[0], (d) => d.kind, (d) => d.pass_rate, (d) => `${Math.round(d.pass_rate)}% of ${K.int(d.measures)} passing`);
  });

  dash.draw('measure-table', (el) => {
    const d = dash.data('measures_statewide');
    el.replaceChildren();
    if (d.status !== 'ok') return;
    const q = (document.getElementById('measure-search')?.value || '').trim().toLowerCase();
    const rows = d.data.filter((m) => !q || [m.state, m.state_name, m.name, m.title, m.topic, m.status].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
    for (const m of rows) {
      const tr = document.createElement('tr');
      tr.dataset.key = String(m.id);
      const cells = [m.state, m.name, m.topic, K.pct(m.yes_pct), null, K.pct(m.reporting, 0)];
      cells.forEach((v, i) => {
        const td = document.createElement('td');
        if (i === 3 || i === 5) td.className = 'mx-num';
        if (i === 4) {
          const p = document.createElement('span');
          p.className = m.passed ? 'mx-pill mx-yes' : 'mx-pill';
          p.textContent = m.status;
          td.append(p);
        } else td.textContent = v;
        if (i === 1 && m.title) td.title = m.title;
        tr.append(td);
      });
      el.append(tr);
    }
  });

  // ---------- State and local ----------
  dash.draw('uncontested', (el) => {
    const got = K.get(el, 'office_contest');
    if (!got) return;
    pctBars(el, got[0], (d) => d.office, (d) => d.uncontested_pct, (d) => `${Math.round(d.uncontested_pct)}% of ${K.int(d.races)}`);
  });

  dash.draw('margins', (el) => {
    const got = K.get(el, 'office_margins', 'office_contest');
    if (!got) return;
    const [bins, contest] = got;
    const offices = contest.filter((c) => c.measured > 0).map((c) => c.office);
    const w0 = Math.max(280, el.clientWidth || 600);
    const cols = w0 < 520 ? 1 : 2;
    const pw = (w0 - (cols - 1) * 24) / cols, ph = 110;
    const rowsN = Math.ceil(offices.length / cols);
    const h = rowsN * (ph + 40);
    const { svg } = K.svg(el, h);
    const tip = K.tip(el);
    offices.forEach((o, i) => {
      const c = contest.find((x) => x.office === o);
      const data = bins.filter((b) => b.office === o).sort((a, b) => a.bin - b.bin);
      const gx = (i % cols) * (pw + 24), gy = Math.floor(i / cols) * (ph + 40);
      const g = svg.append('g').attr('transform', `translate(${gx},${gy})`);
      g.append('text').attr('x', 0).attr('y', 12).attr('class', 'mx-strong').text(`${o} · ${K.int(c.measured)} races`);
      const x = d3.scaleBand(data.map((d) => d.bin), [0, pw]).padding(0.15);
      const y = d3.scaleLinear([0, d3.max(data, (d) => d.races) || 1], [ph, 22]);
      g.append('line').attr('class', 'mx-axis-line').attr('x1', 0).attr('x2', pw).attr('y1', ph).attr('y2', ph);
      g.selectAll('rect').data(data).join('rect').attr('x', (d) => x(d.bin)).attr('width', x.bandwidth()).attr('y', (d) => y(d.races))
        .attr('height', (d) => ph - y(d.races)).attr('rx', 2).style('fill', (d) => (d.bin < 5 ? 'var(--mx-alt)' : 'var(--mx-neutral)'))
        .on('pointermove', (ev, d) => tip.show([{ text: o, head: true }, { text: `Won by ${d.bin}–${d.bin + 5} pts: ${K.int(d.races)} races` }], ev))
        .on('pointerleave', tip.hide);
      for (const t of [0, 25, 50, 75]) g.append('text').attr('x', x(t)).attr('y', ph + 14).text(t === 75 ? '75+ pts' : `${t}`);
      g.append('text').attr('x', pw).attr('y', 30).attr('text-anchor', 'end').text(`max ${d3.max(data, (d) => d.races)}`);
    });
  });

  dash.draw('legislatures', (el) => {
    const got = K.get(el, 'state_legislatures');
    if (!got) return;
    const states = d3.groups(got[0], (d) => d.state_name).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, chambers] of states) {
      const box = document.createElement('div');
      box.style.display = 'grid';
      box.style.gap = '4px';
      const t = document.createElement('span');
      t.className = 'mx-strong';
      t.style.fontSize = 'var(--cds-font-size-caption)';
      t.style.fontWeight = 'var(--cds-font-weight-medium)';
      t.textContent = name;
      box.append(t);
      for (const c of chambers.sort((a, b) => b.chamber.localeCompare(a.chamber))) {
        const total = c.dem + c.rep + c.other;
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:2px;height:10px;border-radius:3px;overflow:hidden;background:var(--cds-chart-muted)';
        for (const [n, color] of [[c.dem, 'var(--mx-dem)'], [c.rep, 'var(--mx-rep)'], [c.other, 'var(--mx-oth)']]) {
          if (!n) continue;
          const s = document.createElement('span');
          s.style.cssText = `flex:${n} 0 0;background:${color}`;
          bar.append(s);
        }
        const lab = document.createElement('span');
        lab.style.cssText = 'font-size:var(--cds-font-size-caption);color:var(--color-fg-muted);font-variant-numeric:tabular-nums';
        lab.textContent = `${c.chamber.replace('State ', '')}: D ${c.dem} · R ${c.rep}${c.other ? ` · other ${c.other}` : ''}${total ? '' : ' (no counts yet)'}`;
        box.append(bar, lab);
      }
      el.append(box);
    }
  });

  // ---------- Exit polls ----------
  dash.draw('exit-shift', (el) => {
    const got = K.get(el, 'exit_shift');
    if (!got) return;
    const rows = got[0];
    const groups = d3.groups(rows, (d) => d.order).sort((a, b) => a[0] - b[0]).map(([, v]) => ({
      group: v[0].group, category: v[0].category, y22: v.find((d) => d.year === 2022), y24: v.find((d) => d.year === 2024), y26: v.find((d) => d.year === 2026),
    })).filter((g) => g.y26);
    const cats = [...new Set(groups.map((g) => g.category))];
    const rowH = 22, headH = 24, pad = { t: 4, b: 28 };
    const h = pad.t + cats.length * headH + groups.length * rowH + pad.b;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, groups.map((g) => g.group)) + 12;
    const rw = K.textWidth(svg, ['D+00.0']) + 10;
    const x = d3.scaleLinear(d3.extent(rows.map((d) => d.margin).concat([0])), [lw, w - rw]).nice();
    K.vgrid(svg.append('g'), x, x.ticks(w < 520 ? 4 : 8), pad.t, h - pad.b + 2, tickMargin);
    svg.append('line').attr('class', 'mx-ref').attr('x1', x(0)).attr('x2', x(0)).attr('y1', pad.t).attr('y2', h - pad.b);
    const tip = K.tip(el);
    let yy = pad.t;
    for (const cat of cats) {
      svg.append('text').attr('x', 0).attr('y', yy + 16).attr('class', 'mx-strong').text(cat);
      yy += headH;
      for (const g of groups.filter((d) => d.category === cat)) {
        const y = yy + rowH / 2;
        const from = g.y22 || g.y24;
        svg.append('text').attr('x', lw - 12).attr('y', y + 4).attr('text-anchor', 'end').text(g.group);
        if (from) svg.append('line').attr('x1', x(from.margin)).attr('x2', x(g.y26.margin)).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-muted)').style('stroke-width', 2);
        if (g.y24) svg.append('line').attr('x1', x(g.y24.margin)).attr('x2', x(g.y24.margin)).attr('y1', y - 6).attr('y2', y + 6).style('stroke', 'var(--color-fg-muted)').style('stroke-width', 2);
        if (g.y22) svg.append('circle').attr('cx', x(g.y22.margin)).attr('cy', y).attr('r', 4.5).style('fill', 'var(--color-panel)').style('stroke', 'var(--color-fg-muted)').style('stroke-width', 1.5);
        svg.append('circle').attr('cx', x(g.y26.margin)).attr('cy', y).attr('r', 5.5).style('fill', K.party(g.y26.margin >= 0 ? 'D' : 'R')).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
        svg.append('text').attr('x', w - rw + 10).attr('y', y + 4).text(K.margin(g.y26.margin));
        svg.append('rect').attr('x', 0).attr('y', yy).attr('width', w).attr('height', rowH).attr('fill', 'transparent')
          .on('pointermove', (ev) => tip.show([
            { text: g.group, head: true },
            { text: `2022 House: ${g.y22 ? K.margin(g.y22.margin) : 'not asked'}` },
            { text: `2024 president: ${g.y24 ? K.margin(g.y24.margin) : 'not asked'}` },
            { text: `2026 House: ${K.margin(g.y26.margin)}${g.y26.share != null ? ` · ${g.y26.share}% of voters` : ''}`, color: K.party(g.y26.margin >= 0 ? 'D' : 'R') },
          ], ev)).on('pointerleave', tip.hide);
        yy += rowH;
      }
    }
  });

  dash.draw('exit-flow', (el) => {
    const got = K.get(el, 'exit_flow');
    if (!got) return;
    const rows = [...got[0]].sort((a, b) => a.order - b.order);
    const w0 = Math.max(280, el.clientWidth || 600);
    const h = 300, pad = { t: 6, b: 44 };
    const { svg, w } = K.svg(el, h);
    const total = d3.sum(rows, (d) => d.share);
    const gap = 3, usable = w - gap * (rows.length - 1);
    const y = d3.scaleLinear([0, 100], [pad.t, h - pad.b]);
    const tip = K.tip(el);
    let x0 = 0;
    for (const d of rows) {
      const cw = (usable * d.share) / total;
      const other = Math.max(0, 100 - d.dem - d.rep);
      const segs = [['D', d.dem, 'var(--mx-dem)'], ['O', other, 'var(--cds-chart-muted)'], ['R', d.rep, 'var(--mx-rep)']];
      let acc = 0;
      for (const [p, v, color] of segs) {
        if (v <= 0) continue;
        const sy = y(acc), sh = y(acc + v) - y(acc);
        svg.append('rect').attr('x', x0).attr('y', sy).attr('width', Math.max(1, cw)).attr('height', Math.max(0, sh - 2)).attr('rx', 2).style('fill', color)
          .on('pointermove', (ev) => tip.show([{ text: `2024: ${d.answer} · ${d.share}% of 2026 voters`, head: true }, { text: `2026 House: ${p === 'O' ? 'other or no answer' : K.partyName(p)} ${v.toFixed(0)}%`, color }], ev))
          .on('pointerleave', tip.hide);
        if (sh > 18 && cw > 34 && p !== 'O') svg.append('text').attr('x', x0 + cw / 2).attr('y', sy + sh / 2 + 4).attr('text-anchor', 'middle').style('fill', '#fff').style('pointer-events', 'none').text(`${v.toFixed(0)}%`);
        acc += v;
      }
      const name = d.answer.replace(/\s*\((Dem|Rep)\)/, '');
      if (cw > 46) {
        svg.append('text').attr('x', x0 + cw / 2).attr('y', h - pad.b + 16).attr('text-anchor', 'middle').attr('class', 'mx-strong').text(name);
        svg.append('text').attr('x', x0 + cw / 2).attr('y', h - pad.b + 32).attr('text-anchor', 'middle').text(`${d.share}% of voters`);
      }
      x0 += cw + gap;
    }
  });

  dash.draw('exit-issue', (el) => {
    const got = K.get(el, 'exit_issue');
    if (!got) return;
    const rows = [...got[0]].sort((a, b) => b.share - a.share);
    const rowH = 26, pad = { t: 22, b: 8 };
    const h = pad.t + rows.length * rowH + pad.b;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, rows.map((d) => d.answer)) + 12;
    const mid = lw + (w - lw) * 0.42;
    const xs = d3.scaleLinear([0, d3.max(rows, (d) => d.share)], [lw, mid - 40]);
    const xm = d3.scaleLinear([-100, 100], [mid + 10, w - 8]);
    svg.append('text').attr('x', lw).attr('y', 12).text('Share of voters');
    svg.append('text').attr('x', xm(0)).attr('y', 12).attr('text-anchor', 'middle').text('House margin among them');
    svg.append('line').attr('class', 'mx-ref').attr('x1', xm(0)).attr('x2', xm(0)).attr('y1', pad.t).attr('y2', h - pad.b);
    rows.forEach((d, i) => {
      const y = pad.t + i * rowH;
      svg.append('text').attr('x', lw - 12).attr('y', y + rowH / 2 + 4).attr('text-anchor', 'end').attr('class', 'mx-strong').text(d.answer);
      svg.append('rect').attr('x', lw).attr('y', y + 6).attr('width', Math.max(1, xs(d.share) - lw)).attr('height', rowH - 12).attr('rx', 3).style('fill', 'var(--mx-neutral)');
      svg.append('text').attr('x', xs(d.share) + 6).attr('y', y + rowH / 2 + 4).text(`${d.share}%`);
      const x1 = xm(Math.min(0, d.margin)), x2 = xm(Math.max(0, d.margin));
      svg.append('rect').attr('x', x1).attr('y', y + 6).attr('width', Math.max(1, x2 - x1)).attr('height', rowH - 12).attr('rx', 3).style('fill', K.party(d.margin >= 0 ? 'D' : 'R'));
      const lx = d.margin >= 0 ? x2 + 6 : x1 - 6;
      svg.append('text').attr('x', lx).attr('y', y + rowH / 2 + 4).attr('text-anchor', d.margin >= 0 ? 'start' : 'end').text(K.margin(d.margin));
    });
  });

  dash.draw('exit-approval', (el) => {
    const got = K.get(el, 'exit_approval');
    if (!got) return;
    const rows = [...got[0]].sort((a, b) => a.order - b.order);
    const colors = ['var(--mx-alt)', 'color-mix(in oklab, var(--mx-alt) 55%, var(--color-panel))', 'color-mix(in oklab, var(--mx-oth) 55%, var(--color-panel))', 'var(--mx-oth)'];
    const rowH = 22, barH = 26;
    const h = barH + 14 + rows.length * rowH;
    const { svg, w } = K.svg(el, h);
    const total = d3.sum(rows, (d) => d.share);
    let x0 = 0;
    rows.forEach((d, i) => {
      const bw = (w * d.share) / total;
      svg.append('rect').attr('x', x0).attr('y', 0).attr('width', Math.max(1, bw - 2)).attr('height', barH).attr('rx', 3).style('fill', colors[i]);
      if (bw > 34) svg.append('text').attr('x', x0 + bw / 2).attr('y', barH / 2 + 4).attr('text-anchor', 'middle').attr('class', 'mx-strong').text(`${d.share}%`);
      x0 += bw;
      const y = barH + 14 + i * rowH;
      svg.append('rect').attr('x', 0).attr('y', y - 10).attr('width', 14).attr('height', 10).attr('rx', 2).style('fill', colors[i]);
      svg.append('text').attr('x', 22).attr('y', y).attr('class', 'mx-strong').text(`${d.answer}: ${d.share}%`);
      svg.append('text').attr('x', w).attr('y', y).attr('text-anchor', 'end').text(`House vote ${K.margin(d.margin)}`);
    });
  });

  dash.draw('exit-age', (el) => {
    const got = K.get(el, 'exit_age_mix');
    if (!got) return;
    const rows = got[0];
    const bands = [...new Set(rows.map((d) => d.answer))];
    const shades = [40, 60, 80, 100];
    const years = [2022, 2026];
    const barH = 28, rowGap = 14;
    const h = years.length * (barH + rowGap) + 30;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, ['2026']) + 12;
    years.forEach((yr, i) => {
      const y = i * (barH + rowGap);
      svg.append('text').attr('x', 0).attr('y', y + barH / 2 + 4).attr('class', 'mx-strong').text(String(yr));
      const segs = bands.map((b) => rows.find((d) => d.year === yr && d.answer === b)).filter(Boolean);
      const total = d3.sum(segs, (d) => d.share);
      let x0 = lw;
      segs.forEach((d, j) => {
        const bw = ((w - lw) * d.share) / total;
        svg.append('rect').attr('x', x0).attr('y', y).attr('width', Math.max(1, bw - 2)).attr('height', barH).attr('rx', 3).style('fill', mix(shades[j]));
        if (bw > 34) svg.append('text').attr('x', x0 + bw / 2).attr('y', y + barH / 2 + 4).attr('text-anchor', 'middle').attr('class', 'mx-strong').text(`${d.share}%`);
        x0 += bw;
      });
    });
    let lx = lw;
    const ly = years.length * (barH + rowGap) + 16;
    bands.forEach((b, j) => {
      svg.append('rect').attr('x', lx).attr('y', ly - 10).attr('width', 14).attr('height', 10).attr('rx', 2).style('fill', mix(shades[j]));
      const t = svg.append('text').attr('x', lx + 20).attr('y', ly).text(b === '65 or over' ? '65+' : b);
      lx += 20 + t.node().getComputedTextLength() + 16;
    });
  });
})();
