# vtexport

A tiny CLI binary that turns a vantable export payload into a real **XLSX** or
**PDF** file. No HTTP server: it reads JSON on **stdin** and writes the file
bytes to **stdout**. Your app pipes data in and streams the file back to the
browser, so the `vantable` JS package stays dependency-free.

```
stdin (JSON)                     stdout (bytes)
{format, filename,   ──►  vtexport  ──►   .xlsx / .pdf
 columns, rows}
```

## Build

```bash
cd tools/vtexport
go mod tidy
go build -o vtexport .                                           # local
GOOS=linux GOARCH=amd64 go build -o vtexport-linux-amd64 .       # for a Linux server
```

Put the binary somewhere your app can exec it (e.g. `/geekproxy/bin/vtexport`).

## Input

```json
{
  "format": "xlsx",              // "xlsx" | "pdf"
  "filename": "users",
  "columns": [{ "key": "id", "label": "ID" }, { "key": "name", "label": "Имя" }],
  "rows": [{ "id": 1, "name": "Алиса" }, { "id": 2, "name": "Боб" }]
}
```

Quick test:

```bash
echo '{"format":"xlsx","columns":[{"key":"id","label":"ID"}],"rows":[{"id":1}]}' \
  | ./vtexport > out.xlsx
```

## What the files look like

**XLSX** (`excelize`): one sheet, bold header row, column widths from the widest
value (clamped to 8..60 chars), header row frozen.

**PDF** (`fpdf`): A4, landscape when there are more than 5 columns. Column widths
are proportional to the widest content of each column (every column keeps a
minimum share), long values **wrap** onto extra lines inside the cell (up to 8
lines per row), and the header row is redrawn on every page.

## PDF fonts (Cyrillic)

PDF uses a Unicode TTF so Cyrillic renders. Font resolution:

1. `$VTEXPORT_FONT` — path to a `.ttf`
2. common DejaVu / Arial-Unicode locations
3. fallback to Helvetica (Latin only) if none is found.

On a typical Linux server install DejaVu (`sudo apt-get install fonts-dejavu`)
or set `VTEXPORT_FONT=/path/to/DejaVuSans.ttf`.

With no Unicode font the core Helvetica font cannot measure or wrap non-Latin
glyphs at all, so in that case the text is first reduced to Latin-1 (`Имя` →
`???`) — a readable Latin PDF instead of a crash. Install a font to get the real
text.

## Tests

```bash
go test ./...            # 34 tests
go test -cover ./...     # 93.1% of statements
```

They cover the XLSX round-trip (read back with excelize: header, Cyrillic,
numbers, missing/dotted keys, the width clamp, the frozen and bold header), PDF
pagination and portrait/landscape page sizes, the column-width distribution and
the cell wrapping, the Latin-1 fallback for a missing Unicode font, the whole
`run()` stdin → stdout path with each refusal, and the compiled binary itself
(exit codes and the `vtexport:` stderr prefix).

The package-level test suite (`npm test` in `vantable/`) additionally runs a full
round-trip: export button → payload → HTTP endpoint → this binary → file bytes.
It needs the binary built first (`npm run build:go`).

## Wiring it to the browser (AdonisJS example)

Add one endpoint that pipes the request body through the binary and streams the
file back. **Protect it** (admin/session) and cap the body size.

```ts
// start/routes.ts
// router.post('/service/export', [ExportController, 'export']).use(middleware.checkRole(['admin','manager']))

import { spawn } from 'node:child_process'
import type { HttpContext } from '@adonisjs/core/http'

const BIN = '/geekproxy/bin/vtexport'

export default class ExportController {
  async export({ request, response }: HttpContext) {
    const payload = request.body() // { format, filename, columns, rows }
    const child = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] })

    const chunks: Buffer[] = []
    let err = ''
    child.stdout.on('data', (c) => chunks.push(c))
    child.stderr.on('data', (c) => (err += c))
    child.stdin.end(JSON.stringify(payload))

    const code: number = await new Promise((res) => child.on('close', res))
    if (code !== 0) return response.internalServerError({ error: err || 'export failed' })

    const isPdf = payload.format === 'pdf'
    const ext = isPdf ? 'pdf' : 'xlsx'
    const mime = isPdf
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    response.header('Content-Type', mime)
    response.header('Content-Disposition', `attachment; filename="${(payload.filename || 'table')}.${ext}"`)
    return response.send(Buffer.concat(chunks))
  }
}
```

Then, on the page, point vantable's export adapters at that endpoint:

```js
new Vantable('#host', {
  columns, data,
  export: {
    formats: ['csv', 'xlsx', 'pdf'],
    filename: 'users',
    adapters: {
      xlsx: Vantable.serverExport('/service/export'),
      pdf:  Vantable.serverExport('/service/export')
    }
  }
});
```

CSV stays fully client-side (no server round-trip); XLSX/PDF go through the binary.
