
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'


import {
  camelify,
  dive,
  get,
  joins,
  pinify,
} from '../'


describe('util', () => {

  test('happy', async () => {
    expect(typeof camelify).equal('function')
    expect(typeof dive).equal('function')
    expect(typeof get).equal('function')
    expect(typeof joins).equal('function')
    expect(typeof pinify).equal('function')
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

})
