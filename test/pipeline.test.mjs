// Data-pipeline tests: search keys, filtering, sorting, paging, mode resolution
// and column normalisation — the parts that decide WHICH rows are shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROWS = [
  { id: 3, name: 'Carl', email: 'carl@x.io', meta: { city: 'Berlin' }, score: '10' },
  { id: 1, name: 'ann', email: 'ANN@x.io', meta: { city: 'Amsterdam' }, score: '9' },
  { id: 2, name: 'Bob', email: null, meta: { city: 'Chicago' }, score: '100' }
];
const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'meta.city', label: 'City' },
  { label: 'Act', type: 'actions' }
];

/** Mount with the shared fixture. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: ROWS.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t };
}

/** Names currently rendered, in order. */
function names(t) {
  return [...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(2)')].map((td) => td.textContent.trim());
}

test('search keys default to all data columns, skipping actions', () => {
  const { t } = mount();
  assert.deepEqual(t._searchKeys(), ['id', 'name', 'email', 'meta.city']);
});

test('searchable:false removes a column from the search', () => {
  const { t } = mount({ columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'N', searchable: false }] });
  assert.deepEqual(t._searchKeys(), ['id']);
});

test('searchFields overrides the derived key list', () => {
  const { t } = mount({ searchFields: ['email'] });
  assert.deepEqual(t._searchKeys(), ['email']);
  t.state.q = 'carl@';
  assert.deepEqual(t._filter(t.data).map((r) => r.id), [3]);
  t.state.q = 'Bob';   // present in `name`, absent from `email` (which is null there)
  assert.deepEqual(t._filter(t.data).map((r) => r.id), [], 'the name field is not searched');
});

test('filtering is case-insensitive, substring based and skips nulls', () => {
  const { t } = mount();
  t.state.q = 'ANN';
  assert.deepEqual(t._filter(t.data).map((r) => r.id), [1], 'matches both cases of name/email');
  t.state.q = '  x.io  ';
  assert.deepEqual(t._filter(t.data).map((r) => r.id), [3, 1], 'query is trimmed; the null email is skipped');
  t.state.q = '';
  assert.equal(t._filter(t.data).length, 3, 'an empty query filters nothing');
});

test('filtering reaches nested keys', () => {
  const { t } = mount();
  t.state.q = 'amsterdam';
  assert.deepEqual(t._filter(t.data).map((r) => r.id), [1]);
});

test('sorting is numeric when both values are numeric, text otherwise', () => {
  const { t } = mount();
  t.state.sort = 'score';
  assert.deepEqual(t._sort(t.data).map((r) => r.score), ['9', '10', '100'], 'numeric strings sort by value');
  t.state.dir = 'desc';
  assert.deepEqual(t._sort(t.data).map((r) => r.score), ['100', '10', '9']);
  t.state.sort = 'name';
  t.state.dir = 'asc';
  assert.deepEqual(t._sort(t.data).map((r) => r.name), ['ann', 'Bob', 'Carl'], 'text sort is locale-aware');
});

test('sorting puts null/undefined values in the text branch without throwing', () => {
  const { t } = mount();
  t.state.sort = 'email';
  const sorted = t._sort(t.data).map((r) => r.email);
  assert.equal(sorted.length, 3);
  assert.equal(sorted[0], null, 'the empty value sorts first ascending');
});

test('sorting does not mutate the source array', () => {
  const { t } = mount();
  const before = t.data.map((r) => r.id);
  t.state.sort = 'name';
  t._sort(t.data);
  assert.deepEqual(t.data.map((r) => r.id), before);
});

test('no sort key leaves the order untouched', () => {
  const { t } = mount();
  t.state.sort = null;
  assert.deepEqual(t._sort(t.data).map((r) => r.id), [3, 1, 2]);
});

test('paging slices the view and keeps the page in range', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2] } });
  assert.deepEqual(names(t), ['Carl', 'ann']);
  assert.equal(t.state.total, 3);
  t.state.page = 99;
  t.refresh();
  assert.equal(t.state.page, 2, 'an out-of-range page is clamped to the last one');
  assert.deepEqual(names(t), ['Bob']);
});

test('pagination:false renders every row and no footer', () => {
  const { t } = mount({ pagination: false });
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 3);
  assert.equal(t.el.querySelector('.vt-footer').innerHTML, '');
  assert.equal(t.pagination, null);
});

test('pagination defaults are 50 rows and the 50/100/250/500 choices', () => {
  const { t } = mount();
  assert.deepEqual(t.pagination, { perPage: 50, options: [50, 100, 250, 500] });
  assert.deepEqual([...t.el.querySelectorAll('.vt-perpage-sel option')].map((o) => o.value), ['50', '100', '250', '500']);
});

test('the rows-per-page select re-pages the table', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [1, 2] } });
  const sel = t.el.querySelector('.vt-perpage-sel');
  sel.value = '1';
  sel.dispatchEvent(new (t.el.ownerDocument.defaultView.Event)('change', { bubbles: true }));
  assert.equal(t.state.perPage, 1);
  assert.equal(t.state.page, 1);
  assert.deepEqual(names(t), ['Carl']);
});

test('search and sort modes default to client without a server source', () => {
  const { t } = mount();
  assert.equal(t.searchMode, 'client');
  assert.equal(t.sortMode, 'client');
});

test('every documented mode alias resolves', () => {
  const alias = {
    live: 'client', client: 'client', local: 'client',
    server: 'server', db: 'server', remote: 'server',
    off: 'off', none: 'off'
  };
  for (const [given, want] of Object.entries(alias)) {
    const { t } = mount({ search: given, sort: given });
    assert.equal(t.searchMode, want, `search: '${given}'`);
    assert.equal(t.sortMode, want, `sort: '${given}'`);
  }
  assert.equal(mount({ search: false }).t.searchMode, 'off');
  assert.equal(mount({ sort: false }).t.sortMode, 'off');
  assert.equal(mount({ search: true }).t.searchMode, 'client', 'true follows the source');
});

test('search:false hides the search box and sort:off disables the handles', () => {
  const { t } = mount({ search: false, sort: false });
  assert.equal(t.el.querySelector('input.vt-search'), null);
  assert.equal(t.el.querySelectorAll('thead th.vt-sortable').length, 0);
  assert.deepEqual(names(t), ['Carl', 'ann', 'Bob'], 'rows are shown unfiltered and unsorted');
});

test('search and sort modes are independent', () => {
  const { t } = mount({ search: 'live', sort: 'off' });
  assert.equal(t.searchMode, 'client');
  assert.equal(t.sortMode, 'off');
  assert.ok(t.el.querySelector('input.vt-search'));
  assert.equal(t.el.querySelectorAll('thead th.vt-sortable').length, 0);
});

test('column definitions normalise from strings, tuples and objects', () => {
  const { t } = mount({ columns: ['name', ['email', 'E-mail'], { key: 'id' }, { label: 'Act', type: 'actions' }] });
  assert.deepEqual(t.columns.map((c) => [c.key, c.label, c.type, c.sortable]), [
    ['name', 'name', 'text', true],
    ['email', 'E-mail', 'text', true],
    ['id', 'id', 'text', true],
    [undefined, 'Act', 'actions', false]
  ]);
});

test('setData replaces the dataset and resets the page', () => {
  const { t } = mount({ pagination: { perPage: 1, options: [1] } });
  t.state.page = 3;
  const returned = t.setData([{ id: 7, name: 'New' }]);
  assert.equal(returned, t, 'setData is chainable');
  assert.deepEqual(names(t), ['New']);
  assert.equal(t.state.page, 1);
  assert.equal(t.state.total, 1);
  t.setData();
  assert.equal(t.data.length, 0);
});

test('setData copies the array it is given', () => {
  const { t } = mount();
  const rows = [{ id: 1, name: 'a' }];
  t.setData(rows);
  rows.push({ id: 2, name: 'b' });
  assert.equal(t.data.length, 1);
});

test('an empty result renders the empty-text row spanning all columns', () => {
  const { t } = mount({ data: [], emptyText: 'Ничего нет' });
  const td = t.el.querySelector('tbody tr.vt-empty td');
  assert.equal(td.textContent, 'Ничего нет');
  assert.equal(td.getAttribute('colspan'), String(COLUMNS.length));
});

test('the render event reports the rows actually painted', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2] } });
  const seen = [];
  t.on('render', (e) => seen.push(e.rows.length));
  t.refresh();
  assert.deepEqual(seen, [2]);
});

test('refresh() is chainable and re-applies the pipeline', () => {
  const { t } = mount();
  t.state.q = 'bob';
  assert.equal(t.refresh(), t);
  assert.deepEqual(names(t), ['Bob']);
});
