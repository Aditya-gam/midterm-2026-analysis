// National and county-shift charts.
(() => {
  const K = window.MX;
  const tickMargin = (t) => (t === 0 ? 'Even' : `${t > 0 ? 'D' : 'R'}+${Math.abs(t)}`);

  // ---- Every House race as a beeswarm along the margin axis
  dash.draw('house-strip', (el) => {
    const got = K.get(el, 'races_federal');
    if (!got) return;
    const rows = got[0].filter((r) => r.office === 'house' && r.signed_margin != null);
    // Races with no opponent all sit at exactly ±100; they go in a block past each end instead of one tall column.
    const unopposed = (d) => d.n_cands <= 1 || Math.abs(d.signed_margin) >= 99.5;
    const contested = rows.filter((d) => !unopposed(d));
    const w0 = Math.max(280, el.clientWidth || 600);
    const r = w0 < 520 ? 2.6 : 4;
    const step = 2 * r + 1;
    const ROWS = 8;
    const blockW = (n) => Math.ceil(n / ROWS) * step;
    const unR = rows.filter((d) => unopposed(d) && d.signed_margin < 0), unD = rows.filter((d) => unopposed(d) && d.signed_margin > 0);
    const pad = { l: 16 + (unR.length ? blockW(unR.length) + 14 : 0), r: 16 + (unD.length ? blockW(unD.length) + 14 : 0), t: 22, b: 30 };
    const LIM = Math.min(100, Math.ceil((d3.max(contested, (d) => Math.abs(d.signed_margin)) || 60) / 10) * 10);
    const x = d3.scaleLinear([-LIM, LIM], [pad.l + r, w0 - pad.r - r]).clamp(true);
    const placed = [];
    for (const d of [...contested].sort((a, b) => a.signed_margin - b.signed_margin)) {
      const px = x(d.signed_margin);
      let k = 0, oy = 0;
      for (;;) {
        oy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
        const hit = placed.some((p) => Math.abs(p.x - px) < step && Math.abs(p.oy - oy) < step);
        if (!hit) break;
        k += 1;
      }
      placed.push({ x: px, oy, d });
    }
    const half = Math.max(d3.max(placed, (p) => Math.abs(p.oy)) || 0, (ROWS * step) / 2);
    const h = pad.t + 2 * half + 2 * r + pad.b;
    const { svg, w } = K.svg(el, h);
    const cy = pad.t + half + r;
    const g = svg.append('g');
    const ticks = x.ticks(w0 < 520 ? 4 : 8);  // symmetric domain, so 0 ("Even") is always a tick
    K.vgrid(g, x, ticks, pad.t, h - pad.b + 4, tickMargin);
    // unopposed blocks: columns filled from the axis end outward
    for (const [set, side] of [[unR, -1], [unD, 1]]) {
      if (!set.length) continue;
      const edge = side < 0 ? pad.l - 14 : w - pad.r + 14;
      set.forEach((d, i) => {
        const col = Math.floor(i / ROWS), row = i % ROWS;
        placed.push({ x: edge + side * (col * step + r), oy: (row - (ROWS - 1) / 2) * step, d });
      });
      const mid = edge + side * (blockW(set.length) / 2);
      g.append('text').attr('x', mid).attr('y', 14).attr('text-anchor', 'middle').text('Unopposed');
    }
    const tip = K.tip(el);
    svg.append('g').selectAll('circle').data(placed).join('circle')
      .attr('cx', (p) => p.x).attr('cy', (p) => cy + p.oy).attr('r', r)
      .style('fill', (p) => (p.d.called ? K.party(p.d.winner_party) : 'var(--color-panel)'))
      .style('stroke', (p) => (p.d.called ? 'var(--color-panel)' : K.party(p.d.winner_party)))
      .style('stroke-width', (p) => (p.d.called ? 1 : 1.6));
    K.nearest(svg, placed.map((p) => ({ ...p, y: cy + p.oy })), w, h, 3 * r, (p, ev) => tip.show([
      { text: p.d.race, head: true },
      { text: `${p.d.winner_name || '—'} (${K.partyName(p.d.winner_party)}) ${p.d.called ? 'won' : 'leads'}`, color: K.party(p.d.winner_party) },
      { text: `Margin ${K.margin(p.d.signed_margin)} · ${K.pct(p.d.reporting, 0)} reporting` },
    ], ev), tip.hide);
  });

  // ---- Senate and governor races vs the 2024 presidential margin in the state
  dash.draw('statewide', (el) => {
    const got = K.get(el, 'statewide_vs_pres');
    if (!got) return;
    const rows = got[0];
    const label = (d) => `${d.state} ${d.office === 'sen' ? 'Senate' : 'Governor'}`;
    const rowH = 22, pad = { t: 8, b: 28 };
    const h = pad.t + rows.length * rowH + pad.b;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, rows.map(label)) + 10;
    const rw = K.textWidth(svg, ['D+00.0 vs 2024']) + 8;
    const ext = d3.extent(rows.flatMap((d) => [d.pres24, d.margin]).concat([0]));
    const x = d3.scaleLinear(ext, [lw, w - rw]).nice();
    const g = svg.append('g');
    K.vgrid(g, x, x.ticks(w < 520 ? 4 : 8), pad.t, h - pad.b + 2, tickMargin);
    const tip = K.tip(el);
    rows.forEach((d, i) => {
      const y = pad.t + i * rowH + rowH / 2;
      const row = svg.append('g');
      row.append('text').attr('x', lw - 10).attr('y', y + 4).attr('text-anchor', 'end').attr('class', 'mx-strong').text(label(d));
      row.append('line').attr('x1', x(d.pres24)).attr('x2', x(d.margin)).attr('y1', y).attr('y2', y)
        .style('stroke', K.party(d.winner_party)).style('stroke-width', 2).style('stroke-linecap', 'round').style('opacity', 0.55);
      row.append('circle').attr('cx', x(d.pres24)).attr('cy', y).attr('r', 4.5).style('fill', 'var(--cds-chart-muted)').style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
      row.append('circle').attr('cx', x(d.margin)).attr('cy', y).attr('r', 5.5)
        .style('fill', d.called ? K.party(d.winner_party) : 'var(--color-panel)').style('stroke', d.called ? 'var(--color-panel)' : K.party(d.winner_party)).style('stroke-width', d.called ? 1.5 : 2);
      row.append('text').attr('x', w - rw + 8).attr('y', y + 4).text(`${K.margin(d.over)} vs 2024`);
      row.append('rect').attr('x', 0).attr('y', y - rowH / 2).attr('width', w).attr('height', rowH).attr('fill', 'transparent')
        .on('pointermove', (ev) => tip.show([
          { text: d.race, head: true },
          { text: `${d.dem_name || '—'} (D) vs ${d.rep_name || '—'} (R)` },
          { text: `2026: ${K.margin(d.margin)} · ${K.pct(d.reporting, 0)} reporting`, color: K.party(d.winner_party) },
          { text: `2024 president: ${K.margin(d.pres24)}`, color: 'var(--cds-chart-muted)' },
        ], ev)).on('pointerleave', tip.hide);
    });
  });

  // ---- County shift map (7 classes) and its legend
  const BINS = [-20, -10, -3, 3, 10, 20];  // points; shift = 2026 margin minus 2024 presidential margin
  const binColor = (s) => {
    if (s == null) return 'transparent';  // no comparable race: outline only, so gray always means "within 3"
    const i = d3.bisectRight(BINS, s);  // 0 = most Republican shift ... 6 = most Democratic
    return `var(--cds-chart-diverging-${7 - i})`;
  };
  const binLabels = ['R 20+', 'R 10–20', 'R 3–10', 'Within 3', 'D 3–10', 'D 10–20', 'D 20+'];

  dash.draw('swing-legend', (el) => {
    el.replaceChildren(...binLabels.map((t, i) => {
      const k = document.createElement('span');
      k.className = 'mx-key';
      const s = document.createElement('span');
      s.className = 'mx-sw mx-sq';
      s.style.background = `var(--cds-chart-diverging-${7 - i})`;
      k.append(s, document.createTextNode(t));
      return k;
    }), (() => {
      const k = document.createElement('span');
      k.className = 'mx-key';
      const s = document.createElement('span');
      s.className = 'mx-sw mx-sq';
      s.style.background = 'transparent';
      s.style.boxShadow = 'inset 0 0 0 1px var(--color-fg-muted)';
      k.append(s, document.createTextNode('No comparable race'));
      return k;
    })());
  });

  dash.draw('swing-map', (el) => {
    const got = K.get(el, 'county_swing', 'geo_counties', 'geo_states');
    if (!got) return;
    const [sw, counties, states] = got;
    const byFips = new Map(sw.map((d) => [d.fips, d]));
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 975 610').attr('role', 'img');
    const tip = K.tip(el);
    svg.append('g').selectAll('path').data(counties).join('path')
      .attr('d', (c) => c.d)
      .style('fill', (c) => binColor(byFips.get(c.fips)?.shift))
      .style('stroke', (c) => (byFips.has(c.fips) ? null : 'var(--color-border-line)'))
      .style('stroke-width', (c) => (byFips.has(c.fips) ? null : 0.6))
      .on('pointermove', function (ev, c) {
        const d = byFips.get(c.fips);
        d3.select(this).style('stroke', 'var(--color-fg)').style('stroke-width', 1.2).raise();
        tip.show(d ? [
          { text: `${d.county}, ${d.state}`, head: true },
          { text: `2024 president ${K.margin(d.m24)} → 2026 ${d.office === 'sen' ? 'Senate' : 'governor'} ${K.margin(d.m26)}` },
          { text: `Shift: ${K.toward(d.shift)}`, color: binColor(d.shift) },
          { text: `${K.int(d.votes)} votes · ${K.pct(d.reporting, 0)} reporting` },
        ] : [{ text: c.name || c.fips, head: true }, { text: 'No comparable race' }], ev);
      })
      .on('pointerleave', function (ev, c) {
        d3.select(this).style('stroke', byFips.has(c.fips) ? null : 'var(--color-border-line)').style('stroke-width', byFips.has(c.fips) ? null : 0.6);
        tip.hide();
      });
    svg.append('g').selectAll('path').data(states).join('path').attr('d', (s) => s.d)
      .style('fill', 'none').style('stroke', 'var(--color-panel)').style('stroke-width', 1.2).style('pointer-events', 'none');
  });

  // ---- 2024 vs 2026 county margins
  dash.draw('swing-scatter', (el) => {
    const got = K.get(el, 'county_swing');
    if (!got) return;
    const rows = got[0];
    const w0 = Math.max(280, el.clientWidth || 600);
    const h = Math.min(460, Math.max(280, w0 * 0.85));
    const { svg, w } = K.svg(el, h);
    const pad = { l: 44, r: 10, t: 10, b: 30 };
    const lim = Math.ceil((d3.max(rows, (d) => Math.max(Math.abs(d.m24), Math.abs(d.m26))) || 50) / 10) * 10;
    const x = d3.scaleLinear([-lim, lim], [pad.l, w - pad.r]);
    const y = d3.scaleLinear([-lim, lim], [h - pad.b, pad.t]);
    const size = d3.scaleSqrt([0, d3.max(rows, (d) => d.votes) || 1], [1.2, w < 520 ? 7 : 11]);
    const ticks = x.ticks(w < 520 ? 4 : 6);
    const g = svg.append('g');
    K.vgrid(g, x, ticks, pad.t, h - pad.b, tickMargin);
    for (const t of ticks) {
      g.append('line').attr('class', 'mx-grid-line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t));
      g.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(tickMargin(t));
    }
    g.append('line').attr('class', 'mx-ref').attr('x1', x(-lim)).attr('y1', y(-lim)).attr('x2', x(lim)).attr('y2', y(lim));
    g.append('text').attr('x', x(-lim) + 6).attr('y', pad.t + 12).text('↑ moved toward Democrats');
    g.append('text').attr('x', w - pad.r - 6).attr('y', h - pad.b - 8).attr('text-anchor', 'end').text('moved toward Republicans ↓');
    const pts = [...rows].sort((a, b) => b.votes - a.votes).map((d) => ({ d, x: x(d.m24), y: y(d.m26) }));
    svg.append('g').selectAll('circle').data(pts).join('circle')
      .attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', (p) => size(p.d.votes))
      .style('fill', 'var(--mx-neutral)').style('fill-opacity', 0.55).style('stroke', 'var(--color-panel)').style('stroke-width', 0.8);
    const tip = K.tip(el);
    K.nearest(svg, pts, w, h, 18, (p, ev) => tip.show([
      { text: `${p.d.county}, ${p.d.state}`, head: true },
      { text: `2024 ${K.margin(p.d.m24)} → 2026 ${K.margin(p.d.m26)}` },
      { text: `Shift: ${K.toward(p.d.shift)}` },
    ], ev), tip.hide);
  });

  // ---- Shift by kind of county: median and middle half
  dash.draw('swing-types', (el) => {
    const got = K.get(el, 'swing_by_type');
    if (!got) return;
    const rows = got[0];
    const dims = [...new Set(rows.map((d) => d.dimension))];
    const rowH = 22, headH = 26, pad = { t: 4, b: 28 };
    const h = pad.t + dims.length * headH + rows.length * rowH + pad.b;
    const { svg, w } = K.svg(el, h);
    const lw = K.textWidth(svg, rows.map((d) => d.group)) + 12;
    const vw = K.textWidth(svg, ['+00.0']) + 8;
    const ext = d3.extent(rows.flatMap((d) => [d.p25, d.p75]).concat([0]));
    const x = d3.scaleLinear(ext, [lw, w - vw]).nice();
    const g = svg.append('g');
    K.vgrid(g, x, x.ticks(w < 520 ? 4 : 6), pad.t, h - pad.b + 2, (t) => (t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`));
    const tip = K.tip(el);
    let yy = pad.t;
    for (const dim of dims) {
      svg.append('text').attr('x', 0).attr('y', yy + 17).attr('class', 'mx-strong').text(dim);
      yy += headH;
      for (const d of rows.filter((r) => r.dimension === dim).sort((a, b) => a.order - b.order)) {
        const y = yy + rowH / 2;
        svg.append('text').attr('x', lw - 12).attr('y', y + 4).attr('text-anchor', 'end').text(d.group);
        svg.append('rect').attr('x', x(d.p25)).attr('y', y - 4).attr('width', Math.max(2, x(d.p75) - x(d.p25))).attr('height', 8).attr('rx', 4)
          .style('fill', 'var(--cds-chart-muted)');
        svg.append('circle').attr('cx', x(d.median_shift)).attr('cy', y).attr('r', 5.5).style('fill', 'var(--mx-neutral)').style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
        svg.append('text').attr('x', w - vw + 8).attr('y', y + 4).text(`${d.median_shift > 0 ? '+' : ''}${d.median_shift.toFixed(1)}`);
        svg.append('rect').attr('x', 0).attr('y', yy).attr('width', w).attr('height', rowH).attr('fill', 'transparent')
          .on('pointermove', (ev) => tip.show([
            { text: `${dim}: ${d.group}`, head: true },
            { text: `Median county ${K.toward(d.median_shift)}` },
            { text: `Middle half: ${d.p25.toFixed(1)} to ${d.p75.toFixed(1)} pts` },
            { text: `Vote-weighted: ${K.toward(d.weighted_shift)} · ${K.int(d.counties)} counties` },
          ], ev)).on('pointerleave', tip.hide);
        yy += rowH;
      }
    }
  });
})();
