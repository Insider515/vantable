// vtexport — a small CLI binary for the vantable package.
//
// It reads an export request as JSON on STDIN and writes the finished file
// (XLSX or PDF) to STDOUT. No HTTP server: your app pipes data in and gets
// bytes out (e.g. Node child_process / Adonis exec).
//
//	echo '{"format":"xlsx","filename":"users","columns":[{"key":"id","label":"ID"}],"rows":[{"id":1}]}' \
//	  | vtexport > users.xlsx
//
// PDF uses a Unicode TTF so Cyrillic renders correctly. Font resolution order:
//  1. $VTEXPORT_FONT (path to a .ttf)
//  2. a few common DejaVu / Arial Unicode locations
//  3. fallback to Helvetica (Latin only) if none is found.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-pdf/fpdf"
	"github.com/xuri/excelize/v2"
)

type Column struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type Request struct {
	Format   string                   `json:"format"`
	Filename string                   `json:"filename"`
	Columns  []Column                 `json:"columns"`
	Rows     []map[string]interface{} `json:"rows"`
}

func main() {
	if err := run(os.Stdin, os.Stdout); err != nil {
		fail("%v", err)
	}
}

// run reads one export request from `in`, builds the file and writes its bytes
// to `out`. Split out of main() so the whole stdin → stdout path is testable.
func run(in io.Reader, out io.Writer) error {
	data, err := io.ReadAll(in)
	if err != nil {
		return fmt.Errorf("read stdin: %w", err)
	}
	var req Request
	if err := json.Unmarshal(data, &req); err != nil {
		return fmt.Errorf("parse json: %w", err)
	}
	if len(req.Columns) == 0 {
		return errors.New("no columns")
	}
	file, err := build(&req)
	if err != nil {
		return err
	}
	if _, err := out.Write(file); err != nil {
		return fmt.Errorf("write stdout: %w", err)
	}
	return nil
}

// build turns a parsed request into file bytes, picking the generator by format.
// Kept separate from main() so it can be unit-tested without a process.
func build(req *Request) ([]byte, error) {
	var out []byte
	var err error
	switch req.Format {
	case "xlsx", "excel":
		out, err = buildXLSX(req)
	case "pdf":
		out, err = buildPDF(req)
	default:
		return nil, fmt.Errorf("unsupported format %q (use xlsx or pdf)", req.Format)
	}
	if err != nil {
		return nil, fmt.Errorf("build %s: %w", req.Format, err)
	}
	return out, nil
}

func fail(format string, a ...interface{}) {
	fmt.Fprintf(os.Stderr, "vtexport: "+format+"\n", a...)
	os.Exit(1)
}

// cellString renders any JSON value as a flat string (JSON numbers are float64;
// integers are printed without a decimal point).
func cellString(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		return fmt.Sprintf("%v", t)
	}
}

// ---------------------------------------------------------------- XLSX

func buildXLSX(req *Request) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()
	sheet := f.GetSheetName(0)

	// Header row.
	widths := make([]float64, len(req.Columns))
	for i, c := range req.Columns {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		if err := f.SetCellStr(sheet, cell, c.Label); err != nil {
			return nil, err
		}
		widths[i] = float64(len([]rune(c.Label)))
	}
	if style, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}}); err == nil {
		first, _ := excelize.CoordinatesToCellName(1, 1)
		last, _ := excelize.CoordinatesToCellName(len(req.Columns), 1)
		f.SetCellStyle(sheet, first, last, style)
	}

	// Data rows.
	for r, row := range req.Rows {
		for i, c := range req.Columns {
			cell, _ := excelize.CoordinatesToCellName(i+1, r+2)
			s := cellString(row[c.Key])
			if err := f.SetCellStr(sheet, cell, s); err != nil {
				return nil, err
			}
			if l := float64(len([]rune(s))); l > widths[i] {
				widths[i] = l
			}
		}
	}

	// Column widths (clamped) + freeze the header row.
	for i, w := range widths {
		col, _ := excelize.ColumnNumberToName(i + 1)
		cw := w + 2
		if cw < 8 {
			cw = 8
		} else if cw > 60 {
			cw = 60
		}
		f.SetColWidth(sheet, col, col, cw)
	}
	f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ---------------------------------------------------------------- PDF

// toLatin1 replaces every rune a core PDF font cannot represent with '?'.
// Core fonts (Helvetica & co) carry a 256-entry width table, so any rune above
// U+00FF has no width and cannot be rendered or wrapped against it.
func toLatin1(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r < 0x100 {
			b.WriteRune(r)
		} else {
			b.WriteByte('?')
		}
	}
	return b.String()
}

// sanitizeRequest returns a copy of req with all text reduced to Latin-1, for
// the case where no Unicode TTF was found and a core font is used: fpdf's
// SplitText indexes the font width table by rune, which panics on e.g.
// Cyrillic. Called only on that fallback path; with a TTF the text is untouched.
func sanitizeRequest(req *Request) *Request {
	out := &Request{Format: req.Format, Filename: req.Filename}
	out.Columns = make([]Column, len(req.Columns))
	for i, c := range req.Columns {
		out.Columns[i] = Column{Key: c.Key, Label: toLatin1(c.Label)}
	}
	out.Rows = make([]map[string]interface{}, len(req.Rows))
	for i, row := range req.Rows {
		nr := make(map[string]interface{}, len(req.Columns))
		for _, c := range req.Columns {
			nr[c.Key] = toLatin1(cellString(row[c.Key]))
		}
		out.Rows[i] = nr
	}
	return out
}

func resolveFont() string {
	if p := os.Getenv("VTEXPORT_FONT"); p != "" {
		return p
	}
	for _, p := range []string{
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/TTF/DejaVuSans.ttf",
		"/Library/Fonts/Arial Unicode.ttf",
		"/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

const (
	cellPad      = 1.5 // mm of padding inside a PDF cell
	pdfLineH     = 4.5 // mm per text line
	pdfMaxLines  = 8   // hard cap on wrapped lines per row (keeps rows sane)
	pdfMinColFac = 3   // a column is never thinner than (equal share / this)
)

// colWidths spreads the usable page width over the columns in proportion to the
// widest content of each column (header included), so a long "name" column gets
// more room than a short "id" one. Every column keeps a minimum width: columns
// that need less give the surplus back to the wider ones.
func colWidths(pdf *fpdf.Fpdf, req *Request, usable float64) []float64 {
	n := len(req.Columns)
	w := make([]float64, n)
	total := 0.0
	for i, c := range req.Columns {
		max := pdf.GetStringWidth(c.Label)
		for _, row := range req.Rows {
			if s := pdf.GetStringWidth(cellString(row[c.Key])); s > max {
				max = s
			}
		}
		w[i] = max + cellPad*2
		total += w[i]
	}
	equal := usable / float64(n)
	if total <= 0 {
		for i := range w {
			w[i] = equal
		}
		return w
	}
	for i := range w {
		w[i] = w[i] / total * usable
	}
	minW := equal / pdfMinColFac
	deficit, over := 0.0, 0.0
	for i := range w {
		if w[i] < minW {
			deficit += minW - w[i]
			w[i] = minW
		} else {
			over += w[i] - minW
		}
	}
	if deficit > 0 && over > 0 {
		for i := range w {
			if w[i] > minW {
				w[i] -= (w[i] - minW) / over * deficit
			}
		}
	}
	return w
}

// wrapRow wraps each cell to its column width and reports the row height, so
// long values are carried onto extra lines instead of being cut off.
func wrapRow(pdf *fpdf.Fpdf, cells []string, widths []float64) ([][]string, float64) {
	lines := make([][]string, len(cells))
	maxLines := 1
	for i, s := range cells {
		ls := pdf.SplitText(s, widths[i]-cellPad*2)
		if len(ls) == 0 {
			ls = []string{""}
		}
		if len(ls) > pdfMaxLines {
			ls = ls[:pdfMaxLines]
		}
		lines[i] = ls
		if len(ls) > maxLines {
			maxLines = len(ls)
		}
	}
	return lines, float64(maxLines) * pdfLineH
}

func buildPDF(req *Request) ([]byte, error) {
	orientation := "P"
	if len(req.Columns) > 5 {
		orientation = "L"
	}
	pdf := fpdf.New(orientation, "mm", "A4", "")

	// Load a Unicode TTF (needed for Cyrillic). fpdf mangles absolute paths, so
	// we set the directory and pass the base filename — and only if the file is
	// actually readable, otherwise fall back to Helvetica (Latin only).
	font := "Helvetica"
	if fp := resolveFont(); fp != "" {
		if _, err := os.ReadFile(fp); err == nil {
			pdf.SetFontLocation(filepath.Dir(fp))
			pdf.AddUTF8Font("body", "", filepath.Base(fp))
			font = "body"
		}
	}
	if font == "Helvetica" {
		// No Unicode font available: drop to Latin-1 text so measuring and
		// wrapping stay inside the core font's width table.
		req = sanitizeRequest(req)
	}
	pdf.SetFont(font, "", 8)
	pdf.SetAutoPageBreak(false, 10)

	pageW, pageH := pdf.GetPageSize()
	lm, _, rm, bm := pdf.GetMargins()
	usable := pageW - lm - rm
	widths := colWidths(pdf, req, usable)

	// Draw one pre-wrapped row: a border box per cell, then its lines inside.
	draw := func(lines [][]string, h float64, fill bool) {
		x, y := lm, pdf.GetY()
		style := "D"
		if fill {
			style = "FD"
		}
		for i := range lines {
			pdf.Rect(x, y, widths[i], h, style)
			for j, ln := range lines[i] {
				pdf.SetXY(x+cellPad, y+float64(j)*pdfLineH)
				pdf.CellFormat(widths[i]-cellPad*2, pdfLineH, ln, "", 0, "L", false, 0, "")
			}
			x += widths[i]
		}
		pdf.SetXY(lm, y+h)
	}

	header := make([]string, len(req.Columns))
	for i, c := range req.Columns {
		header[i] = c.Label
	}
	headLines, headH := wrapRow(pdf, header, widths)
	drawHeader := func() {
		pdf.SetFillColor(230, 232, 238)
		pdf.SetTextColor(40, 44, 60)
		draw(headLines, headH, true)
		pdf.SetTextColor(20, 20, 20)
	}

	pdf.AddPage()
	drawHeader()
	cells := make([]string, len(req.Columns))
	for _, row := range req.Rows {
		for i, c := range req.Columns {
			cells[i] = cellString(row[c.Key])
		}
		lines, h := wrapRow(pdf, cells, widths)
		if pdf.GetY()+h > pageH-bm {
			pdf.AddPage()
			drawHeader()
		}
		draw(lines, h, false)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
