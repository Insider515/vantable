// Column-operation edge cases: measured-geometry paths (jsdom reports zero
// sizes unless they are stubbed), keyless columns, and the guard clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' }
];
const DATA = [{ id: 1, name: 'Ann', email: 'a@x.io' }, { id: 2, name: 'Bob', email: 'b@x.io' }];

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

/** The header cell of a column. */
const th = (t, key) => t.el.querySelector(`thead th[data-key="${key}"]`);
/** Header labels in render order. */
const heads = (t) => [...t.el.querySelectorAll('thead th')].map((h) => h.textContent.trim());
/** Dispatch a mouse event with a pointer position (el may be the document). */
function mouse(el, type, clientX) {
  const win = el.ownerDocument ? el.ownerDocument.defaultView : el.defaultView;
  el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}
/** Pretend the browser laid this element out with the given width. */
function fakeWidth(el, px) {
  Object.defineProperty(el, 'offsetWidth', { value: px, configurable: true });
}

test('unknown or missing keys are a no-op in every column method', () => {
  const { t } = mount();
  const events = [];
  ['columnResize', 'columnMove', 'columnPin', 'columnVisibility'].forEach((n) => t.on(n, (e) => events.push(e)));
  assert.equal(t._colById(undefined), null);
  assert.equal(t._indexOfCol(), -1);
  assert.equal(t.toggleColumn(undefined), t);
  assert.equal(t.hideColumn(null), t);
  assert.equal(t.moveColumn(undefined, 0), t);
  assert.equal(t.setColumnWidth(null, 10), t);
  assert.equal(t.pinColumn(undefined, 'left'), t);
  assert.deepEqual(events, [], 'nothing was reported');
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email']);
});

test('the measured widths are captured once, then the layout is fixed', () => {
  const { t } = mount({ resize: true });
  [...t.el.querySelectorAll('thead th')].forEach((h) => fakeWidth(h, 120));
  t.refresh();
  assert.deepEqual(t.columns.map((c) => c.width), ['120px', '120px', '120px']);
  assert.equal(t._widthsFrozen, true);
  assert.ok(t.el.querySelector('.vt-table').classList.contains('vt-table-fixed'));
  [...t.el.querySelectorAll('thead th')].forEach((h) => fakeWidth(h, 999));
  t.refresh();
  assert.deepEqual(t.columns.map((c) => c.width), ['120px', '120px', '120px'], 'captured only once');
});

test('nothing is frozen while the browser reports no geometry', () => {
  const { t } = mount({ resize: true });
  assert.equal(t._widthsFrozen, undefined);
  assert.deepEqual(t.columns.map((c) => c.width), [undefined, undefined, undefined]);
  assert.equal(t.el.querySelector('.vt-table').classList.contains('vt-table-fixed'), false);
});

test('a drag starts from the measured width when there is one', () => {
  const { t } = mount({ resize: true });
  const head = th(t, 'name');
  fakeWidth(head, 100);
  mouse(head.querySelector('.vt-resizer'), 'mousedown', 0);
  mouse(t.el.ownerDocument, 'mousemove', 30);
  mouse(t.el.ownerDocument, 'mouseup', 30);
  assert.equal(t._colById('name').width, '130px');
});

test('pin offsets stack the measured widths of the pinned cells', () => {
  const { t } = mount({
    columns: [
      { key: 'id', label: 'ID', pin: 'left' },
      { key: 'name', label: 'Name', pin: 'left' },
      { key: 'email', label: 'Email' }
    ]
  });
  fakeWidth(th(t, 'id'), 80);
  fakeWidth(th(t, 'name'), 150);
  t._applyPinOffsets();
  assert.equal(th(t, 'id').style.left, '0px');
  assert.equal(th(t, 'name').style.left, '80px', 'measured, not configured');
});

test('a column with no data key is addressed by its generated id', () => {
  const { t } = mount({
    resize: true,
    columns: [{ key: 'id', label: 'ID', width: '60px' }, { label: 'Act', type: 'actions', custom: [{ label: 'P' }], width: '100px' }]
  });
  const events = [];
  ['columnResize', 'columnMove', 'columnPin', 'columnVisibility'].forEach((n) => t.on(n, (e) => events.push([n, e])));
  assert.deepEqual(t.columnOrder(), ['id', 'col1']);

  mouse(th(t, 'col1').querySelector('.vt-resizer'), 'mousedown', 0);
  mouse(t.el.ownerDocument, 'mousemove', 20);
  mouse(t.el.ownerDocument, 'mouseup', 20);
  t.moveColumn('col1', 0);
  t.pinColumn('col1', 'right');
  t.setColumnWidth('col1', 90);
  t.hideColumn('col1');

  assert.deepEqual(events.map(([n, e]) => [n, e.key]), [
    ['columnResize', 'col1'], ['columnMove', 'col1'], ['columnPin', 'col1'],
    ['columnResize', 'col1'], ['columnVisibility', 'col1']
  ]);
  assert.deepEqual(events[1][1].order, ['col1', 'id']);
  assert.deepEqual(t.columnState().map((c) => c.key), ['col1', 'id']);
  assert.deepEqual(heads(t), ['ID'], 'the actions column is hidden');
});

test('moving a column onto its own index reports nothing', () => {
  const { t } = mount();
  const events = [];
  t.on('columnMove', (e) => events.push(e));
  t.moveColumn('name', 1);
  assert.deepEqual(events, []);
  assert.deepEqual(t.columnOrder(), ['id', 'name', 'email']);
});

test('a press that barely moves is still a click, not a drag', () => {
  const { t } = mount({ reorder: true, sort: 'client' });
  mouse(th(t, 'email'), 'mousedown', 0);
  mouse(th(t, 'id'), 'mousemove', 2);            // inside the 4px threshold
  assert.equal(t.el.querySelectorAll('.vt-th-dragging').length, 0);
  mouse(th(t, 'id'), 'mouseup', 2);
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email']);
  th(t, 'email').click();
  assert.equal(t.state.sort, 'email', 'the click survived');
});

test('a drag released away from any header moves nothing but still eats the click', () => {
  const { t } = mount({ reorder: true, sort: 'client' });
  mouse(th(t, 'email'), 'mousedown', 0);
  mouse(t.el.querySelector('tbody td'), 'mousemove', 50);   // over the body
  mouse(t.el.querySelector('tbody td'), 'mouseup', 50);
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email']);
  th(t, 'email').click();
  assert.equal(t.state.sort, null, 'the drag release was swallowed');
});

test('a drag over a header of another table is ignored', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const a = new Vantable('#a', { columns: COLUMNS.map((c) => ({ ...c })), data: DATA, reorder: true });
  const b = new Vantable('#b', { columns: COLUMNS.map((c) => ({ ...c })), data: DATA, reorder: true });
  mouse(th(a, 'email'), 'mousedown', 0);
  mouse(th(b, 'id'), 'mousemove', 100);
  assert.equal(b.el.querySelectorAll('.vt-drop-target').length, 0, 'the other table is not a drop target');
  mouse(th(b, 'id'), 'mouseup', 100);
  assert.deepEqual(heads(a), ['ID', 'Name', 'Email']);
  assert.deepEqual(heads(b), ['ID', 'Name', 'Email']);
  assert.ok(env.dom);
});

test('a drag with a target that has no closest() is ignored', () => {
  const { t, env } = mount({ reorder: true });
  mouse(th(t, 'email'), 'mousedown', 0);
  mouse(env.window.document, 'mousemove', 100);   // the document has no closest()
  mouse(env.window.document, 'mouseup', 100);
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email']);
});

test('the column menu starts with a hidden column unchecked', () => {
  const { t } = mount({
    columnPicker: true,
    columns: COLUMNS.map((c) => (c.key === 'email' ? { ...c, hidden: true } : { ...c }))
  });
  const state = [...t.el.querySelectorAll('.vt-col-toggle')].map((b) => [b.getAttribute('data-key'), b.checked]);
  assert.deepEqual(state, [['id', true], ['name', true], ['email', false]]);
});

test('setColumnState skips empty entries', () => {
  const { t } = mount();
  t.setColumnState([null, undefined, { key: 'email' }]);
  assert.deepEqual(t.columnOrder(), ['email', 'id', 'name']);
});

test('the layout helpers tolerate a missing header row', () => {
  const { t } = mount({ resize: true, columns: [{ key: 'id', label: 'ID', pin: 'left' }] });
  t.$thead.innerHTML = '';
  t._applyColumnWidths();
  t._applyPinOffsets();
  t._freezeAutoWidths();
  assert.equal(t.$thead.innerHTML, '', 'nothing was rendered, nothing threw');
});

test('pin offsets tolerate a row with fewer cells than columns', () => {
  const { t } = mount({
    columns: [
      { key: 'id', label: 'ID', width: '60px', pin: 'left' },
      { key: 'name', label: 'Name', width: '80px' },
      { key: 'email', label: 'Email', width: '90px', pin: 'right' }
    ]
  });
  const row = t.el.querySelector('tbody tr.vt-tr');
  row.removeChild(row.lastElementChild);
  row.removeChild(row.lastElementChild);
  t._applyPinOffsets();
  assert.equal(row.children[0].style.left, '0px');
});

test('the column menu helpers are inert without a menu', () => {
  const { t } = mount();
  t._toggleColsMenu();            // no picker, so no menu
  t._syncColsMenu();
  t.$toolbar = null;
  t._toggleColsMenu(true);
  t._syncColsMenu();
  assert.equal(t.el.querySelectorAll('.vt-cols-menu').length, 0);
});

test('a resize that cannot resolve its column or header is ignored', () => {
  const { t, env } = mount({ resize: true });
  const loose = env.window.document.createElement('span');
  t._startResize({ target: loose, clientX: 0 }, 'id');      // target outside any th
  t._startResize({ target: th(t, 'id'), clientX: 0 }, 'gone');  // unknown column
  assert.equal(t.el.classList.contains('vt-resizing'), false, 'no drag was started');
});

test('a table with no columns has nothing to freeze', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', { resize: true, columns: [], data: [] });
  t._freezeAutoWidths();
  assert.equal(t._widthsFrozen, undefined, 'an empty table never latches');
  assert.ok(env.dom);
});

test('freezing tolerates a header with fewer cells than columns', () => {
  const { t } = mount({ resize: true });
  const tr = t.$thead.querySelector('tr');
  tr.removeChild(tr.lastElementChild);
  t._freezeAutoWidths();
  assert.equal(t._widthsFrozen, undefined);
});

test('a resize whose event target has no closest() is ignored', () => {
  const { t } = mount({ resize: true });
  t._startResize({ target: {}, clientX: 0 }, 'id');
  assert.equal(t.el.classList.contains('vt-resizing'), false);
});

test('a drag on a column with no width at all starts from the minimum', () => {
  const { t } = mount({ resize: true, minColWidth: 60 });
  assert.equal(t._colById('name').width, undefined);
  mouse(th(t, 'name').querySelector('.vt-resizer'), 'mousedown', 0);
  mouse(t.el.ownerDocument, 'mousemove', 15);     // 60 (floor) + 15
  mouse(t.el.ownerDocument, 'mouseup', 15);
  assert.equal(t._colById('name').width, '75px');
});

test('columnState reports a null width for a column that has none', () => {
  const { t } = mount();
  assert.deepEqual(t.columnState(), [
    { key: 'id', hidden: false, width: null, pin: null },
    { key: 'name', hidden: false, width: null, pin: null },
    { key: 'email', hidden: false, width: null, pin: null }
  ]);
});

test('width capture accounts for the accordion handle column', () => {
  const { t } = mount({ resize: true, accordion: { columns: ['email'] } });
  [...t.el.querySelectorAll('thead th')].forEach((h, i) => fakeWidth(h, i === 0 ? 34 : 110));
  t.refresh();
  assert.deepEqual(t.columns.map((c) => c.width), ['110px', '110px', '110px'],
    'the handle is skipped, the data columns line up');
  assert.equal(t._widthsFrozen, true);
});

test('a pinned column with no width and no geometry gets a zero offset', () => {
  const { t } = mount({
    columns: [{ key: 'id', label: 'ID', pin: 'left' }, { key: 'name', label: 'Name', pin: 'left' }]
  });
  assert.equal(th(t, 'id').style.left, '0px');
  assert.equal(th(t, 'name').style.left, '0px', 'nothing measurable to stack behind');
});
