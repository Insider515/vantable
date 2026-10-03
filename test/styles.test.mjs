// Stylesheet tests: the built-in CSS by default, your own CSS instead of it, or
// both — injected once per document, without touching anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }];
const MINE = '.vt-table { border: 2px dashed hotpink; }';
const ALSO = '.vt-th { text-transform: uppercase; }';

/** Mount with the given `styles` option. */
function mount(styles, extra) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({ columns: COLUMNS, data: DATA, styles }, extra || {}));
  return { env, Vantable, t, doc: env.window.document };
}
/** All stylesheets the library put into this document. */
const styleTags = (doc) => [...doc.querySelectorAll('style[id^="vantable-"]')];
/** All stylesheet links the library put into this document. */
const linkTags = (doc) => [...doc.querySelectorAll('link[data-vantable-style]')];

test('by default the built-in stylesheet is injected', () => {
  const { doc } = mount(undefined);
  const tags = styleTags(doc);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].id, 'vantable-default-styles');
  assert.ok(tags[0].textContent.includes('.vt-table'));
});

test('styles:true is the same as leaving it out', () => {
  const { doc } = mount(true);
  assert.deepEqual(styleTags(doc).map((s) => s.id), ['vantable-default-styles']);
});

test('styles:false injects nothing at all', () => {
  const { doc, t } = mount(false);
  assert.deepEqual(styleTags(doc), []);
  assert.deepEqual(linkTags(doc), []);
  assert.ok(t.el.querySelector('.vt-table'), 'the table still renders');
});

test('a CSS string replaces the built-in stylesheet', () => {
  const { doc } = mount(MINE);
  const tags = styleTags(doc);
  assert.equal(tags.length, 1, 'ours is not injected alongside');
  assert.equal(tags[0].textContent, MINE);
  assert.match(tags[0].id, /^vantable-styles-\d+$/);
  assert.equal(doc.getElementById('vantable-default-styles'), null);
});

test('the object form takes the same CSS', () => {
  const { doc } = mount({ css: MINE });
  assert.deepEqual(styleTags(doc).map((s) => s.textContent), [MINE]);
});

test('extend:true keeps the built-in stylesheet underneath yours', () => {
  const { doc } = mount({ css: MINE, extend: true });
  const tags = styleTags(doc);
  assert.equal(tags.length, 2);
  assert.equal(tags[0].id, 'vantable-default-styles', 'ours comes first, so yours wins the cascade');
  assert.equal(tags[1].textContent, MINE);
});

test('extend:true on its own just injects the built-in stylesheet', () => {
  const { doc } = mount({ extend: true });
  assert.deepEqual(styleTags(doc).map((s) => s.id), ['vantable-default-styles']);
});

test('the same CSS is never injected twice', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  new Vantable('#a', { columns: COLUMNS, data: DATA, styles: MINE });
  new Vantable('#b', { columns: COLUMNS, data: DATA, styles: MINE });
  assert.equal(styleTags(env.window.document).length, 1, 'one element for two tables');
});

test('two different stylesheets can live side by side', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  new Vantable('#a', { columns: COLUMNS, data: DATA, styles: MINE });
  new Vantable('#b', { columns: COLUMNS, data: DATA, styles: ALSO });
  const texts = styleTags(env.window.document).map((s) => s.textContent);
  assert.deepEqual(texts, [MINE, ALSO]);
  assert.equal(new Set(styleTags(env.window.document).map((s) => s.id)).size, 2, 'distinct ids');
});

test('href links an external stylesheet, once', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  new Vantable('#a', { columns: COLUMNS, data: DATA, styles: { href: '/css/my-table.css' } });
  new Vantable('#b', { columns: COLUMNS, data: DATA, styles: { href: '/css/my-table.css' } });
  const links = linkTags(env.window.document);
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('rel'), 'stylesheet');
  assert.equal(links[0].getAttribute('href'), '/css/my-table.css');
  assert.equal(styleTags(env.window.document).length, 0, 'and the built-in CSS is replaced, not added');
});

test('css and href can be used together', () => {
  const { doc } = mount({ css: MINE, href: '/theme.css' });
  assert.equal(styleTags(doc).length, 1);
  assert.equal(linkTags(doc).length, 1);
});

test('an href with quotes cannot break the duplicate check', () => {
  const { doc } = mount({ href: '/a".css' });
  assert.equal(linkTags(doc).length, 1);
  assert.equal(linkTags(doc)[0].getAttribute('href'), '/a".css');
});

test('an empty stylesheet means no stylesheet', () => {
  assert.deepEqual(styleTags(mount('').doc), [], 'an empty string');
  assert.deepEqual(styleTags(mount({}).doc), [], 'an empty object');
  assert.deepEqual(styleTags(mount({ css: '' }).doc), [], 'an empty css field');
});

test('Vantable.injectStyles() still injects the defaults by hand', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  Vantable.injectStyles();
  assert.deepEqual(styleTags(env.window.document).map((s) => s.id), ['vantable-default-styles']);
  Vantable.injectStyles();
  assert.equal(styleTags(env.window.document).length, 1, 'idempotent');
});

test('Vantable.injectStyles(css) injects your own', () => {
  const env = setupDom();
  const Vantable = loadVantable();
  Vantable.injectStyles(MINE);
  Vantable.injectStyles(MINE);
  const tags = styleTags(env.window.document);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].textContent, MINE);
});

test('each document gets its own copy', () => {
  const first = mount(MINE);
  assert.equal(styleTags(first.doc).length, 1);
  const second = mount(MINE);
  assert.equal(styleTags(second.doc).length, 1, 'a fresh page is styled again');
});

test('custom styles do not disturb theme variables or the colour mode', () => {
  const { t } = mount(MINE, { theme: { accent: '#f00' }, mode: 'dark' });
  assert.equal(t.el.style.getPropertyValue('--vt-accent'), '#f00');
  assert.equal(t.el.getAttribute('data-vt-theme'), 'dark');
});

test('the built-in CSS is still available as a string to build on', () => {
  const { Vantable, doc } = mount({ css: MINE });
  assert.ok(Vantable.css.includes('.vt-root'), 'Vantable.css is the defaults, untouched');
  assert.equal(styleTags(doc)[0].textContent, MINE, 'even while a custom sheet is in use');
});

test('a table with replaced styles keeps all its class names', () => {
  const { t } = mount(MINE, { selection: true, columns: COLUMNS.concat([{ label: 'A', type: 'actions', custom: [{ label: 'x' }] }]) });
  for (const cls of ['.vt-root', '.vt-table', '.vt-th', '.vt-td', '.vt-select-row', '.vt-act-trigger']) {
    assert.ok(t.el.querySelector(cls) || t.el.matches(cls), `${cls} is still there to style`);
  }
});

test('style injection stays a no-op on the server', () => {
  const sandbox = { module: { exports: {} }, console };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(ROOT, 'src/vantable.js'), 'utf8'), sandbox);
  const Vantable = sandbox.module.exports;
  assert.doesNotThrow(() => Vantable.injectStyles());
  assert.doesNotThrow(() => Vantable.injectStyles('.x{}'));
});

test('the README documents every form of the styles option', () => {
  const en = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const uk = readFileSync(path.join(ROOT, 'README.uk.md'), 'utf8');
  for (const [name, md] of [['README.md', en], ['README.uk.md', uk]]) {
    assert.ok(md.includes('styles: false'), `${name}: the opt-out`);
    assert.ok(md.includes('styles: true'), `${name}: the explicit default`);
    assert.match(md, /styles: *(myCss|['`])/, `${name}: your CSS as text`);
    assert.ok(md.includes('{ css:'), `${name}: the object form`);
    assert.ok(md.includes('extend: true'), `${name}: keeping ours underneath`);
    assert.ok(md.includes("href: '/css/my-table.css'"), `${name}: linking a stylesheet`);
    assert.ok(md.includes('injectStyles('), `${name}: the manual static`);
  }
});
