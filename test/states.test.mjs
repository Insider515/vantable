// Async-state tests: the loading overlay, the skeleton rows, the error row with
// Retry, the manual setLoading/setError API and how they combine with the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
const PAGE = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/**
 * Mount a server-backed table whose fetch is driven by the test: each call
 * returns a promise the test resolves or rejects through `deferred`.
 */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const calls = [];
  let pending = null;
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    server: {
      fetch: (req) => {
        calls.push({ ...req });
        return new Promise((resolve, reject) => { pending = { resolve, reject }; });
      }
    }
  }, options || {}));
  return {
    env, Vantable, t, calls,
    /** Resolve the fetch that is in flight. */
    resolve: async (res) => { pending.resolve(res === undefined ? { rows: PAGE, total: 2 } : res); await tick(); },
    /** Reject the fetch that is in flight. */
    reject: async (err) => { pending.reject(err || new Error('db down')); await tick(); },
    /** The promise handles of the fetch in flight. */
    get pending() { return pending; }
  };
}

/** Let the pending promise callbacks run. */
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Mount a client-side table (no server source). */
function mountClient(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS.map((c) => ({ ...c })), data: PAGE.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t };
}

const overlay = (t) => t.el.querySelector('.vt-overlay');
const skelRows = (t) => [...t.el.querySelectorAll('tbody tr.vt-skel-row')];
const errorRow = (t) => t.el.querySelector('tbody tr.vt-error');

test('a fetch in flight shows the overlay and marks the table busy', () => {
  const { t } = mount();
  assert.equal(t.state.loading, true);
  assert.ok(t.el.classList.contains('vt-loading'));
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-busy'), 'true');
  assert.equal(overlay(t).hasAttribute('hidden'), false);
  assert.equal(overlay(t).querySelector('.vt-overlay-text').textContent, 'Loading…');
  assert.equal(overlay(t).getAttribute('role'), 'status');
  assert.equal(overlay(t).getAttribute('aria-live'), 'polite');
});

test('the first load shows skeleton rows instead of the empty row', () => {
  const { t } = mount({ emptyText: 'none' });
  assert.equal(skelRows(t).length, 8, 'the default count');
  assert.equal(t.el.querySelector('tr.vt-empty'), null);
  const cells = [...skelRows(t)[0].children];
  assert.equal(cells.length, 2, 'one cell per visible column');
  assert.ok(cells.every((td) => td.querySelector('.vt-skel')));
  assert.equal(skelRows(t)[0].getAttribute('aria-hidden'), 'true');
  assert.equal(t._navRows().length, 1, 'skeleton rows are not part of the grid');
});

test('a resolved fetch clears the loading state and renders the rows', async () => {
  const { t, resolve } = mount();
  const events = [];
  t.on('loading', (e) => events.push(e.loading));
  await resolve();
  assert.equal(t.state.loading, false);
  assert.equal(t.el.classList.contains('vt-loading'), false);
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-busy'), 'false');
  assert.ok(overlay(t).hasAttribute('hidden'));
  assert.equal(skelRows(t).length, 0);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
  assert.deepEqual(events, [false], 'the state went back down');
});

test('the loading event reports both transitions of a reload', async () => {
  const { t, resolve } = mount();
  await resolve();
  const events = [];
  t.on('loading', (e) => events.push(e.loading));
  t.refresh();
  assert.deepEqual(events, [true]);
  await resolve();
  assert.deepEqual(events, [true, false]);
});

test('a reload keeps the rows on screen under the overlay', async () => {
  const { t, resolve } = mount();
  await resolve();
  t.refresh();
  assert.equal(t.state.loading, true);
  assert.equal(skelRows(t).length, 0, 'no skeleton when there is data to show');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
  assert.equal(overlay(t).hasAttribute('hidden'), false);
  await resolve({ rows: [{ id: 9, name: 'New' }], total: 1 });
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
});

test('a failed fetch shows the error row with the message and Retry', async () => {
  const { t, reject } = mount();
  const errors = [];
  t.on('error', (e) => errors.push(e));
  await reject(new Error('db down'));
  const row = errorRow(t);
  assert.ok(row, 'the error row is rendered');
  assert.equal(row.getAttribute('role'), 'alert');
  assert.equal(row.querySelector('.vt-error-msg').textContent, 'Could not load the data');
  assert.equal(row.querySelector('.vt-error-detail').textContent, 'db down');
  assert.ok(row.querySelector('button.vt-retry'));
  assert.equal(row.querySelector('td').getAttribute('colspan'), '2');
  assert.equal(t.state.loading, false, 'the loading state is released');
  assert.ok(overlay(t).hasAttribute('hidden'));
  assert.equal(errors.length, 1, 'the error event still fires');
  assert.equal(t.state.error.message, 'db down');
});

test('Retry clears the error and fetches again', async () => {
  const { t, reject, resolve, calls } = mount();
  await reject();
  assert.equal(calls.length, 1);
  errorRow(t).querySelector('.vt-retry').click();
  assert.equal(t.state.error, null);
  assert.equal(t.state.loading, true);
  assert.equal(calls.length, 2, 'a new request went out');
  assert.equal(errorRow(t), null);
  await resolve();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
});

test('an error row without a message falls back to the label alone', async () => {
  const { t, reject } = mount();
  await reject({});
  assert.equal(errorRow(t).querySelector('.vt-error-detail'), null);
  assert.equal(errorRow(t).querySelector('.vt-error-msg').textContent, 'Could not load the data');
});

test('a string rejection is shown as the detail', async () => {
  const { t, reject } = mount();
  await reject('boom');
  assert.equal(errorRow(t).querySelector('.vt-error-detail').textContent, 'boom');
});

test('the labels of all three states can be translated', async () => {
  const { t, reject } = mount({ labels: { loading: 'Загрузка…', error: 'Не удалось загрузить', retry: 'Повторить' } });
  assert.equal(overlay(t).querySelector('.vt-overlay-text').textContent, 'Загрузка…');
  await reject(new Error('нет связи'));
  assert.equal(errorRow(t).querySelector('.vt-error-msg').textContent, 'Не удалось загрузить');
  assert.equal(errorRow(t).querySelector('.vt-retry').textContent, 'Повторить');
});

test('states:false turns all three off', async () => {
  const { t, reject } = mount({ emptyText: 'none', states: false });
  assert.equal(t.state.loading, true, 'the state is still tracked');
  assert.ok(overlay(t).hasAttribute('hidden'), 'but nothing is shown');
  assert.equal(skelRows(t).length, 0);
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'none');
  await reject();
  assert.equal(errorRow(t), null);
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'none');
});

test('the pieces can be switched off one at a time', async () => {
  const noSkel = mount({ emptyText: 'none', states: { skeleton: false } });
  assert.equal(skelRows(noSkel.t).length, 0);
  assert.equal(noSkel.t.el.querySelector('tr.vt-empty td').textContent, 'none');
  assert.equal(overlay(noSkel.t).hasAttribute('hidden'), false, 'the overlay still shows');

  const noOverlay = mount({ states: { loading: false } });
  assert.ok(overlay(noOverlay.t).hasAttribute('hidden'));
  assert.equal(skelRows(noOverlay.t).length, 8, 'the skeleton is independent');

  const noRetry = mount({ states: { retry: false } });
  await noRetry.reject();
  assert.ok(errorRow(noRetry.t));
  assert.equal(errorRow(noRetry.t).querySelector('.vt-retry'), null);
});

test('the skeleton row count is configurable', () => {
  assert.equal(skelRows(mount({ states: { skeleton: 3 } }).t).length, 3);
  assert.equal(skelRows(mount({ states: { skeleton: true } }).t).length, 8);
  assert.equal(skelRows(mount({ states: { skeleton: 0 } }).t).length, 0);
});

test('skeleton cells follow the visible columns, their pins and the accordion', () => {
  const { t } = mount({
    states: { skeleton: 2 },
    accordion: { columns: ['name'] },
    columns: [
      { key: 'id', label: 'ID', pin: 'left' },
      { key: 'name', label: 'Name' },
      { key: 'hid', label: 'Hidden', hidden: true }
    ]
  });
  const cells = [...skelRows(t)[0].children];
  assert.equal(cells.length, 3, 'expander + two visible columns');
  assert.ok(cells[0].classList.contains('vt-td-expander'));
  assert.ok(cells[1].classList.contains('vt-pin-left'));
});

test('a stale reply is ignored, and only the latest clears the loading state', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const handles = [];
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    server: { fetch: () => new Promise((resolve, reject) => handles.push({ resolve, reject })) }
  });
  assert.equal(handles.length, 1);
  t.refresh();                                  // supersedes the first request
  assert.equal(handles.length, 2);

  handles[0].resolve({ rows: [{ id: 99, name: 'Stale' }], total: 1 });
  await tick();
  assert.equal(t.state.loading, true, 'the stale reply did not release the state');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 0, 'and wrote no rows');

  handles[1].resolve({ rows: PAGE, total: 2 });
  await tick();
  assert.equal(t.state.loading, false);
  assert.deepEqual([...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(2)')].map((td) => td.textContent), ['Ann', 'Bob']);
  assert.ok(env.dom);
});

test('a stale rejection cannot overwrite a newer load', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const handles = [];
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    server: { fetch: () => new Promise((resolve, reject) => handles.push({ resolve, reject })) }
  });
  t.refresh();                                  // two requests in flight
  assert.equal(handles.length, 2);
  handles[0].reject(new Error('old failure'));
  await tick();
  assert.equal(t.state.error, null, 'the stale failure was dropped');
  assert.equal(t.state.loading, true);
  handles[1].resolve({ rows: PAGE, total: 2 });
  await tick();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
  assert.ok(env.dom);
});

test('setLoading drives the state for data the host fetches itself', () => {
  const { t } = mountClient();
  const events = [];
  t.on('loading', (e) => events.push(e.loading));
  t.setLoading(true);
  assert.equal(t.state.loading, true);
  assert.equal(overlay(t).hasAttribute('hidden'), false);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2, 'the rows it already has stay');
  assert.equal(t.setLoading(false), t, 'chainable');
  assert.ok(overlay(t).hasAttribute('hidden'));
  assert.deepEqual(events, [true, false]);
  t.setLoading();
  assert.equal(t.state.loading, true, 'no argument means loading');
});

test('setLoading on an empty client table shows the skeleton', () => {
  const { t } = mountClient({ data: [], states: { skeleton: 2 } });
  t.setLoading(true);
  assert.equal(skelRows(t).length, 2);
  t.setLoading(false);
  assert.equal(skelRows(t).length, 0);
  assert.ok(t.el.querySelector('tr.vt-empty'));
});

test('setData clears both states', () => {
  const { t } = mountClient({ data: [] });
  t.setLoading(true);
  t.setError(new Error('x'));
  t.setData([{ id: 5, name: 'Late' }]);
  assert.equal(t.state.loading, false);
  assert.equal(t.state.error, null);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
});

test('setError shows the state by hand and null clears it', () => {
  const { t } = mountClient();
  assert.equal(t.setError(new Error('nope')), t, 'chainable');
  assert.ok(errorRow(t));
  assert.equal(errorRow(t).querySelector('.vt-error-detail').textContent, 'nope');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 0, 'the view is cleared');
  t.setError(null);
  assert.equal(errorRow(t), null);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2, 'the client rows come back');
});

test('setError releases a loading state that was on', () => {
  const { t } = mountClient({ data: [] });
  t.setLoading(true);
  t.setError(new Error('x'));
  assert.equal(t.state.loading, false);
  assert.ok(overlay(t).hasAttribute('hidden'));
  assert.ok(errorRow(t));
});

test('refresh() clears a previous error before loading again', async () => {
  const { t, reject, resolve } = mount();
  await reject();
  assert.ok(errorRow(t));
  t.refresh();
  assert.equal(t.state.error, null);
  assert.equal(errorRow(t), null);
  await resolve();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
});

test('the error row spans the visible columns of a virtualized table', async () => {
  const { t, reject } = mount({ virtual: { rowHeight: 20 }, columns: COLUMNS.concat([{ key: 'x', label: 'X' }]) });
  await reject();
  assert.equal(errorRow(t).querySelector('td').getAttribute('colspan'), '3');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-spacer').length, 0, 'no spacers while the error shows');
});

test('the toolbar and footer stay usable while loading', () => {
  const { t } = mount({ pagination: { perPage: 10, options: [10] }, export: { formats: ['csv'] } });
  assert.ok(t.el.querySelector('input.vt-search'), 'the search box is there');
  assert.ok(t.el.querySelector('.vt-export'), 'so is the export button');
  assert.ok(t.el.querySelector('.vt-footer .vt-prev'));
});

test('a client-side table is not busy just because it was built', () => {
  const { t } = mountClient();
  assert.equal(t.state.loading, false);
  assert.equal(t.state.error, null);
  assert.ok(overlay(t).hasAttribute('hidden'));
  assert.equal(t.el.querySelector('.vt-table').hasAttribute('aria-busy'), false);
});

test('clearing the error on a server table repaints without refetching', async () => {
  const { t, reject, calls } = mount();
  await reject();
  assert.ok(errorRow(t));
  t.setError(null);
  assert.equal(errorRow(t), null, 'the error row is gone');
  assert.equal(calls.length, 1, 'no new request — use refresh() or Retry for that');
  assert.ok(t.el.querySelector('tr.vt-empty'), 'nothing to show, so the empty row');
});

test('the overlay helper is inert without its element', () => {
  const { t } = mountClient();
  t.$overlay = null;
  t.setLoading(true);
  assert.equal(t.state.loading, true, 'the state is still tracked');
  assert.ok(t.el.classList.contains('vt-loading'));
});

test('a skeleton count that is not a number renders no rows', () => {
  assert.equal(skelRows(mount({ states: { skeleton: 'lots' } }).t).length, 0);
});
