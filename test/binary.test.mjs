// End-to-end export tests: the toolbar button → the payload → an HTTP endpoint
// → the Go binary (tools/vtexport) → the downloaded file bytes.
// Skipped when the binary has not been built (see tools/vtexport/README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setupDom, loadVantable, blobBytes } from './helpers/dom.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'vtexport', 'vtexport');
const skip = existsSync(BIN) ? false : 'tools/vtexport/vtexport is not built';

const COLUMNS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Имя' }];
const DATA = [{ id: 1, name: 'Пётр' }, { id: 2, name: 'Ann, Jr' }];

/** Run the export binary over a payload and resolve with the produced bytes. */
function runBinary(payload) {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`vtexport exited ${code}: ${Buffer.concat(err)}`));
      resolve(Buffer.concat(out));
    });
    p.stdin.end(JSON.stringify(payload));
  });
}

/**
 * Start the export endpoint the README documents for AdonisJS: it takes the
 * payload as JSON and streams back whatever the binary produced.
 */
async function startEndpoint() {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const file = await runBinary(payload);
        res.writeHead(200, {
          'Content-Type': payload.format === 'pdf' ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Length': file.length
        });
        res.end(file);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e && e.message));
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('the binary turns a table payload into a real xlsx', { skip }, async () => {
  const env = setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', { columns: COLUMNS, data: DATA, exportName: 'users' });
  const file = await runBinary(t._buildPayload('xlsx'));
  assert.ok(file.length > 0, 'bytes produced');
  assert.deepEqual([...file.subarray(0, 2)], [0x50, 0x4b], 'xlsx is a ZIP container (PK)');
  assert.ok(env.dom);
});

test('the binary turns a table payload into a real pdf', { skip }, async () => {
  setupDom();
  const Vantable = loadVantable();
  const t = new Vantable('#host', { columns: COLUMNS, data: DATA, exportName: 'users' });
  const file = await runBinary(t._buildPayload('pdf'));
  assert.ok(file.subarray(0, 4).toString('latin1') === '%PDF', 'pdf magic bytes');
});

test('the binary rejects an unknown format', { skip }, async () => {
  await assert.rejects(() => runBinary({ format: 'docx', columns: [{ key: 'a', label: 'A' }], rows: [] }),
    /unsupported format/);
});

test('button → serverExport → endpoint → binary → downloaded file', { skip }, async () => {
  const { server, base } = await startEndpoint();
  const env = setupDom();
  const Vantable = loadVantable();
  const realFetch = globalThis.fetch;
  // serverExport posts to a relative URL; point it at the test endpoint.
  globalThis.fetch = (url, init) => realFetch(base + url, init);
  try {
    const t = new Vantable('#host', {
      columns: COLUMNS,
      data: DATA,
      export: {
        formats: ['csv', 'xlsx', 'pdf'],
        filename: 'users',
        adapters: {
          xlsx: Vantable.serverExport('/service/export'),
          pdf: Vantable.serverExport('/service/export')
        }
      }
    });
    const done = new Promise((resolve) => t.on('export', resolve));
    t.el.querySelector('.vt-export[data-format="xlsx"]').click();
    assert.deepEqual(await done, { format: 'xlsx' });
    assert.equal(env.clicks.at(-1).download, 'users.xlsx');
    const xlsx = await blobBytes(env.blobs.at(-1));
    assert.deepEqual([...xlsx.subarray(0, 2)], [0x50, 0x4b], 'a real xlsx came back');

    const donePdf = new Promise((resolve) => t.on('export', resolve));
    t.el.querySelector('.vt-export[data-format="pdf"]').click();
    await donePdf;
    assert.equal(env.clicks.at(-1).download, 'users.pdf');
    const pdf = await blobBytes(env.blobs.at(-1));
    assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF', 'a real pdf came back');
    await new Promise((r) => setTimeout(r, 0));  // anchor cleanup inside this test
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
});
