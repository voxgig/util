"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const shape_1 = require("shape");
const __1 = require("../");
(0, node_test_1.describe)('util', () => {
    (0, node_test_1.test)('happy', async () => {
        node_assert_1.default.equal(typeof __1.camelify, 'function');
        node_assert_1.default.equal(typeof __1.dive, 'function');
        node_assert_1.default.equal(typeof __1.get, 'function');
        node_assert_1.default.equal(typeof __1.joins, 'function');
        node_assert_1.default.equal(typeof __1.pinify, 'function');
        node_assert_1.default.equal(typeof __1.entity, 'function');
    });
    (0, node_test_1.test)('camelify', async () => {
        node_assert_1.default.equal((0, __1.camelify)('foo-bar'), 'FooBar');
    });
    (0, node_test_1.test)('dive', async () => {
        node_assert_1.default.deepStrictEqual((0, __1.dive)({
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
        ]);
    });
    (0, node_test_1.test)('get', async () => {
        node_assert_1.default.equal((0, __1.get)({ a: { b: 1 } }, 'a.b'), 1);
    });
    (0, node_test_1.test)('joins', async () => {
        node_assert_1.default.equal((0, __1.joins)(['a', 1, 'b', 2, 'c', 3, 'd', 4, 'e', 5, 'f', 6], ':', ',', '/'), 'a:1,b:2/c:3,d:4/e:5,f:6');
    });
    (0, node_test_1.test)('pinify', async () => {
        node_assert_1.default.equal((0, __1.pinify)(['a', 'b', 'c', 'd']), 'a:b,c:d');
    });
    (0, node_test_1.test)('entity', async () => {
        const s0 = (0, __1.entity)({
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
        });
        // console.dir(s0, { depth: null })
        node_assert_1.default.deepStrictEqual(s0, {
            'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } }
        });
        const g0 = shape_1.Shape.build(s0['qaz/zed'].valid_json);
        // console.log(g0.stringify())
        node_assert_1.default.equal(g0.stringify(), '{"foo":{"a":"Number"},"$$":"Open"}');
    });
    (0, node_test_1.test)('stringify', async () => {
        node_assert_1.default.equal((0, __1.stringify)({ a: 1, b: 'hello' }), '{"a":1,"b":"hello"}');
        node_assert_1.default.equal((0, __1.stringify)(null), 'null');
        node_assert_1.default.equal((0, __1.stringify)(undefined), undefined);
        node_assert_1.default.equal((0, __1.stringify)(42), '42');
    });
    (0, node_test_1.test)('decircular', async () => {
        // Simple non-circular object passes through
        node_assert_1.default.deepStrictEqual((0, __1.decircular)({ a: 1, b: { c: 2 } }), { a: 1, b: { c: 2 } });
        // Handles null/undefined/primitives
        node_assert_1.default.equal((0, __1.decircular)(null), null);
        node_assert_1.default.equal((0, __1.decircular)(undefined), undefined);
        node_assert_1.default.equal((0, __1.decircular)(42), 42);
        node_assert_1.default.equal((0, __1.decircular)('hello'), 'hello');
        // Detects circular reference
        const obj = { a: 1 };
        obj.self = obj;
        const result = (0, __1.decircular)(obj);
        node_assert_1.default.equal(result.a, 1);
        node_assert_1.default.equal(result.self, '[Circular *]');
        // Handles nested circular reference
        const parent = { child: { name: 'kid' } };
        parent.child.parent = parent;
        const result2 = (0, __1.decircular)(parent);
        node_assert_1.default.equal(result2.child.name, 'kid');
        node_assert_1.default.equal(result2.child.parent, '[Circular *]');
        // Handles arrays
        node_assert_1.default.deepStrictEqual((0, __1.decircular)([1, 2, { a: 3 }]), [1, 2, { a: 3 }]);
        // Deeply nested non-circular object
        const deep = { a: { b: { c: { d: { e: 5 } } } } };
        node_assert_1.default.deepStrictEqual((0, __1.decircular)(deep), { a: { b: { c: { d: { e: 5 } } } } });
    });
    (0, node_test_1.test)('order', async () => {
        node_assert_1.default.deepStrictEqual((0, __1.order)({}, {}), []);
        const items = {
            code: { title: 'Coding' },
            tech: { title: 'Technology' },
            devr: { title: 'Developer Relations' },
        };
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, {}), [
            { key: 'code', title: 'Coding' },
            { key: 'tech', title: 'Technology' },
            { key: 'devr', title: 'Developer Relations' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { exclude: 'code,tech' } }), [
            { key: 'devr', title: 'Developer Relations' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { include: 'code,tech' } }), [
            { key: 'code', title: 'Coding' },
            { key: 'tech', title: 'Technology' },
        ]);
        // exclude wins
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { exclude: 'code', include: 'code,tech' } }), [
            { key: 'tech', title: 'Technology' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: {} }), [
            { key: 'code', title: 'Coding' },
            { key: 'tech', title: 'Technology' },
            { key: 'devr', title: 'Developer Relations' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { sort: 'alpha$' } }), [
            { key: 'code', title: 'Coding' },
            { key: 'devr', title: 'Developer Relations' },
            { key: 'tech', title: 'Technology' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { sort: 'tech,code' } }), [
            { key: 'tech', title: 'Technology' },
            { key: 'code', title: 'Coding' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { sort: 'tech,alpha$' } }), [
            { key: 'tech', title: 'Technology' },
            { key: 'code', title: 'Coding' },
            { key: 'devr', title: 'Developer Relations' },
        ]);
        const nums = {
            '1': { title: '1' },
            '10': { title: '10' },
            '2': { title: '2' },
            'tech': { title: 'Technology' },
        };
        node_assert_1.default.deepStrictEqual((0, __1.order)(nums, { order: { sort: 'alpha$' } }), [
            { key: '1', title: '1' },
            { key: '10', title: '10' },
            { key: '2', title: '2' },
            { key: 'tech', title: 'Technology' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)(nums, { order: { sort: 'human$' } }), [
            { title: '1', key: '1', 'title$': '00000000001' },
            { title: '2', key: '2', 'title$': '00000000002' },
            { title: '10', key: '10', 'title$': '00000000010' },
            { title: 'Technology', key: 'tech', 'title$': '0Technology' }
        ]);
    });
});
//# sourceMappingURL=util.test.js.map