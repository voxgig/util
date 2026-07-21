/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// Log is a minimal pino-shaped logging interface. Its six-level surface mirrors
// the canonical TS `Log` type, so any pino-shaped or zerolog-shaped logger can
// satisfy it with a small adapter. ShowChanges and PrettyPino both use this
// contract, allowing callers to pass any conforming logger.
type Log interface {
	Trace(args ...any)
	Debug(args ...any)
	Info(args ...any)
	Warn(args ...any)
	Error(args ...any)
	Fatal(args ...any)
}

// PrettyPinoOpts configures PrettyPino. If Pino is non-nil, it is returned
// unchanged (matching the TS `opts.pino` short-circuit). Otherwise the level
// is selected from Level ("trace","debug","info","warn","error","fatal") when
// set, else Debug=true → "debug", else "info" (mirrors TS null/true/string).
type PrettyPinoOpts struct {
	Pino  Log
	Debug bool
	Level string
}

// PrettyPino builds a zerolog-backed Log with a console writer whose format
// resembles the canonical TS prettyPino output (name, point, note fields with
// the working directory replaced by "."). If opts.Pino is set, it is returned
// unchanged, mirroring the TS short-circuit that lets callers inject their own
// logger. zerolog is the Go analogue of pino: JSON-first, low-allocation, with
// a built-in ConsoleWriter for pretty development output.
func PrettyPino(name string, opts PrettyPinoOpts) Log {
	if opts.Pino != nil {
		return opts.Pino
	}

	lvl := zerolog.InfoLevel
	if opts.Level != "" {
		if parsed, err := zerolog.ParseLevel(opts.Level); err == nil {
			lvl = parsed
		}
	} else if opts.Debug {
		lvl = zerolog.DebugLevel
	}

	cwd, _ := os.Getwd()
	sep := string(filepath.Separator)
	if !strings.HasSuffix(cwd, sep) {
		cwd = cwd + sep
	}

	cw := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
		NoColor:    true,
		FormatFieldValue: func(i any) string {
			s := fmt.Sprintf("%v", i)
			return strings.ReplaceAll(s, cwd, "."+sep)
		},
	}

	l := zerolog.New(cw).Level(lvl).With().Timestamp().Str("name", name).Logger()
	return &zerologAdapter{l: &l}
}

// zerologAdapter wraps a *zerolog.Logger so it satisfies Log. Each level method
// scans variadic args pino-style: a map[string]any contributes fields, a string
// contributes to the message (joined by space when multiple).
type zerologAdapter struct {
	l *zerolog.Logger
}

func (z *zerologAdapter) emit(lvl zerolog.Level, args []any) {
	e := z.l.WithLevel(lvl)
	var msg strings.Builder
	for _, a := range args {
		switch v := a.(type) {
		case string:
			if msg.Len() > 0 {
				msg.WriteByte(' ')
			}
			msg.WriteString(v)
		case map[string]any:
			for k, val := range v {
				e = e.Interface(k, val)
			}
		default:
			e = e.Interface(fmt.Sprintf("arg%d", 0), v)
		}
	}
	e.Msg(msg.String())
}

func (z *zerologAdapter) Trace(args ...any) { z.emit(zerolog.TraceLevel, args) }
func (z *zerologAdapter) Debug(args ...any) { z.emit(zerolog.DebugLevel, args) }
func (z *zerologAdapter) Info(args ...any)  { z.emit(zerolog.InfoLevel, args) }
func (z *zerologAdapter) Warn(args ...any)  { z.emit(zerolog.WarnLevel, args) }
func (z *zerologAdapter) Error(args ...any) { z.emit(zerolog.ErrorLevel, args) }

// Fatal emits at fatal level but, unlike zerolog's own log.Fatal(), does NOT
// os.Exit — matching pino's Log.fatal, which only logs. Callers that need to
// abort should call os.Exit themselves.
func (z *zerologAdapter) Fatal(args ...any) { z.emit(zerolog.FatalLevel, args) }

// ChangesResult is the subset of the Jostraca result consumed by ShowChanges:
// a merged and a conflicted file list. Kept intentionally small so callers do
// not need to depend on the full Jostraca types.
type ChangesResult struct {
	Files ChangesFiles
}

// ChangesFiles lists file paths merged vs. left in conflict by a generator run.
type ChangesFiles struct {
	Merged     []string
	Conflicted []string
}

// ShowChanges logs merged and conflicted files at info level, stripping cwd
// from each path so log lines are relative. When cwd is empty, os.Getwd is
// used. Mirrors the canonical TS showChanges: one info entry per file, with
// the `merge` or `conflict` boolean set and a formatted `note` field.
func ShowChanges(log Log, point string, jres ChangesResult, cwd string) {
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	sep := string(filepath.Separator)
	if !strings.HasSuffix(cwd, sep) {
		cwd = cwd + sep
	}
	for _, file := range jres.Files.Merged {
		log.Info(map[string]any{
			"point": point,
			"file":  file,
			"merge": true,
			"note":  "merged: " + strings.Replace(file, cwd, "", 1),
		})
	}
	for _, file := range jres.Files.Conflicted {
		log.Info(map[string]any{
			"point":    point,
			"file":     file,
			"conflict": true,
			"note":     "** CONFLICT: " + strings.Replace(file, cwd, "", 1),
		})
	}
}

// DLog is a lightweight tagged debug-trace handle produced by Getdlog. Its
// Emit method appends entries to a process-global accumulator; Log retrieves
// entries filtered by tag (and optionally by basename of a file path). Mirrors
// the canonical TS getdlog, whose returned callable both records and queries.
// Go has no callable-struct syntax, so the emit form is a method (Emit) rather
// than invoking the DLog value directly.
type DLog struct {
	Tag  string
	File string
}

var (
	dlogMu      sync.Mutex
	dlogEntries [][]any
)

// Getdlog returns a DLog tagged by (tag, filepath). An empty tag defaults to
// "-", and an empty filepath resolves to file "-"; a non-empty filepath is
// reduced to its basename (matching the canonical TS `Path.basename`).
func Getdlog(tag, filePath string) *DLog {
	if tag == "" {
		tag = "-"
	}
	file := "-"
	if filePath != "" {
		file = filepath.Base(filePath)
	}
	return &DLog{Tag: tag, File: file}
}

// Emit appends [tag, file, unix-millis, args...] to the global debug trace.
// Concurrent Emit calls across goroutines are safe.
func (d *DLog) Emit(args ...any) {
	dlogMu.Lock()
	defer dlogMu.Unlock()
	entry := make([]any, 0, 3+len(args))
	entry = append(entry, d.Tag, d.File, time.Now().UnixMilli())
	entry = append(entry, args...)
	dlogEntries = append(dlogEntries, entry)
}

// Log returns the entries whose tag equals this DLog's tag. When filterPath is
// non-empty, entries are further restricted to those whose file equals
// basename(filterPath). Mirrors the canonical TS `dlog.log(filepath?)`.
func (d *DLog) Log(filterPath ...string) [][]any {
	var wantFile string
	if len(filterPath) > 0 && filterPath[0] != "" {
		wantFile = filepath.Base(filterPath[0])
	}
	dlogMu.Lock()
	defer dlogMu.Unlock()
	var out [][]any
	for _, e := range dlogEntries {
		if len(e) < 2 {
			continue
		}
		if e[0] != d.Tag {
			continue
		}
		if wantFile != "" && e[1] != wantFile {
			continue
		}
		out = append(out, e)
	}
	return out
}
