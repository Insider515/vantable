// Keyboard-grid tests: the WAI-ARIA grid pattern — roving tabindex, arrows,
// Home/End, PageUp/PageDown, Enter/Space activation and cell interaction mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name' },
  { key: 'site', label: 'Site', type: 'link', href: () => '/go' }
];
const DATA = [
  { id: 1, name: 'Ann', site: 'ann' },
  { id: 2, name: 'Bob', site: 'bob' },
  { id: 3, name: 'Carl', site: 'carl' }
];

/** Mount a keyboard-navigable table. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: DATA.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t };
}

/** Send a bubbling keydown from the currently focused element. */
function press(env, k, init) {
  const el = env.window.document.activeElement;
  el.dispatchEvent(new env.window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, init)));
  return env.window.document.activeElement;
}

/** Text of the focused cell. */
const focusedText = (env) => env.window.document.activeElement.textContent.trim();

test('every cell is reachable with the arrow keys', () => {
  const { t, env } = mount();
  t.el.querySelector('thead th').focus();
  assert.equal(focusedText(env), 'ID');
  press(env, 'ArrowRight');
  assert.equal(focusedText(env), 'Name');
  press(env, 'ArrowDown');
  assert.equal(focusedText(env), 'Ann');
  press(env, 'ArrowDown');
  assert.equal(focusedText(env), 'Bob');
  press(env, 'ArrowUp');
  assert.equal(focusedText(env), 'Ann');
  press(env, 'ArrowLeft');
  assert.equal(focusedText(env), '1');
});

test('focus is clamped at the edges of the grid', () => {
  const { t, env } = mount();
  t.el.querySelector('thead th').focus();
  press(env, 'ArrowUp');
  assert.equal(focusedText(env), 'ID', 'cannot leave the header upwards');
  press(env, 'ArrowLeft');
  assert.equal(focusedText(env), 'ID', 'cannot leave the first column');
  press(env, 'End');
  assert.equal(focusedText(env), 'Site', 'End goes to the last column');
  press(env, 'ArrowRight');
  assert.equal(focusedText(env), 'Site', 'cannot pass the last column');
  press(env, 'Home');
  assert.equal(focusedText(env), 'ID', 'Home goes back to the first column');
});

test('Ctrl/Cmd + Home and End jump to the first and last cell', () => {
  const { t, env } = mount();
  t.el.querySelector('thead th').focus();
  press(env, 'ArrowDown');
  press(env, 'End', { ctrlKey: true });
  const last = env.window.document.activeElement;
  assert.equal(last.closest('tr').getAttribute('data-id'), '3');
  assert.equal(last.cellIndex, 2, 'last column');
  press(env, 'Home', { ctrlKey: true });
  assert.equal(env.window.document.activeElement.tagName, 'TH');
  assert.equal(focusedText(env), 'ID');
  press(env, 'End', { metaKey: true });
  assert.equal(env.window.document.activeElement.closest('tr').getAttribute('data-id'), '3', 'Cmd works like Ctrl');
});

test('exactly one cell carries tabindex=0 (roving tabindex)', () => {
  const { t, env } = mount();
  const zeros = () => [...t.el.querySelectorAll('th[tabindex="0"], td[tabindex="0"]')];
  assert.equal(zeros().length, 1);
  assert.equal(zeros()[0].textContent.trim(), 'ID');
  t.el.querySelector('thead th').focus();
  press(env, 'ArrowDown');   // straight down from the ID header
  const after = zeros();
  assert.equal(after.length, 1);
  assert.equal(after[0].textContent.trim(), '1');
});

test('controls inside cells are out of the Tab order', () => {
  const { t } = mount();
  const link = t.el.querySelector('tbody a.vt-link');
  assert.equal(link.getAttribute('tabindex'), '-1');
});

test('PageDown and PageUp move between pages and keep the column', () => {
  const { t, env } = mount({ pagination: { perPage: 1, options: [1] } });
  t.el.querySelector('thead th').focus();
  press(env, 'ArrowDown');
  press(env, 'ArrowRight');
  assert.equal(focusedText(env), 'Ann');
  press(env, 'PageDown');
  assert.equal(t.state.page, 2);
  assert.equal(focusedText(env), 'Bob', 'same column, first row of the new page');
  press(env, 'PageUp');
  assert.equal(t.state.page, 1);
  assert.equal(focusedText(env), 'Ann');
  press(env, 'PageUp');
  assert.equal(t.state.page, 1, 'PageUp on the first page does nothing');
});

test('Enter on a header cell sorts, Space does too', () => {
  const { t, env } = mount();
  // Arrow over to the header instead of focusing it directly: Enter restores
  // focus to the roving cell, which only follows keyboard navigation.
  t.el.querySelector('thead th').focus();
  press(env, 'ArrowRight');
  press(env, 'Enter');
  assert.equal(t.state.sort, 'name');
  assert.equal(t.state.dir, 'asc');
  assert.equal(env.window.document.activeElement.getAttribute('data-sort'), 'name', 'focus is kept on the header');
  press(env, ' ');
  assert.equal(t.state.dir, 'desc');
});

test('Enter on a cell with a single control clicks it', () => {
  const clicks = [];
  const { t, env } = mount({
    columns: [
      { key: 'id', label: 'ID' },
      { label: 'Act', type: 'actions', menu: false, custom: [{ label: 'Ping', onClick: (r) => clicks.push(r.id) }] }
    ]
  });
  const cell = t.el.querySelector('tbody tr.vt-tr td:nth-child(2)');
  cell.setAttribute('tabindex', '0');
  cell.focus();
  press(env, 'Enter');
  assert.deepEqual(clicks, [1]);
});

test('Enter on an actions cell opens its menu and focuses the first item', () => {
  const clicks = [];
  const { t, env } = mount({
    columns: [
      { key: 'id', label: 'ID' },
      { label: 'Act', type: 'actions', custom: [{ label: 'Ping', onClick: (r) => clicks.push(r.id) }, { label: 'Other' }] }
    ]
  });
  const cell = t.el.querySelector('tbody tr.vt-tr td:nth-child(2)');
  cell.setAttribute('tabindex', '0');
  cell.focus();
  press(env, 'Enter');
  const menu = cell.querySelector('.vt-act-menu');
  assert.equal(menu.hasAttribute('hidden'), false, 'the menu opened');
  assert.equal(env.window.document.activeElement, menu.querySelector('.vt-act-item'));
  assert.equal(t._cellMode, null, 'it is a menu, not the multi-control cell mode');
  env.window.document.activeElement.click();
  assert.deepEqual(clicks, [1]);
});

test('Enter on a cell with several controls enters interaction mode; Escape leaves', () => {
  const { t, env } = mount({
    columns: [
      { key: 'id', label: 'ID' },
      // menu:false, so the cell really does hold several controls
      { label: 'Act', type: 'actions', menu: false, custom: [{ label: 'A' }, { label: 'B' }] }
    ]
  });
  const cell = t.el.querySelector('tbody tr.vt-tr td:nth-child(2)');
  cell.setAttribute('tabindex', '0');
  cell.focus();
  press(env, 'Enter');
  const buttons = [...cell.querySelectorAll('button')];
  assert.equal(env.window.document.activeElement, buttons[0], 'the first control is focused');
  assert.ok(buttons.every((b) => !b.hasAttribute('tabindex')), 'controls become tabbable');
  assert.equal(t._cellMode, cell);
  buttons[0].dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(env.window.document.activeElement, cell, 'focus returns to the cell');
  assert.ok(buttons.every((b) => b.getAttribute('tabindex') === '-1'), 'controls leave the Tab order');
  assert.equal(t._cellMode, null);
});

test('Enter on the expander cell toggles the detail row', () => {
  const { t, env } = mount({ accordion: { columns: ['name'] } });
  const expanderCell = t.el.querySelector('tbody tr.vt-tr td.vt-td-expander');
  expanderCell.setAttribute('tabindex', '0');
  expanderCell.focus();
  press(env, 'Enter');
  assert.ok(t.el.querySelector('tr.vt-detail'), 'the detail row opened');
});

test('keys typed inside an editor are left to the editor', () => {
  const { t, env } = mount({
    editable: true,
    columns: [{ key: 'name', label: 'Name', editable: true }, { label: 'Act', type: 'actions', edit: { enabled: true } }]
  });
  t.el.querySelector('[data-act="edit"]').click();
  const input = t.el.querySelector('input[data-edit="name"]');
  input.focus();
  input.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(env.window.document.activeElement, input, 'focus stays in the input');
});

test('inputs of a row being edited stay tabbable', () => {
  const { t } = mount({
    editable: true,
    columns: [{ key: 'name', label: 'Name', editable: true }, { label: 'Act', type: 'actions', edit: { enabled: true } }]
  });
  t.el.querySelector('[data-act="edit"]').click();
  assert.equal(t.el.querySelector('input[data-edit="name"]').hasAttribute('tabindex'), false);
});

test('an unhandled key is ignored', () => {
  const { t, env } = mount();
  t.el.querySelector('thead th').focus();
  const before = env.window.document.activeElement;
  press(env, 'a');
  assert.equal(env.window.document.activeElement, before);
});

test('keyboard:false leaves the grid without tabindex and ignores the keys', () => {
  const { t, env } = mount({ keyboard: false });
  assert.equal(t.el.querySelectorAll('th[tabindex], td[tabindex]').length, 0);
  const th = t.el.querySelector('thead th');
  th.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.notEqual(env.window.document.activeElement.tagName, 'TD');
  assert.equal(t.el.querySelector('.vt-table').getAttribute('role'), 'grid', 'the roles stay for screen readers');
});

test('ARIA bookkeeping follows sorting and the row count', () => {
  const { t } = mount({ pagination: { perPage: 2, options: [2] } });
  const table = t.el.querySelector('.vt-table');
  assert.equal(table.getAttribute('aria-rowcount'), '3', 'the full total, not the page size');
  assert.equal(table.getAttribute('aria-colcount'), '3');
  const sorts = () => [...t.el.querySelectorAll('thead th[data-sort]')].map((th) => th.getAttribute('aria-sort'));
  assert.deepEqual(sorts(), ['none', 'none', 'none']);
  t.el.querySelector('thead th[data-sort="id"]').click();
  assert.deepEqual(sorts(), ['ascending', 'none', 'none']);
  assert.equal(t.el.querySelector('tbody tr.vt-tr').getAttribute('role'), 'row');
  assert.equal(t.el.querySelector('tbody td').getAttribute('role'), 'gridcell');
  assert.equal(t.el.querySelector('thead th').getAttribute('role'), 'columnheader');
});

test('the accordion column is counted in aria-colcount', () => {
  const { t } = mount({ accordion: { columns: ['name'] } });
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-colcount'), '4');
});
