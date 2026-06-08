# AGENTS.md

Guidance for AI coding agents working in this repository **and** for agents
using `@voxgig/util` as a dependency. Human-oriented documentation lives in
[`docs/`](docs/README.md); this file is the dense, scannable version.

## What this is

`@voxgig/util` is a small library of shared utility functions, implemented twice
with matching behaviour:

- **TypeScript** — `ts/src/util.ts`, published as npm `@voxgig/util`.
- **Go** — `go/util.go`, module `github.com/voxgig/util/go` (package `util`).

## The one rule that matters

**TypeScript (`ts/src/util.ts`) is canonical.** The Go package is a port kept in
parity with it. When you change behaviour:

1. Change TypeScript first, and add/adjust a test in `ts/test/util.test.ts`.
2. Mirror the change in `go/util.go` and `go/util_test.go`.
3. Rebuild TypeScript (`npm run build`) — `ts/dist/` and `ts/dist-test/` are committed.
4. Run both test suites; keep `gofmt`/`go vet` clean.
5. Update the docs in `docs/` and the quick-reference below if the API changed.

Never let the Go behaviour drift from the TypeScript semantics.

## Repository map

```
ts/src/util.ts       TypeScript source (CANONICAL)
ts/test/util.test.ts TypeScript tests (node:test)
ts/dist/             Compiled JS + .d.ts (committed; regenerate with npm run build)
ts/dist-test/        Compiled tests (committed; the test runner target)
go/util.go           Go port
go/util_test.go      Go tests
docs/                Human documentation
.github/workflows/   CI workflow definitions
```

## Build, test, run

```bash
# TypeScript (from ts/)
npm install
npm run build        # tsc --build src test
npm test             # node --test dist-test/**/*.test.js

# Go (from go/)
go build ./...
go vet ./...
go test ./...
gofmt -l .           # prints nothing when formatted
```

`pino`, `pino-pretty`, and `shape` are peer dependencies; `shape` requires
Node >= 24. CI runs Node 24 and `latest`, plus a Go job.

## API quick-reference

Portable data utilities (present in both languages):

| TypeScript                                | Go                                                | Summary |
| ----------------------------------------- | ------------------------------------------------- | ------- |
| `camelify(s \| string[]): string`         | `Camelify(string)` / `CamelifySlice([]string)`    | kebab/parts → PascalCase (`'foo-bar'`→`'FooBar'`) |
| `dive(node, depth=2): [path[], val][]`    | `Dive(node, depth...) []DiveEntry`                | flatten a nested map to `[path, value]` entries |
| `dive(node, mapper): Record<string,any>`  | `DiveMap(node, mapper, depth...) map[string]any`  | flatten then map each entry into a keyed object |
| `get(root, 'a.b' \| ['a','b']): any`      | `Get(root, "a.b")` / `GetPath(root, []string)`    | deep read through maps and arrays; missing → `undefined`/`nil` |
| `joins(arr, ...seps): string`             | `Joins([]any, ...string) string`                  | join with a hierarchy of separators |
| `pinify(path[]): string`                  | `Pinify([]string) string`                         | path → pin notation (`['a','b','c','d']`→`'a:b,c:d'`) |
| `order(itemMap, spec): any[]`             | `Order(map, *OrderSpec) []map[string]any`         | sort/filter a keyed collection |
| `entity(model): object`                   | `Entity(map[string]any) map[string]any`           | extract entity field validation from a model |
| `stringify(val): string`                  | `Stringify(val any) string`                       | JSON-serialise, de-cycling first |
| `decircular(val): any`                    | `Decircular(val any) any`                          | deep copy, replacing cycles with `[Circular *path]` |

TypeScript-only logging helpers (Node/Pino-specific, **not** ported to Go):

| TypeScript                                   | Summary |
| -------------------------------------------- | ------- |
| `prettyPino(name, opts): Logger`             | build a pretty Pino logger |
| `getdlog(tag?, file?): dlog`                 | lightweight global debug-trace accumulator |
| `showChanges(log, point, jres, cwd?)`        | log merged/conflicted file sets |
| `Pino`, `Shape`                              | re-exports of the `pino` and `shape` packages |
| types `Log`, `FST`                           | logger shape; `typeof fs` |

Full signatures, parameters, edge cases, and examples: [TypeScript API](docs/api-typescript.md),
[Go API](docs/api-go.md).

## Gotchas an agent must know

- **`joins` separator hierarchy.** `seps[0]` goes between every element;
  `seps[1]` replaces it at every 2nd boundary, `seps[2]` at every 4th, and in
  general `seps[j]` at every `2^j`-th boundary (the coarsest applicable wins).
- **`pinify` keeps a trailing `:`** after a final even-indexed element:
  `pinify(['a','b','c'])` is `'a:b,c:'`, not `'a:b,c'`.
- **`dive` visits keys in sorted order** in both languages, so its output (and
  that of `DiveMap`/`Entity`) is deterministic and identical across the ports.
  It does **not** preserve insertion order.
- **`order` with no `sort`** is the one remaining cross-language *order*
  difference: TypeScript keeps insertion order; Go (no insertion order to draw
  on) returns lexicographic key order. Both are deterministic — pass an explicit
  `sort` for identical output.
- **`order` sort tokens**: `alpha$` (sort remaining items by title) and
  `human$` (natural sort: titles zero-padded to equal length, so `'2'` < `'10'`).
  `exclude` wins over `include`. Unknown keys in `sort` are dropped.
- **`stringify` de-cycles first** in both languages; cyclic input yields
  `[Circular *path]` markers rather than throwing.
- **`get`/`GetPath` array indexing** accepts only canonical integer segments
  (`'0'`, `'1'`, …); `'01'`/`'+1'` resolve to `undefined`/`nil`, matching JS.
- **Numbers in `joins`**: Go renders `float64` to match JS `String()` for all
  realistic magnitudes; only JS's exponential range (`>=1e21`, `<1e-6`) differs.
- **Malformed input**: both implementations are defensive — `entity` skips
  entries that don't resolve to a `base/name` pair or lack a `field`, and
  `order` treats a missing `title` as empty rather than throwing.

These divergences and their rationale are explained in [docs/explanation.md](docs/explanation.md).

## CI

Workflow definitions live in `.github/workflows/ci.yml`. CI builds and tests
the TypeScript package (Node 24 + latest) and the Go port on every push and
pull request to `main`.
