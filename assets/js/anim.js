/* Motion. Everything here is a progressive enhancement: if the observer never
 * fires or the user prefers reduced motion, content is already in its final
 * state rather than stuck invisible. */

import { reduced } from './common.js';

/** Fade-and-rise elements as they enter the viewport, staggered per group. */
export function reveal(scope = document, sel = '.reveal') {
  const items = [...scope.querySelectorAll(sel)];
  if (!items.length) return;
  if (reduced()) { items.forEach(n => n.classList.add('in')); return; }

  const io = new IntersectionObserver((entries, obs) => {
    // stagger by the order they appear on screen, not by DOM order
    entries.filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      .forEach((e, i) => {
        setTimeout(() => e.target.classList.add('in'), i * 70);
        obs.unobserve(e.target);
      });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  items.forEach(n => io.observe(n));
}

/** Count a number up to its final value. `format` maps number -> string. */
export function countUp(node, to, format, ms = 900) {
  if (reduced() || !isFinite(to)) { node.textContent = format(to); return; }
  const from = 0;
  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const t = Math.min(1, (now - t0) / ms);
    node.textContent = format(from + (to - from) * ease(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Run count-up on every [data-count] once it scrolls into view. */
export function countUpAll(scope = document) {
  const nodes = [...scope.querySelectorAll('[data-count]')];
  if (!nodes.length) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const n = e.target;
      const to = Number(n.dataset.count);
      const dec = Number(n.dataset.countDecimals || 0);
      const pre = n.dataset.countPrefix || '';
      const suf = n.dataset.countSuffix || '';
      countUp(n, to, v => pre + v.toLocaleString('ru-RU', {
        minimumFractionDigits: dec, maximumFractionDigits: dec,
      }) + suf);
      obs.unobserve(n);
    });
  }, { threshold: 0.4 });
  nodes.forEach(n => io.observe(n));
}

/** Thin accent bar across the top showing how far down the page you are. */
export function readingProgress() {
  const bar = document.createElement('div');
  bar.className = 'progress';
  bar.innerHTML = '<i></i>';
  document.body.appendChild(bar);
  const fill = bar.firstElementChild;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    fill.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  addEventListener('resize', update);
  update();
}

/** Floating "back to top", shown once the reader is well down the page. */
export function backToTop() {
  const btn = document.createElement('button');
  btn.className = 'to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Наверх');
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
  btn.addEventListener('click', () =>
    scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
  document.body.appendChild(btn);
  const update = () => btn.classList.toggle('on', scrollY > innerHeight * 0.8);
  addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  update();
}

/** Days until a date, or null if it has passed. */
export function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const ms = d.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : null;
}
