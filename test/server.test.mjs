// Server-mode tests: what reaches server.fetch in each mode combination, what
// is still done in the browser, totals, paging and failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' }
];
const PAGE = [
  { id: 2, name: 'Bob', email: 'b@x.io' },
  { id: 1, name: 'Ann', email: 'a@x.io' }
];

/**
 * Mount a server-backed table. `reply` builds the response for each request;
 * every request is recorded in the returned `calls` array.
 */
function mount(options, reply) {
  const env = setupDom();
  const Vantable = loadVantable();
  const calls = [];
  const fetchRows = reply || (() => ({ rows: PAGE.map((r) => ({ ...r })), total: 57 }));
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS,
    server: { fetch: (req) => { calls.push({ ...req }); return fetchRows(req); } }
  }, options || {}));
  return { env, Vantable, t, calls };
}

/** Wait for the pending fetch + paint. */
const settle = () => new Promise((r) => setTimeout(r, 0));
/** Names currently rendered. */
const names = (t) => [...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(2)')].map((td) => td.textContent.trim());

test('a server source makes both search and sort server-side by default', async () => {
  const { t, calls } = mount();
  await settle();
  assert.equal(t.searchMode, 'server');
  assert.equal(t.sortMode, 'server');
  assert.deepEqual(calls[0], { page: 1, perPage: 50, q: '', sort: null, dir: 'asc' });
  assert.deepEqual(names(t), ['Bob', 'Ann'], 'rows are shown exactly as returned');
});

test('the request carries searchFields as `fields` in server search mode', async () => {
  const { calls } = mount({ searchFields: ['name', 'email'], defaultSort: 'name', defaultDir: 'desc' });
  await settle();
  assert.deepEqual(calls[0], { page: 1, perPage: 50, q: '', fields: ['name', 'email'], sort: 'name', dir: 'desc' });
});

test('client-mode features are left out of the request and applied in-browser', async () => {
  const { t, calls } = mount({ search: 'live', sort: 'client', defaultSort: 'name' });
  await settle();
  assert.deepEqual(calls[0], { page: 1, perPage: 50 }, 'no q/sort/dir for client-mode features');
  assert.deepEqual(names(t), ['Ann', 'Bob'], 'the returned page is sorted in the browser');
  t.state.q = 'bob';
  t.refresh();
  await settle();
  assert.deepEqual(names(t), ['Bob'], 'and filtered in the browser');
  assert.deepEqual(calls[1], { page: 1, perPage: 50 });
});

test('a mixed setup sends only the server-mode feature', async () => {
  const { calls } = mount({ search: 'server', sort: 'client', defaultSort: 'id' });
  await settle();
  assert.deepEqual(calls[0], { page: 1, perPage: 50, q: '' });
  const other = mount({ search: 'client', sort: 'server', defaultSort: 'id' });
  await settle();
  assert.deepEqual(other.calls[0], { page: 1, perPage: 50, sort: 'id', dir: 'asc' });
});

test('the total comes from the response and drives the footer', async () => {
  const { t } = mount({ pagination: { perPage: 10, options: [10] } });
  await settle();
  assert.equal(t.state.total, 57);
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /1 of 6/);
  assert.equal(t.el.querySelector('.vt-count').textContent, '57');
});

test('without a total the row count of the page is used', async () => {
  const { t } = mount({}, () => ({ rows: PAGE }));
  await settle();
  assert.equal(t.state.total, 2);
});

test('a header click asks the server for the new order', async () => {
  const { t, calls } = mount();
  await settle();
  t.el.querySelector('thead th[data-sort="name"]').click();
  await settle();
  assert.equal(calls.at(-1).sort, 'name');
  assert.equal(calls.at(-1).dir, 'asc');
  t.el.querySelector('thead th[data-sort="name"]').click();
  await settle();
  assert.equal(calls.at(-1).dir, 'desc');
});

test('paging asks the server for the next page', async () => {
  const { t, calls } = mount({ pagination: { perPage: 10, options: [10, 25] } });
  await settle();
  t.el.querySelector('.vt-next').click();
  await settle();
  assert.equal(calls.at(-1).page, 2);
  t.el.querySelector('.vt-prev').click();
  await settle();
  assert.equal(calls.at(-1).page, 1);
  const sel = t.el.querySelector('.vt-perpage-sel');
  sel.value = '25';
  sel.dispatchEvent(new (t.el.ownerDocument.defaultView.Event)('change', { bubbles: true }));
  await settle();
  assert.equal(calls.at(-1).perPage, 25);
  assert.equal(calls.at(-1).page, 1, 'changing the page size returns to page 1');
});

test('prev is disabled on the first page and next on the last', async () => {
  const { t } = mount({ pagination: { perPage: 50, options: [50] } }, () => ({ rows: PAGE, total: 60 }));
  await settle();
  assert.ok(t.el.querySelector('.vt-prev').disabled);
  assert.ok(!t.el.querySelector('.vt-next').disabled);
  t.el.querySelector('.vt-next').click();
  await settle();
  assert.ok(!t.el.querySelector('.vt-prev').disabled);
  assert.ok(t.el.querySelector('.vt-next').disabled);
});

/** Type into the search box without asking for the query to be run. */
function type(t, value) {
  const input = t.el.querySelector('input.vt-search');
  input.value = value;
  input.dispatchEvent(new (t.el.ownerDocument.defaultView.Event)('input', { bubbles: true }));
  return input;
}
/** Press a key in an element, the way a user would. */
function press(t, el, key) {
  el.dispatchEvent(new (t.el.ownerDocument.defaultView.KeyboardEvent)('keydown', { key, bubbles: true }));
}

test('typing in server mode queries nothing — a database is not asked per keystroke', async () => {
  const { t, calls } = mount();
  await settle();
  type(t, 'an');
  type(t, 'ann');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(calls.length, 1, 'still only the initial load');
  assert.equal(t.state.q, '', 'and nothing was applied behind the button');
});

test('the search button sends the typed query', async () => {
  const { t, calls } = mount();
  await settle();
  type(t, 'ann');
  t.el.querySelector('.vt-search-submit').click();
  await settle();
  assert.equal(calls.length, 2, 'exactly one request for the finished query');
  assert.equal(calls[1].q, 'ann');
  assert.equal(calls[1].page, 1, 'and it starts from the first page');
});

test('Enter in the box does what the button does', async () => {
  const { t, calls } = mount();
  await settle();
  press(t, type(t, 'bob'), 'Enter');
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].q, 'bob');
});

test('any other key in the box sends nothing', async () => {
  const { t, calls } = mount();
  await settle();
  const input = type(t, 'bo');
  press(t, input, 'b');
  press(t, input, 'ArrowLeft');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(calls.length, 1);
});

test('Enter outside the search box never queries', async () => {
  const { t, calls } = mount();
  await settle();
  type(t, 'ann');
  press(t, t.el.querySelector('tbody tr.vt-tr td'), 'Enter');
  press(t, t.el.querySelector('.vt-search-submit'), 'Enter');
  await settle();
  assert.equal(calls.length, 1, 'the grid keyboard is not a search trigger');
  assert.equal(t.state.q, '');
});

test('a query asked from a later page starts over at page one', async () => {
  const { t, calls } = mount({ pagination: { perPage: 2, options: [2] } });
  await settle();
  t.el.querySelector('.vt-next').click();
  await settle();
  assert.equal(calls[calls.length - 1].page, 2);
  type(t, 'ann');
  t.el.querySelector('.vt-search-submit').click();
  await settle();
  assert.equal(calls[calls.length - 1].page, 1);
});

test('clearing the box and asking again lifts the query', async () => {
  const { t, calls } = mount();
  await settle();
  type(t, 'ann');
  t.el.querySelector('.vt-search-submit').click();
  await settle();
  type(t, '');
  t.el.querySelector('.vt-search-submit').click();
  await settle();
  assert.equal(calls[calls.length - 1].q, '');
  assert.equal(t.state.q, '');
});

test('the same query asked twice is sent twice — the user asked for it', async () => {
  const { t, calls } = mount();
  await settle();
  type(t, 'ann');
  t.el.querySelector('.vt-search-submit').click();
  await settle();
  t.el.querySelector('.vt-search-submit').click();
  await settle();
  assert.equal(calls.length, 3);
  assert.deepEqual([calls[1].q, calls[2].q], ['ann', 'ann']);
});

test('the button is named for screen readers and translatable', async () => {
  const { t } = mount({ labels: { searchSubmit: 'Шукати' } });
  await settle();
  const go = t.el.querySelector('.vt-search-submit');
  assert.equal(go.getAttribute('aria-label'), 'Шукати');
  assert.equal(go.getAttribute('title'), 'Шукати');
  assert.equal(go.type, 'button', 'it never submits a surrounding form');
});

test('the button belongs to server mode only', async () => {
  const { t } = mount();
  await settle();
  assert.ok(t.el.querySelector('.vt-search-submit'), 'server mode has it');

  const client = mount({ search: 'client' });
  await settle();
  assert.equal(client.t.el.querySelector('.vt-search-submit'), null, 'client mode filters as you type');
  assert.ok(client.t.el.querySelector('input.vt-search'), 'and still has the box');

  const off = mount({ search: false });
  await settle();
  assert.equal(off.t.el.querySelector('.vt-search-submit'), null);
  assert.equal(off.t.el.querySelector('input.vt-search'), null);
});

test('client-mode search over a server page filters as you type, with no q in the request', async () => {
  // A client-mode search still re-renders, and over a server source a re-render
  // is a fetch of the same page — but the query itself stays in the browser and
  // is applied to the reply, which is what separates the two modes.
  const { t, calls } = mount({ search: 'client' });
  await settle();
  type(t, 'ann');
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(names(t), ['Ann'], 'filtered in the browser');
  assert.equal(calls[calls.length - 1].q, undefined, 'the query never reaches the server');
});

test('a rejected fetch emits error, clears the view and shows the error row', async () => {
  const errors = [];
  const { t } = mount({ emptyText: 'none' }, () => Promise.reject(new Error('db down')));
  t.on('error', (e) => errors.push(e));
  t.refresh();
  await settle();
  assert.equal(errors.at(-1).message, 'db down');
  assert.deepEqual(t._view, []);
  assert.equal(t.state.error.message, 'db down');
  // The error state replaces the empty row (see test/states.test.mjs); pass
  // states:{error:false} to get the plain empty row back.
  assert.equal(t.el.querySelector('tbody tr.vt-empty'), null);
  assert.match(t.el.querySelector('tbody tr.vt-error').textContent, /db down/);
  const plain = mount({ emptyText: 'none', states: { error: false } }, () => Promise.reject(new Error('x')));
  plain.t.refresh();
  await settle();
  assert.equal(plain.t.el.querySelector('tbody tr.vt-empty td').textContent, 'none');
});

test('a synchronously throwing fetch propagates instead of becoming an error event', () => {
  // Documents the current behaviour: refresh() wraps the RESULT of server.fetch
  // in Promise.resolve(), so only a REJECTED PROMISE reaches the error event. A
  // synchronous throw escapes through refresh() — and through the constructor,
  // since it calls refresh(). A server.fetch must therefore not throw outright.
  assert.throws(() => mount({}, () => { throw new Error('boom'); }), /boom/);
});

test('an empty or missing response body renders the empty row', async () => {
  const { t } = mount({}, () => undefined);
  await settle();
  assert.equal(t.state.total, 0);
  assert.ok(t.el.querySelector('tbody tr.vt-empty'));
  const noRows = mount({}, () => ({ total: 9 }));
  await settle();
  assert.deepEqual(noRows.t._view, []);
  assert.equal(noRows.t.state.total, 9);
});

test('a synchronous (non-promise) fetch result is accepted', async () => {
  const { t } = mount({}, () => ({ rows: [{ id: 5, name: 'Sync', email: 's@x.io' }], total: 1 }));
  await settle();
  assert.deepEqual(names(t), ['Sync']);
});

test('row lookups and actions use the fetched page, not the client array', async () => {
  const hits = [];
  const { t } = mount({
    onRowClick: (r) => hits.push(r && r.id),
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', custom: [{ label: 'P', onClick: (r) => hits.push(`act:${r.name}`) }] }])
  });
  await settle();
  assert.equal(t.data.length, 0, 'no client-side dataset in server mode');
  t.el.querySelector('tbody tr.vt-tr td').click();
  t.el.querySelector('[data-act="custom"]').click();
  assert.deepEqual(hits, [2, 'act:Bob']);
  assert.equal(t._rowById('1').name, 'Ann');
});

test('CSV export in server mode exports the fetched page', async () => {
  const { t, env } = mount({ export: { formats: ['csv'], filename: 'page' } });
  await settle();
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await settle();
  const text = (await env.blobs.at(-1).arrayBuffer().then((b) => Buffer.from(b).toString('utf8')));
  assert.match(text, /ID,Name,Email/);
  assert.match(text, /2,Bob,b@x\.io/);
  assert.equal(env.clicks.at(-1).download, 'page.csv');
});
