// ARIA grid tests: the roles and relationships a screen reader needs, over the
// features that change the grid's shape (hidden/pinned columns, selection,
// virtualization, the accordion, the async states).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

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

const table = (t) => t.el.querySelector('.vt-table');

test('the grid carries a name, a role and its counts', () => {
  const { t } = mount();
  assert.equal(table(t).getAttribute('role'), 'grid');
  assert.equal(table(t).getAttribute('aria-label'), 'Data table', 'a generic name by default');
  assert.equal(table(t).getAttribute('aria-rowcount'), '2');
  assert.equal(table(t).getAttribute('aria-colcount'), '2');
});

test('the grid name can be given or delegated to another element', () => {
  assert.equal(table(mount({ label: 'Proxies' }).t).getAttribute('aria-label'), 'Proxies');
  const byId = mount({ labelledby: 'heading' }).t;
  assert.equal(table(byId).getAttribute('aria-labelledby'), 'heading');
  assert.equal(table(byId).hasAttribute('aria-label'), false, 'one name, not two');
  assert.equal(table(mount({ labels: { grid: 'Таблица данных' } }).t).getAttribute('aria-label'), 'Таблица данных');
});

test('rows and cells carry their roles and indexes', () => {
  const { t } = mount();
  const head = t.el.querySelector('thead tr');
  assert.equal(head.getAttribute('role'), 'row');
  assert.equal(head.getAttribute('aria-rowindex'), '1', 'the header is row 1');
  assert.deepEqual([...head.children].map((c) => c.getAttribute('role')), ['columnheader', 'columnheader']);
  assert.deepEqual([...head.children].map((c) => c.getAttribute('aria-colindex')), ['1', '2']);
  const first = t.el.querySelector('tbody tr.vt-tr');
  assert.equal(first.getAttribute('role'), 'row');
  assert.equal(first.getAttribute('aria-rowindex'), '2');
  assert.deepEqual([...first.children].map((c) => c.getAttribute('role')), ['gridcell', 'gridcell']);
  assert.deepEqual([...first.children].map((c) => c.getAttribute('aria-colindex')), ['1', '2']);
});

test('the column indexes follow what is rendered, not the configuration', () => {
  const { t } = mount({
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', hidden: true },
      { key: 'city', label: 'City', pin: 'left' }
    ],
    data: [{ id: 1, name: 'Ann', city: 'Berlin' }]
  });
  const head = [...t.el.querySelectorAll('thead th')];
  assert.deepEqual(head.map((c) => c.textContent.trim()), ['City', 'ID'], 'pinned first, hidden dropped');
  assert.deepEqual(head.map((c) => c.getAttribute('aria-colindex')), ['1', '2']);
  assert.equal(table(t).getAttribute('aria-colcount'), '2', 'and the count agrees');
});

test('aria-sort reports the sorted column only', () => {
  const { t } = mount({ sort: 'client' });
  const sorts = () => [...t.el.querySelectorAll('thead th')].map((c) => c.getAttribute('aria-sort'));
  assert.deepEqual(sorts(), ['none', 'none']);
  t.el.querySelector('thead th[data-sort="name"]').click();
  assert.deepEqual(sorts(), ['none', 'ascending']);
  t.el.querySelector('thead th[data-sort="name"]').click();
  assert.deepEqual(sorts(), ['none', 'descending']);
});

test('a selectable grid says so, and single-select does not', () => {
  assert.equal(table(mount().t).hasAttribute('aria-multiselectable'), false);
  assert.equal(table(mount({ selection: true }).t).getAttribute('aria-multiselectable'), 'true');
  assert.equal(table(mount({ selection: { mode: 'single' } }).t).hasAttribute('aria-multiselectable'), false);
});

test('selected rows report their state', () => {
  const { t } = mount({ selection: true });
  const row = () => t.el.querySelector('tbody tr.vt-tr[data-id="1"]');
  assert.equal(row().getAttribute('aria-selected'), 'false');
  t.selectRow(1, true);
  assert.equal(row().getAttribute('aria-selected'), 'true');
});

test('the checkboxes are named', () => {
  const { t } = mount({ selection: true, labels: { selectAll: 'Выбрать все', selectRow: 'Выбрать строку' } });
  assert.equal(t.el.querySelector('.vt-select-all').getAttribute('aria-label'), 'Выбрать все');
  assert.equal(t.el.querySelector('.vt-select-row').getAttribute('aria-label'), 'Выбрать строку');
});

test('the bulk bar is a named toolbar', () => {
  const { t } = mount({ selection: { actions: [{ label: 'Delete' }] }, labels: { bulkActions: 'Массовые действия' } });
  t.selectRow(1, true);
  const bar = t.el.querySelector('.vt-bulk');
  assert.equal(bar.getAttribute('role'), 'toolbar');
  assert.equal(bar.getAttribute('aria-label'), 'Массовые действия');
});

test('the expander is named, states itself and points at its detail row', () => {
  const { t } = mount({ accordion: { columns: ['name'] }, labels: { expandRow: 'Раскрыть строку' } });
  const btn = () => t.el.querySelector('.vt-expander');
  assert.equal(btn().getAttribute('aria-label'), 'Раскрыть строку');
  assert.equal(btn().getAttribute('aria-expanded'), 'false');
  const target = btn().getAttribute('aria-controls');
  assert.ok(target, 'it names an element');
  assert.equal(t.el.querySelector('#' + target), null, 'which does not exist while collapsed');
  btn().click();
  assert.equal(btn().getAttribute('aria-expanded'), 'true');
  const detail = t.el.querySelector('tr.vt-detail');
  assert.equal(detail.id, btn().getAttribute('aria-controls'), 'and matches the open detail row');
});

test('detail-row ids stay valid for ids with odd characters', () => {
  const { t } = mount({
    rowId: 'key',
    data: [{ key: 'a b/c"d', name: 'Odd' }],
    accordion: { columns: ['name'] }
  });
  t.el.querySelector('.vt-expander').click();
  const detail = t.el.querySelector('tr.vt-detail');
  assert.match(detail.id, /^vt\d+-d-[\w-]+$/);
  assert.equal(t.el.querySelector('#' + detail.id), detail, 'the id can be looked up');
});

test('the search box and the column menu are named', () => {
  const { t } = mount({ columnPicker: true, labels: { search: 'Искать…', columns: 'Колонки' } });
  assert.equal(t.el.querySelector('input.vt-search').getAttribute('aria-label'), 'Искать…');
  const menu = t.el.querySelector('.vt-cols-menu');
  assert.equal(menu.getAttribute('role'), 'group');
  assert.equal(menu.getAttribute('aria-label'), 'Колонки');
  assert.equal(t.el.querySelector('.vt-cols-btn').getAttribute('aria-expanded'), 'false');
  t.el.querySelector('.vt-cols-btn').click();
  assert.equal(t.el.querySelector('.vt-cols-btn').getAttribute('aria-expanded'), 'true');
});

test('a virtualized grid keeps absolute row indexes and the full row count', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, name: 'row' + i }));
  const t = new Vantable('#host', { columns: COLUMNS.map((c) => ({ ...c })), data: rows, pagination: false, virtual: { rowHeight: 20, overscan: 0 } });
  const sc = t.el.querySelector('.vt-scroll');
  let top = 0;
  Object.defineProperty(sc, 'clientHeight', { get: () => 100, configurable: true });
  Object.defineProperty(sc, 'scrollTop', { get: () => top, set: (v) => { top = v; }, configurable: true });
  t.refresh();
  assert.equal(table(t).getAttribute('aria-rowcount'), '500');
  top = 400;
  sc.dispatchEvent(new env.window.Event('scroll'));
  assert.equal(t.el.querySelector('tbody tr.vt-tr').getAttribute('aria-rowindex'), '22');
  assert.equal(t.el.querySelector('tbody tr.vt-spacer').getAttribute('aria-hidden'), 'true');
});

test('the async states announce themselves', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  let fail = false;
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    server: { fetch: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve({ rows: DATA, total: 2 })) }
  });
  assert.equal(table(t).getAttribute('aria-busy'), 'true');
  assert.equal(t.el.querySelector('.vt-overlay').getAttribute('role'), 'status');
  assert.equal(t.el.querySelector('.vt-skel-row').getAttribute('aria-hidden'), 'true');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(table(t).getAttribute('aria-busy'), 'false');
  fail = true;
  t.refresh();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.el.querySelector('tr.vt-error').getAttribute('role'), 'alert');
  assert.ok(env.dom);
});

test('the roles survive every re-render path', () => {
  const { t } = mount({ selection: true, accordion: { columns: ['name'] }, sort: 'client', pagination: { perPage: 1, options: [1] } });
  const check = (where) => {
    assert.equal(table(t).getAttribute('role'), 'grid', where);
    const cells = [...t.el.querySelectorAll('tbody tr.vt-tr:first-child td')];
    assert.ok(cells.every((c) => c.getAttribute('role') === 'gridcell'), where);
    assert.deepEqual(cells.map((c) => c.getAttribute('aria-colindex')), ['1', '2', '3', '4'], where);
  };
  check('initial');
  t.el.querySelector('thead th[data-sort="name"]').click();
  check('after a sort');
  t.el.querySelector('.vt-next').click();
  check('after paging');
  t.selectAll();
  check('after a selection');
  t.el.querySelector('.vt-expander').click();
  check('with a detail row open');
});
