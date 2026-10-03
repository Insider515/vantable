// Remaining-branch tests: defensive paths and option shapes that the feature
// tests do not reach (empty payload values, missing labels, guard clauses).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/** Mount with the shared fixture. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: DATA.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t };
}

test('the constructor works with no options object at all', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable(env.window.document.getElementById('host'));
  assert.deepEqual(t.columns, []);
  assert.ok(t.el.querySelector('tr.vt-empty'));
});

test('the print button in the toolbar calls print()', () => {
  const { t, env } = mount();
  let printed = 0;
  env.window.open = () => ({
    document: { write: () => {}, close: () => {} }, focus: () => {}, print: () => { printed++; }, close: () => {}
  });
  t.el.querySelector('.vt-print').click();
  assert.equal(printed, 1);
});

test('a third header click returns to ascending order', () => {
  const { t } = mount({ sort: 'client' });
  const th = () => t.el.querySelector('thead th[data-sort="name"]');
  th().click();
  assert.equal(t.state.dir, 'asc');
  th().click();
  assert.equal(t.state.dir, 'desc');
  th().click();
  assert.equal(t.state.dir, 'asc');
});

test('sorting handles empty values on either side of the comparison', () => {
  const { t } = mount({
    columns: [{ key: 'v', label: 'V' }],
    data: [{ v: null }, { v: 'b' }, { v: undefined }, { v: 'a' }],
    defaultSort: 'v'
  });
  const shown = () => [...t.el.querySelectorAll('tbody tr.vt-tr td')].map((td) => td.textContent);
  assert.deepEqual(shown(), ['', '', 'a', 'b']);
  t.state.dir = 'desc';
  t.refresh();
  assert.deepEqual(shown(), ['b', 'a', '', '']);
});

test('Enter dispatched from the table itself is ignored', () => {
  const { t, env } = mount();
  const table = t.el.querySelector('.vt-table');
  table.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  table.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.ok(t.el.querySelector('tbody tr.vt-tr'), 'the table still stands');
});

test('a custom action with no label renders an empty button', () => {
  const { t } = mount({ columns: COLUMNS.concat([{ label: 'Act', type: 'actions', custom: [{}] }]) });
  assert.equal(t.el.querySelector('[data-act="custom"]').textContent, '');
});

test('an accordion column without a key shows an empty value', () => {
  const { t } = mount({ accordion: { columns: [{ label: 'Computed' }] } });
  t.el.querySelector('.vt-expander').click();
  assert.equal(t.el.querySelector('tr.vt-detail dt').textContent, 'Computed');
  assert.equal(t.el.querySelector('tr.vt-detail dd').textContent, '');
});

test('an editable select accepts plain-value options', () => {
  const { t } = mount({
    editable: true,
    columns: [
      { key: 'name', label: 'Name', type: 'select', options: ['Ann', 'Bob'], editable: true },
      { label: 'Act', type: 'actions', edit: { enabled: true } }
    ]
  });
  t.el.querySelector('[data-act="edit"]').click();
  const sel = t.el.querySelector('select.vt-input[data-edit="name"]');
  assert.deepEqual([...sel.options].map((o) => o.value), ['Ann', 'Bob']);
  assert.equal(sel.value, 'Ann');
});

test('the footer clamps a page number that the total no longer allows', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS,
    pagination: { perPage: 10, options: [10] },
    server: { fetch: () => ({ rows: DATA, total: 12 }) }
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /1 of 2/);
  t.state.page = 7;             // beyond the 2 pages the total allows
  t.refresh();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.state.page, 2, 'the footer pulled the page back into range');
  assert.ok(env.dom);
});

test('painting before any data has arrived shows the empty row', () => {
  const { t } = mount({ emptyText: 'wait' });
  t._view = undefined;
  t._paint();
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'wait');
});

test('saving a row that is no longer rendered is a no-op', () => {
  const { t } = mount({ editable: true, onSave: () => { throw new Error('must not be called'); } });
  t._saveRow('does-not-exist');
});

test('copying without a button still emits the event', () => {
  const { t } = mount();
  const events = [];
  t.on('copy', (e) => events.push(e.text));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    t._copy('plain text');
    assert.deepEqual(events, ['plain text']);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  }
});

test('destroy() also detaches a registered document listener', () => {
  const { t, env } = mount();
  const removed = [];
  const realRemove = env.window.document.removeEventListener.bind(env.window.document);
  env.window.document.removeEventListener = (type, fn) => { removed.push(type); realRemove(type, fn); };
  t._onDocClick = () => {};
  t.destroy();
  assert.deepEqual(removed, ['click']);
});

test('the SheetJS adapter turns null values into empty cells and names the file', () => {
  const { Vantable } = mount();
  let sheet = null;
  let name = null;
  const lib = {
    utils: {
      aoa_to_sheet: (aoa) => { sheet = aoa; return {}; },
      book_new: () => ({}),
      book_append_sheet: () => {}
    },
    writeFile: (wb, fname) => { name = fname; }
  };
  Vantable.sheetJsExport({ lib })({
    format: 'xlsx',
    columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    rows: [{ a: null, b: 0 }]
  });
  assert.deepEqual(sheet, [['A', 'B'], ['', 0]]);
  assert.equal(name, 'table.xlsx', 'a payload with no filename falls back to "table"');
});

test('the jsPDF adapter fills in missing labels and null values', () => {
  const { Vantable } = mount();
  let table = null;
  /** jsPDF stand-in capturing the autotable payload. */
  function Fake() { this.autoTable = (cfg) => { table = cfg; }; this.save = () => {}; }
  Vantable.jsPdfExport({ lib: Fake })({
    format: 'pdf',
    filename: 'f',
    columns: [{ key: 'a' }, { key: 'b', label: 'B' }],
    rows: [{ a: null, b: 2 }]
  });
  assert.deepEqual(table.head, [['', 'B']]);
  assert.deepEqual(table.body, [['', '2']]);
});

test('a clipboard write that fails is swallowed, and the event still fires', async () => {
  const { t } = mount({ columns: [{ key: 'name', label: 'N', type: 'copy' }] });
  const events = [];
  t.on('copy', (e) => events.push(e.text));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: () => Promise.reject(new Error('denied')) } },
    configurable: true
  });
  try {
    const btn = t.el.querySelector('button.vt-copy');
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(events, ['Ann']);
    assert.ok(!btn.classList.contains('vt-copied'), 'no success feedback on a rejected write');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  }
});

test('an editable select keeps separate option values and labels', () => {
  const { t } = mount({
    editable: true,
    columns: [
      { key: 'name', label: 'Name', type: 'select', options: [{ value: 'Ann', label: 'Анна' }, { value: 'Bob', label: 'Боб' }], editable: true },
      { label: 'Act', type: 'actions', edit: { enabled: true } }
    ]
  });
  t.el.querySelector('[data-act="edit"]').click();
  const sel = t.el.querySelector('select.vt-input[data-edit="name"]');
  assert.deepEqual([...sel.options].map((o) => [o.value, o.textContent]), [['Ann', 'Анна'], ['Bob', 'Боб']]);
  assert.equal(sel.value, 'Ann', 'the current value is preselected');
});

test('Enter on a cell holding a single select focuses it instead of clicking', () => {
  const { t, env } = mount({
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'N', type: 'select', options: ['Ann', 'Bob'] }]
  });
  const cell = t.el.querySelector('tbody tr.vt-tr td:nth-child(2)');
  cell.setAttribute('tabindex', '0');
  cell.focus();
  cell.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(env.window.document.activeElement.tagName, 'SELECT');
  assert.equal(t._cellMode, null, 'a single control does not enter interaction mode');
});

test('CSV export in server mode before the first page arrives yields headers only', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS,
    export: { formats: ['csv'], filename: 'empty' },
    server: { fetch: () => new Promise(() => {}) }   // never resolves
  });
  assert.equal(t._view, undefined, 'no page yet');
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await new Promise((r) => setTimeout(r, 0));
  const text = Buffer.from(await env.blobs.at(-1).arrayBuffer()).toString('utf8').slice(1);
  assert.equal(text, 'ID,Name');
  assert.equal(t._rowById('1'), null, 'and no row can be looked up');
});
