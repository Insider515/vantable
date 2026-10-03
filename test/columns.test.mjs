// Column-type tests: every renderer in _cellHtml, the shared column props and
// the escaping rules (only `html` columns may emit markup).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

/** Mount a one-row table with the given column and return the first cell. */
function cell(column, row, options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: [column],
    data: [Object.assign({ id: 1 }, row)]
  }, options || {}));
  return { env, Vantable, t, td: t.el.querySelector('tbody td') };
}

test('text column: value, prefix and suffix, escaped', () => {
  const { td } = cell({ key: 'name', label: 'N', prefix: '[', suffix: ']' }, { name: 'a<b' });
  assert.equal(td.textContent, '[a<b]');
  assert.equal(td.querySelectorAll('*').length, 0, 'no markup from a text value');
  const { td: empty } = cell({ key: 'name' }, { name: null });
  assert.equal(empty.textContent, '');
});

test('number column: empty for null, value otherwise', () => {
  assert.equal(cell({ key: 'n', type: 'number' }, { n: 0 }).td.textContent, '0');
  assert.equal(cell({ key: 'n', type: 'number' }, { n: null }).td.textContent, '');
  assert.equal(cell({ key: 'n', type: 'number' }, {}).td.textContent, '');
});

test('link column: href from a function, custom text and target', () => {
  const { td } = cell({ key: 'name', type: 'link', href: (r) => `/u/${r.id}`, target: '_blank' }, { name: 'Ann' });
  const a = td.querySelector('a.vt-link');
  assert.equal(a.getAttribute('href'), '/u/1');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.textContent, 'Ann');

  const withText = cell({ key: 'name', type: 'link', href: '/x', text: () => 'Open' }, { name: 'Ann' }).td;
  assert.equal(withText.querySelector('a').textContent, 'Open');

  // No href and no value: falls back to '#', and the text shows the href.
  const bare = cell({ key: 'missing', type: 'link' }, {}).td;
  assert.equal(bare.querySelector('a').getAttribute('href'), '#');
  assert.equal(bare.querySelector('a').textContent, '#');
});

test('external column: always _blank + noopener and an arrow marker', () => {
  const { td } = cell({ key: 'site', type: 'external' }, { site: 'https://x.io' });
  const a = td.querySelector('a.vt-link.vt-external');
  assert.equal(a.getAttribute('href'), 'https://x.io');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener');
  assert.match(a.textContent, /https:\/\/x\.io\s*↗/);
});

test('copy column: shows the value and a copy button carrying it', () => {
  const { td, t } = cell({ key: 'tok', type: 'copy' }, { tok: 'abc"def' });
  assert.equal(td.querySelector('.vt-copy-val').textContent, 'abc"def');
  const btn = td.querySelector('button.vt-copy');
  assert.equal(btn.getAttribute('data-copy'), 'abc"def');
  assert.equal(btn.getAttribute('title'), t.labels.copy);
});

test('status column: mapped label and colour, default for unknown values', () => {
  const map = { 1: { label: 'On', color: '#0a0' } };
  const { td } = cell({ key: 's', type: 'status', map }, { s: 1 });
  const badge = td.querySelector('.vt-badge');
  assert.equal(badge.textContent, 'On');
  assert.match(badge.getAttribute('style'), /--vt-badge:\s*#0a0/);
  const unknown = cell({ key: 's', type: 'status', map }, { s: 7 }).td.querySelector('.vt-badge');
  assert.equal(unknown.textContent, '7');
  assert.match(unknown.getAttribute('style'), /#64748b/);
});

test('select/tag column: options, selection and the data-col hook', () => {
  const { td } = cell({ key: 'c', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }, { c: 'b' });
  const sel = td.querySelector('select.vt-cell-select');
  assert.equal(sel.getAttribute('data-col'), 'c');
  assert.deepEqual([...sel.options].map((o) => o.value), ['a', 'b']);
  assert.equal(sel.value, 'b');

  // Plain values and a function returning the options are both accepted.
  const plain = cell({ key: 'c', type: 'tag', options: () => ['x', 'y'] }, { c: 'y' }).td.querySelector('select');
  assert.deepEqual([...plain.options].map((o) => o.textContent), ['x', 'y']);
  assert.equal(plain.value, 'y');
});

test('image column: src from a function or the value, empty when absent', () => {
  assert.equal(cell({ key: 'img', type: 'image' }, { img: '/a.png' }).td.querySelector('img.vt-img').getAttribute('src'), '/a.png');
  assert.equal(cell({ key: 'img', type: 'image', src: (r) => `/u/${r.id}.png` }, {}).td.querySelector('img').getAttribute('src'), '/u/1.png');
  assert.equal(cell({ key: 'img', type: 'image' }, { img: null }).td.innerHTML, '');
});

test('download column: button plus the hidden payload, and it downloads', async () => {
  const { td, env } = cell({ key: 'conf', type: 'download', filename: (r) => `cfg-${r.id}.txt`, text: 'Save' }, { conf: 'line1\nline2' });
  const btn = td.querySelector('button.vt-download');
  assert.equal(btn.getAttribute('data-dl-name'), 'cfg-1.txt');
  assert.match(btn.textContent, /Save/);
  const src = td.querySelector('textarea.vt-dl-src');
  assert.ok(src.hasAttribute('hidden'));
  assert.equal(src.value, 'line1\nline2');
  btn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(env.clicks.at(-1).download, 'cfg-1.txt');
  assert.equal(await env.blobs.at(-1).text(), 'line1\nline2');
});

test('download column: default filename when none is configured', () => {
  const { td } = cell({ key: 'conf', type: 'download' }, { conf: 'x' });
  assert.equal(td.querySelector('button.vt-download').getAttribute('data-dl-name'), 'data.txt');
});

test('html column: render() output is inserted as markup', () => {
  const { td } = cell({ key: 'n', type: 'html', render: (v, row) => `<b data-id="${row.id}">${v}</b>` }, { n: 'raw' });
  const b = td.querySelector('b');
  assert.equal(b.textContent, 'raw');
  assert.equal(b.getAttribute('data-id'), '1');
});

test('html column without render(): the value is escaped', () => {
  const { td } = cell({ key: 'n', type: 'html' }, { n: '<i>x</i>' });
  assert.equal(td.querySelectorAll('i').length, 0);
  assert.equal(td.textContent, '<i>x</i>');
});

test('a column with render() but no type defaults to html', () => {
  const { t } = cell({ key: 'n', render: () => '<u>u</u>' }, { n: 1 });
  assert.equal(t.columns[0].type, 'html');
  assert.ok(t.el.querySelector('tbody u'));
});

test('actions column: a dropdown with edit, custom and remove', () => {
  const { td } = cell({
    label: 'Act', type: 'actions',
    edit: { enabled: true, label: 'Change' },
    custom: [{ label: 'Ping', className: 'vt-warn' }],
    remove: { enabled: true }
  }, {});
  assert.ok(td.querySelector('.vt-act-trigger'), 'one trigger, not a row of buttons');
  assert.ok(td.querySelector('.vt-act-menu').hasAttribute('hidden'), 'closed to begin with');
  const acts = [...td.querySelectorAll('.vt-act-menu .vt-act-item')];
  assert.deepEqual(acts.map((b) => b.getAttribute('data-act')), ['edit', 'custom', 'remove']);
  assert.equal(acts[0].textContent, 'Change');
  assert.ok(acts[1].classList.contains('vt-warn'));
  assert.equal(acts[1].getAttribute('data-idx'), '0');
  assert.ok(acts[2].classList.contains('vt-danger'));
  acts.forEach((b) => assert.equal(b.getAttribute('data-id'), '1'));
});

test('actions column: menu:false keeps the old row of buttons', () => {
  const { td } = cell({
    label: 'Act', type: 'actions', menu: false,
    edit: { enabled: true }, custom: [{ label: 'Ping' }], remove: { enabled: true }
  }, {});
  assert.equal(td.querySelector('.vt-act-trigger'), null);
  assert.equal(td.querySelector('.vt-act-menu'), null);
  assert.deepEqual([...td.querySelectorAll('.vt-actions button')].map((b) => b.getAttribute('data-act')),
    ['edit', 'custom', 'remove']);
});

test('actions column: disabled entries are not rendered', () => {
  const { td } = cell({ type: 'actions', edit: { enabled: false }, remove: { enabled: false } }, {});
  assert.equal(td.querySelectorAll('button').length, 0);
});

test('actions config can live in options.actions instead of a column', () => {
  const { td } = cell({ label: 'Act', type: 'actions' }, {}, { actions: { edit: { enabled: true } } });
  // The column itself carries no config, so the shared one is used.
  assert.equal(td.querySelectorAll('[data-act="edit"]').length, 0, 'column config wins for an actions column');
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: [{ key: 'id', label: 'ID' }],
    data: [{ id: 1 }],
    actions: { edit: { enabled: true } }
  });
  assert.ok(env.dom);
  assert.equal(t.el.querySelectorAll('[data-act]').length, 0, 'no actions cell without an actions column');
});

test('align, cellClass, className and width reach the markup', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: [{ key: 'id', label: 'ID', align: 'right', cellClass: 'mono', className: 'head-x', width: '80px' }],
    data: [{ id: 1 }]
  });
  assert.ok(env.dom);
  const th = t.el.querySelector('thead th');
  assert.ok(th.classList.contains('head-x'));
  assert.equal(th.getAttribute('style'), 'width:80px');
  const td = t.el.querySelector('tbody td');
  assert.ok(td.classList.contains('vt-align-right'));
  assert.ok(td.classList.contains('mono'));
});

test('sortable:false and actions columns get no sort handle', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: [
      { key: 'a', label: 'A', sortable: false },
      { key: 'b', label: 'B' },
      { label: 'Act', type: 'actions' }
    ],
    data: [{ a: 1, b: 2 }]
  });
  assert.ok(env.dom);
  const sortable = [...t.el.querySelectorAll('thead th')].map((th) => th.classList.contains('vt-sortable'));
  assert.deepEqual(sortable, [false, true, false]);
});

test('dotted keys read nested values', () => {
  const { td } = cell({ key: 'meta.city', label: 'City' }, { meta: { city: 'Berlin' } });
  assert.equal(td.textContent, 'Berlin');
  const missing = cell({ key: 'meta.zip', label: 'Zip' }, { meta: {} }).td;
  assert.equal(missing.textContent, '');
});

test('every non-html column escapes markup in the value', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const types = ['text', 'number', 'copy', 'status', 'textarea', 'download'];
  for (const type of types) {
    const { td } = cell({ key: 'v', type }, { v: payload });
    assert.equal(td.querySelectorAll('img').length, 0, `${type} column must not emit markup`);
  }
  const link = cell({ key: 'v', type: 'link', href: () => 'javascript:alert(1)' }, { v: payload }).td;
  assert.equal(link.querySelectorAll('img').length, 0);
  assert.equal(link.querySelector('a').textContent, payload);
});
