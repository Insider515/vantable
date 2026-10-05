// Typed usage example — also serves as a compile-time test of vantable.d.ts.
import Vantable, {
  VantableOptions,
  VantableColumnDef,
  VantableServerRequest,
  VantableServerResponse,
  VantableColumnLayout,
  VantableFilterValue
} from '../src/vantable';

interface User {
  id: number;
  name: string;
  email: string;
  status: number;
}

const columns: VantableColumnDef<User>[] = [
  { key: 'id', label: 'ID', type: 'number', width: '60px' },
  'name',                       // string shorthand
  ['email', 'Email'],           // [key, label] tuple
  {
    key: 'status', label: 'Status', type: 'status',
    map: { 1: { label: 'On', color: '#0a0' }, 2: { label: 'Off', color: '#a00' } }
  },
  { key: 'name', label: 'Profile', type: 'link', href: (r) => `/u/${r.id}`, target: '_blank' },
  {
    label: 'Actions', type: 'actions',
    edit: { enabled: true },
    remove: {
      enabled: true, url: (r) => `/api/users/${r.id}`, method: 'DELETE',
      confirm: {
        title: 'Delete', className: 'my-modal', overlayClassName: 'my-veil',
        bodyClassName: 'my-body', footClassName: 'my-foot',
        cancelClassName: 'my-btn', confirmClassName: 'my-btn my-btn-red'
      }
    },
    custom: [{ label: 'Ping', onClick: (r) => console.log(r.name) }],
    menu: { icon: '⋯', label: 'Row actions' }
  },
  { label: 'Inline', type: 'actions', menu: false, custom: [{ label: 'Go' }] }
];

const opts: VantableOptions<User> = {
  columns,
  data: [],
  rowId: 'id',
  search: 'live',
  searchFields: ['name', 'email'],
  sort: 'server',
  pagination: { perPage: 25, options: [25, 50, 100] },
  theme: { accent: '#7c3aed', radius: '4px' },
  mode: 'dark',
  editable: true, keyboard: true,
  export: { formats: ['csv','xlsx','pdf'], filename: 'users', adapters: { xlsx: Vantable.serverExport('/service/export'), pdf: Vantable.serverExport('/service/export') } },
  onSave: (id, changes, row) => { console.log(id, changes, row.email); },
  onRowClick: (row) => { if (row) console.log(row.id); },
  accordion: { columns: [['email', 'Email'], 'name'] },
  server: {
    fetch: async (req: VantableServerRequest): Promise<VantableServerResponse<User>> => {
      const url = `/api/users?page=${req.page}&per_page=${req.perPage}&sort=${req.sort}&dir=${req.dir}`;
      void url;
      return { rows: [], total: 0 };
    }
  }
};

const t = new Vantable<User>('#host', opts);
t.on('save', (p) => console.log(p));
t.setData([]).refresh();
t.exportCsv('users');
t.print();
console.log(Vantable.version, Vantable.css.length);
Vantable.injectStyles();

// Third-party adapter presets (libraries supplied by the host page).
const xlsxViaSheetJs = Vantable.sheetJsExport({ sheetName: 'Users' });
const pdfViaJsPdf = Vantable.jsPdfExport({ orientation: 'landscape', unit: 'mm', fontSize: 9 });
const xlsxViaGoBinary = Vantable.serverExport('/service/export', { headers: { 'X-CSRF-TOKEN': 'x' } });
void [xlsxViaSheetJs, pdfViaJsPdf, xlsxViaGoBinary];

const t2 = new Vantable<User>('#host2', {
  columns,
  data: [],
  export: {
    formats: ['csv', 'xlsx', 'pdf'],
    filename: 'users',
    adapters: { xlsx: xlsxViaSheetJs, pdf: pdfViaJsPdf }
  }
});
t2.on('error', (err) => console.error(err));
t2.destroy();

// Column operations (typed).
const t3 = new Vantable<User>('#host3', {
  columns: [
    { key: 'id', label: 'ID', type: 'number', width: 60, pin: 'left', resizable: false },
    { key: 'name', label: 'Name', width: '180px' },
    { key: 'email', label: 'Email', hidden: true },
    { key: 'status', label: 'Status', type: 'number', pin: 'right', reorderable: false }
  ],
  data: [],
  resize: true,
  reorder: true,
  columnPicker: true,
  stickyHeader: true,
  maxHeight: '60vh',
  minColWidth: 64,
  labels: { columns: 'Колонки' }
});
t3.on('columnResize', (e) => console.log(e));
t3.on('columnMove', (e) => console.log(e));
t3.on('columnPin', (e) => console.log(e));
t3.on('columnVisibility', (e) => console.log(e));
t3.hideColumn('email').showColumn('email').toggleColumn('email', false);
t3.moveColumn('name', 0).setColumnWidth('name', 200).pinColumn('name', 'left').pinColumn('name', false);
const layout: VantableColumnLayout[] = t3.columnState();
const order: string[] = t3.columnOrder();
t3.setColumnState(layout);
void order;
t3.destroy();

// Virtualization (typed).
const t4 = new Vantable<User>('#host4', {
  columns,
  data: [],
  pagination: false,
  virtual: { rowHeight: 32, overscan: 10 },
  maxHeight: 480
});
t4.on('virtualRange', (e) => console.log(e));
t4.scrollToRow(5000);
t4.scrollToRow();
// Responsive (typed).
const t12 = new Vantable<User>('#host12', { columns, data: [], responsive: { breakpoint: 520 } });
t12.on('responsive', (e) => console.log(e));
const stacked: boolean = t12.isStacked();
void stacked;
t12.destroy();
const t13 = new Vantable<User>('#host13', { columns, data: [], responsive: true });
t13.destroy();

// Per-column filters (typed).
const t11 = new Vantable<User>('#host11', {
  columns: [
    { key: 'id', label: 'ID', type: 'number', filter: 'number' },
    { key: 'name', label: 'Name', filter: true },
    { key: 'email', label: 'Email', filter: { type: 'text', placeholder: 'search email' } },
    { key: 'status', label: 'Status', type: 'number', filter: { type: 'select', options: [{ value: 1, label: 'On' }] } }
  ],
  data: [],
  filters: 'client',
  labels: { filterAll: 'Все', filterMin: 'От', filterMax: 'До' }
});
t11.on('filterChange', (e) => console.log(e));
t11.setFilter('name', 'ann').setFilter('id', { min: 1, max: 10 }).setFilter('name', '');
const active: Record<string, VantableFilterValue> = t11.activeFilters();
void [active, t11.filters(), t11.getFilter('name')];
t11.clearFilters().destroy();

// Styles (typed): ours, none, yours, or both.
const t14 = new Vantable<User>('#host14', { columns, data: [], styles: false });
const t15 = new Vantable<User>('#host15', { columns, data: [], styles: '.vt-table { border: 0 }' });
const t16 = new Vantable<User>('#host16', {
  columns, data: [],
  styles: { css: '.vt-th { text-transform: uppercase }', href: '/css/table.css', extend: true }
});
Vantable.injectStyles();
Vantable.injectStyles('.vt-td { padding: 4px }');
[t14, t15, t16].forEach((t) => t.destroy());

// ARIA naming (typed).
const t9 = new Vantable<User>('#host9', { columns, data: [], label: 'Users' });
const t10 = new Vantable<User>('#host10', {
  columns, data: [], labelledby: 'users-heading',
  labels: { grid: 'Таблица данных', bulkActions: 'Массовые действия', expandRow: 'Раскрыть строку' }
});
t9.destroy();
t10.destroy();

// Row selection (typed).
const t8 = new Vantable<User>('#host8', {
  columns,
  data: [],
  selection: {
    mode: 'multi',
    header: true,
    selectable: (row) => row.status === 1,
    actions: [
      { label: 'Delete', className: 'vt-danger', onClick: (rows, ids) => console.log(rows.length, ids) },
      { label: 'Export' }
    ]
  },
  labels: { selected: 'Выбрано: {n}', clearSelection: 'Сбросить' }
});
t8.on('selectionChange', (e) => console.log(e));
t8.on('bulkAction', (e) => console.log(e));
t8.selectRow(1).selectRow('2', true).selectAll().clearSelection();
const picked: User[] = t8.selectedRows();
const pickedIds: string[] = t8.selectedIds();
void [picked, pickedIds, t8.selectedCount(), t8.isSelected(1)];
t8.destroy();

// Async states (typed).
const t6 = new Vantable<User>('#host6', {
  columns,
  states: { loading: true, skeleton: 5, error: true, retry: true },
  labels: { loading: 'Загрузка…', error: 'Не удалось загрузить', retry: 'Повторить' },
  server: { fetch: async () => ({ rows: [], total: 0 }) }
});
t6.on('loading', (e) => console.log(e));
t6.setLoading(true).setLoading(false).setError(new Error('x')).setError('plain').setError(null);
const t7 = new Vantable<User>('#host7', { columns, data: [], states: false });
t7.destroy();
t6.destroy();

const t5 = new Vantable<User>('#host5', { columns, data: [], virtual: true });
t5.destroy();
t4.destroy();

t.destroy();
