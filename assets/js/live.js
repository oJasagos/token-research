/* Live prices, pulled straight from the exchanges in the reader's browser.
 *
 * Venues are configured per token (market.live = {venue, pair}) rather than
 * guessed from the ticker, because tickers collide: LIT on Binance is
 * Litentry, a different asset whose market last traded in July at 0.74$,
 * while our LIT is Lighter at ~2$. Wiring by symbol would have shown the
 * wrong number with full confidence.
 *
 * Two guards keep a bad mapping from ever reaching the page:
 *   - a live price more than SANITY away from the price recorded in the
 *     report is rejected outright,
 *   - anything non-numeric or non-positive is rejected.
 * A rejected quote leaves the report's own figure in place, which is dated
 * and correct, rather than replacing it with something wrong.
 *
 * Everything here is optional. No network, blocked CORS, a rate limit or an
 * offline file all end in the same place: the static price stays. */

import { price as fmtPrice, pct, signClass } from './common.js';

const REFRESH_MS = 60_000;
const SANITY = 0.6;          // reject a quote off by more than 60%
const TIMEOUT_MS = 8_000;

const VENUES = {
  binance: {
    label: 'Binance',
    url: pairs => `https://api.binance.com/api/v3/ticker/24hr?symbols=${
      encodeURIComponent(JSON.stringify(pairs))}`,
    parse: rows => Object.fromEntries((Array.isArray(rows) ? rows : [rows]).map(r =>
      [r.symbol, { price: Number(r.lastPrice), change24h: Number(r.priceChangePercent) }])),
  },
  mexc: {
    label: 'MEXC',
    // Binance-shaped API with one difference that matters: priceChangePercent
    // is a fraction here (-0.0102), not a percent (-1.02), so it needs x100.
    url: pairs => `https://api.mexc.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(pairs[0])}`,
    perPair: true,
    parse: row => {
      const r = Array.isArray(row) ? row[0] : row;
      return r ? { [r.symbol]: { price: Number(r.lastPrice), change24h: Number(r.priceChangePercent) * 100 } } : {};
    },
  },
  gate: {
    label: 'Gate',
    url: pairs => `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(pairs[0])}`,
    perPair: true,           // gate takes one pair per request
    parse: rows => Object.fromEntries((rows || []).map(r =>
      [r.currency_pair, { price: Number(r.last), change24h: Number(r.change_percentage) }])),
  },
};

async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** One round of quotes for the given targets. Never throws. */
async function fetchQuotes(targets) {
  const byVenue = {};
  for (const t of targets) {
    for (const src of sourcesOf(t)) {
      if (!VENUES[src.venue]) continue;
      (byVenue[src.venue] ||= new Set()).add(src.pair);
    }
  }

  const out = {};
  await Promise.all(Object.entries(byVenue).map(async ([venue, set]) => {
    const cfg = VENUES[venue];
    const pairs = [...set];
    const batches = cfg.perPair ? pairs.map(p => [p]) : [pairs];
    await Promise.all(batches.map(async batch => {
      try {
        const parsed = cfg.parse(await getJSON(cfg.url(batch)));
        for (const [pair, q] of Object.entries(parsed)) out[`${venue}:${pair}`] = q;
      } catch { /* venue unavailable this round */ }
    }));
  }));
  return out;
}

/** A target may list several venues; they are tried in order. Accepts both the
 *  single-object form and an array, so older report files keep working. */
function sourcesOf(t) {
  const v = t.live;
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(s => s && s.venue && s.pair);
}

/** Reject anything that cannot plausibly be this asset. */
function accept(quote, reference) {
  if (!quote || !isFinite(quote.price) || quote.price <= 0) return false;
  if (!isFinite(reference) || reference <= 0) return true;   // nothing to compare against
  return Math.abs(quote.price / reference - 1) <= SANITY;
}

/**
 * targets: [{ live:{venue,pair}, reference:Number, apply(quote) }]
 * Calls apply() only with a quote that passed the guards.
 */
export function startLive(targets, onRound) {
  const list = targets.filter(t => sourcesOf(t).length);
  if (!list.length) return () => {};

  let stopped = false;

  const round = async () => {
    if (stopped || document.hidden) return;
    const quotes = await fetchQuotes(list);
    let ok = 0;
    const used = new Set();
    for (const t of list) {
      // first venue that answers with a plausible number wins
      for (const src of sourcesOf(t)) {
        const q = quotes[`${src.venue}:${src.pair}`];
        if (!accept(q, t.reference)) continue;
        t.apply({ ...q, venue: VENUES[src.venue].label });
        used.add(VENUES[src.venue].label);
        ok++;
        break;
      }
    }
    if (onRound) onRound({ ok, total: list.length, at: Date.now(), venues: [...used] });
  };

  round();
  const timer = setInterval(round, REFRESH_MS);
  // catch up as soon as the tab comes back rather than waiting out the interval
  const onVis = () => { if (!document.hidden) round(); };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** Swap a price node's text and flash it in the direction of the move. */
export function applyPrice(node, value, prev) {
  if (!node) return;
  const next = fmtPrice(value);
  if (node.textContent === next) return;
  node.textContent = next;
  if (prev == null || !isFinite(prev)) return;
  const dir = value > prev ? 'up' : value < prev ? 'down' : null;
  if (!dir) return;
  node.classList.remove('tick-up', 'tick-down');
  void node.offsetWidth;                 // restart the animation
  node.classList.add(`tick-${dir}`);
}

/** Render a 24h change node from a live quote. */
export function applyChange(node, change24h, prefix = '') {
  if (!node || !isFinite(change24h)) return;
  node.className = signClass(change24h) + (node.dataset.keep || '');
  node.textContent = prefix + pct(change24h, { sign: true });
}

/** The little "live" badge: dot, venue, age. */
export function liveBadge() {
  const el = document.createElement('span');
  el.className = 'live-badge';
  el.innerHTML = '<i></i><b></b><em></em>';
  return {
    node: el,
    ok(venues, at) {
      el.classList.remove('stale');
      el.querySelector('b').textContent = venues;
      const tick = () => {
        const s = Math.round((Date.now() - at) / 1000);
        el.querySelector('em').textContent = s < 60 ? `${s} с назад` : `${Math.round(s / 60)} мин назад`;
      };
      tick();
      clearInterval(el._t); el._t = setInterval(tick, 5000);
    },
    fail(dateLabel) {
      el.classList.add('stale');
      clearInterval(el._t);
      el.querySelector('b').textContent = 'цены на дату отчёта';
      el.querySelector('em').textContent = dateLabel || '';
    },
  };
}
