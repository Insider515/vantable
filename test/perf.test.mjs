// Budget tests: the table must stay cheap on big datasets and must not leak
// nodes, listeners or timers across re-renders and instances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', type: 'copy' }
];
/** `n` rows of test data. */
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'row' + i, email: i + '@x.io' }));

/** Mount a table over `n` rows. */
function mount(n, options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS.map((c) => ({ ...c })), data: rows(n) }, options || {}));
  return { env, Vantable, t };
}
/** Give the scroll box a viewport so virtualization can work in jsdom. */
function viewport(t, height, rowHeight) {
  const sc = t.el.querySelector('.vt-scroll');
  let top = 0;
  Object.defineProperty(sc, 'clientHeight', { get: () => height, configurable: true });
  Object.defineProperty(sc, 'scrollTop', { get: () => top, set: (v) => { top = v; }, configurable: true });
  return { sc, to(px) { top = px; sc.dispatchEvent(new sc.ownerDocument.defaultView.Event('scroll')); } };
}

test('pagination keeps the DOM small whatever the dataset size', () => {
  const { t } = mount(20000, { pagination: { perPage: 25, options: [25] } });
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 25);
  assert.equal(t.state.total, 20000);
  assert.ok(t.el.querySelectorAll('td').length < 100, 'only a page worth of cells');
});

test('virtualization keeps the DOM small without pagination', () => {
  const { t } = mount(50000, { pagination: false, virtual: { rowHeight: 20, overscan: 5 } });
  viewport(t, 400, 20);
  t.refresh();
  const rendered = t.el.querySelectorAll('tbody tr.vt-tr').length;
  assert.ok(rendered <= 35, `${rendered} rows rendered out of 50 000`);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-spacer').length, 1, 'the rest is one spacer');
});

test('scrolling a virtual table does not grow the DOM', () => {
  const { t } = mount(20000, { pagination: false, virtual: { rowHeight: 20, overscan: 2 } });
  const vp = viewport(t, 200, 20);
  t.refresh();
  const dataRows = () => t.el.querySelectorAll('tbody tr.vt-tr').length;
  const first = dataRows();
  for (let i = 1; i <= 20; i++) vp.to(i * 400);
  assert.equal(dataRows(), first, 'the window replaces its rows, never appends');
  // In the middle of the list there are two spacers instead of one — that is
  // the only part of the body that changes count.
  assert.ok(t.el.querySelectorAll('tbody tr.vt-spacer').length <= 2);
  assert.equal(t.el.querySelectorAll('tbody tr').length, first + 2);
});

test('a 10 000-row client table renders within a sane budget', () => {
  const started = Date.now();
  const { t } = mount(10000, { pagination: { perPage: 100, options: [100] } });
  const ms = Date.now() - started;
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 100);
  // Generous on purpose: this catches an accidental O(n²), not a slow machine.
  assert.ok(ms < 3000, `first render took ${ms}ms`);
});

test('searching 10 000 rows stays linear enough to be instant', () => {
  const { t } = mount(10000, { search: 'live', pagination: { perPage: 50, options: [50] } });
  const started = Date.now();
  t.state.q = 'row9999';
  t.refresh();
  const ms = Date.now() - started;
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
  assert.ok(ms < 1000, `search took ${ms}ms`);
});

test('sorting 10 000 rows does not copy the data per row', () => {
  const { t } = mount(10000, { sort: 'client', pagination: { perPage: 50, options: [50] } });
  const started = Date.now();
  t.state.sort = 'name';
  t.refresh();
  const ms = Date.now() - started;
  assert.ok(ms < 1000, `sort took ${ms}ms`);
  assert.equal(t.data.length, 10000, 'the source array is untouched');
});

test('repeated refreshes do not accumulate nodes', () => {
  const { t } = mount(200, { pagination: { perPage: 20, options: [20] } });
  const before = t.el.querySelectorAll('*').length;
  for (let i = 0; i < 25; i++) t.refresh();
  assert.equal(t.el.querySelectorAll('*').length, before);
});

test('repeated refreshes do not accumulate listeners', () => {
  const { t } = mount(50);
  const added = [];
  const real = t.el.addEventListener.bind(t.el);
  t.el.addEventListener = (type, fn, opts) => { added.push(type); real(type, fn, opts); };
  for (let i = 0; i < 10; i++) t.refresh();
  assert.deepEqual(added, [], 'listeners are bound once in _build, never per render');
});

test('destroy() removes the document and window listeners it added', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const doc = env.window.document;
  const win = env.window;
  // jsdom's own selector engine also listens on the document (mouseover /
  // mouseout), so only the types the library uses are counted here.
  const MINE = { click: 0, resize: 0 };
  const seen = { added: { ...MINE }, removed: { ...MINE } };
  const realAdd = doc.addEventListener.bind(doc);
  const realRemove = doc.removeEventListener.bind(doc);
  const realWinAdd = win.addEventListener.bind(win);
  const realWinRemove = win.removeEventListener.bind(win);
  doc.addEventListener = (type, ...a) => { if (type in MINE) seen.added[type]++; realAdd(type, ...a); };
  doc.removeEventListener = (type, ...a) => { if (type in MINE) seen.removed[type]++; realRemove(type, ...a); };
  win.addEventListener = (type, ...a) => { if (type in MINE) seen.added[type]++; realWinAdd(type, ...a); };
  win.removeEventListener = (type, ...a) => { if (type in MINE) seen.removed[type]++; realWinRemove(type, ...a); };

  const t = new Vantable('#host', { columns: COLUMNS, data: rows(5), responsive: true, columnPicker: true });
  assert.deepEqual(seen.added, { click: 1, resize: 1 }, 'one document click, one window resize');
  t.destroy();
  assert.deepEqual(seen.removed, seen.added, 'and both are taken back');
});

test('many instances on one page stay independent and cheap', () => {
  const html = '<!doctype html><html><body>' + Array.from({ length: 10 }, (_, i) => `<div id="h${i}"></div>`).join('') + '</body></html>';
  const env = setupDom(html);
  const Vantable = loadVantable();
  const tables = Array.from({ length: 10 }, (_, i) => new Vantable('#h' + i, {
    columns: COLUMNS.map((c) => ({ ...c })), data: rows(100), pagination: { perPage: 10, options: [10] }
  }));
  assert.equal(env.window.document.querySelectorAll('.vt-root').length, 10);
  assert.equal(env.window.document.querySelectorAll('#vantable-default-styles').length, 1, 'one stylesheet for all');
  tables[0].setData(rows(5));
  assert.equal(tables[1].state.total, 100, 'the others are untouched');
  tables.forEach((t) => t.destroy());
});

test('the stylesheet is injected once even after many creations', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  for (let i = 0; i < 20; i++) new Vantable('#host', { columns: COLUMNS, data: rows(2) }).destroy();
  assert.equal(env.window.document.querySelectorAll('style#vantable-default-styles').length, 1);
});

test('selecting 10 000 rows does not slow to a crawl', () => {
  const { t } = mount(10000, { selection: true, pagination: false });
  const started = Date.now();
  t.selectAll();
  const ms = Date.now() - started;
  assert.equal(t.selectedCount(), 10000);
  assert.ok(ms < 3000, `select-all took ${ms}ms`);
});

test('an export of 10 000 rows builds one payload, not one per row', () => {
  const { t } = mount(10000, { pagination: { perPage: 10, options: [10] } });
  const started = Date.now();
  const payload = t._buildPayload('xlsx');
  const ms = Date.now() - started;
  assert.equal(payload.rows.length, 10000, 'the whole dataset, not the page');
  assert.ok(ms < 1000, `payload took ${ms}ms`);
});

test('the filter pipeline runs once per refresh, not once per column', () => {
  let reads = 0;
  const data = rows(500).map((r) => ({
    ...r,
    get name() { reads++; return 'row' + r.id; }
  }));
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name', filter: true }],
    data,
    pagination: { perPage: 10, options: [10] }
  });
  reads = 0;
  t.setFilter('name', 'row1');
  // 500 rows × (1 filter read + at most a few renders of the page) — the guard
  // is against a per-column or per-render re-scan of the whole dataset.
  assert.ok(reads < 500 * 4, `${reads} property reads for 500 rows`);
  assert.ok(env.dom);
});
