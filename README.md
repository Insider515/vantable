# vantable

> 🇺🇦 Українська версія: [README.uk.md](README.uk.md)

Zero-dependency vanilla-JS data table for dashboards. No jQuery, no Bootstrap, no XLSX.
Multiple independent instances per page.

It merges the features that used to be spread across several separate dashboard table
components into one configurable component:

- **client-side** search / sort / pagination
- **server-side** search / sort / pagination (via a `fetch` callback)
- **rich column types**: `text`, `number`, `link`, `external`, `copy`, `status`, `select`/`tag`, `image`, `textarea`, `download`, `html` (custom render), `actions`
- **row actions**: edit / remove (built-in confirm modal) / custom
- **inline row editing** with a save callback
- **accordion** master/detail expandable rows
- **CSV export** and **print** (dependency-free)

<img src="https://raw.githubusercontent.com/Insider515/vantable/master/docs/screenshot.png" alt="The demo page in dark mode: a table with thirteen column types — avatars, links, copy buttons, status badges, inline selects, traffic bars and download buttons — a toolbar with the search box, the Columns menu and the export buttons, an open row-action dropdown with six entries, and the pager at the bottom" width="640">

## Install

```bash
npm install vantable
```

or via CDN (global `Vantable`):

```html
<link rel="stylesheet" href="https://unpkg.com/vantable/src/vantable.css">
<script src="https://unpkg.com/vantable/dist/vantable.umd.js"></script>
```

## Usage

```js
import Vantable from 'vantable';
// No CSS import needed — the default stylesheet is injected automatically.
// (See "Styling" below to customise, opt out, or link the CSS yourself.)

const table = new Vantable('#host', {
  rowId: 'id',
  columns: [
    { key: 'id',       label: 'ID',     type: 'number', width: '60px' },
    { key: 'username', label: 'User',   type: 'link', href: r => `/users/${r.id}`, editable: true },
    { key: 'token',    label: 'Token',  type: 'copy' },
    { key: 'status',   label: 'Status', type: 'status',
      map: { 1: { label: 'Enabled', color: '#22a06b' }, 2: { label: 'Disabled', color: '#e35d4b' } } },
    { key: 'note',     label: 'Note',   type: 'textarea', editable: true },
    { label: 'Actions', type: 'actions',
      edit:   { enabled: true },
      custom: [{ label: 'Ping', onClick: row => ping(row) }],
      remove: { enabled: true, url: r => `/api/users/${r.id}`, method: 'DELETE' } }
  ],
  data: rows,
  editable: true,
  pagination: { perPage: 50, options: [50, 100, 250, 500] },
  onSave: (id, changes, row) => save(id, changes)
});
```

Works with `<script>` too — the global is `Vantable`.

## Options

| option | type | description |
|---|---|---|
| `columns` | array | column definitions (see below) — required |
| `data` | array | client-side rows |
| `rowId` | string | id field name (default `"id"`) |
| `search` | `'live'` \| `'server'` \| `false` | search mode (see **Search & sort modes**); default follows the source |
| `searchFields` | array | which keys the search looks at; **omitted → all columns** |
| `filters` | bool \| `'client'` \| `'server'` | mode of the per-column filters (see **Per-column filters**); the columns opt in themselves |
| `sort` | `'client'` \| `'server'` \| `false` | sort mode; default follows the source |
| `pagination` | bool \| `{ perPage, options }` | pager (default `{ perPage:50, options:[50,100,250,500] }`); `false` to disable |
| `server` | `{ fetch }` | server data source for `'server'` search/sort/pagination (see below) |
| `editable` | bool | enable inline row editing |
| `onSave` | `(id, changes, row) => void` | called on inline save |
| `actions` | `{ edit, remove, custom }` | row actions when not using an `actions` column |
| `accordion` | `{ render(row) }` or `{ columns }` | expandable detail rows |
| `export` | bool \| `{ formats, filename, adapters }` | export buttons (see **Export**); CSV built in, XLSX/PDF via adapters |
| `printable` | bool | print button (default `true`) |
| `resize` | bool | drag a header edge to set column widths (see **Column operations**) |
| `reorder` | bool | drag a header onto another one to move the column |
| `columnPicker` | bool | toolbar menu with a checkbox per column |
| `stickyHeader` | bool | header stays put while the body scrolls (needs `maxHeight`) |
| `virtual` | bool \| `{ rowHeight, overscan }` | render only the rows in view (see **Virtualization**) |
| `responsive` | bool \| `{ breakpoint }` | stack rows into cards on a narrow table (see **Responsive**) |
| `states` | bool \| `{ loading, skeleton, error, retry }` | async states (see **Loading / error / skeleton**); on by default |
| `selection` | bool \| `{ mode, header, selectable, actions }` | row checkboxes + bulk actions (see **Row selection**) |
| `maxHeight` | string \| number | height of the scroll box, e.g. `'60vh'` / `420` |
| `minColWidth` | number | floor for a drag-resize, in px (default `48`) |
| `emptyText` | string | shown when there are no rows |
| `defaultSort` / `defaultDir` | string | column key and `'asc'`/`'desc'` the table starts sorted by |
| `exportName` | string | base filename for exports (default `'table'`) |
| `exportable` | bool | **deprecated** — use `export` |
| `keyboard` | bool | grid keyboard navigation (default `true`) |
| `styles` | bool \| string \| `{ css, href, extend }` | which stylesheet to inject: ours, yours, both or none (see **Styling**) |
| `theme` | object | CSS-variable overrides, e.g. `{ accent:'#f00' }` |
| `mode` | `'dark'` \| `'light'` | force the colour mode |
| `label` | string | accessible name of the grid (`aria-label`) |
| `labelledby` | string | id of the element that names the grid (`aria-labelledby`) |
| `labels` | object | i18n overrides (see `DEFAULT_LABELS`) |

## Column types

`{ key, label, type, sortable, editable, align, width, className }` plus the
column-operation props `{ pin, hidden, resizable, reorderable }` (see
**Column operations**), `filter` (see **Per-column filters**), plus per-type:

- `text` / `number` — plain value (`prefix` / `suffix` supported)
- `link` — `{ href: row=>url | string, target, text }`
- `external` — opens in a new tab with an ↗ marker
- `copy` — value + copy-to-clipboard button
- `status` — `{ map: { value: { label, color } } }` → colored badge
- `select` / `tag` — `{ options: [{value,label}], onChange(row, value) }`
- `image` — `{ src: row=>url }` (or the cell value)
- `download` — `{ filename, text }`, downloads the cell value as a file
- `html` — `{ render: (value, row) => htmlString }` (raw, not escaped)
- `actions` — `{ edit, remove, custom:[{label, onClick, className}], menu }` —
  the actions sit in a **dropdown** by default (see **Row actions**)

All other types are HTML-escaped automatically. Only `html` renders raw markup.

## Search & sort modes

Search and sort each have **two independent modes** you choose when embedding:

- **`'live'` / `'client'`** — filters / sorts the rows already loaded in the
  browser (instant, no request). Great for datasets that fit on the client.
- **`'server'` / `'db'`** — sends the query to `server.fetch` so the **database**
  does the real search / sort across the whole table — the correct choice when
  rows are paginated server-side (a client filter would only touch the current
  page).

```js
// all in the browser (live)
new Vantable('#host', { columns, data, search: 'live', sort: 'client' });

// real DB search + DB sort + server pagination
new Vantable('#host', {
  columns,
  search: 'server',
  sort:   'server',
  searchFields: ['username', 'email'],   // which columns to search; omit = all
  server: { fetch: async ({ page, perPage, q, sort, dir, fields }) => ({ rows, total }) }
});
```

If you don't pass `search` / `sort`, the mode follows the source: **client** when
you pass `data`, **server** when you pass `server.fetch`. You can also mix (e.g.
server pagination but `search: 'live'` to filter just the loaded page). `false`
turns a feature off.

**`searchFields`** controls which fields the search matches. If omitted, all data
columns are searched (actions and `searchable:false` columns are skipped). In
server mode the list is also passed to `fetch` as `fields` so the DB can scope the
query.

## Server mode

Provide `server.fetch`; it is called on every server-mode search / sort / page /
per-page change, and receives only the parts that are in server mode:

```js
new Vantable('#host', {
  columns,
  server: {
    fetch: async ({ page, perPage, q, sort, dir }) => {
      const res = await fetch(`/api/users?page=${page}&per_page=${perPage}&q=${q}&sort=${sort}&dir=${dir}`);
      const json = await res.json();
      return { rows: json.data, total: json.meta.total };
    }
  },
  pagination: { perPage: 50 }
});
```

## Events

```js
table.on('save',   ({ id, changes, row }) => {});
table.on('remove', ({ id, row, ok }) => {});
table.on('edit',   ({ id, row }) => {});
table.on('action', ({ id, index, row }) => {});
table.on('cellChange', ({ id, column, value, row }) => {});
table.on('expand', ({ id, open, row }) => {});
table.on('copy',   ({ text }) => {});
table.on('render', ({ rows }) => {});       // after every paint
table.on('destroy', () => {});
table.on('export', ({ format, rows }) => {});
table.on('error',  (err) => {});   // failed fetch, failed/absent export adapter

table.on('columnResize',     ({ key, width }) => {});
table.on('columnMove',       ({ key, from, to, order }) => {});
table.on('columnPin',        ({ key, pin }) => {});
table.on('columnVisibility', ({ key, hidden }) => {});
table.on('virtualRange',     ({ start, end, total }) => {});
table.on('loading',          ({ loading }) => {});
table.on('filterChange',     ({ key, value, filters }) => {});
table.on('responsive',       ({ stacked, width }) => {});
table.on('selectionChange',  ({ ids, rows, count }) => {});
table.on('bulkAction',       ({ index, label, ids, rows }) => {});
```

## API

```js
table.setData(rows);   // replace client dataset
table.refresh();       // re-render (re-fetch in server mode)
table.exportCsv(name); // trigger CSV export
table.print();         // print current table
table.scrollToRow(i);  // bring row i of the current view into view
table.isStacked();     // true while the responsive card mode is on
table.setLoading(on);  // loading state for data you fetch yourself
table.setError(err);   // show an error state; null clears it

// Filters:
table.setFilter(key, value);  // '' or null clears that one
table.getFilter(key);
table.filters();              // every value, empty ones included
table.activeFilters();        // only the ones that narrow the data
table.clearFilters();

// Selection:
table.selectRow(id, on?);  // no second argument flips it
table.selectAll();         // every selectable row of the current view (page)
table.clearSelection();    // including rows that are off screen
table.selectedIds();       // ['1', '7', ...] — the whole selection
table.selectedRows();      // the rows that can be resolved right now
table.selectedCount();
table.isSelected(id);
table.destroy();       // remove from DOM

// Column operations (all chainable):
table.toggleColumn(key, visible?);  // no second argument flips it
table.hideColumn(key);
table.showColumn(key);
table.moveColumn(key, index);
table.setColumnWidth(key, '120px'); // or a number of px
table.pinColumn(key, 'left');       // 'right' | false to unpin
table.columnOrder();                // ['id', 'name', ...]
table.columnState();                // [{ key, hidden, width, pin }, ...]
table.setColumnState(snapshot);     // restore order + visibility + widths + pins
```

Statics:

```js
Vantable.version;                       // '0.1.0'
Vantable.css;                           // the default stylesheet as a string
Vantable.injectStyles(css?);            // inject a stylesheet (defaults when omitted)
Vantable.serverExport(url, opts);       // export adapter: POST payload -> file
Vantable.sheetJsExport(opts);           // export adapter: SheetJS, in-browser
Vantable.jsPdfExport(opts);             // export adapter: jsPDF, in-browser
```

## Export (CSV / XLSX / PDF)

**CSV is built in and dependency-free.** XLSX and PDF work through optional
**adapters** — so the package ships zero dependencies and you choose how the
heavy formats are produced.

```js
new Vantable('#host', {
  columns, data,
  export: {
    formats: ['csv', 'xlsx', 'pdf'],   // which buttons to show (default ['csv'])
    filename: 'users',
    adapters: {
      xlsx: Vantable.serverExport('/service/export'),
      pdf:  Vantable.serverExport('/service/export')
    }
  }
});
```

An adapter is just `(payload) => void | Promise<void>`, where the payload is

```js
{ format, filename, columns: [{ key, label }], rows: [{ key: value }] }
```

It covers the rows currently in view: all client rows after search/sort in client
mode, the fetched page in server mode. Columns of type `actions` are left out.

### Three ready-made adapters

| Adapter | Where the file is built | Needs |
|---|---|---|
| `Vantable.serverExport(url, { headers })` | your backend (**recommended**) | an endpoint that returns the file |
| `Vantable.sheetJsExport({ lib, sheetName })` | the browser | [SheetJS](https://sheetjs.com) (`xlsx`) on the page or in `lib` |
| `Vantable.jsPdfExport({ lib, orientation, unit, format, fontSize, margin })` | the browser | [jsPDF](https://github.com/parallax/jsPDF) in `lib`; uses `jspdf-autotable` when present |

```js
// a) server-side (Go binary, see below) — nothing to load in the browser
adapters: { xlsx: Vantable.serverExport('/service/export') }

// b) third-party libraries, in the browser (they are NOT bundled)
adapters: {
  xlsx: Vantable.sheetJsExport({ lib: XLSX, sheetName: 'Users' }),
  pdf:  Vantable.jsPdfExport({ lib: jspdf.jsPDF, fontSize: 9 })
}
```

Both library adapters throw a clear error when the library is missing. jsPDF
renders non-Latin text only with a Unicode font registered by your page; the Go
binary handles fonts itself.

### The default: a Go binary, not a service

`tools/vtexport` turns the payload into a real `.xlsx` / `.pdf` (`excelize` /
`fpdf`). It reads JSON on stdin and writes the file to stdout — your app pipes
data through it, there is nothing to keep running. PDF columns are sized by
content and long values wrap onto extra lines; Cyrillic needs a Unicode TTF
(auto-detected, overridable with `$VTEXPORT_FONT`), and without one the text is
reduced to Latin-1 instead of failing. See `tools/vtexport/README.md` for the
build and a ready AdonisJS endpoint.

### When a format has no adapter

The button emits an `error` event (`no export adapter for "pdf"`) and produces
the built-in CSV, so a missing adapter is visible instead of silent:

```js
table.on('error', (err) => console.warn(err.message));
```

## Column operations

Resize, reorder, pin, show/hide and a sticky header. All of them are **opt-in**:
a table without these options behaves exactly as before.

```js
new Vantable('#host', {
  columns: [
    { key: 'id',    label: 'ID',      width: 70, pin: 'left', resizable: false },
    { key: 'name',  label: 'Name',    width: 180 },
    { key: 'token', label: 'Token',   hidden: true },
    { label: 'Actions', type: 'actions', pin: 'right', reorderable: false }
  ],
  data,
  resize: true,          // drag a header edge
  reorder: true,         // drag a header onto another one
  columnPicker: true,    // "Columns" menu in the toolbar
  stickyHeader: true,    // header stays while the body scrolls…
  maxHeight: '60vh'      // …which needs a bounded scroll box
});
```

| per column | meaning |
|---|---|
| `pin: 'left' \| 'right'` | freeze the column to that edge of the scroll box |
| `hidden: true` | start out hidden (the `columnPicker` can bring it back) |
| `width: 180 \| '180px'` | starting width; drag-resizing overwrites it |
| `resizable: false` | exclude from drag-resizing |
| `reorderable: false` | exclude from drag-reordering |

**Resize** — drag the 7px handle at the right edge of a header
(`.vt-resizer`). The width never goes below `minColWidth` (48px). Once the
widths are known the table switches to `table-layout: fixed`, so dragging one
column no longer reflows the others. The release of a drag does not sort.

**Reorder** — press a header and drag it onto another one; the dragged header is
marked `.vt-th-dragging`, the one under the pointer `.vt-drop-target`. Plain
mouse events are used (not HTML5 drag-and-drop), so it works the same inside
scroll containers and stays testable. A click without movement still sorts.

**Pin / freeze** — pinned columns are *grouped to the edges*: left-pinned first
(in their relative order), then the free ones, then right-pinned. They get
`position: sticky` plus the stacked `left` / `right` offset they need, so
several pins on one side line up correctly. With an accordion the expander cell
sticks along with the left group. `pinColumn(key, 'left'|'right'|false)` changes
it at runtime.

**Show / hide** — `hidden` on a column, `hideColumn` / `showColumn` /
`toggleColumn` at runtime, or `columnPicker: true` for a toolbar menu (the
`columns` label names its button). A hidden column drops out of the header, the
rows, `aria-colcount`, the empty-row `colspan` **and the export**; it is still
searched, because the data is still there to match.

**Sticky header** — `stickyHeader: true` adds `.vt-sticky-head` to the root and
makes the header cells sticky. `position: sticky` needs a scrollport with a
height, so pass `maxHeight` (or set your own height on `.vt-scroll`); offset it
from something else on the page with `--vt-sticky-top`.

**Saving the layout** — `columnState()` returns a plain array
(`[{ key, hidden, width, pin }, ...]`, in the current order) to put in
localStorage or your backend; `setColumnState(snapshot)` restores it. Unknown
keys are ignored and columns the snapshot does not mention keep their relative
order at the end, so adding a column later does not break a stored layout.
Columns without a data key (`actions`, computed `html`) are addressed by a
generated id (`col0`, `col1`, …) which every event and snapshot reports.

## Per-column filters

A filter row in the header, one control per column that asks for one. The
columns opt in, the table-level `filters` option only picks the mode:

```js
new Vantable('#host', {
  columns: [
    { key: 'id',     label: 'ID',     type: 'number', filter: 'number' },   // min / max
    { key: 'name',   label: 'Name',   filter: true },                       // text
    { key: 'status', label: 'Status', type: 'status', map: STATUS, filter: 'select' },
    { key: 'note',   label: 'Note' }                                        // no filter
  ],
  data,
  filters: 'client'       // or 'server'; omitted → follows the data source
});
```

| `filter` | control | matches |
|---|---|---|
| `true` | text, unless the column has `map` / `options` — then a select | case-insensitive substring |
| `'text'` | a search input | case-insensitive substring |
| `'select'` | a dropdown; options from `filter.options`, else the column's `map` / `options` | exact value |
| `'number'` | two inputs (min / max) | numeric range; rows whose value is not a number drop out |
| `{ type, options, placeholder }` | the same, configured | |

- **The row lives in `<thead>`**, so it follows the column order, hidden
  columns, pinned columns (it gets the same sticky offsets) and the sticky
  header (it sticks right below it).
- **Client mode** narrows the rows in the browser; **server mode** sends the
  active filters as `req.filters` (`{ key: value }`, a number range as
  `{ min, max }`) and leaves the filtering to the backend. Typing is debounced
  (150ms client, 300ms server); a select applies at once.
- Filters, the global search and sorting are an **AND**: a row has to pass all
  of them. Setting a filter returns to the first page, and an **export covers
  the filtered rows**.
- A filter input keeps focus while you type in it, and the filter row is not
  part of the keyboard grid (reach it with `Tab`).
- `setFilter` / `getFilter` / `filters()` / `activeFilters()` / `clearFilters()`
  drive the same state from code, and every change emits `filterChange`.

## Row actions

An `actions` column (or `options.actions`) renders **one trigger that opens a
dropdown** with the row's actions — a cell is too narrow to hold more than two
or three buttons, and the menu takes any number of them:

```js
{
  label: 'Actions', type: 'actions',
  edit: { enabled: true },
  custom: [{ label: 'Ping', onClick: ping }, { label: 'Restart', onClick: restart }],
  remove: { enabled: true, url: (r) => `/api/users/${r.id}` },
  menu: { icon: '⋯', label: 'Row actions' }   // or menu: false for a row of buttons
}
```

- The trigger is `☰ ▾` by default, `aria-haspopup="menu"` + `aria-expanded`,
  named by the `actions` label (or `menu.label`). The menu is `role="menu"` with
  `role="menuitem"` entries, `Delete` keeps its danger styling.
- It closes after a pick, on a click anywhere else (inside or outside the
  table), and on `Escape` — which puts focus back on the trigger. Only one row
  menu is open at a time, and it flips above the trigger when it would fall out
  of the scroll box.
- Keyboard: `Enter` on the actions cell opens the menu and focuses the first
  item, `↑`/`↓` walk the items (wrapping), `Enter` runs one.
- While a row is being edited the cell shows plain **Save / Cancel** buttons
  instead — that row is in a different mode, not browsing actions.
- `menu: false` restores the previous rendering (all actions as buttons in the
  cell), which is what the screenshots of narrow columns wrap into.

## Row selection

A checkbox column, a select-all in the header and a bulk bar that appears while
something is selected. Opt-in:

```js
new Vantable('#host', {
  columns, data,
  selection: {
    mode: 'multi',                            // or 'single'
    header: true,                             // select-all checkbox
    selectable: (row) => row.status === 1,    // false → the row's box is disabled
    actions: [
      { label: 'Delete', className: 'vt-danger', onClick: (rows, ids) => remove(ids) },
      { label: 'Export', onClick: (rows) => exportRows(rows) }
    ]
  }
});
```

- **The checkbox column leads every row** (before the accordion handle when both
  are on) and counts towards `aria-colcount` and the `colspan` of the empty,
  skeleton and error rows. Rows carry `.vt-selected` and `aria-selected`.
- **Select-all covers the current view** — the current page when the table is
  paginated — and goes indeterminate while only some of its selectable rows are
  selected. Rows selected on another page stay selected; `clearSelection()`
  drops the lot.
- **The selection is keyed by row id**, so it survives search, sort, paging, a
  server refresh and a virtualized scroll. `selectedIds()` always reports
  everything; `selectedRows()` reports the rows it can resolve right now (in
  server mode: the ones on the current page).
- **Bulk actions** get `(rows, ids)`, and every press also emits `bulkAction`.
  The bar carries the count (`selected` label, `{n}` is the number) and a Clear
  button; it is hidden while nothing is selected.
- **`mode: 'single'`** keeps one row selected and renders no select-all.
- Ticking a checkbox does not count as a row click (`onRowClick` is left alone),
  and the checkboxes are dropped from `print()`.

## Loading / error / skeleton

A table with a `server` source manages these itself; a table whose data you load
yourself drives them with `setLoading()` / `setError()`. All three are on by
default — `states: false` turns them off, or switch off the pieces you do not want.

```js
new Vantable('#host', {
  columns,
  server: { fetch: loadPage },
  states: {
    loading: true,    // overlay + aria-busy while a fetch is in flight
    skeleton: 8,      // placeholder rows when there is nothing to show yet
    error: true,      // an error row instead of the empty row when a fetch fails
    retry: true       // with a Retry button
  },
  labels: { loading: 'Загрузка…', error: 'Не удалось загрузить', retry: 'Повторить' }
});
```

**Loading** — `.vt-loading` on the root, `aria-busy="true"` on the table and an
overlay (`role="status"`) over the scroll box. A *reload* keeps the rows on
screen underneath; only a load with nothing to show falls back to the skeleton.
The `loading` event reports both transitions.

**Skeleton** — `skeleton` placeholder rows (`.vt-skel-row`, `aria-hidden`), one
shimmer block per visible column, following the pins and the accordion handle.
They are not part of the keyboard grid. `skeleton: false` leaves the empty row.

**Error** — a failed `server.fetch` emits the `error` event as before **and** now
renders an error row (`role="alert"`) with the `error` label, the failure's own
message and a Retry button that clears the state and refetches. `states.error:
false` restores the old behaviour (the plain empty row). `setError(err)` shows
the same row for a failure you handled yourself; `setError(null)` clears it —
client data is re-rendered, a server source is only repainted, so you decide
when to fetch again.

**Stale replies are dropped.** Each `refresh()` supersedes the one before it, so
a slow reply that lost the race (a debounced search, fast paging) can no longer
write rows or release the loading state.

**Manual control** (data you load yourself):

```js
table.setLoading(true);
try { table.setData(await loadRows()); }      // setData clears both states
catch (err) { table.setError(err); }
```

## Virtualization

For large client-side datasets: only the rows in view are rendered, and two
spacer rows stand in for the rest so the scrollbar keeps the height of the whole
set. Opt-in, and it needs a bounded scroll box:

```js
new Vantable('#host', {
  columns, data,                      // 50 000 rows is fine
  pagination: false,                  // the pager is no longer needed
  virtual: { rowHeight: 37, overscan: 10 },
  maxHeight: '420px'                  // the viewport the window is measured against
});
```

| option | default | meaning |
|---|---|---|
| `virtual` | `false` | `true`, or `{ rowHeight, overscan }` |
| `rowHeight` | `36` | assumed height until a rendered row can be measured |
| `overscan` | `8` | extra rows kept above and below the viewport |

- **The window follows the scroll.** Each move past the current window re-renders
  the body and emits `virtualRange` ({ start, end, total }); scrolling inside the
  window touches nothing.
- **The row height is measured** from the first rendered row and replaces
  `rowHeight` as soon as the browser reports one, so the CSS stays in charge.
- **Everything else still sees the whole dataset**: search, sort, pagination,
  CSV/XLSX/PDF export and `state.total` are unaffected — only the DOM is
  windowed. `aria-rowcount` stays the full count and each rendered row carries
  its absolute `aria-rowindex`.
- **Keyboard navigation steps the window**: arrowing past the edge of the
  rendered rows scrolls by one row and keeps going; the header stays reachable
  at the top of the data.
- **`scrollToRow(index)`** jumps to a row (and renders it) without searching the
  DOM for it.
- **It needs a measured viewport.** Without `maxHeight` (or your own height on
  `.vt-scroll`) the scroll box has no height, and the table simply renders every
  row instead of showing nothing.
- **Uniform rows only.** `accordion` detail rows are not uniform, so `virtual`
  is ignored while an accordion is configured (`table.virtual === null`).
- **Caveat:** a row being inline-edited that scrolls out of the window is
  unmounted, which loses what was typed; the row returns in edit mode. Keep
  `overscan` generous, or save before scrolling far.

## Responsive

On a narrow table every row becomes a card with the column label in front of
each value. The switch is driven by **the table's own width**, not the
viewport, so a table in a narrow sidebar stacks while the page stays wide:

```js
new Vantable('#host', {
  columns, data,
  responsive: { breakpoint: 640 }   // or responsive: true for the 640px default
});
```

- The library measures `.vt-root` on window resize (debounced) and toggles
  `.vt-stacked`; everything else is CSS. `isStacked()` reports the current mode
  and every switch emits `responsive` with `{ stacked, width }`.
- Every cell carries `data-label="<column label>"`, which the card layout prints
  in front of the value — so hiding or reordering columns carries over.
- **The filter row stays visible** as a strip of inputs above the cards, so
  per-column filters remain usable on a phone. Search, sort, selection
  (checkboxes + bulk bar), paging, the accordion and the async states all keep
  working.
- **Virtualization pauses while stacked** (`_virtualOn()` is false): cards are as
  tall as their content, so the fixed-height window cannot be trusted. Paginate
  instead of relying on it for huge sets on small screens.
- Pinned columns stop sticking, the header (and with it the resize/reorder
  handles and the sticky header) is hidden, and `table-layout: fixed` no longer
  applies — a card list has no columns to size.
- A width of `0` means nothing has been laid out yet, so the plain table is kept.

## Requests, CSRF and forms in cells

The library makes **exactly two requests of its own**, and both let you set the
headers — everything else (your `server.fetch`, your save callback, your own
forms) is your code, with your token.

| where | request | how the token gets in |
|---|---|---|
| the `remove` row action, when it has a `url` | `fetch(url, { method: 'DELETE', headers })` | `remove: { headers: { 'X-CSRF-TOKEN': token } }` |
| `Vantable.serverExport(url, opts)` | `POST` with the JSON payload | `Vantable.serverExport(url, { headers: { 'X-CSRF-TOKEN': token } })` |

```js
const csrf = document.querySelector('meta[name="csrf-token"]').content;

new Vantable('#host', {
  columns: [
    { key: 'name', label: 'Name', editable: true },
    {
      label: 'Actions', type: 'actions',
      edit: { enabled: true },
      remove: {
        enabled: true,
        url: (row) => `/api/users/${row.id}`,
        method: 'DELETE',
        headers: { 'X-CSRF-TOKEN': csrf }      // AdonisJS shield, Laravel, Rails…
      }
    }
  ],
  data: rows,
  editable: true,
  // Saving an inline edit is YOUR request, so the token is yours to send:
  onSave: (id, changes) => fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
    body: JSON.stringify(changes)
  })
});
```

- **Nothing is added behind your back.** With no `headers` the request carries
  none, and `credentials` is left at the browser default (`same-origin`), so
  session cookies travel with a same-origin request and nothing is sent
  cross-origin.
- **A rejected removal is reported, not hidden**: the `remove` event fires with
  `{ ok: false, error }`, the row stays, and nothing is re-rendered — so a 403
  or 419 from a CSRF guard leaves your own error UI in place.
- **A form inside a cell works as a form.** Use an `html` column, keep your
  hidden token in it, and the table will not intercept the submit:

  ```js
  {
    label: '', type: 'html',
    render: (v, row) => `<form method="post" action="/users/${row.id}/ban">
      <input type="hidden" name="_csrf" value="${csrf}">
      <button type="submit" class="btn">Ban</button></form>`
  }
  ```

  The hidden input is not counted as an interactive control, so `Enter` on that
  cell presses the button; clicking it is not treated as a row click; and the
  token is never exposed through the export, which carries values rather than
  rendered markup.
- **Re-renders rebuild cells**, so anything a user typed into a form you
  rendered yourself is lost on the next sort, search or page change. Keep
  editable values in the row data (an `editable` column) or outside the table.

## Using it with React / Vue / Angular / Svelte

vantable is a plain class that owns one DOM element, so every framework needs
the same three things: **create it after the element exists**, **feed it new
data instead of re-creating it**, and **destroy it on unmount**. There is no
wrapper package to install — the snippets below are the whole integration.

### React

```jsx
import { useEffect, useRef } from 'react';
import Vantable from 'vantable';

export function UsersTable({ rows, onSave }) {
  const host = useRef(null);
  const table = useRef(null);

  // Create once: React owns the <div>, vantable owns everything inside it.
  useEffect(() => {
    table.current = new Vantable(host.current, {
      columns: [
        { key: 'id', label: 'ID', type: 'number', width: '70px' },
        { key: 'name', label: 'Name', editable: true, filter: true },
        { label: 'Actions', type: 'actions', edit: { enabled: true }, remove: { enabled: true } }
      ],
      data: rows,
      search: 'live',
      editable: true,
      selection: true
    });
    const t = table.current;
    t.on('save', ({ id, changes }) => onSave(id, changes));
    return () => t.destroy();          // StrictMode mounts twice in dev: this makes it safe
  }, []);                               // deliberately empty — see the next effect

  // Feed data in; never re-create the table for a data change.
  useEffect(() => { table.current?.setData(rows); }, [rows]);

  return <div ref={host} />;
}
```

A reusable hook, if you have several tables:

```js
import { useEffect, useRef } from 'react';
import Vantable from 'vantable';

/** Create a vantable inside `ref`, keep its data in step, destroy on unmount. */
export function useVantable(ref, options, data) {
  const table = useRef(null);
  useEffect(() => {
    table.current = new Vantable(ref.current, { ...options, data });
    return () => { table.current.destroy(); table.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { table.current?.setData(data); }, [data]);
  return table;
}
```

Callbacks you pass in options are captured once, so read changing values through
a ref (or re-attach with `table.current.on(...)`) rather than re-creating the
table. `onRowClick` and the row actions run outside React's event system — wrap
state updates in your own setter as usual.

### Vue 3

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import Vantable from 'vantable';

const props = defineProps({ rows: { type: Array, default: () => [] } });
const emit = defineEmits(['save']);
const host = ref(null);
const table = shallowRef(null);          // shallowRef: do not make the table reactive

onMounted(() => {
  table.value = new Vantable(host.value, {
    columns: [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'name', label: 'Name', editable: true }
    ],
    data: props.rows,
    editable: true,
    search: 'live'
  });
  table.value.on('save', (payload) => emit('save', payload));
});

// Pass a plain copy: vantable mutates rows on inline save, and a Vue proxy
// would turn every cell write into a reactive update.
watch(() => props.rows, (rows) => table.value?.setData(rows.map((r) => ({ ...r }))), { deep: false });

onBeforeUnmount(() => table.value?.destroy());
</script>

<template><div ref="host"></div></template>
```

### Angular (standalone component)

```ts
import {
  Component, ElementRef, Input, OnChanges, OnDestroy, AfterViewInit,
  ViewChild, NgZone, SimpleChanges
} from '@angular/core';
import Vantable from 'vantable';

@Component({
  selector: 'app-users-table',
  standalone: true,
  template: '<div #host></div>'
})
export class UsersTableComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rows: User[] = [];
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  private table?: Vantable<User>;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    // Outside Angular's zone: the table re-renders itself, so there is no need
    // to run change detection on every keystroke in its search box.
    this.zone.runOutsideAngular(() => {
      this.table = new Vantable<User>(this.host.nativeElement, {
        columns: [
          { key: 'id', label: 'ID', type: 'number' },
          { key: 'name', label: 'Name', filter: true }
        ],
        data: this.rows,
        search: 'live'
      });
      this.table.on('save', (p) => this.zone.run(() => this.onSave(p)));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows'] && this.table) this.table.setData(this.rows);
  }

  ngOnDestroy(): void { this.table?.destroy(); }

  private onSave(payload: unknown): void { /* back inside the zone */ }
}
```

### Svelte

```svelte
<script>
  import { onMount } from 'svelte';
  import Vantable from 'vantable';

  export let rows = [];
  let host;
  let table;

  onMount(() => {
    table = new Vantable(host, {
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'name', label: 'Name' }
      ],
      data: rows,
      search: 'live'
    });
    return () => table.destroy();        // onMount's return runs on destroy
  });

  $: table?.setData(rows);               // reactive statement keeps the data in step
</script>

<div bind:this={host}></div>
```

As a Svelte action, if you prefer:

```js
/** use:vantable={{ options, data }} */
export function vantable(node, { options, data }) {
  const table = new Vantable(node, { ...options, data });
  return {
    update: ({ data: next }) => table.setData(next),
    destroy: () => table.destroy()
  };
}
```

### Rules that apply to all four

| Do | Why |
|---|---|
| Create the table **after** the host element is in the DOM | the constructor throws `[Vantable] target element not found` otherwise |
| Update with `setData(rows)` / `refresh()` | re-creating the table loses scroll position, selection, filters and the column layout |
| Call `destroy()` on unmount | it removes the document and window listeners the table registered |
| Give the framework an **empty** host `<div>` | vantable owns that element's `innerHTML`; do not render children into it |
| Pass plain objects as rows | inline editing writes back into the row object; framework proxies make that a reactive write |
| Keep the table out of the reactive graph | `shallowRef` in Vue, a `ref` in React, a plain variable in Svelte, `runOutsideAngular` in Angular |
| Server-side rendering: create it in the browser hook only | the constructor needs a real `document` (importing the module does not) |

For a server-rendered page (Next.js, Nuxt, SvelteKit) import the library inside
the mount hook, or with `ssr: false` / a dynamic import — the module itself is
SSR-safe to import, but constructing a table is a DOM operation.

## Keyboard & accessibility

The table follows the WAI-ARIA **grid** pattern (`role="grid"` / `row` /
`columnheader` / `gridcell`, `aria-sort`, `aria-rowcount`/`colcount`) with a
roving tabindex, so it is fully keyboard-navigable out of the box:

| Key | Action |
|---|---|
| `←` `→` `↑` `↓` | move focus between cells |
| `Home` / `End` | first / last cell in the row |
| `Ctrl`/`Cmd` + `Home` / `End` | first / last cell of the grid |
| `PageDown` / `PageUp` | next / previous page |
| `Enter` / `Space` | activate: sort a header, expand a row, run an action, follow a link |
| `Enter` on a multi-button cell | enter the cell — `Tab` between its controls, `Esc` to leave |

Interactive controls inside cells are taken out of the page Tab order and reached
through the grid instead. Turn the whole thing off with `keyboard: false`.

### What is exposed to assistive tech

| attribute | where / meaning |
|---|---|
| `role="grid"` + `row` / `columnheader` / `gridcell` | the table, its rows and cells |
| `aria-label` / `aria-labelledby` | the grid's name — `label` / `labelledby`, else the `grid` label |
| `aria-rowcount` / `aria-colcount` | the **whole** dataset and the rendered columns |
| `aria-rowindex` | 1 on the header row, then the row's absolute position (survives paging and virtualization) |
| `aria-colindex` | the cell's position among the rendered columns (hidden ones are out, pinned ones counted where they are drawn) |
| `aria-sort` | `ascending` / `descending` / `none` per sortable header |
| `aria-multiselectable` | on the grid while multi-row selection is on |
| `aria-selected` | per row while selection is on |
| `aria-busy` + `role="status"` | the table during a load, and the loading overlay |
| `role="alert"` | the error row |
| `aria-expanded` + `aria-controls` | an accordion expander and the detail row it opens |
| `aria-hidden` | the skeleton and the virtualization spacer rows |
| `role="toolbar"` + `aria-label` | the bulk-action bar (`bulkActions` label) |
| `role="group"` + `aria-label` | the column menu (`columns` label) |
| `aria-label` | the search box, both checkboxes, the expander — all from `labels` |

Every one of those names comes from `labels`, so a localised table stays
accessible in its own language.

## Translating the table

Every piece of text the user sees comes from `labels`; pass any subset of keys:

```js
new Vantable('#host', {
  columns, data,
  labels: {
    search: 'Пошук…', perPage: 'Рядків', prev: 'Назад', next: 'Далі',
    empty: 'Немає записів', edit: 'Правка', remove: 'Видалити',
    save: 'Зберегти', cancel: 'Скасувати', confirmRemove: 'Видалити запис?',
    selected: 'Вибрано: {n}', clearSelection: 'Скинути',
    loading: 'Завантаження…', error: 'Не вдалося завантажити', retry: 'Повторити'
  }
});
```

The full list of keys is the `VantableLabels` interface in the type definitions —
33 of them, covering the toolbar, the pager, the row actions, the confirmation
dialog, the async states, the selection, the filters and every `aria-label` the
table sets. `{n}` in the `selected` label is replaced with the number of
selected rows. Two tables on one page can speak different languages.

## Styling

Styling works out of the box **and** is fully customisable. There is nothing you
must include — the default stylesheet is injected into `<head>` once, the first
time a table is created.

Four ways to control the look, from least to most custom:

1. **Nothing** — use the built-in defaults (light/dark auto via `prefers-color-scheme`).

2. **Tweak via theme tokens** — override CSS variables inline per instance:

   ```js
   new Vantable('#host', {
     columns, data,
     theme: { accent: '#7c3aed', danger: '#ef4444', radius: '4px', bg: '#fff', border: '#eee' }
   });
   ```
   Keys map to `--vt-*` (e.g. `accentFg` → `--vt-accent-fg`).

3. **Force color mode** — `mode: 'dark'` or `mode: 'light'` (sets `data-vt-theme`).

4. **Bring your own CSS.** The `styles` option decides which stylesheet the
   table injects:

   ```js
   // ours (the default)
   new Vantable('#host', { columns, data });
   new Vantable('#host', { columns, data, styles: true });

   // nothing — you ship all the CSS yourself, however you like
   new Vantable('#host', { columns, data, styles: false });

   // yours *instead of* ours, as text
   new Vantable('#host', { columns, data, styles: myCss });
   new Vantable('#host', { columns, data, styles: { css: myCss } });

   // yours as a file the page should load
   new Vantable('#host', { columns, data, styles: { href: '/css/my-table.css' } });

   // ours first, yours on top (so you only override what you need)
   new Vantable('#host', { columns, data, styles: { css: myCss, extend: true } });
   ```
   ```css
   /* your stylesheet — the .vt-* class names are the contract */
   .vt-table { ... } .vt-th { ... } .vt-badge { ... } .vt-btn.vt-danger { ... }
   ```

   The same CSS text is injected only once per page, however many tables use it,
   and two tables may use different stylesheets side by side. `extend: true`
   puts the built-in sheet **before** yours, so your rules win without
   `!important`. Start from `Vantable.css` if you want to edit the defaults
   rather than replace them.

You can also grab the default CSS as a string (`Vantable.css`) or inject a
stylesheet manually — `Vantable.injectStyles()` for the defaults,
`Vantable.injectStyles(myCss)` for your own (both are idempotent), and the same stylesheet ships as a real
file for `<link>`/bundler import: `vantable/src/vantable.css` (`import 'vantable/css'`).

The class names (`.vt-root`, `.vt-table`, `.vt-th`, `.vt-td`, `.vt-tr`, `.vt-btn`,
`.vt-badge`, `.vt-link`, `.vt-actions`, `.vt-modal`, …) are part of the public API
and won't change within a major version. The column operations add
`.vt-resizer`, `.vt-th-dragging`, `.vt-drop-target`, `.vt-pin-left`,
`.vt-pin-right`, `.vt-sticky-head`, `.vt-table-fixed`, `.vt-cols`,
`.vt-cols-menu` and `.vt-col-opt`, plus the `--vt-sticky-top` variable that
offsets a sticky header from anything else fixed on the page. Virtualization adds
`.vt-spacer`, and the async states add `.vt-loading`, `.vt-overlay`,
`.vt-overlay-text`, `.vt-spinner`, `.vt-skel-row`, `.vt-skel`, `.vt-error`,
`.vt-error-box`, `.vt-error-msg`, `.vt-error-detail` and the `--vt-veil`
variable (the overlay's backdrop). Selection adds `.vt-th-select`,
`.vt-td-select`, `.vt-select-all`, `.vt-select-row`, `.vt-selected`, `.vt-bulk`,
`.vt-bulk-count` and the `--vt-sel` variable (the selected-row tint). The
filters add `.vt-filter-row`, `.vt-filter-cell`, `.vt-filter`,
`.vt-filter-text`, `.vt-filter-select`, `.vt-filter-num`, `.vt-filter-min` and
`.vt-filter-max`. The responsive mode adds `.vt-responsive` and `.vt-stacked`
on the root (the card layout hangs off the latter), and the row-action dropdown
adds `.vt-actions-menu`, `.vt-act-trigger`, `.vt-act-menu`, `.vt-act-menu-up`
and `.vt-act-item`. The `vt-spin` / `vt-shimmer` animations are
skipped under `prefers-reduced-motion`.

## TypeScript

Ships with type definitions (`vantable.d.ts`) — no `@types/...` needed. Everything
is typed, including generic rows:

```ts
import Vantable, { VantableOptions, VantableColumnDef } from 'vantable';

interface User { id: number; name: string; email: string; status: number; }

const columns: VantableColumnDef<User>[] = [
  { key: 'id', label: 'ID', type: 'number' },
  'name',                     // string shorthand
  ['email', 'Email'],         // [key, label] tuple
  { label: 'Actions', type: 'actions', remove: { url: u => `/api/users/${u.id}` } }
];

const table = new Vantable<User>('#host', { columns, data, search: 'live' });
```

The exported types include `VantableOptions`, `VantableColumn` / `VantableColumnDef`,
`VantableActions`, `VantableServerRequest`, `VantableServerResponse`, `VantableMode`,
`VantableLabels` and more.

## Development

```bash
npm install            # dev-only deps (jsdom + typescript); the package itself has none
npm run lint           # node --check on the source
npm run typecheck      # tsc --strict over vantable.d.ts + examples/type-usage.ts
npm run build          # copy src/vantable.js -> dist/vantable.umd.js (keep in sync!)
npm run build:go       # build the export binary (needed by the end-to-end test)
npm run test:go        # Go unit tests for the XLSX/PDF writers
npm test               # the whole JS suite (node:test + jsdom)
npm run check          # all of the above, in order
npm run test:coverage  # the JS suite with a coverage report
npm run test:go:coverage
```

### What the tests cover

428 Node tests (`test/*.test.mjs`) and 34 Go tests — line coverage 99.8% for
`src/vantable.js` (98% of branches; the rest are `typeof document` style
guards) and 93% of statements for the Go binary.

| File | Area |
|---|---|
| `columns.test.mjs` | every column type, shared props, escaping |
| `pipeline.test.mjs` | search keys, filtering, sorting, paging, modes, `setData` |
| `dom.test.mjs` | rendering, toolbar, search box, sort clicks, ARIA |
| `editing.test.mjs` | inline editors, save/cancel, edit/custom/remove actions, modal, clipboard |
| `keyboard.test.mjs` | the full key matrix, roving tabindex, cell interaction mode |
| `accordion.test.mjs` | expander column, detail rows, expand events |
| `columnops.test.mjs` | resize, reorder, pin, show/hide, column menu, sticky header, layout snapshot |
| `columnops2.test.mjs` | the geometry paths (stubbed widths), keyless columns, column-op guards |
| `virtual.test.mjs` | the rendered window, spacers, scroll re-render, keyboard stepping, `scrollToRow` |
| `states.test.mjs` | loading overlay, skeleton rows, error row + Retry, stale replies, `setLoading`/`setError` |
| `selection.test.mjs` | checkboxes, select-all + indeterminate, bulk actions, the selection API |
| `actionmenu.test.mjs` | the row-action dropdown: trigger, opening/closing, keyboard, inline fallback |
| `aria.test.mjs` | the grid roles, names, row/column indexes and states across every render path |
| `filters.test.mjs` | the filter controls, client filtering, the server contract, the filter API |
| `responsive.test.mjs` | the breakpoint switch, cell labels, what pauses while stacked |
| `server.test.mjs` | what reaches `server.fetch` per mode, totals, paging, failures |
| `export.test.mjs` | payloads, CSV bytes, the adapter contract, all three presets |
| `binary.test.mjs` | button → endpoint → Go binary → downloaded file (end to end) |
| `options.test.mjs` | labels, theme/mode/styles, `rowId`, print, destroy, multi-instance |
| `package.test.mjs` | dist/CSS copies in sync, entry points, UMD/AMD/ESM loading |
| `edges.test.mjs`, `edges2.test.mjs` | lookup misses, guard clauses, rare option shapes |

The end-to-end test is skipped until `npm run build:go` has produced the binary.
jsdom is not a browser, so real layout, printing and the file-save dialog still
need `examples/index.html` opened by hand.

## License

MIT
