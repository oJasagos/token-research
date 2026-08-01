import {
  loadJSON, usd, price, num, pct, signClass, date, ago, esc, prose, inline,
  stance, shortAddr, safeUrl,
} from './common.js';
import { mountCharts, CATEGORICAL } from './charts.js';
import { reveal, countUpAll, readingProgress, backToTop, daysUntil } from './anim.js';

const headEl = document.getElementById('head');
const bodyEl = document.getElementById('body');
const navEl = document.getElementById('nav');
const navInner = document.getElementById('nav-inner');
const stampEl = document.getElementById('stamp');

/** Chart specs collected while building HTML, mounted once it is in the DOM. */
let charts = [];
const chartBlock = spec => {
  if (!spec || !(spec.series || []).length) return '';
  charts.push(spec);
  return `<div class="chart reveal" data-chart="${charts.length - 1}"></div>`;
};

init();

/** Report id from `?id=slug` (multi-page) or `#/slug` (single-file build).
 *  In-page anchors like `#risks` deliberately do not match. */
function currentReportId() {
  const fromQuery = new URLSearchParams(location.search).get('id');
  if (fromQuery) return fromQuery;
  const m = (location.hash || '').match(/^#\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function init() {
  charts = [];
  const id = currentReportId();
  if (!id || !/^[a-z0-9_-]+$/i.test(id)) return fail('Не указан отчёт', 'Открой отчёт со <a class="link" href="index.html">главной страницы</a>.');

  let r;
  try {
    r = await loadJSON(`data/reports/${id}.json`);
  } catch (err) {
    return fail('Отчёт не найден', esc(err.message));
  }

  document.title = `${r.symbol || id} — Token Research`;
  renderHead(r);

  const sections = buildSections(r);
  bodyEl.innerHTML = sections.map(s => s.html).join('');
  renderNav(sections);
  stampEl.textContent = r.updated ? `собрано ${ago(r.updated)}` : '';

  mountCharts(bodyEl, charts);
  wireCopy();
  wireAnchors();
  reveal(document);
  countUpAll(document);
  if (!document.querySelector('.progress')) { readingProgress(); backToTop(); }
}

function fail(title, msg) {
  headEl.innerHTML = `<div class="empty"><h3>${esc(title)}</h3><p>${msg}</p></div>`;
}

/* ── Header ──────────────────────────────────────────────────── */

function nextUnlock(r) {
  const list = (r.fundamentals?.unlocks || [])
    .map(u => ({ ...u, d: daysUntil(u.date) }))
    .filter(u => u.d != null)
    .sort((a, b) => a.d - b.d);
  return list[0] || null;
}

function renderHead(r) {
  const m = r.market || {};
  const st = stance(r.verdict?.stance);
  const deltas = [
    ['24ч', m.change24h], ['7д', m.change7d], ['30д', m.change30d],
  ].filter(([, v]) => v != null)
   .map(([k, v]) => `<span class="${signClass(v)}">${k} ${pct(v, { sign: true })}</span>`)
   .join('');

  const un = nextUnlock(r);
  const countdown = un ? `<span class="chip-countdown" title="${esc(un.name || 'Разлок')} · ${esc(date(un.date))}">
      <i></i>до разлока ${un.d} ${plural(un.d, 'день', 'дня', 'дней')}</span>` : '';

  headEl.innerHTML = `
    <div class="rep-title">
      <div>
        <h1>${esc(r.symbol || r.slug)} <span>${esc(r.name || '')}</span></h1>
        <div class="rep-sub">
          <span class="pill ${st.cls}">${esc(st.label)}</span>
          ${r.chain ? `<span class="tag">${esc(r.chain)}</span>` : ''}
          ${r.sector ? `<span class="tag">${esc(r.sector)}</span>` : ''}
          ${countdown}
          ${r.address ? `<button class="addr" data-copy="${esc(r.address)}" title="Скопировать адрес">
              ${esc(shortAddr(r.address))}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
            </button>` : ''}
          <span class="faint mono" style="font-size:12px">${esc(date(r.date))}</span>
        </div>
      </div>
      <div class="rep-price">
        <div class="p">${price(m.price)}</div>
        <div class="d">${deltas}</div>
      </div>
    </div>`;
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

/* ── Section assembly ────────────────────────────────────────── */

function buildSections(r) {
  const out = [];
  const add = (id, label, html) => { if (html) out.push({ id, label, html: sect(id, label, html) }); };

  add('overview',    'Обзор',        overview(r));
  add('market',      'Рынок',        market(r));
  add('onchain',     'On-chain',     onchain(r));
  add('fundamentals','Фундамент',    fundamentals(r));
  add('derivatives', 'Деривативы',   derivatives(r));
  add('narrative',   'Нарратив',     narrative(r));
  add('risks',       'Риски',        risks(r));
  add('position',    'Позиция',      position(r));
  add('sources',     'Источники',    sources(r));
  return out;
}

function sect(id, label, inner) {
  return `<section id="${id}"><h2><a class="anchor" href="#${id}" aria-label="Ссылка на раздел">${esc(label)}</a></h2>${inner}</section>`;
}

function renderNav(sections) {
  if (sections.length < 2) return;
  navEl.hidden = false;
  navInner.innerHTML = sections.map(s => `<a href="#${s.id}">${esc(s.label)}</a>`).join('');
  const links = [...navInner.querySelectorAll('a')];
  const nodes = sections.map(s => document.getElementById(s.id));

  // Active = the last section whose top has passed under the sticky nav.
  // (An IntersectionObserver lags here: several sections are on screen at once
  // and "first intersecting" keeps pointing at the one being scrolled away from.)
  const sync = () => {
    const line = 90;
    let active = nodes[0];
    for (const n of nodes) {
      if (n.getBoundingClientRect().top <= line) active = n; else break;
    }
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
      active = nodes[nodes.length - 1];
    }
    links.forEach(a => a.classList.toggle('active', a.hash === `#${active.id}`));

    // keep the active tab visible on narrow screens — scroll the nav strip
    // directly rather than scrollIntoView, which can move the page itself
    const cur = links.find(a => a.classList.contains('active'));
    if (cur) {
      const pad = 24;
      const left = cur.offsetLeft, right = left + cur.offsetWidth;
      if (left - pad < navInner.scrollLeft) navInner.scrollLeft = left - pad;
      else if (right + pad > navInner.scrollLeft + navInner.clientWidth) {
        navInner.scrollLeft = right + pad - navInner.clientWidth;
      }
    }
  };

  addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  sync();
}

/* ── Sections ────────────────────────────────────────────────── */

function overview(r) {
  const v = r.verdict || {};
  if (!v.summary && !r.thesis) return '';
  const dots = v.conviction
    ? `<div class="conviction">Уверенность
         <span class="dots">${Array.from({ length: 5 }, (_, i) =>
           `<i class="${i < v.conviction ? 'on' : ''}" style="--i:${i}"></i>`).join('')}</span>
         <b>${v.conviction}/5</b></div>` : '';
  return `
    ${v.summary ? `<div class="panel accent reveal"><div class="prose lead">${prose(v.summary)}</div>${dots}</div>` : ''}
    ${r.thesis ? `<div class="panel reveal"><h3>Тезис</h3><div class="prose">${prose(r.thesis)}</div></div>` : ''}`;
}

function market(r) {
  const m = r.market;
  if (!m) return '';
  const cells = [
    ['Цена',            price(m.price), m.change24h != null ? `<span class="${signClass(m.change24h)}">${pct(m.change24h, { sign: true })} за 24ч</span>` : ''],
    ['Капитализация',   usd(m.mcap)],
    ['FDV',             usd(m.fdv), m.mcap && m.fdv ? `MC/FDV ${(m.mcap / m.fdv).toFixed(2)}` : ''],
    ['Ликвидность',     usd(m.liquidity), m.volume24h && m.liquidity ? `оборот ${(m.volume24h / m.liquidity).toFixed(1)}×` : ''],
    ['Объём 24ч',       usd(m.volume24h)],
    ['В обращении',     m.circulating != null ? num(m.circulating) : '—', m.totalSupply ? `из ${num(m.totalSupply)}` : ''],
    ['ATH',             price(m.ath), m.athDate ? date(m.athDate) : ''],
    ['От ATH',          m.ath && m.price ? pct((m.price / m.ath - 1) * 100, { sign: true }) : '—'],
  ].filter(c => c[1] !== '—' || c[0] === 'Цена');

  const pools = (m.pools || []).length ? `
    <div class="tbl-wrap reveal" style="margin-top:12px">
      <table><thead><tr><th>Пул</th><th>DEX</th><th class="num">Ликвидность</th><th class="num">Объём 24ч</th></tr></thead>
      <tbody>${m.pools.map(p => `<tr>
        <td><strong>${esc(p.pair || '')}</strong></td>
        <td>${esc(p.dex || '')}</td>
        <td class="num">${usd(p.liquidity)}</td>
        <td class="num">${usd(p.volume24h)}</td>
      </tr>`).join('')}</tbody></table>
    </div>` : '';

  return metricGrid(cells)
    + (m.charts || []).map(chartBlock).join('')
    + pools
    + (m.notes ? `<div class="panel reveal" style="margin-top:12px"><div class="prose">${prose(m.notes)}</div></div>` : '');
}

function onchain(r) {
  const o = r.onchain;
  if (!o) return '';
  const parts = [];

  const cells = [
    ['Холдеров',        o.holders != null ? num(o.holders) : '—', o.holdersChange30d != null ? `${pct(o.holdersChange30d, { sign: true })} за 30д` : ''],
    ['Топ-10',          o.concentration?.top10 != null ? pct(o.concentration.top10, { asFraction: true }) : '—', 'от предложения'],
    ['Топ-50',          o.concentration?.top50 != null ? pct(o.concentration.top50, { asFraction: true }) : '—'],
    ['Smart money 7д',  o.smartMoney?.netFlow7d != null ? `<span class="${signClass(o.smartMoney.netFlow7d)}">${usd(o.smartMoney.netFlow7d)}</span>` : '—', 'чистый поток'],
  ].filter(c => c[1] !== '—');
  if (cells.length) parts.push(metricGrid(cells));

  parts.push((o.charts || []).map(chartBlock).join(''));

  if ((o.topHolders || []).length) {
    parts.push(`<div class="tbl-wrap reveal" style="margin-top:12px">
      <table><thead><tr><th>Держатель</th><th>Адрес</th><th class="num">Доля</th><th class="num">Стоимость</th></tr></thead>
      <tbody>${o.topHolders.map(h => `<tr>
        <td><strong>${esc(h.label || 'Неизвестный')}</strong>${h.tag ? ` <span class="tag">${esc(h.tag)}</span>` : ''}</td>
        <td class="mono faint" style="font-size:12px">${esc(shortAddr(h.address))}</td>
        <td class="num">${h.pct != null ? pct(h.pct, { asFraction: true, digits: 2 }) : '—'}</td>
        <td class="num">${usd(h.valueUsd)}</td>
      </tr>`).join('')}</tbody></table></div>`);
  }

  if (o.smartMoney?.notes || (o.smartMoney?.movers || []).length) {
    const movers = (o.smartMoney.movers || []).map(m => `
      <div class="kv"><span class="k">${esc(m.label || shortAddr(m.address))}</span>
      <span class="v mono ${signClass(m.netUsd)}">${usd(m.netUsd)}</span></div>`).join('');
    parts.push(`<div class="panel reveal" style="margin-top:12px"><h3>Умные деньги</h3>
      ${o.smartMoney.notes ? `<div class="prose">${prose(o.smartMoney.notes)}</div>` : ''}${movers}</div>`);
  }

  if ((o.flows || []).length) {
    parts.push(`<div class="tbl-wrap reveal" style="margin-top:12px">
      <table><thead><tr><th>Период</th><th class="num">Приток на CEX</th><th class="num">Отток с CEX</th><th class="num">Нетто</th></tr></thead>
      <tbody>${o.flows.map(f => {
        const net = f.net != null ? f.net : (f.cexOut != null && f.cexIn != null ? f.cexOut - f.cexIn : null);
        return `<tr><td><strong>${esc(f.period || '')}</strong></td>
          <td class="num">${usd(f.cexIn)}</td><td class="num">${usd(f.cexOut)}</td>
          <td class="num ${signClass(net)}">${usd(net)}</td></tr>`;
      }).join('')}</tbody></table></div>`);
  }

  if (o.notes) parts.push(`<div class="panel reveal" style="margin-top:12px"><div class="prose">${prose(o.notes)}</div></div>`);
  return parts.join('');
}

function fundamentals(r) {
  const f = r.fundamentals;
  if (!f) return '';
  const parts = [];

  if (f.what) parts.push(`<div class="panel reveal"><h3>Что это</h3><div class="prose">${prose(f.what)}</div></div>`);
  if (f.revenue) parts.push(`<div class="panel reveal"><h3>Как зарабатывает</h3><div class="prose">${prose(f.revenue)}</div></div>`);

  const cells = [
    ['TVL',             usd(f.tvl), f.tvlChange30d != null ? `${pct(f.tvlChange30d, { sign: true })} за 30д` : ''],
    ['Комиссии 30д',    usd(f.fees30d)],
    ['Выручка 30д',     usd(f.revenue30d)],
    ['P/F',             f.priceToFees != null ? f.priceToFees.toFixed(1) + '×' : '—'],
  ].filter(c => c[1] !== '—');
  if (cells.length) parts.push(`<div style="margin-top:12px">${metricGrid(cells)}</div>`);

  parts.push((f.charts || []).map(chartBlock).join(''));

  const alloc = f.tokenomics?.allocations || [];
  if (alloc.length) {
    const total = alloc.reduce((s, a) => s + (a.pct || 0), 0) || 1;
    parts.push(`<div class="panel reveal" style="margin-top:12px"><h3>Распределение предложения</h3>
      <div class="stack">${alloc.map((a, i) =>
        `<i style="width:${((a.pct || 0) / total * 100).toFixed(2)}%;background:${CATEGORICAL[i % CATEGORICAL.length]};--i:${i}" title="${esc(a.name)}"></i>`).join('')}</div>
      <div class="legend">${alloc.map((a, i) =>
        `<div><i style="background:${CATEGORICAL[i % CATEGORICAL.length]}"></i>${esc(a.name)}<b>${pct(a.pct, { asFraction: true })}</b></div>`).join('')}</div>
      ${f.tokenomics.emissions ? `<div class="prose" style="margin-top:16px">${prose(f.tokenomics.emissions)}</div>` : ''}
    </div>`);
  }

  if ((f.unlocks || []).length) {
    parts.push(`<div class="panel reveal" style="margin-top:12px"><h3>Разлоки</h3>
      ${f.unlocks.map(u => {
        const d = daysUntil(u.date);
        return `<div class="unlock">
        <div class="date">${esc(date(u.date, { short: true }))}${d != null ? `<span class="in">через ${d} ${plural(d, 'день', 'дня', 'дней')}</span>` : ''}</div>
        <div class="body">
          <div class="t">${esc(u.name || 'Разлок')}${u.pctSupply != null ? ` · ${pct(u.pctSupply, { asFraction: true, digits: 2 })} предложения` : ''}</div>
          ${u.note ? `<div class="n">${inline(u.note)}</div>` : ''}
        </div>
        <div class="amt">${usd(u.amountUsd)}</div>
      </div>`; }).join('')}</div>`);
  }

  if ((f.team || []).length) {
    parts.push(`<div class="panel reveal" style="margin-top:12px"><h3>Команда и инвесторы</h3>
      ${f.team.map(t => `<div class="kv"><span class="k">${esc(t.role || '')}</span>
        <span class="v">${esc(t.name || '')}${t.note ? ` <span class="faint">— ${esc(t.note)}</span>` : ''}</span></div>`).join('')}</div>`);
  }

  if ((f.highlights || []).length) {
    parts.push(`<div class="panel reveal" style="margin-top:12px"><h3>Ключевое</h3>
      <ul class="bullets">${f.highlights.map(h => `<li>${inline(h)}</li>`).join('')}</ul></div>`);
  }
  return parts.join('');
}

function derivatives(r) {
  const d = r.derivatives;
  if (!d) return '';
  const cells = [
    ['Открытый интерес', usd(d.oi), d.oiChange24h != null ? `${pct(d.oiChange24h, { sign: true })} за 24ч` : ''],
    ['Фандинг',          d.fundingRate != null ? `<span class="${signClass(d.fundingRate)}">${pct(d.fundingRate, { sign: true, digits: 4 })}</span>` : '—', d.fundingPeriod || '8ч'],
    ['Long/Short',       d.longShort != null ? d.longShort.toFixed(2) : '—'],
    ['Ликвидации 24ч',   usd(d.liq24h), d.liqLongShare != null ? `${pct(d.liqLongShare, { asFraction: true })} лонги` : ''],
  ].filter(c => c[1] !== '—');
  return (cells.length ? metricGrid(cells) : '')
    + (d.charts || []).map(chartBlock).join('')
    + (d.notes ? `<div class="panel reveal" style="margin-top:12px"><div class="prose">${prose(d.notes)}</div></div>` : '');
}

function narrative(r) {
  const n = r.narrative;
  if (!n) return '';
  const parts = [];
  if (n.sentiment) parts.push(`<div class="panel reveal"><h3>Настроения</h3><div class="prose">${prose(n.sentiment)}</div></div>`);
  parts.push((n.charts || []).map(chartBlock).join(''));
  if ((n.catalysts || []).length) {
    parts.push(`<div class="panel reveal" style="margin-top:12px"><h3>Катализаторы</h3>
      <ul class="bullets">${n.catalysts.map(c => `<li>${inline(typeof c === 'string' ? c : `${c.date ? date(c.date) + ' — ' : ''}${c.title || ''}`)}</li>`).join('')}</ul></div>`);
  }
  if ((n.news || []).length) {
    parts.push(`<div class="panel news reveal" style="margin-top:12px"><h3>Новости</h3>
      ${n.news.map(x => {
        const href = safeUrl(x.url);
        const inner = `<span class="d">${esc(date(x.date, { short: true }))}</span>
        <span class="t">${esc(x.title || '')}</span>
        ${x.source ? `<span class="src">${esc(x.source)}</span>` : ''}`;
        return href
          ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
          : `<a>${inner}</a>`;
      }).join('')}</div>`);
  }
  return parts.join('');
}

function risks(r) {
  const list = r.risks || [];
  if (!list.length) return '';
  const order = { high: 0, med: 1, low: 2 };
  const sorted = list.slice().sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  const labels = { high: 'Высокий', med: 'Средний', low: 'Низкий' };
  const counts = ['high', 'med', 'low'].map(s => list.filter(x => x.severity === s).length);
  return `<div class="risk-summary reveal">
      ${['high', 'med', 'low'].map((s, i) => counts[i]
        ? `<span class="rs ${s}"><i></i>${counts[i]} ${labels[s].toLowerCase()}</span>` : '').join('')}
    </div>
    <div class="panel">${sorted.map(x => `
    <div class="risk ${esc(x.severity || 'low')} reveal">
      <span class="dot"></span>
      <div style="flex:1;min-width:0">
        <div class="t">${esc(x.title || '')}</div>
        ${x.detail ? `<div class="d">${inline(x.detail)}</div>` : ''}
      </div>
      <span class="sev">${esc(labels[x.severity] || '')}</span>
    </div>`).join('')}</div>`;
}

function position(r) {
  const p = r.position;
  const scen = r.scenarios || [];
  if (!p && !scen.length) return '';
  const parts = [];

  // Scenario ladder when every scenario carries a numeric value; cards otherwise.
  if (scen.length && scen.every(s => typeof s.value === 'number')) {
    parts.push(chartBlock({
      type: 'ladder', title: 'СЦЕНАРИИ ПРОТИВ ТЕКУЩЕЙ ЦЕНЫ', unit: 'usd',
      current: r.market?.price, currentLabel: price(r.market?.price),
      series: scen.map(s => ({
        label: `${s.name}${s.prob != null ? ` · ${pct(s.prob, { asFraction: true, digits: 0 })}` : ''}`,
        value: s.value, display: s.target || price(s.value),
        tone: r.market?.price && s.value < r.market.price ? 'neg' : 'pos',
      })),
    }));
  }

  if (scen.length) {
    parts.push(`<div class="scen">${scen.map(s => `
      <div class="panel reveal">
        <div class="name">${esc(s.name || '')}</div>
        <div class="tgt">${esc(s.target || '—')}</div>
        ${s.prob != null ? `<div class="prob"><span class="bar"><i style="--w:${(s.prob * 100).toFixed(0)}%"></i></span>${pct(s.prob, { asFraction: true, digits: 0 })}</div>` : ''}
        ${s.detail ? `<div class="why">${inline(s.detail)}</div>` : ''}
      </div>`).join('')}</div>`);
  }

  if (p) {
    const rows = [
      ['Зона входа',    p.entry],
      ['Цель',          p.target],
      ['Инвалидация',   p.invalidation],
      ['Размер',        p.size],
      ['Горизонт',      p.horizon],
    ].filter(([, v]) => v);
    parts.push(`<div class="panel accent reveal" style="margin-top:12px">
      <h3>План</h3>
      ${rows.map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${inline(v)}</span></div>`).join('')}
      ${p.notes ? `<div class="prose" style="margin-top:14px">${prose(p.notes)}</div>` : ''}
    </div>`);
  }
  return parts.join('');
}

function sources(r) {
  const s = r.sources || [];
  if (!s.length) return '';
  return `<div class="panel reveal">${s.map(x => {
    const href = safeUrl(x.url);
    const label = href
      ? `<a class="link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(x.name)}</a>`
      : esc(x.name);
    return `<div class="kv"><span class="k">${label}</span>
    <span class="v faint" style="font-size:13px">${esc(x.note || '')}</span></div>`;
  }).join('')}</div>`;
}

/* ── Bits ────────────────────────────────────────────────────── */

function metricGrid(cells) {
  return `<div class="metrics reveal">${cells.map(([k, v, s]) => `
    <div class="metric"><div class="k">${esc(k)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>
  `).join('')}</div>`;
}

function wireCopy() {
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        const old = btn.innerHTML;
        btn.classList.add('done');
        btn.textContent = 'скопировано';
        setTimeout(() => { btn.innerHTML = old; btn.classList.remove('done'); }, 1200);
      } catch { /* clipboard unavailable */ }
    });
  });
}

/** Clicking a section heading copies a deep link to it. */
function wireAnchors() {
  document.querySelectorAll('.anchor').forEach(a => {
    a.addEventListener('click', async e => {
      e.preventDefault();
      const url = `${location.origin}${location.pathname}${location.search}${a.getAttribute('href')}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      location.hash = a.getAttribute('href');
      a.classList.add('copied');
      setTimeout(() => a.classList.remove('copied'), 1200);
    });
  });
}
