// Real-engine tests: jsdom reads custom properties but never resolves var(),
// so the colours the confirmation dialog actually paints are measured in
// headless Chrome. Skipped when no Chrome is installed (CHROME_PATH overrides)
// — except under CI, where a missing browser fails: these are the only tests
// that check what the engine paints, so skipping them must not pass as green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The Chrome binary to drive, or null when there is none to drive. */
function findChrome() {
  // An explicit path wins even when it is wrong: a typo has to fail loudly
  // instead of quietly falling back to some other browser.
  if (process.env.CHROME_PATH) {
    return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

const CHROME = findChrome();
// Locally a missing browser skips; in CI it is a failure.
const SKIP = CHROME || process.env.CI ? false : 'no Chrome installed';

const PAGE = `<!doctype html><meta charset="utf-8">
<!-- The page sets tokens of its own: the dialog must follow the TABLE, which
     declares its own tokens on .vt-root and so ignores these. -->
<style>:root { --vt-bg: #654321; --vt-fg: #654321; }</style>
<div id="a"></div><div id="b"></div>
<pre id="out"></pre>
<script src="vantable.js"></script>
<script>
/** Build a table, open its delete dialog and measure what the engine paints. */
function measure(host, opts) {
  const t = new Vantable(host, Object.assign({
    columns: [{ key: 'id', label: 'ID' }, { label: 'Act', type: 'actions', remove: { enabled: true } }],
    data: [{ id: 1 }]
  }, opts));
  t.el.querySelector('[data-act=remove]').click();
  const ov = document.querySelector('.vt-modal-overlay');
  const box = ov.querySelector('.vt-modal');
  const buttons = ov.querySelectorAll('.vt-modal-foot button');
  const font = (el) => getComputedStyle(el).fontSize + ' / ' + getComputedStyle(el).fontFamily.split(',')[0];
  const out = {
    tableToken: getComputedStyle(t.el).getPropertyValue('--vt-bg').trim(),
    dialogBg: getComputedStyle(box).backgroundColor,
    dialogFg: getComputedStyle(box).color,
    dangerFg: getComputedStyle(buttons[1]).color,
    cancelBorder: getComputedStyle(buttons[0]).borderTopColor,
    cancelRadius: getComputedStyle(buttons[0]).borderTopLeftRadius,
    dialogButtonFont: font(buttons[0]),
    tableButtonFont: font(t.el.querySelector('.vt-btn'))
  };
  ov.remove();
  return out;
}
addEventListener('load', () => {
  let data;
  try {
    data = {
      themed: measure('#a', { theme: { bg: '#123456', fg: '#abcdef', danger: '#ff0000', radius: '3px', border: '#00ff00' } }),
      plain: measure('#b', {})
    };
  } catch (e) {
    data = { error: String(e && e.stack || e) };
  }
  document.getElementById('out').textContent = JSON.stringify(data);
});
</script>`;

/** Render the probe page in headless Chrome and return what it measured. */
function runProbe() {
  assert.ok(CHROME, 'no Chrome to drive: install one or set CHROME_PATH (required under CI)');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vantable-browser-'));
  copyFileSync(path.join(ROOT, 'src/vantable.js'), path.join(dir, 'vantable.js'));
  writeFileSync(path.join(dir, 'probe.html'), PAGE);
  const dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=3000', '--dump-dom',
    'file://' + path.join(dir, 'probe.html')
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  assert.ok(m && m[1].trim(), 'the probe page produced no measurements');
  const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  assert.equal(data.error, undefined, `the probe page threw: ${data.error}`);
  return data;
}

test('the dialog paints the theme of the table that opened it', { skip: SKIP }, () => {
  const { themed } = runProbe();
  assert.equal(themed.dialogBg, 'rgb(18, 52, 86)', 'theme.bg reached the dialog');
  assert.equal(themed.dialogFg, 'rgb(171, 205, 239)', 'theme.fg reached the dialog');
  assert.equal(themed.dangerFg, 'rgb(255, 0, 0)', 'theme.danger reached the Delete button');
  assert.equal(themed.cancelBorder, 'rgb(0, 255, 0)', 'theme.border reached the Cancel button');
  assert.equal(themed.cancelRadius, '3px', 'theme.radius reached the buttons');
});

test('the dialog follows the table, not the tokens the page set', { skip: SKIP }, () => {
  const { plain } = runProbe();
  // The embedded sheet writes #fff, the .css file #ffffff — both are white.
  assert.match(plain.tableToken, /^#(fff|ffffff)$/, 'the table ignores the page tokens');
  assert.equal(plain.dialogBg, 'rgb(255, 255, 255)', 'and so does the dialog');
  assert.equal(plain.dialogFg, 'rgb(31, 36, 48)');
});

test('the dialog buttons are set in the same type as the table', { skip: SKIP }, () => {
  const { plain } = runProbe();
  assert.equal(plain.dialogButtonFont, plain.tableButtonFont,
    'the dialog inherited the page font instead of the table typography');
});
