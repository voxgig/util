"use strict";
/* Copyright © 2024 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gubu = exports.Pino = void 0;
exports.dive = dive;
exports.joins = joins;
exports.get = get;
exports.pinify = pinify;
exports.camelify = camelify;
exports.entity = entity;
exports.order = order;
exports.showChanges = showChanges;
exports.prettyPino = prettyPino;
const pino_1 = __importDefault(require("pino"));
exports.Pino = pino_1.default;
const pino_pretty_1 = __importDefault(require("pino-pretty"));
const gubu_1 = require("gubu");
Object.defineProperty(exports, "Gubu", { enumerable: true, get: function () { return gubu_1.Gubu; } });
const CWD = process.cwd();
function prettyPino(name, opts) {
    let pino = opts.pino;
    if (null == pino) {
        let pretty = (0, pino_pretty_1.default)({
            sync: true,
            ignore: 'name,pid,hostname',
            hideObject: true,
            messageFormat: (log, _messageKey, _levelLabel, _extra) => {
                const fullname = `${log.name}${log.cmp === log.name ? '' : '/' + log.cmp}`;
                // let note = log.note ?
                //   (log.note.split(',').map((n: string) =>
                //     true === log[n] ? n : false === log[n] ? 'not-' + n :
                //       (null == log[n] ? n : (`${(log[n] + '').replace(CWF, '')}`)))).join(' ') :
                //   ''
                let note = ('string' == typeof log.note ? log.note :
                    null != log.note ? JSON.stringify(log.note, null, 2) : '').replaceAll(CWD, '.');
                if (log.err && !log.err.__logged__) {
                    // May not be an actual Error instance.
                    log.err.message = log.err.message || log.err.msg;
                    if (log.err.stack) {
                        note += ' ' + log.err.stack + '\n';
                    }
                    else if (log.err?.message) {
                        note += ' ' + log.err.message + '\n';
                    }
                }
                const point = (log.point || '').padEnd(20);
                let msg = `${fullname.padEnd(22)} ${point} ` +
                    `${log.fail ? log.fail + ' ' : ''}${note}`;
                if (true == log.break) {
                    msg += '\n';
                }
                return msg;
            },
            customPrettifiers: {
            // name: (name: any, _key: any, _log: any, extra: any) => `${extra.colors.blue(name)}`,
            }
        });
        const level = null == opts.debug ? 'info' :
            true === opts.debug ? 'debug' :
                'string' == typeof opts.debug ? opts.debug :
                    'info';
        pino = (0, pino_1.default)({
            name,
            level,
        }, pretty);
    }
    return pino;
}
function dive(node, depth, mapper) {
    let d = (null == depth || 'number' != typeof depth) ? 2 : depth;
    mapper = 'function' === typeof depth ? depth : mapper;
    let items = [];
    Object.entries(node || {}).reduce((items, entry) => {
        let key = entry[0];
        let child = entry[1];
        // console.log('CHILD', d, key, child)
        if ('$' === key) {
            // console.log('BBB', d)
            items.push([[], child]);
        }
        else if (d <= 1 ||
            null == child ||
            'object' !== typeof child ||
            0 === Object.keys(child).length) {
            // console.log('AAA', d)
            items.push([[key], child]);
        }
        else {
            // console.log('CCC', d)
            let children = dive(child, d - 1);
            children = children.map(child => {
                child[0].unshift(key);
                return child;
            });
            items.push(...children);
        }
        return items;
    }, items);
    // console.log('ITEMS', items)
    if (mapper) {
        return items.reduce(((a, entry) => {
            entry = mapper(entry[0], entry[1]);
            if (null != entry[0]) {
                a[entry[0]] = entry[1];
            }
            return a;
        }), {});
    }
    return items;
}
/*
 * , => a,b
 * :, => a:1,b:2
 * :,/ => a:1,b:2/c:3,d:4/e:5,f:6
*/
function joins(arr, ...seps) {
    arr = arr || [];
    seps = seps || [];
    let sa = [];
    for (let i = 0; i < arr.length; i++) {
        sa.push(arr[i]);
        if (i < arr.length - 1) {
            for (let j = seps.length - 1; -1 < j; j--) {
                if (0 === (i + 1) % (1 << j)) {
                    sa.push(seps[j]);
                    break;
                }
            }
        }
    }
    return sa.join('');
}
function get(root, path) {
    path = 'string' === typeof path ? path.split('.') : path;
    let node = root;
    for (let i = 0; i < path.length && null != node; i++) {
        node = node[path[i]];
    }
    return node;
}
function camelify(input) {
    let parts = 'string' == typeof input ? input.split('-') : input.map(n => '' + n);
    return parts
        .map((p) => ('' === p ? '' : (p[0].toUpperCase() + p.substring(1))))
        .join('');
}
function pinify(path) {
    let pin = path
        .map((p, i) => p + (i % 2 ? (i === path.length - 1 ? '' : ',') : ':'))
        .join('');
    return pin;
}
// TODO: only works on base/name style entities - generalize
function entity(model) {
    let entries = dive(model.main.ent);
    let entMap = {};
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let path = entry[0];
        // TODO: move EntShape to @voxgig/model
        // let ent = EntShape(entry[1])
        let ent = entry[1];
        // console.log('ENT', path, ent)
        let valid = ent.valid || {};
        Object.entries(ent.field).map((n) => {
            let name = n[0];
            let field = n[1];
            // console.log('FV', name, field)
            let fv = field.kind;
            if (field.valid) {
                let vt = typeof field.valid;
                if ('string' === vt) {
                    fv += '.' + field.valid;
                }
                else {
                    fv = field.valid;
                }
            }
            valid[name] = fv;
        });
        // console.log(path, valid)
        entMap[path[0] + '/' + path[1]] = {
            valid_json: valid
        };
    }
    return entMap;
}
function order(itemMap, spec) {
    let items = Object
        .entries(itemMap)
        .reduce((a, n) => (n[1].key = (n[1].key || n[0]), a.push(n[1]), a), []);
    const ops = [
        order_sort,
        order_exclude,
        order_include,
    ];
    for (let op of ops) {
        items = op(items, itemMap, spec?.order || {});
    }
    return items;
}
function order_sort(items, itemMap, order_spec) {
    if (order_spec.sort) {
        let key_order = 'string' === typeof order_spec.sort ?
            order_spec.sort.split(/\s*,\s*/).map((s) => s.trim()) :
            order_spec.sort;
        key_order = key_order
            .map((k, _) => 'human$' === k ? (_ = 1 + items.reduce((a, n) => (Math.max(a, n.title.length)), 0),
            items
                .filter((item) => !key_order.includes(item.key))
                .map((item) => (item.title$ = item.title.padStart(_, '0'), item))
                .sort((a, b) => a.title$ > b.title$ ? 1 : a.title$ < b.title$ ? -1 : 0)
                .map((item) => item.key)) :
            'alpha$' === k ? (items
                .filter((item) => !key_order.includes(item.key))
                .sort((a, b) => a.title > b.title ? 1 : a.title < b.title ? -1 : 0)
                .map((item) => item.key)) :
                k)
            .flat();
        items = key_order.map((k) => itemMap[k]);
    }
    return items;
}
function order_exclude(items, itemMap, order_spec) {
    if (order_spec.exclude) {
        let excludes = 'string' === typeof order_spec.exclude ?
            order_spec.exclude.split(/\s*,\s*/).map((s) => s.trim()) :
            order_spec.exclude;
        items = items.filter((item) => !excludes.includes(item.key));
    }
    return items;
}
function order_include(items, itemMap, order_spec) {
    if (order_spec.include) {
        let includes = 'string' === typeof order_spec.include ?
            order_spec.include.split(/\s*,\s*/).map((s) => s.trim()) :
            order_spec.include;
        items = items.filter((item) => includes.includes(item.key));
    }
    return items;
}
function showChanges(log, point, 
// Subset of JostracaResult
jres) {
    for (let file of jres.files.merged) {
        log.info({ point, file, merge: true, note: 'merged: ' + file.replace(CWD, '.') });
    }
    for (let file of jres.files.conflicted) {
        log.info({ point, file, conflict: true, note: '** CONFLICT: ' + file.replace(CWD, '.') });
    }
}
//# sourceMappingURL=util.js.map