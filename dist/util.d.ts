import Fs from 'node:fs';
import Pino from 'pino';
import { Gubu } from 'gubu';
type DiveMapper = (path: any[], leaf: any) => any[];
type FST = typeof Fs;
type Log = {
    trace: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    fatal: (...args: any[]) => void;
};
declare function prettyPino(name: string, opts: {
    pino?: ReturnType<typeof Pino>;
    debug?: boolean | string;
}): import("pino").Logger<string, boolean>;
declare function dive(node: any, depth?: number | DiveMapper, mapper?: DiveMapper): any[];
declare function joins(arr: any[], ...seps: string[]): string;
declare function get(root: any, path: string | string[]): any;
declare function camelify(input: any[] | string): string;
declare function pinify(path: string[]): string;
declare function entity(model: any): any;
declare function order(itemMap: Record<string, {
    title?: string;
}>, spec: {
    order?: {
        sort?: string;
        exclude?: string;
        include?: string;
    };
}): any[];
declare function showChanges(log: Log, point: string, jres: {
    files: {
        merged: string[];
        conflicted: string[];
    };
}, cwd?: string): void;
declare function getdlog(tagin?: string, filepath?: string): ((...args: any[]) => void) & {
    tag: string;
    file: string;
    log: (fp?: string) => any[];
};
export type { FST, Log, };
export { dive, joins, get, pinify, camelify, entity, order, showChanges, getdlog, prettyPino, Pino, Gubu, };
