// Deliberately self-contained (serialized into /app.js like portfolio.js and intent.js): no module scope.
// Small SVG/HTML chart kit for FINN's light canvas. Palette validated with the dataviz checks
// (adjacent and all-pairs CVD separation, contrast >= 3:1 on white):
//   series: portfolio #1f8a70 · Nifty 50 #6250d6 · sector/third #c98500
//   diverging returns: gain #1f8a70 ↔ #f0efec ↔ loss #d0453b · correlation: #2a78d6 (−) ↔ #f0efec ↔ #d0453b (+)
// Marks: 2px lines, 8px dots with a 2px surface ring, bars <= 14px with rounded data ends, hairline grids.
// Every chart has hover/focus tooltips; values are always also available in a table on the page.
export default function createChartTools() {
  'use strict';
  const C = { s1: '#1f8a70', s2: '#6250d6', s3: '#c98500', grid: '#e9edf0', axis: '#8a969d', ink: '#202a35', ink2: '#5b6875', gain: '#1f8a70', loss: '#d0453b', mid: '#f0efec', neg: '#2a78d6', surface: '#ffffff' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = {
    pct: (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%'),
    pctPlain: (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d) + '%'),
    num: (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d)),
    inr: (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 })),
    compact: (v) => (!Number.isFinite(v) ? '—' : v >= 1e7 ? (v / 1e7).toFixed(1) + ' Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + ' L' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v))),
  };
  const registry = new Map();
  let seq = 0, tip = null;

  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join(''); }
  function luminance(c) { const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  const textOn = (fill) => (luminance(fill) < 0.32 ? '#ffffff' : '#1b232c');
  function diverging(v, max, pos = C.gain, neg = C.loss) { if (!Number.isFinite(v)) return '#f4f5f6'; const t = Math.min(1, Math.abs(v) / (max || 1)); return v >= 0 ? mix(C.mid, pos, 0.18 + 0.82 * t) : mix(C.mid, neg, 0.18 + 0.82 * t); }
  function ticks(min, max, count = 4) {
    if (!(max > min)) { const d = Math.abs(min) || 1; min -= d * 0.1; max += d * 0.1; }
    const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }
  const monthLabel = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }) + (d.slice(5, 7) === '01' ? " '" + d.slice(2, 4) : '');

  // Line chart with crosshair tooltip. series: [{name, values, color, area}] aligned to dates.
  function line({ width, height = 240, dates, series, yFormat = fmt.num, refs = [], label = 'Line chart', endLabels = true, domain }) {
    const id = 'viz' + ++seq;
    const m = { l: 46, r: endLabels ? 70 : 14, t: 12, b: 24 }, w = Math.max(120, width - m.l - m.r), h = height - m.t - m.b;
    const all = series.flatMap((s) => s.values).filter(Number.isFinite).concat(refs.map((r) => r.value));
    let lo = domain ? domain[0] : Math.min(...all), hi = domain ? domain[1] : Math.max(...all);
    if (!domain) { const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad; }
    const yt = ticks(lo, hi, height < 160 ? 3 : 4);
    lo = Math.min(lo, yt[0]); hi = Math.max(hi, yt.at(-1));
    const n = dates.length, x = (i) => m.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w), y = (v) => m.t + h - ((v - lo) / (hi - lo || 1)) * h;
    const path = (vals) => { let d = '', pen = false; vals.forEach((v, i) => { if (!Number.isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; }); return d; };
    const months = []; let lastMonth = '';
    dates.forEach((d, i) => { const mo = d.slice(0, 7); if (mo !== lastMonth) { lastMonth = mo; if (i > 0) months.push(i); } });
    const every = Math.ceil(months.length / Math.max(2, Math.floor(w / 70)));
    let svg = `<svg class="viz-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" tabindex="0" data-viz-line="${id}">`;
    for (const t of yt) svg += `<line x1="${m.l}" x2="${m.l + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${C.grid}" stroke-width="1"/><text x="${m.l - 8}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" class="viz-tick">${esc(yFormat(t, 0))}</text>`;
    months.filter((_, k) => k % every === 0).forEach((i) => { svg += `<text x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="viz-tick">${esc(monthLabel(dates[i]))}</text>`; });
    for (const r of refs) svg += `<line x1="${m.l}" x2="${m.l + w}" y1="${y(r.value).toFixed(1)}" y2="${y(r.value).toFixed(1)}" stroke="#b9c2c9" stroke-width="1"/>${r.label ? `<text x="${m.l + 4}" y="${(y(r.value) - 4).toFixed(1)}" class="viz-tick">${esc(r.label)}</text>` : ''}`;
    for (const s of series) {
      if (s.area) { const base = Math.max(lo, Math.min(hi, s.areaBase ?? 0)); const p = path(s.values); if (p) svg += `<path d="${p} L${x(n - 1).toFixed(1)} ${y(base).toFixed(1)} L${x(s.values.findIndex(Number.isFinite)).toFixed(1)} ${y(base).toFixed(1)} Z" fill="${s.color}" opacity=".1"/>`; }
      svg += `<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (endLabels) {
      const ends = series.map((s) => { let i = s.values.length - 1; while (i >= 0 && !Number.isFinite(s.values[i])) i--; return i < 0 ? null : { s, i, yy: y(s.values[i]) }; }).filter(Boolean).sort((a, b) => a.yy - b.yy);
      let lastY = -99;
      for (const e of ends) {
        svg += `<circle cx="${x(e.i).toFixed(1)}" cy="${e.yy.toFixed(1)}" r="4" fill="${e.s.color}" stroke="${C.surface}" stroke-width="2"/>`;
        if (e.yy - lastY >= 13) { svg += `<text x="${(x(e.i) + 8).toFixed(1)}" y="${(e.yy + 3).toFixed(1)}" class="viz-end">${esc(yFormat(e.s.values[e.i]))}</text>`; lastY = e.yy; }
      }
    }
    svg += `<line class="viz-cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + h}" stroke="#7d8992" stroke-width="1" visibility="hidden"/>`;
    series.forEach((s, k) => { svg += `<circle class="viz-dot" data-k="${k}" r="4" fill="${s.color}" stroke="${C.surface}" stroke-width="2" visibility="hidden"/>`; });
    svg += `<rect class="viz-hit" x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent"/></svg>`;
    registry.set(id, { dates, series, x, y, m, w, n, yFormat });
    return svg;
  }
  function legend(items) {
    return `<div class="viz-legend">${items.map((i) => `<span><i style="background:${i.color}"${i.kind === 'line' ? ' class="line"' : ''}></i>${esc(i.name)}</span>`).join('')}</div>`;
  }
  // Horizontal bars; diverging when values can be negative.
  function bars({ width, items, format = fmt.pct, label = 'Bar chart', color = C.s1, diverging: div = items.some((i) => i.value < 0), max }) {
    const rowH = 22, labelW = Math.min(110, Math.max(64, width * 0.24)), valueW = 62, plotW = Math.max(60, width - labelW - valueW - 8);
    const vmax = max || Math.max(...items.map((i) => Math.abs(i.value)).filter(Number.isFinite), 0.0001);
    const zero = div ? labelW + plotW / 2 : labelW, scale = (div ? plotW / 2 : plotW) / vmax;
    const height = items.length * rowH + 6;
    let svg = `<svg class="viz-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">`;
    if (div) svg += `<line x1="${zero}" x2="${zero}" y1="0" y2="${height}" stroke="#c7cfd5" stroke-width="1"/>`;
    items.forEach((it, i) => {
      const yy = i * rowH + 4, v = Number.isFinite(it.value) ? it.value : 0, len = Math.max(Number.isFinite(it.value) && it.value !== 0 ? 2 : 0, Math.abs(v) * scale);
      const fill = it.color || (div ? (v >= 0 ? C.gain : C.loss) : color), x0 = v >= 0 ? zero : zero - len, th = 12, r = Math.min(4, len / 2);
      const pathD = v >= 0 ? `M${x0} ${yy + 2} h${Math.max(0, len - r)} a${r} ${r} 0 0 1 ${r} ${r} v${th - 2 * r} a${r} ${r} 0 0 1 -${r} ${r} h-${Math.max(0, len - r)} Z` : `M${x0 + len} ${yy + 2} h-${Math.max(0, len - r)} a${r} ${r} 0 0 0 -${r} ${r} v${th - 2 * r} a${r} ${r} 0 0 0 ${r} ${r} h${Math.max(0, len - r)} Z`;
      svg += `<g class="viz-mark" tabindex="0" data-tip-title="${esc(it.label)}" data-tip-lines="${esc(it.tip || format(it.value))}"${it.stock ? ` data-stock="${esc(it.stock)}"` : ''}><rect x="0" y="${yy}" width="${width}" height="${rowH - 2}" fill="transparent"/><text x="${labelW - 8}" y="${yy + 12}" text-anchor="end" class="viz-label">${esc(it.label)}</text>${len ? `<path d="${pathD}" fill="${fill}"/>` : ''}<text x="${div ? (v >= 0 ? zero + len + 5 : zero - len - 5) : labelW + len + 5}" y="${yy + 12}" text-anchor="${div && v < 0 ? 'end' : 'start'}" class="viz-value">${esc(format(it.value))}</text></g>`;
    });
    return svg + '</svg>';
  }
  // Two measures per row (e.g. weight vs share of risk), same unit.
  function paired({ width, items, names, colors = [C.s1, C.s2], format = fmt.pctPlain, label = 'Paired bars' }) {
    const rowH = 30, labelW = Math.min(100, Math.max(60, width * 0.2)), valueW = 52, plotW = Math.max(60, width - labelW - valueW - 6);
    const vmax = Math.max(...items.flatMap((i) => [i.a, i.b]).filter(Number.isFinite), 0.0001), scale = plotW / vmax, height = items.length * rowH + 4;
    let svg = `<svg class="viz-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">`;
    items.forEach((it, i) => {
      const yy = i * rowH + 3;
      svg += `<g class="viz-mark" tabindex="0" data-tip-title="${esc(it.label)}" data-tip-lines="${esc(names[0] + ': ' + format(it.a) + '\n' + names[1] + ': ' + format(it.b))}"${it.stock ? ` data-stock="${esc(it.stock)}"` : ''}><rect x="0" y="${yy}" width="${width}" height="${rowH - 2}" fill="transparent"/><text x="${labelW - 8}" y="${yy + 15}" text-anchor="end" class="viz-label">${esc(it.label)}</text>`;
      [it.a, it.b].forEach((v, k) => { const len = Math.max(Number.isFinite(v) && v > 0 ? 2 : 0, (Number.isFinite(v) ? v : 0) * scale); svg += `<rect x="${labelW}" y="${yy + 4 + k * 10}" width="${len.toFixed(1)}" height="8" rx="3" fill="${colors[k]}"/><text x="${labelW + len + 5}" y="${yy + 11 + k * 10}" class="viz-value small">${esc(format(v))}</text>`; });
      svg += '</g>';
    });
    return svg + '</svg>';
  }
  // Scatter: x and y in the same chart, dot area ~ weight. Labels only for the largest points.
  function scatter({ width, height = 280, points, xFormat = fmt.pctPlain, yFormat = fmt.pct, xLabel, yLabel, ref, label = 'Scatter chart', labelTop = 5 }) {
    const m = { l: 48, r: 18, t: 14, b: 36 }, w = width - m.l - m.r, h = height - m.t - m.b;
    const xs = points.map((p) => p.x).concat(ref ? [ref.x] : []).filter(Number.isFinite), ys = points.map((p) => p.y).concat(ref ? [ref.y] : []).filter(Number.isFinite);
    let x0 = Math.min(0, ...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const px = (x1 - x0) * 0.08 || 1, py = (y1 - y0) * 0.1 || 1; x1 += px; y0 -= py; y1 += py;
    const xt = ticks(x0, x1, Math.max(2, Math.floor(w / 90))), yt = ticks(y0, y1, 4);
    x0 = Math.min(x0, xt[0]); x1 = Math.max(x1, xt.at(-1)); y0 = Math.min(y0, yt[0]); y1 = Math.max(y1, yt.at(-1));
    const X = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * w, Y = (v) => m.t + h - ((v - y0) / (y1 - y0 || 1)) * h;
    const wmax = Math.max(...points.map((p) => p.size || 1));
    let svg = `<svg class="viz-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">`;
    for (const t of yt) svg += `<line x1="${m.l}" x2="${m.l + w}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 ? '#c7cfd5' : C.grid}"/><text x="${m.l - 8}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end" class="viz-tick">${esc(yFormat(t, 0))}</text>`;
    for (const t of xt) svg += `<text x="${X(t).toFixed(1)}" y="${m.t + h + 14}" text-anchor="middle" class="viz-tick">${esc(xFormat(t, 0))}</text>`;
    svg += `<text x="${m.l + w}" y="${height - 4}" text-anchor="end" class="viz-axis-label">${esc(xLabel)} →</text><text x="${m.l}" y="${m.t - 3}" class="viz-axis-label">↑ ${esc(yLabel)}</text>`;
    if (ref) svg += `<line x1="${X(ref.x).toFixed(1)}" x2="${X(ref.x).toFixed(1)}" y1="${m.t}" y2="${m.t + h}" stroke="#d3d9de" stroke-dasharray="0"/><line x1="${m.l}" x2="${m.l + w}" y1="${Y(ref.y).toFixed(1)}" y2="${Y(ref.y).toFixed(1)}" stroke="#d3d9de"/>`;
    // Selective labels: the extremes first, then the largest weights; skip any label that would collide.
    const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const radius = (p) => 4 + 4 * Math.sqrt((p.size || 1) / wmax);
    const boxes = [];
    const fits = (bx) => bx.x + bx.w <= m.l + w + 4 && !boxes.some((o) => bx.x < o.x + o.w && bx.x + bx.w > o.x && bx.y < o.y + o.h && bx.y + bx.h > o.y);
    const dots = valid.map((p) => ({ x: X(p.x) - radius(p), y: Y(p.y) - radius(p), w: radius(p) * 2, h: radius(p) * 2 }));
    const order = [...new Set([valid.reduce((a, b) => (b.y > a.y ? b : a), valid[0]), valid.reduce((a, b) => (b.y < a.y ? b : a), valid[0]), valid.reduce((a, b) => (b.x > a.x ? b : a), valid[0]), ...[...valid].sort((a, b) => (b.size || 0) - (a.size || 0))].filter(Boolean))];
    const labels = new Map();
    if (ref) boxes.push({ x: X(ref.x) + 7, y: Y(ref.y) - 18, w: ref.label.length * 6 + 4, h: 12 });
    for (const p of order) {
      if (labels.size >= labelTop) break;
      const r = radius(p), lw = p.label.length * 6.2 + 4;
      for (const cand of [{ x: X(p.x) + r + 3, y: Y(p.y) - 6, anchor: 'start' }, { x: X(p.x) - r - 3 - lw, y: Y(p.y) - 6, anchor: 'end' }]) {
        const bx = { x: cand.x, y: cand.y, w: lw, h: 12 };
        if (fits(bx) && !dots.some((d, i) => valid[i] !== p && bx.x < d.x + d.w && bx.x + bx.w > d.x && bx.y < d.y + d.h && bx.y + bx.h > d.y)) { boxes.push(bx); labels.set(p, cand); break; }
      }
    }
    for (const p of [...valid].sort((a, b) => (b.size || 0) - (a.size || 0))) {
      const r = radius(p), lab = labels.get(p);
      svg += `<g class="viz-mark" tabindex="0" data-tip-title="${esc(p.label)}" data-tip-lines="${esc(p.tip || yLabel + ': ' + yFormat(p.y) + '\n' + xLabel + ': ' + xFormat(p.x))}"${p.stock ? ` data-stock="${esc(p.stock)}"` : ''}><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="12" fill="transparent"/><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${r.toFixed(1)}" fill="${C.s1}" fill-opacity=".8" stroke="${C.surface}" stroke-width="2"/>${lab ? `<text x="${(lab.anchor === 'end' ? X(p.x) - r - 3 : lab.x).toFixed(1)}" y="${(Y(p.y) + 3).toFixed(1)}" text-anchor="${lab.anchor}" class="viz-label halo">${esc(p.label)}</text>` : ''}</g>`;
    }
    if (ref) svg += `<g class="viz-mark" tabindex="0" data-tip-title="${esc(ref.label)}" data-tip-lines="${esc(yLabel + ': ' + yFormat(ref.y) + '\n' + xLabel + ': ' + xFormat(ref.x))}"><circle cx="${X(ref.x).toFixed(1)}" cy="${Y(ref.y).toFixed(1)}" r="12" fill="transparent"/><rect x="${(X(ref.x) - 5).toFixed(1)}" y="${(Y(ref.y) - 5).toFixed(1)}" width="10" height="10" transform="rotate(45 ${X(ref.x).toFixed(1)} ${Y(ref.y).toFixed(1)})" fill="${C.s2}" stroke="${C.surface}" stroke-width="2"/><text x="${(X(ref.x) + 9).toFixed(1)}" y="${(Y(ref.y) - 8).toFixed(1)}" class="viz-label halo">${esc(ref.label)}</text></g>`;
    return svg + '</svg>';
  }
  // Correlation heatmap (−1..+1), diverging blue ↔ red with a gray midpoint; 2px surface gaps.
  function heatmap({ width, labels, matrix, label = 'Correlation heatmap' }) {
    const lab = 62, n = labels.length, cell = Math.max(10, Math.min(30, Math.floor((width - lab - 4) / n))), size = lab + cell * n + 4;
    let svg = `<svg class="viz-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">`;
    labels.forEach((t, i) => { svg += `<text x="${lab - 6}" y="${lab + i * cell + cell / 2 + 3}" text-anchor="end" class="viz-tick">${esc(t)}</text><text transform="translate(${lab + i * cell + cell / 2 + 3} ${lab - 6}) rotate(-60)" class="viz-tick">${esc(t)}</text>`; });
    matrix.forEach((row, i) => row.forEach((v, j) => {
      const fill = i === j ? '#dfe4e8' : diverging(v, 1, C.loss, C.neg);
      svg += `<rect class="viz-cell" x="${lab + j * cell + 1}" y="${lab + i * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${fill}" data-tip-title="${esc(labels[i] + ' × ' + labels[j])}" data-tip-lines="${esc(i === j ? 'Same holding' : 'Correlation of daily returns: ' + fmt.num(v))}"/>`;
    }));
    return svg + '</svg>';
  }
  function gradientLegend(neg, pos, left, right) {
    return `<div class="viz-gradient"><span>${esc(left)}</span><i style="background:linear-gradient(90deg,${neg},${C.mid},${pos})"></i><span>${esc(right)}</span></div>`;
  }
  // Heat tiles (HTML) for sector/index returns; text inside fills picks white or near-black by luminance.
  function tiles(items, { max, format = fmt.pct } = {}) {
    const vmax = max || Math.max(...items.map((i) => Math.abs(i.value)).filter(Number.isFinite), 0.5);
    return `<div class="viz-tiles">${items.map((i) => { const bg = diverging(i.value, vmax); return `<button class="viz-tile" style="background:${bg};color:${textOn(bg)}" data-tip-title="${esc(i.label)}" data-tip-lines="${esc(i.tip || format(i.value))}"${i.command ? ` data-command="${esc(i.command)}"` : ''}><b>${esc(format(i.value))}</b><span>${esc(i.label)}</span></button>`; }).join('')}</div>`;
  }
  function spark(values, { width = 80, height = 24, color } = {}) {
    const v = (values || []).filter(Number.isFinite);
    if (v.length < 2) return '<span class="spark-empty">No history</span>';
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1, c = color || (v.at(-1) >= v[0] ? C.gain : C.loss);
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${v.map((p, i) => ((i / (v.length - 1)) * (width - 2) + 1).toFixed(1) + ',' + (height - 2 - ((p - lo) / span) * (height - 4)).toFixed(1)).join(' ')}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function range52({ low, high, value, width = 120 }) {
    if (![low, high, value].every(Number.isFinite) || high <= low) return '<span class="spark-empty">—</span>';
    const p = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return `<svg width="${width}" height="14" viewBox="0 0 ${width} 14" role="img" aria-label="52-week range ${fmt.inr(low)} to ${fmt.inr(high)}, last ${fmt.inr(value)}"><rect x="2" y="5" width="${width - 4}" height="4" rx="2" fill="#e4e9ec"/><circle cx="${(2 + p * (width - 4)).toFixed(1)}" cy="7" r="4.5" fill="${C.s1}" stroke="${C.surface}" stroke-width="2"/></svg>`;
  }
  // Volume columns under the price chart (same x positions).
  function columns({ width, height = 70, values, label = 'Volume', highlightLast }) {
    const m = { l: 46, r: 70, t: 4, b: 4 }, w = width - m.l - m.r, h = height - m.t - m.b, n = values.length;
    const vmax = Math.max(...values.filter(Number.isFinite), 1), bw = Math.max(1, (w / n) * 0.7);
    let svg = `<svg class="viz-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><text x="${m.l - 8}" y="${m.t + 9}" text-anchor="end" class="viz-tick">${esc(fmt.compact(vmax))}</text>`;
    values.forEach((v, i) => { if (!Number.isFinite(v)) return; const bh = Math.max(1, (v / vmax) * h); svg += `<rect x="${(m.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w) - bw / 2).toFixed(1)}" y="${(m.t + h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${highlightLast && i === n - 1 ? C.s3 : '#b9c7c1'}"/>`; });
    return svg + '</svg>';
  }

  // ── Tooltips (pointer + keyboard). Labels are untrusted: always textContent. ──
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.setAttribute('role', 'status');
    document.body.appendChild(tip);
    return tip;
  }
  function show(x, y, title, rows) {
    const t = tooltip();
    t.textContent = '';
    if (title) { const h = document.createElement('div'); h.className = 'viz-tip-title'; h.textContent = title; t.appendChild(h); }
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'viz-tip-row';
      if (r.color) { const k = document.createElement('i'); k.style.background = r.color; row.appendChild(k); }
      const b = document.createElement('b'); b.textContent = r.value; row.appendChild(b);
      if (r.name) { const s = document.createElement('span'); s.textContent = r.name; row.appendChild(s); }
      t.appendChild(row);
    }
    t.style.display = 'block';
    const bw = t.offsetWidth, bh = t.offsetHeight;
    t.style.left = Math.max(8, Math.min(innerWidth - bw - 8, x + 14)) + 'px';
    t.style.top = Math.max(8, y - bh - 12 < 8 ? y + 18 : y - bh - 12) + 'px';
  }
  function hide() { if (tip) tip.style.display = 'none'; }
  function lineAt(svg, index, clientX, clientY) {
    const d = registry.get(svg.dataset.vizLine);
    if (!d) return;
    const i = Math.max(0, Math.min(d.n - 1, index));
    const cross = svg.querySelector('.viz-cross');
    cross.setAttribute('x1', d.x(i)); cross.setAttribute('x2', d.x(i)); cross.setAttribute('visibility', 'visible');
    svg.querySelectorAll('.viz-dot').forEach((dot) => { const s = d.series[Number(dot.dataset.k)], v = s.values[i]; if (Number.isFinite(v)) { dot.setAttribute('cx', d.x(i)); dot.setAttribute('cy', d.y(v)); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden'); });
    svg.dataset.index = i;
    const box = svg.getBoundingClientRect();
    show(clientX ?? box.left + d.x(i), clientY ?? box.top + d.m.t + 10, new Date(d.dates[i] + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }), d.series.map((s) => ({ color: s.color, value: d.yFormat(s.values[i]), name: s.name })));
  }
  function bind(root) {
    if (!root || root.dataset.vizBound) return;
    root.dataset.vizBound = '1';
    root.addEventListener('pointermove', (e) => {
      const svg = e.target.closest?.('svg[data-viz-line]');
      if (svg) { const d = registry.get(svg.dataset.vizLine); if (!d) return; const box = svg.getBoundingClientRect(); lineAt(svg, Math.round(((e.clientX - box.left - d.m.l) / d.w) * (d.n - 1)), e.clientX, e.clientY); return; }
      const mark = e.target.closest?.('[data-tip-title]');
      if (mark) show(e.clientX, e.clientY, mark.dataset.tipTitle, String(mark.dataset.tipLines || '').split('\n').map((l) => ({ value: l })));
      else hide();
    });
    root.addEventListener('pointerleave', () => { hide(); root.querySelectorAll('.viz-cross,.viz-dot').forEach((el) => el.setAttribute('visibility', 'hidden')); });
    root.addEventListener('focusin', (e) => {
      const svg = e.target.closest?.('svg[data-viz-line]');
      if (svg) { const d = registry.get(svg.dataset.vizLine); if (d) lineAt(svg, d.n - 1); return; }
      const mark = e.target.closest?.('[data-tip-title]');
      if (mark) { const b = mark.getBoundingClientRect(); show(b.left + b.width / 2, b.top, mark.dataset.tipTitle, String(mark.dataset.tipLines || '').split('\n').map((l) => ({ value: l }))); }
    });
    root.addEventListener('focusout', hide);
    root.addEventListener('keydown', (e) => {
      const svg = e.target.closest?.('svg[data-viz-line]');
      if (!svg || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const d = registry.get(svg.dataset.vizLine), cur = Number(svg.dataset.index ?? d.n - 1), step = e.shiftKey ? 10 : 1;
      lineAt(svg, e.key === 'Home' ? 0 : e.key === 'End' ? d.n - 1 : cur + (e.key === 'ArrowLeft' ? -step : step));
    });
  }
  function reset() { registry.clear(); hide(); }

  return { C, fmt, esc, line, legend, bars, paired, scatter, heatmap, gradientLegend, tiles, spark, range52, columns, bind, reset, diverging, textOn };
}
