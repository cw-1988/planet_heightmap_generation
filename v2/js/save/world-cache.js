// The world cache (docs/world-cache.md): Evolution's worlds kept in this browser's IndexedDB as planet files
// (planet-file.js), so the same world opened again — a reload, tomorrow's session — opens in seconds instead of being
// simulated and detailed again. A world is found by its settings (the history's own: seed, continent, length, ending,
// plates, kept going); it is used only while the code that made it is the same — a fingerprint of every module the
// history's worker loads, and another of the finish's, stored with it. A history made by other code still opens, marked
// an earlier version (Build new version builds it again); so does a detailed moment made by another finish or fast mode
// (Add detail again makes it with today's). ?cache=0 turns it off.

const DB = 'orogen-worlds', STORE = 'worlds', KEEP = 3;
export const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cache') === '0';

// ── the code's fingerprints: every module a part's code loads, found from its entry files by the relative paths quoted in
// them (imports, and the workers and data they load by URL: `new URL('./x-worker.js', import.meta.url)`) ──
const HISTORY_ENTRIES = ['../app/history-runner.js', '../tectonics/scenarios/terrain-scenes.js', '../tectonics/ending.js', '../core/sim-mesh.js', '../core/seed.js', './planet-file.js'];
const FINISH_ENTRIES = ['../finish/finish-worker.js', './planet-file.js'];
const PATH = /['"`](\.{1,2}\/[^'"`\s]+?\.(?:m?js|json))['"`]/g;

/** A 53-bit hash of a string (cyrb53), as 14 hex digits. */
function hash53(s, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const fetched = new Map();
/** A module's text, fetched once a page (every fingerprint worked out on it shares it). */
const fileText = u => {
    if (!fetched.has(u)) fetched.set(u, fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? r.text() : `missing ${r.status}`)));
    return fetched.get(u);
};

/** The fingerprint of the modules reachable from `entries` (relative to `base`: this module by default): their URLs and
 *  texts, hashed in URL order. */
export async function codePrint(entries, base = import.meta.url) {
    const texts = new Map(), here = base;
    let wave = entries.map(e => new URL(e, here).href);
    while (wave.length) {
        const next = [];
        await Promise.all(wave.map(async u => {
            if (texts.has(u)) return;
            texts.set(u, '');
            const text = await fileText(u);
            texts.set(u, text);
            if (u.endsWith('.json')) return;
            for (const m of text.matchAll(PATH)) { const v = new URL(m[1], u).href; if (!texts.has(v)) next.push(v); }
        }));
        wave = next;
    }
    const urls = [...texts.keys()].sort();
    const all = urls.map(u => `${new URL(u).pathname}\n${texts.get(u)}`).join('\n\0');
    return { print: hash53(all) + hash53(all, 1), files: urls.length };
}
let prints = null;
/** The two fingerprints, worked out once a page. */
export const codePrints = () => (prints ??= Promise.all([codePrint(HISTORY_ENTRIES), codePrint(FINISH_ENTRIES)])
    .then(([history, finish]) => {
        console.info(`[world cache] code fingerprints: history ${history.print} (${history.files} files), finish ${finish.print} (${finish.files} files)`);
        return { history: history.print, finish: finish.print };
    }));

// ── the store: a database of kept records ({key, usedAt, …}), the newest `keep` of them; Evolution's here, Generate's
// (js/world-keep.js) its own ──
/** A store of kept records in the IndexedDB database `name` (store `worlds`): get(key) (marking it used), put(rec) (the
 *  oldest past `keep` let go, and when the browser runs short of room). Either throws where IndexedDB fails. */
export function keptStore(name, keep) {
    let dbp = null;
    // (opened at its own version: a database there without the store — opened bare, e.g. from the console, which makes an
    // empty version 1 — is opened a version up, the store made then, instead of every lookup failing for good)
    const openDb = version => new Promise((resolve, reject) => {
        const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    const db = () => (dbp ??= openDb().then(d => {
        if (d.objectStoreNames.contains(STORE)) return d;
        const v = d.version + 1;
        d.close();
        return openDb(v);
    }));
    const done = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    async function tx(mode, fn) {
        const t = (await db()).transaction(STORE, mode), out = await fn(t.objectStore(STORE));
        await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = t.onabort = () => reject(t.error); });
        return out;
    }
    return {
        get: key => tx('readwrite', async s => {
            const r = await done(s.get(key));
            if (r) { r.usedAt = Date.now(); s.put(r); }
            return r;
        }),
        async put(rec) {
            navigator.storage?.persist?.().catch(() => {});
            for (let tries = 0; ; tries++) {
                try {
                    await tx('readwrite', async s => {
                        s.put(rec);
                        const all = (await done(s.getAll())).filter(r => r.key !== rec.key).sort((a, b) => b.usedAt - a.usedAt);
                        for (const r of all.slice(keep - 1)) s.delete(r.key);
                    });
                    return;
                } catch (err) {
                    // (short of room: the oldest let go, then tried again)
                    if (err?.name !== 'QuotaExceededError' || tries > keep) throw err;
                    const oldest = (await tx('readonly', s => done(s.getAll()))).filter(r => r.key !== rec.key).sort((a, b) => a.usedAt - b.usedAt)[0];
                    if (!oldest) throw err;
                    await tx('readwrite', s => s.delete(oldest.key));
                }
            }
        },
    };
}
const worlds = keptStore(DB, KEEP);

/** A world's key: the settings its history is made from. */
export const worldKey = ({ seed, cont, len, ending, sim, more }) => `${seed}|${cont}|${len}|${ending}|${sim}|${more || 0}`;

/**
 * The world kept for `key`: {key, blob, savedAt, historyOk (its history's code is today's), finishOk (its detailed
 * moment's finish and fast mode are today's too), detail ({time, cells}) or null} — or null (none, the cache off or
 * unavailable). A world kept by other code is still returned, to show until a new version is built.
 */
export async function findWorld(key, fast) {
    if (OFF || typeof indexedDB === 'undefined') return null;
    try {
        const [code, rec] = await Promise.all([codePrints(), worlds.get(key)]);
        if (!rec) return null;
        const historyOk = rec.historyCode === code.history;
        if (!historyOk) console.info(`[world cache] ${key}: kept by other history code (${rec.historyCode}) — shown until a new version is built`);
        return { key, blob: rec.blob, savedAt: rec.savedAt, detail: rec.detail, historyOk, finishOk: !!rec.detail && rec.finishCode === code.finish && rec.fast === fast,
            finishCode: rec.finishCode, fast: rec.fast };
    } catch (err) { console.warn('[world cache] could not look a world up', err); return null; }
}

/** Keep a world's planet file under `key` (the newest KEEP worlds kept; the oldest let go when the browser runs short).
 *  `finishCode`: the finish that made its detailed moment, when not today's (a moment kept from an earlier finish, kept
 *  again with its history — it keeps its own stamp, never passed off as today's). */
export async function keepWorld(key, blob, { detail = null, fast = '', finishCode = null } = {}) {
    if (OFF || typeof indexedDB === 'undefined') return false;
    try {
        const code = await codePrints(), now = Date.now();
        const rec = { key, historyCode: code.history, finishCode: finishCode ?? code.finish, fast, detail, bytes: blob.size, savedAt: now, usedAt: now, blob };
        await worlds.put(rec);
        return true;
    } catch (err) { console.warn('[world cache] could not keep this world', err); return false; }
}
