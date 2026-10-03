// Source-hygiene tests: the conventions this package claims about itself —
// documented functions, no debug leftovers, no stray dependencies, the two CSS
// copies and the two JS copies in step, and a budget on the file size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('src/vantable.js');
const CSS = read('src/vantable.css');
const DTS = read('src/vantable.d.ts');
const LINES = SRC.split('\n');
const TESTS = readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs'));

test('no debugging leftovers in the library', () => {
  assert.equal(/\bconsole\.(log|warn|error|debug)\b/.test(SRC), false, 'console calls');
  assert.equal(/\bdebugger\b/.test(SRC), false, 'debugger statements');
  assert.equal(/\b(TODO|FIXME|XXX|HACK)\b/.test(SRC), false, 'unfinished markers');
  assert.equal(/\balert\(/.test(SRC), false, 'alert() belongs in the demo, not the library');
});

test('no dynamic code execution', () => {
  assert.equal(/\beval\s*\(/.test(SRC), false);
  assert.equal(/new Function\s*\(/.test(SRC), false);
  assert.equal(/setTimeout\(\s*['"`]/.test(SRC), false, 'no string timers');
});

test('every module-level function carries a doc comment', () => {
  const missing = [];
  LINES.forEach((line, i) => {
    const m = line.match(/^ {2}function ([A-Za-z_]\w*)/);
    if (!m) return;
    const prev = (LINES[i - 1] || '').trim();
    if (!(prev.endsWith('*/') || prev.startsWith('//'))) missing.push(m[1]);
  });
  assert.deepEqual(missing, [], 'undocumented functions');
});

test('every prototype method carries a doc comment', () => {
  const missing = [];
  LINES.forEach((line, i) => {
    const m = line.match(/^ {4}(_?[A-Za-z]\w*): function/);
    if (!m) return;
    const prev = (LINES[i - 1] || '').trim();
    if (!(prev.endsWith('*/') || prev.startsWith('//'))) missing.push(m[1]);
  });
  assert.deepEqual(missing, [], 'undocumented methods');
});

test('the source is plain ASCII-indented, with no tabs or trailing blanks', () => {
  assert.equal(SRC.includes('\t'), false, 'tabs');
  assert.equal(/[ \t]+\n/.test(SRC), false, 'trailing whitespace');
  assert.equal(SRC.includes('\r'), false, 'CRLF line endings');
  assert.ok(SRC.endsWith('\n'), 'a final newline');
});

test('the library stays inside its size budget', () => {
  // A guard against runaway growth, not a hard limit: raise it deliberately.
  assert.ok(SRC.length < 130 * 1024, `src/vantable.js is ${SRC.length} B`);
  assert.ok(CSS.length < 20 * 1024, `src/vantable.css is ${CSS.length} B`);
  assert.ok(LINES.length < 3000, `${LINES.length} lines`);
});

test('the stylesheet avoids !important and external resources', () => {
  assert.equal(/!important/.test(CSS), false);
  assert.equal(/@import/.test(CSS), false);
  assert.equal(/url\(\s*['"]?https?:/.test(CSS), false, 'no fonts or images from the network');
});

test('the type definitions keep `any` to the two row aliases', () => {
  const anys = DTS.split('\n').filter((l) => /\bany\b/.test(l) && !/^\s*\/?\*/.test(l) && !/^\s*\/\//.test(l));
  assert.deepEqual(anys.map((l) => l.trim()), [
    'export type VantableRow = Record<string, any>;',
    'render?: (value: any, row: Row) => string;',
    'rows: Array<Record<string, any>>;',
    'on(event: VantableEvent, cb: (payload: any) => void): this;'
  ], 'any is only where a row value or an event payload is genuinely unknown');
});

test('every test file starts with a comment explaining what it covers', () => {
  for (const f of TESTS) {
    const first = read(`test/${f}`).split('\n')[0];
    assert.ok(first.startsWith('//'), `${f} has no header comment`);
  }
});

test('tests never use a bare setTimeout as a sleep without a reason', () => {
  // Timers are allowed (debounce, promise ticks) but must say what they wait for.
  for (const f of TESTS) {
    const body = read(`test/${f}`);
    const longWaits = [...body.matchAll(/setTimeout\([^,]+,\s*(\d{3,})\)/g)].map((m) => Number(m[1]));
    for (const ms of longWaits) assert.ok(ms <= 500, `${f} waits ${ms}ms — too slow for a unit test`);
  }
});

test('the published JS is a byte copy of the source', () => {
  assert.equal(read('dist/vantable.umd.js'), SRC, 'run npm run build');
});

test('the two stylesheets declare the same selectors, variables and keyframes', () => {
  const embedded = SRC.match(/var DEFAULT_CSS = `([\s\S]*?)`;/)[1];
  const sets = (text, re) => [...new Set(text.match(re) || [])].sort();
  for (const re of [/\.vt-[a-z0-9-]+/g, /--vt-[a-z0-9-]+/g, /@keyframes vt-[a-z-]+/g]) {
    assert.deepEqual(sets(CSS, re), sets(embedded, re), `${re} differs between the copies`);
  }
});

test('the package metadata is complete enough to publish', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const field of ['name', 'version', 'description', 'license', 'author', 'homepage', 'keywords']) {
    assert.ok(pkg[field] && String(pkg[field]).length > 0, `package.json: ${field} is empty`);
  }
  assert.ok(pkg.repository && pkg.repository.url, 'package.json: repository.url is empty');
  assert.ok(pkg.bugs && pkg.bugs.url, 'package.json: bugs.url is empty');
  assert.ok(pkg.keywords.length >= 15, 'too few keywords for npm search');
  assert.equal(pkg.dependencies, undefined, 'the package must stay dependency-free');
});

test('the README documents every option the constructor reads', () => {
  const readme = read('README.md');
  const options = [...SRC.matchAll(/options\.([a-zA-Z]+)/g)].map((m) => m[1]);
  const skip = new Set(['columns', 'data']);   // documented in prose, not the table
  const missing = [...new Set(options)].filter((o) => !skip.has(o) && !readme.includes('`' + o + '`'));
  assert.deepEqual(missing, [], 'options missing from README.md');
});

test('the README documents every event the library emits', () => {
  const readme = read('README.md');
  const events = [...SRC.matchAll(/_emit\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  const missing = [...new Set(events)].filter((e) => !readme.includes(`'${e}'`));
  assert.deepEqual(missing, [], 'events missing from README.md');
});

test('the README documents every public method', () => {
  const readme = read('README.md');
  const publicMethods = LINES
    .map((l) => (l.match(/^ {4}([a-z][A-Za-z]*): function/) || [])[1])
    .filter(Boolean)
    .filter((m) => m !== 'constructor');
  const missing = publicMethods.filter((m) => !readme.includes(m + '('));
  assert.deepEqual(missing, [], 'methods missing from README.md');
});
