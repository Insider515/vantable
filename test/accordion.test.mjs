// Accordion tests: the expander column, detail rows from a render function or a
// column list, the expand event and how expansion interacts with re-renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
const DATA = [
  { id: 1, name: 'Ann', email: 'a@x.io', note: '<b>n1</b>' },
  { id: 2, name: 'Bob', email: 'b@x.io', note: 'n2' }
];

/** Mount a table with an accordion config. */
function mount(accordion, options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS,
    data: DATA.map((r) => ({ ...r })),
    accordion
  }, options || {}));
  return { env, Vantable, t };
}

/** Click the expander of a row. */
function toggle(t, id) {
  t.el.querySelector(`tbody tr.vt-tr[data-id="${id}"] .vt-expander`).click();
}

test('an expander column is prepended to the head and every row', () => {
  const { t } = mount({ columns: ['email'] });
  assert.ok(t.el.querySelector('thead th.vt-th-expander'), 'header placeholder');
  assert.equal(t.el.querySelectorAll('thead th').length, 3);
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr td.vt-td-expander').length, 2);
  const btn = t.el.querySelector('.vt-expander');
  assert.equal(btn.getAttribute('data-expand'), '1');
  assert.equal(btn.getAttribute('aria-label'), 'Expand row', 'from labels.expandRow');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
});

test('clicking the expander opens a detail row built from columns', () => {
  const { t } = mount({ columns: [['email', 'E-mail'], 'name'] });
  toggle(t, 1);
  const detail = t.el.querySelector('tr.vt-detail');
  assert.ok(detail, 'detail row added');
  assert.equal(detail.querySelector('td').getAttribute('colspan'), String(COLUMNS.length + 1));
  const pairs = [...detail.querySelectorAll('dt, dd')].map((n) => n.textContent);
  assert.deepEqual(pairs, ['E-mail', 'a@x.io', 'name', 'Ann']);
  assert.ok(t.el.querySelector('.vt-expander').classList.contains('vt-open'));
});

test('the detail row escapes values from a column list', () => {
  const { t } = mount({ columns: ['note'] });
  toggle(t, 1);
  const dd = t.el.querySelector('tr.vt-detail dd');
  assert.equal(dd.querySelectorAll('b').length, 0);
  assert.equal(dd.textContent, '<b>n1</b>');
});

test('a column with render() in the detail list may emit markup', () => {
  const { t } = mount({ columns: [{ key: 'note', label: 'Note', render: (v) => `<em>${v}</em>` }] });
  toggle(t, 1);
  assert.ok(t.el.querySelector('tr.vt-detail dd em'));
});

test('a render function receives the row and its output is used as markup', () => {
  const seen = [];
  const { t } = mount({ render: (row) => { seen.push(row.id); return `<p class="x">${row.email}</p>`; } });
  toggle(t, 2);
  assert.deepEqual(seen, [2]);
  const p = t.el.querySelector('tr.vt-detail p.x');
  assert.equal(p.textContent, 'b@x.io');
});

test('an accordion with neither render nor columns opens an empty box', () => {
  const { t } = mount({});
  toggle(t, 1);
  assert.equal(t.el.querySelector('tr.vt-detail .vt-detail-box').innerHTML, '');
});

test('expand toggles off again and reports both transitions', () => {
  const { t } = mount({ columns: ['email'] });
  const events = [];
  t.on('expand', (e) => events.push({ id: e.id, open: e.open, name: e.row && e.row.name }));
  toggle(t, 1);
  assert.equal(t.el.querySelectorAll('tr.vt-detail').length, 1);
  toggle(t, 1);
  assert.equal(t.el.querySelectorAll('tr.vt-detail').length, 0);
  assert.deepEqual(events, [
    { id: '1', open: true, name: 'Ann' },
    { id: '1', open: false, name: 'Ann' }
  ]);
});

test('rows expand independently and stay open across a refresh', () => {
  const { t } = mount({ columns: ['email'] });
  toggle(t, 1);
  toggle(t, 2);
  assert.equal(t.el.querySelectorAll('tr.vt-detail').length, 2);
  t.refresh();
  assert.equal(t.el.querySelectorAll('tr.vt-detail').length, 2, 'expanded state survives a re-render');
  assert.deepEqual(Object.keys(t.state.expanded), ['1', '2']);
});

test('the empty row spans the expander column too', () => {
  const { t } = mount({ columns: ['email'] }, { data: [] });
  assert.equal(t.el.querySelector('tr.vt-empty td').getAttribute('colspan'), String(COLUMNS.length + 1));
});

test('a detail row is not a navigable grid row', () => {
  const { t } = mount({ columns: ['email'] });
  toggle(t, 1);
  assert.equal(t._navRows().length, 3, 'header + two data rows, detail excluded');
});
