import Pino from 'pino';
type DiveMapper = (path: any[], leaf: any) => any[];
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
export { dive, joins, get, pinify, camelify, entity, order, prettyPino, Pino, };
