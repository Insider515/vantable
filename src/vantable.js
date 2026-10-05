/*!
 * Vantable — zero-dependency vanilla-JS data table for dashboards.
 * No jQuery, no Bootstrap, no XLSX. Multiple independent instances per page.
 *
 * Combines the features that were previously split across several dashboard
 * table components:
 *   - client-side  search / sort / pagination           (the base component)
 *   - server-side  search / sort / pagination            (the "paginated" one)
 *   - rich column types: link, external, copy, status,
 *     select/tag, image, textarea, custom html/render     (the base component)
 *   - row actions: edit / remove / custom                 (the base component)
 *   - inline row editing with save callback               (the "editable" one)
 *   - accordion master/detail expandable rows             (the "accordion" one)
 *   - CSV export + print (dep-free) + XLSX/PDF via adapters (all of them)
 *
 * Usage (see README.md and examples/index.html):
 *   const t = new Vantable('#host', { columns, data, ... });
 *
 * License: MIT
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    global.Vantable = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UID = 0;

  /* ------------------------------------------------------------------ *
   * Small helpers (kept internal so the package stays dependency-free) *
   * ------------------------------------------------------------------ */

  /** Is this a callable? (Options accept functions in many places.) */
  function isFn(v) { return typeof v === 'function'; }

  /** Is this a non-null object? (Used to tell `{...}` options from booleans.) */
  function isObj(v) { return v && typeof v === 'object'; }

  /** HTML-escape a value for safe insertion as text. */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Escape a value for use inside an HTML attribute. */
  function escAttr(v) { return esc(v); }

  /** Read a possibly nested key like "a.b.c" from an object. */
  function getPath(row, key) {
    if (key == null) return undefined;
    if (key.indexOf('.') === -1) return row[key];
    return key.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, row);
  }

  /** Resolve a value that may be a function of the row. */
  function resolve(v, row) { return isFn(v) ? v(row) : v; }

  /** A content-less row standing in for the rows outside the virtual window,
   *  so the scrollbar keeps the height of the whole dataset. */
  function spacerRow(px, colspan) {
    if (!px) return '';
    return '<tr class="vt-spacer" aria-hidden="true" style="height:' + px + 'px">' +
      '<td colspan="' + colspan + '"></td></tr>';
  }

  /**
   * Build the <option> list of a select. Options may be plain values or
   * `{value, label}`; `current` is the already-stringified selected value, so
   * every caller keeps its own idea of what "no value" means.
   */
  function optionsHtml(opts, current) {
    return (opts || []).map(function (o) {
      var val = o.value != null ? o.value : o;
      var lab = o.label != null ? o.label : val;
      return '<option value="' + escAttr(val) + '"' + (String(val) === current ? ' selected' : '') + '>' +
        esc(lab) + '</option>';
    }).join('');
  }

  /** The raw value a column reads from a row (a keyless column has none). */
  function cellValue(row, c) {
    return c.key ? getPath(row, c.key) : '';
  }

  /**
   * The controls of a cell that a user can actually reach: hidden and disabled
   * inputs are skipped, so a cell holding a form with a hidden CSRF token still
   * counts as a single-control cell.
   */
  function cellControls(cell) {
    var all = cell.querySelectorAll('a,button,select,input,textarea'), out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].type === 'hidden' || all[i].disabled) continue;
      out.push(all[i]);
    }
    return out;
  }

  /** The sticky class for a pinned column ('' when it is not pinned). */
  function pinClass(c) {
    return c.pin === 'left' ? ' vt-pin-left' : c.pin === 'right' ? ' vt-pin-right' : '';
  }

  /** Normalise a column width (a number of px, or any CSS length) to CSS. */
  function cssWidth(w) {
    if (w == null || w === '') return '';
    return typeof w === 'number' ? w + 'px' : String(w);
  }

  /**
   * Resolve a feature (search / sort) into a mode: 'client' | 'server' | 'off'.
   *   false / 'off' / 'none'            -> off
   *   'server' / 'db' / 'remote' / true* -> server   (* true only if a server source exists)
   *   'client' / 'live' / 'local'       -> client (live, over loaded rows)
   *   undefined                         -> default: server when a server source
   *                                        exists, otherwise client (live)
   */
  function resolveMode(opt, hasServer) {
    if (opt === false || opt === 'off' || opt === 'none') return 'off';
    if (opt === 'server' || opt === 'db' || opt === 'remote') return 'server';
    if (opt === 'client' || opt === 'live' || opt === 'local') return 'client';
    if (opt === true) return hasServer ? 'server' : 'client';
    return hasServer ? 'server' : 'client';
  }

  /** Delay a call until `ms` of quiet: used by the search box and the filters. */
  function debounce(fn, ms) {
    var t; return function () {
      var ctx = this, args = arguments;
      clearTimeout(t); t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /** Trigger a browser download of a text blob. */
  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  /** Convert an array-of-arrays to a CSV string (RFC-4180-ish). */
  function toCsv(rows) {
    return rows.map(function (r) {
      return r.map(function (cell) {
        var s = cell == null ? '' : String(cell);
        if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\r\n');
  }

  /* ------------------------------------------------------------------ *
   * Default styles — injected ONCE into <head> so the table is styled  *
   * out of the box with no manual CSS include. Customise by:           *
   *   - passing { theme: { accent:'#f00', radius:'4px', ... } }         *
   *   - overriding .vt-* classes / CSS variables in your own stylesheet *
   *   - or opting out entirely with { styles: false } and shipping your *
   *     own CSS (the .vt-* class names are stable and documented).      *
   * ------------------------------------------------------------------ */

  var STYLE_ID = 'vantable-default-styles';

  var DEFAULT_CSS = `.vt-root{--vt-fg:#1f2430;--vt-muted:#64748b;--vt-bg:#fff;--vt-alt:#f7f8fb;--vt-border:#e5e8ef;--vt-accent:#0d4a94;--vt-accent-fg:#fff;--vt-danger:#e35d4b;--vt-radius:8px;--vt-gap:8px;--vt-veil:rgba(255,255,255,.65);--vt-sel:#eaf2fd;color:var(--vt-fg);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;gap:var(--vt-gap)}
@media (prefers-color-scheme:dark){.vt-root:not([data-vt-theme="light"]){--vt-fg:#e6e9f0;--vt-muted:#98a2b3;--vt-bg:#161b26;--vt-alt:#1d2430;--vt-border:#2a3242;--vt-accent:#4f8bd6;--vt-danger:#e77364;--vt-veil:rgba(16,20,28,.65);--vt-sel:#1b2b42}}
.vt-root[data-vt-theme="dark"]{--vt-fg:#e6e9f0;--vt-muted:#98a2b3;--vt-bg:#161b26;--vt-alt:#1d2430;--vt-border:#2a3242;--vt-accent:#4f8bd6;--vt-danger:#e77364;--vt-veil:rgba(16,20,28,.65);--vt-sel:#1b2b42}
.vt-toolbar,.vt-footer{display:flex;align-items:center;justify-content:space-between;gap:var(--vt-gap);flex-wrap:wrap}
.vt-toolbar-left,.vt-toolbar-right,.vt-pg-left,.vt-pg-right{display:flex;align-items:center;gap:var(--vt-gap)}
.vt-search{padding:7px 10px;border:1px solid var(--vt-border);border-radius:var(--vt-radius);background:var(--vt-bg);color:var(--vt-fg);min-width:200px;outline:none}
.vt-search:focus{border-color:var(--vt-accent)}
.vt-btn{padding:6px 12px;border:1px solid var(--vt-border);border-radius:var(--vt-radius);background:var(--vt-bg);color:var(--vt-fg);cursor:pointer;font:inherit;line-height:1.2;transition:background .12s,border-color .12s}
.vt-btn:hover{background:var(--vt-alt)}.vt-btn:disabled{opacity:.5;cursor:default}
.vt-btn.vt-mini{padding:3px 8px;font-size:12px}
.vt-btn.vt-primary{background:var(--vt-accent);color:var(--vt-accent-fg);border-color:var(--vt-accent)}
.vt-btn.vt-danger{color:var(--vt-danger);border-color:var(--vt-danger)}.vt-btn.vt-danger:hover{background:var(--vt-danger);color:#fff}
.vt-scroll{overflow-x:auto;border:1px solid var(--vt-border);border-radius:var(--vt-radius)}
.vt-table{width:100%;border-collapse:collapse;background:var(--vt-bg)}
.vt-th,.vt-td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--vt-border);vertical-align:middle}
.vt-th{background:var(--vt-alt);color:var(--vt-muted);font-weight:600;white-space:nowrap;user-select:none}
.vt-tr:hover>.vt-td{background:var(--vt-alt)}
.vt-align-center{text-align:center}.vt-align-right{text-align:right}
.vt-empty td{text-align:center;color:var(--vt-muted);padding:24px}
.vt-table:focus{outline:none}
.vt-th:focus,.vt-td:focus,.vt-th:focus-visible,.vt-td:focus-visible{outline:2px solid var(--vt-accent);outline-offset:-2px}
.vt-sortable{cursor:pointer}
.vt-sort-ind{display:inline-block;width:0;height:0;margin-left:6px;vertical-align:middle;opacity:.35;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:5px solid currentColor}
.vt-sort-asc .vt-sort-ind{opacity:1}.vt-sort-desc .vt-sort-ind{opacity:1;transform:rotate(180deg)}
.vt-link{color:var(--vt-accent);text-decoration:none}.vt-link:hover{text-decoration:underline}
.vt-badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;background:var(--vt-badge,var(--vt-muted))}
.vt-copy-wrap{display:inline-flex;align-items:center;gap:6px}
.vt-copy{border:0;background:transparent;cursor:pointer;font-size:14px;padding:0;opacity:.6}.vt-copy:hover,.vt-copy.vt-copied{opacity:1}
.vt-cell-select,.vt-input{padding:5px 8px;border:1px solid var(--vt-border);border-radius:6px;background:var(--vt-bg);color:var(--vt-fg);font:inherit;max-width:220px}
.vt-input{width:100%}.vt-editing{background:var(--vt-alt)}
.vt-img{max-height:36px;max-width:64px;border-radius:4px;object-fit:cover;display:block}
.vt-actions{display:inline-flex;gap:6px;flex-wrap:wrap}
.vt-td-expander,.vt-th-expander{width:34px;text-align:center}
.vt-expander{border:0;background:transparent;cursor:pointer;color:var(--vt-muted);font-size:12px;padding:2px 4px}.vt-expander.vt-open{color:var(--vt-accent)}
.vt-detail>td{background:var(--vt-alt);padding:0}.vt-detail-box{padding:12px 16px}
.vt-detail-grid{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}
.vt-detail-grid dt{color:var(--vt-muted);font-weight:600}.vt-detail-grid dd{margin:0}
.vt-perpage{color:var(--vt-muted);display:inline-flex;align-items:center;gap:6px}
.vt-perpage-sel{padding:4px 6px;border:1px solid var(--vt-border);border-radius:6px;background:var(--vt-bg);color:var(--vt-fg)}
.vt-count{color:var(--vt-muted)}.vt-count::before{content:"•";margin:0 8px}
.vt-pageinfo{color:var(--vt-muted)}
.vt-modal-overlay{position:fixed;inset:0;background:rgba(15,20,30,.5);display:flex;align-items:center;justify-content:center;z-index:9999}
.vt-modal{background:var(--vt-bg,#fff);color:var(--vt-fg,#1f2430);border-radius:12px;min-width:300px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden}
.vt-modal-head{padding:18px 20px 0;font-size:16px;font-weight:600}
.vt-modal-body{padding:20px;font-size:15px}.vt-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:0 20px 18px}
.vt-table-fixed{table-layout:fixed}
.vt-th{position:relative}
.vt-resizer{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;user-select:none;touch-action:none}
.vt-resizer:hover{background:var(--vt-accent);opacity:.35}
.vt-root.vt-resizing{cursor:col-resize}
.vt-th[data-move] .vt-th-label{cursor:grab}
.vt-th-dragging{opacity:.5}
.vt-drop-target{box-shadow:inset 2px 0 0 var(--vt-accent)}
.vt-pin-left,.vt-pin-right{position:sticky;z-index:2;background:var(--vt-bg)}
.vt-pin-left{box-shadow:1px 0 0 var(--vt-border)}.vt-pin-right{box-shadow:-1px 0 0 var(--vt-border)}
.vt-tr:hover>.vt-pin-left,.vt-tr:hover>.vt-pin-right{background:var(--vt-alt)}
.vt-th.vt-pin-left,.vt-th.vt-pin-right{z-index:4;background:var(--vt-alt)}
.vt-sticky-head .vt-th{position:sticky;top:var(--vt-sticky-top,0);z-index:3}
.vt-sticky-head .vt-th.vt-pin-left,.vt-sticky-head .vt-th.vt-pin-right{z-index:5}
.vt-cols{position:relative}
.vt-cols-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:20;min-width:170px;padding:6px;display:flex;flex-direction:column;gap:2px;background:var(--vt-bg);color:var(--vt-fg);border:1px solid var(--vt-border);border-radius:var(--vt-radius);box-shadow:0 10px 30px rgba(0,0,0,.18)}
.vt-cols-menu[hidden]{display:none}
.vt-col-opt{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;white-space:nowrap}
.vt-col-opt:hover{background:var(--vt-alt)}
.vt-spacer>td{padding:0;border:0}
.vt-scroll{position:relative}
.vt-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;gap:10px;background:var(--vt-veil)}
.vt-overlay[hidden]{display:none}.vt-overlay-text{color:var(--vt-muted)}
.vt-spinner{width:18px;height:18px;border:2px solid var(--vt-border);border-top-color:var(--vt-accent);border-radius:50%;animation:vt-spin .7s linear infinite}
@keyframes vt-spin{to{transform:rotate(360deg)}}
.vt-loading .vt-table{opacity:.55}
.vt-skel-row>td{border-bottom:1px solid var(--vt-border)}
.vt-skel{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,var(--vt-border),var(--vt-alt),var(--vt-border));background-size:200% 100%;animation:vt-shimmer 1.2s ease-in-out infinite}
@keyframes vt-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.vt-error>td{padding:20px;text-align:center}
.vt-error-box{display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}
.vt-error-msg{color:var(--vt-danger);font-weight:600}.vt-error-detail{color:var(--vt-muted)}
@media (prefers-reduced-motion:reduce){.vt-spinner,.vt-skel{animation:none}}
.vt-th-select,.vt-td-select{width:36px;text-align:center}
.vt-select-all,.vt-select-row{width:15px;height:15px;margin:0;cursor:pointer;accent-color:var(--vt-accent)}
.vt-select-row:disabled{cursor:default;opacity:.4}
.vt-tr.vt-selected>.vt-td{background:var(--vt-sel)}
.vt-tr.vt-selected>.vt-pin-left,.vt-tr.vt-selected>.vt-pin-right{background:var(--vt-sel)}
.vt-bulk{display:flex;align-items:center;gap:var(--vt-gap);flex-wrap:wrap;padding:8px 12px;border:1px solid var(--vt-accent);border-radius:var(--vt-radius);background:var(--vt-sel)}
.vt-bulk[hidden]{display:none}.vt-bulk-count{font-weight:600}
.vt-filter-row>.vt-th{padding:6px 8px;background:var(--vt-bg)}
.vt-filter{width:100%;box-sizing:border-box;min-width:0;padding:4px 7px;font:inherit;border:1px solid var(--vt-border);border-radius:6px;background:var(--vt-bg);color:var(--vt-fg)}
.vt-filter:focus{border-color:var(--vt-accent);outline:none}
.vt-filter-num{display:flex;gap:4px}
.vt-stacked .vt-scroll{overflow-x:visible;border:0}
.vt-stacked .vt-table,.vt-stacked thead,.vt-stacked tbody{display:block}
.vt-stacked thead tr:not(.vt-filter-row){display:none}
.vt-stacked .vt-filter-row{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:var(--vt-gap)}
.vt-stacked .vt-filter-cell{display:block;flex:1 1 160px;padding:0;border:0}
.vt-stacked .vt-filter-cell:empty{display:none}
.vt-stacked .vt-tr{display:block;margin-bottom:var(--vt-gap);padding:4px 0;border:1px solid var(--vt-border);border-radius:var(--vt-radius);background:var(--vt-bg)}
.vt-stacked .vt-tr:last-child{margin-bottom:0}
.vt-stacked .vt-td{display:flex;align-items:center;justify-content:space-between;gap:var(--vt-gap);border-bottom:0;padding:6px 12px;text-align:left}
.vt-stacked .vt-td[data-label]::before{content:attr(data-label);color:var(--vt-muted);font-weight:600;flex:0 0 auto}
.vt-stacked .vt-td-select,.vt-stacked .vt-td-expander{width:auto;justify-content:flex-start}
.vt-stacked .vt-pin-left,.vt-stacked .vt-pin-right{position:static;left:auto;right:auto;box-shadow:none;background:transparent}
.vt-stacked .vt-detail>td,.vt-stacked .vt-empty td,.vt-stacked .vt-error>td,.vt-stacked .vt-skel-row{display:block}
.vt-stacked .vt-spacer{display:none}
.vt-actions-menu{position:relative}.vt-act-trigger{line-height:1.1}
.vt-act-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:25;min-width:150px;padding:4px;display:flex;flex-direction:column;gap:1px;text-align:left;background:var(--vt-bg);color:var(--vt-fg);border:1px solid var(--vt-border);border-radius:var(--vt-radius);box-shadow:0 10px 30px rgba(0,0,0,.18)}
.vt-act-menu[hidden]{display:none}.vt-act-menu-up{top:auto;bottom:calc(100% + 4px)}
.vt-act-item{appearance:none;border:0;background:transparent;color:inherit;font:inherit;text-align:left;white-space:nowrap;padding:6px 10px;border-radius:6px;cursor:pointer}
.vt-act-item:hover,.vt-act-item:focus{background:var(--vt-alt);outline:none}
.vt-act-item.vt-danger{color:var(--vt-danger)}
.vt-stacked .vt-act-menu{right:auto;left:0}`;

  var STYLE_SEQ = 0;
  var STYLE_IDS = {};       // CSS text -> the element id it was injected under

  /** The element id a block of CSS is injected under, so it is never doubled. */
  function styleId(css) {
    if (css === DEFAULT_CSS) return STYLE_ID;
    if (!STYLE_IDS[css]) STYLE_IDS[css] = 'vantable-styles-' + (++STYLE_SEQ);
    return STYLE_IDS[css];
  }

  /**
   * Put a stylesheet into <head> once per document (a no-op without one).
   * With no argument it injects the built-in stylesheet; pass your own CSS to
   * inject that instead — the same text is never injected twice.
   */
  function injectStyles(css) {
    if (typeof document === 'undefined') return;
    css = css || DEFAULT_CSS;
    var id = styleId(css);
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /** Link an external stylesheet once per document. */
  function linkStyles(href) {
    if (typeof document === 'undefined' || !href) return;
    var sel = 'link[data-vantable-style="' + cssEsc(href) + '"]';
    if (document.querySelector(sel)) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.setAttribute('data-vantable-style', href);
    (document.head || document.documentElement).appendChild(l);
  }

  /**
   * Apply the `styles` option:
   *   undefined / true          the built-in stylesheet (the default)
   *   false                     nothing is injected — you ship all the CSS
   *   '<css text>'              your CSS *instead of* the built-in one
   *   { css, href, extend }     your CSS and/or a stylesheet link; `extend:true`
   *                             keeps the built-in one underneath yours
   */
  function applyStyles(opt) {
    if (opt === false) return;
    if (opt === undefined || opt === true) { injectStyles(); return; }
    var cfg = isObj(opt) ? opt : { css: String(opt) };
    if (cfg.extend) injectStyles();
    if (cfg.css) injectStyles(cfg.css);
    if (cfg.href) linkStyles(cfg.href);
  }

  /** Join a built-in class name with the host's own one, if one was given. */
  function joinClass(base, extra) {
    return extra ? base + ' ' + extra : base;
  }

  // The theme tokens, read off the built-in stylesheet so this list cannot
  // drift from it. Only declared tokens are collected: `--vt-badge` and
  // `--vt-sticky-top` are read by the sheet but set by the caller, never here.
  var TOKENS = (function () {
    var out = [], seen = {}, re = /(--vt-[a-z-]+)\s*:/g, m;
    while ((m = re.exec(DEFAULT_CSS))) {
      if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); }
    }
    return out;
  })();

  /**
   * Copy the look a table currently resolves to onto a node outside it. The
   * dialog hangs off <body>, so it inherits the page, not the table; copying
   * the tokens and the typography makes it match the table that opened it,
   * with the host's own CSS, the `theme` overrides and dark mode already baked
   * into the computed values. Where the document has no window to compute
   * with, nothing is copied and the stylesheet's own fallbacks stand in.
   */
  function copyTheme(from, to) {
    var view = from.ownerDocument && from.ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') return;
    var cs = view.getComputedStyle(from);
    TOKENS.concat(['font-family', 'font-size', 'line-height']).forEach(function (prop) {
      var v = cs.getPropertyValue(prop);
      if (v) to.style.setProperty(prop, v.trim());
    });
  }

  /* ------------------------------------------------------------------ *
   * Defaults                                                            *
   * ------------------------------------------------------------------ */

  var DEFAULT_LABELS = {
    search: 'Search…',
    perPage: 'Rows',
    prev: 'Prev',
    next: 'Next',
    empty: 'No records',
    edit: 'Edit',
    remove: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    confirmRemove: 'Delete this record?',
    exportCsv: 'CSV',
    exportXlsx: 'Excel',
    exportPdf: 'PDF',
    print: 'Print',
    actions: 'Actions',
    page: 'Page',
    of: 'of',
    copy: 'Copy',
    copied: 'Copied',
    columns: 'Columns',
    loading: 'Loading…',
    error: 'Could not load the data',
    retry: 'Retry',
    selected: '{n} selected',
    clearSelection: 'Clear',
    selectAll: 'Select all',
    selectRow: 'Select row',
    filterAll: 'All',
    filterMin: 'Min',
    filterMax: 'Max',
    bulkActions: 'Bulk actions',
    expandRow: 'Expand row',
    grid: 'Data table'
  };

  /* ------------------------------------------------------------------ *
   * Vantable                                                            *
   * ------------------------------------------------------------------ */

  /** The table itself: builds the markup into `target` and renders `options`. */
  function Vantable(target, options) {
    if (!(this instanceof Vantable)) return new Vantable(target, options);
    this.el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.el) throw new Error('[Vantable] target element not found');

    options = options || {};
    this.uid = 'vt' + (++UID);

    // Styles work out of the box: the default stylesheet is injected once into
    // <head>. Opt out with { styles:false } and ship your own CSS (the .vt-*
    // class names are stable/documented). Tweak look with { theme:{...} } (CSS
    // variable overrides applied inline) and { mode:'dark'|'light' }.
    applyStyles(options.styles);
    if (options.mode === 'dark' || options.mode === 'light') this.el.setAttribute('data-vt-theme', options.mode);
    if (isObj(options.theme)) {
      var _st = this.el.style;
      Object.keys(options.theme).forEach(function (k) {
        _st.setProperty('--vt-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), options.theme[k]);
      });
    }

    this.columns = (options.columns || []).map(normalizeColumn);
    // Every column gets a stable id so column operations can address the ones
    // that have no data key (actions, computed html).
    this.columns.forEach(function (c, i) { c.vtId = c.key || ('col' + i); });
    this.rowId = options.rowId || 'id';
    this.labels = Object.assign({}, DEFAULT_LABELS, options.labels || {});

    // Features (opt-in with sensible defaults).
    this.serverFetch = options.server && isFn(options.server.fetch) ? options.server.fetch : null;
    // Search / sort each have an INDEPENDENT mode: 'client' (live filter over the
    // loaded rows) or 'server' (real query to server.fetch, for the paginated /
    // DB case), or off. Default follows the source (server if server.fetch, else
    // client). See README "Search & sort modes".
    this.searchMode = resolveMode(options.search, this.serverFetch);
    this.sortMode = resolveMode(options.sort, this.serverFetch);
    // Per-column filters: a column opts in with `filter`, and the table-level
    // `filters` option only picks the mode ('client' / 'server', same vocabulary
    // as search and sort). filters:false switches the row off entirely.
    this.filtersOn = options.filters !== false && this.columns.some(function (c) { return !!c.filter; });
    this.filterMode = resolveMode(options.filters === true ? undefined : options.filters, this.serverFetch);
    // Fields the search looks at. Not specified -> all data columns.
    this.searchFields = (Array.isArray(options.searchFields) && options.searchFields.length)
      ? options.searchFields.slice() : null;
    this.pagination = options.pagination === false ? null : Object.assign(
      { perPage: 50, options: [50, 100, 250, 500] },
      isObj(options.pagination) ? options.pagination : {}
    );
    // Export: CSV is built in (zero-dep). XLSX / PDF work through OPTIONAL
    // adapters you supply — e.g. Vantable.serverExport('/service/export'), an
    // endpoint that pipes the data to your Go binary and streams the file back.
    // `export` may be a boolean or { formats, filename, adapters:{ csv, xlsx, pdf } }.
    var ex = options.export;
    this.exportable = ex !== false && options.exportable !== false;
    var exObj = isObj(ex) ? ex : {};
    this.exportAdapters = exObj.adapters || {};
    this.exportFormats = (exObj.formats && exObj.formats.length)
      ? exObj.formats.slice()
      : (this.exportable ? ['csv'] : []);
    this.exportName = exObj.filename || options.exportName || 'table';
    this.printable = options.printable !== false;
    this.editable = !!options.editable;                 // inline row editing
    this.onSave = options.onSave || null;
    this.accordion = options.accordion || null;         // { render(row) } or { columns:[...] }
    // Virtualization: render only the rows in view (plus overscan) and stand in
    // for the rest with two spacer rows. It assumes a uniform row height, so an
    // accordion (whose detail rows are not uniform) switches it off.
    // Responsive: below `breakpoint` px of the table's own width every row is
    // stacked into a card, with the column label in front of each value.
    this.responsive = options.responsive
      ? Object.assign({ breakpoint: 640 }, isObj(options.responsive) ? options.responsive : {})
      : null;
    // Row selection: a checkbox column, a select-all in the header and bulk
    // action buttons that appear while something is selected. Opt-in.
    //   selection: true | { mode:'multi'|'single', header, selectable(row), actions:[...] }
    var sel = options.selection;
    this.selection = sel
      ? Object.assign({ mode: 'multi', header: true, actions: [], selectable: null }, isObj(sel) ? sel : {})
      : null;
    // Async states: a loading overlay, skeleton rows for a load with nothing to
    // show yet, and an error row with a Retry button. On by default; opt out
    // with states:false, or per piece with states:{ skeleton:false } etc.
    var sopt = options.states;
    this.states = sopt === false
      ? { loading: false, skeleton: false, error: false, retry: false }
      : Object.assign({ loading: true, skeleton: 8, error: true, retry: true }, isObj(sopt) ? sopt : {});
    this._fetchSeq = 0;                                 // ignores stale replies
    var vopt = options.virtual;
    this.virtual = vopt ? Object.assign({ rowHeight: 36, overscan: 8 }, isObj(vopt) ? vopt : {}) : null;
    if (this.virtual && this.accordion) this.virtual = null;
    this._rowH = this.virtual ? this.virtual.rowHeight : 0;
    this._range = null;                                 // the window in view
    this.actionsCfg = options.actions || null;          // { edit, remove, custom:[...] }
    this.emptyText = options.emptyText || this.labels.empty;
    // Accessible name of the grid: `label` is used as aria-label, `labelledby`
    // points at an element that already names the table on the page.
    this.ariaLabel = options.label || null;
    this.ariaLabelledby = options.labelledby || null;
    this.onRowClick = options.onRowClick || null;
    this.handlers = {};                                 // event name -> [cb]

    // State.
    this.data = (options.data || []).slice();           // client-side source
    this.state = {
      page: 1,
      perPage: this.pagination ? this.pagination.perPage : (this.data.length || 1),
      q: '',
      sort: options.defaultSort || null,
      dir: options.defaultDir || 'asc',
      total: this.data.length,
      expanded: {},                                     // rowId -> bool
      editing: {},                                      // rowId -> bool (inline)
      loading: false,                                   // a fetch is in flight
      error: null,                                      // the last fetch failure
      selected: {},                                     // rowId -> bool
      filters: {},                                      // column key -> value
      stacked: false                                    // responsive card mode
    };
    // Column operations (all opt-in; nothing changes unless switched on):
    //   resize       — drag the edge of a header to set its width
    //   reorder      — drag a header onto another one to move the column
    //   columnPicker — a toolbar menu to show/hide columns
    //   stickyHeader — the header stays put while the body scrolls
    //   maxHeight    — the height of the scroll box (sticky needs one)
    // Per column: { pin:'left'|'right', hidden, width, resizable, reorderable }.
    this.resizeCols = !!options.resize;
    this.reorderCols = !!options.reorder;
    this.columnPicker = !!options.columnPicker;
    this.stickyHeader = !!options.stickyHeader;
    this.maxHeight = options.maxHeight || null;
    this.minColWidth = options.minColWidth != null ? options.minColWidth : 48;
    this.keyboard = options.keyboard !== false;       // grid keyboard navigation
    this._active = { r: 0, c: 0 };                    // roving-tabindex cell (row, col)
    this._cellMode = null;                            // cell currently in interaction mode
    this._closeModal = null;                          // closes the dialog that is up, if any
    this._pendingFocus = false;                       // focus active cell after next paint

    this._build();
    this.refresh();
  }

  /** Normalize a column definition, filling in defaults. */
  function normalizeColumn(c) {
    if (typeof c === 'string') c = { key: c, label: c };
    else if (Array.isArray(c)) c = { key: c[0], label: c[1] != null ? c[1] : c[0] };
    var col = Object.assign({}, c);
    col.type = col.type || (col.render ? 'html' : 'text');
    if (col.label == null) col.label = col.key || '';
    if (col.sortable == null) col.sortable = col.type !== 'actions';
    return col;
  }

  Vantable.prototype = {

    constructor: Vantable,

    /* ---- event bus -------------------------------------------------- */
    on: function (name, cb) {
      (this.handlers[name] = this.handlers[name] || []).push(cb);
      return this;
    },
    /** Call every handler registered for an event; a throwing handler is ignored. */
    _emit: function (name, payload) {
      (this.handlers[name] || []).forEach(function (cb) { try { cb(payload); } catch (e) { /* noop */ } });
    },

    /* ---- public API ------------------------------------------------- */

    /** Replace the client-side dataset and re-render. */
    setData: function (rows) {
      this.data = (rows || []).slice();
      this.state.total = this.data.length;
      this.state.page = 1;
      this.state.error = null;          // the data arrived, so neither state holds
      this._setLoading(false);
      this.refresh();
      return this;
    },

    /** Re-render current view (fetches from server in server mode). */
    refresh: function () {
      var self = this;
      if (this.serverFetch) {
        // Server source. Only features in 'server' mode are sent to the query;
        // features in 'client' mode are applied to the returned page in-browser.
        var req = { page: this.state.page, perPage: this.state.perPage };
        if (this.searchMode === 'server') {
          req.q = this.state.q;
          if (this.searchFields) req.fields = this.searchFields;  // let the DB know which columns
        }
        if (this.sortMode === 'server') { req.sort = this.state.sort; req.dir = this.state.dir; }
        if (this.filtersOn && this.filterMode === 'server') {
          var active = this.activeFilters();
          if (Object.keys(active).length) req.filters = active;
        }
        // A new request supersedes whatever was in flight: only the latest one
        // may write rows or clear the loading state.
        var seq = ++this._fetchSeq;
        this.state.error = null;
        this._setLoading(true);
        Promise.resolve(this.serverFetch(req)).then(function (res) {
          if (seq !== self._fetchSeq) return;
          res = res || {};
          var rows = res.rows || [];
          if (self.filtersOn && self.filterMode === 'client') rows = self._filterCols(rows);
          if (self.searchMode === 'client') rows = self._filter(rows);
          if (self.sortMode === 'client') rows = self._sort(rows);
          self._view = rows;
          self.state.total = res.total != null ? res.total : rows.length;
          self._setLoading(false);
          self._paint();
        }).catch(function (err) {
          if (seq !== self._fetchSeq) return;
          self._emit('error', err);
          self.state.error = err;
          self._view = [];
          self._setLoading(false);
          self._paint();
        });
      } else {
        // Client source: live search + client sort + client pagination in memory.
        var rows = this.data;
        if (this.filtersOn) rows = this._filterCols(rows);
        if (this.searchMode !== 'off') rows = this._filter(rows);
        if (this.sortMode !== 'off') rows = this._sort(rows);
        this._view = this._page(rows);
        this._paint();
      }
      return this;
    },

    /** Is the table currently stacked into cards? */
    isStacked: function () {
      return !!this.state.stacked;
    },

    /** Measure the table and switch the card mode on or off. A width of 0 means
     *  nothing has been laid out yet, so the normal table is kept. */
    _applyResponsive: function () {
      if (!this.responsive) return;
      var w = this.el.clientWidth || 0;
      var on = w > 0 && w < this.responsive.breakpoint;
      if (on === this.state.stacked) return;
      this.state.stacked = on;
      this.el.classList.toggle('vt-stacked', on);
      this._renderHead();
      this.refresh();                   // virtualization is off while stacked
      this._emit('responsive', { stacked: on, width: w });
    },

    /** Bring a row of the current view into view by its index. */
    scrollToRow: function (index) {
      if (!this.$scroll) return this;
      var rows = this._view || [];
      var i = Math.max(0, Math.min(index || 0, Math.max(0, rows.length - 1)));
      if (this.virtual) {
        this.$scroll.scrollTop = i * (this._rowH || this.virtual.rowHeight);
        this._onVirtualScroll();
      } else {
        var tr = this.$tbody.querySelectorAll('tr.vt-tr')[i];
        if (tr && isFn(tr.scrollIntoView)) tr.scrollIntoView({ block: 'nearest' });
      }
      return this;
    },

    /** Remove the table from the DOM and detach listeners. */
    destroy: function () {
      if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
      if (this._onResize) window.removeEventListener('resize', this._onResize);
      // The dialog hangs off <body>, so clearing the table would leave it up
      // — still able to confirm a removal on a table that no longer exists.
      if (this._closeModal) this._closeModal();
      this.el.innerHTML = '';
      this._emit('destroy');
    },

    /* ---- per-column filters ----------------------------------------- */

    /** A copy of every filter value, including the empty ones. */
    filters: function () {
      return Object.assign({}, this.state.filters);
    },

    /** Only the filters that actually narrow the data — what a server gets. */
    activeFilters: function () {
      var src = this.state.filters, out = {};
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (isObj(v)) {
          var min = v.min === '' || v.min == null ? null : v.min;
          var max = v.max === '' || v.max == null ? null : v.max;
          if (min !== null || max !== null) {
            out[k] = {};
            if (min !== null) out[k].min = min;
            if (max !== null) out[k].max = max;
          }
        } else if (v !== '' && v != null) out[k] = v;
      });
      return out;
    },

    /** The value of one column's filter. */
    getFilter: function (key) {
      return this.state.filters[key];
    },

    /** Set one column's filter: a string, or `{min, max}` for a number range.
     *  An empty value clears it. */
    setFilter: function (key, value) {
      if (value === '' || value == null) delete this.state.filters[key];
      else this.state.filters[key] = value;
      this.state.page = 1;              // a narrower set starts at the first page
      this._renderHead();
      this.refresh();
      this._emit('filterChange', { key: key, value: this.state.filters[key], filters: this.activeFilters() });
      return this;
    },

    /** Drop every filter. */
    clearFilters: function () {
      this.state.filters = {};
      this.state.page = 1;
      this._renderHead();
      this.refresh();
      this._emit('filterChange', { key: null, value: undefined, filters: {} });
      return this;
    },

    /** Read a filter control's value back into the state (without re-rendering
     *  the row, so the input keeps focus while it is being typed in). */
    _onFilterInput: function (input) {
      var key = input.getAttribute('data-filter');
      if (!key) return;
      var value;
      if (input.classList.contains('vt-filter-min') || input.classList.contains('vt-filter-max')) {
        var cur = isObj(this.state.filters[key]) ? this.state.filters[key] : {};
        value = { min: cur.min, max: cur.max };
        value[input.classList.contains('vt-filter-min') ? 'min' : 'max'] = input.value;
        if ((value.min === '' || value.min == null) && (value.max === '' || value.max == null)) value = '';
      } else {
        value = input.value;
      }
      if (value === '' || value == null) delete this.state.filters[key];
      else this.state.filters[key] = value;
      this.state.page = 1;
      this.refresh();
      this._emit('filterChange', { key: key, value: this.state.filters[key], filters: this.activeFilters() });
    },

    /** With a sticky header the filter row has to stick below the header row,
     *  which means an explicit offset of the header's own height. */
    _applyFilterSticky: function () {
      if (!this.filtersOn || !this.stickyHeader || !this.$thead) return;
      var rows = this.$thead.querySelectorAll('tr');
      if (rows.length < 2) return;
      var top = rows[0].offsetHeight || 0;
      var cells = rows[1].children;
      for (var i = 0; i < cells.length; i++) cells[i].style.top = top ? top + 'px' : '';
    },

    /* ---- row selection ---------------------------------------------- *
     * The selection is keyed by row id, so it survives sorting, searching,
     * paging and a server refresh; rows that are not on screen stay selected
     * and are still reported by selectedIds().                              */

    /** Is this row id selected? */
    isSelected: function (id) {
      return !!this.state.selected[String(id)];
    },

    /** The ids of all selected rows (as strings, the form the DOM uses). */
    selectedIds: function () {
      var sel = this.state.selected;
      return Object.keys(sel).filter(function (k) { return sel[k]; });
    },

    /** How many rows are selected. */
    selectedCount: function () {
      return this.selectedIds().length;
    },

    /** The selected rows that can be resolved right now. In server mode that is
     *  the ones on the current page; use selectedIds() for the whole selection. */
    selectedRows: function () {
      var self = this;
      return this.selectedIds().map(function (id) { return self._rowById(id); })
        .filter(function (row) { return !!row; });
    },

    /** May this row be selected? (`selection.selectable` decides.) */
    _canSelect: function (row) {
      if (!this.selection || !isFn(this.selection.selectable)) return true;
      return row ? this.selection.selectable(row) !== false : true;
    },

    /** Select or unselect a row by id; no second argument flips it. */
    selectRow: function (id, on) {
      if (!this.selection) return this;
      var key = String(id);
      var row = this._rowById(key);
      var want = on === undefined ? !this.isSelected(key) : !!on;
      if (want && !this._canSelect(row)) return this;
      if (want && this.selection.mode === 'single') this.state.selected = {};
      if (want) this.state.selected[key] = true;
      else delete this.state.selected[key];
      this._syncSelection();
      this._emitSelection();
      return this;
    },

    /** Select every selectable row of the current view — that is the current
     *  page when the table is paginated, or the whole view when it is not. */
    selectAll: function () {
      return this._setViewSelection(true);
    },

    /** Drop the whole selection, including rows that are not on screen. */
    clearSelection: function () {
      if (!this.selection) return this;
      this.state.selected = {};
      this._syncSelection();
      this._emitSelection();
      return this;
    },

    /** The rows of the current view (the current page) that may be selected. */
    _selectableViewRows: function () {
      var self = this;
      return (this._view || []).filter(function (row) { return self._canSelect(row); });
    },

    /** Select / unselect the rows of the current view (what select-all does). */
    _setViewSelection: function (on) {
      if (!this.selection) return this;
      var self = this;
      if (on && this.selection.mode === 'single') return this;   // nothing to select all of
      // Selecting only touches what may be selected; clearing touches the lot.
      var rows = on ? this._selectableViewRows() : (this._view || []);
      rows.forEach(function (row) {
        var key = String(getPath(row, self.rowId));
        if (on) self.state.selected[key] = true;
        else delete self.state.selected[key];
      });
      this._syncSelection();
      this._emitSelection();
      return this;
    },

    /** Report the selection to the host. */
    _emitSelection: function () {
      this._emit('selectionChange', {
        ids: this.selectedIds(), rows: this.selectedRows(), count: this.selectedCount()
      });
    },

    /** Reflect the selection in the rendered rows, the header checkbox and the
     *  bulk bar — without re-rendering the rows, so focus is not lost. */
    _syncSelection: function () {
      if (!this.selection || !this.$tbody) return;
      var boxes = this.$tbody.querySelectorAll('.vt-select-row');
      for (var i = 0; i < boxes.length; i++) {
        var on = this.isSelected(boxes[i].getAttribute('data-select'));
        boxes[i].checked = on;
        var tr = boxes[i].closest ? boxes[i].closest('tr.vt-tr') : null;
        if (tr) {
          tr.classList.toggle('vt-selected', on);
          tr.setAttribute('aria-selected', on ? 'true' : 'false');
        }
      }
      this._syncSelectAll();
      this._renderBulk();
    },

    /** The header checkbox: checked when every selectable row of the view is
     *  selected, indeterminate while only some are. */
    _syncSelectAll: function () {
      if (!this.selection || !this.$thead) return;
      var box = this.$thead.querySelector('.vt-select-all');
      if (!box) return;
      var self = this;
      var rows = this._selectableViewRows();
      var on = rows.filter(function (row) { return self.isSelected(getPath(row, self.rowId)); }).length;
      box.checked = rows.length > 0 && on === rows.length;
      box.indeterminate = on > 0 && on < rows.length;
    },

    /** The bulk bar: the count, the configured actions and Clear. It is only
     *  shown while something is selected. */
    _renderBulk: function () {
      if (!this.$bulk) return;
      var n = this.selection ? this.selectedCount() : 0;
      if (!n) {
        this.$bulk.innerHTML = '';
        this.$bulk.setAttribute('hidden', '');
        return;
      }
      var L = this.labels;
      this.$bulk.setAttribute('aria-label', L.bulkActions);
      var html = '<span class="vt-bulk-count">' + esc(String(L.selected).replace('{n}', n)) + '</span>';
      (this.selection.actions || []).forEach(function (a, i) {
        html += '<button type="button" class="vt-btn vt-mini ' + (a.className || '') +
          '" data-bulk="' + i + '">' + esc(a.label || '') + '</button>';
      });
      html += '<button type="button" class="vt-btn vt-mini vt-bulk-clear">' + esc(L.clearSelection) + '</button>';
      this.$bulk.innerHTML = html;
      this.$bulk.removeAttribute('hidden');
    },

    /** Run a bulk action over the current selection. */
    _runBulk: function (index) {
      var list = (this.selection && this.selection.actions) || [];
      var action = list[index];
      if (!action) return;
      var ids = this.selectedIds(), rows = this.selectedRows();
      if (isFn(action.onClick)) action.onClick(rows, ids);
      this._emit('bulkAction', { index: index, label: action.label, ids: ids, rows: rows });
    },

    /* ---- async states (loading / skeleton / error) ------------------ */

    /** Turn the loading state on or off. Called by `refresh()` around a server
     *  fetch, and public as `setLoading()` for data the host loads itself. */
    _setLoading: function (on) {
      on = !!on;
      if (this.state.loading === on) return;
      this.state.loading = on;
      this.el.classList.toggle('vt-loading', on);
      if (this.$table) this.$table.setAttribute('aria-busy', on ? 'true' : 'false');
      this._renderOverlay();
      // Swap the skeleton in or out while there is nothing else to show, and
      // put the footer up so the pager is there next to it on a first load.
      if (!this._view || !this._view.length) {
        this._paintRows(this._view || []);
        this._renderFooter();
      }
      this._emit('loading', { loading: on });
    },

    /** Show or hide the loading overlay. */
    _renderOverlay: function () {
      if (!this.$overlay) return;
      if (this.state.loading && this.states.loading !== false) {
        this.$overlay.querySelector('.vt-overlay-text').textContent = this.labels.loading;
        this.$overlay.removeAttribute('hidden');
      } else {
        this.$overlay.setAttribute('hidden', '');
      }
    },

    /** Placeholder rows for a load that has nothing to show yet. */
    _skeletonHtml: function () {
      var n = this.states.skeleton === true ? 8 : (parseInt(this.states.skeleton, 10) || 0);
      var cells = '';
      if (this.selection) cells += '<td class="vt-td vt-td-select"><span class="vt-skel"></span></td>';
      if (this.accordion) cells += '<td class="vt-td vt-td-expander"><span class="vt-skel"></span></td>';
      this._renderCols().forEach(function (c) {
        cells += '<td class="vt-td' + pinClass(c) + '"><span class="vt-skel"></span></td>';
      });
      var row = '<tr class="vt-skel-row" aria-hidden="true">' + cells + '</tr>', out = '';
      for (var i = 0; i < n; i++) out += row;
      return out;
    },

    /** The error row: a headline, the failure's own message and Retry. */
    _errorHtml: function (colspan) {
      var err = this.state.error;
      var detail = err && (err.message || (typeof err === 'string' ? err : ''));
      return '<tr class="vt-error" role="alert"><td colspan="' + colspan + '">' +
        '<div class="vt-error-box"><span class="vt-error-msg">' + esc(this.labels.error) + '</span>' +
        (detail ? '<span class="vt-error-detail">' + esc(detail) + '</span>' : '') +
        (this.states.retry === false ? ''
          : '<button type="button" class="vt-btn vt-retry">' + esc(this.labels.retry) + '</button>') +
        '</div></td></tr>';
    },

    /** Turn the loading state on or off by hand (for data you fetch yourself). */
    setLoading: function (on) {
      this._setLoading(on !== false);
      return this;
    },

    /** Show an error state; `null` clears it. Clearing re-runs the pipeline for
     *  client data; a server source is only repainted, so the host decides when
     *  to fetch again (`refresh()` or the Retry button). */
    setError: function (err) {
      this.state.error = err || null;
      if (this.state.error) {
        this._view = [];
        this._setLoading(false);
        this._paint();
      } else if (this.serverFetch) {
        this._paint();
      } else {
        this.refresh();
      }
      return this;
    },

    /* ---- column operations ------------------------------------------ *
     * Order, visibility, width and pinning all live on the column objects
     * themselves, so one snapshot (columnState) restores the whole layout.  */

    /** How many leading service cells each row carries: the selection checkbox
     *  and the accordion handle, in that order. */
    _leadCount: function () {
      return (this.selection ? 1 : 0) + (this.accordion ? 1 : 0);
    },

    /** Columns as rendered: left-pinned first, then free, then right-pinned.
     *  Hidden columns are left out. Pinned columns MUST sit at the edges for
     *  sticky offsets to line up, which is why the order is grouped here. */
    _renderCols: function () {
      var left = [], mid = [], right = [];
      this.columns.forEach(function (c) {
        if (c.hidden) return;
        if (c.pin === 'left') left.push(c);
        else if (c.pin === 'right') right.push(c);
        else mid.push(c);
      });
      return left.concat(mid, right);
    },

    /** Find a column by its data key or by its generated id. */
    _colById: function (id) {
      var i = this._indexOfCol(id);
      return i < 0 ? null : this.columns[i];
    },

    /** Index of a column in the column array (hidden ones included). */
    _indexOfCol: function (id) {
      if (id == null) return -1;
      for (var i = 0; i < this.columns.length; i++) {
        if (this.columns[i].key === id || this.columns[i].vtId === id) return i;
      }
      return -1;
    },

    /** Write each column's stored width onto its header cell. */
    _applyColumnWidths: function () {
      var tr = this.$thead.querySelector('tr');
      if (!tr) return;
      var offset = this._leadCount();
      this._renderCols().forEach(function (c, i) {
        var th = tr.children[i + offset];
        if (th) th.style.width = cssWidth(c.width);
      });
    },

    /** Resizing needs a fixed table layout, which would otherwise redistribute
     *  the columns: capture the widths the browser computed first, once. */
    _freezeAutoWidths: function () {
      if (!this.resizeCols || this._widthsFrozen) return;
      var tr = this.$thead.querySelector('tr');
      if (!tr) return;
      var offset = this._leadCount(), cols = this._renderCols(), done = cols.length > 0;
      cols.forEach(function (c, i) {
        if (c.width) return;
        var th = tr.children[i + offset];
        var w = th ? th.offsetWidth : 0;
        if (w > 0) c.width = w + 'px'; else done = false;
      });
      if (done) this._widthsFrozen = true;
    },

    /** Give the pinned cells the left/right offset `position:sticky` needs: the
     *  summed width of the pinned cells before (or after) them. */
    _applyPinOffsets: function () {
      var cols = this._renderCols(), offset = this._leadCount();
      var hasLeft = cols.some(function (c) { return c.pin === 'left'; });
      var rows = [];
      var head = this.$thead.querySelectorAll('tr');        // header + filter row
      for (var h = 0; h < head.length; h++) rows.push(head[h]);
      var body = this.$tbody.querySelectorAll('tr.vt-tr');
      for (var b = 0; b < body.length; b++) rows.push(body[b]);

      /** Measured width of a cell, falling back to its configured one. */
      function widthOf(cell, col) {
        var w = cell ? cell.offsetWidth : 0;
        if (!w && col && col.width) w = parseFloat(cssWidth(col.width)) || 0;
        return w;
      }

      rows.forEach(function (tr) {
        if (!tr) return;
        var x = 0;
        // The lead cells (checkbox, accordion handle) always come first, so they
        // have to stick as well or the pinned columns would scroll over them.
        for (var L = 0; L < offset; L++) {
          var lead = tr.children[L];
          if (!lead) continue;
          lead.classList.toggle('vt-pin-left', hasLeft);
          lead.style.left = hasLeft ? x + 'px' : '';
          // The fallback is the width the stylesheet gives these cells, used
          // only while the browser has not laid anything out yet.
          if (hasLeft) x += widthOf(lead, null) || (/vt-(td|th)-select/.test(lead.className) ? 36 : 34);
        }
        cols.forEach(function (c, i) {
          var cell = tr.children[i + offset];
          if (!cell) return;
          if (c.pin === 'left') { cell.style.left = x + 'px'; x += widthOf(cell, c); }
          else cell.style.left = '';
        });
        var r = 0;
        for (var i = cols.length - 1; i >= 0; i--) {
          var c = cols[i], cell = tr.children[i + offset];
          if (!cell) continue;
          if (c.pin === 'right') { cell.style.right = r + 'px'; r += widthOf(cell, c); }
          else cell.style.right = '';
        }
      });
    },

    /** Open or close the column menu (no argument flips it). */
    _toggleColsMenu: function (open) {
      if (!this.$toolbar) return;
      var menu = this.$toolbar.querySelector('.vt-cols-menu');
      if (!menu) return;
      var show = open === undefined ? menu.hasAttribute('hidden') : !!open;
      if (show) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
      var btn = this.$toolbar.querySelector('.vt-cols-btn');
      if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
    },

    /** Keep the menu's checkboxes in step with the column state. */
    _syncColsMenu: function () {
      if (!this.columnPicker || !this.$toolbar) return;
      var boxes = this.$toolbar.querySelectorAll('.vt-col-toggle');
      for (var i = 0; i < boxes.length; i++) {
        var col = this._colById(boxes[i].getAttribute('data-key'));
        if (col) boxes[i].checked = !col.hidden;
      }
    },

    /** Drag the edge of a header: update that column's width as the mouse moves. */
    _startResize: function (e, id) {
      var self = this, col = this._colById(id);
      var th = e.target.closest ? e.target.closest('th') : null;
      if (!col || !th) return;
      var startX = e.clientX;
      var startW = th.offsetWidth || parseFloat(cssWidth(col.width)) || this.minColWidth;

      /** Follow the pointer. */
      function move(ev) {
        col.width = Math.max(self.minColWidth, startW + (ev.clientX - startX)) + 'px';
        self._applyColumnWidths();
        self._applyPinOffsets();
      }
      /** Finish the drag and report the new width. */
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        self.el.classList.remove('vt-resizing');
        self._skipClick = true;                 // the release must not sort
        self._emit('columnResize', { key: col.key || col.vtId, width: parseFloat(col.width) });
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      this.el.classList.add('vt-resizing');
    },

    /** Drag a header onto another one to move that column into its place. */
    _startMove: function (e, th) {
      var self = this, id = th.getAttribute('data-key');
      var startX = e.clientX, moved = false, targetId = null;

      /** Mark the header under the pointer as the drop target. */
      function move(ev) {
        if (!moved && Math.abs(ev.clientX - startX) < 4) return;   // still a click
        moved = true;
        th.classList.add('vt-th-dragging');
        var over = ev.target && ev.target.closest ? ev.target.closest('th[data-key]') : null;
        if (over && !self.$thead.contains(over)) over = null;
        if (over === th) over = null;
        targetId = over ? over.getAttribute('data-key') : null;
        var cells = self.$thead.querySelectorAll('th');
        for (var i = 0; i < cells.length; i++) cells[i].classList.toggle('vt-drop-target', cells[i] === over);
      }
      /** Drop: move the column, or do nothing if the pointer never left. */
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        th.classList.remove('vt-th-dragging');
        var cells = self.$thead.querySelectorAll('th');
        for (var i = 0; i < cells.length; i++) cells[i].classList.remove('vt-drop-target');
        if (!moved) return;
        self._skipClick = true;                 // the release must not sort
        if (targetId) self.moveColumn(id, self._indexOfCol(targetId));
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },

    /** Show or hide a column (no second argument flips it). */
    toggleColumn: function (key, visible) {
      var col = this._colById(key);
      if (!col) return this;
      col.hidden = visible === undefined ? !col.hidden : !visible;
      this._syncColsMenu();
      this._renderHead();
      this.refresh();
      this._emit('columnVisibility', { key: col.key || col.vtId, hidden: !!col.hidden });
      return this;
    },

    /** Hide a column. */
    hideColumn: function (key) { return this.toggleColumn(key, false); },

    /** Show a column again. */
    showColumn: function (key) { return this.toggleColumn(key, true); },

    /** Move a column to another index in the column array (hidden included). */
    moveColumn: function (key, index) {
      var from = this._indexOfCol(key);
      if (from < 0) return this;
      var to = Math.max(0, Math.min(index, this.columns.length - 1));
      if (to === from) return this;
      var col = this.columns.splice(from, 1)[0];
      this.columns.splice(to, 0, col);
      this._skCache = null;                     // search keys follow the order
      this._renderToolbar();
      this._renderHead();
      this.refresh();
      this._emit('columnMove', { key: col.key || col.vtId, from: from, to: to, order: this.columnOrder() });
      return this;
    },

    /** Set a column width ('120px' or 120). */
    setColumnWidth: function (key, width) {
      var col = this._colById(key);
      if (!col) return this;
      col.width = cssWidth(width);
      this._renderHead();
      this.refresh();
      this._emit('columnResize', { key: col.key || col.vtId, width: parseFloat(col.width) });
      return this;
    },

    /** Pin a column to one side, or unpin it with false / null. */
    pinColumn: function (key, side) {
      var col = this._colById(key);
      if (!col) return this;
      col.pin = (side === 'left' || side === 'right') ? side : null;
      this._renderHead();
      this.refresh();
      this._emit('columnPin', { key: col.key || col.vtId, pin: col.pin });
      return this;
    },

    /** The column keys in their current order. */
    columnOrder: function () {
      return this.columns.map(function (c) { return c.key || c.vtId; });
    },

    /** A serialisable snapshot of the layout: order, visibility, width, pin. */
    columnState: function () {
      return this.columns.map(function (c) {
        return { key: c.key || c.vtId, hidden: !!c.hidden, width: c.width || null, pin: c.pin || null };
      });
    },

    /** Restore a columnState() snapshot. Unknown keys are ignored; columns the
     *  snapshot does not mention keep their relative order at the end. */
    setColumnState: function (state) {
      var self = this, ordered = [];
      (state || []).forEach(function (st) {
        var col = st ? self._colById(st.key) : null;
        if (!col || ordered.indexOf(col) !== -1) return;
        if ('hidden' in st) col.hidden = !!st.hidden;
        if ('width' in st) col.width = st.width ? cssWidth(st.width) : null;
        if ('pin' in st) col.pin = (st.pin === 'left' || st.pin === 'right') ? st.pin : null;
        ordered.push(col);
      });
      this.columns.forEach(function (c) { if (ordered.indexOf(c) === -1) ordered.push(c); });
      this.columns = ordered;
      this._skCache = null;
      this._renderToolbar();
      this._renderHead();
      this.refresh();
      return this;
    },

    /* ---- client data pipeline -------------------------------------- */

    /** Narrow rows by the global search query (see _searchKeys for the fields). */
    _filter: function (rows) {
      var q = this.state.q.trim().toLowerCase();
      if (!q) return rows;
      var keys = this._searchKeys();
      return rows.filter(function (row) {
        for (var i = 0; i < keys.length; i++) {
          var v = getPath(row, keys[i]);
          if (v != null && String(v).toLowerCase().indexOf(q) !== -1) return true;
        }
        return false;
      });
    },

    /** Apply the per-column filters in the browser: a row has to pass all of
     *  them (and the global search separately). */
    _filterCols: function (rows) {
      var self = this, keys = Object.keys(this.state.filters).filter(function (k) {
        var v = self.state.filters[k];
        if (isObj(v)) return v.min !== '' && v.min != null || v.max !== '' && v.max != null;
        return v !== '' && v != null;
      });
      if (!keys.length) return rows;
      return rows.filter(function (row) {
        for (var i = 0; i < keys.length; i++) {
          if (!self._passesFilter(row, keys[i], self.state.filters[keys[i]])) return false;
        }
        return true;
      });
    },

    /** Does one row pass one filter? Numbers compare as a range, everything
     *  else as a case-insensitive substring. */
    _passesFilter: function (row, key, value) {
      var raw = getPath(row, key);
      if (isObj(value)) {
        var n = parseFloat(raw);
        if (isNaN(n)) return false;
        if (value.min !== '' && value.min != null && n < parseFloat(value.min)) return false;
        if (value.max !== '' && value.max != null && n > parseFloat(value.max)) return false;
        return true;
      }
      if (raw == null) return false;
      return String(raw).toLowerCase().indexOf(String(value).toLowerCase()) !== -1;
    },

    /** Keys the client-side search looks at: the explicit `searchFields`, or (if
     *  not given) all data columns except `actions` and `searchable:false` ones. */
    _searchKeys: function () {
      if (this._skCache) return this._skCache;
      this._skCache = this.searchFields || this.columns.filter(function (c) {
        return c.key && c.type !== 'actions' && c.searchable !== false;
      }).map(function (c) { return c.key; });
      return this._skCache;
    },

    /** Sort a copy of the rows by the current key, numerically when both values are numbers. */
    _sort: function (rows) {
      var s = this.state.sort;
      if (!s) return rows;
      var dir = this.state.dir === 'desc' ? -1 : 1;
      return rows.slice().sort(function (a, b) {
        var va = getPath(a, s), vb = getPath(b, s);
        var na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== '') {
          return (na - nb) * dir;
        }
        return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb)) * dir;
      });
    },

    /** Cut the current page out of the rows and record the total. */
    _page: function (rows) {
      this.state.total = rows.length;
      if (!this.pagination) return rows;
      var per = this.state.perPage;
      var pages = Math.max(1, Math.ceil(rows.length / per));
      if (this.state.page > pages) this.state.page = pages;
      var start = (this.state.page - 1) * per;
      return rows.slice(start, start + per);
    },

    /* ---- rendering -------------------------------------------------- */

    /** Create the table skeleton once: toolbar, bulk bar, scroll box, table, overlay, footer. */
    _build: function () {
      var self = this;
      this.el.classList.add('vt-root');
      this.el.innerHTML =
        '<div class="vt-toolbar"></div>' +
        '<div class="vt-bulk" role="toolbar" hidden></div>' +
        '<div class="vt-scroll"><table class="vt-table"><thead></thead><tbody></tbody></table>' +
        '<div class="vt-overlay" role="status" aria-live="polite" hidden>' +
        '<span class="vt-spinner"></span><span class="vt-overlay-text"></span></div></div>' +
        '<div class="vt-footer"></div>';
      this.$toolbar = this.el.querySelector('.vt-toolbar');
      this.$scroll = this.el.querySelector('.vt-scroll');
      this.$table = this.el.querySelector('.vt-table');
      this.$thead = this.$table.querySelector('thead');
      this.$tbody = this.$table.querySelector('tbody');
      this.$footer = this.el.querySelector('.vt-footer');
      this.$overlay = this.el.querySelector('.vt-overlay');
      this.$bulk = this.el.querySelector('.vt-bulk');
      this.$table.setAttribute('role', 'grid');
      // A sticky header needs a scroll box with a height, so maxHeight goes on
      // the scroller; without it there is nothing for the header to stick to.
      if (this.stickyHeader) this.el.classList.add('vt-sticky-head');
      if (this.maxHeight) this.$scroll.style.maxHeight = cssWidth(this.maxHeight);
      // Close the column menu and any row action menu when the click lands
      // outside this table.
      this._onDocClick = function (e) {
        if (self.el.contains(e.target)) return;
        self._toggleColsMenu(false);
        self._closeActMenus(null);
      };
      document.addEventListener('click', this._onDocClick);
      if (this.responsive) {
        this.el.classList.add('vt-responsive');
        // The table reacts to its own width, so a window resize is just the
        // signal to measure again.
        this._onResize = debounce(function () { self._applyResponsive(); }, 80);
        window.addEventListener('resize', this._onResize);
      }
      if (this.virtual) {
        this.el.classList.add('vt-virtual');
        this.$scroll.addEventListener('scroll', function () { self._onVirtualScroll(); });
      }
      if (this.keyboard) {
        this.$table.addEventListener('keydown', function (e) { self._onKeydown(e); });
      }
      this._bind();
      this._renderToolbar();
      this._renderHead();
    },

    /** Render the toolbar: search box, column menu, export and print buttons. */
    _renderToolbar: function () {
      var L = this.labels, html = '';
      html += '<div class="vt-toolbar-left">';
      if (this.searchMode !== 'off') {
        html += '<input type="search" class="vt-search" placeholder="' + escAttr(L.search) +
          '" aria-label="' + escAttr(L.search) + '" value="' + escAttr(this.state.q) + '">';
      }
      html += '</div><div class="vt-toolbar-right">';
      if (this.columnPicker) {
        html += '<div class="vt-cols"><button type="button" class="vt-btn vt-cols-btn" aria-expanded="false">' +
          esc(L.columns) + '</button><div class="vt-cols-menu" role="group" aria-label="' +
          escAttr(L.columns) + '" hidden>' +
          this.columns.map(function (c) {
            return '<label class="vt-col-opt"><input type="checkbox" class="vt-col-toggle" data-key="' +
              escAttr(c.vtId) + '"' + (c.hidden ? '' : ' checked') + '> ' + esc(c.label) + '</label>';
          }).join('') + '</div></div>';
      }
      this.exportFormats.forEach(function (fmt) {
        var label = fmt === 'xlsx' ? L.exportXlsx : fmt === 'pdf' ? L.exportPdf : L.exportCsv;
        html += '<button type="button" class="vt-btn vt-export" data-format="' + escAttr(fmt) + '">' + esc(label) + '</button>';
      });
      if (this.printable) html += '<button type="button" class="vt-btn vt-print">' + esc(L.print) + '</button>';
      html += '</div>';
      this.$toolbar.innerHTML = html;
    },

    /** Render the header row (and the filter row when there is one). */
    _renderHead: function () {
      var s = this.state, self = this, cells = '';
      if (this.selection) {
        cells += '<th class="vt-th vt-th-select">' +
          (this.selection.mode === 'single' || this.selection.header === false ? ''
            : '<input type="checkbox" class="vt-select-all" aria-label="' + escAttr(this.labels.selectAll) + '">') +
          '</th>';
      }
      if (this.accordion) cells += '<th class="vt-th vt-th-expander"></th>';
      this._renderCols().forEach(function (c) {
        var sortable = self.sortMode !== 'off' && c.sortable && c.key && c.type !== 'actions';
        var cls = 'vt-th' + (sortable ? ' vt-sortable' : '') + (c.className ? ' ' + c.className : '') + pinClass(c);
        if (sortable && s.sort === c.key) cls += ' vt-sort-' + s.dir;
        var w = cssWidth(c.width);
        var style = w ? ' style="width:' + escAttr(w) + '"' : '';
        var movable = self.reorderCols && c.reorderable !== false;
        var sizable = self.resizeCols && c.resizable !== false;
        cells += '<th class="' + cls + '" data-key="' + escAttr(c.vtId) + '"' +
          (sortable ? ' data-sort="' + escAttr(c.key) + '"' : '') +
          (movable ? ' data-move="1"' : '') + style + '>' +
          '<span class="vt-th-label">' + esc(c.label) + '</span>' +
          (sortable ? '<span class="vt-sort-ind"></span>' : '') +
          (sizable ? '<span class="vt-resizer" data-resize="' + escAttr(c.vtId) + '"></span>' : '') +
          '</th>';
      });
      this.$thead.innerHTML = '<tr>' + cells + '</tr>' + (this.filtersOn ? this._filterRowHtml() : '');
    },

    /** The filter row: one control per column that asked for one. It lives in
     *  <thead> so it inherits the column order, pins and the sticky header. */
    _filterRowHtml: function () {
      var self = this, cells = '';
      for (var i = 0; i < this._leadCount(); i++) cells += '<th class="vt-th vt-filter-cell"></th>';
      this._renderCols().forEach(function (c) {
        cells += '<th class="vt-th vt-filter-cell' + pinClass(c) + '"' +
          (self.responsive ? ' data-label="' + escAttr(c.label) + '"' : '') + '>' +
          (c.filter ? self._filterControlHtml(c) : '') + '</th>';
      });
      return '<tr class="vt-filter-row">' + cells + '</tr>';
    },

    /** The control for one column's filter: text, select or a number range. */
    _filterControlHtml: function (c) {
      var L = this.labels, key = c.key, cfg = isObj(c.filter) ? c.filter : {};
      var type = cfg.type || (c.filter === true ? null : c.filter) || null;
      var value = this.state.filters[key];
      var opts = this._filterOptions(c, cfg);
      if (type === 'select' || (!type && opts)) {
        return '<select class="vt-filter vt-filter-select" data-filter="' + escAttr(key) +
          '" aria-label="' + escAttr(c.label) + '"><option value="">' + esc(L.filterAll) + '</option>' +
          optionsHtml(opts, value == null ? '' : String(value)) + '</select>';
      }
      if (type === 'number') {
        var range = isObj(value) ? value : {};
        return '<span class="vt-filter-num">' +
          '<input type="number" class="vt-filter vt-filter-min" data-filter="' + escAttr(key) +
          '" placeholder="' + escAttr(L.filterMin) + '" aria-label="' + escAttr(c.label + ' ' + L.filterMin) +
          '" value="' + escAttr(range.min == null ? '' : range.min) + '">' +
          '<input type="number" class="vt-filter vt-filter-max" data-filter="' + escAttr(key) +
          '" placeholder="' + escAttr(L.filterMax) + '" aria-label="' + escAttr(c.label + ' ' + L.filterMax) +
          '" value="' + escAttr(range.max == null ? '' : range.max) + '">' +
          '</span>';
      }
      return '<input type="search" class="vt-filter vt-filter-text" data-filter="' + escAttr(key) +
        '" placeholder="' + escAttr(cfg.placeholder || c.label) + '" aria-label="' + escAttr(c.label) +
        '" value="' + escAttr(value == null ? '' : value) + '">';
    },

    /** Options for a select filter: the ones given, else the column's own
     *  (`map` for a status, `options` for a select), else none. */
    _filterOptions: function (c, cfg) {
      if (Array.isArray(cfg.options)) return cfg.options;
      if (isObj(c.map)) {
        return Object.keys(c.map).map(function (k) {
          var meta = c.map[k] || {};
          return { value: k, label: meta.label != null ? meta.label : k };
        });
      }
      if (Array.isArray(c.options)) return c.options;
      return null;
    },

    /** Is virtualization running? It needs a scroll box with a real height,
     *  so a table that was never laid out simply renders every row. */
    _virtualOn: function () {
      // Cards are as tall as their content, so the fixed-height window cannot
      // be trusted while stacked.
      return !!(this.virtual && !this.state.stacked && this.$scroll && this.$scroll.clientHeight > 0);
    },

    /** The slice of rows to render, with the spacer heights around it. */
    _virtualRange: function (total) {
      var h = this._rowH || this.virtual.rowHeight;
      var over = this.virtual.overscan;
      var start = Math.max(0, Math.floor(this.$scroll.scrollTop / h) - over);
      var count = Math.ceil(this.$scroll.clientHeight / h) + over * 2;
      var end = Math.min(total, start + count);
      return { start: start, end: end, padTop: start * h, padBottom: Math.max(0, (total - end) * h) };
    },

    /** Learn the real row height once the browser has laid a row out, so the
     *  window and the spacers follow the actual styling. */
    _measureRowHeight: function () {
      var tr = this.$tbody.querySelector('tr.vt-tr');
      var h = tr ? tr.offsetHeight : 0;
      if (h > 0 && h !== this._rowH) this._rowH = h;
    },

    /** Render the body — the whole view, or just the window when virtualized —
     *  and re-apply everything that depends on the rendered cells. */
    _paintRows: function (rows) {
      var self = this, colspan = this._renderCols().length + this._leadCount();
      if (this.state.error && this.states.error !== false) {
        this.$tbody.innerHTML = this._errorHtml(colspan);
        this._range = null;
      } else if (!rows.length && this.state.loading && this.states.skeleton) {
        this.$tbody.innerHTML = this._skeletonHtml();
        this._range = null;
      } else if (!rows.length) {
        this.$tbody.innerHTML = '<tr class="vt-empty"><td colspan="' + colspan + '">' + esc(this.emptyText) + '</td></tr>';
        this._range = null;
      } else if (this._virtualOn()) {
        var r = this._virtualRange(rows.length);
        var html = spacerRow(r.padTop, colspan);
        for (var i = r.start; i < r.end; i++) html += this._rowHtml(rows[i], i);
        this.$tbody.innerHTML = html + spacerRow(r.padBottom, colspan);
        this._range = r;
        this._measureRowHeight();
      } else {
        this.$tbody.innerHTML = rows.map(function (row, i) { return self._rowHtml(row, i); }).join('');
        this._range = null;
      }
      this._applyColumnWidths();
      this._applyPinOffsets();
      this._applyFilterSticky();
      if (this.selection) { this._syncSelectAll(); this._renderBulk(); }
      this._a11yPaint();
    },

    /** Re-render the window when the scroll has moved past it. */
    _onVirtualScroll: function () {
      if (!this._virtualOn()) return;
      var rows = this._view || [];
      if (!rows.length) return;
      var next = this._virtualRange(rows.length), cur = this._range;
      if (cur && cur.start === next.start && cur.end === next.end) return;
      this._paintRows(rows);
      this._emit('virtualRange', { start: next.start, end: next.end, total: rows.length });
    },

    /** Render the body for the current view and everything that depends on it. */
    _paint: function () {
      var rows = this._view || [];
      this._paintRows(rows);
      this._renderFooter();
      this._freezeAutoWidths();
      if (this.resizeCols) this.$table.classList.toggle('vt-table-fixed', !!this._widthsFrozen);
      this._applyColumnWidths();
      this._applyPinOffsets();
      this._emit('render', { rows: rows });
    },

    /** Markup of one data row, plus its detail row when the accordion is open. */
    _rowHtml: function (row, index) {
      var self = this, id = getPath(row, this.rowId);
      var editing = !!this.state.editing[id];
      var cells = '';
      if (this.selection) {
        var canSelect = !isFn(this.selection.selectable) || this.selection.selectable(row) !== false;
        cells += '<td class="vt-td vt-td-select"><input type="checkbox" class="vt-select-row" data-select="' +
          escAttr(id) + '" aria-label="' + escAttr(this.labels.selectRow) + '"' +
          (this.isSelected(id) ? ' checked' : '') + (canSelect ? '' : ' disabled') + '></td>';
      }
      if (this.accordion) {
        var open = !!this.state.expanded[id];
        var detailId = this.uid + '-d-' + String(id).replace(/[^\w-]/g, '_');
        cells += '<td class="vt-td vt-td-expander"><button type="button" class="vt-expander' + (open ? ' vt-open' : '') +
          '" data-expand="' + escAttr(id) + '" aria-label="' + escAttr(this.labels.expandRow) + '"' +
          ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="' + escAttr(detailId) + '">' +
          (open ? '&#9662;' : '&#9656;') + '</button></td>';
      }
      this._renderCols().forEach(function (c) {
        cells += self._cellHtml(c, row, editing);
      });
      // aria-rowindex counts from 1 and the header row is row 1, so the first
      // data row is 2. With a virtual window it keeps the absolute position.
      var ri = index == null ? '' : ' aria-rowindex="' + (index + 2) + '"';
      var selCls = this.selection && this.isSelected(id) ? ' vt-selected' : '';
      var selAttr = this.selection ? ' aria-selected="' + (this.isSelected(id) ? 'true' : 'false') + '"' : '';
      var tr = '<tr class="vt-tr' + selCls + '" data-id="' + escAttr(id) + '"' + ri + selAttr + '>' + cells + '</tr>';
      if (this.accordion && this.state.expanded[id]) {
        tr += '<tr class="vt-detail" id="' + escAttr(this.uid + '-d-' + String(id).replace(/[^\w-]/g, '_')) +
          '"><td colspan="' + (this._renderCols().length + this._leadCount()) + '">' +
          '<div class="vt-detail-box">' + this._accordionHtml(row) + '</div></td></tr>';
      }
      return tr;
    },

    /** Markup of one cell, by column type (or its inline editor while the row is edited). */
    _cellHtml: function (c, row, editing) {
      var cls = 'vt-td' + (c.align ? ' vt-align-' + c.align : '') + (c.cellClass ? ' ' + c.cellClass : '') + pinClass(c);
      // The card layout prints this in front of the value.
      var label = this.responsive ? ' data-label="' + escAttr(c.label) + '"' : '';
      var raw = c.key ? getPath(row, c.key) : undefined;

      // Inline editing overrides the normal renderer for editable text-ish columns.
      if (editing && this.editable && c.editable && (c.type === 'text' || c.type === 'number' || c.type === 'textarea' || c.type === 'select')) {
        return '<td class="' + cls + ' vt-editing"' + label + '>' + this._editorHtml(c, raw, row) + '</td>';
      }

      var inner;
      switch (c.type) {
        case 'actions': inner = this._actionsHtml(c, row); break;
        case 'html':    inner = c.render ? c.render(raw, row) : esc(raw); break;
        case 'link': {
          var href = resolve(c.href, row) || '#';
          var text = c.text ? resolve(c.text, row) : (raw != null ? raw : href);
          inner = '<a class="vt-link" href="' + escAttr(href) + '"' + (c.target ? ' target="' + escAttr(c.target) + '"' : '') + '>' + esc(text) + '</a>';
          break;
        }
        case 'external': {
          var eh = resolve(c.href, row) || (raw || '#');
          inner = '<a class="vt-link vt-external" href="' + escAttr(eh) + '" target="_blank" rel="noopener">' + esc(c.text ? resolve(c.text, row) : raw || eh) + ' &#8599;</a>';
          break;
        }
        case 'copy': {
          var cv = raw == null ? '' : String(raw);
          inner = '<span class="vt-copy-wrap"><span class="vt-copy-val">' + esc(cv) + '</span>' +
            '<button type="button" class="vt-copy" data-copy="' + escAttr(cv) + '" title="' + escAttr(this.labels.copy) + '">&#128203;</button></span>';
          break;
        }
        case 'status': {
          var map = c.map || {};
          var meta = map[raw] || { label: raw, color: '#64748b' };
          inner = '<span class="vt-badge" style="--vt-badge:' + escAttr(meta.color || '#64748b') + '">' + esc(meta.label != null ? meta.label : raw) + '</span>';
          break;
        }
        case 'select':
        case 'tag': {
          inner = '<select class="vt-cell-select" data-col="' + escAttr(c.key) + '">' +
            optionsHtml(resolve(c.options, row), String(raw)) + '</select>';
          break;
        }
        case 'image': {
          var src = resolve(c.src, row) || raw;
          inner = src ? '<img class="vt-img" src="' + escAttr(src) + '" alt="" loading="lazy">' : '';
          break;
        }
        case 'download': {
          var name = (c.filename ? resolve(c.filename, row) : 'data.txt');
          inner = '<button type="button" class="vt-btn vt-mini vt-download" data-dl-name="' + escAttr(name) + '">&#8681; ' + esc(c.text || 'Download') + '</button>' +
            '<textarea class="vt-dl-src" hidden>' + esc(raw == null ? '' : raw) + '</textarea>';
          break;
        }
        case 'number': inner = raw == null ? '' : esc(raw); break;
        case 'textarea':
        case 'text':
        default:
          inner = (c.prefix ? esc(c.prefix) : '') + esc(raw) + (c.suffix ? esc(c.suffix) : '');
      }
      return '<td class="' + cls + '"' + label + '>' + inner + '</td>';
    },

    /** The inline editor for a cell: input, number, textarea or select. */
    _editorHtml: function (c, raw, row) {
      var name = escAttr(c.key);
      if (c.type === 'textarea') return '<textarea class="vt-input" data-edit="' + name + '">' + esc(raw) + '</textarea>';
      if (c.type === 'select') {
        return '<select class="vt-input" data-edit="' + name + '">' +
          optionsHtml(resolve(c.options, row), String(raw)) + '</select>';
      }
      var t = c.type === 'number' ? 'number' : 'text';
      return '<input class="vt-input" type="' + t + '" data-edit="' + name + '" value="' + escAttr(raw) + '">';
    },

    /** The actions cell: a dropdown of the row actions, or Save/Cancel while editing. */
    _actionsHtml: function (c, row) {
      // Only ever called for a column of type 'actions', so the column itself
      // is the config; `options.actions` supplies the callbacks in _action().
      var L = this.labels, cfg = c;
      var id = getPath(row, this.rowId);
      var editing = !!this.state.editing[id];
      var out = '<div class="vt-actions">';

      if (editing) {
        out += '<button type="button" class="vt-btn vt-mini vt-primary" data-act="save" data-id="' + escAttr(id) + '">' + esc(L.save) + '</button>';
        out += '<button type="button" class="vt-btn vt-mini" data-act="cancel" data-id="' + escAttr(id) + '">' + esc(L.cancel) + '</button>';
        out += '</div>';
        return out;
      }

      // The actions themselves, in the order they are shown.
      var items = [];
      var editCfg = cfg.edit;
      if (editCfg && editCfg.enabled !== false) {
        items.push({ act: 'edit', label: editCfg.label || L.edit, className: '' });
      }
      (cfg.custom || []).forEach(function (a, i) {
        items.push({ act: 'custom', idx: i, label: a.label || '', className: a.className || '' });
      });
      var rm = cfg.remove;
      if (rm && rm.enabled !== false) {
        items.push({ act: 'remove', label: rm.label || L.remove, className: 'vt-danger' });
      }
      if (!items.length) return out + '</div>';

      // A row's actions live in a dropdown by default: a cell is too narrow to
      // hold more than two or three buttons. `menu: false` puts them back in a
      // row, `menu: { icon, label }` changes the trigger.
      var menuCfg = cfg.menu === undefined ? true : cfg.menu;
      if (menuCfg === false) {
        items.forEach(function (it) {
          out += '<button type="button" class="vt-btn vt-mini ' + it.className + '" data-act="' + it.act + '"' +
            (it.idx != null ? ' data-idx="' + it.idx + '"' : '') +
            ' data-id="' + escAttr(id) + '">' + esc(it.label) + '</button>';
        });
        return out + '</div>';
      }

      var m = isObj(menuCfg) ? menuCfg : {};
      out = '<div class="vt-actions vt-actions-menu">' +
        '<button type="button" class="vt-btn vt-mini vt-act-trigger" data-act-menu="' + escAttr(id) + '"' +
        ' aria-haspopup="menu" aria-expanded="false" aria-label="' + escAttr(m.label || L.actions) + '">' +
        (m.icon ? esc(m.icon) : '&#9776; &#9662;') + '</button>' +
        '<div class="vt-act-menu" role="menu" hidden>';
      items.forEach(function (it) {
        out += '<button type="button" role="menuitem" class="vt-act-item ' + it.className + '" data-act="' + it.act + '"' +
          (it.idx != null ? ' data-idx="' + it.idx + '"' : '') +
          ' data-id="' + escAttr(id) + '">' + esc(it.label) + '</button>';
      });
      return out + '</div></div>';
    },

    /** Open or close one row's action menu (no third argument flips it). */
    _toggleActMenu: function (btn, open) {
      var box = btn.parentNode ? btn.parentNode.querySelector('.vt-act-menu') : null;
      if (!box) return;
      var show = open === undefined ? box.hasAttribute('hidden') : !!open;
      this._closeActMenus(show ? box : null);
      if (!show) {
        box.setAttribute('hidden', '');
        box.classList.remove('vt-act-menu-up');
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      box.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      // Flip the menu above the trigger when it would fall out of the scroll box.
      if (this.$scroll && box.getBoundingClientRect && this.$scroll.getBoundingClientRect) {
        var mb = box.getBoundingClientRect().bottom, sb = this.$scroll.getBoundingClientRect().bottom;
        box.classList.toggle('vt-act-menu-up', mb > 0 && sb > 0 && mb > sb);
      }
      var first = box.querySelector('.vt-act-item');
      if (first) first.focus();
    },

    /** Close every open action menu, except the one passed in. */
    _closeActMenus: function (except) {
      var boxes = this.el.querySelectorAll('.vt-act-menu');
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i] === except || boxes[i].hasAttribute('hidden')) continue;
        boxes[i].setAttribute('hidden', '');
        boxes[i].classList.remove('vt-act-menu-up');
        var btn = boxes[i].parentNode.querySelector('.vt-act-trigger');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    },

    /** The contents of a detail row: a custom render() or a list of columns. */
    _accordionHtml: function (row) {
      var a = this.accordion;
      if (isFn(a.render)) return a.render(row);
      if (a.columns) {
        return '<dl class="vt-detail-grid">' + a.columns.map(function (c) {
          var col = normalizeColumn(c);
          var v = col.key ? getPath(row, col.key) : '';
          return '<dt>' + esc(col.label) + '</dt><dd>' + (col.render ? col.render(v, row) : esc(v)) + '</dd>';
        }).join('') + '</dl>';
      }
      return '';
    },

    /** Render the pager: rows-per-page, the total and the prev/next buttons. */
    _renderFooter: function () {
      if (!this.pagination) { this.$footer.innerHTML = ''; return; }
      var L = this.labels, s = this.state;
      var total = s.total;
      var pages = Math.max(1, Math.ceil(total / s.perPage));
      if (s.page > pages) s.page = pages;
      var optHtml = this.pagination.options.map(function (n) {
        return '<option value="' + n + '"' + (n === s.perPage ? ' selected' : '') + '>' + n + '</option>';
      }).join('');
      this.$footer.innerHTML =
        '<div class="vt-pg-left">' +
          '<label class="vt-perpage">' + esc(L.perPage) + ' <select class="vt-perpage-sel">' + optHtml + '</select></label>' +
          '<span class="vt-count">' + total + '</span>' +
        '</div>' +
        '<div class="vt-pg-right">' +
          '<button type="button" class="vt-btn vt-prev"' + (s.page <= 1 ? ' disabled' : '') + '>' + esc(L.prev) + '</button>' +
          '<span class="vt-pageinfo">' + esc(L.page) + ' ' + s.page + ' ' + esc(L.of) + ' ' + pages + '</span>' +
          '<button type="button" class="vt-btn vt-next"' + (s.page >= pages ? ' disabled' : '') + '>' + esc(L.next) + '</button>' +
        '</div>';
    },

    /* ---- events (delegated on the root) ---------------------------- */

    /** Attach the delegated listeners once; everything below works on the current markup. */
    _bind: function () {
      var self = this;

      // Search (debounced).
      var onSearch = debounce(function (v) {
        self.state.q = v; self.state.page = 1; self.refresh();
      }, self.searchMode === 'server' ? 300 : 150);

      // Filter typing is debounced like the search box; a select applies at once.
      var onFilter = debounce(function (input) { self._onFilterInput(input); },
        self.filterMode === 'server' ? 300 : 150);

      this.el.addEventListener('input', function (e) {
        var t = e.target;
        if (t.classList.contains('vt-search')) { onSearch(t.value); return; }
        if (t.classList.contains('vt-filter') && t.tagName !== 'SELECT') onFilter(t);
      });

      // Column resize / reorder run on plain mouse events: HTML5 drag-and-drop
      // cannot be driven without a real pointer and brings no benefit here.
      this.el.addEventListener('mousedown', function (e) {
        if (!e.target.closest) return;
        var rz = e.target.closest('.vt-resizer');
        if (rz) { e.preventDefault(); self._startResize(e, rz.getAttribute('data-resize')); return; }
        var th = e.target.closest('th[data-move]');
        if (th && self.$thead.contains(th)) self._startMove(e, th);
      });

      this.el.addEventListener('change', function (e) {
        var t = e.target;
        if (t.classList.contains('vt-filter-select')) { self._onFilterInput(t); return; }
        if (t.classList.contains('vt-select-row')) {
          self.selectRow(t.getAttribute('data-select'), t.checked); return;
        }
        if (t.classList.contains('vt-select-all')) {
          self._setViewSelection(t.checked); return;
        }
        if (t.classList.contains('vt-col-toggle')) {
          self.toggleColumn(t.getAttribute('data-key'), t.checked); return;
        }
        if (t.classList.contains('vt-perpage-sel')) {
          self.state.perPage = parseInt(t.value, 10); self.state.page = 1; self.refresh();
        } else if (t.classList.contains('vt-cell-select')) {
          var tr = t.closest('.vt-tr'); var id = tr && tr.getAttribute('data-id');
          var col = t.getAttribute('data-col');
          var row = self._rowById(id);
          self._emit('cellChange', { id: id, column: col, value: t.value, row: row });
          var cdef = self._colByKey(col);
          if (cdef && isFn(cdef.onChange)) cdef.onChange(row, t.value);
        }
      });

      this.el.addEventListener('click', function (e) {
        var t = e.target;

        // The mouseup that ends a resize / reorder drag is followed by a click:
        // swallow it so the drag does not also sort the column.
        if (self._skipClick) { self._skipClick = false; return; }

        // a row's action menu: the trigger toggles it, a click anywhere else
        // (except inside an open menu) closes it
        var trigger = t.closest('.vt-act-trigger');
        if (trigger) { self._toggleActMenu(trigger); return; }
        if (!t.closest('.vt-act-menu')) self._closeActMenus(null);

        // column menu
        if (t.closest('.vt-cols-btn')) { self._toggleColsMenu(); return; }

        // retry after a failed load
        if (t.closest('.vt-retry')) { self.state.error = null; self.refresh(); return; }

        // bulk actions
        var bulk = t.closest('[data-bulk]');
        if (bulk) { self._runBulk(parseInt(bulk.getAttribute('data-bulk'), 10)); return; }
        if (t.closest('.vt-bulk-clear')) { self.clearSelection(); return; }

        // sort
        var th = t.closest('.vt-sortable');
        if (th && self.$thead.contains(th)) { self._toggleSort(th.getAttribute('data-sort')); return; }

        // toolbar
        var expBtn = t.closest('.vt-export');
        if (expBtn) { self._export(expBtn.getAttribute('data-format') || 'csv'); return; }
        if (t.closest('.vt-print')) { self.print(); return; }
        if (t.closest('.vt-prev')) { if (self.state.page > 1) { self.state.page--; self.refresh(); } return; }
        if (t.closest('.vt-next')) { self.state.page++; self.refresh(); return; }

        // copy
        var cp = t.closest('.vt-copy');
        if (cp) { self._copy(cp.getAttribute('data-copy'), cp); return; }

        // download cell
        var dl = t.closest('.vt-download');
        if (dl) {
          var box = dl.parentNode.querySelector('.vt-dl-src');
          downloadText(dl.getAttribute('data-dl-name') || 'data.txt', box ? box.value : '');
          return;
        }

        // expander
        var ex = t.closest('.vt-expander');
        if (ex) { self._toggleExpand(ex.getAttribute('data-expand')); return; }

        // row action buttons (inline, or picked from the dropdown)
        var act = t.closest('[data-act]');
        if (act) {
          if (act.classList.contains('vt-act-item')) self._closeActMenus(null);
          self._action(act.getAttribute('data-act'), act.getAttribute('data-id'), act, e);
          return;
        }

        // whole-row click (ignore clicks on interactive controls)
        if (self.onRowClick) {
          var rtr = t.closest('.vt-tr');
          if (rtr && !t.closest('a,button,input,select,textarea,label,.vt-copy')) {
            self.onRowClick(self._rowById(rtr.getAttribute('data-id')), e);
          }
        }
      });
    },

    /** Switch the sort to a column, or flip its direction when it is already sorted. */
    _toggleSort: function (key) {
      var s = this.state;
      if (s.sort === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
      else { s.sort = key; s.dir = 'asc'; }
      this._renderHead();
      this.refresh();
    },

    /** Open or close one row's detail row and report it. */
    _toggleExpand: function (id) {
      this.state.expanded[id] = !this.state.expanded[id];
      this._paint();
      this._emit('expand', { id: id, open: !!this.state.expanded[id], row: this._rowById(id) });
    },

    /** Run a row action by name (edit / save / cancel / remove / custom). */
    _action: function (act, id, btn, ev) {
      var row = this._rowById(id);
      var cfg = this.actionsCfg || this._actionsColCfg() || {};
      if (act === 'edit') {
        if (this.editable) { this.state.editing[id] = true; this._paint(); }
        var eh = cfg.edit && cfg.edit.onEdit;
        if (isFn(eh)) eh(row);
        this._emit('edit', { id: id, row: row });
      } else if (act === 'save') {
        this._saveRow(id);
      } else if (act === 'cancel') {
        delete this.state.editing[id]; this._paint();
      } else if (act === 'remove') {
        this._confirmRemove(id, row, cfg.remove || {});
      } else if (act === 'custom') {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var list = (cfg.custom || this._actionsColCustom());
        var a = list && list[idx];
        if (a && isFn(a.onClick)) a.onClick(row, ev);
        this._emit('action', { id: id, index: idx, row: row });
      }
    },

    /** Collect the inline editors of a row, write them back and report the change. */
    _saveRow: function (id) {
      var tr = this.$tbody.querySelector('.vt-tr[data-id="' + cssEsc(id) + '"]');
      if (!tr) return;
      var changes = {}, row = this._rowById(id);
      tr.querySelectorAll('[data-edit]').forEach(function (inp) {
        changes[inp.getAttribute('data-edit')] = inp.value;
      });
      // Apply to local row so the re-render shows new values.
      if (row) Object.keys(changes).forEach(function (k) { row[k] = changes[k]; });
      delete this.state.editing[id];
      if (isFn(this.onSave)) this.onSave(id, changes, row);
      this._emit('save', { id: id, changes: changes, row: row });
      this._paint();
    },

    /** Ask before removing a row, then call the endpoint or drop it locally.
     *  `rm.confirm` is the host's look for the dialog (see README "Styling"). */
    _confirmRemove: function (id, row, rm) {
      var self = this;
      var look = isObj(rm.confirm) ? rm.confirm : {};
      this._modal(this.labels.confirmRemove, [
        { label: this.labels.cancel, className: look.cancelClassName },
        {
          label: this.labels.remove, className: joinClass('vt-danger', look.confirmClassName), onClick: function () {
            if (isFn(rm.onRemove)) rm.onRemove(row);
            var url = resolve(rm.url, row);
            if (url) {
              fetch(url, { method: rm.method || 'DELETE', headers: rm.headers || {} })
                .then(function () { self._emit('remove', { id: id, row: row, ok: true }); if (rm.reload !== false) self.refresh(); })
                .catch(function (err) { self._emit('remove', { id: id, row: row, ok: false, error: err }); });
            } else {
              // No url: just drop locally (or let host handle via onRemove/event).
              self.data = self.data.filter(function (r) { return String(getPath(r, self.rowId)) !== String(id); });
              self._emit('remove', { id: id, row: row, ok: true });
              self.refresh();
            }
          }
        }
      ], look);
    },

    /* ---- built-in modal (no Bootstrap) ------------------------------ */

    /** A built-in confirmation dialog (no Bootstrap, no dependencies).
     *  `look` restyles it: a title and a class of your own on each part. Those
     *  classes are ADDED to the built-in ones, which stay as they are. The
     *  caller passes an object (`{}` when the host configured no look). */
    _modal: function (message, buttons, look) {
      var overlay = document.createElement('div');
      overlay.className = joinClass('vt-modal-overlay', look.overlayClassName);
      // The dialog is a child of <body>, outside this table's .vt-root, so it
      // is given the look the table resolves to right now.
      copyTheme(this.el, overlay);
      var box = document.createElement('div');
      box.className = joinClass('vt-modal', look.className);
      box.innerHTML =
        (look.title == null || look.title === '' ? '' : '<div class="vt-modal-head">' + esc(look.title) + '</div>') +
        '<div class="' + escAttr(joinClass('vt-modal-body', look.bodyClassName)) + '">' + esc(message) + '</div>' +
        '<div class="' + escAttr(joinClass('vt-modal-foot', look.footClassName)) + '"></div>';
      var foot = box.querySelector('.vt-modal-foot');
      var self = this;
      // Only the dialog that is still up may clear the handle: opening a second
      // one over the first replaces it, and closing the first must not wipe it.
      function close() {
        if (overlay.parentNode) document.body.removeChild(overlay);
        if (self._closeModal === close) self._closeModal = null;
      }
      this._closeModal = close;
      buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vt-btn ' + (b.className || '');
        btn.textContent = b.label;
        btn.addEventListener('click', function () { if (b.onClick) b.onClick(); close(); });
        foot.appendChild(btn);
      });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    },

    /* ---- export / print -------------------------------------------- */

    /** Columns an export covers: those on screen, in their display order. */
    _visibleCols: function () {
      return this._renderCols().filter(function (c) { return c.type !== 'actions'; });
    },

    /** Rows an export covers: the whole client dataset after the per-column
     *  filters and the search, or the fetched page in server mode. */
    _exportSource: function () {
      if (this.serverFetch) return this._view || [];
      var rows = this.data;
      if (this.filtersOn) rows = this._filterCols(rows);
      return this._sort(this._filter(rows));
    },

    /** Export the CURRENT dataset (all client rows, or current server page). */
    exportCsv: function (filename) {
      var self = this;
      var cols = this._visibleCols();
      var source = this._exportSource();
      var rows = [cols.map(function (c) { return c.label; })];
      source.forEach(function (row) {
        rows.push(cols.map(function (c) {
          var v = cellValue(row, c);
          return v == null ? '' : String(v);
        }));
      });
      var name = filename || this.exportName;
      if (!/\.csv$/i.test(name)) name += '.csv';
      downloadText(name, '\ufeff' + toCsv(rows), 'text/csv;charset=utf-8');
      this._emit('export', { rows: source.length, format: 'csv' });
    },

    /** Build the payload for an XLSX/PDF adapter (and the Go binary):
     *  { format, filename, columns:[{key,label}], rows:[{ key: value }] }. */
    _buildPayload: function (format) {
      var cols = this._visibleCols().map(function (c) {
        return { key: c.key || '', label: String(c.label == null ? '' : c.label) };
      });
      var source = this._exportSource();
      var rows = source.map(function (row) {
        var o = {};
        cols.forEach(function (c) { var v = cellValue(row, c); o[c.key] = v == null ? '' : v; });
        return o;
      });
      return { format: format, filename: this.exportName, columns: cols, rows: rows };
    },

    /** Run an export. CSV is built in; xlsx/pdf go through the provided adapter.
     *  With no adapter for the requested format an 'error' event is emitted (so
     *  the substitution is not silent) and the built-in CSV is produced. */
    _export: function (format) {
      var self = this, adapter = this.exportAdapters[format];
      if (adapter) {
        Promise.resolve(adapter(this._buildPayload(format)))
          .then(function () { self._emit('export', { format: format }); })
          .catch(function (err) { self._emit('error', err); });
        return;
      }
      if (format !== 'csv') {
        this._emit('error', new Error('[Vantable] no export adapter for "' + format + '" — exporting CSV instead'));
      }
      this.exportCsv();
    },

    /** Open a print window with a copy of the table, stripped of its controls. */
    print: function () {
      var w = window.open('', '_blank');
      if (!w) return;
      var clone = this.$table.cloneNode(true);
      // Drop interactive controls from the printout.
      clone.querySelectorAll('.vt-actions, .vt-td-expander, .vt-th-expander, .vt-td-select, .vt-th-select, .vt-copy, .vt-download').forEach(function (n) { n.remove(); });
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Print</title>' +
        '<style>table{border-collapse:collapse;width:100%;font:13px system-ui,sans-serif}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}</style>' +
        '</head><body>' + clone.outerHTML + '</body></html>');
      w.document.close(); w.focus(); w.print(); w.close();
    },

    /* ---- keyboard navigation (WAI-ARIA grid pattern) --------------- */

    /** Navigable rows: the header row + the data rows (skips detail/empty). */
    _navRows: function () {
      var rows = [], htr = this.$thead.querySelector('tr');
      if (htr) rows.push(htr);
      var body = this.$tbody.querySelectorAll('tr.vt-tr');
      for (var i = 0; i < body.length; i++) rows.push(body[i]);
      return rows;
    },

    /** Apply grid roles, aria-sort and roving tabindex after each render. */
    _a11yPaint: function () {
      var self = this, table = this.$table, rows = this._navRows();
      table.setAttribute('role', 'grid');
      table.setAttribute('aria-rowcount', String(this.state.total || rows.length));
      table.setAttribute('aria-colcount', String(this._renderCols().length + this._leadCount()));
      // Name the grid: an explicit label wins, otherwise the generic one, so
      // screen readers never announce an unnamed grid.
      if (this.ariaLabelledby) table.setAttribute('aria-labelledby', this.ariaLabelledby);
      else table.setAttribute('aria-label', this.ariaLabel || this.labels.grid);
      if (this.selection && this.selection.mode !== 'single') table.setAttribute('aria-multiselectable', 'true');
      else table.removeAttribute('aria-multiselectable');
      rows.forEach(function (tr) {
        tr.setAttribute('role', 'row');
        var header = tr.parentNode === self.$thead, cells = tr.children;
        // aria-rowindex counts the header as row 1; the body rows carry their
        // own (absolute, virtualization-aware) index from _rowHtml.
        if (header) tr.setAttribute('aria-rowindex', '1');
        for (var c = 0; c < cells.length; c++) {
          var cell = cells[c];
          cell.setAttribute('role', header ? 'columnheader' : 'gridcell');
          // Columns are counted as rendered (hidden ones are not in the grid),
          // which is the same model aria-colcount above uses.
          cell.setAttribute('aria-colindex', String(c + 1));
          if (header && cell.getAttribute('data-sort')) {
            cell.setAttribute('aria-sort', self.state.sort === cell.getAttribute('data-sort')
              ? (self.state.dir === 'desc' ? 'descending' : 'ascending') : 'none');
          }
          if (!self.keyboard) continue;
          cell.setAttribute('tabindex', '-1');
          // Inner controls out of the Tab order (reachable via grid + Enter),
          // except inputs of a row that is currently in inline-edit mode.
          var editing = cell.classList.contains('vt-editing');
          var ctrls = cellControls(cell);
          for (var k = 0; k < ctrls.length; k++) {
            if (editing && /^(INPUT|SELECT|TEXTAREA)$/.test(ctrls[k].tagName)) ctrls[k].removeAttribute('tabindex');
            else ctrls[k].setAttribute('tabindex', '-1');
          }
        }
      });
      if (!this.keyboard) return;
      var a = this._active;
      a.r = Math.max(0, Math.min(a.r, rows.length - 1));
      var row = rows[a.r];
      if (!row) return;
      a.c = Math.max(0, Math.min(a.c, row.children.length - 1));
      var active = row.children[a.c];
      if (active) {
        active.setAttribute('tabindex', '0');
        if (this._pendingFocus) { active.focus(); this._pendingFocus = false; }
      }
    },

    /** The grid keyboard handler: menus, cell navigation, activation. */
    _onKeydown: function (e) {
      // Inside an open action menu the arrows walk the menu, not the grid.
      var inMenu = e.target.closest ? e.target.closest('.vt-act-menu') : null;
      if (inMenu) {
        if (e.key === 'Escape') {
          e.preventDefault();
          var trg = inMenu.parentNode.querySelector('.vt-act-trigger');
          this._toggleActMenu(trg, false);
          if (trg) trg.focus();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var items = inMenu.querySelectorAll('.vt-act-item');
          var cur = Array.prototype.indexOf.call(items, e.target);
          var next = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          if (items[next]) items[next].focus();
        }
        return;
      }
      if (e.key === 'Escape' && this._cellMode) { e.preventDefault(); this._exitCellMode(); return; }
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // let editors handle keys
      var rows = this._navRows();
      if (!rows.length) return;
      var cell = e.target.closest ? e.target.closest('th,td') : null;
      var cur = this._coordsOf(rows, cell);
      var r = cur ? cur.r : this._active.r;
      var c = cur ? cur.c : this._active.c;
      switch (e.key) {
        case 'ArrowRight': c++; break;
        case 'ArrowLeft': c--; break;
        case 'ArrowDown': r++; break;
        case 'ArrowUp': r--; break;
        case 'Home': c = 0; if (e.ctrlKey || e.metaKey) r = 0; break;
        case 'End': c = 1e9; if (e.ctrlKey || e.metaKey) r = rows.length - 1; break;
        case 'PageDown':
          e.preventDefault();
          if (this.pagination) { this._active = { r: 1, c: c }; this._pendingFocus = true; this.state.page++; this.refresh(); }
          return;
        case 'PageUp':
          e.preventDefault();
          if (this.pagination && this.state.page > 1) { this._active = { r: 1, c: c }; this._pendingFocus = true; this.state.page--; this.refresh(); }
          return;
        case 'Enter': case ' ': case 'Spacebar':
          e.preventDefault(); this._activateCell(cell); return;
        default: return; // not a navigation key
      }
      e.preventDefault();
      this._focusCell(rows, r, c);
    },

    /** The {r,c} position of a cell among the navigable rows, or null. */
    _coordsOf: function (rows, cell) {
      if (!cell) return null;
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].children;
        for (var c = 0; c < cells.length; c++) if (cells[c] === cell) return { r: r, c: c };
      }
      return null;
    },

    /** Move the roving tabindex to a cell and focus it, stepping the virtual window if needed. */
    _focusCell: function (rows, r, c) {
      // The rendered rows are only a window over the data when virtualized:
      // scroll the window on instead of stopping at its edge.
      if (this._virtualOn() && this._range) {
        var h = this._rowH || this.virtual.rowHeight;
        if (r > rows.length - 1 && this._range.end < (this._view || []).length) {
          this.$scroll.scrollTop += h;
          this._onVirtualScroll();
          rows = this._navRows();
          r = rows.length - 1;
        } else if (r < 1 && this._range.start > 0 && this._active.r >= 1) {
          this.$scroll.scrollTop -= h;
          this._onVirtualScroll();
          rows = this._navRows();
          r = 1;
        }
      }
      r = Math.max(0, Math.min(r, rows.length - 1));
      var row = rows[r];
      if (!row) return;
      c = Math.max(0, Math.min(c, row.children.length - 1));
      var old = rows[this._active.r] && rows[this._active.r].children[this._active.c];
      if (old) old.setAttribute('tabindex', '-1');
      this._active = { r: r, c: c };
      var cell = row.children[c];
      cell.setAttribute('tabindex', '0');
      cell.focus();
    },

    /** Enter/Space on a cell: sort header, toggle expander, click a single
     *  control, or (for cells with several controls) enter interaction mode. */
    _activateCell: function (cell) {
      if (!cell) return;
      if (cell.classList.contains('vt-sortable')) { this._pendingFocus = true; cell.click(); return; }
      // An actions cell holds the trigger plus the (hidden) menu items, so it
      // would look like a multi-control cell: open the menu instead.
      var trigger = cell.querySelector('.vt-act-trigger');
      if (trigger) { this._toggleActMenu(trigger); return; }
      var exp = cell.querySelector('[data-expand]');
      if (exp) { this._pendingFocus = true; exp.click(); return; }
      var ctrls = cellControls(cell);
      if (ctrls.length === 1) {
        var only = ctrls[0];
        if (only.tagName === 'A' || only.tagName === 'BUTTON') only.click(); else only.focus();
        return;
      }
      if (ctrls.length > 1) {
        for (var i = 0; i < ctrls.length; i++) ctrls[i].removeAttribute('tabindex'); // make tabbable
        this._cellMode = cell;
        ctrls[0].focus();
      }
    },

    /** Leave cell interaction mode: controls out of Tab order, focus the cell. */
    _exitCellMode: function () {
      var cell = this._cellMode;
      this._cellMode = null;
      if (!cell) return;
      if (!cell.classList.contains('vt-editing')) {
        var ctrls = cellControls(cell);
        for (var i = 0; i < ctrls.length; i++) ctrls[i].setAttribute('tabindex', '-1');
      }
      cell.setAttribute('tabindex', '0');
      cell.focus();
    },

    /* ---- small internals ------------------------------------------- */

    /** Copy text to the clipboard (with a textarea fallback) and report it. */
    _copy: function (text, btn) {
      var self = this;
      /** Flash the "copied" state on the button that was pressed. */
      function done() {
        if (!btn) return;
        var markup = btn.innerHTML, title = btn.getAttribute('title');
        btn.classList.add('vt-copied');
        btn.innerHTML = '&#10003;';
        btn.setAttribute('title', self.labels.copied);
        setTimeout(function () {
          btn.classList.remove('vt-copied');
          btn.innerHTML = markup;
          if (title == null) btn.removeAttribute('title'); else btn.setAttribute('title', title);
        }, 1200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {});
      } else {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done();
      }
      self._emit('copy', { text: text });
    },

    /** Find a row object by its id in the current source. */
    _rowById: function (id) {
      var self = this;
      var pool = this.serverFetch ? (this._view || []) : this.data;
      for (var i = 0; i < pool.length; i++) {
        if (String(getPath(pool[i], this.rowId)) === String(id)) return pool[i];
      }
      return null;
    },
    /** Find a column by its data key. */
    _colByKey: function (key) {
      for (var i = 0; i < this.columns.length; i++) if (this.columns[i].key === key) return this.columns[i];
      return null;
    },
    /** The first column of type actions, if the table has one. */
    _actionsColCfg: function () {
      for (var i = 0; i < this.columns.length; i++) if (this.columns[i].type === 'actions') return this.columns[i];
      return null;
    },
    /** The custom actions declared on the actions column. */
    _actionsColCustom: function () { var c = this._actionsColCfg(); return c && c.custom; }
  };

  /** Escape a value for use inside a CSS attribute selector. */
  function cssEsc(v) { return String(v).replace(/["\\]/g, '\\$&'); }

  /**
   * Ready-made XLSX/PDF export adapter. Returns a function that POSTs the export
   * payload to `url` and downloads the returned file. Point `url` at an endpoint
   * that pipes the JSON to your Go binary (vtexport) and streams the file back —
   * the package itself stays dependency-free.
   *
   *   export: {
   *     formats: ['csv', 'xlsx', 'pdf'],
   *     adapters: {
   *       xlsx: Vantable.serverExport('/service/export'),
   *       pdf:  Vantable.serverExport('/service/export')
   *     }
   *   }
   */
  function serverExport(url, opts) {
    opts = opts || {};
    return function (payload) {
      return fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('[Vantable] export failed: HTTP ' + res.status);
        return res.blob();
      }).then(function (blob) {
        var ext = payload.format === 'pdf' ? '.pdf' : payload.format === 'xlsx' ? '.xlsx' : '.csv';
        var fname = withExt(payload.filename, ext);
        var a = document.createElement('a'), u = URL.createObjectURL(blob);
        a.href = u; a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(u); }, 0);
      });
    };
  }

  /** Make sure a filename carries the given extension (".xlsx" / ".pdf"). */
  function withExt(name, ext) {
    name = name || 'table';
    return name.slice(-ext.length).toLowerCase() === ext ? name : name + ext;
  }

  /**
   * Ready-made XLSX adapter on top of SheetJS (the third-party `xlsx` library),
   * for pages that must build the file in the browser instead of calling the Go
   * binary. SheetJS is NOT bundled — vantable stays zero-dependency — so either
   * pass it in or load it on the page as the `XLSX` global:
   *
   *   adapters: { xlsx: Vantable.sheetJsExport({ lib: XLSX }) }
   *
   * opts: { lib, sheetName }
   */
  function sheetJsExport(opts) {
    opts = opts || {};
    return function (payload) {
      var XLSX = opts.lib || (typeof window !== 'undefined' ? window.XLSX : null);
      if (!XLSX || !XLSX.utils || !isFn(XLSX.writeFile)) {
        throw new Error('[Vantable] SheetJS not found — pass { lib: XLSX } or load xlsx on the page');
      }
      var cols = payload.columns;
      var aoa = [cols.map(function (c) { return c.label; })];
      payload.rows.forEach(function (row) {
        aoa.push(cols.map(function (c) { var v = row[c.key]; return v == null ? '' : v; }));
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, opts.sheetName || 'Sheet1');
      XLSX.writeFile(wb, withExt(payload.filename, '.xlsx'));
    };
  }

  /**
   * Ready-made PDF adapter on top of jsPDF (the third-party `jspdf` library).
   * Uses the `jspdf-autotable` plugin when it is loaded, otherwise writes the
   * rows as plain text lines. jsPDF is NOT bundled — pass the constructor in or
   * load jspdf on the page (`window.jspdf.jsPDF` / `window.jsPDF`):
   *
   *   adapters: { pdf: Vantable.jsPdfExport({ lib: jspdf.jsPDF }) }
   *
   * NOTE: non-Latin text (Cyrillic) requires a Unicode font registered in
   * jsPDF by the host page; the Go binary (tools/vtexport) handles fonts itself.
   * opts: { lib, orientation, unit, format, fontSize, margin }
   */
  function jsPdfExport(opts) {
    opts = opts || {};
    return function (payload) {
      var ctor = opts.lib
        || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
        || (typeof window !== 'undefined' ? window.jsPDF : null);
      if (!isFn(ctor)) {
        throw new Error('[Vantable] jsPDF not found — pass { lib: jsPDF } or load jspdf on the page');
      }
      var cols = payload.columns;
      var head = cols.map(function (c) { return String(c.label == null ? '' : c.label); });
      var body = payload.rows.map(function (row) {
        return cols.map(function (c) { var v = row[c.key]; return v == null ? '' : String(v); });
      });
      var doc = new ctor({
        orientation: opts.orientation || (cols.length > 5 ? 'landscape' : 'portrait'),
        unit: opts.unit || 'mm',
        format: opts.format || 'a4'
      });
      var size = opts.fontSize || 8;
      if (isFn(doc.autoTable)) {
        doc.autoTable({ head: [head], body: body, styles: { fontSize: size }, margin: opts.margin });
      } else {
        var y = 10, lineH = size * 0.5 + 1;
        var pageH = (doc.internal && doc.internal.pageSize && isFn(doc.internal.pageSize.getHeight))
          ? doc.internal.pageSize.getHeight() : 297;
        if (isFn(doc.setFontSize)) doc.setFontSize(size);
        [head].concat(body).forEach(function (r) {
          if (y + lineH > pageH - 10) { doc.addPage(); y = 10; }
          doc.text(r.join('  |  '), 10, y);
          y += lineH;
        });
      }
      doc.save(withExt(payload.filename, '.pdf'));
    };
  }

  Vantable.version = '0.2.0';
  Vantable.css = DEFAULT_CSS;            // the default stylesheet as a string
  Vantable.injectStyles = injectStyles;  // inject defaults manually if needed
  Vantable.serverExport = serverExport;  // ready-made XLSX/PDF adapter (→ your Go binary)
  Vantable.sheetJsExport = sheetJsExport;  // XLSX adapter via third-party SheetJS
  Vantable.jsPdfExport = jsPdfExport;      // PDF adapter via third-party jsPDF
  return Vantable;
});
