// The zoomed view's detail tiles kept on disk (IndexedDB: the browser keeps values this large as files, out of the page's
// memory). DetailTiles (detail-tiles.js) puts each tile here as it is drawn and reads it back instead of drawing it again —
// zoomed out and back in, panned back, or painted for another layer. Only the world shown is kept, and only by this page:
// each page has a database of its own, held by a lock while the page lives; on start, those whose page is gone are deleted.
// A world kept in the world cache (its finished layers carry a `keptId`: Generate's, js/world-keep.js) keeps its tiles in
// a database every page shares instead, so a reload that opens the world from the cache finds them still drawn
// (docs/tile-disk.md, "Kept worlds"): the newest KEPT_WORLDS worlds' tiles, at most KEPT_MOST each.

// (reads under way at once: each read's ~1.6 MB comes back on the page's thread, and all of a view's at once — 156 asked in
// one frame on a view switch — held its frames at 45–100 ms for a quarter second; docs/tile-reads-queued.md)
const PREFIX = 'orogen-tiles-', STORE = 't', READS = 2;
const SHARED = 'orogen-kept-tiles', WORLDS = 'w', KEPT_WORLDS = 3, KEPT_MOST = 1000;

export class TileStore {
    /** @param {number} most  the most tiles kept (the oldest dropped past it, drawn again if wanted: ~1.6 MB each) */
    constructor(most = 2500) {
        this.most = most; this.world = 0;
        this.limit = most;                    // (the most for the world shown: fewer for a kept one, its tiles outliving the page)
        this.prefix = '0|';                   // (its tiles' keys on disk start so: the page's own world number, or a kept world's id)
        this.ready = null;                    // (a kept world: its tiles on disk being listed — reads wait for it)
        this.own = null; this.shared = null;
        this.keys = new Set();                // (the tiles stored for this world, oldest first)
        this.writing = new Map();             // (key → data: tiles still being written, read from here meanwhile)
        this.queue = []; this.reading = 0;    // (reads waiting, in the order asked — nearest the view's middle first — and under way)
        this.db = this.own = openOwn();
    }

    /** Another world: the tiles kept so far dropped (from this page's own database). `keptId`: a world kept in the world
     *  cache — its tiles in the shared database, those drawn before (by this page or one before it) found there. */
    reset(keptId = null) {
        this.world++; this.keys.clear(); this.writing.clear();
        for (const q of this.queue.splice(0)) q.ok(null);                 // (the last world's reads waiting: nothing for them)
        this.own.then(db => { try { db?.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch { /* (closed: nothing to clear) */ } });
        if (!keptId) { this.db = this.own; this.prefix = `${this.world}|`; this.limit = this.most; this.ready = null; return; }
        const world = this.world, prefix = this.prefix = `${keptId}|`;
        this.limit = Math.min(this.most, KEPT_MOST);
        this.db = this.shared ??= openShared();
        this.ready = this.db.then(db => db && new Promise(ok => {
            try {
                const tx = db.transaction([STORE, WORLDS], 'readwrite'), tiles = tx.objectStore(STORE), worlds = tx.objectStore(WORLDS);
                const r = tiles.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`));
                r.onsuccess = () => { if (world === this.world) for (const k of r.result) this.keys.add(k.slice(prefix.length)); };
                // (this world marked used; the tiles of those past the newest KEPT_WORLDS let go)
                worlds.put({ id: keptId, usedAt: Date.now() });
                const all = worlds.getAll();
                all.onsuccess = () => {
                    for (const w of all.result.filter(w => w.id !== keptId).sort((a, b) => b.usedAt - a.usedAt).slice(KEPT_WORLDS - 1)) {
                        worlds.delete(w.id); tiles.delete(IDBKeyRange.bound(`${w.id}|`, `${w.id}|￿`));
                    }
                };
                tx.oncomplete = tx.onerror = tx.onabort = () => ok();
            } catch { ok(); }
        }));
        if (world === this.world) this.ready.then(() => { if (world === this.world) { this.ready = null; this.next(); } });
    }

    /** Whether a tile is kept (or being written). */
    has(key) { return this.keys.has(key); }

    /** A tile drawn, kept. */
    put(key, data) {
        if (this.keys.has(key)) return;
        this.keys.add(key); this.writing.set(key, data);
        const world = this.world;
        this.db.then(db => {
            if (world !== this.world) return;
            let tx;
            try { tx = db.transaction(STORE, 'readwrite', { durability: 'relaxed' }); tx.objectStore(STORE).put(data, `${this.prefix}${key}`); }
            catch { this.drop(key, world); return; }                       // (no database: the tile drawn again when wanted)
            tx.oncomplete = () => { if (world === this.world && this.writing.get(key) === data) this.writing.delete(key); };
            tx.onerror = tx.onabort = () => this.drop(key, world);       // (the disk full, most often)
        });
        for (const old of this.keys) { if (this.keys.size <= this.limit) break; this.forget(old); }
    }

    /** A kept tile's data, or null (not kept, dropped meanwhile, the disk could not give it back, or `signal` aborted while
     *  it waited): READS at a time, the rest queued in the order asked. */
    get(key, signal = null) {
        if (this.ready) return new Promise(ok => { this.queue.push({ key, signal, ok }); });   // (a kept world's tiles still being listed)
        if (!this.keys.has(key)) return Promise.resolve(null);
        const w = this.writing.get(key);
        if (w) return Promise.resolve(w);
        return new Promise(ok => { this.queue.push({ key, signal, ok }); this.next(); });
    }

    /** The next queued reads started, up to READS under way. */
    next() {
        while (!this.ready && this.reading < READS && this.queue.length) {
            const { key, signal, ok } = this.queue.shift();
            const w = this.writing.get(key);
            if (signal?.aborted || !this.keys.has(key) || w) { ok(w ?? null); continue; }
            this.reading++;
            const id = `${this.prefix}${key}`, done = v => { this.reading--; ok(v); this.next(); };
            this.db.then(db => {
                try {
                    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
                    r.onsuccess = () => done(r.result ?? null); r.onerror = () => done(null);
                } catch { done(null); }
            });
        }
    }

    forget(key) {
        this.keys.delete(key); this.writing.delete(key);
        const id = `${this.prefix}${key}`;
        this.db.then(db => { try { db?.transaction(STORE, 'readwrite', { durability: 'relaxed' }).objectStore(STORE).delete(id); } catch { /* (closed) */ } });
    }
    drop(key, world) { if (world === this.world) { this.keys.delete(key); this.writing.delete(key); } }
}

/** This page's own database (null where there is none: every tile then drawn again when wanted, as before). */
function openOwn() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    const name = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const locks = navigator.locks;
    if (locks) {
        locks.request(name, () => new Promise(() => {}));          // (held while the page lives)
        Promise.all([locks.query(), indexedDB.databases()]).then(([held, all]) => {
            const live = new Set([...held.held, ...held.pending].map(l => l.name));
            for (const d of all) if (d.name?.startsWith(PREFIX) && d.name !== name && !live.has(d.name)) indexedDB.deleteDatabase(d.name);
        }).catch(() => {});
    }
    return new Promise(ok => {
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => {
            const db = r.result;
            addEventListener('pagehide', () => { db.close(); indexedDB.deleteDatabase(name); });
            ok(db);
        };
        r.onerror = r.onblocked = () => ok(null);
    });
}

/** The database every page shares for kept worlds' tiles (null where there is none). */
function openShared() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise(ok => {
        const r = indexedDB.open(SHARED, 1);
        r.onupgradeneeded = () => { r.result.createObjectStore(STORE); r.result.createObjectStore(WORLDS, { keyPath: 'id' }); };
        r.onsuccess = () => ok(r.result);
        r.onerror = r.onblocked = () => ok(null);
    });
}
