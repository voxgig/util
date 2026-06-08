# How-to guides

Focused recipes for specific tasks. Each assumes you already know the basics
(see [Getting started](getting-started.md) if not). Examples are TypeScript; the
[Go API reference](api-go.md) gives the equivalent calls.

- [Convert identifiers to PascalCase](#how-to-convert-identifiers-to-pascalcase)
- [Flatten a nested map](#how-to-flatten-a-nested-map)
- [Re-key a tree into a flat object](#how-to-re-key-a-tree-into-a-flat-object)
- [Read a deeply nested value safely](#how-to-read-a-deeply-nested-value-safely)
- [Build pin and path strings](#how-to-build-pin-and-path-strings)
- [Choose join separators with a hierarchy](#how-to-choose-join-separators-with-a-hierarchy)
- [Sort and filter a collection](#how-to-sort-and-filter-a-collection)
- [Serialize objects that may contain cycles](#how-to-serialize-objects-that-may-contain-cycles)
- [Set up a pretty logger](#how-to-set-up-a-pretty-logger)
- [Capture debug traces](#how-to-capture-debug-traces)
- [Use the library from Go](#how-to-use-the-library-from-go)

## How to convert identifiers to PascalCase

Use `camelify` with a kebab-case string, or with the parts already split:

```js
import { camelify } from '@voxgig/util'

camelify('order-line-item')          // 'OrderLineItem'
camelify(['order', 'line', 'item'])  // 'OrderLineItem'
```

Empty segments are skipped, so `camelify('a--b')` is `'AB'`. Only the first
character of each part is upper-cased; the rest is left untouched, so existing
capitals survive (`camelify('iOS-app')` → `'IOSApp'`).

## How to flatten a nested map

Use `dive` to turn a tree into a list of `[path, value]` entries. The default
depth is 2, and entries come back in sorted key order (deterministic):

```js
import { dive } from '@voxgig/util'

dive({ red: { hex: '#f00' }, green: { hex: '#0f0' } })
// [ [ ['green'], { hex: '#0f0' } ],
//   [ ['red'],   { hex: '#f00' } ] ]
```

Pass a depth to descend further (a branch stops early at a leaf — a non-object,
an empty object, or the depth limit):

```js
dive({ a: { b: { c: 1 } } }, 3)
// [ [ ['a', 'b', 'c'], 1 ] ]
```

To attach a value to a node that *also* has children, use the `$` key — it
contributes a value at the node's own path without appearing in it:

```js
dive({ a: { $: 'self', b: 1 } })
// [ [ ['a'],      'self' ],
//   [ ['a', 'b'], 1 ] ]
```

## How to re-key a tree into a flat object

Pass a mapper to `dive`. It receives each `(path, leaf)` and returns a
`[key, value]` pair; the results are collected into an object. Return a `null`
key to drop an entry:

```js
import { dive } from '@voxgig/util'

const tree = { db: { host: 'h', port: 5432 }, cache: { ttl: 60 } }

dive(tree, (path, leaf) => [path.join('.'), leaf])
// { 'db.host': 'h', 'db.port': 5432, 'cache.ttl': 60 }

dive(tree, (path, leaf) => [path[0] === 'cache' ? null : path.join('/'), leaf])
// { 'db/host': 'h', 'db/port': 5432 }   (cache dropped)
```

In Go this is a separate function, `DiveMap` (see the [Go API](api-go.md#divemap)).

## How to read a deeply nested value safely

Use `get` with a dotted path (or an array of segments). A missing segment yields
`undefined` instead of throwing:

```js
import { get } from '@voxgig/util'

const o = { service: { db: { port: 5432 } } }

get(o, 'service.db.port')      // 5432
get(o, 'service.cache.ttl')    // undefined
get(o, ['service', 'db'])      // { port: 5432 }
```

Numeric segments index into arrays:

```js
get({ users: [{ name: 'alice' }] }, 'users.0.name')   // 'alice'
```

Only canonical integer segments count as array indices — `'01'` or `'+1'` give
`undefined`, matching JavaScript array access.

## How to build pin and path strings

For the common alternating `key:value,key:value` form, use `pinify`:

```js
import { pinify } from '@voxgig/util'

pinify(['user', 'alice', 'role', 'admin'])   // 'user:alice,role:admin'
```

A path with an odd number of segments keeps a trailing `:` after the final key,
signalling a value is expected:

```js
pinify(['user', 'alice', 'role'])            // 'user:alice,role:'
```

## How to choose join separators with a hierarchy

`joins` joins array elements with a *hierarchy* of separators. List them
finest-first. `seps[0]` goes between every element; `seps[1]` replaces it at
every 2nd boundary; `seps[2]` at every 4th; in general `seps[j]` applies at every
`2^j`-th boundary, and the coarsest applicable separator wins:

```js
import { joins } from '@voxgig/util'

joins(['a', 1, 'b', 2, 'c', 3, 'd', 4, 'e', 5, 'f', 6], ':', ',', '/')
// 'a:1,b:2/c:3,d:4/e:5,f:6'
```

With a single separator it behaves like a plain join:

```js
joins(['a', 'b', 'c'], '-')   // 'a-b-c'
```

Numbers, booleans, and `null`/`undefined` are rendered as JavaScript's
`Array.join` would render them (`null` becomes an empty string).

## How to sort and filter a collection

`order(itemMap, spec)` takes a map of items keyed by id — each with a `title` —
and returns an ordered, filtered array. Every returned item carries its `key`.
Drive it through `spec.order`:

```js
import { order } from '@voxgig/util'

const items = {
  code: { title: 'Coding' },
  tech: { title: 'Technology' },
  devr: { title: 'Developer Relations' },
}
```

**Explicit order** — name the keys; unnamed keys are dropped:

```js
order(items, { order: { sort: 'tech,code' } })
// [ { key: 'tech', ... }, { key: 'code', ... } ]
```

**Alphabetical** by title with `alpha$`:

```js
order(items, { order: { sort: 'alpha$' } }).map(i => i.title)
// [ 'Coding', 'Developer Relations', 'Technology' ]
```

**Natural / "human"** sort with `human$` (titles are zero-padded to equal length
before comparison, so numbers order naturally):

```js
const nums = { v10: { title: '10' }, v2: { title: '2' }, v1: { title: '1' } }
order(nums, { order: { sort: 'human$' } }).map(i => i.title)
// [ '1', '2', '10' ]
```

**Mix** an explicit prefix with a token for the rest:

```js
order(items, { order: { sort: 'tech,alpha$' } }).map(i => i.key)
// [ 'tech', 'code', 'devr' ]
```

**Filter** with `include` or `exclude` (comma-separated keys). `exclude` wins
when a key appears in both:

```js
order(items, { order: { exclude: 'code,tech' } }).map(i => i.key)   // [ 'devr' ]
order(items, { order: { include: 'code,tech' } }).map(i => i.key)   // [ 'code', 'tech' ]
```

> For identical output across TypeScript and Go, always pass an explicit `sort`.
> Without one, Go orders by key (its maps have no insertion order to preserve).

## How to serialize objects that may contain cycles

Use `stringify` instead of `JSON.stringify` when the object might be circular:

```js
import { stringify } from '@voxgig/util'

const a = { name: 'root' }
a.self = a
stringify(a)   // '{"name":"root","self":"[Circular *]"}'
```

If you only need the de-cycled structure (not a string), call `decircular`,
which returns a deep copy with cycles replaced by `[Circular *path]` markers.

## How to set up a pretty logger

`prettyPino` returns a [Pino](https://getpino.io) logger configured for readable,
single-line output. (TypeScript/Node only.)

```js
import { prettyPino } from '@voxgig/util'

const log = prettyPino('my-service', { debug: true })
log.info({ point: 'startup', note: 'ready' })
```

`opts.debug` sets the level: `true` → `debug`, a string → that level name,
omitted → `info`. Pass `opts.pino` to supply your own pre-built logger instead.

## How to capture debug traces

`getdlog` returns a function that records timestamped trace entries on a global
buffer — useful for collecting diagnostics across modules without wiring a logger
through everything. (TypeScript/Node only.)

```js
import { getdlog } from '@voxgig/util'

const dlog = getdlog('build', import.meta.url)
dlog('phase', 'start')
dlog('phase', 'done', 42)

dlog.log()   // every entry recorded under the 'build' tag
```

## How to use the library from Go

Add the module and import it:

```bash
go get github.com/voxgig/util/go
```

```go
import util "github.com/voxgig/util/go"

util.Camelify("foo-bar")                       // "FooBar"
util.Pinify([]string{"user", "alice", "role"}) // "user:alice,role:"
util.Joins([]any{"a", 1, "b", 2}, ":", ",")    // "a:1,b:2"
```

The Go names map closely to the TypeScript ones; where a TypeScript function is
overloaded, Go splits it (`Camelify`/`CamelifySlice`, `Get`/`GetPath`,
`dive`-with-mapper → `DiveMap`). The [Go API reference](api-go.md) lists each
one, and [how it works](explanation.md) covers the deliberate differences.
