'use strict';
// Smoke tests: run the CLI against fixtures and check the results.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert');
const cli = path.join(__dirname, '..', 'bin', 'nuxt4-check.js');
function run(dir) {
  try { return JSON.parse(execFileSync('node', [cli, path.join(__dirname, dir), '--json'], { encoding: 'utf8' })); }
  catch (e) { return JSON.parse(e.stdout); }
}
const n3 = run('n3');
assert.strictEqual(n3.stage, 'nuxt3');
const ids = n3.findings.map((f) => f.id);
for (const id of ['generate-config', 'null-default', 'dedupe-boolean', 'window-nuxt', 'shallow-data', 'getCachedData', 'route-meta-name', 'removed-experimental', 'error-data-parse', 'unhead-v2-props', 'keepalive-names', 'dir-structure']) {
  assert.ok(ids.includes(id), `expected finding ${id}`);
}
const n4 = run('n4');
assert.strictEqual(n4.stage, 'nuxt4');
assert.strictEqual(n4.findings.length, 0, 'clean Nuxt 4 app should have no findings');
console.log('All tests passed.');
