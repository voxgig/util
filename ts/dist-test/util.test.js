"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shape_1 = require("shape");
const __1 = require("../");
// ---------------------------------------------------------------------------
// Shared cross-language parity specs (top-level test/*.tsv).
//
// Each row is (name, args, expected). The same fixtures drive the Go suite, so
// a behavioural drift between the two implementations fails one of them. `args`
// is the logical argument list; the adapter below maps it to a real call.
// ---------------------------------------------------------------------------
const SPEC_DIR = node_path_1.default.join(__dirname, '..', '..', 'test');
// Canonical JSON: object keys sorted recursively, undefined normalised to null,
// so two structurally equal values compare equal regardless of key order (and
// so Go's key-sorted json.Marshal output lines up with the same fixtures).
function sortKeys(v) {
    if (Array.isArray(v)) {
        return v.map(sortKeys);
    }
    if (null != v && 'object' === typeof v && !(v instanceof Error)) {
        const out = {};
        for (const k of Object.keys(v).sort()) {
            out[k] = sortKeys(v[k]);
        }
        return out;
    }
    return undefined === v ? null : v;
}
const canon = (v) => JSON.stringify(sortKeys(v));
function loadSpec(name) {
    const text = node_fs_1.default.readFileSync(node_path_1.default.join(SPEC_DIR, name + '.tsv'), 'utf8');
    const rows = [];
    const lines = text.split('\n');
    // Line 0 is the header (name/args/expected).
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if ('' === line.trim() || line.startsWith('#')) {
            continue;
        }
        const t1 = line.indexOf('\t');
        const t2 = line.indexOf('\t', t1 + 1);
        rows.push({
            name: line.slice(0, t1),
            args: JSON.parse(line.slice(t1 + 1, t2)),
            expected: JSON.parse(line.slice(t2 + 1)),
        });
    }
    return rows;
}
const ADAPTERS = {
    camelify: (a) => (0, __1.camelify)(a[0]),
    dive: (a) => (0, __1.dive)(a[0], ...a.slice(1)),
    get: (a) => (0, __1.get)(a[0], a[1]),
    joins: (a) => (0, __1.joins)(a[0], ...a.slice(1)),
    pinify: (a) => (0, __1.pinify)(a[0]),
    order: (a) => (0, __1.order)(a[0], null == a[1] ? {} : { order: a[1] }),
    entity: (a) => (0, __1.entity)(a[0]),
    stringify: (a) => (0, __1.stringify)(a[0]),
    decircular: (a) => (0, __1.decircular)(a[0]),
};
(0, node_test_1.describe)('shared parity specs', () => {
    for (const fn of Object.keys(ADAPTERS)) {
        (0, node_test_1.describe)(fn, () => {
            for (const row of loadSpec(fn)) {
                (0, node_test_1.test)(row.name, () => {
                    node_assert_1.default.equal(canon(ADAPTERS[fn](row.args)), canon(row.expected));
                });
            }
        });
    }
});
// ---------------------------------------------------------------------------
// TypeScript-specific cases: behaviour that cannot be expressed as a shared
// fixture (function arguments, cycles, undefined), and the deliberate
// divergences the Go port does not reproduce.
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('ts-only', () => {
    (0, node_test_1.test)('happy', () => {
        for (const fn of [__1.camelify, __1.dive, __1.get, __1.joins, __1.pinify, __1.entity, __1.order, __1.stringify, __1.decircular]) {
            node_assert_1.default.equal(typeof fn, 'function');
        }
    });
    (0, node_test_1.test)('dive mapper form', () => {
        // Mapper as the 2nd argument returns a keyed object.
        node_assert_1.default.deepStrictEqual((0, __1.dive)({ a: { b: 1 }, c: { d: 2 } }, (path, leaf) => [path.join('.'), leaf]), { 'a.b': 1, 'c.d': 2 });
        // A null key omits the entry.
        node_assert_1.default.deepStrictEqual((0, __1.dive)({ a: { b: 1 }, c: { d: 2 } }, (path, leaf) => ['b' === path[1] ? null : path.join('.'), leaf]), { 'c.d': 2 });
        // Mapper as the 3rd argument (with an explicit depth).
        node_assert_1.default.deepStrictEqual((0, __1.dive)({ a: { b: { c: 1 } } }, 3, (path, leaf) => [path.join('/'), leaf]), { 'a/b/c': 1 });
    });
    (0, node_test_1.test)('dive node with only inherited keys becomes a leaf', () => {
        // hasOwnKeys is own-keys-only, so a node whose only enumerable key is
        // inherited is not recursed into (it would contribute nothing); it is
        // emitted as a leaf instead of vanishing. (Go maps have no prototype.)
        const child = Object.create({ inh: 1 });
        node_assert_1.default.deepStrictEqual((0, __1.dive)({ a: child, z: { k: 1 } }, 3), [
            [['a'], child],
            [['z', 'k'], 1],
        ]);
    });
    (0, node_test_1.test)('joins Infinity matches String()', () => {
        // TS renders non-finite numbers as JS String() does; the Go port special-
        // cases the same values so both agree.
        node_assert_1.default.equal((0, __1.joins)(['x', Infinity, 'y', -Infinity], ':'), 'x:Infinity:y:-Infinity');
        node_assert_1.default.equal((0, __1.joins)(['x', NaN], ':'), 'x:NaN');
    });
    (0, node_test_1.test)('joins nulls non-finite numbers nested in an object/array element', () => {
        // Inside a serialised container, non-finite numbers become null (both
        // languages); the Go port normalises them before json.Marshal.
        node_assert_1.default.equal((0, __1.joins)(['x', { a: NaN, b: Infinity }], ':'), 'x:{"a":null,"b":null}');
        node_assert_1.default.equal((0, __1.joins)(['x', [1, NaN]], ':'), 'x:[1,null]');
    });
    (0, node_test_1.test)('dive skips holes in a sparse array', () => {
        // Object.keys omits holes, so no spurious `undefined` leaf is produced.
        const sparse = [];
        sparse[1] = 'y';
        node_assert_1.default.deepStrictEqual((0, __1.dive)({ a: sparse }), [[['a', '1'], 'y']]);
    });
    (0, node_test_1.test)('joins non-serialisable elements render empty', () => {
        // A function serialises to undefined -> '' (matches Go's json.Marshal path).
        node_assert_1.default.equal((0, __1.joins)(['x', () => 1], ':'), 'x:');
        // A cyclic element throws inside JSON.stringify and is caught -> '' (Go's
        // json.Marshal errors and yields '' too).
        const c = { a: 1 };
        c.self = c;
        node_assert_1.default.equal((0, __1.joins)(['x', c], ':'), 'x:');
    });
    (0, node_test_1.test)('stringify cycles, undefined, and insertion order', () => {
        const c = { a: 1 };
        c.self = c;
        node_assert_1.default.equal((0, __1.stringify)(c), '{"a":1,"self":"[Circular *]"}');
        // undefined round-trips as undefined (Go cannot represent this).
        node_assert_1.default.equal((0, __1.stringify)(undefined), undefined);
        // Insertion order is preserved (Go's encoding/json sorts keys).
        node_assert_1.default.equal((0, __1.stringify)({ b: 1, a: 2 }), '{"b":1,"a":2}');
        // replacer / indent are forwarded to JSON.stringify.
        node_assert_1.default.equal((0, __1.stringify)({ a: 1 }, null, 2), '{\n  "a": 1\n}');
    });
    (0, node_test_1.test)('decircular cycles and Error handling', () => {
        // Nested object cycle.
        const parent = { child: { name: 'kid' } };
        parent.child.parent = parent;
        const r = (0, __1.decircular)(parent);
        node_assert_1.default.equal(r.child.name, 'kid');
        node_assert_1.default.equal(r.child.parent, '[Circular *]');
        // Array cycle.
        const arr = [1];
        arr.push(arr);
        const ra = (0, __1.decircular)(arr);
        node_assert_1.default.equal(ra[0], 1);
        node_assert_1.default.match(ra[1], /Circular/);
        // Error: cloned onto the Error prototype, own enumerable props walked,
        // message/stack (non-enumerable) excluded.
        const err = Object.assign(new Error('boom'), { code: 500, detail: { a: 1 } });
        const de = (0, __1.decircular)(err);
        node_assert_1.default.ok(de instanceof Error);
        node_assert_1.default.equal((0, __1.stringify)(err), '{"code":500,"detail":{"a":1}}');
    });
    (0, node_test_1.test)('order preserves insertion order with no sort, and does not mutate input', () => {
        // No sort: TS keeps insertion order (Go returns key order — a documented
        // divergence, so this is a TS-only assertion).
        node_assert_1.default.deepStrictEqual((0, __1.order)({ b: { title: 'B' }, a: { title: 'A' } }, {}), [
            { key: 'b', title: 'B' },
            { key: 'a', title: 'A' },
        ]);
        node_assert_1.default.deepStrictEqual((0, __1.order)({}, {}), []);
        // human$ must not leak key / title$ back onto the caller's objects.
        const items = { a: { title: '10' }, b: { title: '2' } };
        (0, __1.order)(items, { order: { sort: 'human$' } });
        node_assert_1.default.deepStrictEqual(items, { a: { title: '10' }, b: { title: '2' } });
    });
    (0, node_test_1.test)('order accepts array-form sort / exclude / include (TS-only)', () => {
        // The TS spec fields also accept a pre-split array; Go's OrderSpec is
        // string-only, so this convenience is not part of the shared contract.
        const items = { code: { title: 'Coding' }, tech: { title: 'Technology' }, devr: { title: 'Dev' } };
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { sort: ['tech', 'code'] } }).map(i => i.key), ['tech', 'code']);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { exclude: ['code', 'tech'] } }).map(i => i.key), ['devr']);
        node_assert_1.default.deepStrictEqual((0, __1.order)(items, { order: { include: ['code'] } }).map(i => i.key), ['code']);
    });
    (0, node_test_1.test)('entity output feeds Shape.build', () => {
        const s0 = (0, __1.entity)({
            main: { ent: { qaz: { zed: {
                            valid: { '$$': 'Open' },
                            field: { foo: { valid: { a: 'Number' } } },
                        } } } },
        });
        node_assert_1.default.deepStrictEqual(s0, {
            'qaz/zed': { valid_json: { '$$': 'Open', foo: { a: 'Number' } } },
        });
        const g0 = shape_1.Shape.build(s0['qaz/zed'].valid_json);
        node_assert_1.default.equal(g0.stringify(), '{"foo":{"a":"Number"},"$$":"Open"}');
    });
    (0, node_test_1.test)('get walks into strings (JS-only; the Go port stops at scalars)', () => {
        // Documented divergence: JS bracket access indexes strings and reads
        // .length; Go's Get returns nil for a scalar node.
        node_assert_1.default.equal((0, __1.get)({ a: 'hi' }, 'a.0'), 'h');
        node_assert_1.default.equal((0, __1.get)('hello', '1'), 'e');
    });
    (0, node_test_1.test)('camelify full-Unicode uppercasing (JS-only; the Go port does not expand)', () => {
        // Documented divergence: JS toUpperCase expands ß -> SS and the ﬀ ligature
        // -> FF; Go's unicode.ToUpper leaves them unchanged.
        node_assert_1.default.equal((0, __1.camelify)('ß-abc'), 'SSAbc');
        node_assert_1.default.equal((0, __1.camelify)('ﬀxy'), 'FFxy');
    });
    (0, node_test_1.test)('getdlog', () => {
        const dlog = (0, __1.getdlog)('rev', '/some/where/file.ts');
        dlog('phase', 'start');
        dlog('phase', 'done');
        const all = (0, __1.getdlog)('rev').log();
        node_assert_1.default.equal(all.length, 2);
        node_assert_1.default.equal(all[0][1], 'file.ts');
        node_assert_1.default.equal((0, __1.getdlog)('rev').log('/any/dir/file.ts').length, 2);
        node_assert_1.default.equal((0, __1.getdlog)('rev').log('nope.ts').length, 0);
        // No-argument form exercises the tag/file fallbacks.
        const d2 = (0, __1.getdlog)();
        node_assert_1.default.equal(d2.tag, '-');
        node_assert_1.default.equal(d2.file, '-');
        d2('x');
        node_assert_1.default.ok((0, __1.getdlog)('-').log().length >= 1);
    });
    (0, node_test_1.test)('showChanges logs merged and conflicted files', () => {
        const calls = [];
        const log = {
            info: (o) => calls.push(o),
            trace() { }, debug() { }, warn() { }, error() { }, fatal() { },
        };
        (0, __1.showChanges)(log, 'pt', { files: { merged: ['/a/b.txt'], conflicted: ['/a/c.txt'] } }, '/a');
        node_assert_1.default.equal(calls.length, 2);
        node_assert_1.default.equal(calls[0].merge, true);
        node_assert_1.default.equal(calls[1].conflict, true);
        // A cwd already ending in a path separator is used as-is.
        calls.length = 0;
        (0, __1.showChanges)(log, 'pt', { files: { merged: [node_path_1.default.sep + 'a' + node_path_1.default.sep + 'd.txt'], conflicted: [] } }, node_path_1.default.sep + 'a' + node_path_1.default.sep);
        node_assert_1.default.equal(calls.length, 1);
        // Default cwd branch (no explicit cwd).
        calls.length = 0;
        (0, __1.showChanges)(log, 'pt', { files: { merged: [], conflicted: [] } });
        node_assert_1.default.equal(calls.length, 0);
    });
    (0, node_test_1.test)('prettyPino builds a logger (best-effort)', () => {
        // A provided logger is returned unchanged.
        const fake = { info() { } };
        node_assert_1.default.equal((0, __1.prettyPino)('x', { pino: fake }), fake);
        // Level-selection branches: true -> debug, string -> that level, else info.
        // (The pretty messageFormat closure writes to fd 1 via sonic-boom, so it is
        // left as best-effort rather than driven here — it would corrupt TAP.)
        for (const opts of [{ debug: true }, { debug: 'warn' }, {}]) {
            const log = (0, __1.prettyPino)('svc', opts);
            node_assert_1.default.equal(typeof log.info, 'function');
        }
    });
});
//# sourceMappingURL=util.test.js.map