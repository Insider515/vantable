// Responsive tests: the card mode is driven by the table's own width, carries
// the column labels into the cells, and steps around the features that assume
// a real table layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City' }
];
const DATA = [{ id: 1, name: 'Ann', city: 'Berlin' }, { id: 2, name: 'Bob', city: 'Chicago' }];

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

/**
 * jsdom lays nothing out, so the root reports no width: give it one and return
 * a resize() that changes it and fires the window event the library listens to.
 */
function width(t, env, px) {
  let w = px;
  Object.defineProperty(t.el, 'clientWidth', { get: () => w, configurable: true });
  return {
    resize(next) {
      w = next;
      env.window.dispatchEvent(new env.window.Event('resize'));
      return new Promise((r) => setTimeout(r, 120));   // the handler is debounced
    }
  };
}

const cells = (t) => [...t.el.querySelectorAll('tbody tr.vt-tr:first-child td')];

test('the card mode is off unless asked for', () => {
  const { t } = mount();
  assert.equal(t.responsive, null);
  assert.equal(t.isStacked(), false);
  assert.equal(t.el.classList.contains('vt-responsive'), false);
  assert.equal(cells(t)[0].hasAttribute('data-label'), false);
});

test('a responsive table is marked but stays a table until it is narrow', async () => {
  const { t, env } = mount({ responsive: true });
  assert.ok(t.el.classList.contains('vt-responsive'));
  assert.equal(t.isStacked(), false, 'nothing measured yet, so no cards');
  const w = width(t, env, 1000);
  await w.resize(1000);
  assert.equal(t.isStacked(), false);
  assert.equal(t.el.classList.contains('vt-stacked'), false);
});

test('it stacks below the breakpoint and goes back above it', async () => {
  const { t, env } = mount({ responsive: true });
  const events = [];
  t.on('responsive', (e) => events.push(e));
  const w = width(t, env, 1000);
  await w.resize(500);
  assert.equal(t.isStacked(), true);
  assert.ok(t.el.classList.contains('vt-stacked'));
  assert.deepEqual(events, [{ stacked: true, width: 500 }]);
  await w.resize(900);
  assert.equal(t.isStacked(), false);
  assert.deepEqual(events.at(-1), { stacked: false, width: 900 });
});

test('the breakpoint is configurable', async () => {
  const { t, env } = mount({ responsive: { breakpoint: 420 } });
  const w = width(t, env, 500);
  await w.resize(500);
  assert.equal(t.isStacked(), false, '500 is above 420');
  await w.resize(400);
  assert.equal(t.isStacked(), true);
});

test('a width of zero is treated as "not measured", not as narrow', async () => {
  const { t, env } = mount({ responsive: true });
  const w = width(t, env, 0);
  await w.resize(0);
  assert.equal(t.isStacked(), false);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2, 'the table still renders');
});

test('every cell carries its column label for the card layout', () => {
  const { t } = mount({ responsive: true });
  assert.deepEqual(cells(t).map((td) => td.getAttribute('data-label')), ['ID', 'Name', 'City']);
  assert.ok(loadVantable().css.includes('.vt-stacked .vt-td[data-label]::before{content:attr(data-label)'),
    'the shipped CSS prints it');
});

test('the labels follow hidden and reordered columns', () => {
  const { t } = mount({ responsive: true });
  t.hideColumn('name');
  assert.deepEqual(cells(t).map((td) => td.getAttribute('data-label')), ['ID', 'City']);
  t.moveColumn('city', 0);
  assert.deepEqual(cells(t).map((td) => td.getAttribute('data-label')), ['City', 'ID']);
});

test('an edited cell keeps its label', () => {
  const { t } = mount({
    responsive: true,
    editable: true,
    columns: [{ key: 'name', label: 'Name', editable: true }, { label: 'Act', type: 'actions', edit: { enabled: true } }]
  });
  t.el.querySelector('[data-act="edit"]').click();
  const cell = t.el.querySelector('td.vt-editing');
  assert.equal(cell.getAttribute('data-label'), 'Name');
});

test('the filter row carries labels too, so the filters stay usable', () => {
  const { t } = mount({
    responsive: true,
    columns: [{ key: 'id', label: 'ID', filter: 'number' }, { key: 'name', label: 'Name', filter: true }]
  });
  const filterCells = [...t.el.querySelectorAll('.vt-filter-row > th')];
  assert.deepEqual(filterCells.map((c) => c.getAttribute('data-label')), ['ID', 'Name']);
  assert.ok(loadVantable().css.includes('.vt-stacked .vt-filter-row{display:flex'),
    'and the row is laid out as a strip of inputs');
});

test('virtualization steps aside while stacked and comes back after', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'row' + i, city: 'x' }));
  const t = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    data: rows,
    pagination: false,
    responsive: true,
    virtual: { rowHeight: 20, overscan: 0 }
  });
  const sc = t.el.querySelector('.vt-scroll');
  Object.defineProperty(sc, 'clientHeight', { get: () => 100, configurable: true });
  Object.defineProperty(sc, 'scrollTop', { get: () => 0, configurable: true });
  t.refresh();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 5, 'windowed as a table');

  const w = width(t, env, 1000);
  await w.resize(480);
  assert.equal(t.isStacked(), true);
  assert.equal(t._virtualOn(), false, 'cards are not uniform, so the window is off');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 200, 'every card is rendered');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-spacer').length, 0);

  await w.resize(1000);
  assert.equal(t._virtualOn(), true);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 5, 'windowed again');
});

test('search, sort, selection and paging keep working while stacked', async () => {
  const { t, env } = mount({
    responsive: true,
    search: 'live',
    sort: 'client',
    selection: true,
    pagination: { perPage: 1, options: [1] }
  });
  const w = width(t, env, 1000);
  await w.resize(400);
  assert.equal(t.isStacked(), true);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1, 'still one row per page');
  t.el.querySelector('.vt-next').click();
  assert.equal(t.state.page, 2);
  t.selectAll();
  assert.deepEqual(t.selectedIds(), ['2']);
  assert.ok(t.el.querySelector('tr.vt-tr').classList.contains('vt-selected'));
  t.state.q = 'ann';
  t.refresh();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
  assert.ok(t.el.querySelector('.vt-bulk'), 'the bulk bar is above the cards');
});

test('the accordion still opens in card mode', async () => {
  const { t, env } = mount({ responsive: true, accordion: { columns: ['city'] } });
  const w = width(t, env, 1000);
  await w.resize(420);
  t.el.querySelector('.vt-expander').click();
  const detail = t.el.querySelector('tr.vt-detail');
  assert.ok(detail, 'the detail row is there');
  assert.match(detail.textContent, /Berlin/);
});

test('pinned columns are neutralised by the card stylesheet', async () => {
  const { t, env } = mount({
    responsive: true,
    columns: [{ key: 'id', label: 'ID', width: '60px', pin: 'left' }, { key: 'name', label: 'Name' }]
  });
  const w = width(t, env, 1000);
  await w.resize(400);
  const first = cells(t)[0];
  assert.ok(first.classList.contains('vt-pin-left'), 'the class stays');
  assert.ok(loadVantable().css.includes('.vt-stacked .vt-pin-left,.vt-stacked .vt-pin-right{position:static'),
    'but the CSS stops it from sticking');
});

test('destroy() stops listening for resizes', async () => {
  const { t, env } = mount({ responsive: true });
  const w = width(t, env, 1000);
  await w.resize(1000);
  assert.equal(typeof t._onResize, 'function');
  t.destroy();
  await w.resize(300);                 // must not touch the dead table
  assert.equal(t.el.innerHTML, '');
  assert.equal(t.isStacked(), false);
});

test('a second instance keeps its own card state', async () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const a = new Vantable('#a', { columns: COLUMNS.map((c) => ({ ...c })), data: DATA, responsive: true });
  const b = new Vantable('#b', { columns: COLUMNS.map((c) => ({ ...c })), data: DATA, responsive: true });
  Object.defineProperty(a.el, 'clientWidth', { get: () => 400, configurable: true });
  Object.defineProperty(b.el, 'clientWidth', { get: () => 1200, configurable: true });
  env.window.dispatchEvent(new env.window.Event('resize'));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(a.isStacked(), true);
  assert.equal(b.isStacked(), false, 'each table measures itself');
});

test('the measurement is a no-op on a table that did not ask for cards', () => {
  const { t } = mount();
  t._applyResponsive();
  assert.equal(t.isStacked(), false);
  assert.equal(t.el.classList.contains('vt-stacked'), false);
});
