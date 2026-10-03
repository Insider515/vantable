// Export tests: payload building, the built-in CSV, the adapter contract and the
// three shipped adapter presets (Go binary over HTTP, SheetJS, jsPDF).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  'name',
  ['email', 'Email'],
  { label: 'Actions', type: 'actions', edit: { enabled: true } }
];
const DATA = [
  { id: 2, name: 'Пётр', email: 'p@x.io' },
  { id: 1, name: 'Ann, Jr', email: null }
];

/** Make a table in a fresh document; returns the instance plus download spies. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: DATA }, options || {}));
  return { Vantable, t, env };
}

/** Let queued microtasks and the download timeout run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

test('payload holds the visible columns and the current rows', () => {
  const { t } = mount({ exportName: 'users' });
  const p = t._buildPayload('xlsx');
  assert.equal(p.format, 'xlsx');
  assert.equal(p.filename, 'users');
  assert.deepEqual(p.columns, [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'name' },
    { key: 'email', label: 'Email' }
  ]);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { id: 2, name: 'Пётр', email: 'p@x.io' });
  assert.deepEqual(p.rows[1], { id: 1, name: 'Ann, Jr', email: '' }, 'null becomes an empty string');
});

test('payload follows the client-side search and sort', () => {
  const { t } = mount({ search: 'live', sort: 'live', defaultSort: 'id', defaultDir: 'asc' });
  const sorted = t._buildPayload('pdf').rows.map((r) => r.id);
  assert.deepEqual(sorted, [1, 2]);
  t.state.q = 'Пётр';
  t.refresh();
  assert.deepEqual(t._buildPayload('pdf').rows.map((r) => r.name), ['Пётр']);
});

test('payload in server mode exports the fetched page', async () => {
  const { t } = mount({
    data: undefined,
    server: { fetch: async () => ({ rows: [{ id: 9, name: 'S', email: 's@x.io' }], total: 100 }) }
  });
  await tick();
  assert.deepEqual(t._buildPayload('xlsx').rows, [{ id: 9, name: 'S', email: 's@x.io' }]);
});

test('CSV export is built in and needs no adapter', async () => {
  const { t, env } = mount({ export: { formats: ['csv'], filename: 'users' } });
  const btn = t.el.querySelector('.vt-export[data-format="csv"]');
  assert.ok(btn, 'CSV button rendered');
  btn.click();
  await tick();
  assert.equal(env.clicks.length, 1);
  assert.equal(env.clicks[0].download, 'users.csv');
  const bytes = await blobBytes(env.blobs[0]);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM for Excel');
  const text = bytes.toString('utf8');
  assert.ok(text.includes('ID,name,Email'), 'header labels');
  assert.ok(text.includes('"Ann, Jr"'), 'comma-bearing value quoted');
  assert.ok(text.includes('\r\n'), 'CRLF line endings');
});

test('the xlsx button calls the configured adapter and emits export', async () => {
  const seen = [];
  const { t } = mount({
    export: { formats: ['csv', 'xlsx', 'pdf'], filename: 'users', adapters: { xlsx: (p) => { seen.push(p); } } }
  });
  const events = [];
  t.on('export', (e) => events.push(e));
  t.el.querySelector('.vt-export[data-format="xlsx"]').click();
  await tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].format, 'xlsx');
  assert.equal(seen[0].rows.length, 2);
  assert.deepEqual(events, [{ format: 'xlsx' }]);
});

test('a format with no adapter reports an error and falls back to CSV', async () => {
  const { t, env } = mount({ export: { formats: ['pdf'], filename: 'users' } });
  const errors = [];
  t.on('error', (e) => errors.push(e));
  t.el.querySelector('.vt-export[data-format="pdf"]').click();
  await tick();
  assert.equal(errors.length, 1);
  assert.match(String(errors[0].message), /no export adapter for "pdf"/);
  assert.equal(env.clicks[0].download, 'users.csv');
});

test('an adapter rejection surfaces as an error event', async () => {
  const { t } = mount({
    export: { formats: ['xlsx'], adapters: { xlsx: () => Promise.reject(new Error('boom')) } }
  });
  const errors = [];
  t.on('error', (e) => errors.push(e));
  t.el.querySelector('.vt-export[data-format="xlsx"]').click();
  await tick();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'boom');
});

test('serverExport posts the payload and downloads the answer', async () => {
  const { Vantable, t, env } = mount({ exportName: 'users' });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'application/octet-stream' }) };
  };
  const adapter = Vantable.serverExport('/service/export', { headers: { 'X-CSRF-TOKEN': 'tok' } });
  await adapter(t._buildPayload('xlsx'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/service/export');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.headers['X-CSRF-TOKEN'], 'tok');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.format, 'xlsx');
  assert.equal(body.rows.length, 2);
  assert.equal(env.clicks.at(-1).download, 'users.xlsx');
  await tick();  // let the anchor cleanup run inside this test's document
  delete globalThis.fetch;
});

test('serverExport rejects on a failed HTTP status', async () => {
  const { Vantable, t } = mount();
  globalThis.fetch = async () => ({ ok: false, status: 500, blob: async () => new Blob([]) });
  const adapter = Vantable.serverExport('/service/export');
  await assert.rejects(() => adapter(t._buildPayload('pdf')), /HTTP 500/);
  await tick();
  delete globalThis.fetch;
});

test('sheetJsExport writes a sheet through the supplied SheetJS', () => {
  const { Vantable, t } = mount({ exportName: 'users' });
  const calls = { appended: null, written: null };
  const fakeXlsx = {
    utils: {
      aoa_to_sheet: (aoa) => ({ aoa }),
      book_new: () => ({ sheets: [] }),
      book_append_sheet: (wb, ws, name) => { calls.appended = { wb, ws, name }; }
    },
    writeFile: (wb, filename) => { calls.written = { wb, filename }; }
  };
  Vantable.sheetJsExport({ lib: fakeXlsx, sheetName: 'Users' })(t._buildPayload('xlsx'));
  assert.equal(calls.appended.name, 'Users');
  assert.deepEqual(calls.appended.ws.aoa[0], ['ID', 'name', 'Email']);
  assert.deepEqual(calls.appended.ws.aoa[1], [2, 'Пётр', 'p@x.io']);
  assert.deepEqual(calls.appended.ws.aoa[2], [1, 'Ann, Jr', '']);
  assert.equal(calls.written.filename, 'users.xlsx');
});

test('sheetJsExport fails loudly when SheetJS is absent', () => {
  const { Vantable, t } = mount();
  assert.throws(() => Vantable.sheetJsExport()(t._buildPayload('xlsx')), /SheetJS not found/);
});

test('jsPdfExport uses the autotable plugin when it is loaded', () => {
  const { Vantable, t } = mount({ exportName: 'users' });
  const calls = {};
  /** Stand-in for the jsPDF constructor, with the autotable plugin present. */
  function FakeJsPdf(opts) {
    calls.opts = opts;
    this.autoTable = (cfg) => { calls.table = cfg; };
    this.save = (name) => { calls.saved = name; };
  }
  Vantable.jsPdfExport({ lib: FakeJsPdf, fontSize: 9 })(t._buildPayload('pdf'));
  assert.equal(calls.opts.orientation, 'portrait');
  assert.equal(calls.opts.unit, 'mm');
  assert.deepEqual(calls.table.head, [['ID', 'name', 'Email']]);
  assert.deepEqual(calls.table.body[0], ['2', 'Пётр', 'p@x.io']);
  assert.deepEqual(calls.table.body[1], ['1', 'Ann, Jr', '']);
  assert.equal(calls.table.styles.fontSize, 9);
  assert.equal(calls.saved, 'users.pdf');
});

test('jsPdfExport writes text rows when autotable is missing', () => {
  const { Vantable, t } = mount({ exportName: 'users.pdf' });
  const lines = [];
  /** Stand-in for jsPDF without the autotable plugin. */
  function BareJsPdf() {
    this.internal = { pageSize: { getHeight: () => 297 } };
    this.setFontSize = () => {};
    this.text = (s) => lines.push(s);
    this.addPage = () => {};
    this.save = () => {};
  }
  Vantable.jsPdfExport({ lib: BareJsPdf })(t._buildPayload('pdf'));
  assert.equal(lines.length, 3, 'header + two rows');
  assert.match(lines[0], /ID.*name.*Email/);
  assert.match(lines[1], /Пётр/);
});

test('jsPdfExport goes landscape for wide tables', () => {
  const wide = ['a', 'b', 'c', 'd', 'e', 'f'];
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', { columns: wide, data: [{ a: 1 }] });
  let opts = null;
  /** Stand-in recording only the constructor options. */
  function FakeJsPdf(o) { opts = o; this.autoTable = () => {}; this.save = () => {}; }
  Vantable.jsPdfExport({ lib: FakeJsPdf })(t._buildPayload('pdf'));
  assert.equal(opts.orientation, 'landscape');
  assert.ok(env.dom);
});

test('jsPdfExport fails loudly when jsPDF is absent', () => {
  const { Vantable, t } = mount();
  assert.throws(() => Vantable.jsPdfExport()(t._buildPayload('pdf')), /jsPDF not found/);
});
