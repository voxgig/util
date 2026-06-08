
import { test, describe } from 'node:test'
import assert from 'node:assert'


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
} from '../'


describe('util', () => {

  test('happy', async () => {
    assert.equal(typeof camelify, 'function')
    assert.equal(typeof dive, 'function')
    assert.equal(typeof get, 'function')
    assert.equal(typeof joins, 'function')
    assert.equal(typeof pinify, 'function')
    assert.equal(typeof entity, 'function')
  })


  test('camelify', async () => {
    assert.equal(camelify('foo-bar'), 'FooBar')
  })


  test('dive', async () => {
    // Entries come back in sorted key order (deterministic and identical
    // across languages), so 'green' precedes 'red' whatever the input order.
    assert.deepStrictEqual(dive({
      color: {
        red: { x: 1 },
        green: { x: 2 },
      },
      planet: {
        venus: { y: { z: 4 } },
        mercury: { y: { z: 3 } },
      }
    }), [
      [['color', 'green'], { x: 2 }],
      [['color', 'red'], { x: 1 }],
      [['planet', 'mercury'], { y: { z: 3 } }],
      [['planet', 'venus'], { y: { z: 4 } }]
    ])
  })


  test('get', async () => {
    assert.equal(get({ a: { b: 1 } }, 'a.b'), 1)
  })


  test('joins', async () => {
    assert.equal(joins(['a', 1, 'b', 2, 'c', 3, 'd', 4, 'e', 5, 'f', 6], ':', ',', '/'),
      'a:1,b:2/c:3,d:4/e:5,f:6')
  })


  test('pinify', async () => {
    assert.equal(pinify(['a', 'b', 'c', 'd']), 'a:b,c:d')
  })


  test('pinify partial', async () => {
    // Odd-length paths keep the trailing ':' after the final even index.
    assert.equal(pinify(['a', 'b', 'c']), 'a:b,c:')
    assert.equal(pinify(['a']), 'a:')
    assert.equal(pinify([]), '')
  })


  test('joins types', async () => {
    assert.equal(joins(['x', 1.5], ':'), 'x:1.5')
    assert.equal(joins(['x', 2], ':'), 'x:2')
    assert.equal(joins(['x', 1234567], ':'), 'x:1234567')
    assert.equal(joins(['x', true], ':'), 'x:true')
    assert.equal(joins(['x', null], ':'), 'x:')
  })


  test('dive mapper', async () => {
    const r0 = dive(
      { a: { b: 1 }, c: { d: 2 } },
      (path: any[], leaf: any) => [path.join('.'), leaf]
    )
    assert.deepStrictEqual(r0, { 'a.b': 1, 'c.d': 2 })

    // A null key omits the entry from the result.
    const r1 = dive(
      { a: { b: 1 }, c: { d: 2 } },
      (path: any[], leaf: any) => ['b' === path[1] ? null : path.join('.'), leaf]
    )
    assert.deepStrictEqual(r1, { 'c.d': 2 })
  })


  test('get array', async () => {
    assert.equal(get({ a: [10, 20, 30] }, 'a.1'), 20)
    assert.equal(get([{ x: 1 }], '0.x'), 1)
    assert.equal(get({ a: [1] }, 'a.5'), undefined)
    assert.equal(get({ a: [10, 20, 30] }, 'a.01'), undefined)
  })


  test('entity', async () => {
    const s0 = entity({
      main: {
        ent: {
          'qaz': {
            'zed': {
              valid: {
                '$$': 'Open'
              },
              field: {
                foo: {
                  valid: {
                    a: 'Number'
                  }
                }
              }
            }
          }
        }
      }
    })
    // console.dir(s0, { depth: null })
    assert.deepStrictEqual(s0, {
      'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } }
    })

    const g0 = Shape.build(s0['qaz/zed'].valid_json)
    // console.log(g0.stringify())
    assert.equal(g0.stringify(), '{"foo":{"a":"Number"},"$$":"Open"}')
  })


  test('stringify', async () => {
    assert.equal(stringify({ a: 1, b: 'hello' }), '{"a":1,"b":"hello"}')
    assert.equal(stringify(null), 'null')
    assert.equal(stringify(undefined), undefined as any)
    assert.equal(stringify(42), '42')

    // Circular references are de-cycled before serialization.
    const c: any = { a: 1 }
    c.self = c
    assert.equal(stringify(c), '{"a":1,"self":"[Circular *]"}')
  })


  test('decircular', async () => {
    // Simple non-circular object passes through
    assert.deepStrictEqual(decircular({ a: 1, b: { c: 2 } }), { a: 1, b: { c: 2 } })

    // Handles null/undefined/primitives
    assert.equal(decircular(null), null)
    assert.equal(decircular(undefined), undefined)
    assert.equal(decircular(42), 42)
    assert.equal(decircular('hello'), 'hello')

    // Detects circular reference
    const obj: any = { a: 1 }
    obj.self = obj
    const result = decircular(obj)
    assert.equal(result.a, 1)
    assert.equal(result.self, '[Circular *]')

    // Handles nested circular reference
    const parent: any = { child: { name: 'kid' } }
    parent.child.parent = parent
    const result2 = decircular(parent)
    assert.equal(result2.child.name, 'kid')
    assert.equal(result2.child.parent, '[Circular *]')

    // Handles arrays
    assert.deepStrictEqual(decircular([1, 2, { a: 3 }]), [1, 2, { a: 3 }])

    // Deeply nested non-circular object
    const deep = { a: { b: { c: { d: { e: 5 } } } } }
    assert.deepStrictEqual(decircular(deep), { a: { b: { c: { d: { e: 5 } } } } })
  })


  test('order', async () => {
    assert.deepStrictEqual(order({}, {}), [])

    const items = {
      code: { title: 'Coding' },
      tech: { title: 'Technology' },
      devr: { title: 'Developer Relations' },
    }

    assert.deepStrictEqual(order(items, {}), [
      { key: 'code', title: 'Coding' },
      { key: 'tech', title: 'Technology' },
      { key: 'devr', title: 'Developer Relations' },
    ])

    assert.deepStrictEqual(order(items, { order: { exclude: 'code,tech' } }), [
      { key: 'devr', title: 'Developer Relations' },
    ])

    assert.deepStrictEqual(order(items, { order: { include: 'code,tech' } }), [
      { key: 'code', title: 'Coding' },
      { key: 'tech', title: 'Technology' },
    ])

    // exclude wins
    assert.deepStrictEqual(order(items, { order: { exclude: 'code', include: 'code,tech' } }), [
      { key: 'tech', title: 'Technology' },
    ])

    assert.deepStrictEqual(order(items, { order: {} }), [
      { key: 'code', title: 'Coding' },
      { key: 'tech', title: 'Technology' },
      { key: 'devr', title: 'Developer Relations' },
    ])

    assert.deepStrictEqual(order(items, { order: { sort: 'alpha$' } }), [
      { key: 'code', title: 'Coding' },
      { key: 'devr', title: 'Developer Relations' },
      { key: 'tech', title: 'Technology' },
    ])

    assert.deepStrictEqual(order(items, { order: { sort: 'tech,code' } }), [
      { key: 'tech', title: 'Technology' },
      { key: 'code', title: 'Coding' },
    ])

    assert.deepStrictEqual(order(items, { order: { sort: 'tech,alpha$' } }), [
      { key: 'tech', title: 'Technology' },
      { key: 'code', title: 'Coding' },
      { key: 'devr', title: 'Developer Relations' },
    ])

    // Unknown sort keys are dropped (no null holes in the result).
    assert.deepStrictEqual(order(items, { order: { sort: 'tech,zzz,code' } }), [
      { key: 'tech', title: 'Technology' },
      { key: 'code', title: 'Coding' },
    ])



    const nums = {
      '1': { title: '1' },
      '10': { title: '10' },
      '2': { title: '2' },
      'tech': { title: 'Technology' },
    }

    assert.deepStrictEqual(order(nums, { order: { sort: 'alpha$' } }), [
      { key: '1', title: '1' },
      { key: '10', title: '10' },
      { key: '2', title: '2' },
      { key: 'tech', title: 'Technology' },
    ])

    assert.deepStrictEqual(order(nums, { order: { sort: 'human$' } }), [
      { title: '1', key: '1', 'title$': '00000000001' },
      { title: '2', key: '2', 'title$': '00000000002' },
      { title: '10', key: '10', 'title$': '00000000010' },
      { title: 'Technology', key: 'tech', 'title$': '0Technology' }
    ])

  })


  test('order human$ unicode', async () => {
    // Padding length is measured in UTF-16 units (String.length), so a
    // multibyte title pads/sorts the same regardless of byte length.
    const u = { a: { title: 'é' }, b: { title: '10' } }
    assert.deepStrictEqual(order(u, { order: { sort: 'human$' } }), [
      { key: 'a', title: 'é', 'title$': '00é' },
      { key: 'b', title: '10', 'title$': '010' },
    ])
  })


  test('order does not mutate input', async () => {
    const items = { a: { title: '10' }, b: { title: '2' } }
    order(items, { order: { sort: 'human$' } })
    // No key / title$ leaked back onto the caller's objects.
    assert.deepStrictEqual(items, { a: { title: '10' }, b: { title: '2' } })
  })


  test('entity skips malformed entries', async () => {
    // Missing main/ent: returns an empty map rather than throwing.
    assert.deepStrictEqual(entity({}), {})
    assert.deepStrictEqual(entity(undefined), {})

    // A `$`-shaped ent carrying a field has a path shorter than base/name and
    // is skipped (must not throw or produce an "undefined/..." key).
    assert.deepStrictEqual(
      entity({ main: { ent: { '$': { field: { f: { kind: 'x' } } } } } }),
      {}
    )

    // An entity with no field map is skipped.
    assert.deepStrictEqual(
      entity({ main: { ent: { base: { name: { valid: { a: 'A' } } } } } }),
      {}
    )
  })


  test('getdlog', async () => {
    const dlog = getdlog('rev', '/some/where/file.ts')
    dlog('phase', 'start')
    dlog('phase', 'done')

    const all = getdlog('rev').log()
    assert.equal(all.length, 2)
    assert.equal(all[0][1], 'file.ts')

    // Filtering by file matches the file field, not the timestamp.
    assert.equal(getdlog('rev').log('/any/dir/file.ts').length, 2)
    assert.equal(getdlog('rev').log('nope.ts').length, 0)
  })

})
