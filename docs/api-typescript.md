# TypeScript API reference

Every export of `@voxgig/util` (`ts/src/util.ts`). This is the canonical
implementation; the [Go reference](api-go.md) describes the matching port.

```ts
import {
  camelify, dive, get, joins, pinify, order, entity,
  stringify, decircular,
  prettyPino, getdlog, showChanges, Pino, Shape,
} from '@voxgig/util'
import type { Log, FST } from '@voxgig/util'
```

Contents:

- [Data utilities](#data-utilities): [`camelify`](#camelify) · [`dive`](#dive) ·
  [`get`](#get) · [`joins`](#joins) · [`pinify`](#pinify) · [`order`](#order) ·
  [`entity`](#entity) · [`stringify`](#stringify) · [`decircular`](#decircular)
- [Logging utilities](#logging-utilities): [`prettyPino`](#prettypino) ·
  [`getdlog`](#getdlog) · [`showChanges`](#showchanges)
- [Re-exports](#re-exports): [`Pino`](#pino) · [`Shape`](#shape)
- [Types](#types): [`Log`](#log) · [`FST`](#fst)

---

## Data utilities

### `camelify`

```ts
camelify(input: string | any[]): string
```

Convert a kebab-case string, or an array of parts, to PascalCase.

- A string is split on `-`; an array is used as-is (each element coerced to a
  string).
- Each part has its first character upper-cased; the remainder is unchanged.
- Empty parts contribute nothing.

```ts
camelify('foo-bar')            // 'FooBar'
camelify(['foo', 'bar'])       // 'FooBar'
camelify('a--b')               // 'AB'
camelify('iOS-app')            // 'IOSApp'
```

Go: [`Camelify`](api-go.md#camelify) (string) and
[`CamelifySlice`](api-go.md#camelifyslice) (slice).

### `dive`

```ts
dive(node: any, depth?: number, mapper?: DiveMapper): [any[], any][]
dive(node: any, mapper: DiveMapper): Record<string, any>
type DiveMapper = (path: any[], leaf: any) => any[]
```

Traverse a nested object and collect its leaves. Keys are visited in **sorted
order**, so the output is deterministic and identical to the Go port.

- **`depth`** — how many levels to descend. Default `2`. A branch is collected as
  a leaf when it reaches the depth limit, or when the value is `null`, not an
  object, or an object with no own keys.
- **`$` key** — a child under the key `$` contributes its value at the *current*
  path (the `$` is not added to the path), letting an interior node carry a value
  while still having children.
- **`mapper`** — when supplied (as the 2nd or 3rd argument), each `(path, leaf)`
  is passed through it to produce a `[key, value]` pair, and the results are
  collected into an object. A `null`/`undefined` key omits the entry. With a
  mapper, `dive` returns an object instead of an array.

```ts
dive({ red: { hex: '#f00' }, green: { hex: '#0f0' } })   // sorted: green, then red
// [ [ ['green'], { hex: '#0f0' } ], [ ['red'], { hex: '#f00' } ] ]

dive({ a: { b: { c: 1 } } }, 3)
// [ [ ['a', 'b', 'c'], 1 ] ]

dive({ a: { $: 'self', b: 1 } })
// [ [ ['a'], 'self' ], [ ['a', 'b'], 1 ] ]

dive({ db: { host: 'h', port: 5432 } }, (path, leaf) => [path.join('.'), leaf])
// { 'db.host': 'h', 'db.port': 5432 }
```

Go: [`Dive`](api-go.md#dive) (array form) and [`DiveMap`](api-go.md#divemap)
(mapper form).

### `get`

```ts
get(root: any, path: string | string[]): any
```

Read a deeply nested value. A string path is split on `.`; an array path is used
directly. Traversal walks both objects (by key) and arrays (by numeric index).
If any segment is missing — or the current node becomes `null`/`undefined` —
returns `undefined`.

```ts
get({ a: { b: 1 } }, 'a.b')                 // 1
get({ a: { b: 1 } }, ['a', 'b'])            // 1
get({ a: {} }, 'a.b.c')                     // undefined
get({ users: [{ name: 'x' }] }, 'users.0.name')   // 'x'
```

Only canonical non-negative integer strings index arrays (`'0'`, `'1'`, …);
`'01'`, `'+1'`, `'-1'` yield `undefined`.

Go: [`Get`](api-go.md#get) (string path) and [`GetPath`](api-go.md#getpath)
(slice path).

### `joins`

```ts
joins(arr: any[], ...seps: string[]): string
```

Join array elements using a hierarchy of separators, listed finest-first.
`seps[0]` is placed between every element; `seps[1]` replaces it at every 2nd
boundary; `seps[2]` at every 4th; in general `seps[j]` applies at each `2^j`-th
boundary, and the coarsest applicable separator wins. Elements are stringified as
`Array.prototype.join` would (so `null`/`undefined` → empty string).

```ts
joins(['a', 1, 'b', 2, 'c', 3, 'd', 4], ':', ',', '/')   // 'a:1,b:2/c:3,d:4'
joins(['a', 'b', 'c'], '-')                               // 'a-b-c'
joins([], ':')                                            // ''
```

Go: [`Joins`](api-go.md#joins).

### `pinify`

```ts
pinify(path: string[]): string
```

Render a path as "pin" notation: `:` after every even-indexed element and `,`
after every odd-indexed element. The trailing `,` after a final odd-indexed
element is suppressed; a final even-indexed element keeps its `:`.

```ts
pinify(['a', 'b', 'c', 'd'])   // 'a:b,c:d'
pinify(['a', 'b', 'c'])        // 'a:b,c:'
pinify(['a'])                  // 'a:'
pinify([])                     // ''
```

Go: [`Pinify`](api-go.md#pinify).

### `order`

```ts
order(
  itemMap: Record<string, { title?: string }>,
  spec: { order?: { sort?: string; exclude?: string; include?: string } },
): any[]
```

Sort and filter a collection of items. `itemMap` maps an id to an item object
(normally with a `title`). The result is an array of item objects, each carrying
its `key`. The operations apply in order: **sort**, then **exclude**, then
**include**.

- **`sort`** — a comma-separated list (or array) of keys and/or tokens:
  - a literal key places that item next; keys not named are dropped, and keys
    that do not exist are ignored.
  - `alpha$` appends all not-yet-placed items sorted by `title`.
  - `human$` appends all not-yet-placed items in natural order: each `title` is
    left-padded with `0` to the longest title's length (recorded as `title$`)
    and compared, so `'2'` sorts before `'10'`.
- **`exclude`** — comma-separated keys to remove.
- **`include`** — comma-separated keys to keep (all others removed). `exclude`
  takes precedence over `include` for a key in both.

```ts
const items = {
  code: { title: 'Coding' },
  tech: { title: 'Technology' },
  devr: { title: 'Developer Relations' },
}

order(items, { order: { sort: 'tech,code' } }).map(i => i.key)   // ['tech','code']
order(items, { order: { sort: 'alpha$' } }).map(i => i.key)      // ['code','devr','tech']
order(items, { order: { sort: 'tech,alpha$' } }).map(i => i.key) // ['tech','code','devr']
order(items, { order: { exclude: 'code,tech' } }).map(i => i.key)// ['devr']
order(items, { order: { include: 'code,tech' } }).map(i => i.key)// ['code','tech']

order({ v10: { title: '10' }, v2: { title: '2' } }, { order: { sort: 'human$' } })
  .map(i => i.title)                                             // ['2','10']
```

With no `sort`, items keep their insertion order. Go cannot preserve insertion
order (its maps are unordered) and falls back to key order — see
[how it works](explanation.md#ordering-and-map-iteration).

Go: [`Order`](api-go.md#order).

### `entity`

```ts
entity(model: any): Record<string, { valid_json: any }>
```

Extract per-entity field validation from a model shaped as `model.main.ent`.
Each entity (addressed `base/name`) becomes an entry whose `valid_json` merges
the entity's own `valid` object with a validation derived from each field:

- start from `field[name].kind`;
- if `field[name].valid` is a string, append `'.' + valid`;
- if it is an object, use that object as the validation.

```ts
entity({
  main: { ent: { qaz: { zed: {
    valid: { '$$': 'Open' },
    field: { foo: { valid: { a: 'Number' } } },
  } } } },
})
// { 'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } } }
```

> Marked as a work in progress in the source: it currently handles only
> `base/name`-style entities.

Go: [`Entity`](api-go.md#entity).

### `stringify`

```ts
stringify(val?: any, replacer?: any, indent?: any): string
```

Like `JSON.stringify`, but the value is passed through [`decircular`](#decircular)
first, so circular references become `[Circular *path]` markers instead of
throwing. `replacer` and `indent` are forwarded to `JSON.stringify`.

```ts
stringify({ a: 1, b: 'hello' })   // '{"a":1,"b":"hello"}'
stringify(42)                     // '42'

const a: any = { name: 'root' }
a.self = a
stringify(a)                      // '{"name":"root","self":"[Circular *]"}'
```

Go: [`Stringify`](api-go.md#stringify) (without `replacer`/`indent`).

### `decircular`

```ts
decircular(object?: any): any
```

Return a deep copy of `object` with circular references replaced by a
`[Circular *path]` string, where `path` is the dotted path to the first
occurrence. Non-objects are returned unchanged; arrays and plain objects are
copied; `Error` instances are passed through. A value shared by siblings (a
non-cyclic DAG) is fully expanded each time.

```ts
decircular({ a: 1, b: { c: 2 } })   // { a: 1, b: { c: 2 } }

const o: any = { a: 1 }
o.self = o
decircular(o)                       // { a: 1, self: '[Circular *]' }
```

Go: [`Decircular`](api-go.md#decircular).

---

## Logging utilities

These depend on Node and Pino and are **not** ported to Go.

### `prettyPino`

```ts
prettyPino(
  name: string,
  opts: { pino?: ReturnType<typeof Pino>; debug?: boolean | string },
): ReturnType<typeof Pino>
```

Build (or wrap) a Pino logger with a compact, human-readable single-line format
(it hides `pid`/`hostname`, formats a `note` field, expands errors, and replaces
the current working directory with `.`). The level comes from `opts.debug`:
`true` → `'debug'`, a string → that level, otherwise `'info'`. If `opts.pino` is
given, it is returned as-is.

```ts
const log = prettyPino('my-service', { debug: true })
log.info({ point: 'startup', note: 'ready' })
```

### `getdlog`

```ts
getdlog(tag?: string, filepath?: string):
  ((...args: any[]) => void) & { tag: string; file: string; log: (fp?: string) => any[] }
```

Return a debug-logging function that appends `[tag, file, timestamp, ...args]` to
a process-global buffer (`globalThis.__dlog__`). The returned function also
carries `.tag`, `.file`, and `.log()`, which returns the entries recorded under
this `tag`.

```ts
const dlog = getdlog('build', import.meta.url)
dlog('phase', 'start')
dlog.log()   // [ ['build', 'play.mjs', 1718000000000, 'phase', 'start'] ]
```

### `showChanges`

```ts
showChanges(
  log: Log,
  point: string,
  jres: { files: { merged: string[]; conflicted: string[] } },
  cwd?: string,
): void
```

Emit one `log.info` line per merged file and per conflicted file, with paths made
relative to `cwd` (default: the process working directory). Designed for
reporting the file results of a Jostraca-style generation run.

---

## Re-exports

### `Pino`

The [`pino`](https://github.com/pinojs/pino) logger factory, re-exported so
callers can construct loggers without a separate dependency line.

### `Shape`

The [`shape`](https://www.npmjs.com/package/shape) builder, re-exported. Used to
turn the validation objects produced by [`entity`](#entity) into shape
definitions (`Shape.build(...)`).

---

## Types

### `Log`

```ts
type Log = {
  trace: (...args: any[]) => void
  debug: (...args: any[]) => void
  info:  (...args: any[]) => void
  warn:  (...args: any[]) => void
  error: (...args: any[]) => void
  fatal: (...args: any[]) => void
}
```

The structural logger interface accepted by [`showChanges`](#showchanges) and
used throughout Voxgig code — satisfied by a Pino logger.

### `FST`

```ts
type FST = typeof import('node:fs')
```

The type of Node's `fs` module, exported for callers that pass a file-system
implementation around.
