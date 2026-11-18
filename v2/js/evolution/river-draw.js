// A finished moment's rivers as the page and the exports draw them (split out of finish-view.js): their lines, smoothed
// as the world map's valleys are (river-valleys.js riverParts), their widths and regimes, and the rivers near a point.
// On a window of a sharper picture each line bends by its meanders (river-meander.js) as the valley under it does — the
// same waves, faded in by the same fade (pixel-fade.js) — so up close the drawn river winds in its own valley.

import { riverParts, pushSegments, LINE, CHANNEL, BED, bedKm } from '../finish/river-valleys.js';
import { bendSegment, MEANDER_PAD_KM } from '../finish/river-meander.js';
import { fadeFor } from '../finish/pixel-fade.js';

/** How a river is drawn at discharge q (m³/s) above the density's threshold q0 — a flow map (the lab's Drainage layer:
 *  developer, "much thinner and closer to the flow mapmode"): hairlines whose strength grows with the log of the discharge,
 *  the great rivers only a little wider. Its strength class 0…4 (alpha) and width (px of a 2048-wide texture). */
const riverStrength = (q, q0) => Math.max(0, Math.min(4, Math.round(4 * Math.log10(q / q0) / 2.5)));
const STRENGTH_ALPHA = [0.35, 0.5, 0.65, 0.8, 0.92], STRENGTH_WIDTH = [0.45, 0.55, 0.65, 0.8, 1.0];
/** A river point's regime (finish-hydro.js Regime), from its twelve monthly flows: 0 permanent, 1 permanent with a flood
 *  season, 2 seasonal (dry some months), 3 dry most of the year. */
const regimeAt = (R, i) => R.regime[i];
/** How each regime is drawn: its strength and dashes, and its colour when the rivers are coloured by regime (else all the
 *  rivers' blue). */
const RIVER_RGB = 'rgb(30, 90, 210)';
export const REGIME_STYLE = [
    { alpha: 1, dash: null, rgb: RIVER_RGB, name: 'Permanent' },
    { alpha: 1, dash: null, rgb: 'rgb(190, 50, 180)', name: 'Yearly flood season' },
    { alpha: 0.85, dash: [3.5, 1.5], rgb: 'rgb(0, 200, 225)', name: 'Seasonal' },
    { alpha: 0.7, dash: [1.1, 1.6], rgb: 'rgb(185, 105, 30)', name: 'Dry most of the year' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A river point's year in words: "permanent · floods Aug–Oct · fed from far upstream". */
export function riverYearWords(rv) {
    const w = [['permanent'], ['permanent', `floods ${MONTHS[rv.floodFrom]}${rv.floodTo !== rv.floodFrom ? `–${MONTHS[rv.floodTo]}` : ''}`], ['seasonal — dry some months'], ['dry most of the year']][rv.regime];
    if (rv.farFed) w.push('fed from far upstream');
    return w.join(' · ');
}

/**
 * The rivers of a finished moment as paths to draw (on a texture 2048 px wide; the caller scales for a sharper one):
 * every reach carrying at least q0 m³/s, split where it crosses the map's edge, smoothed (Chaikin, twice), its segments
 * gathered into one path per width and regime — a few dozen strokes for the whole planet. Cached per moment and q0.
 */
export function riverPaths(fin, q0) {
    fin.paths ??= new Map();
    if (fin.paths.has(q0)) return fin.paths.get(q0);
    const S = riverSegments(fin, q0), list = S.buckets.map(b => ({ ...b, path: new Path2D() }));
    for (let i = 0; i < S.count; i++) {
        const p = list[S.bucket[i]].path, o = 4 * i;
        if (!S.joined[i]) p.moveTo(S.xy[o], S.xy[o + 1]);
        p.lineTo(S.xy[o + 2], S.xy[o + 3]);
    }
    const sorted = S.order.map(b => list[b]);
    fin.paths.set(q0, sorted);
    return sorted;
}

/**
 * The rivers of a finished moment as segments, as riverPaths draws them: on a texture 2048 px wide, in the order drawn —
 * each with its bucket (a width and a regime: one stroke each), its bucket's segment before it, whether it carries on
 * from that one, and how far along its line it starts (where its dashes stand). Cached per moment and q0.
 */
function riverSegments(fin, q0) {
    fin.segments ??= new Map();
    if (fin.segments.has(q0)) return fin.segments.get(q0);
    const R = fin.rivers, W = 2048, H = 1024, keys = new Map(), buckets = [], xy = [], bucket = [], prev = [], joined = [], along = [], g = [], starts = [...R.start, R.lat.length];
    let maxLen = 0;
    const add = (str, reg, x0, y0, x1, y1) => {
        const key = `${str}|${reg}`;
        let b = keys.get(key);
        if (b === undefined) { keys.set(key, b = buckets.length); buckets.push({ strength: str, regime: reg, last: null, run: 0, at: -1 }); }
        const B = buckets[b], on = !!B.last && B.last[0] === x0 && B.last[1] === y0, len = Math.hypot(x1 - x0, y1 - y0);
        if (!on) B.run = 0;
        xy.push(x0, y0, x1, y1); bucket.push(b); prev.push(B.at); joined.push(on ? 1 : 0); along.push(B.run);
        B.run += len; B.last = [x1, y1]; B.at = bucket.length - 1; maxLen = Math.max(maxLen, len);
    };
    for (let r = 0; r < starts.length - 1; r++) {
        // (a reach below the threshold ends its line — a river that dries out is not bridged to where it flows again —
        // split where it crosses the map's edge, smoothed; the world map cuts its valleys along the same lines)
        for (const pts of riverParts(R, starts[r], starts[r + 1], q0, i => regimeAt(R, i))) {
            pushSegments(g, pts);   // (each segment's flow, distance along and normals: its meanders, in the same order)
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                add(riverStrength(a[2], q0), a[3], a[0], a[1], b[0], b[1]);
            }
        }
    }
    const S = { count: bucket.length, xy: Float32Array.from(xy), bucket: Uint16Array.from(bucket), prev: Int32Array.from(prev), joined: Uint8Array.from(joined), along: Float32Array.from(along), g: Float64Array.from(g), maxLen,
        buckets: buckets.map(({ strength, regime }) => ({ strength, regime })), order: buckets.map((b, i) => i).sort((a, b) => buckets[a].strength - buckets[b].strength), grid: null };
    fin.segments.set(q0, S);
    return S;
}

/** A river bucket's stroke on a context: the rivers' blue or its regime's colour, `widthScale` times as thick. Its dashes, or null. */
function riverStyle(ctx, b, byRegime, widthScale) {
    const st = REGIME_STYLE[b.regime];
    // (coloured by regime, the colour tells it: not faded as well)
    ctx.strokeStyle = byRegime ? st.rgb : RIVER_RGB;
    ctx.globalAlpha = (byRegime ? 1 : st.alpha) * STRENGTH_ALPHA[b.strength]; ctx.lineWidth = STRENGTH_WIDTH[b.strength] * widthScale; ctx.setLineDash(st.dash ? st.dash.map(v => v * widthScale) : []);
    return st.dash;
}

/** Draw a moment's rivers on a texture's context (scaled by the caller to a 2048-wide texture's coordinates), in the rivers'
 *  blue or coloured by regime — `widthScale` times as thick (a context scaled far: the patch of finer detail's, as thin). */
export function drawRivers(ctx, paths, byRegime = false, widthScale = 1) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of paths) { riverStyle(ctx, b, byRegime, widthScale); ctx.stroke(b.path); }
    ctx.restore();
}

/**
 * A moment's rivers drawn as drawRivers draws them, on a window of a sharper picture: `W` px wide, the canvas's pixel
 * (0, 0) its pixel (x0, y0), w × h of them. Only the segments near the window are drawn (a grid of them, built once per
 * moment and q0) — so a tile of the zoomed-in view costs its own rivers, not the planet's — each line's dashes offset to
 * where the whole line's stand: windows side by side meet as one picture would. `widthScale` sets the hairline (the
 * caller's: the same on the screen at every zoom); a river whose bed is wider is drawn as wide as it is, over its
 * valley's floor.
 */
export function drawRiversWindow(ctx, fin, q0, byRegime, W, x0, y0, w, h, widthScale = 1) {
    const S = riverSegments(fin, q0), k = W / 2048, G = S.grid ??= segmentGrid(S), KM = 2 * Math.PI * 6371 / 2048;
    // (each segment bent by its meanders, as this window's pixels hold them — the valley under it bends alike)
    const pxKm = KM / k, fade = fadeFor(pxKm);
    const line = (i, t0, move) => {
        let first = move;
        bendSegment(S.g, LINE * i, t0, 1, pxKm, fade, (x, y) => { if (first) { first = false; ctx.moveTo(x, y); } else ctx.lineTo(x, y); }, move);
    };
    // (how far past the window a segment's middle may lie and still touch it: half the longest segment, half the widest
    // line, a pixel's anti-aliasing, the farthest a meander moves it (0.3: a latitude's narrower pixels) — in the
    // 2048-wide texture's px)
    const m = S.maxLen / 2 + 0.5 * Math.max(STRENGTH_WIDTH[STRENGTH_WIDTH.length - 1] * widthScale, BED * CHANNEL.widthMax / KM) + 2 / k + MEANDER_PAD_KM / (0.3 * KM);
    const ya = Math.max(0, Math.floor((y0 / k - m) / G.C)), yb = Math.min(G.GH - 1, Math.floor(((y0 + h) / k + m) / G.C));
    // (a segment's width: its hairline, or its bed as wide as it is (river-valleys.js bedKm — the valley's floor and the
    // foot of its banks, eased flat: drawn at the channel alone, a smooth bare band showed either side of the line) where
    // that is wider, in steps of an eighth of an octave: a stroke each)
    const widthOf = (i, hair) => {
        const o = LINE * i, c = bedKm((S.g[o + 4] + S.g[o + 5]) / 2) / KM;
        return c > hair ? hair * 2 ** (Math.round(8 * Math.log2(c / hair)) / 8) : hair;
    };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const turn of [-1, 0, 1]) {                                      // (a window across the date line: the rivers either side)
        const xa = Math.max(0, Math.floor((x0 / k - turn * 2048 - m) / G.C)), xb = Math.min(G.GW - 1, Math.floor(((x0 + w) / k - turn * 2048 + m) / G.C));
        if (xa > xb || ya > yb) continue;
        let n = 0;
        for (let gy = ya; gy <= yb; gy++) n += G.count[gy * G.GW + xb + 1] - G.count[gy * G.GW + xa];
        if (!n) continue;
        const near = new Int32Array(n);
        n = 0;
        for (let gy = ya; gy <= yb; gy++) for (let j = G.count[gy * G.GW + xa]; j < G.count[gy * G.GW + xb + 1]; j++) near[n++] = G.items[j];
        near.sort();
        ctx.setTransform(k, 0, 0, k, turn * W - x0, -y0);
        for (const b of S.order) {
            const dash = riverStyle(ctx, S.buckets[b], byRegime, widthScale), period = dash ? (dash[0] + dash[1]) * widthScale : 0;
            const hair = STRENGTH_WIDTH[S.buckets[b].strength] * widthScale;
            // (a bed drawn as wide as it is is water filling it: as solid as the strongest line, not a faint flow-map hairline)
            const hairAlpha = ctx.globalAlpha, bedAlpha = hairAlpha / STRENGTH_ALPHA[S.buckets[b].strength] * STRENGTH_ALPHA[STRENGTH_ALPHA.length - 1];
            let last = -1, lw = -1, open = false;
            for (const i of near) {
                if (S.bucket[i] !== b) continue;
                const wi = widthOf(i, hair), on = S.joined[i] && S.prev[i] === last && wi === lw;
                if (!on) {
                    // (a stroke begun here — a line's start in this window, or another width: its dashes from where the whole
                    // line's stand there (measured along the unbent line, so a meander's extra length shifts them a little
                    // between windows)
                    if (open) ctx.stroke();
                    ctx.beginPath(); ctx.lineWidth = lw = wi; ctx.globalAlpha = wi > hair ? bedAlpha : hairAlpha; ctx.lineDashOffset = period ? S.along[i] % period : 0; open = true;
                }
                line(i, 0, !on);
                last = i;
            }
            if (open) ctx.stroke();
        }
    }
    ctx.restore();
}

/** The segments by where their middles lie: cells C px square of the 2048-wide texture, each cell's in the order drawn. */
function segmentGrid(S) {
    const C = 2, GW = 2048 / C, GH = 1024 / C, count = new Int32Array(GW * GH + 1), cell = new Int32Array(S.count);
    for (let i = 0; i < S.count; i++) {
        const o = 4 * i, gx = Math.min(GW - 1, Math.max(0, Math.floor((S.xy[o] + S.xy[o + 2]) / (2 * C)))), gy = Math.min(GH - 1, Math.max(0, Math.floor((S.xy[o + 1] + S.xy[o + 3]) / (2 * C))));
        count[(cell[i] = gy * GW + gx) + 1]++;
    }
    for (let c = 0; c < GW * GH; c++) count[c + 1] += count[c];
    const items = new Int32Array(S.count), at = count.slice(0, GW * GH);
    for (let i = 0; i < S.count; i++) items[at[cell[i]]++] = i;
    return { C, GW, GH, count, items };
}

/**
 * The river nearest a point of the map (u west → east, v north → south, 0…1), within `px` pixels of a 2048-wide texture,
 * among those drawn (q ≥ q0): {q, regime, floodFrom, floodTo, farFed} or null. A grid of the rivers' points, built once per moment and q0.
 */
export function riverAt(fin, q0, u, v, px = 3) {
    fin.grids ??= new Map();
    let g = fin.grids.get(q0);
    const W = 2048, H = 1024, C = 8, GW = W / C, GH = H / C;
    if (!g) {
        const R = fin.rivers, count = new Int32Array(GW * GH + 1);
        const cellOf = i => Math.min(GH - 1, Math.floor((90 - R.lat[i]) / 180 * H / C)) * GW + Math.min(GW - 1, Math.floor((R.lon[i] + 180) / 360 * W / C));
        for (let i = 0; i < R.q.length; i++) if (R.q[i] >= q0) count[cellOf(i) + 1]++;
        for (let k = 0; k < GW * GH; k++) count[k + 1] += count[k];
        const items = new Int32Array(count[GW * GH]), at = count.slice(0, GW * GH);
        for (let i = 0; i < R.q.length; i++) if (R.q[i] >= q0) items[at[cellOf(i)]++] = i;
        fin.grids.set(q0, g = { count, items });
    }
    const R = fin.rivers, x = u * W, y = v * H, cx = Math.floor(x / C), cy = Math.floor(y / C);
    let best = -1, bd = px * px;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const gy = cy + dy, gx = ((cx + dx) % GW + GW) % GW;
        if (gy < 0 || gy >= GH) continue;
        const k = gy * GW + gx;
        for (let j = g.count[k]; j < g.count[k + 1]; j++) {
            const i = g.items[j];
            let ddx = Math.abs((R.lon[i] + 180) / 360 * W - x); if (ddx > W / 2) ddx = W - ddx;
            const d2 = ddx * ddx + ((90 - R.lat[i]) / 180 * H - y) ** 2;
            if (d2 < bd) { bd = d2; best = i; }
        }
    }
    return best < 0 ? null : { q: R.q[best], regime: R.regime[best], floodFrom: R.floodFrom[best], floodTo: R.floodTo[best], farFed: R.farFed[best] };
}
