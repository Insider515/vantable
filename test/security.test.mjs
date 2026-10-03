// Security tests: everything a hostile value can reach. Only `html` columns and
// an accordion `render()` are documented as raw markup; every other path must
// escape, and ids/filenames/urls must not break out of their context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const XSS = '<img src=x onerror="window.__pwned=1">';
const BREAK = '"><script>window.__pwned=1</script>';

/** Mount a table over one hostile row. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: ['v'], data: [{ id: 1, v: XSS }] }, options || {}));
  return { env, Vantable, t };
}
/**
 * Did anything hostile reach the DOM? jsdom runs no scripts here, so look for
 * what the payload would have produced: a <script>, or an element carrying an
 * event-handler attribute. (An `image` column legitimately renders an <img>,
 * which is why the check is about handlers, not about tags.)
 */
function clean(t, where) {
  assert.equal(t.el.querySelectorAll('script, [onerror], [onload], [onclick]').length, 0,
    `${where}: markup was injected`);
  assert.equal(t.el.ownerDocument.defaultView.__pwned, undefined, `${where}: code ran`);
}

test('a hostile value is escaped in every non-html column type', () => {
  for (const type of ['text', 'number', 'textarea', 'copy', 'status', 'download', 'image', 'link', 'external', 'select']) {
    const env = setupDom();
    const Vantable = loadVantable();
    const t = new Vantable('#host', {
      columns: [{ key: 'v', label: 'V', type, options: [XSS], map: { [XSS]: { label: XSS } } }],
      data: [{ v: XSS }]
    });
    clean(t, type);
    assert.ok(env.dom);
  }
});

test('a hostile column label cannot break the header', () => {
  const { t } = mount({ columns: [{ key: 'v', label: XSS }] });
  clean(t, 'header');
  assert.equal(t.el.querySelector('thead th').textContent.trim(), XSS, 'shown as text');
});

test('a hostile value cannot break out of an attribute', () => {
  const { t } = mount({ columns: [{ key: 'v', label: 'V', type: 'copy' }], data: [{ v: BREAK }] });
  clean(t, 'copy attribute');
  assert.equal(t.el.querySelector('.vt-copy').getAttribute('data-copy'), BREAK);
});

test('a hostile row id cannot break the row attribute or the lookups', () => {
  const { t } = mount({ rowId: 'id', data: [{ id: BREAK, v: 'x' }] });
  clean(t, 'row id');
  const tr = t.el.querySelector('tbody tr.vt-tr');
  assert.equal(tr.getAttribute('data-id'), BREAK);
  assert.equal(t._rowById(BREAK).v, 'x', 'and it is still found');
});

test('a hostile row id is sanitised for the detail-row element id', () => {
  const { t } = mount({ rowId: 'id', data: [{ id: BREAK, v: 'x' }], accordion: { columns: ['v'] } });
  t.el.querySelector('.vt-expander').click();
  const detail = t.el.querySelector('tr.vt-detail');
  assert.match(detail.id, /^vt\d+-d-[\w-]+$/, 'only word characters survive');
  clean(t, 'detail id');
});

test('an html column is the one documented escape hatch', () => {
  const { t } = mount({ columns: [{ key: 'v', label: 'V', type: 'html', render: (v) => v }] });
  assert.equal(t.el.querySelectorAll('tbody img').length, 1, 'render() output is inserted as given');
  const safe = mount({ columns: [{ key: 'v', label: 'V', type: 'html' }] });
  clean(safe.t, 'html column without render');
});

test('an accordion render() is raw, its column list is not', () => {
  const raw = mount({ accordion: { render: (row) => row.v } });
  raw.t.el.querySelector('.vt-expander').click();
  assert.equal(raw.t.el.querySelectorAll('tr.vt-detail img').length, 1, 'documented as raw');
  const listed = mount({ accordion: { columns: ['v'] } });
  listed.t.el.querySelector('.vt-expander').click();
  clean(listed.t, 'accordion columns');
});

test('hostile labels cannot inject markup anywhere in the chrome', () => {
  const { t, env } = mount({
    export: { formats: ['csv'] },
    columnPicker: true,
    selection: { actions: [{ label: XSS }] },
    columns: [{ key: 'v', label: 'V', filter: 'select', options: [XSS] }, { label: 'A', type: 'actions', custom: [{ label: XSS }] }],
    labels: {
      search: XSS, empty: XSS, columns: XSS, selected: XSS, clearSelection: XSS,
      filterAll: XSS, retry: XSS, error: XSS, loading: XSS, actions: XSS, expandRow: XSS
    }
  });
  t.selectRow(1, true);
  t.setError(new Error(XSS));
  t.setLoading(true);
  clean(t, 'chrome labels');
  assert.equal(env.window.document.querySelectorAll('script').length, 0);
});

test('a hostile error message is shown as text', () => {
  const { t } = mount();
  t.setError(new Error(XSS));
  clean(t, 'error row');
  assert.equal(t.el.querySelector('.vt-error-detail').textContent, XSS);
});

test('a hostile confirm message is shown as text', () => {
  const { t, env } = mount({
    columns: [{ key: 'v', label: 'V' }, { label: 'A', type: 'actions', menu: false, remove: { enabled: true } }],
    labels: { confirmRemove: XSS }
  });
  t.el.querySelector('[data-act="remove"]').click();
  const body = env.window.document.querySelector('.vt-modal-body');
  assert.equal(body.textContent, XSS);
  assert.equal(body.querySelectorAll('img').length, 0);
});

test('a javascript: href is left to the host but never executed by us', () => {
  const { t } = mount({ columns: [{ key: 'v', label: 'V', type: 'link', href: () => 'javascript:window.__pwned=1' }] });
  const a = t.el.querySelector('a.vt-link');
  assert.equal(a.getAttribute('href'), 'javascript:window.__pwned=1', 'kept verbatim — sanitising urls is the host\'s job');
  assert.equal(t.el.ownerDocument.defaultView.__pwned, undefined, 'nothing ran at render time');
});

test('an external link always carries rel=noopener', () => {
  const { t } = mount({ columns: [{ key: 'v', label: 'V', type: 'external', href: () => 'https://evil.example' }] });
  const a = t.el.querySelector('a.vt-external');
  assert.equal(a.getAttribute('rel'), 'noopener');
  assert.equal(a.getAttribute('target'), '_blank');
});

test('a hostile filename cannot change the download target', async () => {
  const { t, env } = mount({
    columns: [{ key: 'v', label: 'V', type: 'download', filename: () => '../../etc/passwd' }],
    data: [{ v: 'content' }]
  });
  t.el.querySelector('.vt-download').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(env.clicks.at(-1).download, '../../etc/passwd',
    'passed through: the browser treats it as a plain name, no path traversal happens');
});

test('CSV keeps hostile values quoted inside one field', async () => {
  const { t, env } = mount({
    columns: [{ key: 'v', label: 'V' }],
    data: [{ v: 'a",b\n=1+1' }],
    export: { formats: ['csv'], filename: 'x' }
  });
  t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  const csv = (await blobBytes(env.blobs.at(-1))).toString('utf8').slice(1);
  assert.equal(csv, 'V\r\n"a"",b\n=1+1"', 'the value stays one quoted field');
});

test('a formula-looking value is NOT neutralised (documented behaviour)', async () => {
  const { t, env } = mount({
    columns: [{ key: 'v', label: 'V' }],
    data: [{ v: '=HYPERLINK("http://evil","x")' }],
    export: { formats: ['csv'] }
  });
  t.exportCsv();
  await new Promise((r) => setTimeout(r, 0));
  const csv = (await blobBytes(env.blobs.at(-1))).toString('utf8');
  assert.ok(csv.includes('=HYPERLINK'), 'CSV injection is the spreadsheet\'s problem; prefix it yourself if it matters');
});

test('the export payload carries values, never markup', () => {
  const { t } = mount({ columns: [{ key: 'v', label: XSS, type: 'html', render: () => '<b>x</b>' }] });
  const payload = t._buildPayload('xlsx');
  assert.equal(payload.columns[0].label, XSS, 'the raw label, not escaped markup');
  assert.equal(payload.rows[0].v, XSS, 'the raw value, not the rendered html');
});

test('a hostile search query is not interpreted as markup or a regexp', () => {
  const { t } = mount({ search: 'live', data: [{ id: 1, v: 'plain' }, { id: 2, v: '.*' }] });
  t.state.q = '.*';
  t.refresh();
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1, 'substring match, not a pattern');
  t.state.q = XSS;
  t.refresh();
  clean(t, 'search');
});

test('a hostile filter value is not interpreted as a pattern', () => {
  const { t } = mount({
    columns: [{ key: 'v', label: 'V', filter: true }],
    data: [{ id: 1, v: 'plain' }, { id: 2, v: 'a.b' }]
  });
  t.setFilter('v', 'a.b');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
  t.setFilter('v', XSS);
  clean(t, 'filter');
});

test('a hostile theme value cannot escape the style attribute', () => {
  const { t } = mount({ theme: { accent: 'red;"><script>1</script>' } });
  clean(t, 'theme');
  assert.equal(t.el.querySelector('script'), null);
});

test('a hostile status colour cannot escape its style attribute', () => {
  const { t } = mount({
    columns: [{ key: 'v', label: 'V', type: 'status', map: { x: { label: 'X', color: '#fff"><script>1</script>' } } }],
    data: [{ v: 'x' }]
  });
  clean(t, 'status colour');
});

test('a hostile image src cannot add attributes', () => {
  const { t } = mount({ columns: [{ key: 'v', label: 'V', type: 'image' }], data: [{ v: 'x.png" onerror="window.__pwned=1' }] });
  const img = t.el.querySelector('img.vt-img');
  assert.equal(img.getAttribute('onerror'), null);
  assert.equal(img.getAttribute('src'), 'x.png" onerror="window.__pwned=1');
});

test('a hostile action-menu icon is escaped', () => {
  const { t } = mount({
    columns: [{ key: 'v', label: 'V' }, { label: 'A', type: 'actions', menu: { icon: XSS }, custom: [{ label: 'x' }] }]
  });
  clean(t, 'menu icon');
  assert.equal(t.el.querySelector('.vt-act-trigger').textContent, XSS);
});

test('a hostile filter placeholder is escaped', () => {
  const { t } = mount({ columns: [{ key: 'v', label: 'V', filter: { placeholder: BREAK } }] });
  clean(t, 'filter placeholder');
  assert.equal(t.el.querySelector('.vt-filter-text').getAttribute('placeholder'), BREAK);
});

test('a hostile data-label (responsive) is escaped', () => {
  const { t } = mount({ columns: [{ key: 'v', label: BREAK }], responsive: true });
  clean(t, 'data-label');
  assert.equal(t.el.querySelector('tbody td').getAttribute('data-label'), BREAK);
});

test('a hostile emptyText is escaped', () => {
  const { t } = mount({ data: [], emptyText: XSS });
  clean(t, 'emptyText');
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, XSS);
});

test('a hostile value in a select option cannot break the option tag', () => {
  const { t } = mount({
    columns: [{ key: 'v', label: 'V', type: 'select', options: [{ value: BREAK, label: BREAK }] }],
    data: [{ v: BREAK }]
  });
  clean(t, 'select option');
  const opt = t.el.querySelector('select.vt-cell-select option');
  assert.equal(opt.value, BREAK);
  assert.equal(opt.textContent, BREAK);
});

test('an inline editor cannot be seeded with markup', () => {
  const { t } = mount({
    editable: true,
    columns: [{ key: 'v', label: 'V', editable: true }, { label: 'A', type: 'actions', menu: false, edit: { enabled: true } }]
  });
  t.el.querySelector('[data-act="edit"]').click();
  clean(t, 'editor');
  assert.equal(t.el.querySelector('input[data-edit="v"]').value, XSS);
});

test('a saved value stays data, not markup', () => {
  const saves = [];
  const { t } = mount({
    editable: true,
    onSave: (id, changes) => saves.push(changes),
    columns: [{ key: 'v', label: 'V', editable: true }, { label: 'A', type: 'actions', menu: false, edit: { enabled: true } }]
  });
  t.el.querySelector('[data-act="edit"]').click();
  const input = t.el.querySelector('input[data-edit="v"]');
  input.value = BREAK;
  t.el.querySelector('[data-act="save"]').click();
  assert.deepEqual(saves, [{ v: BREAK }]);
  clean(t, 'after save');
});

test('the print window gets escaped content too', () => {
  const { t, env } = mount();
  let html = '';
  env.window.open = () => ({ document: { write: (s) => { html = s; }, close() {} }, focus() {}, print() {}, close() {} });
  t.print();
  const box = env.window.document.createElement('div');
  box.innerHTML = html;
  assert.equal(box.querySelectorAll('img, script').length, 0);
  assert.match(box.textContent, /img src=x/, 'shown as text');
});

test('a hostile bulk-action label is escaped', () => {
  const { t } = mount({ selection: { actions: [{ label: XSS }] } });
  t.selectRow(1, true);
  clean(t, 'bulk label');
  assert.equal(t.el.querySelector('[data-bulk="0"]').textContent, XSS);
});

test('the library never writes to innerHTML outside its own root', () => {
  const { t, env } = mount();
  const outside = env.window.document.createElement('div');
  outside.id = 'outside';
  outside.textContent = 'untouched';
  env.window.document.body.appendChild(outside);
  t.setData([{ id: 2, v: XSS }]);
  t.refresh();
  assert.equal(outside.textContent, 'untouched');
  assert.equal(env.window.document.querySelectorAll('body > div:not(#host):not(#outside)').length, 0,
    'no stray nodes left in the document');
});
