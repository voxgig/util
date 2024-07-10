"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const gubu_1 = require("gubu");
const __1 = require("../");
(0, node_test_1.describe)('util', () => {
    (0, node_test_1.test)('happy', async () => {
        (0, code_1.expect)(typeof __1.camelify).equal('function');
        (0, code_1.expect)(typeof __1.dive).equal('function');
        (0, code_1.expect)(typeof __1.get).equal('function');
        (0, code_1.expect)(typeof __1.joins).equal('function');
        (0, code_1.expect)(typeof __1.pinify).equal('function');
        (0, code_1.expect)(typeof __1.entity).equal('function');
    });
    (0, node_test_1.test)('camelify', async () => {
        (0, code_1.expect)((0, __1.camelify)('foo-bar')).equal('FooBar');
    });
    (0, node_test_1.test)('dive', async () => {
        (0, code_1.expect)((0, __1.dive)({
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
        ]);
    });
    (0, node_test_1.test)('get', async () => {
        (0, code_1.expect)((0, __1.get)({ a: { b: 1 } }, 'a.b')).equal(1);
    });
    (0, node_test_1.test)('joins', async () => {
        (0, code_1.expect)((0, __1.joins)(['a', 1, 'b', 2, 'c', 3, 'd', 4, 'e', 5, 'f', 6], ':', ',', '/'))
            .equal('a:1,b:2/c:3,d:4/e:5,f:6');
    });
    (0, node_test_1.test)('pinify', async () => {
        (0, code_1.expect)((0, __1.pinify)(['a', 'b', 'c', 'd'])).equal('a:b,c:d');
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
        (0, code_1.expect)(s0).equal({
            'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } }
        });
        const g0 = gubu_1.Gubu.build(s0['qaz/zed'].valid_json);
        // console.log(g0.stringify())
        (0, code_1.expect)(g0.stringify()).equal('{"foo":{"a":"Number"},"$$":"Open()"}');
    });
});
//# sourceMappingURL=util.test.js.map