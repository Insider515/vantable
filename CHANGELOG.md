# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Everything below is the work that led to the first published version. The
package has not been released to npm yet, so none of it is a breaking change
for anyone.

### Added

- **Core table**: client and server modes for search, sort and pagination
  (each switchable on its own), 13 column types (`text`, `number`, `link`,
  `external`, `copy`, `status`, `select`/`tag`, `image`, `textarea`,
  `download`, `html`, `actions`), inline row editing, row actions, accordion
  master/detail rows, CSV export and print — all with no runtime dependencies.
- **Export**: adapter API for XLSX/PDF with three ready-made adapters —
  `Vantable.serverExport()` (POSTs to your backend), `Vantable.sheetJsExport()`
  (SheetJS in the browser) and `Vantable.jsPdfExport()` (jsPDF in the browser) —
  plus `tools/vtexport`, a dependency-free Go CLI that turns the export payload
  into a real `.xlsx` / `.pdf` (Cyrillic-safe, wraps long cells).
- **Column operations**: drag-resize, drag-reorder, pin/freeze left or right,
  show/hide with a column menu, sticky header, and `columnState()` /
  `setColumnState()` to persist the layout.
- **Virtualization**: `virtual` renders only the rows in view and keeps the
  scroll height with spacer rows; `scrollToRow()`; keyboard navigation steps
  the window.
- **Async states**: loading overlay, skeleton rows and an error row with Retry;
  `setLoading()` / `setError()`; stale server replies are dropped.
- **Row selection**: checkbox column, select-all with an indeterminate state,
  a bulk-action bar, and a selection keyed by row id that survives search,
  sort, paging and refreshes.
- **Per-column filters**: text, select and number-range controls in a filter
  row, client-side or sent to the server as `req.filters`.
- **Responsive**: below a breakpoint of the table's own width every row becomes
  a card with the column label in front of each value.
- **Row actions as a dropdown**: one trigger per row opens a `role="menu"` list,
  so any number of actions fits a narrow column (`menu: false` restores the
  old row of buttons).
- **Accessibility**: the WAI-ARIA grid pattern end to end — roles, names,
  `aria-rowcount` / `aria-colcount` / `aria-rowindex` / `aria-colindex`,
  `aria-sort`, `aria-selected`, `aria-multiselectable`, `aria-busy`,
  `aria-expanded` + `aria-controls`, plus a full keyboard grid with a roving
  tabindex.
- **TypeScript**: complete definitions (`src/vantable.d.ts`), checked by a
  compiled usage example.
- **Tests**: Node's test runner with jsdom, plus Go tests for the export binary.

