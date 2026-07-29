/* Shared helpers: formatting + data loading. */

/** Format a USD amount compactly: $1.24B, $840M, $12.4K, $3.42, $0.00001234 */
export function usd(v, opts = {}) {
  if (v == null || v === '' || !isFinite(v)) return '—';
  const n = Number(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  if (opts.precise || abs < 1) return `${sign}$${trimPrice(abs)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Price with sensible significant digits for sub-dollar tokens. */
export function price(v) {
  if (v == null || !isFinite(v)) return '—';
  const n = Number(v);
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1)    return '$' + n.toFixed(2);
  return '$' + trimPrice(n);
}

function trimPrice(n) {
  if (n === 0) return '0';
  if (n >= 1) return n.toFixed(2);
  // keep 4 significant digits below $1
  const exp = Math.floor(Math.log10(n));
  const decimals = Math.min(12, Math.max(2, -exp + 3));
  return n.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
}

/** Plain number, compact for large values. */
export function num(v, digits = 0) {
  if (v == null || !isFinite(v)) return '—';
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** Percent. Accepts either 0.42 (fraction) or 42 (already percent) via `asFraction`. */
export function pct(v, { asFraction = false, sign = false, digits = 1 } = {}) {
  if (v == null || !isFinite(v)) return '—';
  const n = asFraction ? Number(v) * 100 : Number(v);
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(Math.abs(n) >= 100 ? 0 : digits)}%`;
}

/** CSS class for a signed value. */
export function signClass(v) {
  if (v == null || !isFinite(v) || Number(v) === 0) return 'dim';
  return Number(v) > 0 ? 'pos' : 'neg';
}

/** 2026-07-28 → 28 июл 2026 */
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function date(iso, { short = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return short ? s : `${s} ${d.getUTCFullYear()}`;
}

/** Relative age: "3 дня назад" */
export function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.round(hrs / 24);
  if (days < 31) return `${days} д назад`;
  return date(iso);
}

export function shortAddr(a) {
  if (!a) return '';
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Only http(s) links are allowed to reach an href.
 *  esc() neutralises quotes and tags but not the scheme, so without this a
 *  `javascript:` url in a report would run on click and a `data:text/html`
 *  one would render an attacker-authored page from our own origin's tab. */
export function safeUrl(u) {
  if (!u) return null;
  let parsed;
  try {
    parsed = new URL(String(u).trim(), location.href);
  } catch {
    return null;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
}

/** Escape for safe interpolation into innerHTML. */
export function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Minimal inline markup in report text: **bold**, `code`, line breaks → paragraphs. */
export function prose(text) {
  if (!text) return '';
  const paras = Array.isArray(text) ? text : String(text).split(/\n\s*\n/);
  return paras.map(p => `<p>${inline(p)}</p>`).join('');
}

export function inline(t) {
  return esc(String(t).trim())
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="mono">$1</code>')
    .replace(/\n/g, '<br>');
}

/** Stance → { label, class } */
export function stance(s) {
  const map = {
    bullish: { label: 'Bullish', cls: 'bullish' },
    bearish: { label: 'Bearish', cls: 'bearish' },
    neutral: { label: 'Neutral', cls: 'neutral' },
    watch:   { label: 'Watchlist', cls: 'neutral' },
    avoid:   { label: 'Avoid', cls: 'bearish' },
  };
  return map[String(s || '').toLowerCase()] || { label: s || 'Neutral', cls: 'neutral' };
}

/** Deterministic palette for allocation charts. */
export const PALETTE = ['#7c83ff', '#4ade80', '#fbbf24', '#f87171', '#38bdf8', '#c084fc', '#fb923c', '#2dd4bf', '#94a3b8'];

/** Fetch JSON with a clear error.
 *  The single-file build (see build-standalone.js) pre-loads every data file
 *  into `globalThis.__BUNDLE__`, so the same code runs without a server. */
export async function loadJSON(url) {
  const bundled = globalThis.__BUNDLE__?.[url];
  if (bundled) return JSON.parse(JSON.stringify(bundled));
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}
