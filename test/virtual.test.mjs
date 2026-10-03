// Virtualization tests: only the rows in view are rendered, the spacers keep the
// scroll height, scrolling moves the window, and the rest of the table (export,
// keyboard, pins, search) still sees the whole dataset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const COLUMNS = [{ key: 'id', label: 'ID', type: 'number' }, { key: 'name', label: 'Name' }];
/** A dataset of `n` rows. */
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'row' + i }));

/** Mount a table over `n` rows. */
function mount(options, n) {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', Object.assign({
    columns: COLUMNS.map((c) => ({ ...c })),
    data: rows(n == null ? 1000 : n),
    pagination: false
  }, options || {}));
  return { env, Vantable, t };
}

/**
 * jsdom performs no layout, so the scroll box reports no height and scrollTop
 * never moves: give it both, and a scrollTo() that fires a real scroll event.
 */
function viewport(t, height) {
  const sc = t.el.querySelector('.vt-scroll');
  let top = 0;
  Object.defineProperty(sc, 'clientHeight', { get: () => height, configurable: true });
  Object.defineProperty(sc, 'scrollTop', { get: () => top, set: (v) => { top = Math.max(0, v); }, configurable: true });
  return {
    el: sc,
    scrollTo(px) {
      sc.scrollTop = px;
      sc.dispatchEvent(new sc.ownerDocument.defaultView.Event('scroll'));
    }
  };
}

/** The rendered data rows. */
const rendered = (t) => [...t.el.querySelectorAll('tbody tr.vt-tr')];
/** The ids of the rendered rows. */
const renderedIds = (t) => rendered(t).map((tr) => Number(tr.getAttribute('data-id')));
/** The spacer heights above and below the window. */
function spacers(t) {
  const all = [...t.el.querySelectorAll('tbody tr.vt-spacer')];
  return all.map((tr) => parseFloat(tr.style.height));
}

test('without the option every row is rendered', () => {
  const { t } = mount({}, 300);
  assert.equal(rendered(t).length, 300);
  assert.equal(t.virtual, null);
  assert.equal(t.el.classList.contains('vt-virtual'), false);
});

test('a virtual table with no measured viewport still shows its rows', () => {
  const { t } = mount({ virtual: true }, 120);
  assert.ok(t.el.classList.contains('vt-virtual'));
  assert.equal(t._virtualOn(), false, 'jsdom reports no height');
  assert.equal(rendered(t).length, 120, 'so nothing is windowed away');
  assert.equal(spacers(t).length, 0);
});

test('only the window plus overscan is rendered, spacers stand in for the rest', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 2 } }, 1000);
  viewport(t, 200);
  t.refresh();
  // 200px / 20px = 10 rows in view, + 2 * 2 overscan, window starts at 0.
  assert.deepEqual(renderedIds(t), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(spacers(t), [(1000 - 14) * 20], 'only the bottom spacer is needed at the top');
  assert.equal(t._range.start, 0);
  assert.equal(t._range.end, 14);
});

test('the spacers preserve the full scroll height', () => {
  const { t } = mount({ virtual: { rowHeight: 25, overscan: 3 } }, 400);
  const vp = viewport(t, 250);
  t.refresh();
  vp.scrollTo(2000);
  const [padTop, padBottom] = [t._range.padTop, t._range.padBottom];
  const total = padTop + rendered(t).length * 25 + padBottom;
  assert.equal(total, 400 * 25, 'window + spacers == the whole dataset');
  assert.deepEqual(spacers(t), [padTop, padBottom]);
});

test('scrolling moves the window and reports the new range', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 1 } }, 500);
  const vp = viewport(t, 100);
  t.refresh();
  const ranges = [];
  t.on('virtualRange', (e) => ranges.push(e));
  vp.scrollTo(1000);                       // row 50 at the top
  assert.deepEqual(renderedIds(t)[0], 49, 'one row of overscan above');
  assert.equal(t._range.start, 49);
  assert.equal(ranges.length, 1);
  assert.deepEqual(ranges[0], { start: 49, end: 56, total: 500 });
  vp.scrollTo(0);
  assert.equal(renderedIds(t)[0], 0);
  assert.equal(ranges.length, 2);
});

test('a scroll inside the current window does not re-render', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 4 } }, 500);
  const vp = viewport(t, 200);
  t.refresh();
  const ranges = [];
  t.on('virtualRange', (e) => ranges.push(e));
  const firstRow = rendered(t)[0];
  vp.scrollTo(5);                          // same row window
  assert.deepEqual(ranges, []);
  assert.equal(rendered(t)[0], firstRow, 'the DOM was left alone');
});

test('the last window ends at the dataset and needs no bottom spacer', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 2 } }, 50);
  const vp = viewport(t, 200);
  t.refresh();
  vp.scrollTo(50 * 20);                    // past the end
  assert.equal(t._range.end, 50);
  assert.equal(renderedIds(t).at(-1), 49);
  assert.equal(t._range.padBottom, 0);
  assert.equal(spacers(t).length, 1, 'only the top spacer is left');
});

test('a measured row height replaces the configured one', () => {
  const { t, env } = mount({ virtual: { rowHeight: 20, overscan: 0 } }, 300);
  viewport(t, 200);
  t.refresh();
  assert.equal(t._rowH, 20, 'the configured height until the browser lays a row out');
  // Rows are re-created on every render, so the stub goes on the prototype.
  Object.defineProperty(env.window.HTMLTableRowElement.prototype, 'offsetHeight', {
    get() { return this.classList.contains('vt-tr') ? 40 : 0; },
    configurable: true
  });
  t.refresh();
  assert.equal(t._rowH, 40, 'the real height wins');
  t.refresh();
  assert.equal(rendered(t).length, 5, '200px / 40px');
  delete env.window.HTMLTableRowElement.prototype.offsetHeight;
});

test('screen readers get the full row count and absolute row indexes', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 0 } }, 1000);
  const vp = viewport(t, 100);
  t.refresh();
  const table = t.el.querySelector('.vt-table');
  assert.equal(table.getAttribute('aria-rowcount'), '1000');
  vp.scrollTo(400);                        // row 20 at the top
  assert.equal(rendered(t)[0].getAttribute('aria-rowindex'), '22', 'header is row 1, data starts at 2');
  assert.equal(rendered(t).at(-1).getAttribute('aria-rowindex'), String(20 + rendered(t).length + 1));
});

test('spacer rows are not part of the keyboard grid', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 1 } }, 500);
  const vp = viewport(t, 100);
  t.refresh();
  vp.scrollTo(1000);
  assert.equal(t._navRows().length, rendered(t).length + 1, 'header + rendered rows only');
  assert.equal(t.el.querySelectorAll('tbody tr.vt-spacer[tabindex]').length, 0);
});

test('arrow keys step the window at its edges', () => {
  const { t, env } = mount({ virtual: { rowHeight: 20, overscan: 0 }, keyboard: true }, 500);
  const vp = viewport(t, 100);
  t.refresh();
  assert.deepEqual(renderedIds(t), [0, 1, 2, 3, 4]);
  const press = (k) => env.window.document.activeElement
    .dispatchEvent(new env.window.KeyboardEvent('keydown', { key: k, bubbles: true }));

  t.el.querySelector('thead th').focus();
  for (let i = 0; i < 5; i++) press('ArrowDown');            // onto the last rendered row
  assert.equal(env.window.document.activeElement.closest('tr').getAttribute('data-id'), '4');
  press('ArrowDown');                                         // past the window
  assert.equal(vp.el.scrollTop, 20, 'the window scrolled by one row');
  assert.deepEqual(renderedIds(t), [1, 2, 3, 4, 5]);
  assert.equal(env.window.document.activeElement.closest('tr').getAttribute('data-id'), '5');

  press('ArrowUp'); press('ArrowUp'); press('ArrowUp'); press('ArrowUp');
  assert.equal(env.window.document.activeElement.closest('tr').getAttribute('data-id'), '1');
  press('ArrowUp');                                           // above the window
  assert.equal(vp.el.scrollTop, 0, 'scrolled back up');
  assert.equal(env.window.document.activeElement.closest('tr').getAttribute('data-id'), '0');
  press('ArrowUp');
  assert.equal(env.window.document.activeElement.tagName, 'TH', 'the header is still reachable at the top');
});

test('search and sort still run over the whole dataset', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 0 }, search: 'live', sort: 'client' }, 1000);
  viewport(t, 100);
  t.refresh();
  t.state.q = 'row987';
  t.refresh();
  assert.deepEqual(renderedIds(t), [987], 'a match far outside the first window');
  assert.equal(spacers(t).length, 0, 'one row needs no spacers');
  t.state.q = '';
  t.state.sort = 'id';
  t.state.dir = 'desc';
  t.refresh();
  assert.equal(renderedIds(t)[0], 999, 'the window shows the new order');
});

test('virtualization works inside a page of a paginated table', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 1 }, pagination: { perPage: 100, options: [100] } }, 1000);
  const vp = viewport(t, 100);
  t.refresh();
  assert.equal(t.state.total, 1000);
  assert.equal(t._range.end, 7, 'the window covers the viewport, not the page');
  assert.equal(t._range.padBottom, (100 - 7) * 20, 'the spacer spans the page only');
  vp.scrollTo(100 * 20);
  assert.equal(renderedIds(t).at(-1), 99, 'the last row of the page');
});

test('an accordion switches virtualization off (its rows are not uniform)', () => {
  const { t } = mount({ virtual: true, accordion: { columns: ['name'] } }, 200);
  assert.equal(t.virtual, null);
  assert.equal(t.el.classList.contains('vt-virtual'), false);
  assert.equal(rendered(t).length, 200);
});

test('an empty dataset renders the empty row, not spacers', () => {
  const { t } = mount({ virtual: true, emptyText: 'nothing' }, 0);
  viewport(t, 200);
  t.refresh();
  assert.equal(t.el.querySelector('tr.vt-empty td').textContent, 'nothing');
  assert.equal(spacers(t).length, 0);
  assert.equal(t._range, null);
});

test('row actions and editing work on a row inside the window', () => {
  const { t } = mount({
    virtual: { rowHeight: 20, overscan: 0 },
    editable: true,
    columns: [{ key: 'name', label: 'Name', editable: true }, { label: 'Act', type: 'actions', edit: { enabled: true } }]
  }, 500);
  const vp = viewport(t, 100);
  t.refresh();
  vp.scrollTo(2000);                        // around row 100
  const tr = rendered(t)[0];
  const id = tr.getAttribute('data-id');
  tr.querySelector('[data-act="edit"]').click();
  const input = t.el.querySelector(`tr[data-id="${id}"] input[data-edit="name"]`);
  assert.ok(input, 'the rendered row can be edited');
  input.value = 'edited';
  t.el.querySelector(`tr[data-id="${id}"] [data-act="save"]`).click();
  assert.equal(t.data[Number(id)].name, 'edited');
});

test('pinned columns keep their offsets after a scroll re-render', () => {
  const { t } = mount({
    virtual: { rowHeight: 20, overscan: 0 },
    columns: [{ key: 'id', label: 'ID', width: '60px', pin: 'left' }, { key: 'name', label: 'Name', width: '120px' }]
  }, 500);
  const vp = viewport(t, 100);
  t.refresh();
  vp.scrollTo(1000);
  const firstCell = rendered(t)[0].children[0];
  assert.ok(firstCell.classList.contains('vt-pin-left'));
  assert.equal(firstCell.style.left, '0px');
});

test('the export covers the dataset, not the rendered window', async () => {
  const { t, env } = mount({ virtual: { rowHeight: 20, overscan: 0 }, export: { formats: ['csv'], filename: 'all' } }, 1000);
  viewport(t, 100);
  t.refresh();
  assert.equal(rendered(t).length, 5);
  assert.equal(t._buildPayload('xlsx').rows.length, 1000);
  t.el.querySelector('.vt-export[data-format="csv"]').click();
  await new Promise((r) => setTimeout(r, 0));
  const csv = (await blobBytes(env.blobs.at(-1))).toString('utf8').slice(1);
  assert.equal(csv.split('\r\n').length, 1001, 'header + every row');
});

test('scrollToRow jumps to a row and renders it', () => {
  const { t } = mount({ virtual: { rowHeight: 20, overscan: 0 } }, 1000);
  const vp = viewport(t, 100);
  t.refresh();
  assert.equal(t.scrollToRow(600), t, 'chainable');
  assert.equal(vp.el.scrollTop, 600 * 20);
  assert.ok(renderedIds(t).includes(600));
  t.scrollToRow(99999);
  assert.equal(t._range.end, 1000, 'clamped to the last row');
  t.scrollToRow(-5);
  assert.equal(vp.el.scrollTop, 0);
});

test('scrollToRow falls back to scrollIntoView without virtualization', () => {
  const { t } = mount({}, 20);
  const seen = [];
  rendered(t).forEach((tr, i) => { tr.scrollIntoView = (opt) => seen.push([i, opt]); });
  t.scrollToRow(7);
  assert.deepEqual(seen, [[7, { block: 'nearest' }]]);
  t.scrollToRow();
  assert.deepEqual(seen.at(-1), [0, { block: 'nearest' }], 'no argument means the first row');
});

test('a scroll after destroy() does nothing', () => {
  const { t } = mount({ virtual: { rowHeight: 20 } }, 100);
  const vp = viewport(t, 100);
  t.refresh();
  t.destroy();
  vp.scrollTo(500);                         // the scroller is detached by now
  assert.equal(t.el.innerHTML, '');
});

test('the shipped CSS carries the spacer rule', () => {
  assert.ok(loadVantable().css.includes('.vt-spacer>td{padding:0;border:0}'));
});

test('a scroll event without a measured viewport is ignored', () => {
  const { t, env } = mount({ virtual: { rowHeight: 20 } }, 100);
  const ranges = [];
  t.on('virtualRange', (e) => ranges.push(e));
  t.el.querySelector('.vt-scroll').dispatchEvent(new env.window.Event('scroll'));
  assert.deepEqual(ranges, []);
  assert.equal(rendered(t).length, 100, 'everything stays rendered');
});

test('a scroll on a table without virtualization is ignored', () => {
  const { t } = mount({}, 20);
  t._onVirtualScroll();
  assert.equal(rendered(t).length, 20);
});

test('arrow down on the last row of the dataset stays put', () => {
  const { t, env } = mount({ virtual: { rowHeight: 20, overscan: 0 } }, 4);
  viewport(t, 200);                         // the viewport holds all four rows
  t.refresh();
  assert.equal(t._range.end, 4);
  t.el.querySelector('thead th').focus();
  const press = () => env.window.document.activeElement
    .dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  for (let i = 0; i < 6; i++) press();      // more presses than rows
  assert.equal(env.window.document.activeElement.closest('tr').getAttribute('data-id'), '3');
  assert.equal(t.el.querySelector('.vt-scroll').scrollTop, 0, 'nothing left to scroll to');
});

test('the virtual helpers tolerate a zero row height and an empty body', () => {
  const { t } = mount({ virtual: { rowHeight: 20 } }, 50);
  viewport(t, 100);
  t.refresh();
  t._rowH = 0;                              // nothing measured yet
  t.scrollToRow(5);
  assert.equal(t.el.querySelector('.vt-scroll').scrollTop, 5 * 20, 'falls back to the option');
  t.$tbody.innerHTML = '';
  t._measureRowHeight();
  assert.equal(t._rowH, 0, 'with no row to measure the measurement leaves it alone');
  // The option is the fallback at every use site, so the window still adds up.
  const r = t._virtualRange(50);
  assert.equal(r.padTop + (r.end - r.start) * 20 + r.padBottom, 50 * 20);
});

test('a row rendered without an index carries no aria-rowindex', () => {
  const { t } = mount({}, 3);
  assert.ok(!/aria-rowindex/.test(t._rowHtml(t.data[0])));
  assert.match(t._rowHtml(t.data[0], 7), /aria-rowindex="9"/);
});

test('scrollToRow is inert without a scroll box or a loaded view', async () => {
  const { t } = mount({ virtual: { rowHeight: 20 } }, 10);
  t.$scroll = null;
  assert.equal(t.scrollToRow(3), t, 'nothing to scroll');

  const env = setupDom();
  const Vantable = loadVantable();
  const server = new Vantable('#host', {
    columns: COLUMNS.map((c) => ({ ...c })),
    virtual: { rowHeight: 20 },
    server: { fetch: () => new Promise(() => {}) }      // never resolves
  });
  assert.equal(server._view, undefined, 'no page yet');
  assert.equal(server.scrollToRow(5), server);
  assert.equal(server.el.querySelector('.vt-scroll').scrollTop, 0);
  assert.ok(env.dom);
});

test('a scroll over an empty virtual table reports nothing', () => {
  const { t, env } = mount({ virtual: { rowHeight: 20 } }, 0);
  const vp = viewport(t, 200);
  t.refresh();
  const ranges = [];
  t.on('virtualRange', (e) => ranges.push(e));
  vp.scrollTo(100);
  assert.deepEqual(ranges, []);
  t._view = undefined;
  t.el.querySelector('.vt-scroll').dispatchEvent(new env.window.Event('scroll'));
  assert.deepEqual(ranges, []);
});

test('the keyboard stepping falls back to the configured row height', () => {
  const { t, env } = mount({ virtual: { rowHeight: 20, overscan: 0 }, keyboard: true }, 100);
  const vp = viewport(t, 100);
  t.refresh();
  t._rowH = 0;                                  // nothing measured
  t.el.querySelector('thead th').focus();
  for (let i = 0; i < 6; i++) {
    env.window.document.activeElement
      .dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  }
  assert.equal(vp.el.scrollTop, 20, 'stepped by the option height');
});
