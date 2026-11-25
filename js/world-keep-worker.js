// Keeps a finished world in IndexedDB off the page (world-keep.js; docs/world-cache.md, "Generate"): the ZIP's deflate and
// CRC — seconds for a large world — run here, so the page stays free while it is saved. The page sends the encoded
// trees' JSON and, asked for more, their bytes a slice at a time (a copy of each, handed over), so the world is never
// copied whole: at most one slice in flight beside it.

import { keptStore } from '../v2/js/save/world-cache.js';
import { ZipWriter } from '../v2/js/save/zip-io.js';

const stores = new Map();
let answer = null;

/** The page's next slice of a part's bytes: {pieces, done}. */
const more = (id, name) => new Promise(resolve => { answer = resolve; postMessage({ type: 'more', id, name }); });

async function keep({ id, store, keep, key, code, parts }) {
    try {
        const t0 = performance.now(), zip = new ZipWriter();
        for (const { name, json, bin } of parts) {
            await zip.add(`${name}.json`, [new TextEncoder().encode(json)]);
            if (bin) await zip.add(`${name}.bin`, (async function* () {
                for (;;) {
                    const m = await more(id, name);
                    yield* m.pieces;
                    if (m.done) return;
                }
            })());
        }
        const blob = zip.finish(), now = Date.now();
        if (!stores.has(store)) stores.set(store, keptStore(store, keep));
        await stores.get(store).put({ key, code, bytes: blob.size, savedAt: now, usedAt: now, blob });
        postMessage({ type: 'kept', id, bytes: blob.size, ms: performance.now() - t0 });
    } catch (err) {
        postMessage({ type: 'failed', id, error: String(err?.message ?? err) });
    }
}

self.onmessage = ({ data: m }) => {
    if (m.type === 'keep') keep(m);
    else if (m.type === 'pieces') { const a = answer; answer = null; a?.(m); }
};
