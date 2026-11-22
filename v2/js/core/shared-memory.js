// Memory the worker threads share instead of copying (docs/shared-memory.md). Only where SharedArrayBuffer is open: a
// cross-origin isolated page (the isolation toggle, on unless ?isolate=0: js/isolate.js) or Node run with OROGEN_SHARED=1. Elsewhere every
// call here hands back what it was given, and the workers get their copies as before.

const IS_NODE = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

/** Whether arrays can be shared between threads here. */
export const SHARED = typeof SharedArrayBuffer !== 'undefined' &&
    (globalThis.crossOriginIsolated === true || (IS_NODE && process.env.OROGEN_SHARED === '1'));

const kept = new WeakMap();                                     // (arrays that never change: a mesh's)

/** A typed array over shared memory with `a`'s values: `a` itself where nothing is shared, or it already is. A copy,
 *  taken now: what is written into `a` later is not in it. `keep`: for an array that never changes (a mesh's), the copy
 *  is kept and handed out again, so every finish on that mesh shares it for free. */
export function shared(a, keep = false) {
    if (!SHARED || a == null || !ArrayBuffer.isView(a) || a.buffer instanceof SharedArrayBuffer) return a;
    let s = keep ? kept.get(a) : null;
    if (!s) {
        s = new a.constructor(new SharedArrayBuffer(a.byteLength));
        s.set(a);
        if (keep) kept.set(a, s);
    }
    return s;
}

/** `o` with every typed array inside it (objects and arrays walked) replaced by shared(); other values as they are. */
export function sharedAll(o, keep = false) {
    if (!SHARED || o == null || typeof o !== 'object') return o;
    if (ArrayBuffer.isView(o)) return shared(o, keep);
    if (Array.isArray(o)) return o.map(v => sharedAll(v, keep));
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sharedAll(v, keep)]));
}
