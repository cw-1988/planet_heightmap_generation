// The zoomed view's detail tiles kept on disk (IndexedDB: the browser keeps values this large as files, out of the page's
// memory). DetailTiles (detail-tiles.js) puts each tile here as it is drawn and reads it back instead of drawing it again —
// zoomed out and back in, panned back, or painted for another layer. Only the world shown is kept, and only by this page:
// each page has a database of its own, held by a lock while the page lives; on start, those whose page is gone are deleted.

const PREFIX = 'orogen-tiles-', STORE = 't';

export class TileStore {
    /** @param {number} most  the most tiles kept (the oldest dropped past it, drawn again if wanted: ~1.6 MB each) */
    constructor(most = 2500) {
        this.most = most; this.world = 0;
        this.keys = new Set();                // (the tiles stored for this world, oldest first)
        this.writing = new Map();             // (key → data: tiles still being written, read from here meanwhile)
        this.db = openOwn();
    }

    /** Another world: the tiles kept so far dropped. */
    reset() {
        this.world++; this.keys.clear(); this.writing.clear();
        this.db.then(db => { try { db?.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch { /* (closed: nothing to clear) */ } });
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
            try { tx = db.transaction(STORE, 'readwrite', { durability: 'relaxed' }); tx.objectStore(STORE).put(data, `${world}|${key}`); }
            catch { this.drop(key, world); return; }                       // (no database: the tile drawn again when wanted)
            tx.oncomplete = () => { if (world === this.world && this.writing.get(key) === data) this.writing.delete(key); };
            tx.onerror = tx.onabort = () => this.drop(key, world);       // (the disk full, most often)
        });
        for (const old of this.keys) { if (this.keys.size <= this.most) break; this.forget(old); }
    }

    /** A kept tile's data, or null (not kept, dropped meanwhile, or the disk could not give it back). */
    get(key) {
        if (!this.keys.has(key)) return Promise.resolve(null);
        const w = this.writing.get(key);
        if (w) return Promise.resolve(w);
        const id = `${this.world}|${key}`;
        return this.db.then(db => new Promise(ok => {
            try {
                const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
                r.onsuccess = () => ok(r.result ?? null); r.onerror = () => ok(null);
            } catch { ok(null); }
        }));
    }

    forget(key) {
        this.keys.delete(key); this.writing.delete(key);
        const id = `${this.world}|${key}`;
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
