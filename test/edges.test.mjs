// Edge-case tests: the lookup misses, the rarely taken option shapes and the
// adapter branches that the feature tests do not reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/** Mount with the shared fixture. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: DATA.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t };
}

test('lookups return null for ids, keys and configs that do not exist', () => {
  const { t } = mount();
  assert.equal(t._rowById('nope'), null);
  assert.equal(t._colByKey('nope'), null);
  assert.equal(t._actionsColCfg(), null, 'no actions column in this table');
  assert.equal(t._actionsColCustom(), null);
});

test('a key press from outside the grid rows falls back to the active cell', () => {
  const { t, env } = mount({ accordion: { columns: ['name'] } });
  t.el.querySelector('.vt-expander').click();
  const detailCell = t.el.querySelector('tr.vt-detail td');
  assert.ok(detailCell, 'detail row open');
  detailCell.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  // The detail row is not part of the grid, so the roving cell is used instead.
  assert.equal(env.window.document.activeElement.closest('tr').classList.contains('vt-detail'), false);
});

test('a key press with no rows at all is ignored', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', { columns: [], data: [] });
  const table = t.el.querySelector('.vt-table');
  t.$thead.innerHTML = '';
  t.$tbody.innerHTML = '';
  table.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
});

test('a column without a key exports as an empty value', async () => {
  const { t, env } = mount({
    columns: [{ key: 'id', label: 'ID' }, { label: 'Calc', type: 'html', render: (v, r) => `<b>${r.id * 2}</b>` }],
    export: { formats: ['csv'], filename: 'calc' }
  });
  assert.deepEqual(t._buildPayload('xlsx').columns, [{ key: 'id', label: 'ID' }, { key: '', label: 'Calc' }]);
  assert.deepEqual(t._buildPayload('xlsx').rows[0], { id: 1, '': '' });
  t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  const text = (await blobBytes(env.blobs.at(-1))).toString('utf8').slice(1);
  assert.deepEqual(text.split('\r\n'), ['ID,Calc', '1,', '2,']);
});

test('searching a table whose columns have no keys matches nothing', () => {
  const { t } = mount({ columns: [{ label: 'X', type: 'html', render: () => 'x' }], search: 'live' });
  assert.deepEqual(t._searchKeys(), []);
  t.state.q = 'x';
  t.refresh();
  assert.ok(t.el.querySelector('tr.vt-empty'));
});

test('a status map entry without a colour falls back to the default', () => {
  const { t } = mount({ columns: [{ key: 'id', label: 'S', type: 'status', map: { 1: { label: 'One' } } }] });
  const badge = t.el.querySelector('.vt-badge');
  assert.equal(badge.textContent, 'One');
  assert.match(badge.getAttribute('style'), /#64748b/);
});

test('link, external and download accept plain strings as well as functions', () => {
  const { t } = mount({
    columns: [
      { key: 'name', label: 'L', type: 'link', href: '/fixed', text: 'Go' },
      { key: 'name', label: 'E', type: 'external', href: '/out', text: 'Out' },
      { key: 'name', label: 'D', type: 'download', filename: 'fixed.txt' }
    ]
  });
  const tr = t.el.querySelector('tbody tr.vt-tr');
  assert.equal(tr.querySelector('a.vt-link').getAttribute('href'), '/fixed');
  assert.equal(tr.querySelector('a.vt-link').textContent, 'Go');
  assert.match(tr.querySelector('a.vt-external').textContent, /Out/);
  assert.equal(tr.querySelector('.vt-download').getAttribute('data-dl-name'), 'fixed.txt');
});

test('a select cell without onChange still emits cellChange', () => {
  const { t } = mount({ columns: [{ key: 'name', label: 'N', type: 'select', options: ['Ann', 'Bob'] }] });
  const events = [];
  t.on('cellChange', (e) => events.push(e.value));
  const sel = t.el.querySelector('select.vt-cell-select');
  sel.value = 'Bob';
  sel.dispatchEvent(new (t.el.ownerDocument.defaultView.Event)('change', { bubbles: true }));
  assert.deepEqual(events, ['Bob']);
});

test('options.actions supplies the callbacks for an actions column', () => {
  const calls = [];
  const { t } = mount({
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', custom: [{ label: 'Ping' }], edit: { enabled: true } }]),
    actions: {
      custom: [{ label: 'ignored', onClick: (r) => calls.push(`custom:${r.id}`) }],
      edit: { onEdit: (r) => calls.push(`edit:${r.id}`) }
    }
  });
  assert.equal(t.el.querySelector('[data-act="custom"]').textContent, 'Ping', 'labels come from the column');
  t.el.querySelector('[data-act="custom"]').click();
  t.el.querySelector('[data-act="edit"]').click();
  assert.deepEqual(calls, ['custom:1', 'edit:1'], 'callbacks come from options.actions');
});

test('a custom action with no onClick only emits the event', () => {
  const { t } = mount({ columns: COLUMNS.concat([{ label: 'Act', type: 'actions', custom: [{ label: 'Bare' }] }]) });
  const events = [];
  t.on('action', (e) => events.push(e.index));
  t.el.querySelector('[data-act="custom"]').click();
  assert.deepEqual(events, [0]);
});

test('remove with reload:false keeps the current view after the request', async () => {
  const { t, env } = mount({
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', remove: { enabled: true, url: '/api/x', reload: false } }])
  });
  const renders = [];
  t.on('render', () => renders.push(1));
  const prev = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true });
  try {
    t.el.querySelector('[data-act="remove"]').click();
    env.window.document.querySelectorAll('.vt-modal-foot button')[1].click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(renders.length, 0, 'no re-render was triggered');
  } finally {
    globalThis.fetch = prev;
  }
});

test('with no pagination the page size follows the dataset', () => {
  assert.equal(mount({ pagination: false }).t.state.perPage, 2);
  assert.equal(mount({ pagination: false, data: [] }).t.state.perPage, 1, 'never zero');
});

test('serverExport names a csv payload with the csv extension', async () => {
  const { Vantable, env } = mount();
  const prev = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, blob: async () => new Blob(['a,b']) });
  try {
    await Vantable.serverExport('/x')({ format: 'csv', filename: 'plain', columns: [], rows: [] });
    assert.equal(env.clicks.at(-1).download, 'plain.csv');
    await Vantable.serverExport('/x')({ format: 'xlsx', columns: [], rows: [] });
    assert.equal(env.clicks.at(-1).download, 'table.xlsx', 'a payload with no filename falls back to "table"');
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    globalThis.fetch = prev;
  }
});

test('sheetJsExport rejects a library that is not SheetJS', () => {
  const { Vantable, t } = mount();
  assert.throws(() => Vantable.sheetJsExport({ lib: { utils: {} } })(t._buildPayload('xlsx')), /SheetJS not found/);
  assert.throws(() => Vantable.sheetJsExport({ lib: {} })(t._buildPayload('xlsx')), /SheetJS not found/);
});

test('sheetJsExport picks the XLSX page global and the default sheet name', () => {
  const { Vantable, t, env } = mount({ exportName: 'users' });
  const appended = [];
  env.window.XLSX = {
    utils: {
      aoa_to_sheet: (aoa) => ({ aoa }),
      book_new: () => ({}),
      book_append_sheet: (wb, ws, name) => appended.push(name)
    },
    writeFile: () => {}
  };
  try {
    Vantable.sheetJsExport()(t._buildPayload('xlsx'));
    assert.deepEqual(appended, ['Sheet1']);
  } finally {
    delete env.window.XLSX;
  }
});

test('jsPdfExport finds jsPDF under window.jspdf and under window.jsPDF', () => {
  const { Vantable, t, env } = mount();
  const made = [];
  /** Minimal jsPDF stand-in. */
  function Fake() { this.autoTable = () => {}; this.save = () => made.push('saved'); }
  env.window.jspdf = { jsPDF: Fake };
  try {
    Vantable.jsPdfExport()(t._buildPayload('pdf'));
    assert.deepEqual(made, ['saved']);
  } finally {
    delete env.window.jspdf;
  }
  env.window.jsPDF = Fake;
  try {
    Vantable.jsPdfExport()(t._buildPayload('pdf'));
    assert.deepEqual(made, ['saved', 'saved']);
  } finally {
    delete env.window.jsPDF;
  }
});

test('the jsPDF text fallback paginates and survives a missing pageSize', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `n${i}` }));
  const t = new Vantable('#host', { columns: COLUMNS, data: rows, pagination: false, exportName: 'big' });
  const lines = [];
  let pages = 1;
  let saved = null;
  /** jsPDF stand-in without autotable and without internal.pageSize. */
  function Bare() {
    this.setFontSize = () => {};
    this.text = (s) => lines.push(s);
    this.addPage = () => { pages++; };
    this.save = (name) => { saved = name; };
  }
  Vantable.jsPdfExport({ lib: Bare, fontSize: 10 })(t._buildPayload('pdf'));
  assert.equal(lines.length, 201, 'header + every row');
  assert.ok(pages > 1, 'it added pages');
  assert.equal(saved, 'big.pdf');
  assert.ok(env.dom);
});

test('jsPdfExport accepts explicit page options', () => {
  const { Vantable, t } = mount();
  let opts = null;
  /** jsPDF stand-in recording the constructor options. */
  function Fake(o) { opts = o; this.autoTable = () => {}; this.save = () => {}; }
  Vantable.jsPdfExport({ lib: Fake, orientation: 'p', unit: 'pt', format: [200, 400], margin: { top: 5 } })(t._buildPayload('pdf'));
  assert.equal(opts.orientation, 'p');
  assert.equal(opts.unit, 'pt');
  assert.deepEqual(opts.format, [200, 400]);
});

test('a csv adapter overrides the built-in CSV export', async () => {
  const seen = [];
  const { t } = mount({ export: { formats: ['csv'], adapters: { csv: (p) => seen.push(p.format) } } });
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['csv']);
});

test('an unknown export format uses the CSV label and reports the gap', async () => {
  const { t, env } = mount({ export: { formats: ['json'], filename: 'x' } });
  const btn = t.el.querySelector('.vt-export[data-format="json"]');
  assert.equal(btn.textContent, 'CSV', 'unknown formats fall back to the CSV label');
  const errors = [];
  t.on('error', (e) => errors.push(e.message));
  btn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(errors[0], /no export adapter for "json"/);
  assert.equal(env.clicks.at(-1).download, 'x.csv');
});
