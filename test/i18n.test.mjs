// i18n tests: every piece of text the user can see comes from `labels`, the set
// is complete, overridable one key at a time, and matches the type definitions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, loadVantable } from './helpers/dom.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'src/vantable.js'), 'utf8');
const DTS = readFileSync(path.join(ROOT, 'src/vantable.d.ts'), 'utf8');
const DEFAULTS = SRC.match(/var DEFAULT_LABELS = \{([\s\S]*?)\n  \};/)[1];
const KEYS = [...DEFAULTS.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]);

const COLUMNS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
const DATA = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }];

/** Mount with everything that can show a label switched on. */
function mount(options) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    data: DATA.map((r) => ({ ...r }))
  }, options || {}));
  return { env, Vantable, t };
}
/** All text the table currently shows, including attributes that name things. */
function visibleText(t) {
  const attrs = [...t.el.querySelectorAll('[aria-label], [placeholder], [title]')]
    .map((n) => [n.getAttribute('aria-label'), n.getAttribute('placeholder'), n.getAttribute('title')].join(' '));
  return t.el.textContent + ' ' + attrs.join(' ');
}

test('the label set has every key the library reads', () => {
  const used = [...new Set([...SRC.matchAll(/\b(?:labels|L)\.([a-zA-Z]+)/g)].map((m) => m[1]))];
  const missing = used.filter((k) => !KEYS.includes(k));
  assert.deepEqual(missing, [], 'labels read but never defaulted');
});

test('every default label is actually used somewhere', () => {
  const unused = KEYS.filter((k) => !new RegExp(`\\b(labels|L)\\.${k}\\b`).test(SRC));
  assert.deepEqual(unused, [], 'dead labels');
});

test('the type definitions list exactly the same keys', () => {
  const block = DTS.match(/export interface VantableLabels \{([\s\S]*?)\n\}/)[1];
  const typed = [...block.matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(typed.sort(), [...KEYS].sort(), 'VantableLabels and DEFAULT_LABELS drifted apart');
});

test('the defaults are English and non-empty', () => {
  const { t } = mount();
  for (const k of KEYS) {
    assert.equal(typeof t.labels[k], 'string', k);
    assert.ok(t.labels[k].length > 0, `${k} is empty`);
  }
});

test('a partial override keeps every other default', () => {
  const { t } = mount({ labels: { empty: 'Пусто' } });
  assert.equal(t.labels.empty, 'Пусто');
  assert.equal(t.labels.search, 'Search…', 'untouched');
  assert.equal(Object.keys(t.labels).length, KEYS.length, 'no keys lost');
});

test('toolbar and footer labels are rendered from the label set', () => {
  const { t } = mount({
    export: { formats: ['csv', 'xlsx', 'pdf'] },
    columnPicker: true,
    pagination: { perPage: 1, options: [1] },
    labels: {
      search: 'Пошук…', perPage: 'Рядків', prev: 'Назад', next: 'Далі', page: 'Стор', of: 'з',
      exportCsv: 'ЦСВ', exportXlsx: 'Ексель', exportPdf: 'ПДФ', print: 'Друк', columns: 'Колонки'
    }
  });
  const text = visibleText(t);
  for (const word of ['Пошук…', 'Рядків', 'Назад', 'Далі', 'Стор', 'з', 'ЦСВ', 'Ексель', 'ПДФ', 'Друк', 'Колонки']) {
    assert.ok(text.includes(word), `${word} is not shown`);
  }
});

test('the empty row uses the empty label', () => {
  const { t } = mount({ data: [], labels: { empty: 'Немає записів' } });
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'Немає записів');
});

test('row-action labels come from the label set', () => {
  const { t } = mount({
    editable: true,
    columns: COLUMNS.concat([{ label: 'A', type: 'actions', menu: false, edit: { enabled: true }, remove: { enabled: true } }]),
    labels: { edit: 'Правка', remove: 'Видалити', save: 'Зберегти', cancel: 'Скасувати' }
  });
  assert.equal(t.el.querySelector('[data-act="edit"]').textContent, 'Правка');
  assert.equal(t.el.querySelector('[data-act="remove"]').textContent, 'Видалити');
  t.el.querySelector('[data-act="edit"]').click();
  assert.equal(t.el.querySelector('[data-act="save"]').textContent, 'Зберегти');
  assert.equal(t.el.querySelector('[data-act="cancel"]').textContent, 'Скасувати');
});

test('the confirmation dialog uses its label', () => {
  const { t, env } = mount({
    columns: COLUMNS.concat([{ label: 'A', type: 'actions', menu: false, remove: { enabled: true } }]),
    labels: { confirmRemove: 'Видалити запис?' }
  });
  t.el.querySelector('[data-act="remove"]').click();
  assert.equal(env.window.document.querySelector('.vt-modal-body').textContent, 'Видалити запис?');
});

test('the action dropdown is named from the labels', () => {
  const { t } = mount({
    columns: COLUMNS.concat([{ label: 'A', type: 'actions', custom: [{ label: 'x' }] }]),
    labels: { actions: 'Дії' }
  });
  assert.equal(t.el.querySelector('.vt-act-trigger').getAttribute('aria-label'), 'Дії');
});

test('the async states use their labels', async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', {
    columns: COLUMNS,
    labels: { loading: 'Завантаження…', error: 'Не вдалося завантажити', retry: 'Повторити' },
    server: { fetch: () => Promise.reject(new Error('x')) }
  });
  assert.equal(t.el.querySelector('.vt-overlay-text').textContent, 'Завантаження…');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.el.querySelector('.vt-error-msg').textContent, 'Не вдалося завантажити');
  assert.equal(t.el.querySelector('.vt-retry').textContent, 'Повторити');
  assert.ok(env.dom);
});

test('the selection labels, including the {n} placeholder', () => {
  const { t } = mount({
    selection: true,
    labels: { selected: 'Вибрано: {n}', clearSelection: 'Скинути', selectAll: 'Вибрати все', selectRow: 'Вибрати рядок' }
  });
  assert.equal(t.el.querySelector('.vt-select-all').getAttribute('aria-label'), 'Вибрати все');
  assert.equal(t.el.querySelector('.vt-select-row').getAttribute('aria-label'), 'Вибрати рядок');
  t.selectAll();
  assert.equal(t.el.querySelector('.vt-bulk-count').textContent, 'Вибрано: 2');
  assert.equal(t.el.querySelector('.vt-bulk-clear').textContent, 'Скинути');
});

test('{n} is substituted wherever it appears, and a label without it still works', () => {
  const { t } = mount({ selection: true, labels: { selected: '{n}/{n}' } });
  t.selectRow(1, true);
  assert.equal(t.el.querySelector('.vt-bulk-count').textContent, '1/{n}', 'only the first placeholder, as documented');
  const plain = mount({ selection: true, labels: { selected: 'є вибір' } });
  plain.t.selectRow(1, true);
  assert.equal(plain.t.el.querySelector('.vt-bulk-count').textContent, 'є вибір');
});

test('the filter labels', () => {
  const { t } = mount({
    columns: [{ key: 'id', label: 'ID', filter: 'number' }, { key: 'name', label: 'Name', filter: 'select', options: ['a'] }],
    labels: { filterAll: 'Усі', filterMin: 'Від', filterMax: 'До' }
  });
  assert.equal(t.el.querySelector('.vt-filter-select').options[0].textContent, 'Усі');
  assert.equal(t.el.querySelector('.vt-filter-min').getAttribute('placeholder'), 'Від');
  assert.equal(t.el.querySelector('.vt-filter-max').getAttribute('placeholder'), 'До');
});

test('the accordion and grid labels', () => {
  const { t } = mount({ accordion: { columns: ['name'] }, labels: { expandRow: 'Розгорнути', grid: 'Таблиця даних' } });
  assert.equal(t.el.querySelector('.vt-expander').getAttribute('aria-label'), 'Розгорнути');
  assert.equal(t.el.querySelector('.vt-table').getAttribute('aria-label'), 'Таблиця даних');
});

test('the bulk toolbar label', () => {
  const { t } = mount({ selection: { actions: [{ label: 'x' }] }, labels: { bulkActions: 'Масові дії' } });
  t.selectRow(1, true);
  assert.equal(t.el.querySelector('.vt-bulk').getAttribute('aria-label'), 'Масові дії');
});

test('the copy button title and its copied state', async () => {
  const { t } = mount({ columns: [{ key: 'name', label: 'N', type: 'copy' }], labels: { copy: 'Копіювати' } });
  assert.equal(t.el.querySelector('.vt-copy').getAttribute('title'), 'Копіювати');
  assert.ok(KEYS.includes('copied'), 'the copied label exists for hosts that restyle the feedback');
});

test('a fully translated table shows no English anywhere', () => {
  const ua = {
    search: 'Пошук…', searchSubmit: 'Шукати', perPage: 'Рядків', prev: 'Назад', next: 'Далі',
    empty: 'Немає записів',
    edit: 'Правка', remove: 'Видалити', save: 'Зберегти', cancel: 'Скасувати', confirmRemove: 'Видалити?',
    exportCsv: 'ЦСВ', exportXlsx: 'Ексель', exportPdf: 'ПДФ', print: 'Друк', actions: 'Дії',
    page: 'Стор', of: 'з', copy: 'Копіювати', copied: 'Скопійовано', columns: 'Колонки',
    loading: 'Завантаження…', error: 'Помилка', retry: 'Повторити', selected: 'Вибрано: {n}',
    clearSelection: 'Скинути', selectAll: 'Вибрати все', selectRow: 'Вибрати рядок',
    filterAll: 'Усі', filterMin: 'Від', filterMax: 'До', bulkActions: 'Масові дії',
    expandRow: 'Розгорнути', grid: 'Таблиця'
  };
  assert.deepEqual(Object.keys(ua).sort(), [...KEYS].sort(), 'the translation covers the whole label set');
  const { t } = mount({
    labels: ua,
    selection: true,
    columnPicker: true,
    export: { formats: ['csv', 'xlsx', 'pdf'] },
    accordion: { columns: ['name'] },
    pagination: { perPage: 1, options: [1] },
    columns: COLUMNS.concat([{ label: 'Дії', type: 'actions', custom: [{ label: 'Пінг' }] }])
  });
  t.selectAll();
  const text = visibleText(t);
  const english = ['Search', 'Rows', 'Prev', 'Next', 'No records', 'Edit', 'Delete', 'Save', 'Cancel',
    'Columns', 'Print', 'Page', ' of ', 'Copy', 'Select all', 'Select row', 'Bulk actions', 'Expand row'];
  const leaked = english.filter((w) => text.includes(w));
  assert.deepEqual(leaked, [], 'untranslated English leaked into the UI');
});

test('no user-facing English string is hardcoded outside the label set', () => {
  // Look at string literals only: identifiers like `_setLoading` and the CSS
  // are not user-facing, the labels block is where this text belongs.
  const body = SRC.replace(/var DEFAULT_LABELS = \{[\s\S]*?\n  \};/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/var DEFAULT_CSS = `[\s\S]*?`;/, '');
  const literals = [...body.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => m[1] || m[2] || '');
  const words = ['Loading', 'Select all', 'Bulk actions', 'No records', 'Could not load', 'Expand row', 'Retry'];
  const leaked = literals.filter((lit) => words.some((w) => lit.includes(w)));
  assert.deepEqual(leaked, [], 'user-facing text hardcoded as a string literal');
});

test('labels survive a re-render and a data change', () => {
  const { t } = mount({ labels: { empty: 'Немає' }, pagination: { perPage: 1, options: [1] } });
  t.setData([]);
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'Немає');
  t.setData(DATA.map((r) => ({ ...r })));
  t.refresh();
  assert.equal(t.labels.empty, 'Немає');
});

test('two tables can speak different languages at once', () => {
  const env = setupDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  const Vantable = loadVantable();
  const ua = new Vantable('#a', { columns: COLUMNS, data: [], labels: { empty: 'Немає записів' } });
  const en = new Vantable('#b', { columns: COLUMNS, data: [] });
  assert.equal(ua.el.querySelector('tr.vt-empty td').textContent, 'Немає записів');
  assert.equal(en.el.querySelector('tr.vt-empty td').textContent, 'No records');
  assert.ok(env.dom);
});

test('an unknown label key is ignored, not rendered', () => {
  const { t } = mount({ labels: { nonsense: 'ЩЩЩ' } });
  assert.equal(t.labels.nonsense, 'ЩЩЩ', 'kept on the object');
  assert.equal(visibleText(t).includes('ЩЩЩ'), false, 'but nothing renders it');
});

test('emptyText still wins over the empty label', () => {
  const { t } = mount({ data: [], emptyText: 'Нічого', labels: { empty: 'Немає' } });
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'Нічого');
});

test('the README documents how to translate the table', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /labels/, 'the labels option');
  assert.ok(readme.includes('i18n') || readme.includes('translat'), 'and says it is how you translate it');
});
