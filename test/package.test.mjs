// Packaging invariants: the two build copies and the two CSS copies stay in
// sync, the entry points exist and load, and nothing crept into dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const require = createRequire(import.meta.url);

/** Distinct matches of a pattern, as a sorted array. */
const matches = (text, re) => [...new Set(text.match(re) || [])].sort();

test('dist/vantable.umd.js is a byte-for-byte copy of the source', () => {
  assert.equal(read('dist/vantable.umd.js'), read('src/vantable.js'),
    'run `npm run build` after editing src/vantable.js');
});

test('the standalone stylesheet and the embedded one cover the same API', () => {
  const Vantable = require('../src/vantable.js');
  const file = read('src/vantable.css');
  assert.deepEqual(matches(file, /\.vt-[a-z0-9-]+/g), matches(Vantable.css, /\.vt-[a-z0-9-]+/g),
    'class selectors differ between src/vantable.css and DEFAULT_CSS');
  assert.deepEqual(matches(file, /--vt-[a-z0-9-]+/g), matches(Vantable.css, /--vt-[a-z0-9-]+/g),
    'CSS variables differ between the two copies');
});

test('the package version matches the library constant', () => {
  const Vantable = require('../src/vantable.js');
  assert.equal(Vantable.version, pkg.version);
});

test('the package declares no runtime dependencies', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.peerDependencies || {}), []);
  assert.ok(Object.keys(pkg.devDependencies || {}).length > 0, 'dev tooling is allowed');
  assert.ok(!read('src/vantable.js').includes('require('), 'the library itself requires nothing');
});

test('every advertised entry point exists on disk', () => {
  for (const field of ['main', 'module', 'types', 'browser', 'unpkg', 'jsdelivr', 'style']) {
    assert.ok(existsSync(path.join(ROOT, pkg[field])), `${field}: ${pkg[field]}`);
  }
  for (const target of Object.values(pkg.exports['.'])) {
    assert.ok(existsSync(path.join(ROOT, target)), `exports: ${target}`);
  }
  assert.ok(existsSync(path.join(ROOT, pkg.exports['./css'])));
});

test('the published file list ships the code and not the tests', () => {
  assert.deepEqual(pkg.files,
    ['src', 'dist', 'tools', 'llms.txt', 'CHANGELOG.md', 'README.md', 'README.uk.md', 'LICENSE']);
  assert.ok(!pkg.files.includes('test'));
  assert.ok(!pkg.files.includes('examples'));
  for (const f of pkg.files) {
    if (f.includes('/') || f === 'src' || f === 'dist' || f === 'tools') continue;
    assert.ok(existsSync(path.join(ROOT, f)), `files lists ${f}, which does not exist`);
  }
});

test('the CommonJS entry exports the class', () => {
  const Vantable = require('../src/vantable.js');
  assert.equal(typeof Vantable, 'function');
  assert.equal(Vantable.name, 'Vantable');
});

test('the ESM wrapper re-exports the same class', async () => {
  const mod = await import('../src/vantable.mjs');
  assert.equal(mod.default, require('../src/vantable.js'));
});

test('the UMD wrapper registers a browser global when there is no module system', () => {
  const sandbox = { self: {}, console };
  sandbox.self.self = sandbox.self;
  vm.createContext(sandbox);
  vm.runInContext(read('src/vantable.js'), sandbox);
  assert.equal(typeof sandbox.self.Vantable, 'function');
  assert.equal(typeof sandbox.self.Vantable.serverExport, 'function');
});

test('the UMD wrapper supports an AMD loader', () => {
  const defined = [];
  const define = (factory) => defined.push(factory);
  define.amd = true;
  const sandbox = { self: {}, define, console };
  vm.createContext(sandbox);
  vm.runInContext(read('src/vantable.js'), sandbox);
  assert.equal(defined.length, 1);
  const Vantable = defined[0]();
  assert.equal(typeof Vantable, 'function');
  assert.equal(typeof Vantable.version, 'string');
});

test('all documented statics are present on the class', () => {
  const Vantable = require('../src/vantable.js');
  for (const name of ['version', 'css', 'injectStyles', 'serverExport', 'sheetJsExport', 'jsPdfExport']) {
    assert.ok(Vantable[name] !== undefined, `Vantable.${name}`);
  }
  for (const name of ['injectStyles', 'serverExport', 'sheetJsExport', 'jsPdfExport']) {
    assert.equal(typeof Vantable[name], 'function', `Vantable.${name} is callable`);
  }
});

test('all documented instance methods are present on the prototype', () => {
  const Vantable = require('../src/vantable.js');
  for (const name of ['on', 'setData', 'refresh', 'exportCsv', 'print', 'destroy']) {
    assert.equal(typeof Vantable.prototype[name], 'function', `prototype.${name}`);
  }
});

test('the type definitions declare the public surface', () => {
  const dts = read('src/vantable.d.ts');
  for (const needle of [
    'export default class Vantable',
    'static serverExport', 'static sheetJsExport', 'static jsPdfExport',
    'VantableExportPayload', 'VantableExportAdapter', 'VantableSheetJsOptions', 'VantableJsPdfOptions',
    'VantableServerRequest', 'VantableServerResponse', 'VantableColumnDef', 'VantableMode', 'VantableLabels'
  ]) {
    assert.ok(dts.includes(needle), `vantable.d.ts is missing ${needle}`);
  }
});

test('the library runs without a document until an instance is built', () => {
  // Loading the module must not touch the DOM (SSR-safe import).
  const sandbox = { module: { exports: {} }, console };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(read('src/vantable.js'), sandbox);
  const Vantable = sandbox.module.exports;
  assert.equal(typeof Vantable, 'function');
  assert.doesNotThrow(() => Vantable.injectStyles(), 'injectStyles is a no-op without a document');
  assert.ok(Vantable.css.length > 0);
});

test('the example page demonstrates every column type', () => {
  const html = read('examples/index.html');
  const declared = read('src/vantable.d.ts')
    .match(/export type VantableColumnType =([^;]+);/)[1]
    .match(/'([a-z]+)'/g).map((q) => q.slice(1, -1));
  assert.equal(declared.length, 13, 'the type union is unchanged');
  const missing = declared.filter((type) => !html.includes(`type: '${type}'`));
  assert.deepEqual(missing, [], 'every column type appears in examples/index.html');
  assert.match(html, /columnPicker: true/, 'and the column menu is shown');
  assert.ok(!/(src|href)="https?:\/\/(?!example\.com)/.test(html), 'the demo loads nothing from the network');
});

test('the example page and the typed example use the shipped API', () => {
  const html = read('examples/index.html');
  assert.match(html, /new Vantable\('#t1'/);
  assert.match(html, /Vantable\.serverExport\('\/service\/export'\)/);
  assert.match(html, /Vantable\.sheetJsExport/);
  assert.match(html, /Vantable\.jsPdfExport/);
  const ts = read('examples/type-usage.ts');
  assert.match(ts, /Vantable\.sheetJsExport/);
  assert.match(ts, /Vantable\.jsPdfExport/);
});

test('a fresh instance renders with the published UMD build too', () => {
  const env = setupDom();
  const Dist = require('../dist/vantable.umd.js');
  const t = new Dist('#host', { columns: ['id'], data: [{ id: 1 }] });
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
  assert.equal(Dist.version, loadVantable().version);
  assert.ok(env.dom);
});
