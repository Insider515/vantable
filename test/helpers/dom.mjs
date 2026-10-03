// Test harness: vantable talks to the browser globals `document`, `Blob` and
// `URL`, so they must exist before an instance is created. jsdom provides them;
// object URLs and anchor clicks are stubbed so a "download" can be asserted.
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

/**
 * Publish a fresh jsdom document as the process globals and return handles to
 * the recorded downloads: `blobs` (every Blob handed to URL.createObjectURL)
 * and `clicks` ({ download, href } per anchor click).
 */
export function setupDom(html) {
  const dom = new JSDOM(html || '<!doctype html><html><body><div id="host"></div></body></html>');
  const w = dom.window;
  const blobs = [];
  const clicks = [];
  w.URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:vt-test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    clicks.push({ download: this.download, href: this.getAttribute('href') });
  };
  globalThis.window = w;
  globalThis.document = w.document;
  // Node's own Blob is kept (it can be read back with .text() in assertions);
  // vantable only hands the Blob to the stubbed URL.createObjectURL.
  globalThis.URL = w.URL;
  globalThis.HTMLElement = w.HTMLElement;
  globalThis.KeyboardEvent = w.KeyboardEvent;
  return { dom, window: w, blobs, clicks };
}

/** Load the library under test (the UMD build is a CommonJS module in Node). */
export function loadVantable() {
  const require = createRequire(import.meta.url);
  return require('../../src/vantable.js');
}

/**
 * Read a recorded Blob as raw bytes decoded as UTF-8. Blob.text() would strip a
 * leading BOM, and the BOM is exactly what the CSV export has to carry (Excel
 * needs it), so the bytes are decoded here instead.
 */
export async function blobBytes(blob) {
  return Buffer.from(await blob.arrayBuffer());
}
