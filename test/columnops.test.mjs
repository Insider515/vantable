// Column-operation tests: resize, reorder, pin/freeze, show/hide (incl. the
// column menu), the sticky header and the layout snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number', width: '60px' },
  { key: 'name', label: 'Name', width: '140px' },
  { key: 'email', label: 'Email', width: '200px' },
  { key: 'city', label: 'City', width: '100px' }
];
const DATA = [
  { id: 1, name: 'Ann', email: 'a@x.io', city: 'Berlin' },
  { id: 2, name: 'Bob', email: 'b@x.io', city: 'Chicago' }
];

/** Mount with the shared fixture (columns are copied per test). */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    data: DATA.map((r) => ({ ...r }))
  }, options || {}));
  return { env, Vantable, t };
}

/** Header labels in render order. */
const heads = (t) => [...t.el.querySelectorAll('thead th')].map((th) => th.textContent.trim());
/** The header cell of a column. */
const th = (t, key) => t.el.querySelector(`thead th[data-key="${key}"]`);
/** Dispatch a mouse event with a pointer position (el may be the document). */
function mouse(el, type, clientX) {
  const win = el.ownerDocument ? el.ownerDocument.defaultView : el.defaultView;
  el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}
/** Drive a resize drag on a column: press, move to `toX`, release. */
function dragResize(t, key, toX) {
  const handle = th(t, key).querySelector('.vt-resizer');
  assert.ok(handle, `column ${key} has a resize handle`);
  mouse(handle, 'mousedown', 0);
  mouse(t.el.ownerDocument, 'mousemove', toX);
  mouse(t.el.ownerDocument, 'mouseup', toX);
}
/** Drive a reorder drag: press on `from`, move over `to`, release there. */
function dragMove(t, fromKey, toKey) {
  const src = th(t, fromKey);
  mouse(src, 'mousedown', 0);
  mouse(th(t, toKey), 'mousemove', 200);
  mouse(th(t, toKey), 'mouseup', 200);
}

/* ------------------------------------------------------------------ resize */

test('resize handles appear only when resizing is enabled', () => {
  assert.equal(mount().t.el.querySelectorAll('.vt-resizer').length, 0, 'off by default');
  const { t } = mount({ resize: true });
  assert.equal(t.el.querySelectorAll('.vt-resizer').length, 4);
  const opted = mount({ resize: true, columns: COLUMNS.map((c) => (c.key === 'id' ? { ...c, resizable: false } : { ...c })) }).t;
  assert.equal(opted.el.querySelectorAll('.vt-resizer').length, 3);
  assert.equal(th(opted, 'id').querySelector('.vt-resizer'), null);
});

test('dragging the handle widens the column and reports the new width', () => {
  const { t } = mount({ resize: true });
  const events = [];
  t.on('columnResize', (e) => events.push(e));
  dragResize(t, 'name', 45);                       // 140px start + 45px
  assert.equal(t._colById('name').width, '185px');
  assert.equal(th(t, 'name').style.width, '185px');
  assert.deepEqual(events, [{ key: 'name', width: 185 }]);
});

test('a column cannot be dragged below the minimum width', () => {
  const { t } = mount({ resize: true, minColWidth: 70 });
  dragResize(t, 'name', -400);
  assert.equal(t._colById('name').width, '70px');
  const dflt = mount({ resize: true }).t;
  dragResize(dflt, 'name', -400);
  assert.equal(dflt._colById('name').width, '48px', 'the default floor is 48px');
});

test('the click that ends a resize drag does not sort the column', () => {
  const { t } = mount({ resize: true });
  dragResize(t, 'name', 20);
  th(t, 'name').click();                           // the browser's click after mouseup
  assert.equal(t.state.sort, null, 'the drag release was swallowed');
  th(t, 'name').click();                           // a real click still sorts
  assert.equal(t.state.sort, 'name');
});

test('setColumnWidth accepts px numbers and CSS lengths', () => {
  const { t } = mount({ resize: true });
  const events = [];
  t.on('columnResize', (e) => events.push(e));
  t.setColumnWidth('name', 220);
  assert.equal(th(t, 'name').style.width, '220px');
  t.setColumnWidth('email', '12rem');
  assert.equal(th(t, 'email').getAttribute('style'), 'width:12rem');
  assert.deepEqual(events.map((e) => e.key), ['name', 'email']);
  assert.equal(t.setColumnWidth('nope', 10), t, 'an unknown key is a no-op');
});

/* ----------------------------------------------------------------- reorder */

test('headers are only draggable when reordering is enabled', () => {
  assert.equal(mount().t.el.querySelectorAll('th[data-move]').length, 0);
  const { t } = mount({ reorder: true });
  assert.equal(t.el.querySelectorAll('th[data-move]').length, 4);
  const opted = mount({ reorder: true, columns: COLUMNS.map((c) => (c.key === 'id' ? { ...c, reorderable: false } : { ...c })) }).t;
  assert.equal(th(opted, 'id').hasAttribute('data-move'), false);
});

test('dragging a header onto another one moves the column there', () => {
  const { t } = mount({ reorder: true });
  const events = [];
  t.on('columnMove', (e) => events.push(e));
  dragMove(t, 'email', 'id');
  assert.deepEqual(heads(t), ['Email', 'ID', 'Name', 'City']);
  assert.deepEqual(events, [{ key: 'email', from: 2, to: 0, order: ['email', 'id', 'name', 'city'] }]);
  const firstCell = t.el.querySelector('tbody tr.vt-tr td').textContent;
  assert.equal(firstCell, 'a@x.io', 'the body follows the header');
});

test('a plain click on a draggable header still sorts', () => {
  const { t } = mount({ reorder: true, sort: 'client' });
  const src = th(t, 'name');
  mouse(src, 'mousedown', 0);
  mouse(t.el.ownerDocument, 'mouseup', 0);          // released without moving
  th(t, 'name').click();
  assert.equal(t.state.sort, 'name');
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email', 'City'], 'nothing moved');
});

test('dragging a header onto itself changes nothing', () => {
  const { t } = mount({ reorder: true });
  const events = [];
  t.on('columnMove', (e) => events.push(e));
  dragMove(t, 'name', 'name');
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email', 'City']);
  assert.deepEqual(events, []);
});

test('the drop target is marked during the drag and cleared afterwards', () => {
  const { t } = mount({ reorder: true });
  mouse(th(t, 'email'), 'mousedown', 0);
  mouse(th(t, 'id'), 'mousemove', 200);
  assert.ok(th(t, 'email').classList.contains('vt-th-dragging'));
  assert.ok(th(t, 'id').classList.contains('vt-drop-target'));
  mouse(th(t, 'id'), 'mouseup', 200);
  assert.equal(t.el.querySelectorAll('.vt-drop-target, .vt-th-dragging').length, 0);
});

test('moveColumn clamps the index and ignores unknown keys', () => {
  const { t } = mount();
  t.moveColumn('id', 99);
  assert.deepEqual(t.columnOrder(), ['name', 'email', 'city', 'id']);
  t.moveColumn('id', -5);
  assert.deepEqual(t.columnOrder(), ['id', 'name', 'email', 'city']);
  assert.equal(t.moveColumn('nope', 0), t);
  assert.deepEqual(t.columnOrder(), ['id', 'name', 'email', 'city']);
});

/* --------------------------------------------------------------- pin/freeze */

test('pinned columns are rendered at the edges in their own group', () => {
  const { t } = mount({
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email', pin: 'right' },
      { key: 'city', label: 'City', pin: 'left' }
    ]
  });
  assert.deepEqual(heads(t), ['City', 'ID', 'Name', 'Email']);
  assert.ok(th(t, 'city').classList.contains('vt-pin-left'));
  assert.ok(th(t, 'email').classList.contains('vt-pin-right'));
  const cells = [...t.el.querySelectorAll('tbody tr.vt-tr:first-child td')];
  assert.equal(cells[0].textContent, 'Berlin');
  assert.ok(cells[0].classList.contains('vt-pin-left'));
  assert.ok(cells.at(-1).classList.contains('vt-pin-right'));
});

test('pinColumn pins, repins and unpins, reporting each change', () => {
  const { t } = mount();
  const events = [];
  t.on('columnPin', (e) => events.push(e));
  t.pinColumn('city', 'left');
  assert.deepEqual(heads(t), ['City', 'ID', 'Name', 'Email']);
  t.pinColumn('city', 'right');
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email', 'City']);
  t.pinColumn('city', false);
  assert.equal(th(t, 'city').classList.contains('vt-pin-right'), false);
  t.pinColumn('id', 'middle');
  assert.equal(t._colById('id').pin, null, 'an unknown side unpins');
  assert.deepEqual(events.map((e) => e.pin), ['left', 'right', null, null]);
  assert.equal(t.pinColumn('nope', 'left'), t);
});

test('left and right pins get stacked sticky offsets', () => {
  const { t } = mount({
    columns: [
      { key: 'id', label: 'ID', width: '60px', pin: 'left' },
      { key: 'name', label: 'Name', width: '140px', pin: 'left' },
      { key: 'email', label: 'Email', width: '200px' },
      { key: 'city', label: 'City', width: '100px', pin: 'right' }
    ]
  });
  assert.equal(th(t, 'id').style.left, '0px');
  assert.equal(th(t, 'name').style.left, '60px', 'stacked behind the first pin');
  assert.equal(th(t, 'email').style.left, '');
  assert.equal(th(t, 'city').style.right, '0px');
  const row = t.el.querySelector('tbody tr.vt-tr');
  assert.equal(row.children[1].style.left, '60px', 'body cells get the same offsets');
  assert.equal(row.children[3].style.right, '0px');
});

test('a resize re-stacks the offsets of the pins behind it', () => {
  const { t } = mount({
    resize: true,
    columns: [
      { key: 'id', label: 'ID', width: '60px', pin: 'left' },
      { key: 'name', label: 'Name', width: '140px', pin: 'left' },
      { key: 'email', label: 'Email', width: '200px' }
    ]
  });
  dragResize(t, 'id', 40);
  assert.equal(t._colById('id').width, '100px');
  assert.equal(th(t, 'name').style.left, '100px');
});

test('the accordion handle sticks too when a column is pinned left', () => {
  const { t } = mount({ accordion: { columns: ['email'] } });
  const handle = () => t.el.querySelector('thead th.vt-th-expander');
  assert.equal(handle().classList.contains('vt-pin-left'), false);
  t.pinColumn('id', 'left');
  assert.ok(handle().classList.contains('vt-pin-left'), 'otherwise pins would scroll over it');
  assert.equal(handle().style.left, '0px');
  assert.equal(th(t, 'id').style.left, '34px', 'offset by the handle width');
  t.pinColumn('id', false);
  assert.equal(handle().classList.contains('vt-pin-left'), false);
});

/* -------------------------------------------------------------- show / hide */

test('a column marked hidden is not rendered and not exported', async () => {
  const { t, env } = mount({
    columns: COLUMNS.map((c) => (c.key === 'email' ? { ...c, hidden: true } : { ...c })),
    export: { formats: ['csv'], filename: 'visible' }
  });
  assert.deepEqual(heads(t), ['ID', 'Name', 'City']);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr:first-child td').length, 3);
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-colcount'), '3');
  assert.deepEqual(t._buildPayload('xlsx').columns.map((c) => c.key), ['id', 'name', 'city']);
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await new Promise((r) => setTimeout(r, 0));
  const csv = (await blobBytes(env.blobs.at(-1))).toString('utf8').slice(1);
  assert.equal(csv.split('\r\n')[0], 'ID,Name,City');
});

test('hidden columns still take part in the search', () => {
  const { t } = mount({ columns: COLUMNS.map((c) => (c.key === 'city' ? { ...c, hidden: true } : { ...c })), search: 'live' });
  t.state.q = 'chicago';
  t.refresh();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1, 'the data is still there to match');
});

test('hideColumn / showColumn / toggleColumn report every change', () => {
  const { t } = mount();
  const events = [];
  t.on('columnVisibility', (e) => events.push(e));
  t.hideColumn('email');
  assert.deepEqual(heads(t), ['ID', 'Name', 'City']);
  t.showColumn('email');
  assert.deepEqual(heads(t), ['ID', 'Name', 'Email', 'City']);
  t.toggleColumn('name');
  assert.deepEqual(heads(t), ['ID', 'Email', 'City'], 'no argument flips it');
  t.toggleColumn('name');
  assert.deepEqual(events, [
    { key: 'email', hidden: true }, { key: 'email', hidden: false },
    { key: 'name', hidden: true }, { key: 'name', hidden: false }
  ]);
  assert.equal(t.toggleColumn('nope'), t);
});

test('the empty row spans only the visible columns', () => {
  const { t } = mount({ data: [], columns: COLUMNS.map((c) => (c.key === 'email' ? { ...c, hidden: true } : { ...c })) });
  assert.equal(t.el.querySelector('tr.vt-empty td').getAttribute('colspan'), '3');
});

test('the column menu lists the columns and toggles them', () => {
  const { t, env } = mount({ columnPicker: true });
  const menu = () => t.el.querySelector('.vt-cols-menu');
  const btn = t.el.querySelector('.vt-cols-btn');
  assert.equal(btn.textContent, 'Columns');
  assert.ok(menu().hasAttribute('hidden'), 'closed to begin with');
  assert.deepEqual([...t.el.querySelectorAll('.vt-col-opt')].map((l) => l.textContent.trim()), ['ID', 'Name', 'Email', 'City']);
  btn.click();
  assert.equal(menu().hasAttribute('hidden'), false);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');

  const box = t.el.querySelector('.vt-col-toggle[data-key="email"]');
  assert.equal(box.checked, true);
  box.checked = false;
  box.dispatchEvent(new env.window.Event('change', { bubbles: true }));
  assert.deepEqual(heads(t), ['ID', 'Name', 'City']);
  assert.equal(menu().hasAttribute('hidden'), false, 'the menu stays open while you work in it');

  btn.click();
  assert.ok(menu().hasAttribute('hidden'), 'the button closes it again');
});

test('a click outside closes the column menu, and destroy() detaches that listener', () => {
  const { t, env } = mount({ columnPicker: true });
  const menu = () => t.el.querySelector('.vt-cols-menu');
  t.el.querySelector('.vt-cols-btn').click();
  assert.equal(menu().hasAttribute('hidden'), false);
  env.window.document.body.click();
  assert.ok(menu().hasAttribute('hidden'), 'closed by the outside click');
  assert.equal(typeof t._onDocClick, 'function');
  t.destroy();
  env.window.document.body.click();               // must not throw on a dead table
});

test('a programmatic hide keeps the menu checkboxes in step', () => {
  const { t } = mount({ columnPicker: true });
  t.hideColumn('city');
  assert.equal(t.el.querySelector('.vt-col-toggle[data-key="city"]').checked, false);
  t.showColumn('city');
  assert.equal(t.el.querySelector('.vt-col-toggle[data-key="city"]').checked, true);
});

test('the menu also covers columns that have no data key', () => {
  const { t } = mount({ columnPicker: true, columns: [{ key: 'id', label: 'ID' }, { label: 'Act', type: 'actions', edit: { enabled: true } }] });
  const box = t.el.querySelector('.vt-col-toggle[data-key="col1"]');
  assert.ok(box, 'the actions column is addressable by its generated id');
  t.hideColumn('col1');
  assert.deepEqual(heads(t), ['ID']);
  assert.equal(box.checked, false);
});

/* ------------------------------------------------------------ sticky header */

test('stickyHeader marks the root and maxHeight bounds the scroll box', () => {
  assert.equal(mount().t.el.classList.contains('vt-sticky-head'), false);
  const { t } = mount({ stickyHeader: true, maxHeight: 320 });
  assert.ok(t.el.classList.contains('vt-sticky-head'));
  assert.equal(t.el.querySelector('.vt-scroll').style.maxHeight, '320px');
  assert.equal(mount({ maxHeight: '50vh' }).t.el.querySelector('.vt-scroll').style.maxHeight, '50vh');
  assert.ok(loadVantable().css.includes('.vt-sticky-head .vt-th{position:sticky'), 'the shipped CSS carries the rule');
});

/* ------------------------------------------------------------- layout state */

test('columnState captures the layout and setColumnState restores it', () => {
  const { t, Vantable, env } = mount({ resize: true });
  t.pinColumn('city', 'left');
  t.hideColumn('email');
  t.setColumnWidth('name', 180);
  t.moveColumn('id', 1);
  const saved = t.columnState();
  assert.deepEqual(saved, [
    { key: 'name', hidden: false, width: '180px', pin: null },
    { key: 'id', hidden: false, width: '60px', pin: null },
    { key: 'email', hidden: true, width: '200px', pin: null },
    { key: 'city', hidden: false, width: '100px', pin: 'left' }
  ]);

  const fresh = new Vantable(env.window.document.getElementById('host'), {
    columns: COLUMNS.map((c) => ({ ...c })),
    data: DATA.map((r) => ({ ...r }))
  });
  fresh.setColumnState(saved);
  assert.deepEqual(fresh.columnOrder(), ['name', 'id', 'email', 'city']);
  assert.deepEqual(heads(fresh), ['City', 'Name', 'ID'], 'hidden stays out, the pin leads');
  assert.equal(fresh._colById('name').width, '180px');
  assert.equal(fresh._colById('city').pin, 'left');
});

test('setColumnState ignores unknown keys and keeps the rest in order', () => {
  const { t } = mount();
  t.setColumnState([{ key: 'ghost' }, { key: 'city' }, { key: 'city' }]);
  assert.deepEqual(t.columnOrder(), ['city', 'id', 'name', 'email'], 'listed first, then the rest');
  assert.equal(t.setColumnState(), t, 'no argument is a no-op');
  assert.deepEqual(t.columnOrder(), ['city', 'id', 'name', 'email']);
});

test('a partial snapshot only applies the fields it carries', () => {
  const { t } = mount();
  t.pinColumn('id', 'left');
  t.setColumnState([{ key: 'id' }]);
  assert.equal(t._colById('id').pin, 'left', 'untouched by a snapshot without `pin`');
  t.setColumnState([{ key: 'id', pin: null, width: 0 }]);
  assert.equal(t._colById('id').pin, null);
  assert.equal(t._colById('id').width, null);
});

test('the column operations survive a sort and a page change', () => {
  const { t } = mount({ sort: 'client', pagination: { perPage: 1, options: [1] } });
  t.pinColumn('city', 'left');
  t.hideColumn('email');
  t.el.querySelector('thead th[data-sort="name"]').click();
  assert.deepEqual(heads(t), ['City', 'ID', 'Name']);
  t.el.querySelector('.vt-next').click();
  assert.deepEqual(heads(t), ['City', 'ID', 'Name']);
  assert.equal(t.el.querySelector('tbody tr.vt-tr td').textContent, 'Chicago');
});
