// DOM tests: what the table actually renders in a document, and that the
// toolbar buttons, the keyboard grid and pagination are wired to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'site', label: 'Site', type: 'link', href: (r) => `/u/${r.id}` }
];
const DATA = [
  { id: 1, name: 'Ann', site: 'ann' },
  { id: 2, name: 'Пётр', site: 'petr' },
  { id: 3, name: 'Bob', site: 'bob' }
];

/** Make a table in a fresh document. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: DATA }, options || {}));
  return { Vantable, t, env };
}

/** Wait `ms` (the search box is debounced, so tests must outwait it). */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Send a bubbling keydown to an element, as a browser would. */
function key(env, el, k, init) {
  el.dispatchEvent(new env.window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, init)));
}

test('renders a head, a row per record and the default stylesheet', () => {
  const { t, env } = mount();
  const ths = [...t.el.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  assert.deepEqual(ths, ['ID', 'Name', 'Site']);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 3);
  assert.equal(t.el.querySelector('tbody tr.vt-tr td').textContent.trim(), '1');
  assert.ok(t.el.querySelector('a[href="/u/1"]'), 'link column rendered as an anchor');
  assert.ok(env.window.document.getElementById('vantable-default-styles'), 'default CSS injected');
  assert.equal(t.el.querySelector('.vt-table').getAttribute('role'), 'grid');
});

test('escapes values instead of injecting markup', () => {
  const { t } = mount({ data: [{ id: 1, name: '<img src=x onerror=alert(1)>', site: 'a' }] });
  assert.equal(t.el.querySelectorAll('tbody img').length, 0);
  assert.ok(t.el.querySelector('tbody tr td:nth-child(2)').textContent.includes('<img'));
});

test('renders one export button per configured format plus print', () => {
  const { t } = mount({ export: { formats: ['csv', 'xlsx', 'pdf'] } });
  const formats = [...t.el.querySelectorAll('.vt-export')].map((b) => b.getAttribute('data-format'));
  assert.deepEqual(formats, ['csv', 'xlsx', 'pdf']);
  assert.ok(t.el.querySelector('.vt-print'), 'print button');
  const { t: plain } = mount({ export: false, printable: false });
  assert.equal(plain.el.querySelectorAll('.vt-export').length, 0);
  assert.equal(plain.el.querySelectorAll('.vt-print').length, 0);
});

test('an export button click reaches the adapter with the rendered rows', async () => {
  const seen = [];
  const { t } = mount({
    export: { formats: ['xlsx'], filename: 'users', adapters: { xlsx: (p) => { seen.push(p); } } }
  });
  t.el.querySelector('.vt-export[data-format="xlsx"]').click();
  await wait(0);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].rows.map((r) => r.name), ['Ann', 'Пётр', 'Bob']);
});

test('the search box filters the rendered rows', async () => {
  const { t } = mount({ search: 'live' });
  const input = t.el.querySelector('input.vt-search');
  assert.ok(input, 'search box rendered');
  input.value = 'Пётр';
  input.dispatchEvent(new (t.el.ownerDocument.defaultView.Event)('input', { bubbles: true }));
  await wait(200);  // debounce is 150ms in client mode
  const names = [...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(2)')].map((td) => td.textContent.trim());
  assert.deepEqual(names, ['Пётр']);
});

test('clicking a header sorts the rendered rows', () => {
  const { t } = mount({ sort: 'live' });
  // The head is re-rendered on every sort, so the header is re-queried each time.
  const header = () => t.el.querySelector('thead th.vt-sortable[data-sort="name"]');
  const names = () => [...t.el.querySelectorAll('tbody tr.vt-tr td:nth-child(2)')].map((td) => td.textContent.trim());
  assert.ok(header(), 'sortable header');
  header().click();
  assert.deepEqual(names(), ['Ann', 'Bob', 'Пётр']);
  assert.equal(header().getAttribute('aria-sort'), 'ascending');
  header().click();
  assert.deepEqual(names(), ['Пётр', 'Bob', 'Ann']);
  assert.equal(header().getAttribute('aria-sort'), 'descending');
});

test('pagination renders a page at a time and the next button advances', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2, 5] } });
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /1 of 2/);
  t.el.querySelector('.vt-next').click();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /2 of 2/);
});

test('the keyboard grid moves focus between cells', () => {
  const { t, env } = mount();
  const firstTh = t.el.querySelector('thead th');
  firstTh.focus();
  assert.equal(env.window.document.activeElement, firstTh);
  key(env, firstTh, 'ArrowDown');
  const active = env.window.document.activeElement;
  assert.equal(active.tagName, 'TD');
  assert.equal(active.textContent.trim(), '1');
  key(env, active, 'ArrowRight');
  assert.equal(env.window.document.activeElement.textContent.trim(), 'Ann');
  key(env, env.window.document.activeElement, 'ArrowDown');
  assert.equal(env.window.document.activeElement.textContent.trim(), 'Пётр');
  key(env, env.window.document.activeElement, 'Home', { ctrlKey: true });
  assert.equal(env.window.document.activeElement.tagName, 'TH');
});

test('ARIA grid attributes are applied to the table', () => {
  const { t } = mount({ pagination: false });
  const table = t.el.querySelector('.vt-table');
  assert.equal(table.getAttribute('role'), 'grid');
  assert.equal(table.getAttribute('aria-rowcount'), '3');
  assert.equal(table.getAttribute('aria-colcount'), '3');
  assert.equal(t.el.querySelector('tbody tr').getAttribute('role'), 'row');
  assert.equal(t.el.querySelector('tbody td').getAttribute('role'), 'gridcell');
});

test('destroy() empties the host element', () => {
  const { t } = mount();
  t.destroy();
  assert.equal(t.el.innerHTML, '');
});
