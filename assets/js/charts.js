/* SVG charts. No dependencies, no canvas — plain SVG so text stays selectable
 * and everything scales. Each chart mounts into a placeholder div that the
 * report renderer already put in the DOM.
 *
 * Colour follows the job, not the mood:
 *   trend over time      -> one hue (the accent), area fill
 *   magnitude comparison -> one hue, emphasis on the bar that matters
 *   polarity             -> semantic green/red (supply removed vs added)
 *   part-to-whole        -> the categorical set, validated for CVD
 * Every chart also emits a <table> for screen readers and for anyone who wants
 * the numbers rather than the shape.
 */

import { usd, num, pct, esc, reduced } from './common.js';

const NS = 'http://www.w3.org/2000/svg';

/** Validated categorical set — see data/SCHEMA.md for how it was checked. */
export const CATEGORICAL = ['#7c83ff', '#00a3b4', '#e0704f', '#b06ae0'];

/** Only a literal colour may reach a style attribute. */
const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? c.trim() : null);

const fmt = (v, unit) => {
  if (unit === 'usd') return usd(v);
  if (unit === 'coins') return `${num(v)} монет`;
  if (unit === 'pct') return pct(v);
  return num(v);
};

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/** Numbers-behind-the-picture, always present. */
function dataTable(spec) {
  const rows = spec.series
    .map(s => `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.display || fmt(s.value, spec.unit))}</td></tr>`)
    .join('');
  return `<details class="chart-data">
    <summary>Показать числа</summary>
    <table><tbody>${rows}</tbody></table>
  </details>`;
}

function shell(host, spec) {
  host.innerHTML = `
    ${spec.title ? `<div class="chart-title">${esc(spec.title)}</div>` : ''}
    <div class="chart-plot"></div>
    ${spec.note ? `<div class="chart-note">${esc(spec.note)}</div>` : ''}
    ${dataTable(spec)}`;
  return host.querySelector('.chart-plot');
}

/* ── trend over time ─────────────────────────────────────────────
   One series, so no legend: the title names it. Line + soft fill,
   crosshair and tooltip on hover, last point always marked.        */

function areaChart(host, spec) {
  const plot = shell(host, spec);
  const pts = spec.series;
  if (pts.length < 2) return;

  const W = 720, H = 210, padL = 8, padR = 8, padT = 16, padB = 26;
  const max = Math.max(...pts.map(p => p.value));
  const min = Math.min(0, ...pts.map(p => p.value));
  const x = i => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none',
    role: 'img', 'aria-label': spec.title || 'график',
  }, plot);

  // recessive baseline + one guide at the peak
  el('line', { x1: padL, x2: W - padR, y1: y(min), y2: y(min), class: 'c-axis' }, svg);
  el('line', { x1: padL, x2: W - padR, y1: y(max), y2: y(max), class: 'c-grid' }, svg);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const fill = `${line}L${x(pts.length - 1).toFixed(1)},${y(min)}L${x(0)},${y(min)}Z`;

  const grad = el('linearGradient', { id: `g${spec.uid}`, x1: 0, y1: 0, x2: 0, y2: 1 }, el('defs', {}, svg));
  el('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.30' }, grad);
  el('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0' }, grad);

  const area = el('path', { d: fill, fill: `url(#g${spec.uid})`, class: 'c-area' }, svg);
  const stroke = el('path', { d: line, class: 'c-line' }, svg);

  /* Screen-space length of the polyline.
     getTotalLength() would be the obvious call, and it is wrong here: the line
     is drawn with vector-effect: non-scaling-stroke, so the dash pattern is
     measured in screen pixels, while getTotalLength() answers in viewBox units
     (720 wide). On a wide screen the path is several times longer than that,
     the dash runs out early and the tail of the line is simply never drawn.
     The path is straight segments between points we already have, so measure
     it directly with the two axis scales applied. */
  const screenLen = () => {
    const b = svg.getBoundingClientRect();
    const sx = (b.width || W) / W, sy = (b.height || H) / H;
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot((x(i) - x(i - 1)) * sx, (y(pts[i].value) - y(pts[i - 1].value)) * sy);
    }
    return len;
  };

  // draw-in
  if (!reduced()) {
    const len = screenLen();
    stroke.style.strokeDasharray = len;
    stroke.style.strokeDashoffset = len;
    area.style.opacity = 0;
    requestAnimationFrame(() => {
      stroke.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)';
      stroke.style.strokeDashoffset = 0;
      area.style.transition = 'opacity .8s ease .35s';
      area.style.opacity = 1;
    });
    // A leftover dasharray breaks the line again the moment the window gets
    // wider than it was when the animation ran. Drop it once it has played.
    const clear = e => {
      if (e && e.propertyName !== 'stroke-dashoffset') return;
      stroke.style.strokeDasharray = '';
      stroke.style.strokeDashoffset = '';
      stroke.style.transition = '';
    };
    stroke.addEventListener('transitionend', clear, { once: true });
    setTimeout(clear, 1600);          // transitionend never fires on a hidden tab
  }

  const last = pts.length - 1;
  el('circle', { cx: x(last), cy: y(pts[last].value), r: 4, class: 'c-dot-last' }, svg);

  // hover layer
  const cross = el('line', { class: 'c-cross', y1: padT, y2: y(min), opacity: 0 }, svg);
  const dot = el('circle', { r: 4.5, class: 'c-dot', opacity: 0 }, svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  plot.appendChild(tip);

  const nearest = clientX => {
    const b = svg.getBoundingClientRect();
    const rel = ((clientX - b.left) / b.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((_, i) => { const d = Math.abs(x(i) - rel); if (d < bd) { bd = d; best = i; } });
    return best;
  };

  const show = e => {
    const i = nearest(e.clientX);
    const p = pts[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.value)); dot.setAttribute('opacity', 1);
    tip.innerHTML = `<b>${esc(p.display || fmt(p.value, spec.unit))}</b><span>${esc(p.label)}</span>`;
    tip.style.opacity = 1;
    const frac = x(i) / W;
    tip.style.left = `${frac * 100}%`;
    tip.style.transform = `translate(${frac > 0.75 ? '-100%' : frac < 0.25 ? '0' : '-50%'}, 0)`;
  };
  const hide = () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); tip.style.opacity = 0; };

  plot.addEventListener('pointermove', show);
  plot.addEventListener('pointerleave', hide);

  // sparse axis labels: first, last, and the peak
  const peak = pts.indexOf(pts.reduce((a, b) => (b.value > a.value ? b : a)));
  const marks = [...new Set([0, peak, last])].sort((a, b) => a - b);
  const axis = document.createElement('div');
  axis.className = 'chart-axis';
  axis.innerHTML = marks
    .map(i => `<span style="left:${(x(i) / W * 100).toFixed(2)}%;transform:translateX(${i === 0 ? '0' : i === last ? '-100%' : '-50%'})">${esc(pts[i].label)}</span>`)
    .join('');
  plot.appendChild(axis);
}

/* ── magnitude ───────────────────────────────────────────────────
   Horizontal bars, one hue. `emphasis` highlights the bar that carries
   the point and greys the rest — the honest form when one value is the
   story rather than the set.                                        */

function barChart(host, spec) {
  const plot = shell(host, spec);
  const max = Math.max(...spec.series.map(s => Math.abs(s.value)));
  const wrap = document.createElement('div');
  wrap.className = 'c-bars';

  spec.series.forEach((s, i) => {
    const emph = spec.emphasis == null || spec.emphasis === i;
    const row = document.createElement('div');
    row.className = `c-bar ${emph ? '' : 'muted'}`;
    row.innerHTML = `
      <span class="c-bar-l">${esc(s.label)}</span>
      <span class="c-bar-track"><i style="--w:${(Math.abs(s.value) / max * 100).toFixed(2)}%;${safeColor(s.color) ? `background:${safeColor(s.color)}` : ''}"></i></span>
      <span class="c-bar-v">${esc(s.display || fmt(s.value, spec.unit))}</span>`;
    wrap.appendChild(row);
  });
  plot.appendChild(wrap);
  animateBars(wrap);
}

/* ── polarity ────────────────────────────────────────────────────
   Two opposing quantities on a shared scale. Semantic colours: the
   direction IS the meaning, so green removes supply and red adds it. */

function compareChart(host, spec) {
  const plot = shell(host, spec);
  const max = Math.max(...spec.series.map(s => Math.abs(s.value)));
  const wrap = document.createElement('div');
  wrap.className = 'c-bars c-compare';
  spec.series.forEach(s => {
    const row = document.createElement('div');
    row.className = `c-bar ${s.tone || ''}`;
    row.innerHTML = `
      <span class="c-bar-l">${esc(s.label)}</span>
      <span class="c-bar-track"><i style="--w:${(Math.abs(s.value) / max * 100).toFixed(2)}%"></i></span>
      <span class="c-bar-v">${esc(s.display || fmt(s.value, spec.unit))}</span>`;
    wrap.appendChild(row);
  });
  plot.appendChild(wrap);
  if (spec.ratio) {
    const r = document.createElement('div');
    r.className = 'c-ratio';
    r.textContent = spec.ratio;
    plot.appendChild(r);
  }
  animateBars(wrap);
}

/* ── scenario ladder ─────────────────────────────────────────────
   Price targets on one axis with the live price marked, so the reader
   sees distance-to-target rather than reading four numbers.          */

function ladderChart(host, spec) {
  const plot = shell(host, spec);
  const vals = spec.series.map(s => s.value).concat(spec.current ? [spec.current] : []);
  const lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.05;
  const at = v => ((v - lo) / (hi - lo)) * 100;

  const wrap = document.createElement('div');
  wrap.className = 'c-ladder';
  wrap.innerHTML = `
    <div class="c-ladder-track">
      ${spec.current != null ? `<div class="c-now" style="left:${at(spec.current).toFixed(2)}%"><span>сейчас ${esc(spec.currentLabel || fmt(spec.current, spec.unit))}</span></div>` : ''}
    </div>
    ${spec.series.map((s, i) => {
      const x = at(s.value);
      // keep the outermost labels inside the box instead of centring them off it
      const shift = x < 14 ? '0' : x > 86 ? '-100%' : '-50%';
      return `
      <div class="c-rung" style="--x:${x.toFixed(2)}%;--i:${i}">
        <i class="c-rung-dot ${esc(s.tone || '')}"></i>
        <span class="c-rung-v" style="transform:translateX(${shift})">${esc(s.display || fmt(s.value, spec.unit))}</span>
        <span class="c-rung-l" style="transform:translateX(${shift})">${esc(s.label)}</span>
      </div>`; }).join('')}`;
  plot.appendChild(wrap);
}

/** Bars grow from the baseline once scrolled into view. */
function animateBars(wrap) {
  const bars = wrap.querySelectorAll('.c-bar-track i');
  if (reduced()) { bars.forEach(b => b.style.width = 'var(--w)'); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      wrap.querySelectorAll('.c-bar-track i').forEach((b, i) => {
        b.style.transitionDelay = `${i * 90}ms`;
        b.style.width = 'var(--w)';
      });
      io.disconnect();
    });
  }, { threshold: 0.25 });
  io.observe(wrap);
}

const RENDERERS = { area: areaChart, bars: barChart, compare: compareChart, ladder: ladderChart };

/** Mount every chart placeholder left in the document. */
export function mountCharts(root, specs) {
  root.querySelectorAll('[data-chart]').forEach(host => {
    const spec = specs[Number(host.dataset.chart)];
    if (!spec || !(spec.series || []).length) return;
    spec.uid = host.dataset.chart;
    (RENDERERS[spec.type] || barChart)(host, spec);
  });
}
