import { loadJSON, price, pct, signClass, esc, date, stance, usd, num } from './common.js';
import { reveal } from './anim.js';
import { startLive, applyPrice, applyChange, liveBadge } from './live.js';

const listEl = document.getElementById('list');
const qEl = document.getElementById('q');
const filtersEl = document.getElementById('filters');
const sortEl = document.getElementById('sort');
const statEl = document.getElementById('stat');
const builtEl = document.getElementById('built');
const summaryEl = document.getElementById('summary');
const countEl = document.getElementById('count');

let reports = [];
const active = { chain: null, stance: null };
let sortBy = 'date';

const SORTS = {
  date:   { label: 'по дате',           cmp: (a, b) => (b.date || '').localeCompare(a.date || '') },
  mcap:   { label: 'по капитализации',  cmp: (a, b) => (b.mcap || 0) - (a.mcap || 0) },
  change: { label: 'по движению 24ч',   cmp: (a, b) => (b.change24h ?? -1e9) - (a.change24h ?? -1e9) },
  symbol: { label: 'по тикеру',         cmp: (a, b) => (a.symbol || '').localeCompare(b.symbol || '') },
};

init();

async function init() {
  listEl.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton"></div>').join('');
  try {
    const idx = await loadJSON('data/index.json');
    reports = (idx.reports || []).slice();
    builtEl.textContent = idx.updated ? `обновлено ${date(idx.updated)}` : '';
  } catch (err) {
    listEl.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Не удалось загрузить список отчётов</h3>
      <p>${esc(err.message)}</p>
      <p style="margin-top:12px">Если открываешь файл локально — запусти <code>python3 -m http.server</code> в папке репозитория:
      браузер блокирует <code>fetch</code> для <code>file://</code>.</p>
    </div>`;
    return;
  }

  statEl.textContent = `${reports.length} ${plural(reports.length, 'отчёт', 'отчёта', 'отчётов')}`;
  renderSummary();
  renderFilters();
  renderSort();
  render();

  qEl.addEventListener('input', render);
  wireKeys();
  wireLive();
}

/** Live prices on the cards. The nodes are looked up on each tick because
 *  filtering and sorting rebuild the grid underneath us. */
function wireLive() {
  const badge = liveBadge();
  statEl.parentNode.insertBefore(badge.node, statEl);
  const last = {};

  const targets = reports.filter(r => r.live).map(r => ({
    live: r.live, reference: r.price, label: r.symbol,
    apply(q) {
      const card = listEl.querySelector(`.card[data-slug="${CSS.escape(r.slug)}"]`);
      r.livePrice = q.price;
      if (!card) return;
      applyPrice(card.querySelector('.card-price .p'), q.price, last[r.slug]);
      applyChange(card.querySelector('.card-price .d'), q.change24h);
      last[r.slug] = q.price;
    },
  }));
  if (!targets.length) return;

  startLive(targets, ({ ok, at, venues, detail }) =>
    ok ? badge.ok(venues.join(' · '), at, detail) : badge.fail('обновить не удалось'));
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

/** A small "state of the desk" strip so the page opens with something to read. */
function renderSummary() {
  if (!summaryEl || !reports.length) return;
  const chains = new Set(reports.map(r => r.chain).filter(Boolean));
  const mcap = reports.reduce((s, r) => s + (r.mcap || 0), 0);
  const movers = reports.filter(r => r.change24h != null);
  const best = movers.length ? movers.reduce((a, b) => (b.change24h > a.change24h ? b : a)) : null;
  const stances = reports.reduce((m, r) => (m[r.stance] = (m[r.stance] || 0) + 1, m), {});

  const tiles = [
    ['Разборов', num(reports.length), `${chains.size} ${plural(chains.size, 'сеть', 'сети', 'сетей')}`],
    ['Покрытая капитализация', usd(mcap), 'сумма по отчётам'],
    best ? ['Лучший за 24ч', esc(best.symbol),
      `<span class="${signClass(best.change24h)}">${pct(best.change24h, { sign: true })}</span>`] : null,
    ['Позиции', Object.entries(stances).map(([k]) => stance(k).label).join(' · ') || '—', 'текущие вердикты'],
  ].filter(Boolean);

  summaryEl.innerHTML = tiles.map(([k, v, s], i) => `
    <div class="tile reveal" style="--i:${i}">
      <div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ''}</div>
    </div>`).join('');
  reveal(summaryEl, '.tile');
}

function renderFilters() {
  const chains = [...new Set(reports.map(r => r.chain).filter(Boolean))];
  const stances = [...new Set(reports.map(r => r.stance).filter(Boolean))];
  const groups = [];
  if (chains.length > 1) groups.push(chains.map(c => ({ kind: 'chain', v: c, label: c })));
  if (stances.length > 1) groups.push(stances.map(s => ({ kind: 'stance', v: s, label: stance(s).label })));
  if (!groups.length) return;

  filtersEl.innerHTML = groups
    .map(g => `<div class="chip-group">${g.map(o =>
      `<button class="chip" data-kind="${esc(o.kind)}" data-v="${esc(o.v)}" aria-pressed="false">${esc(o.label)}</button>`
    ).join('')}</div>`).join('');

  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const { kind, v } = btn.dataset;
    active[kind] = active[kind] === v ? null : v;
    filtersEl.querySelectorAll('.chip').forEach(b =>
      b.setAttribute('aria-pressed', String(active[b.dataset.kind] === b.dataset.v)));
    render();
  });
}

function renderSort() {
  if (!sortEl) return;
  sortEl.innerHTML = Object.entries(SORTS)
    .map(([k, s]) => `<option value="${k}">${esc(s.label)}</option>`).join('');
  sortEl.value = sortBy;
  sortEl.addEventListener('change', () => { sortBy = sortEl.value; render(); });
}

function render() {
  const q = qEl.value.trim().toLowerCase();
  const shown = reports.filter(r => {
    if (active.chain && r.chain !== active.chain) return false;
    if (active.stance && r.stance !== active.stance) return false;
    if (!q) return true;
    return [r.symbol, r.name, r.chain, r.summary, r.slug]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }).sort(SORTS[sortBy].cmp);

  if (countEl) {
    const filtered = shown.length !== reports.length;
    countEl.textContent = filtered ? `${shown.length} из ${reports.length}` : '';
  }

  if (!reports.length) {
    listEl.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Пока пусто</h3>
      <p>Напиши мне в чат — например «разбери $HYPE» — и отчёт появится здесь.</p>
    </div>`;
    return;
  }

  if (!shown.length) {
    listEl.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Ничего не найдено</h3><p>Попробуй другой запрос или сбрось фильтры.</p></div>`;
    return;
  }

  listEl.innerHTML = shown.map(card).join('');
  reveal(listEl, '.card');
  wireGlow();
}

/** The hover glow follows the pointer across each card. */
function wireGlow() {
  listEl.querySelectorAll('.card').forEach(c => {
    c.addEventListener('pointermove', e => {
      const b = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${((e.clientX - b.left) / b.width * 100).toFixed(1)}%`);
      c.style.setProperty('--my', `${((e.clientY - b.top) / b.height * 100).toFixed(1)}%`);
    });
  });
}

function card(r, i) {
  const st = stance(r.stance);
  const ch = r.change24h;
  return `
  <a class="card reveal" data-slug="${esc(r.slug)}" style="--i:${i}" href="report.html?id=${encodeURIComponent(r.slug)}">
    <div class="card-top">
      <div class="card-id">
        <div class="card-sym">${esc(r.symbol || r.slug)}</div>
        <div class="card-name">${esc(r.name || '')}</div>
      </div>
      <div class="card-price">
        <div class="p">${price(r.price)}</div>
        ${ch == null ? '' : `<div class="d ${signClass(ch)}">${pct(ch, { sign: true })}</div>`}
      </div>
    </div>
    <div class="card-sum">${esc(r.summary || '')}</div>
    <div class="card-foot">
      <span class="pill ${st.cls}">${esc(st.label)}</span>
      <span>${r.mcap ? esc(usd(r.mcap)) + ' · ' : ''}${esc(date(r.date))}</span>
    </div>
    <span class="card-go" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </span>
  </a>`;
}

/** `/` jumps to search, Esc clears it. */
function wireKeys() {
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); qEl.focus(); qEl.select(); }
    else if (e.key === 'Escape' && typing) { qEl.value = ''; qEl.blur(); render(); }
  });
}
