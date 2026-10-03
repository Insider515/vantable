// Per-column filter tests: the controls that are rendered, client-side
// filtering, the server contract, the API and how filters sit with the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const STATUS = { 1: { label: 'Enabled', color: '#0a0' }, 2: { label: 'Disabled', color: '#a00' } };
const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number', filter: 'number' },
  { key: 'name', label: 'Name', filter: true },
  { key: 'status', label: 'Status', type: 'status', map: STATUS, filter: 'select' },
  { key: 'note', label: 'Note' }
];
const DATA = [
  { id: 1, name: 'Ann', status: 1, note: 'first' },
  { id: 5, name: 'Bob', status: 2, note: 'second' },
  { id: 9, name: 'Carl', status: 1, note: 'third' }
];

/** Mount with the shared fixture. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    data: DATA.map((r) => ({ ...r }))
  }, options || {}));
  return { env, Vantable, t };
}

/** Names currently rendered. */
const names = (t) => [...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(2)')].map((td) => td.textContent.trim());
/** A filter control of a column. */
const ctl = (t, key, cls) => t.el.querySelector(`.vt-filter-row ${cls || '.vt-filter'}[data-filter="${key}"]`);
/** Type into a filter input the way a user would (it is debounced). */
function type(t, key, value, cls) {
  const input = ctl(t, key, cls);
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}
/** Pick a value in a select filter. */
function pick(t, key, value) {
  const sel = ctl(t, key, '.vt-filter-select');
  sel.value = value;
  sel.dispatchEvent(new sel.ownerDocument.defaultView.Event('change', { bubbles: true }));
}
/** Wait out the client-side debounce. */
const settle = () => new Promise((r) => setTimeout(r, 200));

test('the filter row appears only when a column asks for it', () => {
  const { t } = mount();
  assert.ok(t.el.querySelector('.vt-filter-row'), 'the row is there');
  assert.equal(t.el.querySelectorAll('thead tr').length, 2);
  const plain = mount({ columns: [{ key: 'id', label: 'ID' }] }).t;
  assert.equal(plain.el.querySelector('.vt-filter-row'), null);
  assert.equal(plain.filtersOn, false);
  const off = mount({ filters: false }).t;
  assert.equal(off.el.querySelector('.vt-filter-row'), null, 'filters:false wins over the columns');
});

test('each column gets the control its filter asks for', () => {
  const { t } = mount();
  const cells = [...t.el.querySelectorAll('.vt-filter-row > th')];
  assert.equal(cells.length, 4, 'one cell per rendered column');
  assert.ok(cells[0].querySelector('.vt-filter-num'), 'a number range');
  assert.equal(cells[0].querySelectorAll('input[type="number"]').length, 2);
  assert.equal(cells[1].querySelector('input').type, 'search', 'filter:true means text');
  assert.equal(cells[1].querySelector('input').getAttribute('placeholder'), 'Name');
  assert.ok(cells[2].querySelector('select.vt-filter-select'), 'a select');
  assert.equal(cells[3].innerHTML, '', 'a column without a filter stays empty');
});

test('a select filter takes its options from the column map', () => {
  const { t } = mount();
  const sel = ctl(t, 'status', '.vt-filter-select');
  assert.deepEqual([...sel.options].map((o) => [o.value, o.textContent]), [
    ['', 'All'], ['1', 'Enabled'], ['2', 'Disabled']
  ]);
});

test('select options can be given explicitly or come from a select column', () => {
  const given = mount({
    columns: [{ key: 'name', label: 'Name', filter: { type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b' }] } }]
  }).t;
  assert.deepEqual([...ctl(given, 'name', '.vt-filter-select').options].map((o) => o.value), ['', 'a', 'b']);
  const fromCol = mount({
    columns: [{ key: 'tier', label: 'Tier', type: 'select', options: ['x', 'y'], filter: true }],
    data: [{ tier: 'x' }]
  }).t;
  assert.deepEqual([...ctl(fromCol, 'tier', '.vt-filter-select').options].map((o) => o.value), ['', 'x', 'y'],
    'a select column filters as a select by default');
});

test('a text filter narrows the rows, case-insensitively', async () => {
  const { t } = mount();
  type(t, 'name', 'ar');
  await settle();
  assert.deepEqual(names(t), ['Carl']);
  type(t, 'name', 'ANN');
  await settle();
  assert.deepEqual(names(t), ['Ann']);
  type(t, 'name', '');
  await settle();
  assert.deepEqual(names(t), ['Ann', 'Bob', 'Carl']);
});

test('the filter input keeps focus while typing', async () => {
  const { t, env } = mount();
  const input = ctl(t, 'name', '.vt-filter-text');
  input.focus();
  type(t, 'name', 'a');
  await settle();
  assert.equal(env.window.document.activeElement, input, 'the row is not re-rendered under the cursor');
});

test('a select filter applies at once', () => {
  const { t } = mount();
  pick(t, 'status', '2');
  assert.deepEqual(names(t), ['Bob']);
  pick(t, 'status', '');
  assert.deepEqual(names(t), ['Ann', 'Bob', 'Carl']);
});

test('a number filter compares as a range', async () => {
  const { t } = mount();
  type(t, 'id', '5', '.vt-filter-min');
  await settle();
  assert.deepEqual(names(t), ['Bob', 'Carl']);
  type(t, 'id', '5', '.vt-filter-max');
  await settle();
  assert.deepEqual(names(t), ['Bob'], 'min and max together');
  assert.deepEqual(t.activeFilters(), { id: { min: '5', max: '5' } });
  type(t, 'id', '', '.vt-filter-min');
  await settle();
  assert.deepEqual(names(t), ['Ann', 'Bob'], 'max alone');
  type(t, 'id', '', '.vt-filter-max');
  await settle();
  assert.deepEqual(t.activeFilters(), {}, 'an empty range is no filter');
});

test('a number filter drops rows whose value is not a number', async () => {
  const { t } = mount({ data: [{ id: 1, name: 'Ann' }, { id: null, name: 'Bob' }, { id: 'x', name: 'Carl' }] });
  type(t, 'id', '0', '.vt-filter-min');
  await settle();
  assert.deepEqual(names(t), ['Ann']);
});

test('filters combine with each other and with the global search', async () => {
  const { t } = mount({ search: 'live' });
  pick(t, 'status', '1');
  assert.deepEqual(names(t), ['Ann', 'Carl']);
  type(t, 'name', 'c');
  await settle();
  assert.deepEqual(names(t), ['Carl'], 'both filters apply');
  t.state.q = 'third';
  t.refresh();
  assert.deepEqual(names(t), ['Carl'], 'and the search on top');
  t.state.q = 'first';
  t.refresh();
  assert.deepEqual(names(t), [], 'the search and the filters are an AND');
});

test('a row that cannot match a filter is dropped, nulls included', () => {
  const { t } = mount({ data: [{ id: 1, name: null, status: 1 }, { id: 2, name: 'Bob', status: 1 }] });
  t.setFilter('name', 'b');
  assert.deepEqual(names(t), ['Bob']);
});

test('filtering returns to the first page', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2] } });
  t.el.querySelector('.vt-next').click();
  assert.equal(t.state.page, 2);
  t.setFilter('name', 'a');
  assert.equal(t.state.page, 1);
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /1 of 1/);
});

test('the API sets, reads and clears filters, and reports every change', () => {
  const { t } = mount();
  const events = [];
  t.on('filterChange', (e) => events.push(e));
  assert.equal(t.setFilter('name', 'bo'), t, 'chainable');
  assert.equal(t.getFilter('name'), 'bo');
  assert.deepEqual(names(t), ['Bob']);
  assert.equal(ctl(t, 'name', '.vt-filter-text').value, 'bo', 'the control shows it');
  t.setFilter('status', '2');
  assert.deepEqual(t.activeFilters(), { name: 'bo', status: '2' });
  assert.deepEqual(t.filters(), { name: 'bo', status: '2' });
  t.setFilter('name', '');
  assert.equal(t.getFilter('name'), undefined, 'an empty value clears it');
  assert.equal(t.clearFilters(), t);
  assert.deepEqual(t.activeFilters(), {});
  assert.deepEqual(names(t), ['Ann', 'Bob', 'Carl']);
  assert.deepEqual(events.map((e) => e.key), ['name', 'status', 'name', null]);
  assert.deepEqual(events.at(-1).filters, {});
});

test('activeFilters skips the empty values that filters() still reports', () => {
  const { t } = mount();
  t.state.filters = { name: '', status: null, id: { min: '', max: '' }, note: 'x' };
  assert.deepEqual(t.activeFilters(), { note: 'x' });
  assert.deepEqual(Object.keys(t.filters()).sort(), ['id', 'name', 'note', 'status']);
});

test('in server mode the active filters go into the request', async () => {
  const calls = [];
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    server: { fetch: (req) => { calls.push({ ...req }); return { rows: DATA, total: 3 }; } }
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.filterMode, 'server', 'a server source filters server-side');
  assert.equal('filters' in calls[0], false, 'nothing active, nothing sent');
  t.setFilter('status', '2');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls.at(-1).filters, { status: '2' });
  t.setFilter('id', { min: '2', max: '8' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls.at(-1).filters, { status: '2', id: { min: '2', max: '8' } });
  assert.deepEqual(names(t), ['Ann', 'Bob', 'Carl'], 'the server decides what comes back');
  t.clearFilters();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal('filters' in calls.at(-1), false);
  assert.ok(env.dom);
});

test('filters:client over a server source filters the fetched page in the browser', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const calls = [];
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    filters: 'client',
    server: { fetch: (req) => { calls.push({ ...req }); return { rows: DATA, total: 3 }; } }
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.filterMode, 'client');
  t.setFilter('status', '1');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal('filters' in calls.at(-1), false, 'the server is not told');
  assert.deepEqual(names(t), ['Ann', 'Carl'], 'the page is narrowed here');
  assert.ok(env.dom);
});

test('a server filter is debounced by 300ms, a client one by 150ms', async () => {
  const calls = [];
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    server: { fetch: (req) => { calls.push({ ...req }); return { rows: DATA, total: 3 }; } }
  });
  await new Promise((r) => setTimeout(r, 0));
  const before = calls.length;
  type(t, 'name', 'a');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls.length, before, 'not sent yet');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(calls.length, before + 1);
  assert.deepEqual(calls.at(-1).filters, { name: 'a' });
  assert.ok(env.dom);
});

test('the filter row follows hidden, reordered and pinned columns', () => {
  const { t } = mount({
    columns: [
      { key: 'id', label: 'ID', filter: true },
      { key: 'name', label: 'Name', filter: true, hidden: true },
      { key: 'status', label: 'Status', filter: true, pin: 'left' }
    ]
  });
  const keys = () => [...t.el.querySelectorAll('.vt-filter-row .vt-filter')].map((i) => i.getAttribute('data-filter'));
  assert.deepEqual(keys(), ['status', 'id'], 'pinned first, hidden dropped');
  const cells = [...t.el.querySelectorAll('.vt-filter-row > th')];
  assert.ok(cells[0].classList.contains('vt-pin-left'), 'the filter cell is pinned too');
  assert.equal(cells[0].style.left, '0px');
  t.moveColumn('id', 0);
  assert.deepEqual(keys(), ['status', 'id'], 'the pin still leads');
  t.pinColumn('status', false);
  assert.deepEqual(keys(), ['id', 'status']);
});

test('the filter row leaves room for the lead cells', () => {
  const { t } = mount({ selection: true, accordion: { columns: ['note'] } });
  const cells = [...t.el.querySelectorAll('.vt-filter-row > th')];
  assert.equal(cells.length, 6, '2 lead cells + 4 columns');
  assert.equal(cells[0].innerHTML, '');
  assert.equal(cells[1].innerHTML, '');
  assert.ok(cells[2].querySelector('.vt-filter-num'), 'the first column lines up');
});

test('the filter row sticks below the header when the header is sticky', () => {
  const { t } = mount({ stickyHeader: true, maxHeight: 300 });
  const rows = [...t.el.querySelectorAll('thead tr')];
  Object.defineProperty(rows[0], 'offsetHeight', { value: 38, configurable: true });
  t.refresh();
  assert.equal(t.el.querySelector('.vt-filter-row > th').style.top, '38px');
});

test('filters do not interfere with sorting or the keyboard grid', () => {
  const { t } = mount({ sort: 'client' });
  t.el.querySelector('thead th[data-sort="name"]').click();
  assert.equal(t.state.sort, 'name');
  assert.deepEqual(names(t), ['Ann', 'Bob', 'Carl']);
  assert.equal(t._navRows().length, 4, 'header + three rows; the filter row is not navigated');
  assert.equal(t.el.querySelector('.vt-filter-row').getAttribute('role'), null,
    'it is a plain header row, not part of the grid navigation');
});

test('an export covers the filtered view', async () => {
  const { t, env } = mount({ export: { formats: ['csv'], filename: 'f' } });
  t.setFilter('status', '2');
  assert.equal(t._buildPayload('xlsx').rows.length, 1);
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await new Promise((r) => setTimeout(r, 0));
  const csv = (await blobBytes(env.blobs.at(-1))).toString('utf8').slice(1);
  assert.equal(csv.split('\r\n').length, 2, 'header + the one matching row');
  assert.match(csv, /Bob/);
});

test('filters and selection coexist: the selection survives a filter', () => {
  const { t } = mount({ selection: true });
  // The checkbox column leads, so the name sits one cell further right here.
  const selNames = () => [...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(3)')].map((td) => td.textContent.trim());
  t.selectRow(5, true);
  t.setFilter('status', '1');
  assert.deepEqual(selNames(), ['Ann', 'Carl'], 'Bob is filtered out');
  assert.deepEqual(t.selectedIds(), ['5'], 'but still selected');
  t.clearFilters();
  assert.ok(t.el.querySelector('tr.vt-tr[data-id="5"]').classList.contains('vt-selected'));
});

test('a filter on a column with no data key is ignored', () => {
  const { t } = mount({ columns: [{ label: 'Calc', type: 'html', render: () => 'x', filter: true }] });
  const input = t.el.querySelector('.vt-filter-row .vt-filter');
  assert.ok(input, 'the control still renders');
  input.value = 'x';
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  assert.equal(Object.keys(t.state.filters).length, 0, 'but there is no key to filter on');
});

test('the filter labels can be translated', () => {
  const { t } = mount({ labels: { filterAll: 'Все', filterMin: 'От', filterMax: 'До' } });
  assert.equal(ctl(t, 'status', '.vt-filter-select').options[0].textContent, 'Все');
  assert.equal(ctl(t, 'id', '.vt-filter-min').getAttribute('placeholder'), 'От');
  assert.equal(ctl(t, 'id', '.vt-filter-max').getAttribute('placeholder'), 'До');
  assert.equal(ctl(t, 'id', '.vt-filter-min').getAttribute('aria-label'), 'ID От');
});

test('a custom placeholder overrides the column label', () => {
  const { t } = mount({ columns: [{ key: 'name', label: 'Name', filter: { placeholder: 'искать имя' } }] });
  assert.equal(ctl(t, 'name', '.vt-filter-text').getAttribute('placeholder'), 'искать имя');
});

test('filters:true just means "on", and the mode follows the source', () => {
  const { t } = mount({ filters: true });
  assert.equal(t.filtersOn, true);
  assert.equal(t.filterMode, 'client', 'client data filters in the browser');
  const env = setupDom();
  const Vantable = loadVantable();
  const server = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    filters: true,
    server: { fetch: () => ({ rows: DATA, total: 3 }) }
  });
  assert.equal(server.filterMode, 'server');
  assert.ok(env.dom);
});
