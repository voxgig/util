"use strict";
/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gubu = exports.Pino = void 0;
exports.camelify = camelify;
exports.decircular = decircular;
exports.dive = dive;
exports.entity = entity;
exports.get = get;
exports.getdlog = getdlog;
exports.joins = joins;
exports.order = order;
exports.pinify = pinify;
exports.showChanges = showChanges;
exports.stringify = stringify;
exports.prettyPino = prettyPino;
const node_path_1 = __importDefault(require("node:path"));
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
            messageFormat: (log, _messageKey, levelLabel, _extra) => {
                const fullname = `${log.name}${log.cmp === log.name ? '' : '/' + log.cmp}`;
                let note = ('string' == typeof log.note ? log.note :
                    null != log.note ? stringify(log.note, null, 2) : '').replaceAll(CWD, '.');
                if (log.err && !log.err.__logged__) {
                    log.err.__logged__ = true;
                    // May not be an actual Error instance.
                    log.err.message = log.err.message ?? log.err.msg;
                    if (log.err.stack) {
                        note += '\n  \n  ' + log.err.stack;
                    }
                    else if (log.err.message) {
                        note += '\n  ' + log.err.message.replace(/\n/g, '  \n');
                    }
                    for (let ek in log.err) {
                        if (!(ek in { type: 1, name: 1, message: 1, stack: 1, __logged__: 1 })) {
                            note += `\n  ${ek}: ${stringify(log.err[ek]).replace(/\n/g, '  \n')}`;
                        }
                    }
                    note += '\n  ';
                }
                const point = (log.point || '').padEnd(20);
                let msg = `${fullname.padEnd(22).padStart(6 - levelLabel.length)} ${point} ` +
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
function hasOwnKeys(obj) {
    for (const _ in obj)
        return true;
    return false;
}
function diveInternal(node, d, prefix, items) {
    for (const [key, child] of Object.entries(node || {})) {
        if ('$' === key) {
            items.push([prefix.slice(), child]);
        }
        else if (d <= 1 ||
            null == child ||
            'object' !== typeof child ||
            !hasOwnKeys(child)) {
            items.push([[...prefix, key], child]);
        }
        else {
            diveInternal(child, d - 1, [...prefix, key], items);
        }
    }
}
function dive(node, depth, mapper) {
    let d = (null == depth || 'number' != typeof depth) ? 2 : depth;
    mapper = 'function' === typeof depth ? depth : mapper;
    let items = [];
    diveInternal(node, d, [], items);
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
        Object.entries(ent.field).forEach((n) => {
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
        const key_order_set = new Set(key_order.filter((k) => k !== 'human$' && k !== 'alpha$'));
        key_order = key_order
            .map((k, _) => 'human$' === k ? (_ = 1 + items.reduce((a, n) => (Math.max(a, n.title.length)), 0),
            items
                .filter((item) => !key_order_set.has(item.key))
                .map((item) => (item.title$ = item.title.padStart(_, '0'), item))
                .sort((a, b) => a.title$ > b.title$ ? 1 : a.title$ < b.title$ ? -1 : 0)
                .map((item) => item.key)) :
            'alpha$' === k ? (items
                .filter((item) => !key_order_set.has(item.key))
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
        const excludeSet = new Set(excludes);
        items = items.filter((item) => !excludeSet.has(item.key));
    }
    return items;
}
function order_include(items, itemMap, order_spec) {
    if (order_spec.include) {
        let includes = 'string' === typeof order_spec.include ?
            order_spec.include.split(/\s*,\s*/).map((s) => s.trim()) :
            order_spec.include;
        const includeSet = new Set(includes);
        items = items.filter((item) => includeSet.has(item.key));
    }
    return items;
}
function showChanges(log, point, 
// Subset of JostracaResult
jres, cwd) {
    cwd = null == cwd ? CWD : cwd;
    cwd = cwd.endsWith(node_path_1.default.sep) ? cwd : cwd + node_path_1.default.sep;
    for (let file of jres.files.merged) {
        log.info({ point, file, merge: true, note: 'merged: ' + file.replace(cwd, '') });
    }
    for (let file of jres.files.conflicted) {
        log.info({ point, file, conflict: true, note: '** CONFLICT: ' + file.replace(cwd, '') });
    }
}
function getdlog(tagin, filepath) {
    const tag = tagin || '-';
    const file = node_path_1.default.basename(filepath || '-');
    const g = global;
    g.__dlog__ = (g.__dlog__ || []);
    const dlog = (...args) => g.__dlog__.push([tag, file, Date.now(), ...args]);
    dlog.tag = tag;
    dlog.file = file;
    dlog.log = (filepath, __f) => (__f = null == filepath ? null : node_path_1.default.basename(filepath),
        g.__dlog__.filter((n) => n[0] === tag && (null == __f || n[2] === __f)));
    return dlog;
}
function stringify(val, replacer, indent) {
    return JSON.stringify(decircular(val), replacer, indent);
}
// Based on:
// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
// MIT License Version 1.0.0
function decircular(object) {
    const seenObjects = new WeakMap();
    const path = [];
    function internalDecircular(value) {
        if (!(value !== null && typeof value === 'object')) {
            return value;
        }
        const existingPath = seenObjects.get(value);
        if (existingPath) {
            return `[Circular *${existingPath.join('.')}]`;
        }
        seenObjects.set(value, path.slice());
        const newValue = value instanceof Error ? value : Array.isArray(value) ? [] : {};
        for (const [key2, value2] of Object.entries(value)) {
            path.push(key2);
            newValue[key2] = internalDecircular(value2);
            path.pop();
        }
        seenObjects.delete(value);
        return newValue;
    }
    return internalDecircular(object);
}
//# sourceMappingURL=util.js.map