import { loadJSON, price, pct, signClass, esc, date, stance, usd } from './common.js';

const listEl = document.getElementById('list');
const qEl = document.getElementById('q');
const filtersEl = document.getElementById('filters');
const statEl = document.getElementById('stat');
const builtEl = document.getElementById('built');

let reports = [];
let activeChain = null;

init();

async function init() {
  listEl.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton"></div>').join('');
  try {
    const idx = await loadJSON('data/index.json');
    reports = (idx.reports || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
  renderFilters();
  render();
  qEl.addEventListener('input', render);
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function renderFilters() {
  const chains = [...new Set(reports.map(r => r.chain).filter(Boolean))];
  if (chains.length < 2) return;
  filtersEl.innerHTML = chains
    .map(c => `<button class="chip" data-chain="${esc(c)}" aria-pressed="false">${esc(c)}</button>`)
    .join('');
  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const chain = btn.dataset.chain;
    activeChain = activeChain === chain ? null : chain;
    filtersEl.querySelectorAll('.chip').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.chain === activeChain)));
    render();
  });
}

function render() {
  const q = qEl.value.trim().toLowerCase();
  const shown = reports.filter(r => {
    if (activeChain && r.chain !== activeChain) return false;
    if (!q) return true;
    return [r.symbol, r.name, r.chain, r.summary, r.slug]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  if (!reports.length) {
    listEl.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Пока пусто</h3>
      <p>Напиши мне в чат — например «разбери $HYPE» — и отчёт появится здесь.</p>
    </div>`;
    return;
  }

  if (!shown.length) {
    listEl.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Ничего не найдено</h3><p>Попробуй другой запрос.</p></div>`;
    return;
  }

  listEl.innerHTML = shown.map(card).join('');
}

function card(r) {
  const st = stance(r.stance);
  const ch = r.change24h;
  return `
  <a class="card" href="report.html?id=${encodeURIComponent(r.slug)}">
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
  </a>`;
}
