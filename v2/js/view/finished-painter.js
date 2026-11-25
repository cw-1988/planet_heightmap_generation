// A finished moment's picture painted without stalling the page. The owner, 2026-11-20: "why is the switch to satellite
// view so laggy?" (a Satellite repaint took ~245 ms on the main thread, a Terrain one ~70 ms), then "hwo about we never
// block on any switch?!". So:
// - a picture painted lately comes back as a copy (the last few kept, by what they show);
// - any other is painted a few rows at a time between frames, the picture on screen left as it was until it is done (the
//   Satellite's styled colours prepared the same way first, not all at once);
// - the Satellite picture is painted ahead in the background (planet-view.js prepareSatelliteSoon).
// docs/switch-without-stall.md.

import { heightLutOf } from '../evolution/looks.js';
import { CLIMATE_LAYERS, finishedClimateColor } from '../evolution/climate-view.js';
import { prepareSatellite, satelliteReady } from '../evolution/sat-style.js';
import { paintFinished, paintSetup } from '../evolution/finish-view.js';
import { GEOLOGY_LAYERS, finishedGeologyColor } from '../evolution/geology-view.js';
import { FARMING_LAYERS, finishedFarmingColor, farmPictureKey } from '../evolution/farming-view.js';
import { beachKey } from './beach-controls.js';

// (a slice of painting between frames: short, so the globe keeps turning; the pictures kept: ~16 MB a 2048-wide one with
// its glint, ~40 MB a 4096-wide one)
const SLICE_MS = 8, KEEP_BYTES = 160e6;

/** What a finished moment's picture of `layer`, `W` wide, is painted from (`view`: the view's options; `exaggeration`:
 *  the shading's), and its key: two pictures with the same key and the same `refs` hold the same pixels. */
export function paintSpec(view, exaggeration, fin, layer, W) {
    const lut = heightLutOf(layer === 'heightmap' ? 'heightmap' : view.palette), water = view.water && (layer === 'terrain' || layer === 'satellite');
    const C = CLIMATE_LAYERS.has(layer) ? fin.climate : null, geo = GEOLOGY_LAYERS.has(layer), farm = FARMING_LAYERS.has(layer);
    const { season, deposit, age, ageRes, shaded } = view, lakes = water || layer === 'satellite' || geo || farm;
    const ex = exaggeration * (layer === 'satellite' ? 1.25 : 1), farmKey = farm ? farmPictureKey(layer) : '';
    // (the Satellite's styled colours, where the finished heights are at hand — climate-view.js satelliteColor)
    const R = layer === 'satellite' && fin.raster?.heightM && fin.climate?.raster?.sat ? fin.climate.raster : null;
    return {
        layer, W, lut, C, geo, farm, glinting: (layer === 'terrain' || layer === 'satellite') && shaded,
        key: [layer, W, view.palette, shaded, lakes, ex, season, geo ? `${deposit}|${age}|${ageRes}` : '', farmKey, beachKey(view)].join('|'),
        refs: [fin, fin.raster, fin.climate, fin.raster?.geology, fin.raster?.farming],
        opts: { exaggeration: ex, lakes, shaded, keep: true },
        ready: () => !R || satelliteReady(R, season),
        prepare: ms => prepareSatellite(R, season, fin.raster.heightM, fin.raster.w, fin.rivers, fin.raster.water, fin.raster, ms),
        colorAt: () => geo ? finishedGeologyColor(layer, W, fin, deposit, age, ageRes) : farm ? finishedFarmingColor(layer, fin, W)
            : C ? finishedClimateColor(layer, season, C, W, lut, fin) : null,
    };
}

const same = (a, b) => a.key === b.key && a.refs.every((r, k) => r === b.refs[k]);

/** Paint spec `s` of moment `fin` a slice at a time; then `job.done(image, glint)` (ImageData; the glint's at
 *  `glintWidth`, where it shows, else null). Stopped by job.cancel(), or when `alive()` is false. */
function sliced(s, fin, glintWidth, job, alive = () => true) {
    const W = s.W, H = W >> 1, t = { width: W, image: new ImageData(W, H) };
    const glint = s.glinting ? new ImageData(glintWidth, glintWidth >> 1) : null;
    let y = 0, rows = 8, colorAt, setup = null, stopped = false;
    const step = () => {
        if (stopped || !alive()) return;
        const t0 = performance.now();
        try {
            while (!s.ready() && performance.now() - t0 < SLICE_MS) s.prepare(SLICE_MS);
            if (s.ready()) {
                if (colorAt === undefined) colorAt = s.colorAt();
                // (the picture, its shore's distance and its shore's colours made first, a slice at a time too: at once,
                // the first paint of a world opened stalled the page ~2 s at 10 M cells)
                setup ??= paintSetup(fin.raster, W, s.lut, colorAt);
                const ready = setup.step(Math.max(0, SLICE_MS - (performance.now() - t0)));
                while (ready && y < H && performance.now() - t0 < SLICE_MS) {
                    const y1 = Math.min(H, y + rows), a = performance.now();
                    paintFinished(fin.raster, t, s.lut, { ...s.opts, colorAt, rows: [y, y1], seaImage: y1 === H ? glint?.data : null, seaWidth: glintWidth });
                    // (as many rows next as about a third of a slice paints)
                    rows = Math.max(1, Math.min(512, Math.round((y1 - y) * (SLICE_MS / 3) / Math.max(0.25, performance.now() - a))));
                    y = y1;
                }
            }
        } catch (err) {
            stopped = true;
            console.warn('[orogen] could not paint the picture:', err);
            return;
        }
        if (y < H) setTimeout(step, 0); else job.done(t.image, glint);
    };
    setTimeout(step, 0);
    job.cancel = () => { stopped = true; };
    return job;
}

export class FinishedPainter {
    constructor() { this.pics = []; this.job = null; this.ahead = null; }

    /** The kept picture of spec `s`, or null (`touch`: made the most recent). */
    find(s, touch = true) {
        const i = this.pics.findIndex(p => same(p, s));
        if (i < 0) return null;
        const p = this.pics[i];
        if (touch) { this.pics.splice(i, 1); this.pics.unshift(p); }
        return p;
    }

    keep(s, data, glint) {
        const p = { key: s.key, refs: s.refs, image: data, glint };
        let bytes = 0;
        this.pics = [p, ...this.pics.filter(q => !same(q, s))].filter(q => (bytes += q.image.data.length + (q.glint?.data.length ?? 0)) <= KEEP_BYTES || q === p);
        return p;
    }

    /** Spec `s` painted, then `done(picture)` — at once where it is kept. A paint under way for another is dropped; one for
     *  the same picture (asked again before it is done) goes on, to this `done`. */
    paint(s, fin, glintWidth, done) {
        const kept = this.find(s);
        if (kept) { this.cancel(); done(kept); return; }
        if (this.job && same(this.job.s, s)) { this.job.then = done; return; }
        this.cancel();
        const job = { s, then: done, done: (data, glint) => { if (this.job === job) this.job = null; job.then?.(this.keep(s, data, glint)); } };
        this.job = job;
        // (the same picture being painted ahead: waited for, not painted twice)
        if (this.ahead && same(this.ahead.s, s)) { this.ahead.waiter = job; job.cancel = () => { if (this.ahead?.waiter === job) this.ahead.waiter = null; }; return; }
        sliced(s, fin, glintWidth, job);
    }

    /** The paint under way (not the one ahead) dropped: its picture is not wanted now. */
    cancel() { this.job?.cancel?.(); this.job = null; }

    /** Spec `s` painted ahead and kept, for when it is asked for — one at a time; `alive()`: its moment still kept. */
    paintAhead(s, fin, glintWidth, alive) {
        if (this.find(s, false) || (this.ahead && same(this.ahead.s, s))) return;
        if (this.ahead?.waiter) return;                                 // (the one ahead is asked for: left to finish)
        this.ahead?.cancel();
        const a = { s, waiter: null };
        a.done = (data, glint) => {
            if (this.ahead === a) this.ahead = null;
            const p = this.keep(s, data, glint), w = a.waiter;
            if (w) { if (this.job === w) this.job = null; w.then?.(p); }
        };
        this.ahead = sliced(s, fin, glintWidth, a, alive);
    }

    /** All let go: the moment is gone. */
    forget() { this.cancel(); this.ahead?.cancel(); this.ahead = null; this.pics = []; }
}
