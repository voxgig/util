/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import Path from 'node:path'

import Pino from 'pino'
import PinoPretty from 'pino-pretty'

import { Gubu } from 'gubu'

type DiveMapper = (path: any[], leaf: any) => any[]

const CWD = process.cwd()


type FST = typeof Fs

type Log = {
  trace: (...args: any[]) => void
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
  fatal: (...args: any[]) => void
}


function prettyPino(name: string, opts: {
  pino?: ReturnType<typeof Pino>
  debug?: boolean | string
}) {
  let pino = opts.pino

  if (null == pino) {
    let pretty = PinoPretty({
      sync: true,
      ignore: 'name,pid,hostname',
      hideObject: true,
      messageFormat: (log: any, _messageKey: any, _levelLabel: any, _extra: any) => {
        const fullname = `${log.name}${log.cmp === log.name ? '' : '/' + log.cmp}`

        // let note = log.note ?
        //   (log.note.split(',').map((n: string) =>
        //     true === log[n] ? n : false === log[n] ? 'not-' + n :
        //       (null == log[n] ? n : (`${(log[n] + '').replace(CWF, '')}`)))).join(' ') :
        //   ''

        let note = (
          'string' == typeof log.note ? log.note :
            null != log.note ? JSON.stringify(log.note, null, 2) : ''
        ).replaceAll(CWD, '.')

        if (log.err && !log.err.__logged__) {
          // May not be an actual Error instance.
          log.err.message = log.err.message || log.err.msg

          if (log.err.stack) {
            note += ' ' + log.err.stack + '\n'
          }
          else if (log.err?.message) {
            note += ' ' + log.err.message + '\n'
          }
        }

        const point = (log.point || '').padEnd(20)
        let msg = `${fullname.padEnd(22)} ${point} ` +
          `${log.fail ? log.fail + ' ' : ''}${note}`

        if (true == log.break) {
          msg += '\n'
        }
        return msg
      },
      customPrettifiers: {
        // name: (name: any, _key: any, _log: any, extra: any) => `${extra.colors.blue(name)}`,
      }
    })

    const level = null == opts.debug ? 'info' :
      true === opts.debug ? 'debug' :
        'string' == typeof opts.debug ? opts.debug :
          'info'

    pino = Pino({
      name,
      level,
    },
      pretty
    )
  }

  return pino
}


function dive(node: any, depth?: number | DiveMapper, mapper?: DiveMapper): any[] {
  let d = (null == depth || 'number' != typeof depth) ? 2 : depth
  mapper = 'function' === typeof depth ? depth : mapper

  let items: any[] = []

  Object.entries(node || {}).reduce(
    (items: any[], entry: any[]) => {
      let key = entry[0]
      let child = entry[1]

      // console.log('CHILD', d, key, child)

      if ('$' === key) {
        // console.log('BBB', d)
        items.push([[], child])
      }
      else if (
        d <= 1 ||
        null == child ||
        'object' !== typeof child ||
        0 === Object.keys(child).length
      ) {
        // console.log('AAA', d)
        items.push([[key], child])
      }
      else {
        // console.log('CCC', d)
        let children = dive(child, d - 1)
        children = children.map(child => {
          child[0].unshift(key)
          return child
        })
        items.push(...children)
      }

      return items
    },
    items
  )

  // console.log('ITEMS', items)

  if (mapper) {
    return items.reduce(((a, entry) => {
      entry = (mapper as any)(entry[0], entry[1])
      if (null != entry[0]) {
        a[entry[0]] = entry[1]
      }
      return a
    }), {} as any)
  }

  return items
}


/*
 * , => a,b
 * :, => a:1,b:2
 * :,/ => a:1,b:2/c:3,d:4/e:5,f:6
*/
function joins(arr: any[], ...seps: string[]) {
  arr = arr || []
  seps = seps || []
  let sa = []
  for (let i = 0; i < arr.length; i++) {
    sa.push(arr[i])
    if (i < arr.length - 1) {
      for (let j = seps.length - 1; -1 < j; j--) {
        if (0 === (i + 1) % (1 << j)) {
          sa.push(seps[j])
          break
        }
      }
    }
  }
  return sa.join('')
}


function get(root: any, path: string | string[]): any {
  path = 'string' === typeof path ? path.split('.') : path
  let node = root
  for (let i = 0; i < path.length && null != node; i++) {
    node = node[path[i]]
  }
  return node
}


function camelify(input: any[] | string) {
  let parts = 'string' == typeof input ? input.split('-') : input.map(n => '' + n)
  return parts
    .map((p: string) => ('' === p ? '' : (p[0].toUpperCase() + p.substring(1))))
    .join('')
}


function pinify(path: string[]) {
  let pin = path
    .map((p: string, i: number) =>
      p + (i % 2 ? (i === path.length - 1 ? '' : ',') : ':'))
    .join('')
  return pin
}




// TODO: only works on base/name style entities - generalize
function entity(model: any) {
  let entries = dive(model.main.ent)
  let entMap: any = {}
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    let path = entry[0]

    // TODO: move EntShape to @voxgig/model
    // let ent = EntShape(entry[1])
    let ent = entry[1]

    // console.log('ENT', path, ent)

    let valid = ent.valid || {}

    Object.entries(ent.field).map((n: any[]) => {
      let name = n[0]
      let field = n[1]

      // console.log('FV', name, field)

      let fv = field.kind
      if (field.valid) {
        let vt = typeof field.valid
        if ('string' === vt) {
          fv += '.' + field.valid
        }
        else {
          fv = field.valid
        }
      }
      valid[name] = fv
    })

    // console.log(path, valid)

    entMap[path[0] + '/' + path[1]] = {
      valid_json: valid
    }
  }
  return entMap
}



function order(itemMap: Record<string, { title?: string }>, spec: {
  order?: {
    sort?: string
    exclude?: string
    include?: string
  }
}): any[] {
  let items = Object
    .entries(itemMap)
    .reduce((a: any[], n: any) => (n[1].key = (n[1].key || n[0]), a.push(n[1]), a), [])

  const ops: ((items: any[], itemMap: any, order_spec: typeof spec['order']) => any[])[] = [
    order_sort,
    order_exclude,
    order_include,
  ]
  for (let op of ops) {
    items = op(items, itemMap, spec?.order || {})
  }

  return items
}


function order_sort(items: any[], itemMap: any, order_spec: any): any[] {
  if (order_spec.sort) {
    let key_order = 'string' === typeof order_spec.sort ?
      order_spec.sort.split(/\s*,\s*/).map((s: string) => s.trim()) :
      order_spec.sort

    key_order = key_order
      .map((k: string, _: any) =>
        'human$' === k ? (
          _ = 1 + items.reduce((a: number, n: any) => (Math.max(a, n.title.length)), 0),
          items
            .filter((item: any) => !key_order.includes(item.key))
            .map((item: any) => (item.title$ = item.title.padStart(_, '0'), item))
            .sort((a: any, b: any) => a.title$ > b.title$ ? 1 : a.title$ < b.title$ ? -1 : 0)
            .map((item: any) => item.key)
        ) :
          'alpha$' === k ? (
            items
              .filter((item: any) => !key_order.includes(item.key))
              .sort((a: any, b: any) => a.title > b.title ? 1 : a.title < b.title ? -1 : 0)
              .map((item: any) => item.key)
          ) :
            k
      )
      .flat()

    items = key_order.map((k: string) => itemMap[k])
  }

  return items
}

function order_exclude(items: any[], itemMap: any, order_spec: any): any[] {
  if (order_spec.exclude) {
    let excludes = 'string' === typeof order_spec.exclude ?
      order_spec.exclude.split(/\s*,\s*/).map((s: string) => s.trim()) :
      order_spec.exclude
    items = items.filter((item: any) => !excludes.includes(item.key))
  }
  return items
}

function order_include(items: any[], itemMap: any, order_spec: any): any[] {
  if (order_spec.include) {
    let includes = 'string' === typeof order_spec.include ?
      order_spec.include.split(/\s*,\s*/).map((s: string) => s.trim()) :
      order_spec.include
    items = items.filter((item: any) => includes.includes(item.key))
  }
  return items
}




function showChanges(
  log: Log,
  point: string,
  // Subset of JostracaResult
  jres: {
    files: {
      merged: string[],
      conflicted: string[],
    }
  },
  cwd?: string
) {
  cwd = null == cwd ? CWD : cwd
  cwd = cwd.endsWith(Path.sep) ? cwd : cwd + Path.sep
  for (let file of jres.files.merged) {
    log.info({ point, file, merge: true, note: 'merged: ' + file.replace(cwd, '') })
  }

  for (let file of jres.files.conflicted) {
    log.info({ point, file, conflict: true, note: '** CONFLICT: ' + file.replace(cwd, '') })
  }
}


function getdlog(
  tagin?: string,
  filepath?: string)
  : ((...args: any[]) => void) &
  { tag: string, file: string, log: (fp?: string) => any[] } {
  const tag = tagin || '-'
  const file = Path.basename(filepath || '-')
  const g = global as any
  g.__dlog__ = (g.__dlog__ || [])
  const dlog = (...args: any[]) =>
    g.__dlog__.push([tag, file, Date.now(), ...args])
  dlog.tag = tag
  dlog.file = file
  dlog.log = (filepath?: string, __f?: string | null) =>
  (__f = null == filepath ? null : Path.basename(filepath),
    g.__dlog__.filter((n: any[]) => n[0] === tag && (null == __f || n[2] === __f)))
  return dlog
}


export type {
  FST,
  Log,
}

export {
  dive,
  joins,
  get,
  pinify,
  camelify,
  entity,
  order,
  showChanges,
  getdlog,

  prettyPino,
  Pino,
  Gubu,
}


