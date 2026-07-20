# CLAUDE.md

Repository guidance for Claude Code and other AI agents.

**The full agent guide is [AGENTS.md](AGENTS.md)** — repository conventions,
build/test commands, a complete API quick-reference, and the cross-language
gotchas. Read it before making changes.

The one rule to keep in mind everywhere:

> **TypeScript (`ts/src/util.ts`) is the canonical implementation.** The Go
> package (`go/util.go`) is a port kept in parity with it. Change TypeScript
> first, capturing the behaviour as a row in the shared `test/*.tsv` fixtures
> (both suites run them), then mirror the change in Go, then rebuild `ts/dist/`
> (it is committed) and run both test suites. Data utilities stay at 100%
> coverage in both languages.

Human-oriented documentation lives in [`docs/`](docs/README.md).
