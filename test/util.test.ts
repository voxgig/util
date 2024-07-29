
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'


import { Gubu } from 'gubu'


import {
  camelify,
  dive,
  get,
  joins,
  pinify,
  entity,
  order,
} from '../'


describe('util', () => {

  test('happy', async () => {
    expect(typeof camelify).equal('function')
    expect(typeof dive).equal('function')
    expect(typeof get).equal('function')
    expect(typeof joins).equal('function')
    expect(typeof pinify).equal('function')
    expect(typeof entity).equal('function')
  })


  test('camelify', async () => {
    expect(camelify('foo-bar')).equal('FooBar')
  })


  test('dive', async () => {
    expect(dive({
      color: {
        red: { x: 1 },
        green: { x: 2 },
      },
      planet: {
        mercury: { y: { z: 3 } },
        venus: { y: { z: 4 } },
      }
    })).equal([
      [['color', 'red'], { x: 1 }],
      [['color', 'green'], { x: 2 }],
      [['planet', 'mercury'], { y: { z: 3 } }],
      [['planet', 'venus'], { y: { z: 4 } }]
    ])
  })


  test('get', async () => {
    expect(get({ a: { b: 1 } }, 'a.b')).equal(1)
  })


  test('joins', async () => {
    expect(joins(['a', 1, 'b', 2, 'c', 3, 'd', 4, 'e', 5, 'f', 6], ':', ',', '/'))
      .equal('a:1,b:2/c:3,d:4/e:5,f:6')
  })


  test('pinify', async () => {
    expect(pinify(['a', 'b', 'c', 'd'])).equal('a:b,c:d')
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
    expect(s0).equal({
      'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } }
    })

    const g0 = Gubu.build(s0['qaz/zed'].valid_json)
    // console.log(g0.stringify())
    expect(g0.stringify()).equal('{"foo":{"a":"Number"},"$$":"Open"}')
  })


  test('order', async () => {
    expect(order({}, {})).equal([])

    const items = {
      code: { title: 'Coding' },
      tech: { title: 'Technology' },
      devr: { title: 'Developer Relations' },
    }

    expect(order(items, {})).equal([
      { key: 'code', title: 'Coding' },
      { key: 'tech', title: 'Technology' },
      { key: 'devr', title: 'Developer Relations' },
    ])

    expect(order(items, { order: { exclude: 'code,tech' } })).equal([
      { key: 'devr', title: 'Developer Relations' },
    ])

    expect(order(items, { order: { include: 'code,tech' } })).equal([
      { key: 'code', title: 'Coding' },
      { key: 'tech', title: 'Technology' },
    ])

    // exclude wins
    expect(order(items, { order: { exclude: 'code', include: 'code,tech' } })).equal([
      { key: 'tech', title: 'Technology' },
    ])

    expect(order(items, { order: {} })).equal([
      { key: 'code', title: 'Coding' },
      { key: 'tech', title: 'Technology' },
      { key: 'devr', title: 'Developer Relations' },
    ])

    expect(order(items, { order: { sort: 'alpha$' } })).equal([
      { key: 'code', title: 'Coding' },
      { key: 'devr', title: 'Developer Relations' },
      { key: 'tech', title: 'Technology' },
    ])

    expect(order(items, { order: { sort: 'tech,code' } })).equal([
      { key: 'tech', title: 'Technology' },
      { key: 'code', title: 'Coding' },
    ])

    expect(order(items, { order: { sort: 'tech,alpha$' } })).equal([
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

    expect(order(nums, { order: { sort: 'alpha$' } })).equal([
      { key: '1', title: '1' },
      { key: '10', title: '10' },
      { key: '2', title: '2' },
      { key: 'tech', title: 'Technology' },
    ])

    expect(order(nums, { order: { sort: 'human$' } })).equal([
      { title: '1', key: '1', 'title$': '00000000001' },
      { title: '2', key: '2', 'title$': '00000000002' },
      { title: '10', key: '10', 'title$': '00000000010' },
      { title: 'Technology', key: 'tech', 'title$': '0Technology' }
    ])

  })

})
