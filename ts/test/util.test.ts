
import { test, describe } from 'node:test'
import assert from 'node:assert'
import Fs from 'node:fs'
import Path from 'node:path'


import { Shape } from 'shape'


import {
  camelify,
  decircular,
  dive,
  get,
  joins,
  pinify,
  entity,
  order,
  stringify,
  getdlog,
  showChanges,
  prettyPino,
} from '../'


// ---------------------------------------------------------------------------
// Shared cross-language parity specs (top-level test/*.tsv).
//
// Each row is (name, args, expected). The same fixtures drive the Go suite, so
// a behavioural drift between the two implementations fails one of them. `args`
// is the logical argument list; the adapter below maps it to a real call.
// ---------------------------------------------------------------------------

const SPEC_DIR = Path.join(__dirname, '..', '..', 'test')

// Canonical JSON: object keys sorted recursively, undefined normalised to null,
// so two structurally equal values compare equal regardless of key order (and
// so Go's key-sorted json.Marshal output lines up with the same fixtures).
function sortKeys(v: any): any {
  if (Array.isArray(v)) {
    return v.map(sortKeys)
  }
  if (null != v && 'object' === typeof v && !(v instanceof Error)) {
    const out: any = {}
    for (const k of Object.keys(v).sort()) {
      out[k] = sortKeys(v[k])
    }
    return out
  }
  return undefined === v ? null : v
}

const canon = (v: any) => JSON.stringify(sortKeys(v))

type SpecRow = { name: string, args: any[], expected: any }

function loadSpec(name: string): SpecRow[] {
  const text = Fs.readFileSync(Path.join(SPEC_DIR, name + '.tsv'), 'utf8')
  const rows: SpecRow[] = []
  const lines = text.split('\n')
  // Line 0 is the header (name/args/expected).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if ('' === line.trim() || line.startsWith('#')) {
      continue
    }
    const t1 = line.indexOf('\t')
    const t2 = line.indexOf('\t', t1 + 1)
    rows.push({
      name: line.slice(0, t1),
      args: JSON.parse(line.slice(t1 + 1, t2)),
      expected: JSON.parse(line.slice(t2 + 1)),
    })
  }
  return rows
}

const ADAPTERS: Record<string, (a: any[]) => any> = {
  camelify: (a) => camelify(a[0]),
  dive: (a) => dive(a[0], ...a.slice(1)),
  get: (a) => get(a[0], a[1]),
  joins: (a) => joins(a[0], ...a.slice(1)),
  pinify: (a) => pinify(a[0]),
  order: (a) => order(a[0], null == a[1] ? {} : { order: a[1] }),
  entity: (a) => entity(a[0]),
  stringify: (a) => stringify(a[0]),
  decircular: (a) => decircular(a[0]),
}

describe('shared parity specs', () => {
  for (const fn of Object.keys(ADAPTERS)) {
    describe(fn, () => {
      for (const row of loadSpec(fn)) {
        test(row.name, () => {
          assert.equal(canon(ADAPTERS[fn](row.args)), canon(row.expected))
        })
      }
    })
  }
})


// ---------------------------------------------------------------------------
// TypeScript-specific cases: behaviour that cannot be expressed as a shared
// fixture (function arguments, cycles, undefined), and the deliberate
// divergences the Go port does not reproduce.
// ---------------------------------------------------------------------------

describe('ts-only', () => {

  test('happy', () => {
    for (const fn of [camelify, dive, get, joins, pinify, entity, order, stringify, decircular]) {
      assert.equal(typeof fn, 'function')
    }
  })


  test('dive mapper form', () => {
    // Mapper as the 2nd argument returns a keyed object.
    assert.deepStrictEqual(
      dive({ a: { b: 1 }, c: { d: 2 } }, (path: any[], leaf: any) => [path.join('.'), leaf]),
      { 'a.b': 1, 'c.d': 2 })

    // A null key omits the entry.
    assert.deepStrictEqual(
      dive({ a: { b: 1 }, c: { d: 2 } }, (path: any[], leaf: any) => ['b' === path[1] ? null : path.join('.'), leaf]),
      { 'c.d': 2 })

    // Mapper as the 3rd argument (with an explicit depth).
    assert.deepStrictEqual(
      dive({ a: { b: { c: 1 } } }, 3, (path: any[], leaf: any) => [path.join('/'), leaf]),
      { 'a/b/c': 1 })
  })


  test('dive node with only inherited keys becomes a leaf', () => {
    // hasOwnKeys is own-keys-only, so a node whose only enumerable key is
    // inherited is not recursed into (it would contribute nothing); it is
    // emitted as a leaf instead of vanishing. (Go maps have no prototype.)
    const child = Object.create({ inh: 1 })
    assert.deepStrictEqual(dive({ a: child, z: { k: 1 } }, 3), [
      [['a'], child],
      [['z', 'k'], 1],
    ])
  })


  test('joins Infinity matches String()', () => {
    // TS renders non-finite numbers as JS String() does; the Go port special-
    // cases the same values so both agree.
    assert.equal(joins(['x', Infinity, 'y', -Infinity], ':'), 'x:Infinity:y:-Infinity')
    assert.equal(joins(['x', NaN], ':'), 'x:NaN')
  })


  test('joins non-serialisable elements render empty', () => {
    // A function serialises to undefined -> '' (matches Go's json.Marshal path).
    assert.equal(joins(['x', () => 1], ':'), 'x:')
    // A cyclic element throws inside JSON.stringify and is caught -> '' (Go's
    // json.Marshal errors and yields '' too).
    const c: any = { a: 1 }
    c.self = c
    assert.equal(joins(['x', c], ':'), 'x:')
  })


  test('stringify cycles, undefined, and insertion order', () => {
    const c: any = { a: 1 }
    c.self = c
    assert.equal(stringify(c), '{"a":1,"self":"[Circular *]"}')

    // undefined round-trips as undefined (Go cannot represent this).
    assert.equal(stringify(undefined), undefined as any)

    // Insertion order is preserved (Go's encoding/json sorts keys).
    assert.equal(stringify({ b: 1, a: 2 }), '{"b":1,"a":2}')

    // replacer / indent are forwarded to JSON.stringify.
    assert.equal(stringify({ a: 1 }, null, 2), '{\n  "a": 1\n}')
  })


  test('decircular cycles and Error handling', () => {
    // Nested object cycle.
    const parent: any = { child: { name: 'kid' } }
    parent.child.parent = parent
    const r = decircular(parent)
    assert.equal(r.child.name, 'kid')
    assert.equal(r.child.parent, '[Circular *]')

    // Array cycle.
    const arr: any = [1]
    arr.push(arr)
    const ra = decircular(arr)
    assert.equal(ra[0], 1)
    assert.match(ra[1], /Circular/)

    // Error: cloned onto the Error prototype, own enumerable props walked,
    // message/stack (non-enumerable) excluded.
    const err: any = Object.assign(new Error('boom'), { code: 500, detail: { a: 1 } })
    const de = decircular(err)
    assert.ok(de instanceof Error)
    assert.equal(stringify(err), '{"code":500,"detail":{"a":1}}')
  })


  test('order preserves insertion order with no sort, and does not mutate input', () => {
    // No sort: TS keeps insertion order (Go returns key order — a documented
    // divergence, so this is a TS-only assertion).
    assert.deepStrictEqual(order({ b: { title: 'B' }, a: { title: 'A' } }, {}), [
      { key: 'b', title: 'B' },
      { key: 'a', title: 'A' },
    ])
    assert.deepStrictEqual(order({}, {}), [])

    // human$ must not leak key / title$ back onto the caller's objects.
    const items = { a: { title: '10' }, b: { title: '2' } }
    order(items, { order: { sort: 'human$' } })
    assert.deepStrictEqual(items, { a: { title: '10' }, b: { title: '2' } })
  })


  test('order accepts array-form sort / exclude / include (TS-only)', () => {
    // The TS spec fields also accept a pre-split array; Go's OrderSpec is
    // string-only, so this convenience is not part of the shared contract.
    const items = { code: { title: 'Coding' }, tech: { title: 'Technology' }, devr: { title: 'Dev' } }
    assert.deepStrictEqual(order(items, { order: { sort: ['tech', 'code'] } as any }).map(i => i.key), ['tech', 'code'])
    assert.deepStrictEqual(order(items, { order: { exclude: ['code', 'tech'] } as any }).map(i => i.key), ['devr'])
    assert.deepStrictEqual(order(items, { order: { include: ['code'] } as any }).map(i => i.key), ['code'])
  })


  test('entity output feeds Shape.build', () => {
    const s0 = entity({
      main: { ent: { qaz: { zed: {
        valid: { '$$': 'Open' },
        field: { foo: { valid: { a: 'Number' } } },
      } } } },
    })
    assert.deepStrictEqual(s0, {
      'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } },
    })
    const g0 = Shape.build(s0['qaz/zed'].valid_json)
    assert.equal(g0.stringify(), '{"foo":{"a":"Number"},"$$":"Open"}')
  })


  test('get walks into strings (JS-only; the Go port stops at scalars)', () => {
    // Documented divergence: JS bracket access indexes strings and reads
    // .length; Go's Get returns nil for a scalar node.
    assert.equal(get({ a: 'hi' }, 'a.0'), 'h')
    assert.equal(get('hello', '1'), 'e')
  })


  test('camelify full-Unicode uppercasing (JS-only; the Go port does not expand)', () => {
    // Documented divergence: JS toUpperCase expands ß -> SS and the ﬀ ligature
    // -> FF; Go's unicode.ToUpper leaves them unchanged.
    assert.equal(camelify('ß-abc'), 'SSAbc')
    assert.equal(camelify('ﬀxy'), 'FFxy')
  })


  test('getdlog', () => {
    const dlog = getdlog('rev', '/some/where/file.ts')
    dlog('phase', 'start')
    dlog('phase', 'done')

    const all = getdlog('rev').log()
    assert.equal(all.length, 2)
    assert.equal(all[0][1], 'file.ts')

    assert.equal(getdlog('rev').log('/any/dir/file.ts').length, 2)
    assert.equal(getdlog('rev').log('nope.ts').length, 0)

    // No-argument form exercises the tag/file fallbacks.
    const d2 = getdlog()
    assert.equal(d2.tag, '-')
    assert.equal(d2.file, '-')
    d2('x')
    assert.ok(getdlog('-').log().length >= 1)
  })


  test('showChanges logs merged and conflicted files', () => {
    const calls: any[] = []
    const log: any = {
      info: (o: any) => calls.push(o),
      trace() { }, debug() { }, warn() { }, error() { }, fatal() { },
    }
    showChanges(log, 'pt', { files: { merged: ['/a/b.txt'], conflicted: ['/a/c.txt'] } }, '/a')
    assert.equal(calls.length, 2)
    assert.equal(calls[0].merge, true)
    assert.equal(calls[1].conflict, true)

    // A cwd already ending in a path separator is used as-is.
    calls.length = 0
    showChanges(log, 'pt', { files: { merged: [Path.sep + 'a' + Path.sep + 'd.txt'], conflicted: [] } }, Path.sep + 'a' + Path.sep)
    assert.equal(calls.length, 1)

    // Default cwd branch (no explicit cwd).
    calls.length = 0
    showChanges(log, 'pt', { files: { merged: [], conflicted: [] } })
    assert.equal(calls.length, 0)
  })


  test('prettyPino builds a logger (best-effort)', () => {
    // A provided logger is returned unchanged.
    const fake: any = { info() { } }
    assert.equal(prettyPino('x', { pino: fake }), fake)

    // Level-selection branches: true -> debug, string -> that level, else info.
    // (The pretty messageFormat closure writes to fd 1 via sonic-boom, so it is
    // left as best-effort rather than driven here — it would corrupt TAP.)
    for (const opts of [{ debug: true }, { debug: 'warn' }, {}] as any[]) {
      const log = prettyPino('svc', opts)
      assert.equal(typeof log.info, 'function')
    }
  })

})
