
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
    assert.deepStrictEqual(dive({
      color: {
        red: { x: 1 },
        green: { x: 2 },
      },
      planet: {
        mercury: { y: { z: 3 } },
        venus: { y: { z: 4 } },
      }
    }), [
      [['color', 'red'], { x: 1 }],
      [['color', 'green'], { x: 2 }],
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

})
