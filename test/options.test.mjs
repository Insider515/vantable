// Option / lifecycle tests: labels, styling hooks, row ids, the event bus,
// print, destroy, multi-instance isolation and the constructor contract.
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

test('labels can be overridden piecemeal', () => {
  const { t } = mount({
    export: { formats: ['csv', 'xlsx', 'pdf'] },
    pagination: { perPage: 1, options: [1] },
    labels: {
      search: 'Искать…', perPage: 'Строк', prev: 'Назад', next: 'Вперёд',
      page: 'Стр', of: 'из', exportCsv: 'ЦСВ', exportXlsx: 'Эксель', exportPdf: 'ПДФ', print: 'Печать'
    }
  });
  assert.equal(t.el.querySelector('input.vt-search').getAttribute('placeholder'), 'Искать…');
  assert.deepEqual([...t.el.querySelectorAll('.vt-export')].map((b) => b.textContent), ['ЦСВ', 'Эксель', 'ПДФ']);
  assert.equal(t.el.querySelector('.vt-print').textContent, 'Печать');
  assert.equal(t.el.querySelector('.vt-prev').textContent, 'Назад');
  assert.equal(t.el.querySelector('.vt-next').textContent, 'Вперёд');
  assert.match(t.el.querySelector('.vt-pageinfo').textContent, /Стр 1 из 2/);
  assert.match(t.el.querySelector('.vt-perpage').textContent, /Строк/);
  assert.equal(t.labels.empty, 'No records', 'untouched labels keep their default');
});

test('action and modal labels come from the label set', () => {
  const { t, env } = mount({
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', edit: { enabled: true }, remove: { enabled: true } }]),
    editable: true,
    labels: { edit: 'Правка', remove: 'Удалить', save: 'Сохранить', cancel: 'Отмена', confirmRemove: 'Удалить запись?' }
  });
  assert.equal(t.el.querySelector('[data-act="edit"]').textContent, 'Правка');
  assert.equal(t.el.querySelector('[data-act="remove"]').textContent, 'Удалить');
  t.el.querySelector('[data-act="edit"]').click();
  assert.equal(t.el.querySelector('[data-act="save"]').textContent, 'Сохранить');
  assert.equal(t.el.querySelector('[data-act="cancel"]').textContent, 'Отмена');
  t.el.querySelector('[data-act="cancel"]').click();
  t.el.querySelector('[data-act="remove"]').click();
  assert.equal(env.window.document.querySelector('.vt-modal-body').textContent, 'Удалить запись?');
});

test('emptyText falls back to the empty label', () => {
  assert.equal(mount({ data: [] }).t.el.querySelector('tr.vt-empty td').textContent, 'No records');
  assert.equal(mount({ data: [], labels: { empty: 'Пусто' } }).t.el.querySelector('tr.vt-empty td').textContent, 'Пусто');
  assert.equal(mount({ data: [], emptyText: 'Нет строк' }).t.el.querySelector('tr.vt-empty td').textContent, 'Нет строк');
});

test('the default stylesheet is injected once per document', () => {
  const { env, Vantable } = mount();
  const styles = () => env.window.document.querySelectorAll('#vantable-default-styles');
  assert.equal(styles().length, 1);
  new Vantable(env.window.document.getElementById('host'), { columns: COLUMNS, data: [] });
  Vantable.injectStyles();
  assert.equal(styles().length, 1, 'idempotent');
  assert.ok(Vantable.css.length > 500);
  assert.ok(Vantable.css.includes('.vt-table'));
});

test('styles:false skips the injection', () => {
  const { env } = mount({ styles: false });
  assert.equal(env.window.document.querySelectorAll('#vantable-default-styles').length, 0);
});

test('mode sets the theme attribute, theme sets CSS variables', () => {
  assert.equal(mount({ mode: 'dark' }).t.el.getAttribute('data-vt-theme'), 'dark');
  assert.equal(mount({ mode: 'light' }).t.el.getAttribute('data-vt-theme'), 'light');
  assert.equal(mount({ mode: 'sepia' }).t.el.getAttribute('data-vt-theme'), null, 'unknown modes are ignored');
  const { t } = mount({ theme: { accent: '#f00', radius: '4px', headBg: '#eee' } });
  assert.equal(t.el.style.getPropertyValue('--vt-accent'), '#f00');
  assert.equal(t.el.style.getPropertyValue('--vt-radius'), '4px');
  assert.equal(t.el.style.getPropertyValue('--vt-head-bg'), '#eee', 'camelCase becomes kebab-case');
});

test('rowId picks the identity field used by rows, lookups and actions', () => {
  const hits = [];
  const { t } = mount({
    rowId: 'uuid',
    data: [{ uuid: 'a-1', name: 'Ann' }, { uuid: 'b-2', name: 'Bob' }],
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', custom: [{ label: 'P', onClick: (r) => hits.push(r.uuid) }] }])
  });
  assert.deepEqual([...t.el.querySelectorAll('tbody tr.vt-tr')].map((tr) => tr.getAttribute('data-id')), ['a-1', 'b-2']);
  assert.equal(t._rowById('b-2').name, 'Bob');
  t.el.querySelectorAll('[data-act="custom"]')[1].click();
  assert.deepEqual(hits, ['b-2']);
});

test('ids with quotes do not break the row lookup', () => {
  const { t } = mount({
    rowId: 'key',
    editable: true,
    data: [{ key: 'a"b', name: 'Quoted' }],
    columns: [{ key: 'name', label: 'Name', editable: true }, { label: 'Act', type: 'actions', edit: { enabled: true } }]
  });
  t.el.querySelector('[data-act="edit"]').click();
  const input = t.el.querySelector('input[data-edit="name"]');
  assert.ok(input, 'the row was found and switched to editing');
  input.value = 'Fixed';
  t.el.querySelector('[data-act="save"]').click();
  assert.equal(t.data[0].name, 'Fixed');
});

test('the event bus is chainable, multi-handler and failure-tolerant', () => {
  const { t } = mount();
  const seen = [];
  const ret = t.on('render', () => { throw new Error('handler blew up'); }).on('render', () => seen.push('b'));
  assert.equal(ret, t, 'on() is chainable');
  t.refresh();
  assert.deepEqual(seen, ['b'], 'a throwing handler does not stop the others');
});

test('print() writes a cleaned copy of the table to the new window', () => {
  const { t, env } = mount({
    columns: COLUMNS.concat([
      { key: 'name', label: 'Copy', type: 'copy' },
      { key: 'name', label: 'File', type: 'download' },
      { label: 'Act', type: 'actions', edit: { enabled: true } }
    ]),
    accordion: { columns: ['name'] }
  });
  const written = [];
  let printed = 0;
  let closed = 0;
  env.window.open = () => ({
    document: { write: (html) => written.push(html), close: () => {} },
    focus: () => {},
    print: () => { printed++; },
    close: () => { closed++; }
  });
  t.print();
  assert.equal(written.length, 1);
  assert.equal(printed, 1);
  assert.equal(closed, 1);
  const html = written[0];
  assert.match(html, /<table/);
  // Parse the printout and query it, rather than matching substrings.
  const box = env.window.document.createElement('div');
  box.innerHTML = html;
  assert.match(box.textContent, /Ann/, 'the data is there');
  assert.equal(box.querySelectorAll('.vt-actions').length, 0, 'row actions stripped');
  assert.equal(box.querySelectorAll('button.vt-copy').length, 0, 'copy buttons stripped');
  assert.equal(box.querySelectorAll('button.vt-download').length, 0, 'download buttons stripped');
  assert.equal(box.querySelectorAll('.vt-td-expander, .vt-th-expander').length, 0, 'expanders stripped');
  assert.ok(box.querySelectorAll('.vt-copy-val').length > 0, 'the copied value itself stays visible');
});

test('print() does nothing when the popup is blocked', () => {
  const { t, env } = mount();
  env.window.open = () => null;
  t.print();
});

test('export buttons can be switched off, print too', () => {
  assert.equal(mount({ export: false }).t.el.querySelectorAll('.vt-export').length, 0);
  assert.equal(mount({ exportable: false }).t.el.querySelectorAll('.vt-export').length, 0, 'legacy flag still honoured');
  assert.equal(mount({ printable: false }).t.el.querySelectorAll('.vt-print').length, 0);
  assert.equal(mount().t.el.querySelectorAll('.vt-export').length, 1, 'CSV button by default');
});

test('exportCsv() names the file from the argument, the option or a default', async () => {
  const { t, env } = mount();
  t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(env.clicks.at(-1).download, 'table.csv', 'default name');
  t.exportCsv('report');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(env.clicks.at(-1).download, 'report.csv');
  t.exportCsv('already.csv');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(env.clicks.at(-1).download, 'already.csv', 'the extension is not doubled');

  const named = mount({ export: { filename: 'users' } });
  named.t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(named.env.clicks.at(-1).download, 'users.csv');
});

test('the CSV export reports the row count in the export event', async () => {
  const { t } = mount({ pagination: { perPage: 1, options: [1] } });
  const events = [];
  t.on('export', (e) => events.push(e));
  t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(events, [{ rows: 2, format: 'csv' }], 'the whole client dataset, not just the page');
});

test('CSV values are quoted and escaped per RFC 4180', async () => {
  const { t, env } = mount({
    columns: [{ key: 'v', label: 'V' }],
    data: [{ v: 'a,b' }, { v: 'say "hi"' }, { v: 'line1\nline2' }, { v: null }]
  });
  t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  const text = (await blobBytes(env.blobs.at(-1))).toString('utf8');
  const body = text.slice(1);  // drop the BOM
  assert.deepEqual(body.split('\r\n'), ['V', '"a,b"', '"say ""hi"""', '"line1\nline2"', '']);
});

test('two instances in one document stay independent', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const a = new Vantable('#a', { columns: COLUMNS, data: DATA.map((r) => ({ ...r })), search: 'live' });
  const b = new Vantable('#b', { columns: COLUMNS, data: DATA.map((r) => ({ ...r })), pagination: { perPage: 1, options: [1] } });
  assert.notEqual(a.uid, b.uid);
  a.state.q = 'bob';
  a.refresh();
  assert.equal(a.el.querySelectorAll('tbody tr.vt-tr').length, 1);
  assert.equal(b.el.querySelectorAll('tbody tr.vt-tr').length, 1, 'b shows its own single page');
  b.el.querySelector('.vt-next').click();
  assert.equal(b.state.page, 2);
  assert.equal(a.state.page, 1, 'paging b does not move a');
  assert.equal(env.window.document.querySelectorAll('.vt-root').length, 2);
});

test('destroy() empties the host and emits destroy', () => {
  const { t } = mount();
  const events = [];
  t.on('destroy', () => events.push('bye'));
  t.destroy();
  assert.equal(t.el.innerHTML, '');
  assert.deepEqual(events, ['bye']);
});

test('the constructor accepts an element, and refuses a missing target', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const host = env.window.document.getElementById('host');
  const byElement = new Vantable(host, { columns: COLUMNS, data: [] });
  assert.equal(byElement.el, host);
  assert.throws(() => new Vantable('#nope', { columns: COLUMNS }), /target element not found/);
});

test('calling Vantable without new still builds an instance', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = Vantable('#host', { columns: COLUMNS, data: DATA });
  assert.ok(t instanceof Vantable);
  assert.equal(t.el, env.window.document.getElementById('host'));
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 2);
});

test('a table with no columns at all still renders', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {});
  assert.ok(env.dom);
  assert.deepEqual(t.columns, []);
  assert.ok(t.el.querySelector('tr.vt-empty'));
});

test('the root element carries the vt-root class and the three regions', () => {
  const { t } = mount();
  assert.ok(t.el.classList.contains('vt-root'));
  assert.ok(t.el.querySelector('.vt-toolbar'));
  assert.ok(t.el.querySelector('.vt-scroll .vt-table'));
  assert.ok(t.el.querySelector('.vt-footer'));
});
