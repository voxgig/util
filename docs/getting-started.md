# Getting started

This walkthrough takes you through `@voxgig/util` from a standing start. By the
end you will have used the path helpers, the tree traversal, the collection
ordering, and the safe serializer. Follow the steps in order — each one builds on
the last.

The examples use TypeScript, the canonical implementation. The same calls exist
in Go; the [Go API reference](api-go.md) lists the equivalent names.

## 1. Set up a scratch project

Create an empty project to experiment in:

```bash
mkdir util-playground && cd util-playground
npm init -y
npm install @voxgig/util pino pino-pretty shape
```

`pino`, `pino-pretty`, and `shape` are peer dependencies of `@voxgig/util`, so
install them alongside it. (`shape` needs Node 24 or newer.)

Create `play.mjs` and add imports as you go:

```js
import { camelify, dive, get, pinify, joins, order, stringify } from '@voxgig/util'
```

Run it at any point with `node play.mjs`.

## 2. Turn identifiers into type names

The simplest helper converts a kebab-case identifier into PascalCase:

```js
console.log(camelify('user-profile'))   // UserProfile
```

It also accepts the parts as an array, which is handy when you already have a
path split into pieces:

```js
console.log(camelify(['order', 'line', 'item']))   // OrderLineItem
```

You should see `UserProfile` and `OrderLineItem`.

## 3. Read values out of a nested structure

Most Voxgig data is plain nested objects. `get` reads a value by a dotted path
without throwing when something in the middle is missing:

```js
const config = {
  service: {
    db: { host: 'localhost', port: 5432 },
  },
}

console.log(get(config, 'service.db.port'))     // 5432
console.log(get(config, 'service.cache.ttl'))   // undefined  (no cache key)
```

`get` walks arrays too — a numeric path segment indexes into an array:

```js
const data = { users: [{ name: 'alice' }, { name: 'bob' }] }
console.log(get(data, 'users.1.name'))          // bob
```

## 4. Flatten a tree into entries

`dive` turns a nested map into a flat list of `[path, value]` pairs. By default
it descends two levels:

```js
const palette = {
  red:   { hex: '#f00' },
  green: { hex: '#0f0' },
}

console.log(dive(palette))
// [ [ ['red'],   { hex: '#f00' } ],
//   [ ['green'], { hex: '#0f0' } ] ]
```

This is the building block behind several other helpers — once a tree is a list
of `[path, value]` pairs it is easy to filter, map, or re-key.

## 5. Build pin and path strings

Voxgig uses "pin" notation — `key:value` pairs separated by commas — to address
entities. `pinify` builds it from a path:

```js
console.log(pinify(['user', 'alice', 'role', 'admin']))   // user:alice,role:admin
```

For more control over the separators, `joins` lets you describe a *hierarchy* of
them. List the separators finest-first; the coarser ones take over at regular
intervals:

```js
console.log(joins(['a', 1, 'b', 2, 'c', 3, 'd', 4], ':', ',', '/'))
// a:1,b:2/c:3,d:4
```

Here `:` sits between every pair, `,` replaces it at every second boundary, and
`/` at every fourth. Section 6 of the [how-to guides](how-to-guides.md) explains
the pattern in more detail.

## 6. Sort and filter a collection

`order` takes a map of items keyed by id — each with at least a `title` — and
returns an ordered, filtered array. Try a natural ("human") sort, where `'10'`
correctly comes after `'2'`:

```js
const releases = {
  v2:  { title: '2' },
  v10: { title: '10' },
  v1:  { title: '1' },
}

console.log(order(releases, { order: { sort: 'human$' } }).map(r => r.title))
// [ '1', '2', '10' ]
```

Swap `human$` for `alpha$` to sort alphabetically, name explicit keys to fix an
order, or use `include` / `exclude` to filter. The
[how-to guides](how-to-guides.md#how-to-sort-and-filter-a-collection) cover each
mode.

## 7. Serialize objects that might contain cycles

`JSON.stringify` throws on a circular reference. `stringify` does not — it
replaces cycles with a marker first:

```js
const node = { name: 'root' }
node.self = node                      // a cycle

console.log(stringify(node))
// {"name":"root","self":"[Circular *]"}
```

This makes it safe to log or persist objects whose shape you do not fully
control.

## Where to go next

- Need to do one specific thing? Jump to the [how-to guides](how-to-guides.md).
- Want the exact behaviour of a function? See the
  [TypeScript API reference](api-typescript.md).
- Curious why the library is shaped this way, or how the Go port stays in step?
  Read [how it works](explanation.md).
