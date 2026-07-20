# @voxgig/util

Small, shared utility functions used across Voxgig front-end and back-end code.
The library ships in two languages with matching behaviour:

- **TypeScript** — npm package [`@voxgig/util`](https://www.npmjs.com/package/@voxgig/util)
- **Go** — module `github.com/voxgig/util/go`

TypeScript is the canonical implementation; the Go package is kept in parity
with it.

## Install

TypeScript / Node:

```bash
npm install @voxgig/util
```

`pino`, `pino-pretty`, and `shape` are peer dependencies — install them in the
host project.

Go:

```bash
go get github.com/voxgig/util/go
```

## A first taste

TypeScript:

```ts
import { camelify, get, pinify } from '@voxgig/util'

camelify('foo-bar')                 // 'FooBar'
get({ a: { b: 1 } }, 'a.b')         // 1
pinify(['user', 'alice', 'role'])   // 'user:alice,role:'
```

Go:

```go
import util "github.com/voxgig/util/go"

util.Camelify("foo-bar")                              // "FooBar"
util.Get(map[string]any{"a": map[string]any{"b": 1}}, "a.b") // 1
util.Pinify([]string{"user", "alice", "role"})        // "user:alice,role:"
```

## Documentation

The documentation is organised into four sections, each answering a different
question:

| If you want to…                          | Read                                            |
| ---------------------------------------- | ----------------------------------------------- |
| learn the library by doing               | [Getting started](docs/getting-started.md)      |
| accomplish a specific task               | [How-to guides](docs/how-to-guides.md)          |
| look up a function's exact behaviour     | [TypeScript API](docs/api-typescript.md) · [Go API](docs/api-go.md) |
| understand why it works the way it does  | [How it works](docs/explanation.md)             |

Start at the [documentation index](docs/README.md) for an overview.

## Working with AI coding agents

Repository conventions and a complete, scannable API quick-reference for AI
coding agents live in [AGENTS.md](AGENTS.md).

## Building and contributing

This repo contains both implementations, side by side in `ts/` and `go/`, kept
in parity by shared behavioural fixtures in [`test/`](test) (`*.tsv`) that both
test suites run. TypeScript output in `ts/dist/` and `ts/dist-test/` is committed,
so rebuild after changing `ts/src/` or `ts/test/`.

```bash
# TypeScript (from ts/)
npm install
npm run build          # tsc --build src test -> dist/ and dist-test/
npm test

# Go (from go/)
go test ./...
```

Continuous-integration workflow definitions live in
[`.github/workflows/`](.github/workflows/).

## License

MIT © Voxgig Ltd. See [LICENSE](LICENSE).
