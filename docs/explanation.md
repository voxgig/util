# How it works

This section is about understanding `@voxgig/util` — why it is shaped the way it
is, and where the two implementations agree and differ. It is background reading
rather than instructions; for those, see the [how-to guides](how-to-guides.md)
and the API references.

## Two implementations, one behaviour

Voxgig code runs in two worlds: TypeScript on the front end and in Node
back-ends, and Go in services and tooling. Rather than maintain two unrelated
grab-bags of helpers, the same small set of utilities is provided in both
languages with deliberately matching behaviour. A function called the same way
with the same data should produce the same result whether you are in TypeScript
or Go.

That promise is only useful if it is anchored somewhere, which is why one side is
designated canonical.

## The canonical / parity model

**TypeScript (`ts/src/util.ts`) is the source of truth.** The Go package
(`go/util.go`) is a port that follows it. The asymmetry is intentional: when a
question of "what should this do?" comes up, the TypeScript behaviour is the
answer, and the Go code is brought into line — never the reverse.

Concretely, a behavioural change moves in one direction:

1. Change TypeScript and capture the new behaviour in `ts/test/util.test.ts`.
2. Mirror the change in Go and add the matching case to `go/util_test.go`.
3. Rebuild the committed TypeScript output (`ts/dist/`, `ts/dist-test/`).
4. Run both suites.

The tests are the contract. For every shared behaviour there is a TypeScript test
that defines it and a Go test that asserts the port reproduces it, often with the
same inputs and expected outputs. When a subtle divergence is discovered, the fix
is accompanied by a test on both sides so it cannot silently regress — the
trailing-separator behaviour of `pinify`, the numeric formatting in `joins`, and
the natural-sort padding in `order` all arrived this way.

## Why the committed build output

`ts/dist/` and `ts/dist-test/` (compiled JavaScript and declaration files) are
checked into the repository. This lets the package be consumed directly from a
Git reference without a build step, and lets the test runner execute the
compiled output. The consequence to remember is that they are generated: after
any change to `ts/src/` or `ts/test/`, they must be rebuilt (`npm run build`) and
the regenerated files committed alongside the source.

## Where the two versions diverge, and why

Perfect parity is impossible because the languages differ in ways that surface in
exactly the kinds of data-wrangling this library does. The differences below are
deliberate and documented rather than bugs.

### Ordering and map iteration

JavaScript objects remember the order keys were inserted; Go maps do not, and Go
randomises iteration order on purpose. Left unaddressed this would make Go output
vary from run to run, so wherever the order of a result is observable, both
implementations impose a deterministic order:

- `dive` visits keys in **sorted order** in both languages. Its output is
  therefore deterministic *and* identical across TypeScript and Go — and so are
  the things built on it, `DiveMap` and `Entity` (whose key-collision resolution
  is now stable too). This is why `dive` no longer preserves insertion order:
  determinism across the two ports was judged more valuable, and its consumers
  (`entity`) don't depend on order.
- `Stringify` is deterministic on both sides — Go's `encoding/json` sorts object
  keys; TypeScript serialises in insertion order. The *text* can differ in key
  order, but each is stable.
- `order` with no explicit `sort` is the one place a cross-language *order*
  difference remains: TypeScript returns items in insertion order, while Go (with
  no insertion order to draw on) returns them in lexicographic key order. Both
  are deterministic; they simply differ. Tie-breaking in `alpha$`/`human$` (equal
  titles) can differ for the same reason.

The practical guidance is to pass an explicit `sort` whenever you need `order`'s
output to be identical across languages. Preserving the caller's insertion order
in Go would mean changing the API to accept an ordered structure instead of a
map — rejected as too heavy for a small utility, and at odds with `order`'s
no-sort case meaning "the order you gave me".

### Number formatting

`joins` renders elements the way JavaScript's `Array.join` does. For Go to match
`String(n)` for a `float64`, it formats with the shortest fixed-point form
(`strconv.FormatFloat(v, 'f', -1, 64)`). This agrees with JavaScript across every
realistic magnitude — whole numbers print without a trailing `.0`, and large
integers keep their digits instead of switching to exponent form too early. The
only divergence is at the extremes where JavaScript itself switches to
exponential notation (`>= 1e21` or `< 1e-6`), which never occur in the pin and
path strings `joins` is built for.

### Text length: UTF-16 versus runes

The `human$` sort left-pads each title to the longest title's length before
comparing. JavaScript's `String.length` counts UTF-16 code units; Go's `len` on a
string counts bytes. Measuring bytes would pad multibyte titles incorrectly and
change their sort position, so the Go port counts runes instead
(`utf8.RuneCountInString`). Runes equal UTF-16 units for all
Basic-Multilingual-Plane text — every realistic title — so the two agree; they
would only differ for astral characters such as emoji.

### Malformed input is handled defensively

Both implementations are deliberately forgiving of structurally invalid input
rather than throwing or panicking. `entity` skips any entry that doesn't resolve
to a `base/name` pair or that lacks a `field` map (a `$`-shaped entry that
produces a short path, for instance, is dropped instead of crashing), and the
`human$`/`alpha$` sorts treat a missing `title` as empty. The two ports take the
same defensive path, so they agree on malformed input as well as well-formed
input. (`entity` and `order` also avoid mutating the caller's input — they copy
before adding derived fields such as `key` and `title$`.)

### Overloads become separate functions

TypeScript leans on dynamic typing for ergonomic overloads. Go does not, so a
single TypeScript function sometimes maps to two Go ones with distinct
signatures: `camelify` splits into `Camelify` and `CamelifySlice`, `get` into
`Get` and `GetPath`, and the mapper form of `dive` becomes `DiveMap`. The mapper
itself adapts too — where TypeScript signals "omit this entry" by returning a
`null` key, the Go `DiveMapper` returns an explicit `ok bool`, which is clearer
in a typed setting and behaves the same.

## The reasoning behind a few functions

A couple of the helpers encode conventions that are worth spelling out.

**`joins` and its separator hierarchy.** Voxgig addresses things with structured
strings — pairs grouped into records grouped into sets. Rather than special-case
each level, `joins` takes a list of separators finest-first and applies the
coarsest one whose level divides the current boundary count: `seps[0]` between
every element, `seps[1]` at every second boundary, `seps[2]` at every fourth, and
so on by powers of two. One call with `':' , ',' , '/'` produces
`a:1,b:2/c:3,d:4` — fields joined by `:`, records by `,`, groups by `/`.

**`dive` and the `$` sentinel.** A plain tree traversal can only put values at
the leaves. Real configuration often wants a value *and* children at the same
node — a default plus overrides, say. The `$` key solves this: a child stored
under `$` is emitted at its parent's path without the `$` appearing in that path,
so an interior node can carry its own value.

**`order`'s `human$` token.** Sorting titles like `'2'` and `'10'` alphabetically
puts `'10'` first, which reads wrong to a human. `human$` left-pads every title
to a common width with `0` and sorts the padded forms, so numeric titles fall
into natural order while non-numeric ones still sort sensibly. The padded value
is exposed as `title$` on each item for inspection.

**`decircular` over a naive guard.** Detecting cycles by remembering every object
ever seen would also collapse a value that legitimately appears twice as
siblings (a DAG). Instead, each node is recorded only while it is on the current
path and removed afterwards, so a genuine cycle is caught but shared,
non-circular references are expanded normally. The marker records the dotted path
to the first occurrence, which is more useful than a bare `[Circular]`.

## What is intentionally not ported

The logging helpers — `prettyPino`, `getdlog`, `showChanges`, and the `Pino` and
`Shape` re-exports — are specific to Node and the Pino/Shape packages. They have
no Go counterpart and are not part of the parity contract; only the portable data
utilities are mirrored.

## Continuous integration

CI builds and tests both implementations: a Node matrix for the TypeScript
package and a Go job for the port. The workflow definitions are kept under
[`ci/`](../ci/) and copied into `.github/workflows/`, because updating files
under `.github/workflows/` directly requires a permission that automated tooling
in this project does not always hold. Treating `ci/` as the editable source and
the workflow file as a deployed copy keeps CI changes reviewable in ordinary
pull requests; [`ci/README.md`](../ci/README.md) describes the sync step.
