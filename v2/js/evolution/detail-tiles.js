// The zoomed view's detail as tiles (detail-view.js draws them, TileLayers lays them over the planet). Each tile is drawn
// once per world and rivers drawn: kept on disk (tile-store.js) as it comes, so zoomed out and back in, or panned back, it
// is read from there instead of drawn again. In memory a drawn tile keeps only what the read-out under the pointer reads
// (its heights, sea, water and water level: `data`) and its painted canvases — its whole data (`full`: the shore's ramp and
// colours too, ~1.6 MB) is read back from disk only to paint it for another look, and let go once it is painted.

import { TILE } from './detail-view.js';
import { TileStore } from './tile-store.js';

/**
 * The view's detail as tiles. The tiles a view wants (`want`) are drawn by the service's workers — nearest the view's
 * middle first (as it moves, the waiting ones are put in order again), those it no longer wants dropped before they
 * start — or read from disk where drawn before; in memory the least recently wanted are dropped past `keep`.
 */
export class DetailTiles {
    /** @param {import('./detail-view.js').DetailService} service  @param {{keep?: number, most?: number, maxLevel?: number, maxSpan?: number, store?: TileStore}} [o]
     *  tiles kept in memory; most in a view; the finest level; most across or down (TileLayers' layers on this GPU); the disk's */
    constructor(service, { keep = 200, most = 150, maxLevel = 9, maxSpan = 31, store = new TileStore() } = {}) {
        this.service = service; this.keep = keep; this.most = most; this.maxLevel = maxLevel; this.maxSpan = maxSpan; this.store = store;
        this.tiles = new Map(); this.fin = null; this.seed = 0; this.riverQ = Infinity; this.range = null; this.clock = 0;
        this.onTile = null;                                   // (called as each tile is drawn)
    }

    /** Forget every tile in memory (another moment, or other rivers drawn: other valleys) — those on disk too if another moment. */
    reset(fin = null, seed = 0, riverQ = Infinity) {
        for (const t of this.tiles.values()) t.ctl?.abort();
        if (fin !== this.fin) this.store.reset();
        this.tiles.clear(); this.fin = fin; this.seed = seed; this.riverQ = riverQ; this.range = null;
    }

    /**
     * The tiles a view wants, asked for where not drawn: `places` its sampled points as [lon, lat] (degrees; null off the
     * planet), `screenPx` its height in device pixels, `textureW` the picture shown's width, `riverQ` the rivers drawn
     * (DetailService.source). Returns the range { L, tx0, tx1, ty0, ty1 } (tx may run past the planet's edge: wrapped), or
     * null where the picture's own pixels are fine enough.
     */
    want(fin, seed, places, screenPx, textureW, riverQ = Infinity) {
        if (fin !== this.fin || riverQ !== this.riverQ) this.reset(fin, seed, riverQ);
        const g = this.range = tileRange(places, screenPx, textureW, this.most, this.maxLevel, this.maxSpan), wanted = new Set();
        const list = [];
        if (g) for (let ty = g.ty0; ty <= g.ty1; ty++) for (let tx = g.tx0; tx <= g.tx1; tx++) {
            const key = keyOf(g.L, tx, ty), t = this.tiles.get(key), d = (tx + 0.5 - g.cx) ** 2 + (ty + 0.5 - g.cy) ** 2;
            wanted.add(key);
            if (t) { t.used = ++this.clock; if (t.ticket) t.ticket.order = d; }
            else list.push({ tx, ty, d });
        }
        for (const [key, t] of this.tiles) if (!t.data && !wanted.has(key)) { t.ctl.abort(); this.tiles.delete(key); }
        if (!g) return null;
        list.sort((a, b) => a.d - b.d);
        for (const { tx, ty, d } of list) this.request(g.L, tx, ty, d);
        this.trim();
        return g;
    }

    request(L, tx, ty, order = 0) {
        const n = 1 << L, x = ((tx % n) + n) % n, key = keyOf(L, x, ty), at = this.diskKey(key);
        // (two pixels more all round: the slot's pixel of its neighbours', and the hillshade's neighbours beyond that)
        const t = { key, L, tx: x, ty, win: { W: TILE * n, x0: x * TILE - 2, y0: ty * TILE - 2, w: TILE + 4, h: TILE + 4 }, data: null, full: null, loading: null, ctl: new AbortController(), ticket: { order }, used: ++this.clock, canvas: null, look: -1 };
        this.tiles.set(key, t);
        this.fetch(t, at, t.ctl.signal, t.ticket).then(data => {
            if (this.tiles.get(key) !== t) return;
            t.data = { h: data.h, sea: data.sea, wat: data.wat, lev: data.lev }; t.full = data; t.ctl = null; t.ticket = null;
            this.onTile?.(t);
        }).catch(err => { if (this.tiles.get(key) === t) this.tiles.delete(key); if (err.name !== 'AbortError') console.error(err); });
    }

    /** A tile's whole data: from disk where kept, else drawn by the workers (and kept). */
    async fetch(t, at, signal, ticket) {
        const kept = await this.store.get(at);
        if (kept) return kept;
        if (signal?.aborted) throw new DOMException('The detail was cancelled', 'AbortError');
        const data = await this.service.run(this.service.source(this.fin, this.seed, this.riverQ), t.win, signal, ticket);
        if (this.tiles.get(t.key) === t) this.store.put(at, data);
        return data;
    }

    /** A drawn tile's whole data, to paint it — or null while it is read back from disk (asked for now: laid once it comes). */
    full(t) {
        if (t.full) return t.full;
        if (!t.loading) t.loading = this.fetch(t, this.diskKey(t.key), null, { order: 0 })
            .then(d => { if (this.tiles.get(t.key) === t) t.full = d; }, err => console.error(err))   // (laid on a later frame: TileLayers.lay runs every frame)
            .finally(() => { t.loading = null; });
        return null;
    }

    /** A tile painted: its whole data let go of, where the disk keeps it. */
    painted(t) { if (this.store.has(this.diskKey(t.key))) t.full = null; }

    /** (on disk: a tile's key with the rivers drawn — their valleys are in it) */
    diskKey(key) { return `${this.riverQ}|${key}`; }

    /** A tile, drawn or being drawn, or undefined. */
    tile(L, tx, ty) { return L < 0 ? undefined : this.tiles.get(keyOf(L, tx, ty)); }

    /** The drawn tile under a place (u west → east, v north → south, 0…1) at the view's level, and the pixel's index in its data. */
    at(u, v) {
        const g = this.range;
        if (!g) return null;
        const W = TILE << g.L, X = Math.floor((((u % 1) + 1) % 1) * W), Y = Math.floor(v * (W >> 1)), t = this.tile(g.L, Math.floor(X / TILE), Math.floor(Y / TILE));
        if (!t?.data) return null;
        return { t, i: (Y - t.win.y0) * t.win.w + (X - t.win.x0) };
    }

    /** (fork addition) The sea's share at a place as the globe draws the tile there: its sea bits read bilinearly, as the
     *  shader filters the tile's alpha (globe-view.js patchSea), not the one pixel under it; null where no tile is drawn. */
    seaAt(u, v) {
        const g = this.range;
        if (!g) return null;
        const W = TILE << g.L, x = (((u % 1) + 1) % 1) * W, y = v * (W >> 1), t = this.tile(g.L, Math.floor(x / TILE), Math.floor(y / TILE));
        if (!t?.data) return null;
        const px = x - 0.5 - t.win.x0, py = y - 0.5 - t.win.y0, i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
        const s = (a, b) => (t.data.sea[(j + b) * t.win.w + i + a] ? 1 : 0);   // (the tile's 2-px margin holds the neighbours)
        return (s(0, 0) * (1 - fx) + s(1, 0) * fx) * (1 - fy) + (s(0, 1) * (1 - fx) + s(1, 1) * fx) * fy;
    }

    trim() {
        if (this.tiles.size <= this.keep) return;
        const drawn = [...this.tiles.values()].filter(t => t.data).sort((a, b) => a.used - b.used);
        for (const t of drawn) { if (this.tiles.size <= this.keep) break; this.tiles.delete(t.key); }
    }
}

const keyOf = (L, tx, ty) => { const n = 1 << L; return `${L}/${((tx % n) + n) % n}/${ty}`; };

/**
 * The tiles a view wants: the level whose pixels are about the screen's (a little finer), its tiles over the view and a
 * margin — at a coarser level if that would be more than `most`, or more than `maxSpan` across or down — or null where the
 * view is not zoomed in past the picture's own pixels at its middle. `places` is a square grid over the screen, row by row.
 */
export function tileRange(places, screenPx, textureW, most, maxLevel, maxSpan = Infinity) {
    // (the scale at the screen's middle: the angle between the samples a step above and below it. Read from the view's
    // span of latitude, with no tiles while the planet's edge, a pole or 120° of longitude was in view, and only past 1.6×
    // the picture's pixels — told the paused picture's 4,096 — the picture stood in stretched up to 3–5×, with no grain:
    // a blurred zoom level before the tiles)
    // (one step, where the middle lies at the map's edge)
    const g = Math.round(Math.sqrt(places.length)), m = (g - 1) >> 1, c = places[m * g + m], a = places[(m - 1) * g + m] ?? c, b = places[(m + 1) * g + m] ?? c;
    if (!c || a === b) return null;
    const steps = (a === c || b === c ? 1 : 2), need = 360 * (steps * screenPx / (g - 1)) / arcDeg(a, b), minL = Math.round(Math.log2(textureW / TILE)) + 1;
    if (!(need >= textureW)) return null;
    let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
    for (const p of places) {
        if (!p) continue;
        const l = p[0] - Math.round((p[0] - c[0]) / 360) * 360;
        lo0 = Math.min(lo0, l); lo1 = Math.max(lo1, l); la0 = Math.min(la0, p[1]); la1 = Math.max(la1, p[1]);
    }
    // (every longitude where a pole is in view, out to it; else a margin — the more where the planet's edge is in view,
    // whose foreshortened rim lies past the last sample on it — narrowed before the level is made coarser: a globe's view
    // at 40° with its margin took 300+ tiles at its level, and fell a level, 1.7–2.3× its pixels)
    const all = lo1 - lo0 > 300, edge = places.some(p => !p);
    if (all) { if (la1 > -la0) la1 = 90; else la0 = -90; }
    for (let L = Math.max(minL, Math.min(maxLevel, Math.ceil(Math.log2(need / TILE) - 0.25))); L >= minL; L--) for (const rim of edge ? [0.25, 0.04] : [0.12, 0.02]) {
        const n = 1 << L, rows = n >> 1, mLat = rim * (la1 - la0), mLon = all ? 0 : rim * (lo1 - lo0);
        let tx0 = Math.floor((lo0 - mLon + 180) / 360 * n), tx1 = Math.floor((lo1 + mLon + 180) / 360 * n);
        if (all || tx1 - tx0 >= n) { tx0 = Math.floor((c[0] + 180) / 360 * n) - (n >> 1); tx1 = tx0 + n - 1; }
        const ty0 = Math.max(0, Math.floor((90 - la1 - mLat) / 180 * rows)), ty1 = Math.min(rows - 1, Math.floor((90 - la0 + mLat) / 180 * rows));
        const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
        if (count <= most && tx1 - tx0 < maxSpan && ty1 - ty0 < maxSpan) return { L, tx0, tx1, ty0, ty1, cx: (c[0] + 180) / 360 * n, cy: (90 - c[1]) / 180 * rows };
    }
    return null;
}

/** The angle (degrees) between two places [lon, lat] (degrees) on the sphere. */
function arcDeg([lo1, la1], [lo2, la2]) {
    const r = Math.PI / 180, s = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(s))) / r;
}
