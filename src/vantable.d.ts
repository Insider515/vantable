// Type definitions for vantable
// Zero-dependency vanilla-JS data table for dashboards.

export type VantableRow = Record<string, any>;

export type VantableColumnType =
  | 'text' | 'number' | 'link' | 'external' | 'copy' | 'status'
  | 'select' | 'tag' | 'image' | 'textarea' | 'download' | 'html' | 'actions';

/**
 * Feature mode for `search` / `sort`.
 * - `'live' | 'client' | 'local'` — filter/sort the loaded rows in the browser
 * - `'server' | 'db' | 'remote'`  — query `server.fetch` (real DB search/sort)
 * - `'off' | 'none' | false`      — disabled
 * - `true` / omitted              — follow the source (server if `server.fetch`, else client)
 */
export type VantableMode =
  | boolean
  | 'client' | 'live' | 'local'
  | 'server' | 'db' | 'remote'
  | 'off' | 'none';

export interface VantableSelectOption {
  value: string | number;
  label?: string | number;
}

/** Which edge a frozen column sticks to; `null` / `false` is not pinned. */
export type VantableColumnPin = 'left' | 'right' | null | false;

/** One column's layout, as `columnState()` returns it. */
export interface VantableColumnLayout {
  /** The column's data key, or its generated id when it has none. */
  key: string;
  hidden: boolean;
  width: string | null;
  pin: 'left' | 'right' | null;
}

export interface VantableStatusMeta {
  label?: string | number;
  /** Badge background color (any CSS color). */
  color?: string;
}

export interface VantableRowAction<Row = VantableRow> {
  label: string;
  className?: string;
  onClick?: (row: Row, event?: Event) => void;
}

export interface VantableEditAction<Row = VantableRow> {
  enabled?: boolean;
  label?: string;
  /** Called on Edit click (in addition to inline editing when `editable` is on). */
  onEdit?: (row: Row) => void;
}

/**
 * The look of the built-in confirmation dialog. Every class here is ADDED to
 * the built-in one, so `.vt-modal*` keeps working and your rules sit on top of
 * it. The dialog also inherits the table's own `theme` and `mode`.
 */
export interface VantableConfirmStyle {
  /** A heading above the message (none by default). */
  title?: string;
  /** Your class on the dialog box, next to `vt-modal`. */
  className?: string;
  /** Your class on the backdrop, next to `vt-modal-overlay`. */
  overlayClassName?: string;
  /** Your class on the message, next to `vt-modal-body`. */
  bodyClassName?: string;
  /** Your class on the button row, next to `vt-modal-foot`. */
  footClassName?: string;
  /** Your class on the Cancel button, next to `vt-btn`. */
  cancelClassName?: string;
  /** Your class on the Delete button, next to `vt-btn vt-danger`. */
  confirmClassName?: string;
}

export interface VantableRemoveAction<Row = VantableRow> {
  enabled?: boolean;
  label?: string;
  /** If set, a request is sent here on confirm. */
  url?: string | ((row: Row) => string);
  /** HTTP method for the remove request (default `'DELETE'`). */
  method?: string;
  headers?: Record<string, string>;
  /** Re-fetch/refresh after a successful remove (default `true`). */
  reload?: boolean;
  onRemove?: (row: Row) => void;
  /** The look of the confirmation dialog this action opens. */
  confirm?: VantableConfirmStyle;
}

/** How a row's actions are presented: a dropdown (default) or a row of buttons. */
export type VantableActionsMenu =
  | boolean
  | {
      /** The trigger's content (default `"☰ ▾"`). */
      icon?: string;
      /** The trigger's accessible name (default: the `actions` label). */
      label?: string;
    };

export interface VantableActions<Row = VantableRow> {
  edit?: VantableEditAction<Row>;
  remove?: VantableRemoveAction<Row>;
  custom?: Array<VantableRowAction<Row>>;
  /** `false` lays the actions out as buttons instead of a dropdown. */
  menu?: VantableActionsMenu;
}

export interface VantableColumn<Row = VantableRow> {
  /** Row field to read (supports dotted paths like `"a.b"`). */
  key?: string;
  label?: string | number;
  type?: VantableColumnType;
  sortable?: boolean;
  /** Include this column in client-side search (default `true`). */
  searchable?: boolean;
  /** Allow inline editing of this cell when the table `editable` is on. */
  editable?: boolean;
  align?: 'left' | 'center' | 'right';
  /** CSS width, e.g. `"60px"`, or a number of px. */
  width?: string | number;
  /** Freeze the column to one edge of the scroll box (see `VantableColumnPin`). */
  pin?: VantableColumnPin;
  /** Start out hidden (see `toggleColumn` / the `columnPicker`). */
  hidden?: boolean;
  /** Show a filter control for this column in the header's filter row. */
  filter?: VantableColumnFilter;
  /** Exclude from drag-resizing while the table `resize` option is on. */
  resizable?: boolean;
  /** Exclude from drag-reordering while the table `reorder` option is on. */
  reorderable?: boolean;
  className?: string;
  cellClass?: string;
  prefix?: string;
  suffix?: string;

  // type: 'link' | 'external'
  href?: string | ((row: Row) => string);
  target?: string;
  text?: string | ((row: Row) => string);

  // type: 'status'
  map?: Record<string | number, VantableStatusMeta>;

  // type: 'select' | 'tag'
  options?: VantableSelectOption[] | ((row: Row) => VantableSelectOption[]);
  onChange?: (row: Row, value: string) => void;

  // type: 'image'
  src?: string | ((row: Row) => string);

  // type: 'download'
  filename?: string | ((row: Row) => string);

  // type: 'html' — raw markup (NOT escaped)
  render?: (value: any, row: Row) => string;

  // type: 'actions'
  edit?: VantableEditAction<Row>;
  remove?: VantableRemoveAction<Row>;
  custom?: Array<VantableRowAction<Row>>;
  /** Dropdown (default) or `false` for a row of buttons. */
  menu?: VantableActionsMenu;
}

/** A column may be a full object, a key string, or a `[key, label]` tuple. */
export type VantableColumnDef<Row = VantableRow> =
  | VantableColumn<Row>
  | string
  | [string, (string | number)?];

export interface VantableServerRequest {
  page: number;
  perPage: number;
  /** Present only when `search` is in server mode. */
  q?: string;
  /** The active per-column filters; present only in server filter mode. */
  filters?: Record<string, VantableFilterValue>;
  /** Present when `searchFields` is set (in server mode). */
  fields?: string[];
  /** Present only when `sort` is in server mode. */
  sort?: string | null;
  dir?: 'asc' | 'desc';
}

export interface VantableServerResponse<Row = VantableRow> {
  rows: Row[];
  total?: number;
}

export interface VantablePagination {
  perPage?: number;
  options?: number[];
}

/** A column's filter control. `true` picks one from the column type. */
export type VantableColumnFilter =
  | boolean
  | 'text' | 'select' | 'number'
  | {
      type?: 'text' | 'select' | 'number';
      /** Options for a select filter (else the column's `map` / `options`). */
      options?: VantableSelectOption[];
      /** Placeholder of a text filter (default: the column label). */
      placeholder?: string;
    };

/** The value of one filter: a string, or a range for a number filter. */
export type VantableFilterValue = string | number | { min?: string | number; max?: string | number };

/** A button shown in the bulk bar while rows are selected. */
export interface VantableBulkAction<Row = VantableRow> {
  label?: string;
  className?: string;
  /** Receives the resolvable selected rows and all selected ids. */
  onClick?: (rows: Row[], ids: string[]) => void;
}

/** Row selection: the checkbox column, select-all and the bulk actions. */
export interface VantableSelection<Row = VantableRow> {
  /** `'multi'` (default) or `'single'`, which keeps one row selected. */
  mode?: 'multi' | 'single';
  /** Select-all checkbox in the header (default `true`; never in single mode). */
  header?: boolean;
  /** Return `false` to make a row unselectable (its checkbox is disabled). */
  selectable?: (row: Row) => boolean;
  /** Buttons for the bulk bar. */
  actions?: Array<VantableBulkAction<Row>> | null;
}

/** The async states: a loading overlay, skeleton rows and an error row. */
export interface VantableStates {
  /** Show the loading overlay while a fetch is in flight (default `true`). */
  loading?: boolean;
  /** Skeleton rows while loading with nothing to show: a count, `true` for 8,
   *  or `false` for none (default `8`). */
  skeleton?: boolean | number;
  /** Replace the empty row with an error row when a fetch fails (default `true`). */
  error?: boolean;
  /** Put a Retry button in the error row (default `true`). */
  retry?: boolean;
}

/**
 * Which stylesheet the table injects:
 * `true`/omitted — the built-in one, `false` — none, a string — your CSS
 * instead of the built-in one, or this object for the full choice.
 */
export interface VantableStyles {
  /** CSS text to inject (instead of the built-in sheet, unless `extend`). */
  css?: string;
  /** URL of a stylesheet to link from the page. */
  href?: string;
  /** Keep the built-in sheet and put yours after it (default `false`). */
  extend?: boolean;
}

/** The responsive card mode. */
export interface VantableResponsive {
  /** Stack into cards below this width of the table itself, in px (default `640`). */
  breakpoint?: number;
}

/** Row virtualization: only the rows in view are rendered. */
export interface VantableVirtual {
  /** Assumed row height in px until a rendered row can be measured (default `36`). */
  rowHeight?: number;
  /** Extra rows rendered above and below the viewport (default `8`). */
  overscan?: number;
}

export interface VantableAccordion<Row = VantableRow> {
  /** Custom detail markup for an expanded row. */
  render?: (row: Row) => string;
  /** Or a set of columns rendered as a definition list. */
  columns?: Array<VantableColumnDef<Row>>;
}

export interface VantableLabels {
  /** Placeholder and aria-label of the search box. */
  search: string;
  /** Accessible name and tooltip of the search button (server mode). */
  searchSubmit: string;
  /** "Rows" in front of the page-size select. */
  perPage: string;
  /** The pager's previous / next buttons. */
  prev: string;
  next: string;
  /** Shown when there are no rows. */
  empty: string;
  /** Row actions. */
  edit: string;
  remove: string;
  save: string;
  cancel: string;
  /** The delete confirmation question. */
  confirmRemove: string;
  /** The export buttons, per format. */
  exportCsv: string;
  exportXlsx: string;
  exportPdf: string;
  /** The print button. */
  print: string;
  /** Header of an actions column and the name of its dropdown trigger. */
  actions: string;
  /** "Page" and "of" in the pager. */
  page: string;
  of: string;
  /** The copy button's title, and the one it flashes after copying. */
  copy: string;
  copied: string;
  /** The column-menu button (`columnPicker`). */
  columns: string;
  /** The loading overlay's text. */
  loading: string;
  /** The error row's headline (the failure's own message is shown next to it). */
  error: string;
  /** The error row's Retry button. */
  retry: string;
  /** The bulk bar's count; `{n}` is replaced with the number selected. */
  selected: string;
  /** The bulk bar's Clear button. */
  clearSelection: string;
  /** aria-label of the header's select-all checkbox. */
  selectAll: string;
  /** aria-label of a row's checkbox. */
  selectRow: string;
  /** The "any value" option of a select filter. */
  filterAll: string;
  /** Placeholders of a number filter's two inputs. */
  filterMin: string;
  filterMax: string;
  /** aria-label of the bulk-action toolbar. */
  bulkActions: string;
  /** aria-label of an accordion row's expander. */
  expandRow: string;
  /** Fallback accessible name of the grid (see the `label` option). */
  grid: string;
}


export type VantableExportFormat = 'csv' | 'xlsx' | 'pdf' | string;

/** Payload passed to an export adapter (and to your Go binary). */
export interface VantableExportPayload {
  format: VantableExportFormat;
  filename: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, any>>;
}

/** An export adapter turns the payload into a downloaded file. */
export type VantableExportAdapter =
  (payload: VantableExportPayload) => void | Promise<void>;

export interface VantableExport {
  /** Which export buttons to show (default `['csv']`). */
  formats?: VantableExportFormat[];
  /** Base filename (without extension). */
  filename?: string;
  /** Per-format adapters. CSV is built in; xlsx/pdf need an adapter. */
  adapters?: {
    csv?: VantableExportAdapter;
    xlsx?: VantableExportAdapter;
    pdf?: VantableExportAdapter;
    [format: string]: VantableExportAdapter | undefined;
  };
}

/** Options for the SheetJS-based XLSX adapter (`Vantable.sheetJsExport`). */
export interface VantableSheetJsOptions {
  /** The SheetJS module (`XLSX`). Omitted → the `XLSX` page global is used. */
  lib?: unknown;
  /** Worksheet name (default `"Sheet1"`). */
  sheetName?: string;
}

/** Options for the jsPDF-based PDF adapter (`Vantable.jsPdfExport`). */
export interface VantableJsPdfOptions {
  /** The jsPDF constructor. Omitted → `window.jspdf.jsPDF` / `window.jsPDF`. */
  lib?: unknown;
  /** Default: landscape when there are more than 5 columns. */
  orientation?: 'portrait' | 'landscape' | 'p' | 'l';
  unit?: 'pt' | 'mm' | 'cm' | 'in';
  format?: string | number[];
  fontSize?: number;
  margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
}

export interface VantableOptions<Row = VantableRow> {
  /** Column definitions (required). */
  columns: Array<VantableColumnDef<Row>>;
  /** Client-side rows (omit when using `server`). */
  data?: Row[];
  /** Id field name (default `"id"`). */
  rowId?: string;

  /** Search mode — see {@link VantableMode}. */
  search?: VantableMode;
  /** Fields the search looks at; omitted → all data columns. */
  searchFields?: string[];
  /** Sort mode — see {@link VantableMode}. */
  sort?: VantableMode;
  defaultSort?: string;
  defaultDir?: 'asc' | 'desc';

  /** Pager config; `false` disables pagination. */
  pagination?: boolean | VantablePagination;
  /** Server data source; enables `'server'` search/sort/pagination. */
  server?: {
    fetch: (req: VantableServerRequest) =>
      VantableServerResponse<Row> | Promise<VantableServerResponse<Row>>;
  };

  /** Enable inline row editing. */
  editable?: boolean;
  onSave?: (id: string | number, changes: Record<string, string>, row: Row) => void;

  /** Row actions when not using an `actions` column. */
  actions?: VantableActions<Row>;
  /** Expandable master/detail rows. */
  accordion?: VantableAccordion<Row>;

  /** Per-column filters. The columns opt in with their own `filter`; this picks
   *  the mode (same vocabulary as `search`) and `false` switches the row off.
   *  Default: follows the data source. */
  filters?: boolean | VantableMode;

  /** Row selection with checkboxes and bulk actions. `true` enables it with
   *  the defaults. Default `false`. */
  selection?: boolean | VantableSelection<Row>;

  /** Loading / skeleton / error states for async data. `true` (the default)
   *  enables all of them, `false` none, or pass the pieces you want. */
  states?: boolean | VantableStates;

  /** Stack each row into a card while the table is narrower than the
   *  breakpoint, with the column label in front of every value. Default `false`. */
  responsive?: boolean | VantableResponsive;

  /** Render only the rows in view (plus overscan) and stand in for the rest
   *  with spacer rows. Needs a bounded scroll box (`maxHeight`) and uniform row
   *  heights — it is ignored while `accordion` is set. Default `false`. */
  virtual?: boolean | VantableVirtual;

  /** Export config: `true` (CSV button), `false`, or `{ formats, filename, adapters }`. */
  export?: boolean | VantableExport;
  /** @deprecated use `export`. Kept for back-compat (CSV button). */
  exportable?: boolean;
  printable?: boolean;
  /** Base name for the exported file (default `"table"`). */
  exportName?: string;
  emptyText?: string;
  /** Accessible name of the grid (`aria-label`). Defaults to the `grid` label. */
  label?: string;
  /** Id of an element that names the grid (`aria-labelledby`); wins over `label`. */
  labelledby?: string;
  onRowClick?: (row: Row | null, event: Event) => void;
  labels?: Partial<VantableLabels>;

  /** Grid keyboard navigation (arrows / Home / End / PageUp-Down / Enter),
   *  ARIA grid roles and roving tabindex. Default `true`. */
  keyboard?: boolean;

  /** Drag the edge of a header to set a column width. Default `false`.
   *  Switches the table to a fixed layout once the widths are captured. */
  resize?: boolean;
  /** Drag a header onto another one to move the column. Default `false`. */
  reorder?: boolean;
  /** Toolbar menu to show/hide columns. Default `false`. */
  columnPicker?: boolean;
  /** Keep the header visible while the body scrolls. Needs `maxHeight`
   *  (or your own height on `.vt-scroll`) to have anything to stick to. */
  stickyHeader?: boolean;
  /** Height of the scroll box, e.g. `"60vh"` or `420`. */
  maxHeight?: string | number;
  /** Smallest width a drag-resize may produce, in px (default `48`). */
  minColWidth?: number;

  /** Which stylesheet to inject: the built-in one (default), none (`false`),
   *  your own CSS (a string) or `{ css, href, extend }`. */
  styles?: boolean | string | VantableStyles;
  /** CSS variable overrides applied inline, e.g. `{ accent:'#f00', radius:'4px' }`. */
  theme?: Record<string, string>;
  /** Force color mode. */
  mode?: 'dark' | 'light';
}

export type VantableEvent =
  | 'render' | 'save' | 'remove' | 'edit' | 'action'
  | 'cellChange' | 'expand' | 'copy' | 'export' | 'error' | 'destroy'
  | 'columnResize' | 'columnMove' | 'columnPin' | 'columnVisibility'
  | 'virtualRange' | 'loading' | 'selectionChange' | 'bulkAction' | 'filterChange'
  | 'responsive';

export default class Vantable<Row = VantableRow> {
  constructor(target: string | HTMLElement, options: VantableOptions<Row>);

  /** Library version. */
  static version: string;
  /** The default stylesheet as a string. */
  static css: string;
  /** Inject a stylesheet manually (the built-in one when `css` is omitted).
   *  The same CSS text is never injected twice into one document. */
  static injectStyles(css?: string): void;
  /** Ready-made XLSX/PDF adapter: POSTs the payload to `url` (→ your Go binary)
   *  and downloads the returned file. */
  static serverExport(url: string, opts?: { headers?: Record<string, string> }): VantableExportAdapter;
  /** XLSX adapter via the third-party SheetJS library (not bundled: pass
   *  `{ lib: XLSX }` or load `xlsx` on the page). */
  static sheetJsExport(opts?: VantableSheetJsOptions): VantableExportAdapter;
  /** PDF adapter via the third-party jsPDF library (not bundled: pass
   *  `{ lib: jsPDF }` or load `jspdf` on the page). */
  static jsPdfExport(opts?: VantableJsPdfOptions): VantableExportAdapter;

  /** The host element the table is rendered into. */
  readonly el: HTMLElement;

  on(event: VantableEvent, cb: (payload: any) => void): this;
  /** Replace the client-side dataset and re-render. */
  setData(rows: Row[]): this;
  /** Re-render current view (re-fetches in server mode). */
  refresh(): this;
  /** Trigger a CSV export of the current dataset. */
  exportCsv(filename?: string): void;
  /** Print the current table. */
  print(): void;
  /** Is the table currently stacked into cards? */
  isStacked(): boolean;
  /** Bring a row of the current view into view by its index. */
  scrollToRow(index?: number): this;
  /** Every filter value, empty ones included. */
  filters(): Record<string, VantableFilterValue>;
  /** Only the filters that narrow the data (what a server is sent). */
  activeFilters(): Record<string, VantableFilterValue>;
  /** One column's filter value. */
  getFilter(key: string): VantableFilterValue | undefined;
  /** Set one column's filter; an empty value clears it. */
  setFilter(key: string, value: VantableFilterValue | '' | null): this;
  /** Drop every filter. */
  clearFilters(): this;

  /** Is this row id selected? */
  isSelected(id: string | number): boolean;
  /** The ids of every selected row, as strings. */
  selectedIds(): string[];
  /** How many rows are selected. */
  selectedCount(): number;
  /** The selected rows that can be resolved (in server mode: those on the page). */
  selectedRows(): Row[];
  /** Select or unselect a row; no second argument flips it. */
  selectRow(id: string | number, on?: boolean): this;
  /** Select every selectable row of the current view (page). */
  selectAll(): this;
  /** Drop the whole selection, including rows that are off screen. */
  clearSelection(): this;

  /** Turn the loading state on (no argument) or off, for data you fetch
   *  yourself. A server source does this around its own fetches. */
  setLoading(on?: boolean): this;
  /** Show an error state; `null` clears it (client data is then re-rendered,
   *  a server source is only repainted). */
  setError(err: Error | string | null): this;

  /** Show or hide a column; no second argument flips it. */
  toggleColumn(key: string, visible?: boolean): this;
  /** Hide a column. */
  hideColumn(key: string): this;
  /** Show a column again. */
  showColumn(key: string): this;
  /** Move a column to another index in the column array (hidden included). */
  moveColumn(key: string, index: number): this;
  /** Set a column width (`"120px"` or `120`). */
  setColumnWidth(key: string, width: string | number): this;
  /** Freeze a column to one edge, or unpin it with `false` / `null`. */
  pinColumn(key: string, side: VantableColumnPin): this;
  /** The column keys in their current order. */
  columnOrder(): string[];
  /** A serialisable snapshot of order, visibility, widths and pins. */
  columnState(): VantableColumnLayout[];
  /** Restore a `columnState()` snapshot. */
  setColumnState(state?: Array<Partial<VantableColumnLayout>>): this;
  /** Remove the table from the DOM, detach listeners and close its
   *  confirmation dialog if one is open. */
  destroy(): void;
}

// UMD global (for <script> usage: the global is `Vantable`).
export as namespace Vantable;
