// CSRF / request tests: exactly which requests the library makes by itself,
// what it puts on them, and how a CSRF-protected form inside a cell behaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'src/vantable.js'), 'utf8');
const TOKEN = 'tok-123';
const COLUMNS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/** Mount a table and capture every fetch it makes. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init: init || {} });
    return { ok: true, status: 200, blob: async () => new Blob(['x']) };
  };
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS.map((c) => ({ ...c })), data: DATA.map((r) => ({ ...r })) }, options || {}));
  return { env, Vantable, t, calls, restore: () => { globalThis.fetch = realFetch; } };
}
/** Confirm the delete dialog that the remove action opened. */
const confirm = (env) => env.window.document.querySelectorAll('.vt-modal-foot button')[1].click();

test('the library makes no request of its own until something is configured', async () => {
  const { t, calls, restore } = mount({ export: { formats: ['csv'] }, selection: true });
  try {
    t.refresh();
    t.exportCsv();
    t.selectAll();
    t.el.querySelector('thead th[data-sort="name"]').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls, [], 'CSV, sorting and selection are entirely local');
  } finally { restore(); }
});

test('there are exactly two places where the library itself calls fetch', () => {
  const sites = [...SRC.matchAll(/fetch\(/g)].length;
  assert.equal(sites, 2, 'the remove action and serverExport — everything else is yours');
  assert.match(SRC, /fetch\(url, \{ method: rm\.method \|\| 'DELETE', headers: rm\.headers \|\| \{\} \}\)/);
});

test('the remove action sends the CSRF header you give it', async () => {
  const { t, env, calls, restore } = mount({
    columns: COLUMNS.concat([{
      label: 'A', type: 'actions', menu: false,
      remove: { enabled: true, url: (r) => `/api/users/${r.id}`, headers: { 'X-CSRF-TOKEN': TOKEN } }
    }])
  });
  try {
    t.el.querySelector('[data-act="remove"]').click();
    confirm(env);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/users/1');
    assert.equal(calls[0].init.method, 'DELETE', 'the documented default');
    assert.deepEqual(calls[0].init.headers, { 'X-CSRF-TOKEN': TOKEN });
  } finally { restore(); }
});

test('the header set may be computed per table (one token, every row)', async () => {
  const csrf = () => ({ 'X-CSRF-TOKEN': TOKEN, 'X-Requested-With': 'XMLHttpRequest' });
  const { t, env, calls, restore } = mount({
    columns: COLUMNS.concat([{
      label: 'A', type: 'actions', menu: false,
      remove: { enabled: true, url: '/api/users', method: 'POST', headers: csrf() }
    }])
  });
  try {
    t.el.querySelector('[data-act="remove"]').click();
    confirm(env);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls[0].init.method, 'POST', 'frameworks that tunnel DELETE over POST work too');
    assert.equal(calls[0].init.headers['X-Requested-With'], 'XMLHttpRequest');
  } finally { restore(); }
});

test('no headers configured means no headers invented', async () => {
  const { t, env, calls, restore } = mount({
    columns: COLUMNS.concat([{ label: 'A', type: 'actions', menu: false, remove: { enabled: true, url: '/x' } }])
  });
  try {
    t.el.querySelector('[data-act="remove"]').click();
    confirm(env);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls[0].init.headers, {}, 'nothing is added behind your back');
    assert.equal('credentials' in calls[0].init, false,
      'credentials is left at the browser default (same-origin), so session cookies go along');
  } finally { restore(); }
});

test('a failed removal (403 from the CSRF guard) is reported, not swallowed', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('403 Forbidden'); };
  try {
    const t = new Vantable('#host', {
      columns: COLUMNS.concat([{ label: 'A', type: 'actions', menu: false, remove: { enabled: true, url: '/x' } }]),
      data: DATA.map((r) => ({ ...r }))
    });
    const events = [];
    t.on('remove', (e) => events.push(e));
    t.el.querySelector('[data-act="remove"]').click();
    confirm(env);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(events.at(-1).ok, false);
    assert.equal(events.at(-1).error.message, '403 Forbidden');
    assert.equal(t.data.length, 2, 'and the row stays until the server agrees');
  } finally { globalThis.fetch = realFetch; }
});

test('a rejected removal does not re-render, so your error UI survives', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('419'); };
  try {
    const t = new Vantable('#host', {
      columns: COLUMNS.concat([{ label: 'A', type: 'actions', menu: false, remove: { enabled: true, url: '/x' } }]),
      data: DATA.map((r) => ({ ...r }))
    });
    const renders = [];
    t.on('render', () => renders.push(1));
    t.el.querySelector('[data-act="remove"]').click();
    confirm(env);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(renders, []);
  } finally { globalThis.fetch = realFetch; }
});

test('serverExport sends the CSRF header along with the payload', async () => {
  const { t, Vantable, calls, restore } = mount({ exportName: 'users' });
  try {
    await Vantable.serverExport('/service/export', { headers: { 'X-CSRF-TOKEN': TOKEN } })(t._buildPayload('xlsx'));
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['X-CSRF-TOKEN'], TOKEN);
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.ok(JSON.parse(calls[0].init.body).rows.length, 'and the payload is JSON');
    await new Promise((r) => setTimeout(r, 0));
  } finally { restore(); }
});

test('your Content-Type wins if you need a different one', async () => {
  const { t, Vantable, calls, restore } = mount();
  try {
    await Vantable.serverExport('/x', { headers: { 'Content-Type': 'application/vnd.api+json', 'X-CSRF-TOKEN': TOKEN } })(t._buildPayload('pdf'));
    assert.equal(calls[0].init.headers['Content-Type'], 'application/vnd.api+json');
    await new Promise((r) => setTimeout(r, 0));
  } finally { restore(); }
});

test('the server source is entirely yours: the library adds nothing to it', async () => {
  const seen = [];
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS,
    server: {
      fetch: async (req) => {
        // A host wiring CSRF does it here, with its own fetch call.
        seen.push(req);
        return { rows: DATA, total: 2 };
      }
    }
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['dir', 'page', 'perPage', 'q', 'sort'],
    'only query state — no headers, no transport, nothing to intercept');
  assert.ok(env.dom);
  t.destroy();
});

test('a CSRF-protected form inside an html column renders intact', () => {
  const { t, restore } = mount({
    columns: COLUMNS.concat([{
      label: 'Form', type: 'html',
      render: (v, row) => `<form method="post" action="/users/${row.id}/ban">` +
        `<input type="hidden" name="_csrf" value="${TOKEN}">` +
        '<button type="submit" class="btn">Ban</button></form>'
    }])
  });
  try {
    const form = t.el.querySelector('tbody form');
    assert.ok(form, 'the form survived rendering');
    assert.equal(form.getAttribute('action'), '/users/1/ban');
    const token = form.querySelector('input[name="_csrf"]');
    assert.ok(token, 'the hidden token is still there');
    assert.equal(token.value, TOKEN, 'and is not escaped away');
  } finally { restore(); }
});

test('submitting such a form is not intercepted by the table', () => {
  const submits = [];
  const { t, env, restore } = mount({
    onRowClick: () => submits.push('rowclick'),
    columns: COLUMNS.concat([{
      label: 'Form', type: 'html',
      render: () => '<form method="post" action="/x"><input type="hidden" name="_csrf" value="t"><button type="submit">Go</button></form>'
    }])
  });
  try {
    const form = t.el.querySelector('tbody form');
    form.addEventListener('submit', (e) => { e.preventDefault(); submits.push('submit'); });
    form.querySelector('button').click();
    assert.deepEqual(submits, ['submit'], 'the submit fired, and it was not treated as a row click');
    assert.ok(env.dom);
  } finally { restore(); }
});

test('a form in a cell is reachable by keyboard through the grid', () => {
  const { t, env, restore } = mount({
    columns: COLUMNS.concat([{
      label: 'Form', type: 'html',
      render: () => '<form method="post"><input type="hidden" name="_csrf" value="t"><button type="submit">Go</button></form>'
    }])
  });
  try {
    const button = t.el.querySelector('tbody form button');
    // Controls inside cells are taken out of the page Tab order on purpose…
    assert.equal(button.getAttribute('tabindex'), '-1');
    // …and reached through the grid: Enter on the cell activates the only control.
    const cell = button.closest('td');
    cell.setAttribute('tabindex', '0');
    cell.focus();
    let fired = false;
    cell.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); fired = true; });
    cell.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(fired, true, 'Enter on the cell submitted the form');
  } finally { restore(); }
});

test('a re-render rebuilds the cell, so a form in it loses typed state', () => {
  const { t, restore } = mount({
    columns: COLUMNS.concat([{
      label: 'Form', type: 'html',
      render: () => '<form><input name="comment" value=""></form>'
    }])
  });
  try {
    t.el.querySelector('tbody input[name="comment"]').value = 'typed by the user';
    t.refresh();
    assert.equal(t.el.querySelector('tbody input[name="comment"]').value, '',
      'documented: keep editable state in the row data (editable columns) or outside the table');
  } finally { restore(); }
});

test('the hidden token is not readable through the exported data', () => {
  const { t, restore } = mount({
    columns: COLUMNS.concat([{ label: 'Form', type: 'html', render: () => `<input type="hidden" value="${TOKEN}">` }])
  });
  try {
    const payload = t._buildPayload('csv');
    const dumped = JSON.stringify(payload);
    assert.equal(dumped.includes(TOKEN), false, 'the export carries values, not rendered markup');
  } finally { restore(); }
});

test('the inline editor saves through your callback, not through a request', () => {
  const saves = [];
  const { t, calls, restore } = mount({
    editable: true,
    onSave: (id, changes) => saves.push({ id, changes }),
    columns: [{ key: 'name', label: 'Name', editable: true },
      { label: 'A', type: 'actions', menu: false, edit: { enabled: true } }]
  });
  try {
    t.el.querySelector('[data-act="edit"]').click();
    t.el.querySelector('input[data-edit="name"]').value = 'Anna';
    t.el.querySelector('[data-act="save"]').click();
    assert.deepEqual(saves, [{ id: '1', changes: { name: 'Anna' } }]);
    assert.deepEqual(calls, [], 'no request is made for you — add your own CSRF-protected one');
  } finally { restore(); }
});

test('the README tells integrators where to put the token', () => {
  const en = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const uk = readFileSync(path.join(ROOT, 'README.uk.md'), 'utf8');
  for (const [name, md] of [['README.md', en], ['README.uk.md', uk]]) {
    assert.ok(md.includes('CSRF'), `${name} never mentions CSRF`);
    assert.match(md, /headers/, `${name}: and how to send a header`);
  }
});
