/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/rs/zerolog"
)

// ---------------------------------------------------------------------------
// Go-specific tests for the logging helpers and Shape re-export. These mirror
// the TS-only tests in ts/test/util.test.ts (`getdlog`, `showChanges`,
// `prettyPino`, `entity output feeds Shape.build`).
// ---------------------------------------------------------------------------

// captureLog is a Log implementation that records every entry passed to any
// level method, so tests can assert on the arguments ShowChanges emits.
type captureLog struct {
	mu    sync.Mutex
	calls []map[string]any
}

func (c *captureLog) record(args []any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, a := range args {
		if m, ok := a.(map[string]any); ok {
			c.calls = append(c.calls, m)
		}
	}
}

func (c *captureLog) Trace(args ...any) { c.record(args) }
func (c *captureLog) Debug(args ...any) { c.record(args) }
func (c *captureLog) Info(args ...any)  { c.record(args) }
func (c *captureLog) Warn(args ...any)  { c.record(args) }
func (c *captureLog) Error(args ...any) { c.record(args) }
func (c *captureLog) Fatal(args ...any) { c.record(args) }

func TestGetdlog(t *testing.T) {
	// Reset the process-global accumulator so parallel/reorder-safe.
	dlogMu.Lock()
	dlogEntries = nil
	dlogMu.Unlock()

	dlog := Getdlog("rev", "/some/where/file.ts")
	dlog.Emit("phase", "start")
	dlog.Emit("phase", "done")

	all := Getdlog("rev", "").Log()
	if len(all) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(all))
	}
	if all[0][1] != "file.ts" {
		t.Errorf("expected file basename 'file.ts', got %v", all[0][1])
	}

	// Filter by any file with the same basename.
	if got := len(Getdlog("rev", "").Log("/any/dir/file.ts")); got != 2 {
		t.Errorf("expected 2 filtered entries, got %d", got)
	}
	if got := len(Getdlog("rev", "").Log("nope.ts")); got != 0 {
		t.Errorf("expected 0 filtered entries, got %d", got)
	}

	// No-argument form exercises the tag/file fallbacks ("-").
	d2 := Getdlog("", "")
	if d2.Tag != "-" || d2.File != "-" {
		t.Errorf("Getdlog(\"\",\"\") tag/file = %q/%q, want -/-", d2.Tag, d2.File)
	}
	d2.Emit("x")
	if got := len(Getdlog("-", "").Log()); got < 1 {
		t.Errorf("expected at least 1 default-tag entry, got %d", got)
	}
}

func TestGetdlogSkipsShortEntries(t *testing.T) {
	// White-box: a synthetic entry shorter than 2 elements is filtered out by
	// DLog.Log's len(e) < 2 guard.
	dlogMu.Lock()
	dlogEntries = [][]any{{"only-one"}, {"skip", "file.ts", int64(0)}}
	dlogMu.Unlock()
	if got := len(Getdlog("skip", "").Log()); got != 1 {
		t.Errorf("expected 1 entry after skipping short one, got %d", got)
	}
	dlogMu.Lock()
	dlogEntries = nil
	dlogMu.Unlock()
}

func TestShowChanges(t *testing.T) {
	log := &captureLog{}
	ShowChanges(log, "pt", ChangesResult{Files: ChangesFiles{
		Merged:     []string{"/a/b.txt"},
		Conflicted: []string{"/a/c.txt"},
	}}, "/a")
	if len(log.calls) != 2 {
		t.Fatalf("expected 2 log entries, got %d", len(log.calls))
	}
	if log.calls[0]["merge"] != true {
		t.Errorf("first entry should have merge=true: %v", log.calls[0])
	}
	if log.calls[1]["conflict"] != true {
		t.Errorf("second entry should have conflict=true: %v", log.calls[1])
	}
	// note strips the cwd prefix (which is normalised to end with a separator).
	if got, want := log.calls[0]["note"], "merged: b.txt"; got != want {
		t.Errorf("note = %v, want %q", got, want)
	}
	if got, want := log.calls[1]["note"], "** CONFLICT: c.txt"; got != want {
		t.Errorf("note = %v, want %q", got, want)
	}

	// A cwd already ending in a path separator is used as-is.
	log2 := &captureLog{}
	sep := string(filepath.Separator)
	ShowChanges(log2, "pt", ChangesResult{Files: ChangesFiles{
		Merged: []string{sep + "a" + sep + "d.txt"},
	}}, sep+"a"+sep)
	if len(log2.calls) != 1 {
		t.Fatalf("expected 1 entry with pre-separator cwd, got %d", len(log2.calls))
	}

	// Default cwd branch (empty cwd → os.Getwd), no files → no entries.
	log3 := &captureLog{}
	ShowChanges(log3, "pt", ChangesResult{}, "")
	if len(log3.calls) != 0 {
		t.Errorf("expected no entries for empty result, got %d", len(log3.calls))
	}
}

func TestPrettyPinoReturnsProvidedLogger(t *testing.T) {
	// A provided logger is returned unchanged (mirrors TS `opts.pino` short-circuit).
	fake := &captureLog{}
	got := PrettyPino("x", PrettyPinoOpts{Pino: fake})
	if got != Log(fake) {
		t.Errorf("PrettyPino did not return the provided logger unchanged")
	}
}

func TestPrettyPinoLevelSelection(t *testing.T) {
	// Every level-selection branch produces a working Log. The zerolog
	// ConsoleWriter defaults to os.Stdout, but the returned Log is exercised
	// only via a non-emitting method call to avoid corrupting test output.
	for _, opts := range []PrettyPinoOpts{
		{Debug: true},          // -> "debug"
		{Level: "warn"},        // -> "warn"
		{},                     // -> "info" (default)
		{Level: "not-a-level"}, // -> "info" (parse failure fallback)
	} {
		log := PrettyPino("svc", opts)
		if log == nil {
			t.Errorf("PrettyPino returned nil for %+v", opts)
		}
	}
}

func TestPrettyPinoEmitsToWriter(t *testing.T) {
	// Redirect the adapter through a buffer so we can exercise every level
	// method (Trace..Fatal) and the arg-dispatching branches without touching
	// stdout. Since PrettyPino writes to os.Stdout, we build an equivalent
	// zerolog logger with a buffer sink for this test.
	var buf bytes.Buffer
	l := zerolog.New(&buf).Level(zerolog.TraceLevel)
	adapter := &zerologAdapter{l: &l}

	adapter.Trace(map[string]any{"a": 1}, "trace-msg")
	adapter.Debug("debug-msg")
	adapter.Info(map[string]any{"b": 2})
	adapter.Warn("warn-a", "warn-b") // two strings joined by space
	adapter.Error(42)                // non-string, non-map → fallback branch
	adapter.Fatal("fatal-msg")

	// Each level emits one JSON object per line.
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 6 {
		t.Fatalf("expected 6 log lines, got %d: %s", len(lines), buf.String())
	}
	// Assert the join-strings branch produced "warn-a warn-b".
	var entry map[string]any
	if err := json.Unmarshal([]byte(lines[3]), &entry); err != nil {
		t.Fatalf("warn line not JSON: %v", err)
	}
	if entry["message"] != "warn-a warn-b" {
		t.Errorf("expected joined message, got %v", entry["message"])
	}
	// Assert the map-field branch attached "a": 1 to the trace line.
	var traceEntry map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &traceEntry); err != nil {
		t.Fatalf("trace line not JSON: %v", err)
	}
	if traceEntry["a"] != float64(1) {
		t.Errorf("expected field a=1, got %v", traceEntry["a"])
	}
}

func TestEntityOutputFeedsShape(t *testing.T) {
	// Mirror the TS-only test: Entity's output should be a valid schema spec.
	model := map[string]any{"main": map[string]any{"ent": map[string]any{
		"qaz": map[string]any{"zed": map[string]any{
			"valid": map[string]any{"$$": "Open"},
			"field": map[string]any{"foo": map[string]any{
				"valid": map[string]any{"a": "Number"}}},
		}},
	}}}

	entMap := Entity(model)
	entity, ok := entMap["qaz/zed"].(map[string]any)
	if !ok {
		t.Fatalf("expected qaz/zed entry, got %T", entMap["qaz/zed"])
	}
	spec, ok := entity["valid_json"].(map[string]any)
	if !ok {
		t.Fatalf("expected valid_json map, got %T", entity["valid_json"])
	}
	sc, err := ShapeBuild(spec)
	if err != nil {
		t.Fatalf("ShapeBuild(entity spec) failed: %v", err)
	}
	if sc == nil {
		t.Fatal("ShapeBuild returned nil schema")
	}
	// The compiled schema must at least render (String is safe on any *Shape).
	if sc.String() == "" {
		t.Error("compiled Shape.String() is empty")
	}
	// MustShapeBuild is the panic-on-error path; a valid spec must not panic.
	if got := MustShapeBuild(spec); got == nil {
		t.Error("MustShapeBuild returned nil")
	}
}
