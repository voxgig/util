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

1. Change TypeScript first. For a portable data utility, capture the behaviour as
   a row in the relevant `test/<fn>.tsv` shared fixture (the parity contract that
   both suites run); add a TS-only case in `ts/test/util.test.ts` only for things
   a shared fixture can't express (mapper functions, cycles, `undefined`, the
   logging helpers, documented divergences).
2. Mirror the change in `go/util.go`. The shared fixtures already exercise Go;
   add a Go-only case in `go/util_test.go` for typed/defensive branches (typed
   `int`/`int64`, non-finite floats, cycles, nil maps).
3. Rebuild TypeScript (`npm run build`) — `ts/dist/` and `ts/dist-test/` are committed.
4. Run both test suites; keep `gofmt`/`go vet` clean. Data utilities are kept at
   100% coverage in both languages (the logging helpers — Pino in TS, zerolog in
   Go — are best-effort in both).
5. Update the docs in `docs/` and the quick-reference below if the API changed.

Never let the Go behaviour drift from the TypeScript semantics.

### Shared parity fixtures

`test/*.tsv` (one file per portable function) are tab-separated with columns
`name`, `args` (a JSON array of the logical arguments), and `expected` (the
canonical result as JSON). Both suites load them, map `args` to a real call via a
tiny adapter, and compare as canonical JSON. The `.tsv` files are the source of
truth — edit them directly (no generator). `order`'s spec is carried as the
neutral `{sort,exclude,include}`; each adapter wraps it (`{order:{…}}` in TS, a
flat `OrderSpec` in Go).

## Repository map

```
ts/src/util.ts       TypeScript source (CANONICAL)
ts/test/util.test.ts TypeScript tests (node:test): shared-spec runner + TS-only cases
ts/dist/             Compiled JS + .d.ts (committed; regenerate with npm run build)
ts/dist-test/        Compiled tests (committed; the test runner target)
go/util.go           Go port
go/util_test.go      Go tests: shared-spec runner + Go-only cases
test/                Shared cross-language parity fixtures (*.tsv), consumed by BOTH suites
docs/                Human documentation
.github/workflows/   CI workflow definitions
```

## Build, test, run

```bash
# TypeScript (from ts/)
npm install
npm run build        # tsc --build src && tsc --build test
npm test             # node --test dist-test/**/*.test.js
node --enable-source-maps --experimental-test-coverage --test dist-test/**/*.test.js  # coverage

# Go (from go/)
go build ./...
go vet ./...
go test ./...
go test -cover ./...   # statement coverage (kept at 100%)
gofmt -l .             # prints nothing when formatted
```

TS `pino`, `pino-pretty`, and `shape` are peer dependencies; `shape` requires
Node >= 24. Go depends on `github.com/rs/zerolog` (the pino analogue) and
`github.com/rjrodger/shape/go` (the Go port of `shape`). CI runs Node 24 and
`latest`, plus a Go job.

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

Logging helpers (both languages):

| TypeScript                                   | Go                                              | Summary |
| -------------------------------------------- | ----------------------------------------------- | ------- |
| `prettyPino(name, opts): Logger`             | `PrettyPino(name, PrettyPinoOpts) Log`          | pretty console logger (Pino in TS, zerolog in Go) |
| `getdlog(tag?, file?): dlog`                 | `Getdlog(tag, file) *DLog` / `dlog.Emit(args…)` | lightweight global debug-trace accumulator |
| `showChanges(log, point, jres, cwd?)`        | `ShowChanges(log Log, point, ChangesResult, cwd)` | log merged/conflicted file sets |
| `Pino`, `Shape`                              | `Shape` (type alias for `shape.Schema`), `ShapeBuild` / `MustShapeBuild` | expose the pino/shape packages |
| types `Log`, `FST`                           | interface `Log`                                 | pino-shaped logger contract |

Full signatures, parameters, edge cases, and examples: [TypeScript API](docs/api-typescript.md),
[Go API](docs/api-go.md).

## Gotchas an agent must know

- **`joins` separator hierarchy.** `seps[0]` goes between every element;
  `seps[1]` replaces it at every 2nd boundary, `seps[2]` at every 4th, and in
  general `seps[j]` at every `2^j`-th boundary (the coarsest applicable wins).
- **`pinify` keeps a trailing `:`** after a final even-indexed element:
  `pinify(['a','b','c'])` is `'a:b,c:'`, not `'a:b,c'`.
- **`dive` visits object keys in sorted order** and **array indices in numeric
  order** (`0,1,…,10` — not lexicographic) in both languages, so its output (and
  that of `DiveMap`/`Entity`) is deterministic and identical across the ports. It
  does **not** preserve insertion order. Non-empty arrays are descended into
  (paths use the index as a string); empty objects/arrays are leaves.
- **`order` with no `sort`** is the one remaining cross-language *order*
  difference: TypeScript keeps insertion order; Go (no insertion order to draw
  on) returns lexicographic key order. Both are deterministic — pass an explicit
  `sort` for identical output.
- **`order` sort tokens**: `alpha$` (sort remaining items by title) and
  `human$` (natural sort: titles zero-padded to equal length, so `'2'` < `'10'`;
  padding is UTF-16 code units). A non-string `title` is `String()`-coerced (so
  numeric titles sort numerically under `human$`); a missing title sorts as `''`.
  `exclude` wins over `include`. Unknown keys in `sort` are dropped. Tokens split
  on `/\s*,\s*/` (Go included), keeping empty tokens.
- **`stringify` de-cycles first** in both languages; cyclic input yields
  `[Circular *path]` markers rather than throwing, and non-finite floats
  (`NaN`/`±Inf`) serialise as `null`.
- **`get`/`GetPath` array indexing** accepts only canonical integer segments
  (`'0'`, `'1'`, …); `'01'`/`'+1'` resolve to `undefined`/`nil`, matching JS.
  Both walk maps and arrays only; JS-style indexing into a string (or `.length`)
  is TS-only.
- **`joins` element rendering**: strings as-is, numbers/booleans via `String`,
  `null`/`undefined` → `''`, and **objects/arrays as JSON with sorted keys**
  (both languages; nested non-finite → `null`) — not JS's `[object Object]`. Go
  renders `float64` to match JS `String()`
  (`Infinity`/`-Infinity`/`NaN` spelled out, `-0` → `0`) for all realistic
  magnitudes; only JS's exponential range (`>=1e21`, `<1e-6`) differs.
- **Malformed input**: both implementations are defensive and agree — `entity`
  skips entries that don't resolve to a `base/name` pair, whose `ent`/`field`
  isn't a plain object (an array is skipped), or whose field value is
  `null`/primitive (the TS no longer throws here); a `valid` string with no
  `kind` yields `.valid` (not `undefined.valid`), a falsy `valid` is ignored, and
  missing `main`/`ent` yields `{}`. `order` treats a missing/non-string `title`
  as its `String()` form.

These divergences and their rationale are explained in [docs/explanation.md](docs/explanation.md).

## CI

Workflow definitions live in `.github/workflows/ci.yml`. CI builds and tests
the TypeScript package (Node 24 + latest) and the Go port on every push and
pull request to `main`.
