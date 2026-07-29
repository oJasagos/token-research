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

const stripImports = s => s.replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '');

const common = stripImports(read('assets/js/common.js')).replace(/^export\s+/gm, '');
const listJs = stripImports(read('assets/js/index.js'));
const reportJs = stripImports(read('assets/js/report.js'));

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
#view-list[hidden], #view-report[hidden] { display: none !important; }
</style>

<div id="view-list">
${bodyOf('index.html')}
</div>

<div id="view-report" hidden>
${bodyOf('report.html')}
</div>

<script>
window.__BUNDLE__ = ${jsonForScriptTag(bundle)};
</script>

<script>
${common}

function initListView() {
${listJs}
}

function initReportView() {
${reportJs}
}

/* ── router ───────────────────────────────────────────────────────
   '#/'  or empty  → report list
   '#/<slug>'      → that report
   '#anything-else' → an in-page anchor; leave the view alone.        */

const viewList = document.getElementById('view-list');
const viewReport = document.getElementById('view-report');
let listReady = false;
let shownSlug = null;

function route() {
  const m = (location.hash || '').match(/^#\\/(.*)$/);
  const slug = m ? m[1] : '';

  if (!m && location.hash) return;   // in-page anchor, not a route

  if (slug) {
    if (shownSlug === slug) return;
    shownSlug = slug;
    viewList.hidden = true;
    viewReport.hidden = false;
    initReportView();
    window.scrollTo(0, 0);
  } else {
    shownSlug = null;
    viewReport.hidden = true;
    viewList.hidden = false;
    if (!listReady) { initListView(); listReady = true; }
    window.scrollTo(0, 0);
  }
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='9' fill='%237c83ff'/></svg>">
</head>
<body>
${content}
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/standalone.html'), page);
// Fragment build: hosts that supply their own <html>/<head>/<body> wrapper.
fs.writeFileSync(path.join(root, 'dist/artifact.html'), content);

const kb = n => (Buffer.byteLength(n) / 1024).toFixed(0);
console.log(`dist/standalone.html — ${kb(page)} KB (full page)`);
console.log(`dist/artifact.html   — ${kb(content)} KB (fragment)`);
console.log(`${reportCount} report(s) bundled`);
