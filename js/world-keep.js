// Generate's world cache (docs/world-cache.md, "Generate"): the finished world kept in this browser's IndexedDB, so a
// reload, or the same planet code opened again, shows it in a second or two instead of building the ground and running the
// finish again. A world is found by its planet code (every slider, the edits and the paint), the fast mode and whether
// this is a phone (the finish's picture is narrower there); it is used only while the code that made it is the same — a
// fingerprint of every module the planet worker and the finish load. A world kept by other code is built again, and
// the new one takes its place. Its own database, apart from Evolution's: one page's worlds never push out the other's.
// ?cache=0 turns it off.

import { keptStore, codePrint, OFF } from '../v2/js/save/world-cache.js';
import { ZipReader } from '../v2/js/save/zip-io.js';
import { encodeTree, decodeTree, binPieces, allocArrays, arrayFiller } from '../v2/js/save/tree-codec.js';
import { pageFast } from '../v2/js/finish/fast-mode.js';

const KEEP = 3;
const ENTRIES = ['./planet-worker.js', './finish-landing.js', '../v2/js/finish/finish-worker.js', '../v2/js/evolution/finish-view.js',
    '../v2/js/evolution/detail-view.js'];             // (the zoomed-in tiles too: kept with the world, drawn by today's code)
const usable = () => !OFF && typeof indexedDB !== 'undefined';
let store = null, print = null;
const worlds = () => (store ??= keptStore('orogen-generate-worlds', KEEP));   // (its name the worker's too)
const codeNow = () => (print ??= codePrint(ENTRIES, import.meta.url).then(p => {
    console.info(`[world cache] Generate's code fingerprint ${p.print} (${p.files} files)`);
    return p.print;
}));

/** A world's key: its planet code, the fast mode, and a phone's narrower picture. */
export const worldKey = (code, touch) => `${code}|${pageFast()}|${touch ? 'touch' : ''}`;

/** The kept world under `key`, made by today's code: {world, fin, climateKey} (as keepWorld was given them), or null. */
export async function findWorld(key) {
    if (!usable()) return null;
    try {
        const [code, rec] = await Promise.all([codeNow(), worlds().get(key)]);
        if (!rec) return null;
        if (rec.code !== code) { console.info(`[world cache] ${key.slice(0, 24)}…: kept by other code (${rec.code}), built again`); return null; }
        const t0 = performance.now(), zip = await ZipReader.open(rec.blob);
        const part = async name => {
            const json = await zip.json(`${name}.json`), arrays = allocArrays(json.a);
            if (json.a.length) {
                const fill = arrayFiller(json.a, arrays);
                for await (const p of zip.pieces(`${name}.bin`)) fill.push(p);
                fill.done();
            }
            return decodeTree(json, arrays);
        };
        const out = { world: await part('world'), ...(await part('fin')) };
        console.info(`[world cache] opened a kept world (${(rec.bytes / 1e6).toFixed(1)} MB, kept ${new Date(rec.savedAt).toLocaleString()}) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
        return out;
    } catch (err) { console.warn('[world cache] could not open a kept world: it is built instead', err); return null; }
}

const SLICE = 8 << 20;                                 // (bytes handed to the saving worker at a time)
let saver = null, saving = Promise.resolve(), ids = 0;
const jobs = new Map();

/** The worker that deflates and stores a world (world-keep-worker.js): asks for a part's bytes a slice at a time. */
function keeper() {
    if (saver) return saver;
    saver = new Worker(new URL('./world-keep-worker.js', import.meta.url), { type: 'module' });
    saver.onmessage = ({ data: m }) => {
        const job = jobs.get(m.id);
        if (!job) return;
        if (m.type === 'more') {
            // (a copy of each piece, its buffer handed over: the page's arrays stay its own, never copied whole)
            const it = job.pieces[m.name], pieces = [];
            let n = 0, done = false;
            while (n < SLICE) {
                const r = it.next();
                if (r.done) { done = true; break; }
                pieces.push(r.value.slice()); n += r.value.length;
            }
            saver.postMessage({ type: 'pieces', pieces, done }, pieces.map(p => p.buffer));
        } else { jobs.delete(m.id); job.end(m); }
    };
    saver.onerror = e => { for (const [id, job] of jobs) { jobs.delete(id); job.end({ type: 'failed', error: e.message }); } };
    return saver;
}

/**
 * Keep a finished world under `key`: `world` its ground (plain data, typed arrays), `fin` its finished layers. Encoded
 * here (cheap: the arrays are referenced, not copied); deflated and stored by a worker, one world at a time.
 */
export function keepWorld(key, world, fin, climateKey) {
    if (!usable() || typeof Worker === 'undefined') return Promise.resolve(false);
    return (saving = saving.then(async () => {
        try {
            const t0 = performance.now();
            // (the finished layers without the screen's own caches: drawn again from them when they are wanted)
            const { paths, segments, grids, ...layers } = fin;
            const trees = { world: encodeTree(world), fin: encodeTree({ fin: layers, climateKey }) };
            const code = await codeNow(), id = ++ids;
            const m = await new Promise(end => {
                jobs.set(id, { end, pieces: Object.fromEntries(Object.entries(trees).map(([k, t]) => [k, binPieces(t)])) });
                keeper().postMessage({ type: 'keep', id, store: 'orogen-generate-worlds', keep: KEEP, key, code,
                    parts: Object.entries(trees).map(([name, t]) => ({ name, json: t.json, bin: t.byteLength > 0 })) });
            });
            if (m.type !== 'kept') throw new Error(m.error);
            console.info(`[world cache] kept this world (${(m.bytes / 1e6).toFixed(1)} MB) in ${((performance.now() - t0) / 1000).toFixed(1)} s, saved by a worker`);
            return true;
        } catch (err) { console.warn('[world cache] could not keep this world', err); return false; }
    }));
}
