/* Side-by-side comparison across every report.
 *
 * Deliberately does not declare a winner. Rows carry a magnitude bar so the
 * relative size is visible, but "cheaper multiple" is not the same as "better
 * asset" and the page should not pretend otherwise — the verdict row shows what
 * the reports actually concluded. */

import { loadJSON, usd, price, num, pct, signClass, esc, date, stance } from './common.js';
import { reveal, daysUntil } from './anim.js';
import { startLive, applyPrice, liveBadge } from './live.js';

const tableEl = document.getElementById('cmp');
const noteEl = document.getElementById('cmp-note');

/** label, accessor, formatter, and whether the row supports a magnitude bar. */
const ROWS = [
  ['Позиция', r => r.verdict?.stance, (v) => {
    const s = stance(v); return `<span class="pill ${s.cls}">${esc(s.label)}</span>`;
  }, false],
  ['Сеть', r => r.chain, v => esc(v || '—'), false],
  ['Цена', r => r.market?.price, (v, r) => `<span class="cmp-live" data-slug="${esc(r.slug)}">${price(v)}</span>`, false],
  ['За 24ч', r => r.market?.change24h, v => v == null ? '—' : `<span class="${signClass(v)}">${pct(v, { sign: true })}</span>`, false],
  ['За 30д', r => r.market?.change30d, v => v == null ? '—' : `<span class="${signClass(v)}">${pct(v, { sign: true })}</span>`, false],
  ['От пика', r => (r.market?.ath && r.market?.price) ? (r.market.price / r.market.ath - 1) * 100 : null,
    v => v == null ? '—' : `<span class="${signClass(v)}">${pct(v, { sign: true })}</span>`, false],
  ['Капитализация', r => r.market?.mcap, v => usd(v), true],
  ['FDV', r => r.market?.fdv, v => usd(v), true],
  ['MC / FDV', r => (r.market?.mcap && r.market?.fdv) ? r.market.mcap / r.market.fdv : null,
    v => v == null ? '—' : v.toFixed(2), true],
  ['Комиссии за 30д', r => r.fundamentals?.fees30d, v => usd(v), true],
  ['Капитализация к комиссиям', r => r.fundamentals?.priceToFees, v => v == null ? '—' : v.toFixed(1) + '×', true],
  ['TVL', r => r.fundamentals?.tvl, v => usd(v), true],
  ['Объём 24ч', r => r.market?.volume24h, v => usd(v), true],
  ['Следующий разлок', r => {
    const list = (r.fundamentals?.unlocks || []).map(u => ({ u, d: daysUntil(u.date) }))
      .filter(x => x.d != null).sort((a, b) => a.d - b.d);
    return list[0] || null;
  }, v => v ? `${esc(date(v.u.date))}<span class="cmp-sub">через ${v.d} ${plural(v.d, 'день', 'дня', 'дней')}</span>` : '—', false],
  ['Рисков высокой степени', r => (r.risks || []).filter(x => x.severity === 'high').length || null,
    v => v == null ? '—' : String(v), false],
  ['Уверенность', r => r.verdict?.conviction, v => v == null ? '—' : `${v}/5`, false],
];

init();

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

async function init() {
  let idx;
  try {
    idx = await loadJSON('data/index.json');
  } catch (err) {
    tableEl.innerHTML = `<div class="empty"><h3>Не удалось загрузить список</h3><p>${esc(err.message)}</p></div>`;
    return;
  }

  const slugs = (idx.reports || []).map(r => r.slug);
  const reports = (await Promise.all(slugs.map(async s => {
    try { return await loadJSON(`data/reports/${s}.json`); } catch { return null; }
  }))).filter(Boolean);

  if (reports.length < 2) {
    tableEl.innerHTML = `<div class="empty"><h3>Сравнивать пока нечего</h3>
      <p>Нужно как минимум два отчёта. Сейчас ${reports.length}.</p></div>`;
    return;
  }

  render(reports);
  wireLive(reports);
  if (noteEl) {
    noteEl.textContent = `${reports.length} ${plural(reports.length, 'отчёт', 'отчёта', 'отчётов')}. `
      + 'Строки без данных скрыты. Полоска показывает величину относительно других, а не оценку.';
  }
  reveal(document);
}

/** Only the price row goes live; every other row is as of its report date. */
function wireLive(reports) {
  const badge = liveBadge();
  noteEl?.parentNode.insertBefore(badge.node, noteEl.nextSibling);
  const last = {};
  const targets = reports.filter(r => r.market?.live).map(r => ({
    live: r.market.live, reference: r.market.price,
    apply(q) {
      const node = tableEl.querySelector(`.cmp-live[data-slug="${CSS.escape(r.slug)}"]`);
      applyPrice(node, q.price, last[r.slug]);
      last[r.slug] = q.price;
    },
  }));
  if (!targets.length) return;
  const venues = [...new Set(reports.filter(r => r.market?.live)
    .map(r => r.market.live.venue === 'gate' ? 'Gate' : 'Binance'))];
  startLive(targets, ({ ok, at }) => ok ? badge.ok(venues.join(' · '), at) : badge.fail('обновить не удалось'));
}

function render(reports) {
  const rows = ROWS.map(([label, get, fmt, bar]) => {
    const vals = reports.map(get);
    if (vals.every(v => v == null)) return null;      // nothing to compare
    const nums = bar ? vals.filter(v => typeof v === 'number' && isFinite(v)) : [];
    const max = nums.length ? Math.max(...nums.map(Math.abs)) : 0;
    return { label, vals, fmt, bar: bar && max > 0, max };
  }).filter(Boolean);

  tableEl.innerHTML = `
    <div class="tbl-wrap reveal">
      <table class="cmp-table">
        <thead><tr>
          <th></th>
          ${reports.map(r => `<th>
            <a class="cmp-head" href="report.html?id=${encodeURIComponent(r.slug)}">
              <span class="s">${esc(r.symbol || r.slug)}</span>
              <span class="n">${esc(r.name || '')}</span>
            </a></th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map(row => `<tr>
            <th scope="row">${esc(row.label)}</th>
            ${row.vals.map((v, i) => `<td class="num">
              <span class="cmp-v">${row.fmt(v, reports[i])}</span>
              ${row.bar && typeof v === 'number' && isFinite(v)
                ? `<span class="cmp-bar"><i style="--w:${(Math.abs(v) / row.max * 100).toFixed(1)}%"></i></span>` : ''}
            </td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // grow the magnitude bars once the table is on screen
  const io = new IntersectionObserver((e, obs) => {
    if (!e.some(x => x.isIntersecting)) return;
    tableEl.querySelectorAll('.cmp-bar i').forEach((b, i) => {
      b.style.transitionDelay = `${Math.min(i * 25, 600)}ms`;
      b.style.width = 'var(--w)';
    });
    obs.disconnect();
  }, { threshold: 0.05 });
  io.observe(tableEl);
}
