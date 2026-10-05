# vantable

> 🇬🇧 English version: [README.md](README.md)

Таблиця даних для дашбордів на чистому JavaScript, **без жодних залежностей**. Без
jQuery, без Bootstrap, без XLSX-бібліотек. На одній сторінці може працювати скільки
завгодно незалежних екземплярів.

Вона об'єднує в одному налаштовуваному компоненті те, що раніше було розкидане по
кількох окремих компонентах дашборда:

- **клієнтські** пошук / сортування / пагінація;
- **серверні** пошук / сортування / пагінація (через колбек `fetch`);
- **багаті типи колонок**: `text`, `number`, `link`, `external`, `copy`, `status`, `select`/`tag`, `image`, `textarea`, `download`, `html` (власний рендер), `actions`;
- **дії над рядком**: редагування / видалення (із вбудованим вікном підтвердження) / власні;
- **редагування рядка на місці** з колбеком збереження;
- **акордеон** — розгортувані рядки з деталями;
- **експорт CSV** і **друк** без залежностей;
- **операції з колонками**: зміна ширини, перестановка, закріплення, приховування, липка шапка;
- **віртуалізація** великих наборів, **пер-колонкові фільтри**, **вибір рядків** із масовими діями;
- **стани завантаження / помилки / скелетона**, **адаптивний** режим карток;
- повна підтримка **WAI-ARIA grid** і навігації з клавіатури.

**[Жива демонстрація](https://insider515.github.io/vantable/)** · [npm](https://www.npmjs.com/package/vantable)

<img src="https://raw.githubusercontent.com/Insider515/vantable/master/docs/screenshot.png" alt="Демонстрація в темній темі: таблиця з тринадцятьма типами колонок — аватари, посилання, кнопки копіювання, списки в комірках, бейджі статусу, смуги трафіку, кнопки завантаження та випадне меню дій рядка — над нею поле пошуку з меню колонок і кнопками експорту, під нею пагінація" width="1254">

## Встановлення

```bash
npm install vantable
```

або через CDN (глобальна змінна `Vantable`):

```html
<link rel="stylesheet" href="https://unpkg.com/vantable/src/vantable.css">
<script src="https://unpkg.com/vantable/dist/vantable.umd.js"></script>
```

## Використання

```js
import Vantable from 'vantable';
// Імпортувати CSS не потрібно — стилі за замовчуванням додаються автоматично.
// (Як це налаштувати, вимкнути або підключити файл самому — див. «Оформлення».)

const table = new Vantable('#host', {
  rowId: 'id',
  columns: [
    { key: 'id',       label: 'ID',     type: 'number', width: '60px' },
    { key: 'username', label: 'Користувач', type: 'link', href: r => `/users/${r.id}`, editable: true },
    { key: 'token',    label: 'Токен',  type: 'copy' },
    { key: 'status',   label: 'Статус', type: 'status',
      map: { 1: { label: 'Увімкнено', color: '#22a06b' }, 2: { label: 'Вимкнено', color: '#e35d4b' } } },
    { key: 'note',     label: 'Нотатка', type: 'textarea', editable: true },
    { label: 'Дії', type: 'actions',
      edit:   { enabled: true },
      custom: [{ label: 'Пінг', onClick: row => ping(row) }],
      remove: { enabled: true, url: r => `/api/users/${r.id}`, method: 'DELETE' } }
  ],
  data: rows,
  editable: true,
  pagination: { perPage: 50, options: [50, 100, 250, 500] },
  onSave: (id, changes, row) => save(id, changes)
});
```

Так само працює і через `<script>` — глобальна змінна називається `Vantable`.

## Опції

| опція | тип | опис |
|---|---|---|
| `columns` | масив | визначення колонок (див. нижче) — обов'язкова |
| `data` | масив | рядки на боці клієнта |
| `rowId` | рядок | назва поля-ідентифікатора (типово `"id"`) |
| `search` | `'live'` \| `'server'` \| `false` | режим пошуку (див. **Режими пошуку й сортування**); типово залежить від джерела даних |
| `searchFields` | масив | за якими ключами шукати; **не вказано → усі колонки** |
| `filters` | bool \| `'client'` \| `'server'` | режим пер-колонкових фільтрів (колонки вмикають їх самі) |
| `sort` | `'client'` \| `'server'` \| `false` | режим сортування; типово залежить від джерела |
| `pagination` | bool \| `{ perPage, options }` | пагінація (типово `{ perPage:50, options:[50,100,250,500] }`); `false` — вимкнути |
| `server` | `{ fetch }` | серверне джерело для режимів `'server'` (див. нижче) |
| `editable` | bool | редагування рядка на місці |
| `onSave` | `(id, changes, row) => void` | викликається після збереження |
| `actions` | `{ edit, remove, custom, menu }` | дії над рядком, якщо немає колонки типу `actions` |
| `accordion` | `{ render(row) }` або `{ columns }` | розгортувані рядки з деталями |
| `export` | bool \| `{ formats, filename, adapters }` | кнопки експорту; CSV вбудований, XLSX/PDF — через адаптери |
| `printable` | bool | кнопка друку (типово `true`) |
| `resize` | bool | зміна ширини колонки перетягуванням краю шапки |
| `reorder` | bool | перестановка колонок перетягуванням шапки |
| `columnPicker` | bool | меню з перемикачами колонок у панелі інструментів |
| `stickyHeader` | bool | шапка лишається на місці при прокручуванні (потрібен `maxHeight`) |
| `maxHeight` | рядок \| число | висота області прокручування, напр. `'60vh'` / `420` |
| `minColWidth` | число | мінімальна ширина при перетягуванні, px (типово `48`) |
| `virtual` | bool \| `{ rowHeight, overscan }` | рендерити лише видимі рядки (див. **Віртуалізація**) |
| `responsive` | bool \| `{ breakpoint }` | перетворювати рядки на картки на вузькій таблиці |
| `states` | bool \| `{ loading, skeleton, error, retry }` | асинхронні стани; увімкнено типово |
| `selection` | bool \| `{ mode, header, selectable, actions }` | чекбокси рядків і масові дії |
| `emptyText` | рядок | текст, коли рядків немає |
| `defaultSort` / `defaultDir` | рядок | ключ колонки і `'asc'`/`'desc'`, з якими таблиця стартує |
| `exportName` | рядок | базова назва файлу експорту (типово `'table'`) |
| `exportable` | bool | **застаріле** — використовуйте `export` |
| `keyboard` | bool | навігація з клавіатури (типово `true`) |
| `styles` | bool \| рядок \| `{ css, href, extend }` | який аркуш стилів додати: наш, ваш, обидва чи жодного (див. **Оформлення**) |
| `theme` | об'єкт | перевизначення CSS-змінних, напр. `{ accent:'#f00' }` |
| `mode` | `'dark'` \| `'light'` | примусова колірна схема |
| `label` | рядок | доступна назва таблиці (`aria-label`) |
| `labelledby` | рядок | id елемента, що називає таблицю (`aria-labelledby`) |
| `labels` | об'єкт | переклад інтерфейсу (див. **Переклад**) |

## Типи колонок

`{ key, label, type, sortable, editable, align, width, className }` плюс властивості
операцій із колонками `{ pin, hidden, resizable, reorderable }`, `filter`, а також
специфічні для типу:

- `text` / `number` — звичайне значення (підтримує `prefix` / `suffix`);
- `link` — `{ href: row=>url | string, target, text }`;
- `external` — відкриває в новій вкладці з позначкою ↗ і `rel="noopener"`;
- `copy` — значення плюс кнопка копіювання;
- `status` — `{ map: { значення: { label, color } } }` → кольоровий бейдж;
- `select` / `tag` — `{ options: [{value,label}], onChange(row, value) }`;
- `image` — `{ src: row=>url }` (або значення комірки);
- `download` — `{ filename, text }`, зберігає значення комірки у файл;
- `html` — `{ render: (value, row) => htmlString }` (сирий HTML, **не** екранується);
- `actions` — `{ edit, remove, custom:[{label, onClick, className}], menu }`.

Усі інші типи екрануються автоматично. Сирий HTML дає лише тип `html` (і `render()`
в акордеоні).

## Режими пошуку й сортування

Пошук і сортування мають **два незалежні режими**, які ви обираєте при підключенні:

- **`'live'` / `'client'`** — фільтрує або сортує вже завантажені рядки в браузері
  (миттєво, без запиту). Підходить, коли весь набір поміщається на клієнті.
- **`'server'` / `'db'`** — надсилає запит у `server.fetch`, тобто справжній пошук і
  сортування робить **база даних** по всій таблиці. Це правильний вибір, коли рядки
  посторінково приходять із сервера: клієнтський фільтр бачив би лише поточну сторінку.

Режими незалежні: можна шукати на сервері, а сортувати в браузері, і навпаки.
`false` вимикає можливість повністю.

## Серверний режим

```js
new Vantable('#host', {
  columns,
  server: {
    async fetch({ page, perPage, q, fields, sort, dir, filters }) {
      const res = await fetch(`/api/users?page=${page}&per_page=${perPage}`);
      const json = await res.json();
      return { rows: json.data, total: json.meta.total };
    }
  }
});
```

У запит потрапляють лише ті можливості, що працюють у серверному режимі: `q` і
`fields` — коли серверний пошук, `sort`/`dir` — коли серверне сортування, `filters` —
коли серверні фільтри. Решту таблиця застосовує до отриманої сторінки сама.

**Важливо:** `server.fetch` не повинен кидати виняток синхронно — повертайте
відхилений проміс, інакше помилка пройде повз обробник і вилетить із `refresh()`.

## Події

```js
table.on('save',   ({ id, changes, row }) => {});
table.on('remove', ({ id, row, ok }) => {});
table.on('edit',   ({ id, row }) => {});
table.on('action', ({ id, index, row }) => {});
table.on('cellChange', ({ id, column, value, row }) => {});
table.on('expand', ({ id, open, row }) => {});
table.on('copy',   ({ text }) => {});
table.on('render', ({ rows }) => {});
table.on('destroy', () => {});
table.on('export', ({ format, rows }) => {});
table.on('error',  (err) => {});

table.on('columnResize',     ({ key, width }) => {});
table.on('columnMove',       ({ key, from, to, order }) => {});
table.on('columnPin',        ({ key, pin }) => {});
table.on('columnVisibility', ({ key, hidden }) => {});
table.on('virtualRange',     ({ start, end, total }) => {});
table.on('loading',          ({ loading }) => {});
table.on('filterChange',     ({ key, value, filters }) => {});
table.on('selectionChange',  ({ ids, rows, count }) => {});
table.on('bulkAction',       ({ index, label, ids, rows }) => {});
table.on('responsive',       ({ stacked, width }) => {});
```

## API

```js
table.setData(rows);   // замінити клієнтський набір даних
table.refresh();       // перемалювати (у серверному режимі — перезапитати)
table.exportCsv(name); // експорт CSV
table.print();         // друк
table.scrollToRow(i);  // прокрутити до рядка з індексом i
table.isStacked();     // чи таблиця зараз у режимі карток
table.setLoading(on);  // стан завантаження для даних, які ви вантажите самі
table.setError(err);   // показати помилку; null — прибрати
table.destroy();       // прибрати з DOM

// Фільтри:
table.setFilter(key, value);  // '' або null очищає
table.getFilter(key);
table.filters();              // усі значення, включно з порожніми
table.activeFilters();        // лише ті, що звужують дані
table.clearFilters();

// Вибір рядків:
table.selectRow(id, on?);  // без другого аргументу — перемикає
table.selectAll();         // усі доступні рядки поточного подання (сторінки)
table.clearSelection();    // включно з рядками поза екраном
table.selectedIds();       // ['1', '7', ...]
table.selectedRows();      // рядки, які вдалося знайти зараз
table.selectedCount();
table.isSelected(id);

// Операції з колонками:
table.toggleColumn(key, visible?);
table.hideColumn(key);
table.showColumn(key);
table.moveColumn(key, index);
table.setColumnWidth(key, '120px');
table.pinColumn(key, 'left');   // 'right' | false
table.columnOrder();
table.columnState();            // знімок розкладки
table.setColumnState(snapshot); // відновити розкладку
```

Статичні члени:

```js
Vantable.version;                 // '0.2.0'
Vantable.css;                     // стилі за замовчуванням рядком
Vantable.injectStyles(css?);      // додати аркуш стилів (без аргументу — типовий)
Vantable.serverExport(url, opts); // адаптер експорту: POST payload → файл
Vantable.sheetJsExport(opts);     // адаптер XLSX через SheetJS у браузері
Vantable.jsPdfExport(opts);       // адаптер PDF через jsPDF у браузері
```

## Експорт (CSV / XLSX / PDF)

**CSV вбудований і не тягне залежностей.** XLSX і PDF працюють через необов'язкові
**адаптери** — тому сам пакет лишається без залежностей, а ви обираєте, чим саме
створювати важкі формати.

```js
new Vantable('#host', {
  columns, data,
  export: {
    formats: ['csv', 'xlsx', 'pdf'],   // які кнопки показати (типово ['csv'])
    filename: 'users',
    adapters: {
      xlsx: Vantable.serverExport('/service/export'),
      pdf:  Vantable.serverExport('/service/export')
    }
  }
});
```

Адаптер — це просто `(payload) => void | Promise<void>`, де payload має вигляд

```js
{ format, filename, columns: [{ key, label }], rows: [{ key: value }] }
```

Він охоплює рядки поточного подання: усі клієнтські після пошуку, фільтрів і
сортування або отриману сторінку в серверному режимі. Колонки типу `actions` і
приховані колонки не потрапляють.

### Три готові адаптери

| адаптер | де створюється файл | що потрібно |
|---|---|---|
| `Vantable.serverExport(url, { headers })` | ваш бекенд (**рекомендовано**) | ендпоінт, що повертає файл |
| `Vantable.sheetJsExport({ lib, sheetName })` | браузер | [SheetJS](https://sheetjs.com) на сторінці або в `lib` |
| `Vantable.jsPdfExport({ lib, orientation, unit, format, fontSize, margin })` | браузер | [jsPDF](https://github.com/parallax/jsPDF) у `lib`; використовує `jspdf-autotable`, якщо той підключений |

Обидва браузерні адаптери кидають зрозумілу помилку, якщо бібліотеки немає. jsPDF
малює нелатиницю лише з Unicode-шрифтом, який зареєструвала ваша сторінка; Go-бінарник
робить це сам.

### Типовий шлях: Go-бінарник, а не сервіс

`tools/vtexport` перетворює payload на справжній `.xlsx` / `.pdf` (`excelize` /
`fpdf`). Він читає JSON зі stdin і пише файл у stdout — ваш застосунок просто
пропускає через нього дані, нічого не треба тримати запущеним. Ширини колонок у PDF
залежать від вмісту, довгі значення переносяться; кирилиця потребує Unicode-TTF
(шукається автоматично, перевизначається через `$VTEXPORT_FONT`), а без нього текст
зводиться до Latin-1, замість того щоб падати. Збірка і готовий ендпоінт для
AdonisJS — у `tools/vtexport/README.md`.

### Якщо для формату немає адаптера

Кнопка видає подію `error` (`no export adapter for "pdf"`) і віддає вбудований CSV —
щоб підміна не була мовчазною:

```js
table.on('error', (err) => console.warn(err.message));
```

## Операції з колонками

Зміна ширини, перестановка, закріплення, приховування та липка шапка. Усе
**вимкнено за замовчуванням**: таблиця без цих опцій поводиться точно як раніше.

```js
new Vantable('#host', {
  columns: [
    { key: 'id',    label: 'ID',      width: 70, pin: 'left', resizable: false },
    { key: 'name',  label: 'Назва',   width: 180 },
    { key: 'token', label: 'Токен',   hidden: true },
    { label: 'Дії', type: 'actions', pin: 'right', reorderable: false }
  ],
  data,
  resize: true,          // тягнути край шапки
  reorder: true,         // перетягнути шапку на іншу
  columnPicker: true,    // меню «Columns» у панелі
  stickyHeader: true,    // шапка лишається на місці…
  maxHeight: '60vh'      // …для цього потрібна обмежена область прокручування
});
```

| на колонці | значення |
|---|---|
| `pin: 'left' \| 'right'` | закріпити колонку біля відповідного краю |
| `hidden: true` | стартувати прихованою (повернути можна через `columnPicker`) |
| `width: 180 \| '180px'` | початкова ширина; перетягування її перезаписує |
| `resizable: false` | не дозволяти змінювати ширину |
| `reorderable: false` | не дозволяти переставляти |

**Ширина** — тягніть смужку завширшки 7px біля правого краю шапки (`.vt-resizer`).
Менше за `minColWidth` (48px) не стане. Коли ширини відомі, таблиця переходить у
`table-layout: fixed`, щоб перетягування однієї колонки не перебудовувало решту.
Відпускання після перетягування не сортує.

**Перестановка** — натисніть шапку й перетягніть її на іншу; перетягувану позначає
`.vt-th-dragging`, ціль — `.vt-drop-target`. Використані звичайні події миші (а не
HTML5 drag-and-drop), тож це однаково працює всередині контейнерів з прокручуванням.
Клік без руху, як і раніше, сортує.

**Закріплення** — закріплені колонки **групуються біля країв**: спершу ліві (у своєму
порядку), потім вільні, потім праві. Вони отримують `position: sticky` і накопичувальні
зсуви `left`/`right`, тож кілька закріплених з одного боку шикуються правильно. З
акордеоном разом із ними «липне» і колонка-розгортач. У рантаймі —
`pinColumn(key, 'left'|'right'|false)`.

**Показ і приховування** — `hidden` у колонці, методи `hideColumn` / `showColumn` /
`toggleColumn`, або `columnPicker: true` для меню в панелі (його кнопку називає лейбл
`columns`). Прихована колонка зникає із шапки, рядків, `aria-colcount`, `colspan`
порожнього рядка **та з експорту**, але її дані далі беруть участь у пошуку.

**Липка шапка** — `stickyHeader: true` додає `.vt-sticky-head` на корінь. `position:
sticky` потребує області прокручування з висотою, тому задайте `maxHeight` (або свою
висоту для `.vt-scroll`); відступ від іншого фіксованого елемента сторінки задається
змінною `--vt-sticky-top`.

**Збереження розкладки** — `columnState()` повертає звичайний масив
(`[{ key, hidden, width, pin }, ...]` у поточному порядку) для localStorage чи вашого
бекенда; `setColumnState(snapshot)` його відновлює. Невідомі ключі ігноруються, а
колонки, яких немає у знімку, лишаються в кінці — тож додавання нової колонки не
ламає збережену розкладку. Колонки без ключа (`actions`, обчислювані `html`)
адресуються згенерованим ідентифікатором (`col0`, `col1`, …).

## Пер-колонкові фільтри

Рядок фільтрів у шапці, по одному контролу на колонку, яка цього попросила. Колонки
вмикають фільтр самі, а опція `filters` задає лише режим:

```js
new Vantable('#host', {
  columns: [
    { key: 'id',     label: 'ID',     type: 'number', filter: 'number' },   // від / до
    { key: 'name',   label: 'Назва',  filter: true },                       // текст
    { key: 'status', label: 'Статус', type: 'status', map: STATUS, filter: 'select' },
    { key: 'note',   label: 'Нотатка' }                                     // без фільтра
  ],
  data,
  filters: 'client'       // або 'server'; не вказано — як у джерела даних
});
```

| `filter` | контрол | як збігається |
|---|---|---|
| `true` | текст, а якщо колонка має `map` / `options` — випадний список | підрядок без урахування регістру |
| `'text'` | поле пошуку | підрядок без урахування регістру |
| `'select'` | список; варіанти з `filter.options`, інакше з `map` / `options` колонки | точне значення |
| `'number'` | два поля (від / до) | числовий діапазон; рядки з нечисловим значенням випадають |
| `{ type, options, placeholder }` | те саме, але налаштоване | |

- **Рядок живе у `<thead>`**, тому успадковує порядок колонок, приховування,
  закріплення (отримує ті самі sticky-зсуви) і липку шапку (прилипає одразу під нею).
- **Клієнтський режим** звужує рядки в браузері; **серверний** надсилає активні
  фільтри як `req.filters` (`{ ключ: значення }`, діапазон як `{ min, max }`).
  Введення дебаунситься (150 мс клієнт, 300 мс сервер), список застосовується одразу.
- Фільтри, глобальний пошук і сортування працюють як **І**: рядок має пройти все.
  Встановлення фільтра повертає на першу сторінку, а **експорт охоплює відфільтровані
  рядки**.
- Поле фільтра не втрачає фокус під час набору, і рядок фільтрів не входить до
  клавіатурної сітки (до нього дістаєтесь через `Tab`).
- `setFilter` / `getFilter` / `filters()` / `activeFilters()` / `clearFilters()`
  керують тим самим станом із коду, а кожна зміна породжує подію `filterChange`.

## Дії над рядком

Колонка типу `actions` (або `options.actions`) малює **один тригер, що відкриває
випадний список** дій рядка — у вузьку комірку не влізе більше двох-трьох кнопок, а
меню вміщує скільки завгодно:

```js
{
  label: 'Дії', type: 'actions',
  edit: { enabled: true },
  custom: [{ label: 'Пінг', onClick: ping }, { label: 'Перезапуск', onClick: restart }],
  remove: { enabled: true, url: (r) => `/api/users/${r.id}` },
  menu: { icon: '⋯', label: 'Дії над рядком' }   // або menu: false — ряд кнопок
}
```

- Тригер типово `☰ ▾`, має `aria-haspopup="menu"` та `aria-expanded`, називається
  лейблом `actions` (або `menu.label`). Меню — `role="menu"` з пунктами
  `role="menuitem"`, «Видалити» лишається червоним.
- Закривається після вибору, за кліком будь-де ще (у таблиці й поза нею) і за
  `Escape` — фокус повертається на тригер. Одночасно відкрите лише одне меню, а біля
  нижнього краю воно розкривається вгору.
- Клавіатура: `Enter` на комірці дій відкриває меню й ставить фокус на перший пункт,
  `↑`/`↓` ходять по пунктах із заворотом, `Enter` виконує.
- Поки рядок редагується, у комірці звичайні кнопки **Зберегти / Скасувати** — це
  інший режим, а не перелік дій.
- `menu: false` повертає попередній вигляд (усі дії кнопками в комірці).
- **«Видалити»** спершу запитує підтвердження у вбудованому вікні. Воно
  успадковує тему таблиці, а `remove.confirm` змінює його вигляд — див.
  [Оформлення](#оформлення).

## Вибір рядків

Колонка з чекбоксами, «вибрати все» в шапці й панель масових дій, що з'являється,
коли щось вибрано. Вмикається явно:

```js
new Vantable('#host', {
  columns, data,
  selection: {
    mode: 'multi',                            // або 'single'
    header: true,                             // чекбокс «вибрати все»
    selectable: (row) => row.status === 1,    // false → чекбокс рядка заблокований
    actions: [
      { label: 'Видалити', className: 'vt-danger', onClick: (rows, ids) => remove(ids) },
      { label: 'Експорт', onClick: (rows) => exportRows(rows) }
    ]
  }
});
```

- **Колонка чекбоксів іде першою** в рядку (перед розгортачем акордеона, якщо він є) і
  враховується в `aria-colcount` та в `colspan` порожнього рядка, скелетона й рядка
  помилки. Рядки отримують `.vt-selected` і `aria-selected`.
- **«Вибрати все» охоплює поточне подання** — тобто поточну сторінку — і переходить у
  невизначений стан, коли вибрано частину доступних рядків. Рядки, вибрані на іншій
  сторінці, лишаються вибраними; `clearSelection()` скидає все.
- **Вибір зберігається за id рядка**, тож переживає пошук, сортування, перегортання,
  оновлення з сервера й віртуалізований скрол. `selectedIds()` завжди повертає весь
  вибір; `selectedRows()` — ті рядки, які вдається знайти зараз (у серверному режимі —
  з поточної сторінки).
- **Масові дії** отримують `(rows, ids)`, і кожне натискання також породжує
  `bulkAction`. На панелі є лічильник (лейбл `selected`, `{n}` — кількість) і кнопка
  очищення; поки нічого не вибрано, панель прихована.
- **`mode: 'single'`** лишає вибраним один рядок і не малює «вибрати все».
- Клік по чекбоксу не рахується кліком по рядку (`onRowClick` не спрацьовує), а друк
  чекбокси прибирає.

## Завантаження / помилка / скелетон

Таблиця з джерелом `server` керує цим сама; таблиця, дані для якої вантажите ви,
керується методами `setLoading()` / `setError()`. Усі три стани увімкнені типово —
`states: false` вимикає їх, або вимкніть окремі частини.

```js
new Vantable('#host', {
  columns,
  server: { fetch: loadPage },
  states: {
    loading: true,    // накладка + aria-busy, поки триває запит
    skeleton: 8,      // рядки-заглушки, поки показувати нічого
    error: true,      // рядок помилки замість порожнього рядка
    retry: true       // з кнопкою «Повторити»
  },
  labels: { loading: 'Завантаження…', error: 'Не вдалося завантажити', retry: 'Повторити' }
});
```

**Завантаження** — клас `.vt-loading` на корені, `aria-busy="true"` на таблиці й
накладка (`role="status"`) поверх області прокручування. *Перезавантаження* лишає
рядки на екрані під накладкою; скелетон з'являється лише тоді, коли показувати ще
нічого. Подія `loading` повідомляє про обидва переходи.

**Скелетон** — `skeleton` рядків-заглушок (`.vt-skel-row`, `aria-hidden`), по одному
мерехтливому блоку на видиму колонку, з урахуванням закріплень і розгортача акордеона.
У клавіатурну сітку вони не входять. `skeleton: false` лишає звичайний порожній рядок.

**Помилка** — невдалий `server.fetch` і далі породжує подію `error`, **а також** малює
рядок помилки (`role="alert"`) з лейблом `error`, власним повідомленням збою та
кнопкою «Повторити», яка скидає стан і повторює запит. `states.error: false` повертає
попередню поведінку (звичайний порожній рядок). `setError(err)` показує той самий
рядок для помилки, яку ви обробили самі; `setError(null)` його прибирає — клієнтські
дані перемальовуються, серверне джерело лише перемальовується, тож момент повторного
запиту вирішуєте ви.

**Застарілі відповіді відкидаються.** Кожен `refresh()` скасовує попередній, тому
повільна відповідь, що програла гонку (дебаунс пошуку, швидке перегортання), уже не
запише рядки й не зніме стан завантаження.

## Віртуалізація

Для великих клієнтських наборів: у DOM потрапляють лише видимі рядки, а замість решти
стоять два рядки-розпірки, тож смуга прокручування відповідає всьому набору.
Вмикається явно й потребує обмеженої області прокручування:

```js
new Vantable('#host', {
  columns, data,                      // 50 000 рядків — нормально
  pagination: false,                  // пагінація більше не потрібна
  virtual: { rowHeight: 37, overscan: 10 },
  maxHeight: '420px'                  // вікно вимірюється саме за цією висотою
});
```

- **Вікно слідує за прокручуванням.** Кожен вихід за межі поточного вікна перемальовує
  тіло й породжує `virtualRange` (`{ start, end, total }`); прокручування всередині
  вікна не чіпає нічого.
- **Висота рядка вимірюється** за першим відрендереним рядком і замінює `rowHeight`,
  щойно браузер її повідомить, — тобто за розмір відповідає CSS.
- **Решта бачить увесь набір**: пошук, сортування, пагінація, експорт і `state.total`
  не змінюються — віконним є лише DOM. `aria-rowcount` лишається повним, а кожен
  відрендерений рядок несе свій абсолютний `aria-rowindex`.
- **Клавіатура рухає вікно**: стрілка за межу відрендереного прокручує на рядок і
  продовжує рух; шапка лишається досяжною на верхньому рядку даних.
- **`scrollToRow(index)`** стрибає до рядка (і малює його), не шукаючи його в DOM.
- **Потрібна виміряна область.** Без `maxHeight` (чи власної висоти для `.vt-scroll`)
  висоти немає, і таблиця просто малює всі рядки, а не жодного.
- **Лише однакові за висотою рядки.** Рядки деталей акордеона не однакові, тому
  `virtual` ігнорується, поки акордеон налаштований (`table.virtual === null`).
- **Застереження:** рядок, який редагується на місці й виїхав за межі вікна,
  демонтується — набране зникає, рядок повертається в режимі редагування.

## Адаптивність

На вузькій таблиці кожен рядок стає карткою з назвою колонки перед кожним значенням.
Перемикання залежить від **власної ширини таблиці**, а не вікна браузера, тож таблиця
у вузькій бічній панелі перейде в картки, навіть якщо сторінка широка:

```js
new Vantable('#host', {
  columns, data,
  responsive: { breakpoint: 640 }   // або responsive: true для типових 640px
});
```

- Бібліотека міряє `.vt-root` на зміну розміру вікна (з дебаунсом) і перемикає клас
  `.vt-stacked`; усе інше робить CSS. `isStacked()` повідомляє поточний режим, а кожне
  перемикання породжує подію `responsive` з `{ stacked, width }`.
- Кожна комірка несе `data-label="<назва колонки>"`, який у режимі карток друкується
  перед значенням, — тож приховування й перестановка колонок враховуються.
- **Рядок фільтрів лишається видимим** як смужка полів над картками, тому
  пер-колонкові фільтри доступні й на телефоні. Пошук, сортування, вибір рядків із
  панеллю дій, пагінація, акордеон і асинхронні стани працюють.
- **Віртуалізація на час карток вимикається**: висота картки залежить від вмісту, тож
  вікно з фіксованою висотою рядка довіряти не можна. Для великих наборів на малих
  екранах користуйтеся пагінацією.
- Закріплені колонки перестають «липнути», шапка (а з нею ручки зміни ширини та
  перестановки) ховається, `table-layout: fixed` більше не діє.
- Ширина `0` означає «ще нічого не розміщено», тож лишається звичайна таблиця.

## Запити, CSRF і форми в комірках

Бібліотека робить **рівно два власні запити**, і в обох можна задати заголовки —
усе інше (ваш `server.fetch`, ваш колбек збереження, ваші форми) є вашим кодом з
вашим токеном.

| де | запит | як передати токен |
|---|---|---|
| дія рядка `remove`, коли в неї є `url` | `fetch(url, { method: 'DELETE', headers })` | `remove: { headers: { 'X-CSRF-TOKEN': token } }` |
| `Vantable.serverExport(url, opts)` | `POST` з JSON-payload | `Vantable.serverExport(url, { headers: { 'X-CSRF-TOKEN': token } })` |

```js
const csrf = document.querySelector('meta[name="csrf-token"]').content;

new Vantable('#host', {
  columns: [
    { key: 'name', label: 'Назва', editable: true },
    {
      label: 'Дії', type: 'actions',
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
  // Збереження правки на місці — ВАШ запит, тож і токен ваш:
  onSave: (id, changes) => fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
    body: JSON.stringify(changes)
  })
});
```

- **URL потрапляє у `fetch` дослівно.** Те, що повернула ваша функція `url`,
  використовується як є — нічого не кодується, бо значення може бути цілим URL
  із власним query. Якщо підставляти значення рядка просто в шлях, як у прикладі
  вище, значення на кшталт `1/../admin` змінить адресу запиту, тому кодуйте те,
  що приходить з даних: ``url: (row) => `/api/users/${encodeURIComponent(row.id)}` ``.
- **Нічого не додається без вашого відома.** Без `headers` запит іде без них, а
  `credentials` лишається за замовчуванням браузера (`same-origin`), тож
  сесійні куки йдуть із запитом на той самий домен і нічого не надсилається
  крос-доменно.
- **Невдале видалення повідомляється, а не ховається**: подія `remove`
  спрацьовує з `{ ok: false, error }`, рядок лишається, перемальовування немає —
  тож 403 або 419 від CSRF-захисту не змиє ваш інтерфейс помилки.
- **Форма в комірці працює як форма.** Використайте колонку `html`, залиште в
  ній прихований токен — таблиця не перехопить відправлення:

  ```js
  {
    label: '', type: 'html',
    render: (v, row) => `<form method="post" action="/users/${row.id}/ban">
      <input type="hidden" name="_csrf" value="${csrf}">
      <button type="submit" class="btn">Заблокувати</button></form>`
  }
  ```

  Прихований input не рахується інтерактивним контролом, тож `Enter` на цій
  комірці натискає кнопку; клік по ній не вважається кліком по рядку; а токен
  ніколи не потрапляє в експорт, бо той несе значення, а не відрендерену
  розмітку.
- **Перемальовування перебудовує комірки**, тож усе, що користувач набрав у
  вашій власній формі, зникне після наступного сортування, пошуку чи зміни
  сторінки. Редаговані значення тримайте в даних рядка (колонка `editable`) або
  поза таблицею.

## Використання з React / Vue / Angular / Svelte

vantable — звичайний клас, який володіє одним DOM-елементом, тож кожному фреймворку
потрібні ті самі три речі: **створити таблицю після появи елемента**, **передавати їй
нові дані замість перестворення** і **знищити її при розмонтуванні**. Жодного пакета-
обгортки ставити не треба — наведені фрагменти і є вся інтеграція.

### React

```jsx
import { useEffect, useRef } from 'react';
import Vantable from 'vantable';

export function UsersTable({ rows, onSave }) {
  const host = useRef(null);
  const table = useRef(null);

  // Створюємо один раз: React володіє <div>, vantable — усім усередині нього.
  useEffect(() => {
    table.current = new Vantable(host.current, {
      columns: [
        { key: 'id', label: 'ID', type: 'number', width: '70px' },
        { key: 'name', label: 'Назва', editable: true, filter: true },
        { label: 'Дії', type: 'actions', edit: { enabled: true }, remove: { enabled: true } }
      ],
      data: rows,
      search: 'live',
      editable: true,
      selection: true
    });
    const t = table.current;
    t.on('save', ({ id, changes }) => onSave(id, changes));
    return () => t.destroy();          // у StrictMode монтування подвійне — це робить його безпечним
  }, []);                               // порожній список залежностей навмисно — див. наступний ефект

  // Передаємо дані; ніколи не перестворюємо таблицю заради зміни даних.
  useEffect(() => { table.current?.setData(rows); }, [rows]);

  return <div ref={host} />;
}
```

Хук, якщо таблиць кілька:

```js
import { useEffect, useRef } from 'react';
import Vantable from 'vantable';

/** Створити vantable усередині `ref`, тримати дані в актуальному стані, знищити при розмонтуванні. */
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

Колбеки, передані в опціях, захоплюються один раз, тому значення, що змінюються,
читайте через ref (або перепідписуйтесь через `table.current.on(...)`), а не
перестворюйте таблицю. `onRowClick` і дії рядка виконуються поза системою подій
React — оновлення стану, як завжди, загортайте у свій сеттер.

### Vue 3

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import Vantable from 'vantable';

const props = defineProps({ rows: { type: Array, default: () => [] } });
const emit = defineEmits(['save']);
const host = ref(null);
const table = shallowRef(null);          // shallowRef: не робимо таблицю реактивною

onMounted(() => {
  table.value = new Vantable(host.value, {
    columns: [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'name', label: 'Назва', editable: true }
    ],
    data: props.rows,
    editable: true,
    search: 'live'
  });
  table.value.on('save', (payload) => emit('save', payload));
});

// Передаємо звичайну копію: vantable змінює рядок під час збереження на місці,
// а проксі Vue перетворював би кожен запис у комірку на реактивне оновлення.
watch(() => props.rows, (rows) => table.value?.setData(rows.map((r) => ({ ...r }))), { deep: false });

onBeforeUnmount(() => table.value?.destroy());
</script>

<template><div ref="host"></div></template>
```

### Angular (standalone-компонент)

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
    // Поза зоною Angular: таблиця перемальовує себе сама, тож ганяти перевірку
    // змін на кожне натискання в її полі пошуку не потрібно.
    this.zone.runOutsideAngular(() => {
      this.table = new Vantable<User>(this.host.nativeElement, {
        columns: [
          { key: 'id', label: 'ID', type: 'number' },
          { key: 'name', label: 'Назва', filter: true }
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

  private onSave(payload: unknown): void { /* вже всередині зони */ }
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
        { key: 'name', label: 'Назва' }
      ],
      data: rows,
      search: 'live'
    });
    return () => table.destroy();        // те, що повертає onMount, виконається при знищенні
  });

  $: table?.setData(rows);               // реактивний вираз тримає дані в актуальному стані
</script>

<div bind:this={host}></div>
```

Як Svelte-action, якщо так зручніше:

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

### Правила, спільні для всіх чотирьох

| Робіть так | Чому |
|---|---|
| Створюйте таблицю **після** того, як елемент опинився в DOM | інакше конструктор кине `[Vantable] target element not found` |
| Оновлюйте через `setData(rows)` / `refresh()` | перестворення губить позицію прокручування, вибір, фільтри й розкладку колонок |
| Викликайте `destroy()` при розмонтуванні | він знімає слухачів документа й вікна, які таблиця зареєструвала |
| Віддавайте фреймворку **порожній** `<div>` | vantable володіє `innerHTML` цього елемента; не рендерте в нього дітей |
| Передавайте звичайні об'єкти як рядки | редагування на місці пише назад у рядок, а проксі фреймворку перетворює це на реактивний запис |
| Тримайте таблицю поза реактивним графом | `shallowRef` у Vue, `ref` у React, звичайна змінна у Svelte, `runOutsideAngular` в Angular |
| При серверному рендерингу створюйте її лише у браузерному хуку | конструктору потрібен справжній `document` (імпорт модуля — ні) |

Для сторінки із серверним рендерингом (Next.js, Nuxt, SvelteKit) імпортуйте бібліотеку
всередині хука монтування або з `ssr: false` / динамічним імпортом — сам модуль
імпортувати на сервері безпечно, але створення таблиці є операцією над DOM.

## Клавіатура й доступність

Таблиця реалізує патерн **grid** із WAI-ARIA (`role="grid"` / `row` / `columnheader` /
`gridcell`, `aria-sort`, `aria-rowcount`/`colcount`) з «блукаючим» tabindex, тож нею
можна користуватися лише з клавіатури:

| Клавіша | Дія |
|---|---|
| `←` `→` `↑` `↓` | переміщення між комірками |
| `Home` / `End` | перша / остання комірка рядка |
| `Ctrl`/`Cmd` + `Home` / `End` | перша / остання комірка сітки |
| `PageDown` / `PageUp` | наступна / попередня сторінка |
| `Enter` / `Space` | дія: сортувати за шапкою, розгорнути рядок, відкрити меню дій, перейти за посиланням |
| `Enter` на комірці з кількома контролами | увійти в комірку — `Tab` між її контролами, `Esc` вийти |

Інтерактивні елементи всередині комірок виведені з загального порядку `Tab` і
досяжні через сітку. Вимкнути все — `keyboard: false`.

### Що бачать допоміжні технології

| атрибут | де і що означає |
|---|---|
| `role="grid"` + `row` / `columnheader` / `gridcell` | таблиця, її рядки й комірки |
| `aria-label` / `aria-labelledby` | назва таблиці — опції `label` / `labelledby`, інакше лейбл `grid` |
| `aria-rowcount` / `aria-colcount` | **увесь** набір даних і кількість відрендерених колонок |
| `aria-rowindex` | 1 на рядку шапки, далі абсолютна позиція рядка (переживає пагінацію й віртуалізацію) |
| `aria-colindex` | позиція комірки серед відрендерених колонок (приховані не рахуються) |
| `aria-sort` | `ascending` / `descending` / `none` на кожній сортованій шапці |
| `aria-multiselectable` | на сітці, поки ввімкнено множинний вибір рядків |
| `aria-selected` | на кожному рядку, поки ввімкнено вибір |
| `aria-busy` + `role="status"` | таблиця під час завантаження і сама накладка |
| `role="alert"` | рядок помилки |
| `aria-expanded` + `aria-controls` | розгортач акордеона і рядок деталей, який він відкриває |
| `aria-hidden` | рядки скелетона й розпірки віртуалізації |
| `role="toolbar"` + `aria-label` | панель масових дій (лейбл `bulkActions`) |
| `role="group"` + `aria-label` | меню колонок (лейбл `columns`) |
| `aria-label` | поле пошуку, обидва чекбокси, розгортач — усе з `labels` |

Усі ці назви беруться з `labels`, тож локалізована таблиця лишається доступною
власною мовою.

## Переклад

Увесь текст інтерфейсу живе в `labels`; передайте будь-яку підмножину ключів:

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

Повний перелік ключів — в інтерфейсі `VantableLabels` у типах. `{n}` у лейблі
`selected` замінюється кількістю вибраних рядків.

## Оформлення

Стилі працюють одразу **і** повністю налаштовуються. Підключати нічого не треба —
типовий аркуш стилів додається в `<head>` один раз, під час створення першої таблиці.

Чотири способи керувати виглядом, від найпростішого до найбільш індивідуального:

1. **Нічого не робити** — вбудовані стилі (світла/темна тема автоматично, за
   `prefers-color-scheme`).

2. **Налаштувати токени теми** — перевизначити CSS-змінні для конкретного екземпляра:

   ```js
   new Vantable('#host', {
     columns, data,
     theme: { accent: '#7c3aed', danger: '#ef4444', radius: '4px', bg: '#fff', border: '#eee' }
   });
   ```
   Ключі перетворюються на `--vt-*` (наприклад, `accentFg` → `--vt-accent-fg`).

3. **Примусова колірна схема** — `mode: 'dark'` або `mode: 'light'` (ставить
   `data-vt-theme`).

4. **Власний CSS.** Опція `styles` вирішує, який аркуш стилів додати:

   ```js
   // наш (типово)
   new Vantable('#host', { columns, data });
   new Vantable('#host', { columns, data, styles: true });

   // жодного — увесь CSS ви підключаєте самі, як вам зручно
   new Vantable('#host', { columns, data, styles: false });

   // ваш *замість* нашого, текстом
   new Vantable('#host', { columns, data, styles: myCss });
   new Vantable('#host', { columns, data, styles: { css: myCss } });

   // ваш файлом, який сторінка має завантажити
   new Vantable('#host', { columns, data, styles: { href: '/css/my-table.css' } });

   // спершу наш, зверху ваш (щоб перевизначати лише потрібне)
   new Vantable('#host', { columns, data, styles: { css: myCss, extend: true } });
   ```
   ```css
   /* ваш аркуш стилів — назви класів .vt-* є контрактом */
   .vt-table { ... } .vt-th { ... } .vt-badge { ... } .vt-btn.vt-danger { ... }
   ```

   Той самий текст CSS додається на сторінку лише один раз, скільки б таблиць
   його не використовували, а дві таблиці можуть мати різні аркуші стилів
   одночасно. `extend: true` ставить вбудований аркуш **перед** вашим, тож ваші
   правила перемагають без `!important`. Якщо хочете правити типові стилі, а не
   замінювати їх, починайте з `Vantable.css`.

Типовий CSS можна також узяти рядком (`Vantable.css`) або додати аркуш вручну —
`Vantable.injectStyles()` для типового, `Vantable.injectStyles(myCss)` для свого
(обидва ідемпотентні); той самий аркуш постачається окремим файлом для
`<link>` чи імпорту збирачем: `vantable/src/vantable.css` (`import 'vantable/css'`).

Назви класів (`.vt-root`, `.vt-table`, `.vt-th`, `.vt-td`, `.vt-tr`, `.vt-btn`,
`.vt-badge`, `.vt-link`, `.vt-actions`, `.vt-modal`, …) є частиною публічного API й не
змінюються в межах мажорної версії.

### Вікно підтвердження

Вікно, яке відкриває дія `remove`, є дитиною `<body>` і лежить поза `.vt-root`,
тому успадковує сторінку, а не таблицю. Під час відкриття вигляд, до якого
таблиця зводиться саме тоді — токени теми, гарнітура, розмір шрифта й висота
рядка — копіюється інлайном на `.vt-modal-overlay`, тож вікно відповідає тій
таблиці, що його відкрила: ваш власний CSS на `.vt-root`, перевизначення `theme`
і темний режим уже враховані в цих значеннях. Дві таблиці з різними темами на
одній сторінці відкривають вікна, кожне з яких відповідає своїй таблиці, а якщо
сторінка й таблиця розходяться — вікно йде за таблицею.

Вигляд вікна змінюється для кожної таблиці окремо — через той самий конфіг, з
якого береться сама дія: `actions.remove.confirm` або `remove.confirm` на
колонці `actions`, якщо опції `actions` у таблиці немає (коли задано обидва,
перемагає опція `actions`, а `remove` колонки не читається взагалі). Ваші класи
**додаються** до вбудованих, тому `.vt-modal*` і далі працює й нічого не
потрібно замінювати:

```js
new Vantable('#host', {
  columns, data,
  actions: {
    remove: {
      url: (row) => `/api/users/${row.id}`,
      confirm: {
        title: 'Видалити запис',               // заголовок над текстом; типово його немає
        overlayClassName: 'my-veil',           // додається до .vt-modal-overlay
        className: 'my-modal',                 // додається до .vt-modal
        bodyClassName: 'my-body',              // додається до .vt-modal-body
        footClassName: 'my-foot',              // додається до .vt-modal-foot
        cancelClassName: 'my-btn',             // додається до кнопки «Скасувати»
        confirmClassName: 'my-btn my-btn-red'  // додається до «Видалити», що лишає .vt-danger
      }
    }
  }
});
```

Заголовок малюється як `.vt-modal-head`. Заголовок і текст екрануються як
звичайний текст, а назва класу проходить те саме екранування атрибутів, що й
решта розмітки. Одне застереження щодо каскаду: вбудований аркуш додається до
`<head>` під час створення першої таблиці, тобто стає **після** вашого `<style>`,
який уже є на сторінці. За однакової специфічності перемагає він — `.vt-btn
{ font: inherit }` переб'є простий `.my-btn { font-weight: 700 }`. Пишіть
подвійний селектор (`.vt-btn.my-btn`, `.vt-modal.my-modal`) або підключайте свій
CSS через `styles: { css, extend: true }`, який ставить його після нашого. Щоб змінити вигляд усіх вікон на сторінці, а не однієї таблиці,
напишіть власні правила для `.vt-modal-overlay`, `.vt-modal`, `.vt-modal-head`,
`.vt-modal-body` і `.vt-modal-foot`. Токени там перевизначати немає сенсу — вони
приходять інлайном від таблиці й перемагають аркуш стилів, — тому змінюйте їх на
`.vt-root`.

## TypeScript

Пакет містить визначення типів (`vantable.d.ts`) — жодних `@types/...` не потрібно.
Типізовано все, включно з узагальненим типом рядка:

```ts
import Vantable, { VantableOptions, VantableColumnDef } from 'vantable';

interface User { id: number; name: string; email: string; status: number; }

const columns: VantableColumnDef<User>[] = [
  { key: 'id', label: 'ID', type: 'number' },
  'name',                     // скорочення рядком
  ['email', 'Email'],         // кортеж [ключ, назва]
  { label: 'Дії', type: 'actions', remove: { url: u => `/api/users/${u.id}` } }
];

const table = new Vantable<User>('#host', { columns, data, search: 'live' });
```

Експортовані типи: `VantableOptions`, `VantableColumn` / `VantableColumnDef`,
`VantableActions`, `VantableServerRequest`, `VantableServerResponse`, `VantableMode`,
`VantableLabels`, `VantableSelection`, `VantableStates`, `VantableVirtual`,
`VantableResponsive`, `VantableColumnFilter` та інші.

## Розробка

```bash
npm install            # лише dev-залежності (jsdom + typescript); сам пакет їх не має
npm run lint           # node --check по вихідному коду
npm run typecheck      # tsc --strict по vantable.d.ts + examples/type-usage.ts
npm run build          # копія src/vantable.js -> dist/vantable.umd.js (тримати синхронно!)
npm run build:go       # зібрати бінарник експорту (потрібен наскрізному тесту)
npm run test:go        # Go-тести генераторів XLSX/PDF
npm test               # уся JS-сюїта (node:test + jsdom)
npm run check          # усе перелічене, по порядку
npm run test:coverage  # JS-сюїта зі звітом про покриття
```

`examples/index.html` — дев'ять живих демонстрацій (усі типи колонок, акордеон,
експорт, операції з колонками, віртуалізація 50 000 рядків, асинхронні стани, вибір
рядків, фільтри, адаптивний режим). jsdom — не браузер, тому реальне розміщення,
друк і діалог збереження файлу перевіряються лише там.

## Ліцензія

MIT
