// Integration tests: the features are built on the same render path, so this
// file drives them in combination — the cases a single-feature test cannot see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const STATUS = { 1: { label: 'On', color: '#0a0' }, 2: { label: 'Off', color: '#a00' } };
/** `n` rows with everything the columns below need. */
const rows = (n) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, name: 'user' + (i + 1), email: `u${i + 1}@x.io`,
  country: ['DE', 'US', 'RU'][i % 3], status: (i % 3 === 0) ? 2 : 1, note: 'note ' + (i + 1)
}));
/** The full-featured column set used across this file. */
const COLUMNS = () => [
  { key: 'id', label: 'ID', type: 'number', width: '70px', filter: 'number', pin: 'left' },
  { key: 'name', label: 'Name', editable: true, filter: true },
  { key: 'email', label: 'Email', type: 'copy' },
  { key: 'country', label: 'Country', filter: { type: 'select', options: ['DE', 'US', 'RU'] } },
  { key: 'status', label: 'Status', type: 'status', map: STATUS, filter: 'select' },
  { label: 'Actions', type: 'actions', pin: 'right', edit: { enabled: true }, remove: { enabled: true }, custom: [{ label: 'Ping' }] }
];

/** Mount the kitchen-sink table. */
function mount(options, n) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS(),
    data: rows(n == null ? 30 : n),
    editable: true,
    search: 'live',
    sort: 'client',
    selection: true,
    columnPicker: true,
    resize: true,
    reorder: true,
    stickyHeader: true,
    maxHeight: 400,
    export: { formats: ['csv'], filename: 'all' },
    pagination: { perPage: 10, options: [10, 25] }
  }, options || {}));
  return { env, Vantable, t };
}
/** Header labels in render order (the lead cells have none). */
const heads = (t) => [...t.el.querySelectorAll('thead tr:first-child th')].map((h) => h.textContent.trim());
/** Rendered ids. */
const ids = (t) => [...t.el.querySelectorAll('tbody tr.vt-tr')].map((tr) => Number(tr.getAttribute('data-id')));

test('every feature can be switched on at once and the table still renders', () => {
  const { t } = mount();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 10);
  assert.ok(t.el.querySelector('.vt-select-all'), 'selection');
  assert.ok(t.el.querySelector('.vt-filter-row'), 'filters');
  assert.ok(t.el.querySelector('.vt-cols-btn'), 'column menu');
  assert.ok(t.el.querySelector('.vt-resizer'), 'resize');
  assert.ok(t.el.querySelector('.vt-act-trigger'), 'action dropdown');
  assert.ok(t.el.classList.contains('vt-sticky-head'), 'sticky header');
});

test('the lead cells, the pins and the filter row all line up', () => {
  const { t } = mount();
  const head = [...t.el.querySelectorAll('thead tr:first-child th')];
  const filter = [...t.el.querySelectorAll('.vt-filter-row th')];
  const body = [...t.el.querySelectorAll('tbody tr.vt-tr:first-child td')];
  assert.equal(head.length, filter.length);
  assert.equal(head.length, body.length);
  assert.ok(head[0].classList.contains('vt-th-select'), 'the checkbox column leads');
  assert.ok(head[1].classList.contains('vt-pin-left'), 'then the pinned ID');
  assert.ok(head.at(-1).classList.contains('vt-pin-right'), 'and the actions are pinned right');
});

test('a filter narrows the page, the pager follows and the export matches', async () => {
  const { t, env } = mount();
  t.setFilter('country', 'DE');
  assert.equal(t.state.total, 10, 'a third of thirty');
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /1 of 1/);
  assert.deepEqual(ids(t), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]);
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await new Promise((r) => setTimeout(r, 0));
  const csv = (await blobBytes(env.blobs.at(-1))).toString('utf8').slice(1);
  assert.equal(csv.split('\r\n').length, 11, 'header + the ten filtered rows');
});

test('a filter plus the search plus a sort compose', () => {
  const { t } = mount();
  t.setFilter('country', 'DE');
  t.state.q = 'user1';
  t.state.sort = 'id';
  t.state.dir = 'desc';
  t.refresh();
  assert.deepEqual(ids(t), [19, 16, 13, 10, 1], 'DE ∩ "user1" ∩ descending');
});

test('the selection survives filtering, paging and sorting', () => {
  const { t } = mount();
  t.selectRow(2, true);
  t.setFilter('country', 'DE');
  assert.equal(t.selectedCount(), 1, 'row 2 is filtered out but stays selected');
  t.clearFilters();
  t.el.querySelector('thead th[data-sort="name"]').click();
  t.el.querySelector('.vt-next').click();
  assert.deepEqual(t.selectedIds(), ['2']);
  t.clearSelection();
  assert.equal(t.el.querySelector('.vt-bulk').hasAttribute('hidden'), true);
});

test('select-all after a filter covers only what is on the page', () => {
  const { t } = mount();
  t.setFilter('country', 'US');
  t.selectAll();
  assert.equal(t.selectedCount(), 10, 'the filtered page, not the whole dataset');
  assert.ok(t.selectedIds().every((id) => Number(id) % 3 === 2));
});

test('hiding a column removes it from the head, the rows, the filters and the export', () => {
  const { t } = mount();
  t.hideColumn('country');
  assert.equal(heads(t).includes('Country'), false);
  assert.equal(t.el.querySelector('.vt-filter-select[data-filter="country"]'), null);
  assert.equal(t._buildPayload('csv').columns.find((c) => c.key === 'country'), undefined);
  t.showColumn('country');
  assert.ok(heads(t).includes('Country'));
});

test('a hidden column keeps filtering if a filter was already set', () => {
  const { t } = mount();
  t.setFilter('country', 'RU');
  t.hideColumn('country');
  assert.equal(t.state.total, 10, 'the filter still applies');
  assert.equal(t.getFilter('country'), 'RU');
});

test('the column layout round-trips with filters and a selection in place', () => {
  const { t } = mount();
  t.selectRow(1, true);
  t.setFilter('name', 'user1');
  t.moveColumn('email', 0);
  t.setColumnWidth('name', 200);
  const layout = t.columnState();
  t.setColumnState(layout);
  assert.deepEqual(t.columnState(), layout, 'stable');
  assert.deepEqual(t.selectedIds(), ['1'], 'the selection is untouched');
  assert.equal(t.getFilter('name'), 'user1', 'and so is the filter');
});

test('inline editing works on a filtered, sorted, selected page', () => {
  const saves = [];
  const { t } = mount({ onSave: (id, changes) => saves.push([id, changes]) });
  t.setFilter('country', 'DE');
  t.state.sort = 'name';
  t.refresh();
  t.selectRow(1, true);
  const row = t.el.querySelector('tbody tr.vt-tr[data-id="1"]');
  row.querySelector('.vt-act-trigger').click();
  row.querySelector('.vt-act-item[data-act="edit"]').click();
  const input = t.el.querySelector('tr[data-id="1"] input[data-edit="name"]');
  input.value = 'renamed';
  t.el.querySelector('tr[data-id="1"] [data-act="save"]').click();
  assert.deepEqual(saves, [['1', { name: 'renamed' }]]);
  assert.equal(t.data[0].name, 'renamed');
  assert.deepEqual(t.selectedIds(), ['1'], 'still selected after the save');
});

test('a row action reaches the right row after sorting and paging', () => {
  const pinged = [];
  const { t } = mount({
    columns: COLUMNS().map((c) => (c.type === 'actions'
      ? { ...c, custom: [{ label: 'Ping', onClick: (r) => pinged.push(r.id) }] } : c))
  });
  t.state.sort = 'id';
  t.state.dir = 'desc';
  t.refresh();
  t.el.querySelector('.vt-next').click();
  const first = t.el.querySelector('tbody tr.vt-tr');
  const id = Number(first.getAttribute('data-id'));
  first.querySelector('.vt-act-trigger').click();
  first.querySelector('.vt-act-item[data-act="custom"]').click();
  assert.deepEqual(pinged, [id]);
});

test('virtualization, filters and selection work together', () => {
  const { t, env } = mount({ pagination: false, virtual: { rowHeight: 20, overscan: 2 }, stickyHeader: false, maxHeight: 200 }, 500);
  const sc = t.el.querySelector('.vt-scroll');
  let top = 0;
  Object.defineProperty(sc, 'clientHeight', { get: () => 200, configurable: true });
  Object.defineProperty(sc, 'scrollTop', { get: () => top, set: (v) => { top = v; }, configurable: true });
  t.refresh();
  assert.ok(t.el.querySelectorAll('tbody tr.vt-tr').length <= 16);
  t.setFilter('country', 'DE');
  assert.equal(t.state.total, 167);
  t.selectAll();
  assert.equal(t.selectedCount(), 167, 'the whole filtered view, not the window');
  top = 600;
  sc.dispatchEvent(new env.window.Event('scroll'));
  assert.ok(t.el.querySelectorAll('.vt-select-row:checked').length > 0, 'the new window renders ticked');
});

test('the responsive card mode keeps filters, selection and the dropdown usable', async () => {
  const { t, env } = mount({ responsive: { breakpoint: 640 } });
  Object.defineProperty(t.el, 'clientWidth', { get: () => 420, configurable: true });
  env.window.dispatchEvent(new env.window.Event('resize'));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.isStacked(), true);
  t.setFilter('country', 'US');
  assert.equal(t.state.total, 10);
  t.selectAll();
  assert.equal(t.selectedCount(), 10);
  const first = t.el.querySelector('tbody tr.vt-tr');
  first.querySelector('.vt-act-trigger').click();
  assert.equal(first.querySelector('.vt-act-menu').hasAttribute('hidden'), false);
  assert.equal(first.querySelector('td').getAttribute('data-label'), null, 'the checkbox cell has no label');
});

test('a server source drives filters, sorting, paging and the loading state together', async () => {
  const calls = [];
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS(),
    selection: true,
    pagination: { perPage: 10, options: [10] },
    server: {
      fetch: (req) => { calls.push({ ...req }); return Promise.resolve({ rows: rows(10), total: 95 }); }
    }
  });
  assert.equal(t.state.loading, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.state.loading, false);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 10);
  t.setFilter('country', 'DE');
  t.el.querySelector('thead th[data-sort="name"]').click();
  await new Promise((r) => setTimeout(r, 0));
  const last = calls.at(-1);
  assert.deepEqual(last.filters, { country: 'DE' });
  assert.equal(last.sort, 'name');
  assert.equal(last.page, 1);
  assert.ok(env.dom);
});

test('a failed load keeps the toolbar, the filters and the selection intact', async () => {
  let fail = true;
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS(),
    selection: true,
    export: { formats: ['csv'] },
    server: { fetch: () => (fail ? Promise.reject(new Error('503')) : Promise.resolve({ rows: rows(5), total: 5 })) }
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(t.el.querySelector('tr.vt-error'), 'the error row');
  assert.ok(t.el.querySelector('input.vt-search'), 'the search box survives');
  assert.ok(t.el.querySelector('.vt-filter-row'), 'and the filter row');
  fail = false;
  t.el.querySelector('.vt-retry').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 5);
  assert.ok(env.dom);
});

test('the keyboard grid still works with every lead cell and the filter row', () => {
  const { t, env } = mount();
  const firstTh = t.el.querySelector('thead tr:first-child th');
  firstTh.focus();
  const press = (key) => env.window.document.activeElement
    .dispatchEvent(new env.window.KeyboardEvent('keydown', { key, bubbles: true }));
  press('ArrowDown');
  assert.equal(env.window.document.activeElement.tagName, 'TD');
  assert.ok(env.window.document.activeElement.classList.contains('vt-td-select'), 'the checkbox cell is cell 1');
  press('ArrowRight');
  assert.equal(env.window.document.activeElement.textContent.trim(), '1', 'then the pinned ID');
  assert.equal(t._navRows().length, 11, 'the filter row is not part of the grid');
});

test('the column menu, the action menu and the filter inputs do not fight', () => {
  const { t } = mount();
  t.el.querySelector('.vt-cols-btn').click();
  assert.equal(t.el.querySelector('.vt-cols-menu').hasAttribute('hidden'), false);
  const row = t.el.querySelector('tbody tr.vt-tr');
  row.querySelector('.vt-act-trigger').click();
  assert.equal(row.querySelector('.vt-act-menu').hasAttribute('hidden'), false, 'the row menu opened');
  t.el.querySelector('.vt-filter-text[data-filter="name"]').focus();
  t.el.querySelector('.vt-filter-text[data-filter="name"]').click();
  assert.ok(row.querySelector('.vt-act-menu').hasAttribute('hidden'), 'and closed when focus moved on');
});

test('resizing a pinned column re-stacks the lead cells behind it', () => {
  const { t } = mount();
  const th = t.el.querySelector('thead th[data-key="id"]');
  const handle = th.querySelector('.vt-resizer');
  const mouse = (el, type, x) => {
    const win = el.ownerDocument ? el.ownerDocument.defaultView : el.defaultView;
    el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, clientX: x }));
  };
  mouse(handle, 'mousedown', 0);
  mouse(t.el.ownerDocument, 'mousemove', 30);
  mouse(t.el.ownerDocument, 'mouseup', 30);
  assert.equal(t._colById('id').width, '100px');
  assert.equal(th.style.left, '36px', 'still offset by the checkbox cell');
});

test('reordering columns moves the filter controls with them', () => {
  const { t } = mount();
  // A number filter renders two inputs under one key, so keep them unique.
  const filterKeys = () => [...new Set([...t.el.querySelectorAll('.vt-filter-row [data-filter]')]
    .map((i) => i.getAttribute('data-filter')))];
  assert.deepEqual(filterKeys().slice(0, 2), ['id', 'name']);
  t.moveColumn('country', 1);
  assert.deepEqual(filterKeys().slice(0, 2), ['id', 'country']);
});

test('print strips every control the features added', () => {
  const { t, env } = mount();
  t.selectAll();
  let html = '';
  env.window.open = () => ({ document: { write: (s) => { html = s; }, close() {} }, focus() {}, print() {}, close() {} });
  t.print();
  const box = env.window.document.createElement('div');
  box.innerHTML = html;
  assert.equal(box.querySelectorAll('.vt-td-select, .vt-th-select, .vt-actions, button').length, 0);
  assert.match(box.textContent, /user1/);
});

test('destroy() tears down a fully-featured table cleanly', async () => {
  const { t, env } = mount({ responsive: true });
  t.selectAll();
  t.setFilter('name', 'user1');
  t.el.querySelector('.vt-cols-btn').click();
  t.destroy();
  assert.equal(t.el.innerHTML, '');
  env.window.document.body.click();
  env.window.dispatchEvent(new env.window.Event('resize'));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.el.innerHTML, '', 'nothing re-rendered into a destroyed table');
});

test('two fully-featured tables on one page stay independent', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const base = { columns: COLUMNS(), data: rows(20), selection: true, search: 'live', pagination: { perPage: 5, options: [5] } };
  const a = new Vantable('#a', { ...base, columns: COLUMNS() });
  const b = new Vantable('#b', { ...base, columns: COLUMNS() });
  a.setFilter('country', 'DE');
  a.selectAll();
  assert.equal(b.state.total, 20, 'b is unfiltered');
  assert.equal(b.selectedCount(), 0);
  b.hideColumn('email');
  assert.ok(heads(a).includes('Email'), 'a keeps its column');
  assert.ok(env.dom);
});

test('the empty state appears through every narrowing path', () => {
  const { t } = mount();
  t.setFilter('name', 'nothing-matches');
  assert.ok(t.el.querySelector('tr.vt-empty'), 'after a filter');
  t.clearFilters();
  t.state.q = 'nothing-matches';
  t.refresh();
  assert.ok(t.el.querySelector('tr.vt-empty'), 'after a search');
  t.state.q = '';
  t.setData([]);
  assert.ok(t.el.querySelector('tr.vt-empty'), 'after setData([])');
  assert.equal(t.el.querySelector('tr.vt-empty td').getAttribute('colspan'), '7',
    'six columns plus the checkbox cell');
});

test('an accordion coexists with selection, filters and the action dropdown', () => {
  const { t } = mount({ accordion: { columns: ['note'] } });
  const row = t.el.querySelector('tbody tr.vt-tr');
  assert.ok(row.children[0].classList.contains('vt-td-select'));
  assert.ok(row.children[1].classList.contains('vt-td-expander'));
  t.el.querySelector('.vt-expander').click();
  assert.ok(t.el.querySelector('tr.vt-detail'));
  t.setFilter('country', 'DE');
  assert.equal(t.el.querySelectorAll('tr.vt-detail').length, 1, 'row 1 is DE, so its detail stays open');
  t.selectAll();
  assert.equal(t.el.querySelectorAll('tr.vt-detail').length, 1, 'and a selection does not close it');
});

test('the async states, filters and selection survive a reload', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  let page = rows(10);
  const t = new Vantable('#host', {
    columns: COLUMNS(), selection: true, pagination: { perPage: 10, options: [10] },
    server: { fetch: () => Promise.resolve({ rows: page, total: 10 }) }
  });
  await new Promise((r) => setTimeout(r, 0));
  t.selectRow(3, true);
  t.setFilter('country', 'DE');
  await new Promise((r) => setTimeout(r, 0));
  page = rows(10).slice(0, 4);
  t.refresh();
  assert.equal(t.state.loading, true, 'the overlay is up again');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 4);
  assert.deepEqual(t.selectedIds(), ['3'], 'the selection survived the reload');
  assert.equal(t.getFilter('country'), 'DE');
  assert.ok(env.dom);
});

test('ARIA stays consistent while features are toggled at runtime', () => {
  const { t } = mount();
  const table = t.el.querySelector('.vt-table');
  const colcount = () => Number(table.getAttribute('aria-colcount'));
  assert.equal(colcount(), 7, '6 columns + the checkbox');
  t.hideColumn('email');
  assert.equal(colcount(), 6);
  t.clearSelection();
  const indexes = () => [...t.el.querySelectorAll('tbody tr.vt-tr:first-child td')].map((c) => c.getAttribute('aria-colindex'));
  assert.deepEqual(indexes(), ['1', '2', '3', '4', '5', '6']);
  t.showColumn('email');
  assert.equal(colcount(), 7);
});

test('a table with no features behaves exactly as before any of them existed', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', { columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }], data: rows(3) });
  assert.equal(t.el.querySelectorAll('thead th').length, 2, 'no lead cells');
  assert.equal(t.el.querySelector('.vt-filter-row'), null);
  assert.equal(t.el.querySelector('.vt-bulk').hasAttribute('hidden'), true);
  assert.equal(t.el.querySelector('.vt-overlay').hasAttribute('hidden'), true);
  assert.equal(t.el.querySelectorAll('.vt-resizer').length, 0);
  assert.equal(t.el.classList.contains('vt-responsive'), false);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 3);
  assert.ok(env.dom);
});
