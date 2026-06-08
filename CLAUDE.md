# CLAUDE.md

Repository guidance for Claude Code and other AI agents.

**The full agent guide is [AGENTS.md](AGENTS.md)** — repository conventions,
build/test commands, a complete API quick-reference, and the cross-language
gotchas. Read it before making changes.

The one rule to keep in mind everywhere:

> **TypeScript (`src/util.ts`) is the canonical implementation.** The Go package
> (`go/util.go`) is a port kept in parity with it. Change TypeScript first (with
> a test), then mirror the change in Go, then rebuild `dist/` (it is committed)
> and run both test suites.

Human-oriented documentation lives in [`docs/`](docs/README.md).
