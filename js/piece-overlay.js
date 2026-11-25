// Plate edit overlay (fork addition): Generate's plate edits drawn by the globe's own shader (v2/js/app/piece-glsl.js),
// over the picture and its zoomed-in tiles, rather than painted into them — as the region pick's valleys are
// (region-overlay.js). The piece under each pixel of the 2048 × 1024 grid goes to the GPU once per world (off the
// grid's nearest cells, region-grid.js pixelCells: built between frames, shared with the region pick); the pending
// pieces' tints as they change (a texel each); the piece under the pointer as one number. See docs/plate-edit-tint.md.
// The paint layer (terrain-brush.js) is on the grid too, its B byte: the character each pixel was last painted (0
// none; + 128 while it waits for Apply), each stroke's discs laid in order as the strokes are — the eraser's taking
// the paint off — coloured by the character's categorical token (piece-shapes.js `tok`); a stroke kept to chosen pieces
// only on their pixels. The pieces chosen to paint in are tinted amber while Paint is on.

import { pixelCells, W, H } from './region-grid.js';
import { CHARACTERS } from './piece-shapes.js';
import { stampsOf, arcKm } from './terrain-brush.js';

const SW = 256, R_KM = 6371;                                       // (the states' rows)
const LAT = (j) => -Math.PI / 2 + (j + 0.5) / H * Math.PI, LON = (i) => (i + 0.5) / W * 2 * Math.PI - Math.PI;

/** Each grid pixel within `rKm` of the unit point `c` (z-up): fn(p) row by row, each row's span worked out from the cap
 *  (no test per pixel), across the seam and over a pole. */
function eachInDisc(c, rKm, fn) {
    const a = rKm / R_KM, latC = Math.asin(Math.max(-1, Math.min(1, c[2]))), lonC = Math.atan2(c[1], c[0]);
    const cosA = Math.cos(a), sinC = Math.sin(latC), cosC = Math.cos(latC);
    const j0 = Math.max(0, Math.floor((latC - a + Math.PI / 2) / Math.PI * H - 0.5)), j1 = Math.min(H - 1, Math.ceil((latC + a + Math.PI / 2) / Math.PI * H - 0.5));
    for (let j = j0; j <= j1; j++) {
        const lat = LAT(j), cl = Math.cos(lat), sl = Math.sin(lat), den = cl * cosC;
        const k = den > 1e-9 ? (cosA - sl * sinC) / den : (sl * sinC >= cosA ? -2 : 2);
        if (k > 1) continue;
        const half = k <= -1 ? Math.PI : Math.acos(k);
        const all = half >= Math.PI;
        const i0 = all ? 0 : Math.ceil((lonC - half + Math.PI) / (2 * Math.PI) * W - 0.5), i1 = all ? W - 1 : Math.floor((lonC + half + Math.PI) / (2 * Math.PI) * W - 0.5);
        for (let ii = i0; ii <= i1; ii++) fn(j * W + ((ii % W) + W) % W);
    }
}
/** The grid pixel under a unit point (z-up). */
function pixelOf(p) {
    const lat = Math.asin(Math.max(-1, Math.min(1, p[2]))), lon = Math.atan2(p[1], p[0]);
    const j = Math.min(H - 1, Math.max(0, Math.floor((lat + Math.PI / 2) / Math.PI * H)));
    const i = Math.min(W - 1, Math.max(0, Math.floor((lon + Math.PI) / (2 * Math.PI) * W)));
    return j * W + i;
}
/** The tints (sRGB) and their shares: green a piece raised to land, blue one sunk, amber one chosen to paint in, white
 *  the one under the pointer (the shader's, 0.22). */
const TINT = { raise: [70, 230, 110], sink: [30, 100, 255], area: [255, 176, 40] }, SHARE = 0.38;

/** The paint's colours from the page's tokens (sRGB 0…1 by character; read again when the theme changes, though the
 *  categorical tokens are the same in both). */
function paintColours() {
    const css = getComputedStyle(document.documentElement);
    return CHARACTERS.map((ch) => {
        const hex = ch.tok && css.getPropertyValue(ch.tok).trim().match(/^#([0-9a-f]{6})$/i);
        if (!hex) return null;
        const v = parseInt(hex[1], 16);
        return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    });
}

/** The overlay on `globe` (a GlobeView): sync(world, pending, hovered) each frame sends what changed (nothing, mostly);
 *  paint(applied, waiting) the paint layer; showPaint(on) whether the applied paint shows; paintAt(p) the paint there. */
export function pieceOverlay(globe) {
    let gridOf = null, ready = null, stateKey = null, hoverShown = -2, pieces = 0;
    let grid8 = null, applied = [], waiting = [], drawn = [];          // (the grid's bytes; what is drawn on it: [stroke, stamps, waiting, …])
    let mark = null;                                                  // (pixels to lay again, while a stroke's end moves)
    globe.setPaintColours?.(paintColours());

    /** The paint layer onto the grid's B bytes: only the new stamps when the strokes drawn are all still there, in order,
     *  as they were (the last one may have grown, or its last point moved: the stroke being drawn, whose end follows the
     *  pointer; then only the pixels its old end covered are laid again), or all again. Returns whether a byte changed. */
    function drawPaint() {
        if (!grid8) return false;
        const list = [...applied.map((st) => [st, false]), ...waiting.map((st) => [st, true])];
        let changed = false;
        /** Stamps from..to of a stroke onto the grid (`only`: just the marked pixels). */
        const lay = (st, wt, s, from, to, only) => {
            const b = st.c ? (st.c | (wt ? 128 : 0)) : 0, seeds = gridOf?.plateSeeds;
            // (kept to chosen pieces: only their pixels — the grid's RG is the piece + 1)
            const ids = st.in?.length && seeds ? new Set(st.in.filter(i => i < seeds.length).map(i => seeds[i] + 1)) : null;
            for (let m = from; m < to; m++) eachInDisc(s[m], st.rKm, (p) => {
                if (only && !mark[p]) return;
                if (ids && !ids.has(grid8[4 * p] | (grid8[4 * p + 1] << 8))) return;
                if (grid8[4 * p + 2] !== b) { grid8[4 * p + 2] = b; changed = true; }
            });
        };
        const record = (k, st, wt) => {
            const s = stampsOf(st), m = st.pts.length;
            // (the stamps up to its second-to-last point: they stay while its last point moves)
            const fix = m > 1 ? stampsOf({ pts: st.pts.slice(0, -1), rKm: st.rKm }).length : 0;
            drawn[k] = [st, s.length, wt, s, fix, m, st.pts[m - 1]];
        };
        let ok = drawn.length <= list.length;
        const L = drawn.length - 1;
        for (let k = 0; ok && k < drawn.length; k++) {
            const [st, n, wt] = drawn[k];
            if (list[k][0] !== st || list[k][1] !== wt) ok = false;
            else if (k < L && stampsOf(st).length !== n) ok = false;
        }
        const d = ok && L >= 0 ? drawn[L] : null;
        const moved = d && (d[0].pts.length < d[5] || d[0].pts[d[5] - 1] !== d[6]);
        if (moved && L === list.length - 1 && d[0].pts.length >= d[5] - 1) {
            // (the stroke being drawn, its end moved: clear what its old end covered, lay every stroke there again, then
            //  its new end)
            const [st, , wt, oldS, fix] = d, tail = oldS.slice(fix), touched = [];
            if (!mark || mark.length !== W * H) mark = new Uint8Array(W * H);
            for (const c of tail) eachInDisc(c, st.rKm, (p) => { if (!mark[p]) { mark[p] = 1; touched.push(p); } });
            for (const p of touched) if (grid8[4 * p + 2]) { grid8[4 * p + 2] = 0; changed = true; }
            const near = (q, rKm) => tail.some((c) => arcKm(c, q) < rKm + st.rKm);
            for (let k = 0; k < L; k++) {
                const [o, ow] = list[k], s = stampsOf(o);
                for (let m = 0; m < s.length; m++) if (near(s[m], o.rKm)) lay(o, ow, s, m, m + 1, true);
            }
            const s = stampsOf(st);
            lay(st, wt, s, 0, fix, true);
            lay(st, wt, s, fix, s.length, false);
            for (const p of touched) mark[p] = 0;
            record(L, st, wt);
            return changed;
        }
        if (moved || (d && stampsOf(d[0]).length < d[1])) ok = false;
        if (!ok) {
            for (let p = 2; p < grid8.length; p += 4) if (grid8[p]) { grid8[p] = 0; changed = true; }
            drawn = [];
        }
        for (let k = 0; k < list.length; k++) {
            const [st, wt] = list[k], s = stampsOf(st);
            lay(st, wt, s, drawn[k]?.[1] ?? 0, s.length, false);
            record(k, st, wt);
        }
        return changed;
    }
    function grid(w) {
        globe.setPieceGrid(null);                                        // (a new world: the old one's pieces off at once)
        gridOf = w; ready = null; stateKey = null; grid8 = null; drawn = [];
        if (!w) return;
        pixelCells(w).then((pc) => {
            if (gridOf !== w) return;                                     // (another world meanwhile)
            const rp = w.r_plate, data = new Uint8Array(4 * W * H);
            pieces = 0;
            for (let p = 0; p < W * H; p++) if (rp[pc[p]] + 1 > pieces) pieces = rp[pc[p]] + 1;
            for (let p = 0; p < W * H; p++) { const u = rp[pc[p]] + 1; data[4 * p] = u & 255; data[4 * p + 1] = u >> 8; }
            ready = w; grid8 = data;
            drawPaint();
            globe.setPieceGrid(data, W, H);
        });
    }
    return {
        /** The paint layer: the applied strokes and those waiting for Apply, in order; again whenever they change. */
        paint(appliedStrokes, waitingStrokes) {
            applied = appliedStrokes; waiting = waitingStrokes;
            if (drawPaint()) globe.refreshPieceGrid();
        },
        /** Whether the applied paint shows (the waiting paint always does). */
        showPaint(on) { globe.setPaintShown?.(on); },
        /** The theme changed: the paint's colours again. */
        recolour() { globe.setPaintColours?.(paintColours()); },
        /** The paint at the unit point p (z-up): { c, waiting } or null. */
        paintAt(p) {
            if (!grid8 || !p) return null;
            const b = grid8[4 * pixelOf(p) + 2];
            return b ? { c: b & 127, waiting: b >= 128 } : null;
        },
        /** `area`: the pieces chosen to paint in (shown while Paint is on), or null. */
        sync(world, pending, hovered, area = null) {
            // (the grid built once the world is finished or an edit wants it — not for every step of a build under way)
            if (world !== gridOf && (!world || world.fin || hovered >= 0 || pending.size || area?.size || applied.length || waiting.length)) grid(world);
            if (ready !== world || !world) return;
            const key = [...pending].join(',') + '|' + (area ? [...area].join(',') : '');
            if (key !== stateKey) {
                stateKey = key;
                const rows = Math.max(1, Math.ceil(pieces / SW)), bytes = new Uint8Array(4 * SW * rows);
                if (area) for (const id of area) if (id >= 0 && id < pieces) { bytes.set(TINT.area, 4 * id); bytes[4 * id + 3] = Math.round(255 * SHARE); }
                for (const id of pending) if (id >= 0 && id < pieces) {
                    bytes.set(TINT[world.plateIsOcean.has(id) ? 'raise' : 'sink'], 4 * id); bytes[4 * id + 3] = Math.round(255 * SHARE);
                }
                globe.setPieceState(bytes, SW, rows);
            }
            if (hovered !== hoverShown) { hoverShown = hovered; globe.setPieceHover(hovered); }
        },
    };
}
