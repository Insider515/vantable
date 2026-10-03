// Row-selection tests: the checkbox column, select-all with its indeterminate
// state, the bulk bar and its actions, and the programmatic selection API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
const DATA = [
  { id: 1, name: 'Ann', locked: false },
  { id: 2, name: 'Bob', locked: true },
  { id: 3, name: 'Carl', locked: false }
];

/** Mount a table with selection switched on (unless options say otherwise). */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    data: DATA.map((r) => ({ ...r })),
    selection: true
  }, options || {}));
  return { env, Vantable, t };
}

/** The row checkbox of a row id. */
const box = (t, id) => t.el.querySelector(`.vt-select-row[data-select="${id}"]`);
/** The select-all checkbox in the header. */
const allBox = (t) => t.el.querySelector('.vt-select-all');
/** The bulk bar. */
const bulk = (t) => t.el.querySelector('.vt-bulk');
/** Tick or untick a checkbox the way a user would. */
function click(el, checked) {
  el.checked = checked === undefined ? !el.checked : checked;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}
/** Selected ids as numbers, sorted, for stable comparisons. */
const ids = (t) => t.selectedIds().map(Number).sort((a, b) => a - b);

test('selection is off unless asked for', () => {
  const { t } = mount({ selection: undefined });
  assert.equal(t.selection, null);
  assert.equal(t.el.querySelectorAll('.vt-select-row').length, 0);
  assert.equal(t.el.querySelector('.vt-th-select'), null);
  assert.ok(bulk(t).hasAttribute('hidden'));
});

test('a checkbox column is rendered first, with a select-all in the header', () => {
  const { t } = mount();
  const head = [...t.el.querySelectorAll('thead th')];
  assert.ok(head[0].classList.contains('vt-th-select'), 'the checkbox column leads');
  assert.ok(allBox(t), 'select-all is in the header');
  assert.equal(allBox(t).getAttribute('aria-label'), 'Select all');
  assert.equal(t.el.querySelectorAll('tbody .vt-select-row').length, 3);
  const first = t.el.querySelector('tbody tr.vt-tr');
  assert.ok(first.children[0].classList.contains('vt-td-select'));
  assert.equal(first.getAttribute('aria-selected'), 'false');
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-colcount'), '3', 'the checkbox counts as a column');
});

test('ticking a row selects it, marks the row and shows the bulk bar', () => {
  const { t } = mount();
  const events = [];
  t.on('selectionChange', (e) => events.push(e));
  click(box(t, 2), true);
  assert.deepEqual(ids(t), [2]);
  assert.equal(t.selectedCount(), 1);
  assert.ok(t.isSelected(2), 'numbers and strings both work');
  assert.ok(t.isSelected('2'));
  const tr = t.el.querySelector('tbody tr.vt-tr[data-id="2"]');
  assert.ok(tr.classList.contains('vt-selected'));
  assert.equal(tr.getAttribute('aria-selected'), 'true');
  assert.equal(bulk(t).hasAttribute('hidden'), false);
  assert.equal(bulk(t).querySelector('.vt-bulk-count').textContent, '1 selected');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].ids, ['2']);
  assert.deepEqual(events[0].rows.map((r) => r.name), ['Bob']);
  assert.equal(events[0].count, 1);
});

test('unticking releases the row and hides the bar again', () => {
  const { t } = mount();
  click(box(t, 1), true);
  click(box(t, 1), false);
  assert.deepEqual(ids(t), []);
  assert.equal(t.el.querySelectorAll('.vt-selected').length, 0);
  assert.ok(bulk(t).hasAttribute('hidden'));
});

test('the row checkbox keeps focus when it is ticked', () => {
  const { t, env } = mount();
  const cb = box(t, 1);
  cb.focus();
  click(cb, true);
  assert.equal(env.window.document.activeElement, cb, 'the rows are not re-rendered');
});

test('select-all covers the whole view and reports once', () => {
  const { t } = mount();
  const events = [];
  t.on('selectionChange', (e) => events.push(e.count));
  click(allBox(t), true);
  assert.deepEqual(ids(t), [1, 2, 3]);
  assert.equal(allBox(t).checked, true);
  assert.equal(allBox(t).indeterminate, false);
  assert.deepEqual(events, [3]);
  click(allBox(t), false);
  assert.deepEqual(ids(t), []);
  assert.deepEqual(events, [3, 0]);
});

test('select-all is indeterminate while only some rows are selected', () => {
  const { t } = mount();
  click(box(t, 1), true);
  assert.equal(allBox(t).checked, false);
  assert.equal(allBox(t).indeterminate, true);
  click(box(t, 2), true);
  click(box(t, 3), true);
  assert.equal(allBox(t).checked, true);
  assert.equal(allBox(t).indeterminate, false);
});

test('select-all only covers the rows the search left in the view', () => {
  const { t } = mount({ search: 'live' });
  t.state.q = 'ann';
  t.refresh();
  click(allBox(t), true);
  assert.deepEqual(ids(t), [1]);
  t.state.q = '';
  t.refresh();
  assert.equal(allBox(t).indeterminate, true, 'one of three now');
});

test('select-all on a page covers that page only', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2] } });
  click(allBox(t), true);
  assert.deepEqual(ids(t), [1, 2]);
  t.el.querySelector('.vt-next').click();
  assert.equal(allBox(t).checked, false, 'the second page is untouched');
  assert.equal(allBox(t).indeterminate, false);
  click(allBox(t), true);
  assert.deepEqual(ids(t), [1, 2, 3], 'the earlier page stays selected');
});

test('the selection survives sorting, searching and paging', () => {
  const { t } = mount({ sort: 'client', pagination: { perPage: 2, options: [2] } });
  click(box(t, 1), true);
  t.el.querySelector('thead th[data-sort="name"]').click();
  assert.deepEqual(ids(t), [1]);
  assert.ok(t.el.querySelector('tr.vt-tr[data-id="1"]').classList.contains('vt-selected'));
  t.el.querySelector('.vt-next').click();
  assert.deepEqual(ids(t), [1], 'still selected while off screen');
  assert.equal(t.el.querySelector('tr.vt-tr[data-id="1"]'), null);
  assert.equal(bulk(t).hasAttribute('hidden'), false, 'the bar still shows the count');
});

test('selectable:false rows cannot be selected, by hand or in bulk', () => {
  const { t } = mount({ selection: { selectable: (row) => !row.locked } });
  assert.equal(box(t, 2).disabled, true, 'the locked row');
  assert.equal(box(t, 1).disabled, false);
  click(box(t, 2), true);                 // as if the attribute were bypassed
  assert.deepEqual(ids(t), [], 'the library refuses it too');
  click(allBox(t), true);
  assert.deepEqual(ids(t), [1, 3]);
  assert.equal(allBox(t).checked, true, 'all selectable rows are selected');
  assert.equal(allBox(t).indeterminate, false);
});

test('single mode keeps one row selected at a time and has no select-all', () => {
  const { t } = mount({ selection: { mode: 'single' } });
  assert.equal(allBox(t), null, 'select-all makes no sense for one row');
  assert.ok(t.el.querySelector('.vt-th-select'), 'the column is still there');
  click(box(t, 1), true);
  click(box(t, 3), true);
  assert.deepEqual(ids(t), [3]);
  assert.equal(t.el.querySelectorAll('.vt-selected').length, 1);
  t.selectAll();
  assert.deepEqual(ids(t), [3], 'selectAll is a no-op in single mode');
});

test('header:false drops the select-all but keeps the row checkboxes', () => {
  const { t } = mount({ selection: { header: false } });
  assert.equal(allBox(t), null);
  assert.equal(t.el.querySelectorAll('.vt-select-row').length, 3);
  t.selectAll();
  assert.deepEqual(ids(t), [1, 2, 3], 'selectAll still works from code');
});

test('bulk actions appear with the selection and receive rows and ids', () => {
  const calls = [];
  const { t } = mount({
    selection: {
      actions: [
        { label: 'Delete', className: 'vt-danger', onClick: (rows, sel) => calls.push(['del', rows.map((r) => r.id), sel]) },
        { label: 'Export', onClick: (rows) => calls.push(['exp', rows.length]) }
      ]
    }
  });
  const events = [];
  t.on('bulkAction', (e) => events.push(e));
  assert.ok(bulk(t).hasAttribute('hidden'), 'nothing selected, nothing shown');
  click(box(t, 1), true);
  click(box(t, 3), true);
  const buttons = [...bulk(t).querySelectorAll('button')];
  assert.deepEqual(buttons.map((b) => b.textContent), ['Delete', 'Export', 'Clear']);
  assert.ok(buttons[0].classList.contains('vt-danger'));
  buttons[0].click();
  assert.deepEqual(calls, [['del', [1, 3], ['1', '3']]]);
  assert.equal(events[0].index, 0);
  assert.equal(events[0].label, 'Delete');
  assert.deepEqual(events[0].ids, ['1', '3']);
  buttons[1].click();
  assert.deepEqual(calls[1], ['exp', 2]);
});

test('an action without onClick only emits the event', () => {
  const { t } = mount({ selection: { actions: [{ label: 'Noop' }] } });
  const events = [];
  t.on('bulkAction', (e) => events.push(e.index));
  click(box(t, 1), true);
  bulk(t).querySelector('[data-bulk="0"]').click();
  assert.deepEqual(events, [0]);
});

test('the Clear button drops the whole selection', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2] } });
  t.selectAll();
  t.el.querySelector('.vt-next').click();
  t.selectAll();
  assert.equal(t.selectedCount(), 3);
  bulk(t).querySelector('.vt-bulk-clear').click();
  assert.deepEqual(ids(t), [], 'including rows that are not on screen');
  assert.ok(bulk(t).hasAttribute('hidden'));
});

test('the bulk labels can be translated, with the count substituted', () => {
  const { t } = mount({ labels: { selected: 'Выбрано: {n}', clearSelection: 'Сбросить', selectAll: 'Выбрать все', selectRow: 'Выбрать строку' } });
  assert.equal(allBox(t).getAttribute('aria-label'), 'Выбрать все');
  assert.equal(box(t, 1).getAttribute('aria-label'), 'Выбрать строку');
  click(box(t, 1), true);
  assert.equal(bulk(t).querySelector('.vt-bulk-count').textContent, 'Выбрано: 1');
  assert.equal(bulk(t).querySelector('.vt-bulk-clear').textContent, 'Сбросить');
});

test('the programmatic API mirrors the checkboxes', () => {
  const { t } = mount();
  assert.equal(t.selectRow(1), t, 'chainable');
  assert.equal(box(t, 1).checked, true, 'no argument flips it on');
  t.selectRow(1);
  assert.equal(box(t, 1).checked, false, 'and off again');
  t.selectRow(2, true);
  assert.deepEqual(t.selectedRows().map((r) => r.name), ['Bob']);
  t.clearSelection();
  assert.deepEqual(ids(t), []);
  assert.equal(t.selectAll(), t);
  assert.equal(t.selectedCount(), 3);
});

test('the selection API is inert without the option', () => {
  const { t } = mount({ selection: undefined });
  const events = [];
  t.on('selectionChange', (e) => events.push(e));
  assert.equal(t.selectRow(1), t);
  assert.equal(t.selectAll(), t);
  assert.equal(t.clearSelection(), t);
  assert.deepEqual(t.selectedIds(), []);
  assert.deepEqual(t.selectedRows(), []);
  assert.equal(t.selectedCount(), 0);
  assert.equal(t.isSelected(1), false);
  assert.deepEqual(events, []);
});

test('selectedRows reports the page in server mode, selectedIds the lot', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  let page = 1;
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    selection: true,
    pagination: { perPage: 2, options: [2] },
    server: { fetch: () => ({ rows: page === 1 ? DATA.slice(0, 2) : DATA.slice(2), total: 3 }) }
  });
  await new Promise((r) => setTimeout(r, 0));
  t.selectAll();
  assert.deepEqual(ids(t), [1, 2]);
  page = 2;
  t.el.querySelector('.vt-next').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ids(t), [1, 2], 'the ids survive the fetch');
  assert.deepEqual(t.selectedRows(), [], 'but those rows are not on this page');
  t.selectRow(3, true);
  assert.deepEqual(t.selectedRows().map((r) => r.name), ['Carl']);
  assert.ok(env.dom);
});

test('a row click is not a selection click', () => {
  const hits = [];
  const { t } = mount({ onRowClick: (r) => hits.push(r.id) });
  box(t, 1).click();
  assert.deepEqual(hits, [], 'the checkbox is a control, not the row');
  t.el.querySelector('tr.vt-tr[data-id="1"] td:nth-child(2)').click();
  assert.deepEqual(hits, [1]);
});

test('selection works alongside the accordion, each with its own lead cell', () => {
  const { t } = mount({ accordion: { columns: ['name'] } });
  const first = t.el.querySelector('tbody tr.vt-tr');
  assert.ok(first.children[0].classList.contains('vt-td-select'));
  assert.ok(first.children[1].classList.contains('vt-td-expander'));
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-colcount'), '4');
  t.el.querySelector('.vt-expander').click();
  assert.equal(t.el.querySelector('tr.vt-detail td').getAttribute('colspan'), '4');
  click(box(t, 1), true);
  assert.ok(t.el.querySelector('tr.vt-tr[data-id="1"]').classList.contains('vt-selected'));
});

test('the lead cells stick together when a column is pinned left', () => {
  const { t } = mount({
    accordion: { columns: ['name'] },
    columns: [{ key: 'id', label: 'ID', width: '60px', pin: 'left' }, { key: 'name', label: 'Name', width: '90px' }]
  });
  const head = [...t.el.querySelectorAll('thead th')];
  assert.ok(head[0].classList.contains('vt-pin-left'), 'the checkbox cell sticks');
  assert.ok(head[1].classList.contains('vt-pin-left'), 'so does the expander');
  // Fallback widths from the stylesheet (jsdom measures nothing): the checkbox
  // cell is 36px wide, the accordion handle 34px.
  assert.equal(head[0].style.left, '0px');
  assert.equal(head[1].style.left, '36px');
  assert.equal(head[2].style.left, '70px', 'the pinned column sits after both');
});

test('the empty row and the skeleton span the checkbox column', () => {
  const { t } = mount({ data: [] });
  assert.equal(t.el.querySelector('tr.vt-empty td').getAttribute('colspan'), '3');
  t.setLoading(true);
  const skel = t.el.querySelector('tr.vt-skel-row');
  assert.equal(skel.children.length, 3, 'checkbox placeholder + two columns');
  assert.ok(skel.children[0].classList.contains('vt-td-select'));
});

test('print drops the checkbox cells', () => {
  const { t, env } = mount();
  let html = '';
  env.window.open = () => ({
    document: { write: (s) => { html = s; }, close: () => {} }, focus: () => {}, print: () => {}, close: () => {}
  });
  t.selectAll();
  t.print();
  const parsed = env.window.document.createElement('div');
  parsed.innerHTML = html;
  assert.equal(parsed.querySelectorAll('.vt-td-select, .vt-th-select').length, 0);
  assert.match(parsed.textContent, /Ann/);
});

test('selection survives a virtualized scroll and selects the whole view', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const rows = Array.from({ length: 300 }, (_, i) => ({ id: i, name: 'row' + i }));
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    data: rows,
    selection: true,
    pagination: false,
    virtual: { rowHeight: 20, overscan: 0 }
  });
  const sc = t.el.querySelector('.vt-scroll');
  let top = 0;
  Object.defineProperty(sc, 'clientHeight', { get: () => 100, configurable: true });
  Object.defineProperty(sc, 'scrollTop', { get: () => top, set: (v) => { top = v; }, configurable: true });
  t.refresh();
  t.selectRow(7, true);
  assert.equal(t.el.querySelectorAll('.vt-select-row').length, 5, 'only the window is rendered');
  sc.scrollTop = 140;                      // row 7 scrolls out
  sc.dispatchEvent(new env.window.Event('scroll'));
  assert.deepEqual(ids(t), [7], 'still selected');
  t.selectAll();
  assert.equal(t.selectedCount(), 300, 'select-all covers the dataset, not the window');
  assert.equal(allBox(t).checked, true);
  sc.scrollTop = 0;
  sc.dispatchEvent(new env.window.Event('scroll'));
  assert.equal(t.el.querySelectorAll('.vt-select-row:checked').length, 5, 'the new window renders ticked');
});

test('an id with no row on this page is still selectable', () => {
  const { t } = mount({ selection: { selectable: (row) => !row.locked } });
  t.selectRow('999', true);
  assert.deepEqual(t.selectedIds(), ['999'], 'selectable() cannot judge a row it has not got');
  assert.deepEqual(t.selectedRows(), []);
  assert.equal(t.selectedCount(), 1);
});

test('actions:null and label-less actions render without complaint', () => {
  const { t } = mount({ selection: { actions: null } });
  click(box(t, 1), true);
  assert.deepEqual([...bulk(t).querySelectorAll('button')].map((b) => b.textContent), ['Clear']);
  const bare = mount({ selection: { actions: [{ onClick: () => {} }] } });
  click(box(bare.t, 1), true);
  assert.equal(bulk(bare.t).querySelector('[data-bulk="0"]').textContent, '');
});

test('a bulk index that does not exist is ignored', () => {
  const { t } = mount({ selection: { actions: [{ label: 'One' }] } });
  const events = [];
  t.on('bulkAction', (e) => events.push(e));
  click(box(t, 1), true);
  t._runBulk(5);
  t._runBulk(-1);
  assert.deepEqual(events, []);
});

test('the selection helpers are inert without their elements', () => {
  const { t } = mount();
  t.selectRow(1, true);
  t.$tbody = null;
  t._syncSelection();
  t.$thead = null;
  t._syncSelectAll();
  t.$bulk = null;
  t._renderBulk();
  assert.deepEqual(ids(t), [1], 'the selection itself is untouched');

  const plain = mount({ selection: undefined }).t;
  plain._renderBulk();
  plain._runBulk(0);
  plain._syncSelection();
  plain._syncSelectAll();
  assert.ok(plain.el.querySelector('.vt-bulk').hasAttribute('hidden'));
});
