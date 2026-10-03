// Editing / row-action tests: inline editors, save & cancel, the edit/custom/
// remove actions with their modal, cell selects and whole-row clicks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number' },
  { key: 'name', label: 'Name', editable: true },
  { key: 'qty', label: 'Qty', type: 'number', editable: true },
  { key: 'note', label: 'Note', type: 'textarea', editable: true },
  { key: 'tier', label: 'Tier', type: 'select', options: [{ value: 'a' }, { value: 'b' }], editable: true },
  { key: 'locked', label: 'Locked' },
  {
    label: 'Act', type: 'actions',
    edit: { enabled: true },
    custom: [{ label: 'Ping' }],
    remove: { enabled: true }
  }
];
const DATA = [
  { id: 1, name: 'Ann', qty: 2, note: 'n1', tier: 'a', locked: 'x' },
  { id: 2, name: 'Bob', qty: 5, note: 'n2', tier: 'b', locked: 'y' }
];

/** Mount the editable fixture (columns/data are copied per test). */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    data: DATA.map((r) => ({ ...r })),
    editable: true
  }, options || {}));
  return { env, Vantable, t };
}

/** The row element with that id. */
const rowOf = (t, id) => t.el.querySelector(`tbody tr.vt-tr[data-id="${id}"]`);

/** Click an action button in a row. */
function act(t, id, name) {
  const btn = rowOf(t, id).querySelector(`[data-act="${name}"]`);
  assert.ok(btn, `${name} button present`);
  btn.click();
  return btn;
}

/** The open modal's buttons. */
const modalButtons = (env) => [...env.window.document.querySelectorAll('.vt-modal-foot button')];

test('Edit turns the editable cells into inputs of the right kind', () => {
  const { t } = mount();
  act(t, 1, 'edit');
  const tr = rowOf(t, 1);
  assert.equal(tr.querySelectorAll('td.vt-editing').length, 4, 'four editable columns');
  assert.equal(tr.querySelector('[data-edit="name"]').tagName, 'INPUT');
  assert.equal(tr.querySelector('[data-edit="name"]').getAttribute('type'), 'text');
  assert.equal(tr.querySelector('[data-edit="qty"]').getAttribute('type'), 'number');
  assert.equal(tr.querySelector('[data-edit="note"]').tagName, 'TEXTAREA');
  assert.equal(tr.querySelector('[data-edit="tier"]').tagName, 'SELECT');
  assert.equal(tr.querySelector('[data-edit="tier"]').value, 'a');
  assert.equal(tr.querySelector('[data-edit="locked"]'), null, 'a non-editable column stays read-only');
  assert.ok(tr.querySelector('[data-act="save"]'), 'Save replaces the row actions');
  assert.ok(tr.querySelector('[data-act="cancel"]'));
  assert.equal(rowOf(t, 2).querySelectorAll('td.vt-editing').length, 0, 'the other row is untouched');
});

test('Edit fires the edit event and the onEdit callback', () => {
  const seenCb = [];
  const seenEv = [];
  const { t } = mount({
    columns: [{ key: 'id', label: 'ID' }, { label: 'Act', type: 'actions', edit: { enabled: true, onEdit: (r) => seenCb.push(r.id) } }]
  });
  t.on('edit', (e) => seenEv.push(e));
  act(t, 1, 'edit');
  assert.deepEqual(seenCb, [1]);
  assert.equal(seenEv.length, 1);
  assert.equal(seenEv[0].id, '1');
});

test('Save collects the changed values, updates the row and reports them', () => {
  const saves = [];
  const { t } = mount({ onSave: (id, changes, r) => saves.push({ id, changes, row: r }) });
  const events = [];
  t.on('save', (e) => events.push(e));
  act(t, 1, 'edit');
  const tr = rowOf(t, 1);
  tr.querySelector('[data-edit="name"]').value = 'Anna';
  tr.querySelector('[data-edit="qty"]').value = '42';
  tr.querySelector('[data-edit="note"]').value = 'changed';
  tr.querySelector('[data-edit="tier"]').value = 'b';
  act(t, 1, 'save');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, '1');
  assert.deepEqual(saves[0].changes, { name: 'Anna', qty: '42', note: 'changed', tier: 'b' });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].changes, saves[0].changes);
  assert.equal(t.data[0].name, 'Anna', 'the local row is updated');
  assert.equal(rowOf(t, 1).querySelectorAll('td.vt-editing').length, 0, 'editing mode left');
  assert.equal(rowOf(t, 1).querySelector('td:nth-child(2)').textContent, 'Anna');
});

test('Cancel drops the editors without touching the data', () => {
  const { t } = mount();
  act(t, 1, 'edit');
  rowOf(t, 1).querySelector('[data-edit="name"]').value = 'Nope';
  act(t, 1, 'cancel');
  assert.equal(rowOf(t, 1).querySelectorAll('td.vt-editing').length, 0);
  assert.equal(t.data[0].name, 'Ann');
});

test('editable:false keeps Edit as a callback only, with no inline editors', () => {
  const { t } = mount({ editable: false });
  act(t, 1, 'edit');
  assert.equal(rowOf(t, 1).querySelectorAll('td.vt-editing').length, 0);
  assert.equal(rowOf(t, 1).querySelector('[data-act="save"]'), null);
});

test('a custom action calls onClick with the row and emits action', () => {
  const calls = [];
  const events = [];
  const cols = COLUMNS.map((c) => (c.type === 'actions'
    ? { label: 'Act', type: 'actions', custom: [{ label: 'A' }, { label: 'B', onClick: (r, ev) => calls.push({ id: r.id, type: ev && ev.type }) }] }
    : { ...c }));
  const { t } = mount({ columns: cols });
  t.on('action', (e) => events.push(e));
  rowOf(t, 2).querySelectorAll('[data-act="custom"]')[1].click();
  assert.deepEqual(calls, [{ id: 2, type: 'click' }]);
  assert.equal(events[0].index, 1);
  assert.equal(events[0].id, '2');
});

test('Remove opens the confirmation modal and does nothing until confirmed', () => {
  const { t, env } = mount();
  act(t, 1, 'remove');
  const box = env.window.document.querySelector('.vt-modal-overlay');
  assert.ok(box, 'modal shown');
  assert.equal(box.querySelector('.vt-modal-body').textContent, t.labels.confirmRemove);
  const buttons = modalButtons(env);
  assert.deepEqual(buttons.map((b) => b.textContent), [t.labels.cancel, t.labels.remove]);
  buttons[0].click();
  assert.equal(env.window.document.querySelector('.vt-modal-overlay'), null, 'modal closed');
  assert.equal(t.data.length, 2, 'nothing removed');
});

test('Remove without a url drops the row locally and emits remove', () => {
  const { t, env } = mount();
  const events = [];
  t.on('remove', (e) => events.push(e));
  act(t, 1, 'remove');
  modalButtons(env)[1].click();
  assert.deepEqual(t.data.map((r) => r.id), [2]);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, true);
  assert.equal(events[0].id, '1');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-tr').length, 1);
});

test('Remove with a url calls the endpoint and reports success', async () => {
  const calls = [];
  const cols = COLUMNS.map((c) => (c.type === 'actions'
    ? {
        label: 'Act', type: 'actions',
        remove: { enabled: true, url: (r) => `/api/users/${r.id}`, method: 'POST', headers: { 'X-T': '1' }, onRemove: (r) => calls.push(`cb:${r.id}`) }
      }
    : { ...c }));
  const { t, env } = mount({ columns: cols });
  const events = [];
  t.on('remove', (e) => events.push(e));
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
  try {
    act(t, 2, 'remove');
    modalButtons(env)[1].click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls[0], 'cb:2', 'onRemove runs first');
    assert.equal(calls[1].url, '/api/users/2');
    assert.equal(calls[1].init.method, 'POST');
    assert.deepEqual(calls[1].init.headers, { 'X-T': '1' });
    assert.equal(events.at(-1).ok, true);
    assert.equal(t.data.length, 2, 'the server owns the data; the local array is kept');
  } finally {
    globalThis.fetch = prev;
  }
});

test('Remove reports a failed request instead of dropping the row', async () => {
  const cols = COLUMNS.map((c) => (c.type === 'actions'
    ? { label: 'Act', type: 'actions', remove: { enabled: true, url: '/api/x' } }
    : { ...c }));
  const { t, env } = mount({ columns: cols });
  const events = [];
  t.on('remove', (e) => events.push(e));
  const prev = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    act(t, 1, 'remove');
    modalButtons(env)[1].click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(events.at(-1).ok, false);
    assert.equal(events.at(-1).error.message, 'offline');
    assert.equal(t.data.length, 2);
  } finally {
    globalThis.fetch = prev;
  }
});

test('the modal closes on an overlay click but not on a click inside', () => {
  const { t, env } = mount();
  act(t, 1, 'remove');
  const overlay = env.window.document.querySelector('.vt-modal-overlay');
  overlay.querySelector('.vt-modal').click();
  assert.ok(env.window.document.querySelector('.vt-modal-overlay'), 'a click inside keeps it open');
  overlay.click();
  assert.equal(env.window.document.querySelector('.vt-modal-overlay'), null);
});

test('a select cell emits cellChange and calls the column onChange', () => {
  const changes = [];
  const events = [];
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'tier', label: 'Tier', type: 'select', options: [{ value: 'a' }, { value: 'b' }], onChange: (r, v) => changes.push([r.id, v]) }
  ];
  const { t } = mount({ columns: cols, editable: false });
  t.on('cellChange', (e) => events.push(e));
  const sel = rowOf(t, 1).querySelector('select.vt-cell-select');
  sel.value = 'b';
  sel.dispatchEvent(new (t.el.ownerDocument.defaultView.Event)('change', { bubbles: true }));
  assert.deepEqual(changes, [[1, 'b']]);
  assert.equal(events[0].column, 'tier');
  assert.equal(events[0].value, 'b');
  assert.equal(events[0].id, '1');
});

test('onRowClick fires for plain cells and not for controls', () => {
  const hits = [];
  const { t } = mount({ onRowClick: (r) => hits.push(r && r.id) });
  rowOf(t, 2).querySelector('td:nth-child(1)').click();
  assert.deepEqual(hits, [2]);
  rowOf(t, 2).querySelector('[data-act="custom"]').click();
  assert.deepEqual(hits, [2], 'a button click is not a row click');
  rowOf(t, 1).querySelector('select').click();
  assert.deepEqual(hits, [2], 'a select click is not a row click');
});

test('copy writes to the clipboard, marks the button and emits copy', async () => {
  const written = [];
  const { t, env } = mount({
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name', type: 'copy' }],
    editable: false
  });
  const events = [];
  t.on('copy', (e) => events.push(e.text));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (txt) => { written.push(txt); } } },
    configurable: true
  });
  try {
    const btn = rowOf(t, 1).querySelector('button.vt-copy');
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(written, ['Ann']);
    assert.deepEqual(events, ['Ann']);
    assert.ok(btn.classList.contains('vt-copied'), 'the button shows feedback');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    assert.ok(env.dom);
  }
});

test('copy falls back to a textarea when the clipboard API is missing', () => {
  const { t, env } = mount({
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name', type: 'copy' }],
    editable: false
  });
  const events = [];
  t.on('copy', (e) => events.push(e.text));
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    rowOf(t, 1).querySelector('button.vt-copy').click();
    assert.deepEqual(events, ['Ann'], 'the event still fires');
    assert.equal(env.window.document.querySelectorAll('body > textarea').length, 0, 'the helper textarea is removed');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  }
});
