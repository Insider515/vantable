package main

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/xuri/excelize/v2"
)

// testPdf returns a PDF context with a font selected, as the width/wrap helpers
// require (GetStringWidth and SplitText need a current font).
func testPdf() *fpdf.Fpdf {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.AddPage()
	return pdf
}

// TestCellString checks the JSON-value → string conversion used by both writers.
func TestCellString(t *testing.T) {
	cases := []struct {
		in   interface{}
		want string
	}{
		{nil, ""},
		{"текст", "текст"},
		{float64(42), "42"},
		{float64(-7), "-7"},
		{1.5, "1.5"},
		{true, "true"},
		{[]interface{}{1, 2}, "[1 2]"},
	}
	for _, c := range cases {
		if got := cellString(c.in); got != c.want {
			t.Errorf("cellString(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestBuildUnsupportedFormat checks that an unknown format is an error, not a file.
func TestBuildUnsupportedFormat(t *testing.T) {
	_, err := build(&Request{Format: "docx", Columns: []Column{{Key: "a", Label: "A"}}})
	if err == nil {
		t.Fatal("expected an error for format \"docx\"")
	}
	if !strings.Contains(err.Error(), "unsupported format") {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestBuildXLSXRoundTrip writes a workbook and reads it back with excelize:
// header labels, Cyrillic values, integer formatting and the frozen header row.
func TestBuildXLSXRoundTrip(t *testing.T) {
	req := &Request{
		Format:   "xlsx",
		Filename: "users",
		Columns:  []Column{{Key: "id", Label: "ID"}, {Key: "name", Label: "Имя"}},
		Rows: []map[string]interface{}{
			{"id": float64(1), "name": "Пётр"},
			{"id": nil, "name": nil},
			{"id": float64(2), "name": "Ann"},
		},
	}
	out, err := build(req)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open generated xlsx: %v", err)
	}
	defer f.Close()
	sheet := f.GetSheetName(0)
	want := map[string]string{
		"A1": "ID", "B1": "Имя",
		"A2": "1", "B2": "Пётр",
		"A3": "", "B3": "",
		"A4": "2", "B4": "Ann",
	}
	for cell, exp := range want {
		got, err := f.GetCellValue(sheet, cell)
		if err != nil {
			t.Fatalf("read %s: %v", cell, err)
		}
		if got != exp {
			t.Errorf("%s = %q, want %q", cell, got, exp)
		}
	}
	rows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatalf("GetRows: %v", err)
	}
	if len(rows) != 4 {
		t.Errorf("row count = %d, want 4 (header + 3)", len(rows))
	}
}

// TestBuildPDFPaginates checks the PDF is valid and that many rows produce
// several pages (the header is redrawn on each).
func TestBuildPDFPaginates(t *testing.T) {
	rows := make([]map[string]interface{}, 200)
	for i := range rows {
		rows[i] = map[string]interface{}{"id": float64(i), "name": "Пётр Петров"}
	}
	out, err := build(&Request{
		Format:  "pdf",
		Columns: []Column{{Key: "id", Label: "ID"}, {Key: "name", Label: "Имя"}},
		Rows:    rows,
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Fatalf("output is not a PDF: % x", out[:8])
	}
	m := regexp.MustCompile(`/Count (\d+)`).FindSubmatch(out)
	if m == nil {
		t.Fatal("no page count in the PDF")
	}
	pages, _ := strconv.Atoi(string(m[1]))
	if pages < 2 {
		t.Errorf("page count = %d, want >= 2 for 200 rows", pages)
	}
}

// TestBuildPDFEmptyRows checks a header-only export still produces a PDF.
func TestBuildPDFEmptyRows(t *testing.T) {
	out, err := build(&Request{Format: "pdf", Columns: []Column{{Key: "a", Label: "A"}}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Error("output is not a PDF")
	}
}

// TestColWidths checks the widths fill the page, respect the per-column minimum
// and give the column with the widest content more room than a narrow one.
func TestColWidths(t *testing.T) {
	pdf := testPdf()
	req := &Request{
		Columns: []Column{{Key: "id", Label: "ID"}, {Key: "note", Label: "Note"}},
		Rows: []map[string]interface{}{
			{"id": float64(1), "note": strings.Repeat("long text ", 20)},
		},
	}
	usable := 190.0
	w := colWidths(pdf, req, usable)
	sum := 0.0
	for _, v := range w {
		sum += v
	}
	if diff := sum - usable; diff > 0.01 || diff < -0.01 {
		t.Errorf("widths sum = %.3f, want %.3f", sum, usable)
	}
	minW := usable / float64(len(w)) / pdfMinColFac
	for i, v := range w {
		if v < minW-0.01 {
			t.Errorf("column %d width %.3f below minimum %.3f", i, v, minW)
		}
	}
	if w[1] <= w[0] {
		t.Errorf("wide column got %.3f, narrow one %.3f — expected the wide one to be larger", w[1], w[0])
	}
}

// TestColWidthsEmptyContent checks columns with no content get an equal share.
func TestColWidthsEmptyContent(t *testing.T) {
	pdf := testPdf()
	req := &Request{Columns: []Column{{Key: "a"}, {Key: "b"}, {Key: "c"}}}
	w := colWidths(pdf, req, 180)
	for i, v := range w {
		if v <= 0 {
			t.Fatalf("column %d width = %.3f", i, v)
		}
	}
}

// TestWrapRow checks long values are wrapped onto extra lines (not truncated),
// that the row height follows the tallest cell and that the line cap holds.
func TestWrapRow(t *testing.T) {
	pdf := testPdf()
	widths := []float64{20, 40}
	cells := []string{"1", strings.Repeat("long value ", 8)}
	lines, h := wrapRow(pdf, cells, widths)
	if len(lines[0]) != 1 {
		t.Errorf("short cell wrapped into %d lines, want 1", len(lines[0]))
	}
	if len(lines[1]) < 2 {
		t.Errorf("long cell wrapped into %d lines, want >= 2", len(lines[1]))
	}
	if want := float64(len(lines[1])) * pdfLineH; h != want {
		t.Errorf("row height = %.3f, want %.3f", h, want)
	}
	joined := strings.Join(lines[1], "")
	if !strings.Contains(joined, "long") || strings.Contains(joined, "…") {
		t.Errorf("long value was not wrapped intact: %q", joined)
	}
	long, _ := wrapRow(pdf, []string{strings.Repeat("word ", 400)}, []float64{30})
	if len(long[0]) != pdfMaxLines {
		t.Errorf("line cap = %d, want %d", len(long[0]), pdfMaxLines)
	}
}

// TestWrapRowEmptyCell checks an empty value still occupies one line.
func TestWrapRowEmptyCell(t *testing.T) {
	pdf := testPdf()
	lines, h := wrapRow(pdf, []string{""}, []float64{20})
	if len(lines[0]) != 1 || h != pdfLineH {
		t.Errorf("empty cell: %d lines, height %.3f", len(lines[0]), h)
	}
}

// TestPDFFallbackFontCyrillic covers the no-Unicode-font path: with a core font
// fpdf cannot wrap non-Latin text (its width table has 256 entries and SplitText
// indexes it by rune), so the request is reduced to Latin-1 first. Without that
// the binary panics instead of producing a file.
func TestPDFFallbackFontCyrillic(t *testing.T) {
	t.Setenv("VTEXPORT_FONT", "/nonexistent/font.ttf")
	out, err := build(&Request{
		Format:  "pdf",
		Columns: []Column{{Key: "id", Label: "ID"}, {Key: "name", Label: "Имя"}},
		Rows: []map[string]interface{}{
			{"id": float64(1), "name": strings.Repeat("Пётр Петрович ", 10)},
		},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Error("output is not a PDF")
	}
}

// TestPDFUnicodeFontCyrillic covers the normal path: a Unicode TTF is loaded and
// Cyrillic text goes in unchanged. Skipped when the machine has no such font.
func TestPDFUnicodeFontCyrillic(t *testing.T) {
	fp := resolveFont()
	if fp == "" {
		t.Skip("no Unicode TTF on this machine")
	}
	out, err := build(&Request{
		Format:  "pdf",
		Columns: []Column{{Key: "name", Label: "Имя"}},
		Rows:    []map[string]interface{}{{"name": strings.Repeat("Пётр ", 30)}},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Error("output is not a PDF")
	}
}

// TestToLatin1 checks the core-font text reduction.
func TestToLatin1(t *testing.T) {
	cases := map[string]string{
		"abc":      "abc",
		"Имя":      "???",
		"café":     "café",
		"a\u2014b": "a?b",
	}
	for in, want := range cases {
		if got := toLatin1(in); got != want {
			t.Errorf("toLatin1(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestSanitizeRequest checks the copy keeps structure and leaves the original
// request untouched.
func TestSanitizeRequest(t *testing.T) {
	req := &Request{
		Format:  "pdf",
		Columns: []Column{{Key: "name", Label: "Имя"}},
		Rows:    []map[string]interface{}{{"name": "Пётр"}, {"name": float64(3)}},
	}
	out := sanitizeRequest(req)
	if out.Columns[0].Label != "???" {
		t.Errorf("label = %q", out.Columns[0].Label)
	}
	if out.Rows[0]["name"] != "????" {
		t.Errorf("row 0 = %v", out.Rows[0]["name"])
	}
	if out.Rows[1]["name"] != "3" {
		t.Errorf("row 1 = %v", out.Rows[1]["name"])
	}
	if req.Columns[0].Label != "Имя" || req.Rows[0]["name"] != "Пётр" {
		t.Error("the original request was mutated")
	}
}

// ---------------------------------------------------------------- run() / CLI

// failWriter refuses every write, to exercise the stdout error path.
type failWriter struct{}

// Write always fails.
func (failWriter) Write(p []byte) (int, error) { return 0, errors.New("disk full") }

// TestRunXLSX checks the whole stdin → stdout path for a valid xlsx request.
func TestRunXLSX(t *testing.T) {
	in := strings.NewReader(`{"format":"xlsx","filename":"users","columns":[{"key":"id","label":"ID"}],"rows":[{"id":1}]}`)
	var out bytes.Buffer
	if err := run(in, &out); err != nil {
		t.Fatalf("run: %v", err)
	}
	if got := out.Bytes(); len(got) < 2 || got[0] != 'P' || got[1] != 'K' {
		t.Errorf("not a zip container: % x", out.Bytes()[:min(8, out.Len())])
	}
}

// TestRunPDF checks the same path for a pdf request.
func TestRunPDF(t *testing.T) {
	in := strings.NewReader(`{"format":"pdf","columns":[{"key":"a","label":"A"}],"rows":[{"a":"x"}]}`)
	var out bytes.Buffer
	if err := run(in, &out); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !bytes.HasPrefix(out.Bytes(), []byte("%PDF")) {
		t.Error("not a PDF")
	}
}

// TestRunErrors checks every refusal of the stdin → stdout path.
func TestRunErrors(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"broken json", `{nope}`, "parse json"},
		{"no columns", `{"format":"xlsx","columns":[],"rows":[]}`, "no columns"},
		{"missing columns key", `{"format":"xlsx"}`, "no columns"},
		{"unknown format", `{"format":"rtf","columns":[{"key":"a"}]}`, "unsupported format"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var out bytes.Buffer
			err := run(strings.NewReader(c.in), &out)
			if err == nil {
				t.Fatalf("expected an error, got %d bytes", out.Len())
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error %q does not mention %q", err, c.want)
			}
			if out.Len() != 0 {
				t.Errorf("wrote %d bytes despite the error", out.Len())
			}
		})
	}
}

// TestRunWriteFailure checks a failing stdout is reported, not ignored.
func TestRunWriteFailure(t *testing.T) {
	in := strings.NewReader(`{"format":"xlsx","columns":[{"key":"a","label":"A"}],"rows":[]}`)
	err := run(in, failWriter{})
	if err == nil || !strings.Contains(err.Error(), "write stdout") {
		t.Fatalf("got %v, want a write stdout error", err)
	}
}

// TestRunReadFailure checks a failing stdin is reported.
func TestRunReadFailure(t *testing.T) {
	err := run(failReader{}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "read stdin") {
		t.Fatalf("got %v, want a read stdin error", err)
	}
}

// failReader refuses every read, to exercise the stdin error path.
type failReader struct{}

// Read always fails.
func (failReader) Read(p []byte) (int, error) { return 0, errors.New("broken pipe") }

// ---------------------------------------------------------------- XLSX detail

// TestXLSXColumnWidthsAndFreeze checks widths follow the content within the
// documented 8..60 clamp and that the header row is frozen.
func TestXLSXColumnWidthsAndFreeze(t *testing.T) {
	long := strings.Repeat("x", 200)
	out, err := build(&Request{
		Format:  "xlsx",
		Columns: []Column{{Key: "id", Label: "ID"}, {Key: "long", Label: "Long"}},
		Rows:    []map[string]interface{}{{"id": float64(1), "long": long}},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	sheet := f.GetSheetName(0)
	wID, err := f.GetColWidth(sheet, "A")
	if err != nil {
		t.Fatalf("GetColWidth A: %v", err)
	}
	wLong, err := f.GetColWidth(sheet, "B")
	if err != nil {
		t.Fatalf("GetColWidth B: %v", err)
	}
	if wID != 8 {
		t.Errorf("narrow column width = %.1f, want the 8 minimum", wID)
	}
	if wLong != 60 {
		t.Errorf("wide column width = %.1f, want the 60 maximum", wLong)
	}
	panes, err := f.GetPanes(sheet)
	if err != nil {
		t.Fatalf("GetPanes: %v", err)
	}
	if !panes.Freeze || panes.YSplit != 1 {
		t.Errorf("panes = %+v, want a frozen first row", panes)
	}
}

// TestXLSXHeaderIsBold checks the header row carries the bold style.
func TestXLSXHeaderIsBold(t *testing.T) {
	out, err := build(&Request{
		Format:  "xlsx",
		Columns: []Column{{Key: "a", Label: "A"}},
		Rows:    []map[string]interface{}{{"a": "x"}},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	sheet := f.GetSheetName(0)
	idx, err := f.GetCellStyle(sheet, "A1")
	if err != nil {
		t.Fatalf("GetCellStyle: %v", err)
	}
	style, err := f.GetStyle(idx)
	if err != nil {
		t.Fatalf("GetStyle: %v", err)
	}
	if style.Font == nil || !style.Font.Bold {
		t.Errorf("header style = %+v, want bold", style.Font)
	}
	bodyIdx, err := f.GetCellStyle(sheet, "A2")
	if err != nil {
		t.Fatalf("GetCellStyle body: %v", err)
	}
	if bodyIdx == idx {
		t.Error("body cells share the header style")
	}
}

// TestXLSXMissingAndDottedKeys checks a column whose key is absent from a row
// yields an empty cell, and that a dotted key is used literally (the payload
// from the JS side is already flattened).
func TestXLSXMissingAndDottedKeys(t *testing.T) {
	out, err := build(&Request{
		Format:  "xlsx",
		Columns: []Column{{Key: "a.b", Label: "A.B"}, {Key: "gone", Label: "Gone"}},
		Rows:    []map[string]interface{}{{"a.b": "nested"}},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	sheet := f.GetSheetName(0)
	if v, _ := f.GetCellValue(sheet, "A2"); v != "nested" {
		t.Errorf("A2 = %q, want \"nested\"", v)
	}
	if v, _ := f.GetCellValue(sheet, "B2"); v != "" {
		t.Errorf("B2 = %q, want empty", v)
	}
}

// TestXLSXHeaderOnly checks a request with no rows still yields a header.
func TestXLSXHeaderOnly(t *testing.T) {
	out, err := build(&Request{Format: "excel", Columns: []Column{{Key: "a", Label: "A"}}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil {
		t.Fatalf("GetRows: %v", err)
	}
	if len(rows) != 1 || rows[0][0] != "A" {
		t.Errorf("rows = %v, want just the header", rows)
	}
}

// ---------------------------------------------------------------- PDF detail

// mediaBox pulls the first /MediaBox from a PDF, as [width height] in points.
func mediaBox(t *testing.T, pdf []byte) (float64, float64) {
	t.Helper()
	m := regexp.MustCompile(`/MediaBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]`).FindSubmatch(pdf)
	if m == nil {
		t.Fatal("no /MediaBox in the PDF")
	}
	w, _ := strconv.ParseFloat(string(m[3]), 64)
	h, _ := strconv.ParseFloat(string(m[4]), 64)
	return w, h
}

// TestPDFOrientation checks narrow tables stay portrait and wide ones (more
// than five columns) switch to landscape.
func TestPDFOrientation(t *testing.T) {
	narrow, err := build(&Request{Format: "pdf", Columns: []Column{{Key: "a", Label: "A"}}, Rows: nil})
	if err != nil {
		t.Fatalf("build narrow: %v", err)
	}
	w, h := mediaBox(t, narrow)
	if w >= h {
		t.Errorf("narrow table page is %.0fx%.0f, want portrait", w, h)
	}
	cols := make([]Column, 6)
	for i := range cols {
		cols[i] = Column{Key: string(rune('a' + i)), Label: "C"}
	}
	wide, err := build(&Request{Format: "pdf", Columns: cols})
	if err != nil {
		t.Fatalf("build wide: %v", err)
	}
	w2, h2 := mediaBox(t, wide)
	if w2 <= h2 {
		t.Errorf("wide table page is %.0fx%.0f, want landscape", w2, h2)
	}
}

// TestColWidthsManyColumns checks the minimum share holds with many columns and
// that the widths still add up to the usable width.
func TestColWidthsManyColumns(t *testing.T) {
	pdf := testPdf()
	cols := make([]Column, 20)
	row := map[string]interface{}{}
	for i := range cols {
		key := "c" + strconv.Itoa(i)
		cols[i] = Column{Key: key, Label: key}
		if i == 0 {
			row[key] = strings.Repeat("wide ", 40)
		} else {
			row[key] = "x"
		}
	}
	usable := 277.0 // A4 landscape minus margins
	w := colWidths(pdf, &Request{Columns: cols, Rows: []map[string]interface{}{row}}, usable)
	sum := 0.0
	minW := usable / float64(len(cols)) / pdfMinColFac
	for i, v := range w {
		if v < minW-0.01 {
			t.Errorf("column %d = %.3f, below the %.3f minimum", i, v, minW)
		}
		sum += v
	}
	if diff := sum - usable; diff > 0.05 || diff < -0.05 {
		t.Errorf("sum = %.3f, want %.3f", sum, usable)
	}
}

// TestSanitizeRequestMissingKey checks a column with no value in the row still
// gets an entry in the sanitized copy.
func TestSanitizeRequestMissingKey(t *testing.T) {
	out := sanitizeRequest(&Request{
		Columns: []Column{{Key: "a", Label: "A"}, {Key: "b", Label: "B"}},
		Rows:    []map[string]interface{}{{"a": "x"}},
	})
	if v, ok := out.Rows[0]["b"]; !ok || v != "" {
		t.Errorf("missing key became %v (present: %v), want an empty string", v, ok)
	}
}

// TestResolveFontEnv checks $VTEXPORT_FONT wins over the scanned locations.
func TestResolveFontEnv(t *testing.T) {
	t.Setenv("VTEXPORT_FONT", "/some/where/My.ttf")
	if got := resolveFont(); got != "/some/where/My.ttf" {
		t.Errorf("resolveFont() = %q, want the env value", got)
	}
	t.Setenv("VTEXPORT_FONT", "")
	got := resolveFont()
	if got != "" {
		if _, err := os.Stat(got); err != nil {
			t.Errorf("resolveFont() returned %q, which does not exist", got)
		}
	}
}

// TestCellStringNumbers checks number formatting of the JSON float64 values.
func TestCellStringNumbers(t *testing.T) {
	cases := map[string]interface{}{
		"0":                float64(0),
		"1000000":          float64(1e6),
		"-0.25":            -0.25,
		"9007199254740992": float64(1 << 53),
		"0.0000001":        0.0000001,
	}
	for want, in := range cases {
		if got := cellString(in); got != want {
			t.Errorf("cellString(%v) = %q, want %q", in, got, want)
		}
	}
}

// ---------------------------------------------------------------- the binary

// TestCLIBinary runs the compiled binary the way the host app does (pipe JSON
// in, read the file out), covering main()/fail(): exit codes and stderr.
// Skipped when the binary has not been built yet.
func TestCLIBinary(t *testing.T) {
	bin := "./vtexport"
	if _, err := os.Stat(bin); err != nil {
		t.Skip("binary not built; run: go build -o vtexport .")
	}

	t.Run("xlsx on stdout", func(t *testing.T) {
		cmd := exec.Command(bin)
		cmd.Stdin = strings.NewReader(`{"format":"xlsx","columns":[{"key":"id","label":"ID"}],"rows":[{"id":1}]}`)
		var out, errBuf bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &errBuf
		if err := cmd.Run(); err != nil {
			t.Fatalf("run: %v (stderr: %s)", err, errBuf.String())
		}
		if !bytes.HasPrefix(out.Bytes(), []byte("PK")) {
			t.Error("stdout is not a zip container")
		}
		if errBuf.Len() != 0 {
			t.Errorf("unexpected stderr: %s", errBuf.String())
		}
	})

	t.Run("bad input exits 1 with a prefixed message", func(t *testing.T) {
		cmd := exec.Command(bin)
		cmd.Stdin = strings.NewReader(`{"format":"rtf","columns":[{"key":"a"}]}`)
		var out, errBuf bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &errBuf
		err := cmd.Run()
		var ee *exec.ExitError
		if !errors.As(err, &ee) || ee.ExitCode() != 1 {
			t.Fatalf("got %v, want exit status 1", err)
		}
		if !strings.HasPrefix(errBuf.String(), "vtexport: ") {
			t.Errorf("stderr = %q, want the vtexport: prefix", errBuf.String())
		}
		if out.Len() != 0 {
			t.Errorf("wrote %d bytes to stdout on failure", out.Len())
		}
	})
}
