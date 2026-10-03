// SSR / no-DOM tests: importing the library on a server must be harmless, and
// everything that does not touch the DOM must keep working there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'src/vantable.js'), 'utf8');

/** Load the library in a context with no document and no window at all. */
function loadHeadless() {
  const sandbox = { module: { exports: {} }, console };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { Vantable: sandbox.module.exports, sandbox };
}

test('the module loads with no document, window or navigator', () => {
  const { Vantable } = loadHeadless();
  assert.equal(typeof Vantable, 'function');
  assert.equal(Vantable.name, 'Vantable');
});

test('nothing is written to the global scope while loading', () => {
  const { sandbox } = loadHeadless();
  const own = Object.keys(sandbox).filter((k) => !['module', 'exports', 'console'].includes(k));
  assert.deepEqual(own, [], 'the module polluted its context');
});

test('the statics are available without a DOM', () => {
  const { Vantable } = loadHeadless();
  assert.match(Vantable.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Vantable.css.includes('.vt-table'));
  assert.equal(typeof Vantable.injectStyles, 'function');
  assert.equal(typeof Vantable.serverExport, 'function');
  assert.equal(typeof Vantable.sheetJsExport, 'function');
  assert.equal(typeof Vantable.jsPdfExport, 'function');
});

test('injectStyles() is a no-op on the server', () => {
  const { Vantable } = loadHeadless();
  assert.doesNotThrow(() => Vantable.injectStyles());
});

test('the adapters can be created on the server (they only run in a browser)', () => {
  const { Vantable } = loadHeadless();
  assert.equal(typeof Vantable.serverExport('/x'), 'function');
  assert.equal(typeof Vantable.sheetJsExport({ lib: {} }), 'function');
  assert.equal(typeof Vantable.jsPdfExport({ lib: function () {} }), 'function');
});

test('a server-side sheetJsExport call fails with its own clear message', () => {
  const { Vantable } = loadHeadless();
  assert.throws(() => Vantable.sheetJsExport()({ format: 'xlsx', columns: [], rows: [] }),
    /SheetJS not found/, 'not a ReferenceError about window');
});

test('a server-side jsPdfExport call fails with its own clear message', () => {
  const { Vantable } = loadHeadless();
  assert.throws(() => Vantable.jsPdfExport()({ format: 'pdf', columns: [], rows: [] }),
    /jsPDF not found/);
});

test('constructing a table without a DOM fails loudly, not silently', () => {
  const { Vantable } = loadHeadless();
  assert.throws(() => new Vantable('#host', { columns: [] }), /document is not defined/,
    'construct it in a browser-only hook (see the framework guides)');
});

test('the prototype is complete without a DOM, so types and docs can be read', () => {
  const { Vantable } = loadHeadless();
  for (const m of ['setData', 'refresh', 'destroy', 'on', 'exportCsv', 'selectAll', 'setFilter']) {
    assert.equal(typeof Vantable.prototype[m], 'function', m);
  }
});

test('the CommonJS and global builds expose the same class', () => {
  const { Vantable } = loadHeadless();
  const sandbox = { self: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  assert.equal(typeof sandbox.self.Vantable, 'function');
  assert.equal(sandbox.self.Vantable.version, Vantable.version);
});

test('loading twice in one process does not clash', () => {
  const a = loadHeadless().Vantable;
  const b = loadHeadless().Vantable;
  assert.notEqual(a, b, 'two independent copies');
  assert.equal(a.version, b.version);
});

test('the ESM wrapper is importable from Node without a DOM', async () => {
  const mod = await import('../src/vantable.mjs');
  assert.equal(typeof mod.default, 'function');
  assert.match(mod.default.version, /^\d+\.\d+\.\d+$/);
});

test('the README tells SSR users what to do', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes('server-side rendering') || readme.includes('Server-side rendering'),
    'the framework guides cover SSR');
  assert.match(readme, /ssr: false|dynamic import/, 'and say how to avoid rendering it on the server');
});
