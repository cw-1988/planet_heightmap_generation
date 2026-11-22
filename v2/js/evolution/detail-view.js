// The page's side of the detail finer than the mesh (plans/V2_FINE_DETAIL_PLAN.md; finish/fine-detail.js): workers that
// draw windows of a detailed moment — tiles of the view where it is zoomed in past the picture's own pixels (DetailTiles,
// detail-tiles.js: drawn as the view moves, nearest its middle first, and kept on disk, so each is drawn once; TileLayers,
// below, lays them over the planet, each sent to the GPU once), and the exports enlarged past it, band by band. Each window carries only
// what it needs of the moment (cropSource: the picture's and the drivers' pixels under it), so no worker holds a copy of it.

import { detailSource, cropSource } from '../finish/fine-detail.js';

/** A tile's side (px). Level L draws the planet TILE · 2^L pixels wide: 2^L tiles across, 2^(L−1) down. */
export const TILE = 256;
/** A tile as laid on the GPU (px): with a pixel of its neighbours' all round, so the blend across its edge reads theirs.
 *  It is painted from a window two pixels wider all round (the hillshade's neighbours at its edges). */
export const SLOT = TILE + 2;

export class DetailService {
    /** @param {number} n  how many workers draw at once */
    constructor(n) { this.n = Math.max(1, n); this.workers = []; this.idle = []; this.queue = []; this.jobs = new Map(); this.next = 1; this.sources = new WeakMap(); }

    /** Whether a detailed moment can be drawn finer: one made before the drivers were (a planet file from before) cannot. */
    static can(fin) { return !!fin?.raster?.drivers; }

    /** The moment's source, once per moment and rivers' threshold (`riverQ`, m³/s: the valleys cut are the rivers the page
     *  draws — Infinity when it draws none). */
    source(fin, seed, riverQ) {
        let m = this.sources.get(fin);
        if (!m) this.sources.set(fin, m = new Map());
        let s = m.get(riverQ);
        if (!s) m.set(riverQ, s = detailSource(fin, seed, riverQ));
        return s;
    }

    /**
     * One window drawn by a worker: a promise of fineWindow's result. A job aborted before it starts is never sent; the
     * waiting job sent first is one without a ticket (an export's band), else the one whose `ticket.order` is lowest (the
     * caller may change it while it waits), else the first asked for. A job sent marks its ticket `sent`.
     */
    run(src, win, signal, ticket = null) {
        return new Promise((resolve, reject) => {
            const job = { id: this.next++, win, src, resolve, reject, signal, ticket };
            this.queue.push(job);
            this.pump();
        });
    }

    pump() {
        while (this.queue.length) {
            let at = 0;
            // (an export's band before any tile: a view moving, zoomed in, asks for tiles all the time, and the export waited
            // behind them — from PR #155)
            for (let i = 1; i < this.queue.length; i++) if ((this.queue[i].ticket?.order ?? -Infinity) < (this.queue[at].ticket?.order ?? -Infinity)) at = i;
            const job = this.queue[at];
            if (job.signal?.aborted) { this.queue.splice(at, 1); job.reject(new DOMException('The detail was cancelled', 'AbortError')); continue; }
            let w = this.idle.pop();
            if (!w && this.workers.length < this.n) w = this.spawn();
            if (!w) return;
            this.queue.splice(at, 1);
            if (job.ticket) job.ticket.sent = true;
            this.jobs.set(job.id, { job, w });
            w.postMessage({ type: 'window', id: job.id, src: cropSource(job.src, job.win), win: job.win });
        }
    }

    spawn() {
        const w = new Worker(new URL('./detail-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = ({ data }) => {
            const j = this.jobs.get(data.id);
            this.jobs.delete(data.id);
            this.idle.push(w);
            if (j) { if (data.type === 'done') j.job.resolve(data.out); else j.job.reject(new Error(data.message)); }
            this.pump();
        };
        w.onerror = e => {
            for (const [id, j] of this.jobs) if (j.w === w) { this.jobs.delete(id); j.job.reject(new Error(e.message || 'the detail worker stopped')); }
            this.workers = this.workers.filter(x => x !== w); w.terminate();
            this.pump();
        };
        this.workers.push(w);
        return w;
    }

    /**
     * A window ({W, x0, y0, w, h}: W the width of the planet it is a window of) drawn in bands of rows across the
     * workers, put together: { h, sea, wat }.
     */
    async window(fin, seed, win, signal = null, onBand = null, riverQ = Infinity) {
        // (bands of at most ~1.5 million pixels — a worker's band holds ~60 bytes a pixel — and at least one per worker it
        // uses: at most 4 at a time, whatever the tiles' workers)
        const n = Math.min(4, this.n), src = this.source(fin, seed, riverQ), parts = Math.max(Math.min(n, Math.floor(win.h / 64)), Math.ceil(win.w * win.h / 1.5e6), 1), rows = Math.max(16, Math.ceil(win.h / parts)), bands = [];
        for (let y = 0; y < win.h; y += rows) bands.push({ y, win: { W: win.W, x0: win.x0, y0: win.y0 + y, w: win.w, h: Math.min(rows, win.h - y) } });
        const out = { h: new Float32Array(win.w * win.h), sea: new Uint8Array(win.w * win.h), wat: new Uint8Array(win.w * win.h), lev: fin.raster.waterLevel ? new Float32Array(win.w * win.h) : null };
        // (at most n bands asked for at a time, each next one once one comes back: queued all at once, they held every
        // worker until the last band, and the view's tiles waited — from PR #155)
        let done = 0, next = 0;
        const one = async () => {
            while (next < bands.length) {
                const b = bands[next++], o = await this.run(src, b.win, signal), at = b.y * win.w;
                out.h.set(o.h, at); out.sea.set(o.sea, at); out.wat.set(o.wat, at); if (out.lev && o.lev) out.lev.set(o.lev, at);
                done++;                                   // (not inside onBand?.(): with no onBand it never counts)
                onBand?.(done / bands.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(n, bands.length) }, one));
        return out;
    }

    terminate() { for (const w of this.workers) w.terminate(); this.workers = []; this.idle = []; for (const { job } of this.jobs.values()) job.reject(new DOMException('stopped', 'AbortError')); this.jobs.clear(); }
}

/**
 * The view's tiles laid over the planet: the globe's patch (globe-view.js putPatchTile), two layers of slots — the view's
 * level's, and under it another level's (the level before, or the one that covers more), standing in until the view's
 * own tiles come. A layer's slot holds the tiles whose column and row are its own modulo the layer's columns and rows, so
 * a pan lays only the tiles it brings, in the slots of those it leaves. Each tile is painted once per look (`paint`: a
 * SLOT-px canvas) and sent to the GPU once — nearest the view's middle first, as many as a frame's budget allows.
 */
export class TileLayers {
    /** @param {import('../app/globe-view.js').GlobeView} globe  @param {number} maxSpan  the most slots a layer may have across or down */
    constructor(globe, maxSpan) {
        this.globe = globe; this.maxSpan = maxSpan;
        this.layers = [0, 1].map(() => ({ L: -1, cols: 0, rows: 0, slots: null, count: 0, view: null }));
        this.look = -1; this.shown = false;
    }

    /** The patch off (its tiles kept: shown again at once). */
    hide() {
        if (!this.shown) return;
        this.globe.showPatchLayer(0, null); this.globe.showPatchLayer(1, null);
        this.shown = false;
    }

    /** Every tile laid forgotten (another moment). */
    clear() { this.hide(); this.empty(0); this.empty(1); }

    /** Layer k's slots emptied. */
    empty(k) {
        const A = this.layers[k];
        if (A.slots) { A.slots.fill(NaN); this.globe.emptyPatchLayer(k); }
        A.count = 0;
    }

    /**
     * Each frame: the view's tiles (`tiles`: their range and those drawn) laid — those drawn and not yet laid, as `paint`
     * paints them for `look` (another look: every tile painted again, the planet's own shown until it is), until `budgetMs`
     * is spent. `lines`: what the page draws over the tiles (another: each tile laid again where it is, the old one shown
     * until then — a pick's tint changes as the pointer moves, and the view should not blink back to the planet's).
     */
    lay(tiles, look, paint, budgetMs, lines = null) {
        const g = tiles.range;
        if (!g) { this.hide(); return; }
        const n = 1 << g.L, nx = g.tx1 - g.tx0 + 1, ny = g.ty1 - g.ty0 + 1;
        if (look !== this.look) { this.look = look; this.empty(0); this.empty(1); }
        if (lines !== this.lines) { this.lines = lines; this.linesV = (this.linesV ?? 0) + 1; }
        let A = this.layers[0];
        if (A.L !== g.L || nx > A.cols || ny > A.rows) {
            // (another level, or more tiles than the layer holds: the layer under goes on top if it holds the view's level;
            // else the view's tiles begin again in whichever covers less of the view — the other stays under until they come)
            const B = this.layers[1], fits = B.L === g.L && nx <= B.cols && ny <= B.rows;
            if (fits || this.cover(A, g) >= this.cover(B, g)) this.swap();
            if (!fits) this.start(g.L, nx, ny);
            A = this.layers[0];
        }
        // (the range's columns as near the layer's last as they can be: past the date line they run on, each tile keeping its slot)
        const tx0 = g.tx0 + (A.view ? Math.round((A.view.tx0 - g.tx0) / n) * n : 0), shift = tx0 - g.tx0;
        A.view = { n, tx0, ty0: g.ty0, nx, ny };
        this.globe.showPatchLayer(0, A.view);
        this.globe.showPatchLayer(1, this.layers[1].count ? this.layers[1].view : null);
        this.shown = true;
        // the tiles drawn and not yet laid, nearest the view's middle first
        const todo = [];
        for (let ty = g.ty0; ty <= g.ty1; ty++) for (let tx = tx0; tx < tx0 + nx; tx++) {
            const s = (ty % A.rows) * A.cols + (((tx % A.cols) + A.cols) % A.cols), key = tx * 1e5 + ty;
            if (A.slots[s] === key && A.lv[s] === this.linesV) continue;
            const t = tiles.tile(g.L, ((tx % n) + n) % n, ty);
            if (t?.data) todo.push({ t, tx, ty, s, key, d: (tx + 0.5 - g.cx - shift) ** 2 + (ty + 0.5 - g.cy) ** 2 });
        }
        if (!todo.length) return;
        todo.sort((a, b) => a.d - b.d);
        const t0 = performance.now();
        for (const j of todo) {
            const pic = paint(j.t);
            if (!pic) continue;                                              // (its data still read back from disk: laid once it comes)
            this.globe.putPatchTile(0, j.s % A.cols, Math.floor(j.s / A.cols), j.tx, j.ty, pic);
            if (!(A.slots[j.s] === A.slots[j.s])) A.count++;              // (NaN: the slot was empty)
            A.slots[j.s] = j.key; A.lv[j.s] = this.linesV;
            if (performance.now() - t0 > budgetMs) break;
        }
    }

    /** The two layers swapped: the view's level's goes under. */
    swap() { this.layers.reverse(); this.globe.swapPatchLayers(); }

    /** Layer 0 begun again for level L, its slots empty — made larger if it must hold more than nx × ny. */
    start(L, nx, ny) {
        const A = this.layers[0];
        const cols = Math.max(A.cols, Math.min(this.maxSpan, nx + 1)), rows = Math.max(A.rows, Math.min(this.maxSpan, ny + 1));
        if (cols !== A.cols || rows !== A.rows) { this.globe.sizePatchLayer(0, cols, rows, SLOT); A.cols = cols; A.rows = rows; A.slots = new Float64Array(cols * rows).fill(NaN); A.lv = new Int32Array(cols * rows); }
        else this.empty(0);
        A.L = L; A.count = 0; A.view = null;
    }

    /** The share of a view's range (tileRange's) that a layer's tiles laid cover. */
    cover(A, g) {
        if (A.L < 0 || !A.count) return 0;
        const ng = 1 << g.L, u0 = g.tx0 / ng, u1 = (g.tx1 + 1) / ng, v0 = 2 * g.ty0 / ng, v1 = 2 * (g.ty1 + 1) / ng, na = 1 << A.L;
        let s = 0;
        for (const key of A.slots) {
            if (!(key === key)) continue;
            const tx = Math.floor(key / 1e5), ty = key - tx * 1e5;
            let a0 = tx / na, a1 = (tx + 1) / na;
            const turn = Math.round((u0 + u1) / 2 - (a0 + a1) / 2);
            a0 += turn; a1 += turn;
            s += Math.max(0, Math.min(a1, u1) - Math.max(a0, u0)) * Math.max(0, Math.min(2 * (ty + 1) / na, v1) - Math.max(2 * ty / na, v0));
        }
        return s / ((u1 - u0) * (v1 - v0));
    }
}

