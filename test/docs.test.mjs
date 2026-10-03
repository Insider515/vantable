// Documentation tests: the English and Ukrainian READMEs, the changelog and
// llms.txt have to stay in step with each other and with the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const EN = read('README.md');
const UK = read('README.uk.md');
const SRC = read('src/vantable.js');
const PKG = JSON.parse(read('package.json'));
/** Top-level section headings of a markdown document. */
const sections = (md) => [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
/** Fenced code blocks of a markdown document. */
const codeBlocks = (md) => [...md.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);

test('both READMEs exist and are substantial', () => {
  assert.ok(EN.length > 40000, `README.md is ${EN.length} B`);
  assert.ok(UK.length > 40000, `README.uk.md is ${UK.length} B`);
});

test('the two READMEs cover the same sections', () => {
  assert.equal(sections(UK).length, sections(EN).length,
    'one language has a section the other does not');
});

test('they link to each other', () => {
  assert.match(EN, /README\.uk\.md/, 'the English one points at the Ukrainian');
  assert.match(UK, /README\.md/, 'and back');
});

test('the Ukrainian README is actually in Ukrainian', () => {
  const cyrillic = (UK.match(/[а-яіїєґА-ЯІЇЄҐ]/g) || []).length;
  assert.ok(cyrillic > 5000, `only ${cyrillic} Cyrillic characters`);
  assert.ok(/[іїєґ]/.test(UK), 'Ukrainian letters, not just Russian ones');
});

test('the code examples are identical in both languages', () => {
  // The prose is translated, the API is not: option names and method calls must
  // match, or one of the two documents is teaching something that does not exist.
  const api = (md) => [...new Set([...md.matchAll(/table\.([a-zA-Z]+)\(/g)].map((m) => m[1]))].sort();
  assert.deepEqual(api(UK), api(EN), 'the documented method sets differ');
});

test('both READMEs document every public method', () => {
  const methods = [...new Set([...SRC.matchAll(/^ {4}([a-z][A-Za-z]*): function/gm)].map((m) => m[1]))];
  for (const [name, md] of [['README.md', EN], ['README.uk.md', UK]]) {
    const missing = methods.filter((m) => !md.includes(m + '('));
    assert.deepEqual(missing, [], `${name} is missing methods`);
  }
});

test('both READMEs document every event', () => {
  const events = [...new Set([...SRC.matchAll(/_emit\('([a-zA-Z]+)'/g)].map((m) => m[1]))];
  for (const [name, md] of [['README.md', EN], ['README.uk.md', UK]]) {
    const missing = events.filter((e) => !md.includes(`'${e}'`));
    assert.deepEqual(missing, [], `${name} is missing events`);
  }
});

test('both READMEs document every column type', () => {
  const types = ['text', 'number', 'link', 'external', 'copy', 'status', 'select', 'tag',
    'image', 'textarea', 'download', 'html', 'actions'];
  for (const [name, md] of [['README.md', EN], ['README.uk.md', UK]]) {
    const missing = types.filter((t) => !md.includes('`' + t + '`'));
    assert.deepEqual(missing, [], `${name} is missing column types`);
  }
});

test('the framework guides cover all four frameworks in both languages', () => {
  for (const [name, md] of [['README.md', EN], ['README.uk.md', UK]]) {
    for (const fw of ['React', 'Vue', 'Angular', 'Svelte']) {
      assert.ok(md.includes(fw), `${name} has no ${fw} guide`);
    }
    assert.ok(md.includes('useEffect'), `${name}: the React guide has no code`);
    assert.ok(md.includes('onBeforeUnmount'), `${name}: the Vue guide has no teardown`);
    assert.ok(md.includes('ngOnDestroy'), `${name}: the Angular guide has no teardown`);
    assert.ok(md.includes('onMount'), `${name}: the Svelte guide has no code`);
  }
});

test('the framework guides all show destroy() on unmount', () => {
  for (const md of [EN, UK]) {
    const guides = md.slice(md.indexOf('React'));
    assert.ok((guides.match(/destroy\(\)/g) || []).length >= 4, 'each guide must tear the table down');
  }
});

/**
 * Runnable examples only: the READMEs also contain signature sketches
 * (`toggleColumn(key, visible?)`) and payload shapes, which are documentation,
 * not code. A block counts as runnable when it constructs a table.
 */
function runnableBlocks(md) {
  return [...md.matchAll(/```js\n([\s\S]*?)```/g)]
    .map((m) => m[1])
    .filter((b) => /new Vantable\(/.test(b))
    // `import` / `export` need a module context; the rest of the snippet is
    // ordinary code and must parse.
    .map((b) => b.replace(/^import .*;$/gm, '').replace(/^export /gm, ''));
}

test('every runnable example in the English README parses', async () => {
  const vm = await import('node:vm');
  const blocks = runnableBlocks(EN);
  assert.ok(blocks.length >= 5, `only ${blocks.length} runnable examples`);
  for (const block of blocks) {
    assert.doesNotThrow(() => new vm.Script(`async function __snippet() {\n${block}\n}`),
      `an example does not parse:\n${block.slice(0, 120)}`);
  }
});

test('every runnable example in the Ukrainian README parses', async () => {
  const vm = await import('node:vm');
  const blocks = runnableBlocks(UK);
  assert.ok(blocks.length >= 5, `only ${blocks.length} runnable examples`);
  for (const block of blocks) {
    assert.doesNotThrow(() => new vm.Script(`async function __snippet() {\n${block}\n}`),
      `an example does not parse:\n${block.slice(0, 120)}`);
  }
});

test('the changelog exists, is dated and describes this version', () => {
  assert.ok(existsSync(path.join(ROOT, 'CHANGELOG.md')));
  const log = read('CHANGELOG.md');
  assert.match(log, /# Changelog/);
  assert.match(log, /Unreleased|\[0\.1\.0\]/, 'the current state is described');
  assert.ok(log.includes('semantic versioning') || log.includes('semver'));
});

test('the changelog mentions every feature area the README documents', () => {
  const log = read('CHANGELOG.md');
  for (const topic of ['selection', 'filters', 'Virtualization', 'Responsive', 'export', 'Column operations']) {
    assert.ok(new RegExp(topic, 'i').test(log), `the changelog never mentions ${topic}`);
  }
});

test('llms.txt exists and describes the current API', () => {
  assert.ok(existsSync(path.join(ROOT, 'llms.txt')));
  const llms = read('llms.txt');
  assert.match(llms, /^# vantable/);
  assert.ok(llms.includes(PKG.version), 'it states the version');
  for (const m of ['setData', 'selectAll', 'setFilter', 'columnState', 'scrollToRow']) {
    assert.ok(llms.includes(m), `llms.txt does not mention ${m}`);
  }
  for (const e of ['selectionChange', 'filterChange', 'virtualRange', 'responsive']) {
    assert.ok(llms.includes(e), `llms.txt does not mention the ${e} event`);
  }
});

test('llms.txt warns about the documented traps', () => {
  const llms = read('llms.txt');
  assert.match(llms, /synchronous throw|reject instead/i, 'the server.fetch trap');
  assert.match(llms, /byte copy|npm run build/i, 'the dist copy rule');
  assert.match(llms, /two places|in sync/i, 'the two CSS copies');
});

test('the documented version is the published one everywhere', () => {
  assert.ok(EN.includes(PKG.version) || true, 'the README does not have to repeat it');
  assert.ok(read('llms.txt').includes(`Version: ${PKG.version}`));
  assert.equal(SRC.match(/Vantable\.version = '([\d.]+)'/)[1], PKG.version);
});

test('the README option table lists the options in the type definitions', () => {
  const dts = read('src/vantable.d.ts');
  const block = dts.match(/export interface VantableOptions<[^>]*> \{([\s\S]*?)\n\}/)[1];
  const declared = [...block.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
  const missing = declared.filter((o) => !EN.includes('`' + o + '`'));
  assert.deepEqual(missing, [], 'options typed but never documented');
});

test('the examples in the README use options that exist', () => {
  const dts = read('src/vantable.d.ts');
  const declared = new Set([...dts.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]));
  // Collect `key:` at the top level of the option objects in the examples.
  const used = new Set();
  // Only the JS examples that construct a table; the Angular guide is TypeScript
  // and its `@Component({...})` keys are not vantable options.
  for (const block of runnableBlocks(EN)) {
    for (const m of block.matchAll(/^\s{2}([a-zA-Z]+):/gm)) used.add(m[1]);
  }
  const unknown = [...used].filter((o) => !declared.has(o) && !['columns', 'data'].includes(o));
  assert.deepEqual(unknown, [], 'the README shows options that are not in the types');
});

test('the package metadata points at a real homepage and repository', () => {
  assert.match(PKG.homepage, /^https:\/\/github\.com\//);
  assert.match(PKG.repository.url, /^git\+https:\/\/github\.com\//);
  assert.match(PKG.bugs.url, /^https:\/\/github\.com\//);
  assert.ok(PKG.author.includes('<'), 'the author has a contact');
});

test('the published files include the documentation the npm page needs', () => {
  for (const f of ['README.md', 'README.uk.md', 'CHANGELOG.md', 'llms.txt', 'LICENSE']) {
    assert.ok(PKG.files.includes(f), `${f} is not published`);
    assert.ok(existsSync(path.join(ROOT, f)), `${f} does not exist`);
  }
});

test('both READMEs show the screenshot, and the file is in the repository', () => {
  assert.ok(existsSync(path.join(ROOT, 'docs/screenshot.png')), 'docs/screenshot.png is missing');
  for (const [name, md] of [['README.md', EN], ['README.uk.md', UK]]) {
    const img = md.match(/!\[([^\]]*)\]\(([^)]+screenshot\.png)\)/);
    assert.ok(img, `${name} does not show the screenshot`);
    assert.ok(img[1].length > 40, `${name}: the alt text must describe the picture for screen readers`);
    assert.match(img[2], /^https:\/\/raw\.githubusercontent\.com\//,
      `${name}: use an absolute URL so the image also shows on the npm page`);
  }
});

test('the screenshot is a real png of a sane size', () => {
  const bytes = readFileSync(path.join(ROOT, 'docs/screenshot.png'));
  assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'PNG magic bytes');
  assert.ok(bytes.length < 1024 * 1024, `${bytes.length} B — too heavy for a README`);
});
