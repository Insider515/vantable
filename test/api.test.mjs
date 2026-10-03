// Public-API contract tests: the runtime, the type definitions and the README
// must describe the same library — options accepted, methods chainable, events
// emitted, statics present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('src/vantable.js');
const DTS = read('src/vantable.d.ts');
const README = read('README.md');

const COLUMNS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/** Mount with the shared fixture. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS.map((c) => ({ ...c })), data: DATA.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t };
}

test('the event union in the types covers every emitted event', () => {
  const emitted = [...new Set([...SRC.matchAll(/_emit\('([a-zA-Z]+)'/g)].map((m) => m[1]))];
  const union = DTS.match(/export type VantableEvent =([\s\S]*?);/)[1];
  const missing = emitted.filter((e) => !union.includes(`'${e}'`));
  assert.deepEqual(missing, [], 'events missing from VantableEvent');
});

test('the event union has no events the library never emits', () => {
  const emitted = new Set([...SRC.matchAll(/_emit\('([a-zA-Z]+)'/g)].map((m) => m[1]));
  const union = [...DTS.match(/export type VantableEvent =([\s\S]*?);/)[1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
  const dead = union.filter((e) => !emitted.has(e));
  assert.deepEqual(dead, [], 'documented events that cannot happen');
});

test('every option the constructor reads is declared in the types', () => {
  // `options.x(` is a method call on a value (e.g. options.columns.map), not an option.
  const used = [...new Set([...SRC.matchAll(/options\.([a-zA-Z]+)\b(?!\s*\()/g)].map((m) => m[1]))];
  const block = DTS.match(/export interface VantableOptions<[^>]*> \{([\s\S]*?)\n\}/)[1];
  const missing = used.filter((o) => !new RegExp(`\\b${o}\\??:`).test(block));
  assert.deepEqual(missing, [], 'options missing from VantableOptions');
});

test('every public method is declared in the types', () => {
  const methods = [...new Set([...SRC.matchAll(/^ {4}([a-z][A-Za-z]*): function/gm)].map((m) => m[1]))]
    .filter((m) => m !== 'constructor');
  const missing = methods.filter((m) => !new RegExp(`\\b${m}\\(`).test(DTS));
  assert.deepEqual(missing, [], 'methods missing from the class declaration');
});

test('every static is declared in the types', () => {
  const statics = [...new Set([...SRC.matchAll(/^ {2}Vantable\.([a-zA-Z]+) =/gm)].map((m) => m[1]))]
    .filter((s) => s !== 'prototype');
  const missing = statics.filter((s) => !new RegExp(`static ${s}\\b`).test(DTS));
  assert.deepEqual(missing, [], 'statics missing from the class declaration');
});

test('every column type the renderer handles is in the type union', () => {
  const cases = [...new Set([...SRC.matchAll(/^ {8}case '([a-z]+)':/gm)].map((m) => m[1]))];
  const union = DTS.match(/export type VantableColumnType =([\s\S]*?);/)[1];
  const missing = cases.filter((c) => !union.includes(`'${c}'`));
  assert.deepEqual(missing, [], 'column types missing from VantableColumnType');
});

test('the README mentions every static', () => {
  for (const s of ['version', 'css', 'injectStyles', 'serverExport', 'sheetJsExport', 'jsPdfExport']) {
    assert.ok(README.includes(`Vantable.${s}`), `Vantable.${s} is undocumented`);
  }
});

test('every documented option is accepted without throwing', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS, data: DATA, rowId: 'id',
    search: 'live', searchFields: ['name'], sort: 'client', defaultSort: 'id', defaultDir: 'desc',
    pagination: { perPage: 1, options: [1, 2] },
    editable: true, onSave: () => {},
    actions: { edit: { enabled: true } },
    accordion: { columns: ['name'] },
    export: { formats: ['csv'], filename: 'x' }, exportName: 'x', printable: true,
    filters: 'client', selection: true, states: true,
    resize: true, reorder: true, columnPicker: true, stickyHeader: true, maxHeight: 300, minColWidth: 40,
    responsive: { breakpoint: 500 },
    emptyText: 'none', label: 'Grid', labelledby: undefined,
    labels: { empty: 'none' }, keyboard: true, styles: true, theme: { accent: '#000' }, mode: 'light',
    onRowClick: () => {}
  });
  assert.ok(t.el.querySelector('.vt-table'), 'it rendered');
  assert.ok(env.dom);
  t.destroy();
});

test('virtual and accordion together resolve to a documented state', () => {
  const { t } = mount({ virtual: true, accordion: { columns: ['name'] } });
  assert.equal(t.virtual, null, 'documented: the accordion wins');
});

test('the chainable methods all return the instance', () => {
  const { t } = mount({ selection: true, columns: COLUMNS.concat([{ key: 'name', label: 'F', filter: true }]) });
  const chainable = [
    () => t.setData(DATA), () => t.refresh(), () => t.setLoading(false), () => t.setError(null),
    () => t.toggleColumn('id'), () => t.hideColumn('id'), () => t.showColumn('id'),
    () => t.moveColumn('id', 1), () => t.setColumnWidth('id', 50), () => t.pinColumn('id', false),
    () => t.setColumnState(t.columnState()), () => t.setFilter('name', ''), () => t.clearFilters(),
    () => t.selectRow(1, true), () => t.selectAll(), () => t.clearSelection(), () => t.scrollToRow(0),
    () => t.on('render', () => {})
  ];
  for (const call of chainable) assert.equal(call(), t, call.toString());
});

test('the reader methods return the documented shapes', () => {
  const { t } = mount({ selection: true, columns: COLUMNS.concat([{ key: 'name', label: 'F', filter: true }]) });
  assert.equal(typeof t.isSelected(1), 'boolean');
  assert.ok(Array.isArray(t.selectedIds()));
  assert.ok(Array.isArray(t.selectedRows()));
  assert.equal(typeof t.selectedCount(), 'number');
  assert.ok(Array.isArray(t.columnOrder()));
  assert.ok(Array.isArray(t.columnState()));
  assert.equal(typeof t.filters(), 'object');
  assert.equal(typeof t.activeFilters(), 'object');
  assert.equal(typeof t.isStacked(), 'boolean');
  assert.equal(t.getFilter('nope'), undefined);
});

test('columnState entries have exactly the documented keys', () => {
  const { t } = mount();
  for (const entry of t.columnState()) {
    assert.deepEqual(Object.keys(entry).sort(), ['hidden', 'key', 'pin', 'width']);
  }
});

test('the export payload has exactly the documented shape', () => {
  const { t } = mount();
  const payload = t._buildPayload('xlsx');
  assert.deepEqual(Object.keys(payload).sort(), ['columns', 'filename', 'format', 'rows']);
  assert.deepEqual(Object.keys(payload.columns[0]).sort(), ['key', 'label']);
});

test('the server request has exactly the documented keys per mode', async () => {
  const calls = [];
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS.concat([{ key: 'name', label: 'F', filter: true }]),
    searchFields: ['name'],
    server: { fetch: (req) => { calls.push(req); return { rows: DATA, total: 2 }; } }
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(Object.keys(calls[0]).sort(), ['dir', 'fields', 'page', 'perPage', 'q', 'sort']);
  t.setFilter('name', 'a');
  await new Promise((r) => setTimeout(r, 0));
  assert.ok('filters' in calls.at(-1));
  assert.ok(env.dom);
});

test('every event carries the payload the README documents', async () => {
  const seen = {};
  const { t, env } = mount({
    editable: true,
    selection: { actions: [{ label: 'B' }] },
    accordion: { columns: ['name'] },
    columns: COLUMNS.concat([
      { key: 'name', label: 'F', filter: true },
      { key: 'name', label: 'C', type: 'copy' },
      { key: 'name', label: 'S', type: 'select', options: ['Ann', 'Bob'] },
      { label: 'A', type: 'actions', menu: false, edit: { enabled: true }, remove: { enabled: true }, custom: [{ label: 'P' }] }
    ])
  });
  for (const name of ['render', 'save', 'remove', 'edit', 'action', 'cellChange', 'expand', 'copy',
    'export', 'columnResize', 'columnMove', 'columnPin', 'columnVisibility', 'loading',
    'selectionChange', 'bulkAction', 'filterChange', 'destroy']) {
    t.on(name, (p) => { seen[name] = p === undefined ? {} : p; });
  }
  t.refresh();
  t.el.querySelector('[data-act="edit"]').click();
  t.el.querySelector('[data-act="save"]').click();
  t.el.querySelector('[data-act="custom"]').click();
  t.el.querySelector('.vt-expander').click();
  t.el.querySelector('.vt-copy').click();
  const sel = t.el.querySelector('select.vt-cell-select');
  sel.value = 'Bob';
  sel.dispatchEvent(new env.window.Event('change', { bubbles: true }));
  t.setColumnWidth('id', 80);
  t.moveColumn('id', 1);
  t.pinColumn('id', 'left');
  t.hideColumn('id');
  t.setFilter('name', 'a');
  t.selectRow(1, true);
  t.el.querySelector('[data-bulk="0"]').click();
  t.setLoading(true);
  t.exportCsv();
  t.el.querySelector('[data-act="remove"]').click();
  env.window.document.querySelectorAll('.vt-modal-foot button')[1].click();
  await new Promise((r) => setTimeout(r, 0));
  t.destroy();

  assert.deepEqual(Object.keys(seen.render), ['rows']);
  assert.deepEqual(Object.keys(seen.save).sort(), ['changes', 'id', 'row']);
  assert.deepEqual(Object.keys(seen.edit).sort(), ['id', 'row']);
  assert.deepEqual(Object.keys(seen.action).sort(), ['id', 'index', 'row']);
  assert.deepEqual(Object.keys(seen.cellChange).sort(), ['column', 'id', 'row', 'value']);
  assert.deepEqual(Object.keys(seen.expand).sort(), ['id', 'open', 'row']);
  assert.deepEqual(Object.keys(seen.copy), ['text']);
  assert.deepEqual(Object.keys(seen.export).sort(), ['format', 'rows']);
  assert.deepEqual(Object.keys(seen.columnResize).sort(), ['key', 'width']);
  assert.deepEqual(Object.keys(seen.columnMove).sort(), ['from', 'key', 'order', 'to']);
  assert.deepEqual(Object.keys(seen.columnPin).sort(), ['key', 'pin']);
  assert.deepEqual(Object.keys(seen.columnVisibility).sort(), ['hidden', 'key']);
  assert.deepEqual(Object.keys(seen.loading), ['loading']);
  assert.deepEqual(Object.keys(seen.selectionChange).sort(), ['count', 'ids', 'rows']);
  assert.deepEqual(Object.keys(seen.bulkAction).sort(), ['ids', 'index', 'label', 'rows']);
  assert.deepEqual(Object.keys(seen.filterChange).sort(), ['filters', 'key', 'value']);
  assert.deepEqual(Object.keys(seen.remove).sort(), ['id', 'ok', 'row']);
  assert.ok('destroy' in seen);
});

test('an unknown event name is accepted and simply never fires', () => {
  const { t } = mount();
  let fired = false;
  t.on('nope', () => { fired = true; });
  t.refresh();
  assert.equal(fired, false);
});

test('the same event can carry several handlers', () => {
  const { t } = mount();
  const order = [];
  t.on('render', () => order.push('a')).on('render', () => order.push('b'));
  t.refresh();
  assert.deepEqual(order, ['a', 'b'], 'in registration order');
});

test('destroy() is idempotent and leaves the instance usable as an object', () => {
  const { t } = mount();
  t.destroy();
  t.destroy();
  assert.equal(t.el.innerHTML, '');
  assert.deepEqual(t.selectedIds(), []);
});

test('the version is a valid semver and matches the package', () => {
  const { Vantable } = mount();
  const pkg = JSON.parse(read('package.json'));
  assert.match(Vantable.version, /^\d+\.\d+\.\d+$/);
  assert.equal(Vantable.version, pkg.version);
});

test('the three export adapters share one call signature', () => {
  const { Vantable } = mount();
  for (const make of [Vantable.serverExport('/x'), Vantable.sheetJsExport(), Vantable.jsPdfExport()]) {
    assert.equal(typeof make, 'function');
    assert.equal(make.length, 1, 'an adapter takes exactly the payload');
  }
});

test('the adapters refuse a payload when their library is missing', () => {
  const { Vantable, t } = mount();
  const payload = t._buildPayload('xlsx');
  assert.throws(() => Vantable.sheetJsExport()(payload), /SheetJS not found/);
  assert.throws(() => Vantable.jsPdfExport()(payload), /jsPDF not found/);
});

test('constructing without a target throws a named error', () => {
  setupDom();
  const Vantable = loadVantable();
  assert.throws(() => new Vantable('#missing', { columns: [] }), /\[Vantable\] target element not found/);
});

test('the modes accept every documented alias', () => {
  for (const alias of ['live', 'client', 'local']) assert.equal(mount({ search: alias }).t.searchMode, 'client');
  for (const alias of ['server', 'db', 'remote']) assert.equal(mount({ search: alias }).t.searchMode, 'server');
  for (const alias of ['off', 'none']) assert.equal(mount({ search: alias }).t.searchMode, 'off');
});

test('options default the way the README says', () => {
  const { t } = mount();
  assert.deepEqual(t.pagination, { perPage: 50, options: [50, 100, 250, 500] });
  assert.equal(t.keyboard, true);
  assert.equal(t.printable, true);
  assert.equal(t.exportName, 'table');
  assert.equal(t.minColWidth, 48);
  assert.equal(t.selection, null);
  assert.equal(t.virtual, null);
  assert.equal(t.responsive, null);
  assert.deepEqual(t.states, { loading: true, skeleton: 8, error: true, retry: true });
});

test('a column definition survives normalisation unchanged where it matters', () => {
  const { t } = mount({ columns: [{ key: 'id', label: 'ID', type: 'number', width: '60px', align: 'right' }] });
  const c = t.columns[0];
  assert.equal(c.key, 'id');
  assert.equal(c.label, 'ID');
  assert.equal(c.type, 'number');
  assert.equal(c.width, '60px');
  assert.equal(c.align, 'right');
  assert.equal(c.sortable, true, 'defaulted');
  assert.ok(c.vtId, 'given an internal id');
});

test('the library keeps no global state between instances', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const a = new Vantable('#a', { columns: COLUMNS, data: DATA, selection: true });
  const b = new Vantable('#b', { columns: COLUMNS, data: DATA, selection: true });
  a.selectAll();
  assert.equal(b.selectedCount(), 0);
  a.destroy();
  assert.equal(b.el.querySelectorAll('tbody tr.vt-tr').length, 2, 'b is untouched');
  assert.ok(env.dom);
});
