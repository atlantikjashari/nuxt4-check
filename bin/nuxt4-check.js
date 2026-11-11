#!/usr/bin/env node
/**
 * nuxt4-check — scan a Nuxt 3 project for Nuxt 4 breaking changes.
 * Zero dependencies. Read-only: never modifies your files.
 *
 * Usage:
 *   npx nuxt4-check [projectDir] [--md report.md] [--json]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VERSION = '0.1.0';
const CONTACT = 'atlantik.jashari@gmail.com';

// ---------- args ----------
const args = process.argv.slice(2);
let root = '.';
let mdOut = null;
let jsonOut = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--md') mdOut = args[++i] || 'nuxt4-report.md';
  else if (a === '--json') jsonOut = true;
  else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
  else if (a === '-v' || a === '--version') { console.log(VERSION); process.exit(0); }
  else root = a;
}
root = path.resolve(root);

function printHelp() {
  console.log(`nuxt4-check v${VERSION}
Scan a Nuxt 3 project for Nuxt 4 breaking changes (read-only).

Usage: npx nuxt4-check [projectDir] [--md report.md] [--json]
`);
}

// ---------- helpers ----------
const IGNORE_DIRS = new Set(['node_modules', '.nuxt', '.output', '.git', 'dist', '.data', 'coverage', '.vercel', '.netlify']);
const CODE_EXT = new Set(['.vue', '.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx', '.mts']);

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') { if (IGNORE_DIRS.has(e.name)) continue; }
    if (IGNORE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (CODE_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
const rel = (p) => path.relative(root, p) || '.';

const findings = [];
function add(severity, id, title, fix, loc) {
  findings.push({ severity, id, title, fix, loc: loc || null });
}

// ---------- 1. package.json / version ----------
const pkg = readJSON(path.join(root, 'package.json'));
if (!pkg) {
  console.error(`No package.json found in ${root}. Run this from (or point it at) your Nuxt project root.`);
  process.exit(1);
}
const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const nuxtRange = allDeps.nuxt || allDeps['nuxt3'] || allDeps['nuxt-edge'] || null;
const major = nuxtRange ? parseInt(String(nuxtRange).replace(/^[^\d]*/, ''), 10) : NaN;

let stage = 'unknown';
if (!nuxtRange) stage = 'not-nuxt';
else if (major === 2) stage = 'nuxt2';
else if (major === 3) stage = 'nuxt3';
else if (major >= 4) stage = 'nuxt4';

// ---------- 2. modules ----------
const modulePkgs = Object.keys(allDeps).filter((d) =>
  d !== 'nuxt' && (/^@nuxtjs\//.test(d) || /^@nuxt\//.test(d) || /^nuxt-/.test(d) || /-nuxt$/.test(d) || /\/nuxt$/.test(d))
);

// ---------- 3. directory structure ----------
const LEGACY_APP_DIRS = ['pages', 'components', 'composables', 'layouts', 'middleware', 'plugins', 'utils', 'assets'];
const hasAppDir = fs.existsSync(path.join(root, 'app')) && fs.statSync(path.join(root, 'app')).isDirectory();
const legacyAtRoot = LEGACY_APP_DIRS.filter((d) => fs.existsSync(path.join(root, d)));
const rootAppVue = ['app.vue', 'error.vue', 'app.config.ts'].filter((f) => fs.existsSync(path.join(root, f)));
if (!hasAppDir && (legacyAtRoot.length || rootAppVue.length)) {
  add('low', 'dir-structure',
    `Nuxt 3 directory layout at project root (${[...legacyAtRoot.map((d) => d + '/'), ...rootAppVue].join(', ')})`,
    'Optional: Nuxt 4 auto-detects the v3 layout. To adopt the new layout, move these into app/ (codemod: nuxt/4/file-structure). Note the ~ alias will point to app/.');
}

// ---------- 4. code scan ----------
const files = walk(root);
const usesDataFetching = (src) => /\buse(Async)?Data\b|\buseFetch\b|\buseLazy(Async)?Data\b|\buseLazyFetch\b/.test(src);

const RULES = [
  // [regex, severity, id, title, fix, guard?]
  [/\b(data|error)\.value\s*(===|!==|==|!=)\s*null\b/, 'high', 'null-default',
    'Null check on useAsyncData/useFetch data or error', 'data and error now default to undefined (not null). Compare with undefined or use a falsy check. Codemod: nuxt/4/default-data-error-value.', usesDataFetching],
  [/\bnull\s*(===|!==|==|!=)\s*(data|error)\.value\b/, 'high', 'null-default',
    'Null check on useAsyncData/useFetch data or error', 'data and error now default to undefined (not null). Codemod: nuxt/4/default-data-error-value.', usesDataFetching],
  [/dedupe\s*:\s*(true|false)\b/, 'high', 'dedupe-boolean',
    'Boolean dedupe option removed', "Use dedupe: 'cancel' (was true) or 'defer' (was false). Codemod: nuxt/4/deprecated-dedupe-value."],
  [/\b(data)\.value(\??\.)[A-Za-z_$][\w$]*(\.[\w$]+)*\s*=[^=]/, 'medium', 'shallow-data',
    'Nested mutation of fetched data', 'data is now a shallowRef: nested mutations no longer trigger updates. Pass { deep: true } to this call or replace data.value entirely. Codemod: nuxt/4/shallow-function-reactivity.', usesDataFetching],
  [/\bgetCachedData\b/, 'medium', 'getCachedData',
    'getCachedData behaviour changed', "Now called on every fetch (incl. watch/refresh) with a 3rd ctx arg { cause }. Check your caching logic still holds."],
  [/\bpending\b/, 'medium', 'pending',
    '`pending` semantics changed', "pending is now only true while status === 'pending'; with immediate: false it stays false until the first request. Prefer status checks.", usesDataFetching],
  [/immediate\s*:\s*false/, 'medium', 'immediate-false-key',
    'immediate: false with reactive key', 'Key changes now only refetch if data was fetched before. Add watch(key, () => execute(), { once: true }) if you relied on the first fetch.', usesDataFetching],
  [/route\.meta\.name\b|\.meta\.name\b/, 'medium', 'route-meta-name',
    'route.meta.name usage', 'definePageMeta props like name live on the route itself: use route.name.'],
  [/window\.__NUXT__/, 'high', 'window-nuxt',
    'window.__NUXT__ is removed after hydration', 'Use useNuxtApp().payload instead.'],
  [/\b(vmid|hid)\s*:/, 'low', 'unhead-v2-props',
    'Removed head props (vmid / hid)', 'Unhead v2 removed vmid, hid, children, body. Use key for dedupe. Temporary escape hatch: unhead: { legacy: true }.'],
  [/from\s+['"]@unhead\/vue['"]/, 'low', 'unhead-import',
    'Direct import from @unhead/vue', "Import composables from '#imports' or 'nuxt/app' instead."],
  [/findComponent\(\s*['"][A-Za-z]/, 'medium', 'component-names',
    'Component lookup by name', 'Component names are now normalised to the Nuxt-style name (e.g. SomeFolderMyComponent). Update findComponent/KeepAlive lists, or set experimental.normalizeComponentNames: false.'],
  [/<KeepAlive[^>]*\b(include|exclude)=/i, 'medium', 'keepalive-names',
    'KeepAlive include/exclude by component name', 'Component names are normalised in Nuxt 4 — re-check these names.'],
  [/['"]builder:watch['"]/, 'low', 'builder-watch',
    'builder:watch hook (absolute path now)', 'The emitted path is now absolute. Normalise with relative(srcDir, resolve(srcDir, path)). Codemod: nuxt/4/absolute-watch-path.'],
  [/clearNuxtState\(/, 'low', 'clearNuxtState',
    'clearNuxtState usage', 'Behaviour is configurable in Nuxt 4 (reset to default vs undefined). Verify expected state after clearing.'],
];

const CONFIG_RULES = [
  [/^\s*generate\s*:/m, 'high', 'generate-config', 'Top-level generate config removed',
    'Move generate.routes → nitro.prerender.routes and generate.exclude → nitro.prerender.ignore.'],
  [/\b(treeshakeClientOnly|configSchema|polyfillVueUseHead|respectNoSSRHeader)\b/, 'medium', 'removed-experimental',
    'Removed experimental option', 'These experimental flags were removed in Nuxt 4 — delete them.'],
  [/devBundler/, 'low', 'devBundler', 'vite.devBundler is no longer configurable', 'Remove it; Nuxt 4 always uses vite-node.'],
  [/compatibilityVersion\s*:\s*4/, 'info', 'compat-v4', 'future.compatibilityVersion: 4 already set',
    'Good sign — you have been running Nuxt 4 behaviour on Nuxt 3. The upgrade should be smaller.'],
  [/noUncheckedIndexedAccess/, 'info', 'ts-unchecked', 'noUncheckedIndexedAccess configured',
    'Nuxt 4 enables noUncheckedIndexedAccess by default; you already manage it.'],
];

for (const f of files) {
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (src.length > 1_500_000) continue;
  const lines = src.split(/\r?\n/);
  const base = path.basename(f);
  const isConfig = /^nuxt\.config\.(ts|js|mjs)$/.test(base);

  for (const [re, sev, id, title, fix, guard] of RULES) {
    if (guard && !guard(src)) continue;
    lines.forEach((ln, i) => { if (re.test(ln)) add(sev, id, title, fix, `${rel(f)}:${i + 1}`); });
  }
  if (isConfig) {
    for (const [re, sev, id, title, fix] of CONFIG_RULES) {
      lines.forEach((ln, i) => { if (re.test(ln)) add(sev, id, title, fix, `${rel(f)}:${i + 1}`); });
    }
  }
  if (base === 'error.vue' && /JSON\.parse\(/.test(src)) {
    const i = lines.findIndex((l) => /JSON\.parse\(/.test(l));
    add('low', 'error-data-parse', 'JSON.parse of error.data in error.vue', 'error.data is now parsed automatically — remove JSON.parse.', `${rel(f)}:${i + 1}`);
  }
  if (/template\s*\(|lodash\.template|from\s+['"]lodash\/template['"]/.test(src) && /addTemplate|addTypeTemplate/.test(src)) {
    add('medium', 'ejs-templates', 'EJS/lodash template compilation in a local module', 'Lodash template compilation was removed. Use getContents() with plain string building. Codemod: nuxt/4/template-compilation-changes.', rel(f));
  }
}

// TypeScript default
if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
  add('info', 'ts-strict-index', 'TypeScript: noUncheckedIndexedAccess becomes true',
    'Expect new type errors on array/record indexing. Fix them, or opt out via typescript.tsConfig.compilerOptions.noUncheckedIndexedAccess: false.');
}

// ---------- 5. scoring ----------
const W = { high: 5, medium: 3, low: 1, info: 0 };
const score = findings.reduce((s, f) => s + W[f.severity], 0);
let effort;
if (stage === 'nuxt2') effort = 'Large — Nuxt 2 → 4 is a framework rewrite (Vue 2 → 3, Nitro, new data fetching).';
else if (stage === 'nuxt4') effort = 'Already on Nuxt 4.';
else if (score <= 20) effort = 'Small — likely 1–3 days including testing.';
else if (score <= 60) effort = 'Medium — likely 3–8 days including testing.';
else effort = 'Large — plan 2+ weeks; module compatibility and data-fetching changes need careful testing.';

// group
const byId = new Map();
for (const f of findings) {
  if (!byId.has(f.id)) byId.set(f.id, { ...f, locs: [] });
  if (f.loc) byId.get(f.id).locs.push(f.loc);
}
const ORDER = { high: 0, medium: 1, low: 2, info: 3 };
const groups = [...byId.values()].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.locs.length - a.locs.length);
const counts = { high: 0, medium: 0, low: 0, info: 0 };
for (const g of groups) counts[g.severity] += Math.max(1, g.locs.length);

const result = {
  tool: 'nuxt4-check', version: VERSION, project: pkg.name || path.basename(root),
  nuxt: nuxtRange, stage, filesScanned: files.length, modules: modulePkgs, counts, score, effort,
  findings: groups.map(({ severity, id, title, fix, locs }) => ({ severity, id, title, fix, locations: locs })),
};

// ---------- 6. output ----------
if (jsonOut) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const SEV = { high: c('31;1', 'HIGH  '), medium: c('33;1', 'MEDIUM'), low: c('36', 'LOW   '), info: c('90', 'INFO  ') };

const out = [];
out.push('');
out.push(c('1', `nuxt4-check v${VERSION}`) + `  —  ${result.project}`);
out.push(`Nuxt version: ${nuxtRange || 'not found'}   Files scanned: ${files.length}`);
if (stage === 'not-nuxt') out.push(c('33', 'This does not look like a Nuxt project (no nuxt dependency).'));
if (stage === 'nuxt2') out.push(c('31;1', 'Nuxt 2 detected (EOL since 30 June 2024). This needs a full migration, not just an upgrade.'));
if (stage === 'nuxt3') out.push(c('33;1', 'Nuxt 3 detected — Nuxt 3 reached end of life on 31 July 2026 (no more security patches).'));
if (stage === 'nuxt4') out.push(c('32;1', 'Already on Nuxt 4. Remaining items below are informational.'));
out.push('');
if (modulePkgs.length) {
  out.push(c('1', 'Modules to verify for Nuxt 4 support:'));
  for (const m of modulePkgs) out.push(`  • ${m}@${allDeps[m]}`);
  out.push('');
}
if (!groups.length) out.push(c('32', 'No known breaking-change patterns found.'));
for (const g of groups) {
  out.push(`${SEV[g.severity]}  ${g.title}${g.locs.length ? c('90', `  (${g.locs.length})`) : ''}`);
  out.push(c('90', `        → ${g.fix}`));
  for (const l of g.locs.slice(0, 8)) out.push(c('90', `          ${l}`));
  if (g.locs.length > 8) out.push(c('90', `          …and ${g.locs.length - 8} more`));
}
out.push('');
out.push(c('1', 'Summary: ') + `${counts.high} high, ${counts.medium} medium, ${counts.low} low`);
out.push(c('1', 'Estimated effort: ') + effort);
out.push('');
if (stage === 'nuxt3') {
  out.push('Next steps: run the official codemods  →  npx codemod@0.18.7 nuxt/4/migration-recipe');
  out.push('Full guide: https://nuxt.com/docs/4.x/getting-started/upgrade');
}
out.push(c('90', 'This is a heuristic scan; it can miss issues and flag false positives.'));
out.push('');
out.push(c('1', 'Want it done for you?') + ` Fixed-price Nuxt 4 upgrades with full regression testing — ${CONTACT}`);
out.push('');
console.log(out.join('\n'));

if (mdOut) {
  const md = [];
  md.push(`# Nuxt 4 readiness report — ${result.project}`, '');
  md.push(`- **Nuxt version:** ${nuxtRange || 'not found'}`);
  md.push(`- **Files scanned:** ${files.length}`);
  md.push(`- **Findings:** ${counts.high} high, ${counts.medium} medium, ${counts.low} low`);
  md.push(`- **Estimated effort:** ${effort}`, '');
  if (modulePkgs.length) { md.push('## Modules to verify', ''); for (const m of modulePkgs) md.push(`- \`${m}@${allDeps[m]}\``); md.push(''); }
  md.push('## Findings', '');
  for (const g of groups) {
    md.push(`### [${g.severity.toUpperCase()}] ${g.title}`, '', g.fix, '');
    for (const l of g.locs) md.push(`- \`${l}\``);
    md.push('');
  }
  md.push('---', `Generated by nuxt4-check v${VERSION}. Heuristic scan — verify before relying on it.`, '');
  md.push(`Need help? Fixed-price Nuxt 4 upgrades: ${CONTACT}`);
  fs.writeFileSync(path.resolve(mdOut), md.join('\n'));
  console.log(`Markdown report written to ${mdOut}`);
}

process.exitCode = counts.high > 0 ? 1 : 0;
