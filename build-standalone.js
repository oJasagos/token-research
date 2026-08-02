#!/usr/bin/env node
/**
 * Builds dist/standalone.html — the whole site inlined into one file.
 *
 * Why: the multi-page site needs a web server (browsers block fetch on file://).
 * The standalone build has every report baked in, so it opens straight from disk
 * and can be published as a single shareable page.
 *
 * It reuses the real source files rather than duplicating them — the only
 * transforms are stripping ES module syntax and wrapping each entry point in a
 * function so both views can live in one document. Run after changing any
 * report:  node build-standalone.js
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

/** JSON safe to inline inside a <script> block.
 *  JSON.stringify leaves `<` alone, so a report containing the literal text
 *  `</script>` would close the tag early: the page dies and anything after it
 *  is parsed as markup. Report text quotes external sources, so treat it as
 *  untrusted and escape the characters that can end a script block. */
function jsonForScriptTag(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* \u2028 and \u2029 are newlines to a JS parser but not inside a JSON string. */

/* ── collect data ─────────────────────────────────────────────── */

const bundle = { 'data/index.json': JSON.parse(read('data/index.json')) };

for (const file of fs.readdirSync(path.join(root, 'data/reports'))) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue;
  bundle[`data/reports/${file}`] = JSON.parse(read(`data/reports/${file}`));
}

const reportCount = Object.keys(bundle).length - 1;

/* ── transform sources ────────────────────────────────────────── */

/* Every module ends up in one scope, so a plain `import { pct }` needs nothing
   at all — pct is already there. A renaming import is different: dropping
   `import { price as fmtPrice }` leaves fmtPrice undefined, and the file only
   breaks at runtime, in the browser, on the standalone build. Re-declare the
   alias instead of deleting the line. */
const KNOWN = new Set();

function stripImports(src) {
  return src.replace(/^import\s+([\s\S]*?)\s+from\s+'[^']+';\s*$/gm, (_, clause) => {
    const named = clause.trim().match(/^\{([\s\S]*)\}$/);
    if (!named) return '';                       // default or namespace import
    const out = [];
    for (const part of named[1].split(',')) {
      const name = part.trim();
      if (!name) continue;
      const alias = name.match(/^(\S+)\s+as\s+(\S+)$/);
      out.push(alias ? `const ${alias[2]} = ${alias[1]};` : '');
      KNOWN.add(alias ? alias[1] : name);
    }
    return out.filter(Boolean).join('\n');
  });
}

/* Shared modules, in dependency order: charts.js and anim.js both build on
   common.js. Stripping `export` drops them all into one scope, which is what
   the two entry points below expect. Miss one and the page renders nothing. */
const shared = ['assets/js/common.js', 'assets/js/charts.js', 'assets/js/anim.js', 'assets/js/live.js']
  .map(f => stripImports(read(f)).replace(/^export\s+/gm, ''))
  .join('\n');
const listJs = stripImports(read('assets/js/index.js'));
const reportJs = stripImports(read('assets/js/report.js'));
const compareJs = stripImports(read('assets/js/compare.js'));

/* An imported name that nothing exports is fine under real ES modules right up
   until this build merges the files: then it is just a missing global. The
   parse check below cannot see it, so compare the two lists here. */
const exported = new Set(
  [...shared.matchAll(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/gm)]
    .map(m => m[1] || m[2]));
const missing = [...KNOWN].filter(n => !exported.has(n));
if (missing.length) {
  console.error(`\nBuild aborted: imported but never defined in the bundle: ${missing.join(', ')}\n`);
  process.exit(1);
}

/** Pull the body markup out of a page, minus its script tag. */
function bodyOf(file) {
  const html = read(file);
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  return body.replace(/<script[\s\S]*?<\/script>/g, '').trim();
}

const css = read('assets/css/style.css');

/* ── emit ─────────────────────────────────────────────────────── */

/* The page content, with no document wrapper — usable on its own. */
const content = `<title>Token Research</title>
<style>
${css}
#view-list[hidden], #view-report[hidden], #view-compare[hidden] { display: none !important; }
</style>

<div id="view-list">
${bodyOf('index.html')}
</div>

<div id="view-report" hidden>
${bodyOf('report.html')}
</div>

<div id="view-compare" hidden>
${bodyOf('compare.html')}
</div>

<script>
window.__BUNDLE__ = ${jsonForScriptTag(bundle)};
</script>

<script>
${shared}

function initListView() {
${listJs}
}

function initReportView() {
${reportJs}
}

function initCompareView() {
${compareJs}
}

/* ── router ───────────────────────────────────────────────────────
   '#/'  or empty   → report list
   '#/compare'      → comparison table
   '#/<slug>'       → that report
   '#anything-else' → an in-page anchor; leave the view alone.        */

const views = {
  list:    document.getElementById('view-list'),
  report:  document.getElementById('view-report'),
  compare: document.getElementById('view-compare'),
};
let listReady = false;
let shown = null;

function show(which) {
  for (const [k, node] of Object.entries(views)) node.hidden = k !== which;
  window.scrollTo(0, 0);
}

function route() {
  const m = (location.hash || '').match(/^#\\/(.*)$/);
  if (!m && location.hash) return;   // in-page anchor, not a route
  const slug = m ? m[1] : '';

  if (shown === slug) return;
  shown = slug;

  if (slug === 'compare') { show('compare'); initCompareView(); }
  else if (slug) { show('report'); initReportView(); }
  else { show('list'); if (!listReady) { initListView(); listReady = true; } }
}

// Rewrite the multi-page links into routes.
document.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('report.html?id=')) {
    e.preventDefault();
    location.hash = '#/' + href.slice('report.html?id='.length);
  } else if (href === 'index.html') {
    e.preventDefault();
    location.hash = '#/';
  } else if (href === 'compare.html') {
    e.preventDefault();
    location.hash = '#/compare';
  }
});

addEventListener('hashchange', route);
route();
</script>
`;

/* Full document — opens straight from disk. */
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src https://api.binance.com https://api.mexc.com https://api.gateio.ws; base-uri 'none'; form-action 'none'">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='9' fill='%237c83ff'/></svg>">
</head>
<body>
${content}
</body>
</html>
`;

/* Concatenating modules into one scope can collide names that were fine when
   each file was isolated. Parse the result so the build fails here rather than
   silently shipping a page that renders nothing. */
const scripts = [...content.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((src, i) => {
  try { new (require('vm').Script)(src); }
  catch (e) { console.error(`\nBuild aborted: script block ${i + 1} does not parse.\n${e.message}\n`); process.exit(1); }
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/standalone.html'), page);
// Fragment build: hosts that supply their own <html>/<head>/<body> wrapper.
fs.writeFileSync(path.join(root, 'dist/artifact.html'), content);

const kb = n => (Buffer.byteLength(n) / 1024).toFixed(0);
console.log(`dist/standalone.html — ${kb(page)} KB (full page)`);
console.log(`dist/artifact.html   — ${kb(content)} KB (fragment)`);
console.log(`${reportCount} report(s) bundled`);
