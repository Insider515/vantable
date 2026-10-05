// Confirmation-dialog tests: the default markup, the `confirm` look (a title
// and a class of your own on every part) and the theme the dialog inherits from
// the table that opened it — it is a child of <body>, outside .vt-root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/** Mount a table whose only action is Remove, configured as given. */
function mount(remove, extra) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', remove: Object.assign({ enabled: true }, remove) }]),
    data: DATA.map((r) => ({ ...r }))
  }, extra || {}));
  return { env, Vantable, t, doc: env.window.document };
}

/** Click Remove in a row and return the open dialog's parts. */
function openDialog(t, doc, id) {
  const btn = t.el.querySelector(`tbody tr.vt-tr[data-id="${id}"] [data-act="remove"]`);
  assert.ok(btn, 'the remove button is there');
  btn.click();
  const overlay = [...doc.querySelectorAll('.vt-modal-overlay')].pop();
  assert.ok(overlay, 'the dialog is up');
  return {
    overlay,
    box: overlay.querySelector('.vt-modal'),
    head: overlay.querySelector('.vt-modal-head'),
    body: overlay.querySelector('.vt-modal-body'),
    foot: overlay.querySelector('.vt-modal-foot'),
    buttons: [...overlay.querySelectorAll('.vt-modal-foot button')]
  };
}

test('with no confirm option the dialog is exactly what it always was', () => {
  const { t, doc } = mount();
  const d = openDialog(t, doc, 1);
  assert.equal(d.overlay.className, 'vt-modal-overlay');
  assert.equal(d.box.className, 'vt-modal');
  assert.equal(d.body.className, 'vt-modal-body');
  assert.equal(d.foot.className, 'vt-modal-foot');
  assert.equal(d.head, null, 'no heading unless one is asked for');
  assert.equal(d.body.textContent, t.labels.confirmRemove);
  assert.deepEqual(d.buttons.map((b) => b.className), ['vt-btn ', 'vt-btn vt-danger']);
});

test('confirm classes are added to the built-in ones, never instead of them', () => {
  const { t, doc } = mount({
    confirm: {
      overlayClassName: 'my-veil',
      className: 'my-modal',
      bodyClassName: 'my-body',
      footClassName: 'my-foot',
      cancelClassName: 'my-btn',
      confirmClassName: 'my-btn my-btn-red'
    }
  });
  const d = openDialog(t, doc, 1);
  assert.equal(d.overlay.className, 'vt-modal-overlay my-veil');
  assert.equal(d.box.className, 'vt-modal my-modal');
  assert.equal(d.body.className, 'vt-modal-body my-body');
  assert.equal(d.foot.className, 'vt-modal-foot my-foot');
  assert.equal(d.buttons[0].className, 'vt-btn my-btn');
  assert.equal(d.buttons[1].className, 'vt-btn vt-danger my-btn my-btn-red');
});

test('a restyled dialog still removes the row when it is confirmed', () => {
  const { t, doc } = mount({ confirm: { className: 'my-modal', confirmClassName: 'my-btn' } });
  const events = [];
  t.on('remove', (e) => events.push(e));
  openDialog(t, doc, 1).buttons[1].click();
  assert.equal(doc.querySelector('.vt-modal-overlay'), null, 'the dialog closed');
  assert.deepEqual(t.data.map((r) => r.id), [2], 'the row is gone');
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, true);
});

test('a restyled dialog still cancels without touching the data', () => {
  const { t, doc } = mount({ confirm: { cancelClassName: 'my-btn' } });
  openDialog(t, doc, 1).buttons[0].click();
  assert.equal(doc.querySelector('.vt-modal-overlay'), null, 'the dialog closed');
  assert.deepEqual(t.data.map((r) => r.id), [1, 2], 'nothing was removed');
});

test('a title adds a heading above the message', () => {
  const { t, doc } = mount({ confirm: { title: 'Delete the record' } });
  const d = openDialog(t, doc, 1);
  assert.equal(d.head.className, 'vt-modal-head');
  assert.equal(d.head.textContent, 'Delete the record');
  assert.equal(d.box.firstChild, d.head, 'the heading comes first');
  assert.equal(d.box.children[1], d.body, 'then the message');
});

test('an empty title is no title', () => {
  const { t, doc } = mount({ confirm: { title: '' } });
  assert.equal(openDialog(t, doc, 1).head, null);
});

test('a title is text, not markup', () => {
  const { t, doc } = mount({ confirm: { title: '<img src=x onerror=alert(1)>' } });
  const d = openDialog(t, doc, 1);
  assert.equal(d.head.querySelector('img'), null, 'nothing was parsed as HTML');
  assert.equal(d.head.textContent, '<img src=x onerror=alert(1)>');
});

test('a class cannot break out of its attribute', () => {
  const { t, doc } = mount({ confirm: { bodyClassName: '" onmouseover="alert(1)' } });
  const d = openDialog(t, doc, 1);
  assert.ok(d.body, 'the body is still found by its built-in class');
  assert.equal(d.body.getAttribute('onmouseover'), null, 'no attribute was injected');
  assert.equal(d.body.className, 'vt-modal-body " onmouseover="alert(1)');
});

test('the dialog is given the tokens the table resolves to', () => {
  const { t, doc } = mount();
  const { overlay } = openDialog(t, doc, 1);
  // The built-in light theme, read off the table and put on the overlay.
  assert.equal(overlay.style.getPropertyValue('--vt-bg'), '#fff');
  assert.equal(overlay.style.getPropertyValue('--vt-fg'), '#1f2430');
  assert.equal(overlay.style.getPropertyValue('--vt-danger'), '#e35d4b');
  assert.equal(overlay.style.getPropertyValue('--vt-radius'), '8px');
});

test('every token the stylesheet declares reaches the dialog', () => {
  // A token the sheet uses but the overlay never gets would resolve to nothing
  // inside the dialog, which is exactly the bug this copying replaced.
  const declared = [...new Set(
    readFileSync(path.join(ROOT, 'src/vantable.css'), 'utf8').matchAll(/(--vt-[a-z-]+)\s*:/g)
  )].map((m) => m[1]);
  const { t, doc } = mount();
  const { overlay } = openDialog(t, doc, 1);
  const missing = declared.filter((name) => overlay.style.getPropertyValue(name) === '');
  assert.deepEqual(missing, [], 'tokens the dialog did not get');
  assert.ok(declared.length >= 12, `only ${declared.length} tokens found in the sheet`);
});

test('the dialog follows the colour mode of the table that opened it', () => {
  const { t, doc } = mount({}, { mode: 'dark' });
  const { overlay } = openDialog(t, doc, 1);
  assert.equal(overlay.style.getPropertyValue('--vt-bg'), '#161b26', 'the dark background');
  assert.equal(overlay.style.getPropertyValue('--vt-fg'), '#e6e9f0');
});

test('the dialog follows the theme overrides of the table that opened it', () => {
  const { t, doc } = mount({}, { theme: { accent: '#f00', accentFg: '#fff', radius: '4px' } });
  const { overlay } = openDialog(t, doc, 1);
  assert.equal(overlay.style.getPropertyValue('--vt-accent'), '#f00');
  assert.equal(overlay.style.getPropertyValue('--vt-accent-fg'), '#fff', 'camelCase keys still map to --vt-*');
  assert.equal(overlay.style.getPropertyValue('--vt-radius'), '4px');
});

test("the dialog follows the host's own CSS on the table", () => {
  // The whole point of reading the table instead of re-declaring the defaults:
  // a stylesheet the host wrote has to reach the dialog too.
  const { t, doc } = mount({}, { styles: { css: '.vt-root { --vt-accent: #abcdef; --vt-bg: #222; }', extend: true } });
  const { overlay } = openDialog(t, doc, 1);
  assert.equal(overlay.style.getPropertyValue('--vt-accent'), '#abcdef');
  assert.equal(overlay.style.getPropertyValue('--vt-bg'), '#222');
});

test('where the page and the table disagree, the dialog follows the table', () => {
  const env = setupDom('<!doctype html><html><head><style>:root{--vt-bg:#123456}</style></head><body><div id="host"></div></body></html>');
  const Vantable = loadVantable();
  const doc = env.window.document;
  const t = new Vantable('#host', {
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', remove: { enabled: true } }]),
    data: [{ id: 1, name: 'Ann' }]
  });
  assert.equal(env.window.getComputedStyle(t.el).getPropertyValue('--vt-bg'), '#fff', 'the table itself ignores the page');
  assert.equal(openDialog(t, doc, 1).overlay.style.getPropertyValue('--vt-bg'), '#fff', 'and so does its dialog');
});

test('the typography of the table is copied too', () => {
  const { t, doc } = mount();
  const { overlay } = openDialog(t, doc, 1);
  assert.equal(overlay.style.getPropertyValue('font-size'), '13px');
  assert.equal(overlay.style.getPropertyValue('line-height'), '1.45');
  assert.match(overlay.style.getPropertyValue('font-family'), /system-ui/);
});

test('two tables on one page open dialogs themed on their own', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const doc = env.window.document;
  const cols = COLUMNS.concat([{ label: 'Act', type: 'actions', remove: { enabled: true } }]);
  const light = new Vantable('#a', { columns: cols, data: [{ id: 1, name: 'Ann' }], mode: 'light', theme: { accent: '#0f0' } });
  const dark = new Vantable('#b', { columns: cols, data: [{ id: 1, name: 'Ann' }], mode: 'dark', theme: { accent: '#00f' } });

  let d = openDialog(light, doc, 1);
  assert.equal(d.overlay.style.getPropertyValue('--vt-accent'), '#0f0');
  assert.equal(d.overlay.style.getPropertyValue('--vt-bg'), '#fff');
  d.buttons[0].click();

  d = openDialog(dark, doc, 1);
  assert.equal(d.overlay.style.getPropertyValue('--vt-accent'), '#00f');
  assert.equal(d.overlay.style.getPropertyValue('--vt-bg'), '#161b26');
});

test('a document without a window to compute with still opens the dialog', () => {
  const { t, doc } = mount();
  const el = t.el;
  // ownerDocument.defaultView is how the computed style is reached; a document
  // detached from a window must not throw, it just copies nothing.
  Object.defineProperty(el.ownerDocument, 'defaultView', { value: null, configurable: true });
  const d = openDialog(t, doc, 1);
  assert.equal(d.overlay.getAttribute('style'), null, 'nothing copied');
  assert.ok(d.box, 'the dialog is still built');
  d.buttons[1].click();
  assert.deepEqual(t.data.map((r) => r.id), [2], 'and it still works');
});

test('neither stylesheet declares the theme tokens on the overlay', () => {
  // Declaring them there overrode whatever the page had set on an ancestor,
  // which is the regression this test exists to catch.
  const css = readFileSync(path.join(ROOT, 'src/vantable.css'), 'utf8');
  const embedded = readFileSync(path.join(ROOT, 'src/vantable.js'), 'utf8')
    .match(/var DEFAULT_CSS = `([\s\S]*?)`;/)[1];
  // Comments are dropped (this very rule is explained in one) and @media
  // wrappers unwrapped, so a nested rule is checked by its own selector.
  const rules = (text) => [...text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{/g, '')
    .matchAll(/([^{}]+)\{([^}]*)\}/g)];

  for (const [name, text] of [['src/vantable.css', css], ['the embedded copy', embedded]]) {
    const all = rules(text);
    assert.ok(all.length > 50, `${name}: only ${all.length} rules parsed`);
    const declaring = all.filter((m) => /--vt-[a-z-]+\s*:/.test(m[2]));
    assert.ok(declaring.length >= 3, `${name}: the token rules were not found`);
    for (const m of declaring) {
      assert.equal(/\.vt-modal/.test(m[1]), false,
        `${name}: a token is declared on "${m[1].trim()}"`);
    }
    // Which is why .vt-modal must keep its own fallbacks, for the cases where
    // nothing could be copied (no window, or a host stylesheet of their own).
    assert.match(text, /\.vt-modal\s*\{[^}]*var\(--vt-bg,\s*#fff\)/, `${name}: .vt-modal lost its background fallback`);
    assert.match(text, /var\(--vt-fg,\s*#1f2430\)/, `${name}: .vt-modal lost its colour fallback`);
    assert.match(text, /\.vt-modal-head/, `${name}: the heading has no style`);
  }
});

test('the table-level actions option restyles the dialog of a column button', () => {
  // The buttons come from the actions column, while _action() reads the config
  // of `options.actions` when there is one — so that is where its look is read.
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', remove: { enabled: true } }]),
    data: [{ id: 1, name: 'Ann' }],
    actions: { remove: { enabled: true, confirm: { className: 'from-options' } } }
  });
  assert.equal(openDialog(t, env.window.document, 1).box.className, 'vt-modal from-options');
});

test("with options.actions present, a column's own remove config is not read", () => {
  // Documented in README because it is surprising: the look configured on the
  // column is ignored, exactly like its url would be.
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS.concat([{ label: 'Act', type: 'actions', remove: { enabled: true, confirm: { className: 'from-column' } } }]),
    data: [{ id: 1, name: 'Ann' }],
    actions: { edit: { enabled: true } }
  });
  assert.equal(openDialog(t, env.window.document, 1).box.className, 'vt-modal');
});

/** Capture every fetch the library makes for the duration of one test. */
function withFetch(run) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return { ok: true, status: 200 }; };
  try { run(calls); } finally { globalThis.fetch = real; }
}

test('destroy() takes the open dialog down with the table', () => {
  const { t, doc } = mount({ url: '/api/x/1' });
  withFetch((calls) => {
    openDialog(t, doc, 1);
    t.destroy();
    assert.equal(doc.querySelector('.vt-modal-overlay'), null, 'the dialog is gone from the page');
    assert.equal(doc.querySelector('.vt-modal-foot button'), null, 'with nothing left to confirm with');
    assert.deepEqual(calls, [], 'and destroy itself asks for nothing');
  });
});

test('destroy() is a no-op for a table with no dialog open', () => {
  const { t } = mount();
  assert.doesNotThrow(() => t.destroy());
});

test('destroy() after the dialog was dismissed by hand does not throw', () => {
  const { t, doc } = mount();
  openDialog(t, doc, 1).buttons[0].click();
  assert.equal(doc.querySelector('.vt-modal-overlay'), null);
  assert.doesNotThrow(() => t.destroy());
});

test('closing an older dialog keeps the one that is still up closeable', () => {
  // Two dialogs of the same table: the handle must point at the newer one, and
  // dismissing the older one must not clear it.
  const { t, doc } = mount();
  const first = openDialog(t, doc, 1);
  const second = openDialog(t, doc, 2);
  assert.equal(doc.querySelectorAll('.vt-modal-overlay').length, 2);
  first.buttons[0].click();
  assert.equal(doc.querySelectorAll('.vt-modal-overlay').length, 1, 'the older one closed');
  t.destroy();
  assert.equal(doc.querySelector('.vt-modal-overlay'), null, 'and destroy still closed the newer one');
  assert.equal(second.overlay.parentNode, null);
});

test("destroy() leaves another table's dialog alone", () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const doc = env.window.document;
  const cols = COLUMNS.concat([{ label: 'Act', type: 'actions', remove: { enabled: true } }]);
  const first = new Vantable('#a', { columns: cols, data: [{ id: 1, name: 'Ann' }] });
  const second = new Vantable('#b', { columns: cols, data: [{ id: 1, name: 'Ann' }] });
  const kept = openDialog(second, doc, 1).overlay;
  openDialog(first, doc, 1);
  first.destroy();
  const left = [...doc.querySelectorAll('.vt-modal-overlay')];
  assert.deepEqual(left, [kept], "only the destroyed table's dialog was closed");
});
