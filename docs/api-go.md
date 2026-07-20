# Go API reference

Every export of the Go package (`go/util.go`), module
`github.com/voxgig/util/go`, package `util`. This is a port of the canonical
[TypeScript implementation](api-typescript.md); see [how it works](explanation.md)
for the deliberate differences.

```go
import util "github.com/voxgig/util/go"
```

Data is modelled with `any` (i.e. `interface{}`): objects are `map[string]any`
and arrays are `[]any`, mirroring decoded JSON.

Contents: [`Camelify`](#camelify) · [`CamelifySlice`](#camelifyslice) ·
[`Dive`](#dive) · [`DiveMap`](#divemap) · [`Get`](#get) · [`GetPath`](#getpath) ·
[`Joins`](#joins) · [`Pinify`](#pinify) · [`Order`](#order) ·
[`Entity`](#entity) · [`Stringify`](#stringify) · [`Decircular`](#decircular) ·
[Types](#types)

---

### `Camelify`

```go
func Camelify(input string) string
```

Convert a kebab-case string to PascalCase. The string is split on `-`, each
part's first rune is upper-cased, the remainder is unchanged, and empty parts are
skipped.

```go
util.Camelify("foo-bar")   // "FooBar"
util.Camelify("a--b")      // "AB"
```

TypeScript: [`camelify`](api-typescript.md#camelify) (string form).

### `CamelifySlice`

```go
func CamelifySlice(input []string) string
```

As [`Camelify`](#camelify), but takes the parts already split into a slice.

```go
util.CamelifySlice([]string{"order", "line", "item"})   // "OrderLineItem"
```

TypeScript: [`camelify`](api-typescript.md#camelify) (array form).

### `Dive`

```go
func Dive(node map[string]any, depth ...int) []DiveEntry
type DiveEntry struct {
    Path  []string
    Value any
}
```

Traverse a nested map and collect leaves as `DiveEntry{Path, Value}`. The
optional `depth` defaults to `2`. A branch is collected as a leaf at the depth
limit, or when the child is not a non-empty `map[string]any` or non-empty
`[]any`. A non-empty `[]any` is descended into using its indices (as strings)
for the path, visited in **numeric** order (`"0","1",…,"10"`). A child under the
key `$` contributes its value at the current path (the `$` is not added to the
path). Object keys are visited in sorted order.

```go
util.Dive(map[string]any{
    "red":   map[string]any{"hex": "#f00"},
    "green": map[string]any{"hex": "#0f0"},
})
// sorted by key: []DiveEntry{ {Path:["green"], ...}, {Path:["red"], ...} }
```

> Entries are returned in sorted key order, so the result is deterministic and
> identical to the canonical TS `dive` (for the ASCII/BMP keys used in practice).

TypeScript: [`dive`](api-typescript.md#dive) (array form).

### `DiveMap`

```go
func DiveMap(node map[string]any, mapper DiveMapper, depth ...int) map[string]any
type DiveMapper func(path []string, leaf any) (key string, value any, ok bool)
```

Traverse like [`Dive`](#dive), then pass each entry through `mapper` and collect
the results into a map. When `mapper` returns `ok == false`, the entry is
omitted. This is the Go form of the TypeScript `dive(node, mapper)` overload
(where a `null` key omits an entry).

```go
tree := map[string]any{"db": map[string]any{"host": "h", "port": 5432}}

util.DiveMap(tree, func(path []string, leaf any) (string, any, bool) {
    return strings.Join(path, "."), leaf, true
})
// map[string]any{ "db.host": "h", "db.port": 5432 }
```

TypeScript: [`dive`](api-typescript.md#dive) (mapper form).

### `Get`

```go
func Get(root any, path string) any
```

Read a deeply nested value using a dot-separated path. Equivalent to
`GetPath(root, strings.Split(path, "."))`. A missing key, out-of-range index, or
non-traversable node returns `nil`.

```go
root := map[string]any{"a": map[string]any{"b": 1}}
util.Get(root, "a.b")     // 1
util.Get(root, "a.x")     // nil
```

TypeScript: [`get`](api-typescript.md#get) (string path).

### `GetPath`

```go
func GetPath(root any, path []string) any
```

As [`Get`](#get), but takes the path as a slice. Walks `map[string]any` by key
and `[]any` by index. Only canonical non-negative integer segments index a slice
(`"0"`, `"1"`, …); `"01"`, `"+1"`, `"-1"` return `nil`, matching JavaScript array
access.

```go
data := map[string]any{"users": []any{map[string]any{"name": "alice"}}}
util.GetPath(data, []string{"users", "0", "name"})   // "alice"
```

TypeScript: [`get`](api-typescript.md#get) (array path).

### `Joins`

```go
func Joins(arr []any, seps ...string) string
```

Join elements with a hierarchy of separators, finest-first: `seps[0]` between
every element, `seps[1]` at every 2nd boundary, `seps[2]` at every 4th, and so on
(coarsest applicable wins). Elements are rendered to match JavaScript's
`String()`: strings as-is; `int`/`int64`/`float64` numerically (whole floats
without a trailing `.0`, `Infinity`/`-Infinity`/`NaN` spelled out, `-0` as `0`);
`bool` as `true`/`false`; `nil` as the empty string; objects and arrays via
`json.Marshal` (matching TS's `JSON.stringify`).

```go
util.Joins([]any{"a", 1, "b", 2, "c", 3, "d", 4}, ":", ",", "/")
// "a:1,b:2/c:3,d:4"
util.Joins([]any{"x", map[string]any{"a": 1}}, ":")   // `x:{"a":1}`
```

Float rendering matches JS `String()` for all realistic magnitudes; only the
ranges where JS switches to exponential notation (`>=1e21`, `<1e-6`) differ.

TypeScript: [`joins`](api-typescript.md#joins).

### `Pinify`

```go
func Pinify(path []string) string
```

Render a path as pin notation. `:` follows every even-indexed element (including
a final one); `,` follows every odd-indexed element except the last.

```go
util.Pinify([]string{"a", "b", "c", "d"})   // "a:b,c:d"
util.Pinify([]string{"a", "b", "c"})        // "a:b,c:"
util.Pinify([]string{"a"})                  // "a:"
```

TypeScript: [`pinify`](api-typescript.md#pinify).

### `Order`

```go
func Order(itemMap map[string]map[string]any, spec *OrderSpec) []map[string]any
type OrderSpec struct {
    Sort    string
    Exclude string
    Include string
}
```

Sort and filter a collection. `itemMap` maps an id to an item (normally with a
`"title"`). The result is a slice of item maps, each with its `"key"` set. A
`nil` spec returns every item. Operations apply as sort → exclude → include.

- **`Sort`** — comma-separated keys and/or the tokens `alpha$` (append remaining
  items sorted by title) and `human$` (append remaining items in natural order,
  recording a zero-padded `"title$"`). Named keys that do not exist are dropped.
  A non-string `"title"` is string-coerced the way JS `String()` does (numbers
  and booleans included), and a missing title sorts as `""`.
- **`Exclude`** — comma-separated keys to remove.
- **`Include`** — comma-separated keys to keep; `Exclude` wins for overlaps.

`Sort`/`Exclude`/`Include` are split on the pattern `\s*,\s*` (matching the TS
`split(/\s*,\s*/)`), so surrounding whitespace is trimmed and empty tokens are
kept.

```go
items := map[string]map[string]any{
    "code": {"title": "Coding"},
    "tech": {"title": "Technology"},
    "devr": {"title": "Developer Relations"},
}
util.Order(items, &util.OrderSpec{Sort: "tech,code"})   // tech, then code
util.Order(items, &util.OrderSpec{Sort: "alpha$"})      // code, devr, tech
util.Order(items, &util.OrderSpec{Exclude: "code,tech"})// devr
```

> With no `Sort`, Go returns items in **lexicographic key order** (its maps have
> no insertion order to preserve), unlike TypeScript which keeps insertion order.
> Pass an explicit `Sort` for output identical to TypeScript. The `human$`
> padding length is measured in UTF-16 code units, matching JS `String.length`
> exactly (astral characters such as emoji count as 2). See
> [how it works](explanation.md#ordering-and-map-iteration).

TypeScript: [`order`](api-typescript.md#order).

### `Entity`

```go
func Entity(model map[string]any) map[string]any
```

Extract per-entity field validation from a model shaped as `model["main"]["ent"]`.
Each entity (addressed `base/name`) yields an entry whose `"valid_json"` merges
the entity's own `"valid"` map with a validation derived from each field:
`field[name]["kind"]`; then `kind + "." + valid` for a **truthy** string `valid`
(a `nil` kind contributes `""`), or the value itself for a truthy non-string
`valid`. A falsy `valid` is ignored, and a field yielding neither a kind nor a
usable valid is omitted. Returns an empty `map[string]any{}` if `main`/`ent` is
absent; entries whose value or `field` is not a `map[string]any` (an array
included), and `null`/primitive field values, are skipped.

```go
model := map[string]any{"main": map[string]any{"ent": map[string]any{
    "qaz": map[string]any{"zed": map[string]any{
        "valid": map[string]any{"$$": "Open"},
        "field": map[string]any{"foo": map[string]any{
            "valid": map[string]any{"a": "Number"}}},
    }}}}}

util.Entity(model)
// map[string]any{ "qaz/zed": { "valid_json": { "$$": "Open", "foo": {"a":"Number"} } } }
```

> Both implementations are defensive about malformed entries and agree on the
> result; neither throws or panics.

TypeScript: [`entity`](api-typescript.md#entity).

### `Stringify`

```go
func Stringify(val any) string
```

Serialise `val` to JSON after passing it through [`Decircular`](#decircular), so
cyclic input produces `[Circular *path]` markers rather than a marshal error,
and non-finite floats (`NaN`, `±Inf`) serialise as `null` (matching
`JSON.stringify`). Returns `""` if marshalling still fails (e.g. a channel or
function value).

```go
util.Stringify(map[string]any{"a": 1, "b": "hello"})   // {"a":1,"b":"hello"}

m := map[string]any{"a": 1}
m["self"] = m
util.Stringify(m)   // {"a":1,"self":"[Circular *]"}
```

> `encoding/json` sorts object keys alphabetically, so multi-key output may order
> keys differently from TypeScript (which preserves insertion order). The
> `replacer`/`indent` parameters of the TypeScript version are not ported.

TypeScript: [`stringify`](api-typescript.md#stringify).

### `Decircular`

```go
func Decircular(val any) any
```

Return a deep copy of `val` with circular references replaced by
`[Circular *path]`, where `path` is the dotted path to the first occurrence.
Recurses into `map[string]any` and `[]any` (using their identity to detect
cycles); non-finite floats (`NaN`, `±Inf`) normalise to `nil` (so
[`Stringify`](#stringify) can emit `null`); other values are returned unchanged.
A value shared by siblings (a non-cyclic DAG) is expanded each time.

> Unlike the TS `decircular`, this port does not special-case `error` values
> (TS clones `Error` instances and walks their enumerable properties). A Go
> `error` reaches the default branch and is returned unchanged.

```go
m := map[string]any{"a": 1}
m["self"] = m
util.Decircular(m)   // map[string]any{ "a": 1, "self": "[Circular *]" }
```

TypeScript: [`decircular`](api-typescript.md#decircular).

---

## Types

| Type          | Definition                                            | Notes |
| ------------- | ----------------------------------------------------- | ----- |
| `DiveEntry`   | `struct { Path []string; Value any }`                 | one result of [`Dive`](#dive) |
| `DiveMapper`  | `func(path []string, leaf any) (string, any, bool)`   | mapper for [`DiveMap`](#divemap) |
| `OrderSpec`   | `struct { Sort, Exclude, Include string }`            | spec for [`Order`](#order) |
| `OrderItem`   | `struct { Key, Title string; Fields map[string]any }` | convenience type for callers; `Order` itself works with `map[string]any` items |

The TypeScript-only logging helpers (`prettyPino`, `getdlog`, `showChanges`) and
the `Pino`/`Shape` re-exports have no Go equivalent.
