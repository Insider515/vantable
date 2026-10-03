// Row-action dropdown tests: the trigger, opening and closing, running an
// action from the menu, the keyboard, and the inline fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];
/** The standard actions column: edit + two custom + remove. */
const ACTIONS = (extra) => Object.assign({
  label: 'Actions', type: 'actions',
  edit: { enabled: true },
  custom: [{ label: 'Ping' }, { label: 'Restart' }],
  remove: { enabled: true }
}, extra || {});

/** Mount a table whose last column is the actions column. */
function mount(actions, options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, actions || ACTIONS()],
    data: DATA.map((r) => ({ ...r }))
  }, options || {}));
  return { env, Vantable, t };
}

/** The trigger of a row. */
const trigger = (t, id) => t.el.querySelector(`tr.vt-tr[data-id="${id}"] .vt-act-trigger`);
/** The menu of a row. */
const menu = (t, id) => t.el.querySelector(`tr.vt-tr[data-id="${id}"] .vt-act-menu`);
/** Is that row's menu open? */
const isOpen = (t, id) => !menu(t, id).hasAttribute('hidden');
/** The labels in a row's menu. */
const items = (t, id) => [...menu(t, id).querySelectorAll('.vt-act-item')];

test('a row shows one trigger, with the actions hidden behind it', () => {
  const { t } = mount();
  const td = t.el.querySelector('tr.vt-tr td:last-child');
  assert.equal(td.querySelectorAll('.vt-act-trigger').length, 1);
  assert.equal(td.querySelectorAll('.vt-btn').length, 1, 'no row of buttons any more');
  const btn = trigger(t, 1);
  assert.equal(btn.getAttribute('aria-haspopup'), 'menu');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(btn.getAttribute('aria-label'), 'Actions');
  assert.match(btn.textContent, /☰/);
  assert.equal(menu(t, 1).getAttribute('role'), 'menu');
  assert.ok(menu(t, 1).hasAttribute('hidden'));
  assert.deepEqual(items(t, 1).map((b) => b.textContent), ['Edit', 'Ping', 'Restart', 'Delete']);
  assert.deepEqual(items(t, 1).map((b) => b.getAttribute('role')), ['menuitem', 'menuitem', 'menuitem', 'menuitem']);
});

test('four actions fit, however narrow the column is', () => {
  const { t } = mount(ACTIONS({ custom: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }] }));
  assert.equal(items(t, 1).length, 7, 'edit + five custom + delete');
  assert.equal(t.el.querySelectorAll('tr.vt-tr[data-id="1"] td:last-child .vt-btn').length, 1,
    'still a single button in the cell');
});

test('the trigger opens and closes the menu and focuses the first item', () => {
  const { t, env } = mount();
  trigger(t, 1).click();
  assert.equal(isOpen(t, 1), true);
  assert.equal(trigger(t, 1).getAttribute('aria-expanded'), 'true');
  assert.equal(env.window.document.activeElement, items(t, 1)[0]);
  trigger(t, 1).click();
  assert.equal(isOpen(t, 1), false);
  assert.equal(trigger(t, 1).getAttribute('aria-expanded'), 'false');
});

test('only one row menu is open at a time', () => {
  const { t } = mount();
  trigger(t, 1).click();
  trigger(t, 2).click();
  assert.equal(isOpen(t, 1), false);
  assert.equal(isOpen(t, 2), true);
});

test('a click elsewhere in the table closes the menu', () => {
  const { t } = mount();
  trigger(t, 1).click();
  t.el.querySelector('tr.vt-tr td').click();
  assert.equal(isOpen(t, 1), false);
});

test('a click outside the table closes the menu', () => {
  const { t, env } = mount();
  trigger(t, 1).click();
  env.window.document.body.click();
  assert.equal(isOpen(t, 1), false);
});

test('picking a custom action runs it and closes the menu', () => {
  const calls = [];
  const { t } = mount(ACTIONS({ custom: [{ label: 'Ping', onClick: (r) => calls.push(r.id) }, { label: 'Restart' }] }));
  const events = [];
  t.on('action', (e) => events.push(e.index));
  trigger(t, 2).click();
  items(t, 2)[1].click();              // Ping is index 0 of custom, after Edit
  assert.deepEqual(calls, [2]);
  assert.deepEqual(events, [0]);
  assert.equal(isOpen(t, 2), false, 'the menu closed behind it');
});

test('picking Edit switches the row to inline editing with plain buttons', () => {
  const { t } = mount(ACTIONS(), { editable: true, columns: undefined });
  const full = mount(ACTIONS(), { editable: true });
  const tt = full.t;
  tt.columns[1].editable = true;
  tt.refresh();
  trigger(tt, 1).click();
  items(tt, 1)[0].click();             // Edit
  const row = tt.el.querySelector('tr.vt-tr[data-id="1"]');
  assert.ok(row.querySelector('input[data-edit="name"]'), 'the editors are there');
  assert.equal(row.querySelector('.vt-act-trigger'), null, 'no dropdown while editing');
  assert.deepEqual([...row.querySelectorAll('[data-act]')].map((b) => b.getAttribute('data-act')), ['save', 'cancel']);
  assert.ok(t);
});

test('picking Delete opens the confirmation modal', () => {
  const { t, env } = mount();
  trigger(t, 1).click();
  items(t, 1).at(-1).click();
  assert.ok(env.window.document.querySelector('.vt-modal-overlay'), 'the modal is up');
  assert.equal(env.window.document.querySelector('.vt-modal-body').textContent, t.labels.confirmRemove);
});

test('Escape closes the menu and puts focus back on the trigger', () => {
  const { t, env } = mount();
  trigger(t, 1).click();
  const first = items(t, 1)[0];
  first.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(isOpen(t, 1), false);
  assert.equal(env.window.document.activeElement, trigger(t, 1));
});

test('the arrows walk the menu and wrap around', () => {
  const { t, env } = mount();
  trigger(t, 1).click();
  const list = items(t, 1);
  const press = (key) => env.window.document.activeElement
    .dispatchEvent(new env.window.KeyboardEvent('keydown', { key, bubbles: true }));
  assert.equal(env.window.document.activeElement, list[0]);
  press('ArrowDown');
  assert.equal(env.window.document.activeElement, list[1]);
  press('ArrowUp');
  assert.equal(env.window.document.activeElement, list[0]);
  press('ArrowUp');
  assert.equal(env.window.document.activeElement, list.at(-1), 'wraps to the end');
  press('ArrowDown');
  assert.equal(env.window.document.activeElement, list[0], 'and back to the start');
});

test('the arrows inside a menu do not move the grid focus', () => {
  const { t, env } = mount();
  trigger(t, 1).click();
  env.window.document.activeElement
    .dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.ok(env.window.document.activeElement.classList.contains('vt-act-item'));
  assert.equal(t.el.querySelectorAll('td[tabindex="0"], th[tabindex="0"]').length, 1, 'the roving cell is untouched');
});

test('the trigger can be relabelled and given another icon', () => {
  const { t } = mount(ACTIONS({ menu: { icon: '⋯', label: 'Действия' } }));
  assert.equal(trigger(t, 1).textContent, '⋯');
  assert.equal(trigger(t, 1).getAttribute('aria-label'), 'Действия');
});

test('the trigger name follows the actions label', () => {
  const { t } = mount(ACTIONS(), { labels: { actions: 'Действия' } });
  assert.equal(trigger(t, 1).getAttribute('aria-label'), 'Действия');
});

test('options.actions supplies the callbacks behind a column that has the items', () => {
  // Two hosts: the instances must not share one element, or both of their
  // delegated listeners would answer the same click.
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const calls = [];
  const bare = new Vantable('#a', {
    columns: [{ key: 'id', label: 'ID' }, { label: 'Act', type: 'actions' }],
    data: DATA.map((r) => ({ ...r })),
    actions: { custom: [{ label: 'Ping', onClick: (r) => calls.push(r.id) }] }
  });
  assert.equal(bare.el.querySelector('.vt-act-trigger'), null,
    'the column declares no items, so there is nothing to put in a menu');

  const withItems = new Vantable('#b', {
    columns: [{ key: 'id', label: 'ID' }, { label: 'Act', type: 'actions', custom: [{ label: 'Ping' }] }],
    data: DATA.map((r) => ({ ...r })),
    actions: { custom: [{ label: 'ignored', onClick: (r) => calls.push(r.id) }] }
  });
  trigger(withItems, 1).click();
  items(withItems, 1)[0].click();
  assert.deepEqual(calls, [1], 'the callback comes from options.actions');
  assert.ok(env.dom);
});

test('a column with no actions configured renders nothing', () => {
  const { t } = mount({ label: 'Act', type: 'actions' });
  const td = t.el.querySelector('tr.vt-tr td:last-child');
  assert.equal(td.querySelector('.vt-act-trigger'), null);
  assert.equal(td.querySelector('button'), null);
  assert.equal(td.querySelector('.vt-actions').innerHTML, '');
});

test('the menu flips above the trigger when it would fall out of the box', () => {
  const { t } = mount();
  const box = menu(t, 1);
  t.$scroll.getBoundingClientRect = () => ({ bottom: 300 });
  box.getBoundingClientRect = () => ({ bottom: 480 });
  trigger(t, 1).click();
  assert.ok(box.classList.contains('vt-act-menu-up'), 'opened upwards');
  trigger(t, 1).click();
  assert.equal(box.classList.contains('vt-act-menu-up'), false, 'and the class is dropped on close');
});

test('the menu stays below when there is room', () => {
  const { t } = mount();
  const box = menu(t, 1);
  t.$scroll.getBoundingClientRect = () => ({ bottom: 500 });
  box.getBoundingClientRect = () => ({ bottom: 200 });
  trigger(t, 1).click();
  assert.equal(box.classList.contains('vt-act-menu-up'), false);
});

test('the dropdown works inside the responsive card mode', async () => {
  const { t, env } = mount(ACTIONS(), { responsive: { breakpoint: 640 } });
  Object.defineProperty(t.el, 'clientWidth', { get: () => 400, configurable: true });
  env.window.dispatchEvent(new env.window.Event('resize'));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(t.isStacked(), true);
  trigger(t, 1).click();
  assert.equal(isOpen(t, 1), true);
  assert.equal(items(t, 1).length, 4);
});

test('toggling a menu that is not there is a no-op', () => {
  const { t, env } = mount();
  const loose = env.window.document.createElement('button');   // no parent, no menu
  t._toggleActMenu(loose);
  assert.equal(loose.getAttribute('aria-expanded'), null);
  const cell = t.el.querySelector('tr.vt-tr td');              // a cell without a menu
  t._toggleActMenu(cell.appendChild(env.window.document.createElement('button')));
  assert.equal(t.el.querySelectorAll('.vt-act-menu:not([hidden])').length, 0);
});

test('a key event from a target without closest() is ignored', () => {
  const { t, env } = mount();
  // The document is a legal event target but has no closest().
  env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  t.$table.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(t.el.querySelectorAll('.vt-act-menu:not([hidden])').length, 0);
});
