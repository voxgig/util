# CLAUDE.md

Guidance for working in this repository.

## Overview

`@voxgig/util` is a small library of shared utility functions used by Voxgig
front-end and back-end code. It ships in two languages:

- **TypeScript** — `src/util.ts` (published as the npm package `@voxgig/util`)
- **Go** — `go/util.go` (module `github.com/voxgig/util/go`)

## Canonical implementation

**TypeScript (`src/util.ts`) is the canonical, source-of-truth implementation.**
The Go version is a port that is kept in parity with it.

When changing behaviour:

1. Make the change in TypeScript first (and add/adjust a test in
   `test/util.test.ts` to lock the canonical behaviour).
2. Bring `go/util.go` into parity and mirror the test in `go/util_test.go`.

Do not let the Go version drift from the TypeScript semantics.

## Layout

```
src/util.ts          TypeScript source (canonical)
test/util.test.ts    TypeScript tests (node:test)
dist/                Compiled JS + .d.ts (tracked in git; regenerate on change)
dist-test/           Compiled tests (tracked; runner target)
go/util.go           Go source (port)
go/util_test.go      Go tests
.github/workflows/   CI (Node matrix + Go job)
```

`dist/` and `dist-test/` are committed, so **rebuild and commit them** whenever
`src/` or `test/` changes (`npm run build`). `*.tsbuildinfo` is gitignored.

## Build & test

TypeScript (from repo root):

```bash
npm install
npm run build      # tsc --build src test  -> dist/ and dist-test/
npm test           # node --test dist-test/**/*.test.js
```

Go (from the `go/` directory):

```bash
go build ./...
go vet ./...
go test ./...
gofmt -l .         # should print nothing
```

## Dependencies

- TypeScript dev deps: `typescript`, `@types/node` (see `package.json`).
- Runtime peer deps: `pino`, `pino-pretty`, `shape`. Note `shape` requires
  Node >= 24; CI runs Node 24 and `latest`.
- Go uses only the standard library (no third-party modules).

## Parity notes / platform divergences

Some differences are intrinsic to the languages and are intentional:

- **Logging helpers** (`prettyPino`, `showChanges`, `getdlog`, and the re-exported
  `Pino` / `Shape`) are Node/Pino-specific and have **no Go equivalent**. Only the
  portable data utilities are ported.
- **Map iteration order**: TS objects preserve insertion order; Go maps do not.
  This means `Dive` returns entries in a non-deterministic order, and `order`
  with no `sort` spec falls back to lexicographic key order (and breaks ties in
  `human$`/`alpha$` by key rather than insertion). For deterministic
  cross-language output, pass an explicit `sort` spec.
- **Malformed input**: where the canonical TS throws on malformed input (e.g.
  `entity` on an entry with no `field`, `order` `human$`/`alpha$` on an item with
  no `title`), the Go port is intentionally defensive and returns a partial or
  empty result instead of panicking.
- **`camelify`**: TS accepts a string or an array. Go splits this into
  `Camelify(string)` and `CamelifySlice([]string)`.
- **`dive` mapper**: the mapper form `dive(node, mapper)` maps to Go `DiveMap`.
- **`get`**: TS `get` walks both objects and arrays; Go `Get` / `GetPath` walk
  `map[string]any` and `[]any` (numeric path segments index slices).
- **`joins` number formatting**: Go renders `float64` with
  `strconv.FormatFloat(v, 'f', -1, 64)` to match JS `String()`. This matches for
  all realistic magnitudes; only JS's exponential range (`>=1e21` or `<1e-6`)
  differs, which does not occur in pin/path joins.

## Publishing (TypeScript)

`package.json` scripts handle release: `npm run reset` (clean install + build +
test) and `npm run repo-publish`. Do not publish or tag unless explicitly asked.
