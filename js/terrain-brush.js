// The paint layer (fork addition): characters painted over Generate's ground, as a layer that can be changed or taken
// off whole. The layer is the ordered list of strokes, not a raster: each stroke a line of points on a fixed 5 km grid
// (the planet code carries them as they are: planet-code.js), so the page, the worker and a shared link all lay the
// same layer onto any Detail. The worker lays it again onto the unpainted ground after every ground it draws (a
// Rebuild, a Reapply, a plate edit); nothing of the layer is baked into the plates.
//
// Stroke: { c, rKm, pts: [[la, lo], …] }
//   c: the character, an index into piece-shapes.js's CHARACTERS (0, "none", is the eraser: it takes earlier paint
//   off where it passes); rKm: the band's half-width (the brush's radius, 20 … 1500 km in 10s); pts: the line, each
//   point its latitude and longitude index on the paint grid (PAINT_LAT_N steps pole to pole, PAINT_LON_N round);
//   in (optional): the pieces it is kept to, as indices into the layout's list (the planet code's toggles are too).
//   The stamps the band is measured from are put back between the points every quarter radius (stampsOf).
// The layer composes in order, as paint on paint: each stroke's band (as wide as the brush, wandering and tapered, then
// a transition of fixed width, TRANSITION_KM (SEA_TRANSITION_KM for the sea characters), out to the ground as it was) takes that much of every earlier character
// away and lays its own. Then each character is laid once across its whole area — crossing strokes of one character
// make one range, not two laid over each other — reading the ground's relief across the area and a margin round it on
// the same side of the sea (CONTEXT_KM), so a stroke over a plain keeps the plain's place in it. Its noise's seed is
// the world's seed plus the stroke's place in the list. It needs no plate picked first: it paints across plate edges.
// A stroke can be kept to chosen pieces (`in`: their indices in the layout's list, Ctrl-clicked while painting): it
// changes only those, fading in from their outlines (KEEP_FADE_KM, a ragged line), so the pieces round them are left as
// they were.
// (It took the place of the Raise, Lower, Smooth and Flatten brushes, and, 2026-11, of the plate-wide characters.)
import { CHARACTERS, characterTarget, SINKS } from './piece-shapes.js';
import { FastNoise } from '../v2/js/core/fast-noise.js';
import { PAINT_LAT_N, PAINT_LON_N } from './planet-code.js';

const R_KM = 6371;
/** Paint's transition, km: from the band's edge to the ground as it was. */
export const TRANSITION_KM = 140;
/** The sea characters' transition, km: wider, as they move the ground kilometres up or down (deep floor to a shelf, land
 *  to the abyss), which over 140 km (three cells at Generate's usual Detail) stands as a stepped cliff. */
export const SEA_TRANSITION_KM = 320;
/** How far a sea character's slope down to the old floor is smoothed, km. */
export const SEA_SOFTEN_KM = 110;
/** A stroke kept to chosen pieces fades in from their outlines over this, km: wider than the transition, as the ground
 *  beside a plate edge can be a deep ocean the painted side rises far above. */
export const KEEP_FADE_KM = 240;
/** How far round a painted area its relief is read, km (on the same side of the sea as most of the area). */
const CONTEXT_KM = 300;

/** A unit point (z-up) on the paint grid: [la, lo]. */
export function snapPoint(p) {
    const lat = Math.asin(Math.max(-1, Math.min(1, p[2]))), lon = Math.atan2(p[1], p[0]);
    const la = Math.round((lat + Math.PI / 2) / Math.PI * PAINT_LAT_N);
    const lo = ((Math.round((lon + Math.PI) / (2 * Math.PI) * PAINT_LON_N) % PAINT_LON_N) + PAINT_LON_N) % PAINT_LON_N;
    return [la, lo];
}
/** The unit point (z-up) of a paint-grid place [la, lo]. */
export function gridPoint([la, lo]) {
    const lat = la / PAINT_LAT_N * Math.PI - Math.PI / 2, lon = lo / PAINT_LON_N * 2 * Math.PI - Math.PI;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}
const stampCache = new WeakMap();
/** A stroke's stamps (unit points): its points, and between them one every quarter radius. Kept per stroke while its
 *  points stay as they are. */
export function stampsOf(stroke) {
    const k = stroke.pts.length, was = stampCache.get(stroke);
    if (was && was.k === k && was.rKm === stroke.rKm && was.end === stroke.pts[k - 1]) return was.s;   // (the end can move)
    const out = [];
    let last = null;
    for (const q of stroke.pts) {
        const p = gridPoint(q);
        if (last) {
            const steps = Math.max(1, Math.ceil(arcKm(last, p) / (stroke.rKm / 4)));
            for (let i = 1; i < steps; i++) {
                const t = i / steps, m = [0, 1, 2].map((c) => last[c] + (p[c] - last[c]) * t), len = Math.hypot(...m) || 1;
                out.push(m.map((c) => c / len));
            }
        }
        out.push(p); last = p;
    }
    stampCache.set(stroke, { k, rKm: stroke.rKm, end: stroke.pts[k - 1], s: out });
    return out;
}

/** The cells a stroke can reach: those within `rKm` of the cap round its stamps. */
function reach(s, rKm, xyz, n) {
    const cx = [0, 0, 0];
    for (const p of s) { cx[0] += p[0]; cx[1] += p[1]; cx[2] += p[2]; }
    const len = Math.hypot(cx[0], cx[1], cx[2]) || 1;
    cx[0] /= len; cx[1] /= len; cx[2] /= len;
    let spread = 0;
    for (const p of s) spread = Math.max(spread, Math.acos(Math.min(1, p[0] * cx[0] + p[1] * cx[1] + p[2] * cx[2])));
    const cosCap = Math.cos(Math.min(Math.PI, spread + rKm / R_KM));
    const out = [];
    for (let r = 0; r < n; r++) if (xyz[3 * r] * cx[0] + xyz[3 * r + 1] * cx[1] + xyz[3 * r + 2] * cx[2] >= cosCap) out.push(r);
    return Int32Array.from(out);
}

/** One stroke's band: the cells it reaches, each with `centre` (1 on the line → 0 at the band's far side) and `weight`
 *  (1 inside the band, easing to 0 over the transition beyond it). A character's band is no ribbon: its edges wander and
 *  its width swells and narrows (noise sized to the brush), and it tapers toward the stroke's ends, so a range or an
 *  island chain comes out with ragged coasts and pointed tips. The eraser's band is plain: as wide as the brush. */
function bandOf(stroke, seed, mesh) {
    const { xyz } = mesh, n = mesh.numCells, wKm = stroke.rKm, s = stampsOf(stroke), plain = !stroke.c;
    // (a sea character's band wanders about twice as far: a shelf or a chain's swell whose outline follows the brush
    // reads as painted, where a land character's coast is broken up again by the finish)
    const sea = !plain && SINKS.has(CHARACTERS[stroke.c]?.id), T = sea ? SEA_TRANSITION_KM : TRANSITION_KM, rag = sea ? 1.9 : 1;
    const edgeKm = (Math.PI * R_KM) / Math.sqrt(n);
    const outKm = (plain ? 1 : sea ? 1.6 : 1.4) * wKm + T, cosR = Math.cos(outKm / R_KM);
    const cand = reach(s, outKm, xyz, n);
    // (each cell's nearest stamp: the stamps are a quarter radius apart, so near enough the line itself)
    const best = new Float32Array(cand.length).fill(-2), near = new Int32Array(cand.length);
    for (let j = 0; j < s.length; j++) {
        const p = s[j];
        for (let i = 0; i < cand.length; i++) {
            const r = cand[i], d = xyz[3 * r] * p[0] + xyz[3 * r + 1] * p[1] + xyz[3 * r + 2] * p[2];
            if (d > best[i]) { best[i] = d; near[i] = j; }
        }
    }
    // (how far along the line each stamp is, km: the band narrows to half its width toward the ends)
    const along = new Float32Array(s.length);
    for (let j = 1; j < s.length; j++) along[j] = along[j - 1] + arcKm(s[j - 1], s[j]);
    const L = along[s.length - 1];
    const noise = new FastNoise(((seed | 0) ^ 0x5bd1e995) >>> 1);
    const wob = (r, lambdaKm) => {
        if (plain || lambdaKm < 2.5 * edgeKm) return 0;
        const k = R_KM / lambdaKm, oct = Math.max(1, Math.min(3, Math.floor(Math.log2(lambdaKm / (2.5 * edgeKm))) + 1));
        return noise.fbm(xyz[3 * r] * k, xyz[3 * r + 1] * k, xyz[3 * r + 2] * k, oct, 0.5);
    };
    const cells = [], centre = [], weight = [];
    for (let i = 0; i < cand.length; i++) {
        if (best[i] <= cosR) continue;
        const r = cand[i], dKm = Math.acos(Math.min(1, best[i])) * R_KM;
        const toEnd = Math.min(along[near[i]], L - along[near[i]]), e = Math.min(1, toEnd / (1.5 * wKm));
        const half = plain ? wKm : wKm * (L < wKm ? 1 : 0.5 + 0.5 * e * e * (3 - 2 * e)) * Math.max(0.3, 1 + 0.3 * rag * wob(r, 2.5 * wKm));
        const dd = Math.max(0, dKm + 0.12 * rag * wKm * wob(r, 0.6 * wKm)), past = dd - half;
        if (past >= T) continue;
        const x = past <= 0 ? 1 : 1 - past / T;
        cells.push(r);
        centre.push(Math.max(0, 1 - dd / (half + T)));
        weight.push(x * x * (3 - 2 * x));
    }
    return { cells, centre, weight };
}

/** A band kept to the pieces `ids` (a Set of piece ids; `r_plate` each cell's): cells outside them dropped, those inside
 *  fading in from the outline over KEEP_FADE_KM. The distance is measured to the nearest outline cell (not counted in
 *  hops, which would step with every cell along the outline) and wanders with noise, so the fade's foot is a soft,
 *  ragged line rather than the plate edge traced again a little way in; the same in km at any Detail. */
function keepTo(b, ids, r_plate, mesh, edgeKm, seed) {
    const { adjOffset, adjList, xyz } = mesh, F = KEEP_FADE_KM, hops = Math.ceil(1.4 * F / edgeKm) + 2;
    const at = new Map();
    b.cells.forEach((r, i) => { if (ids.has(r_plate[r])) at.set(r, i); });
    // (each cell's nearest outline cell, spread out from the outline: the cells with a neighbour in another piece)
    const src = new Map();
    let front = [];
    for (const r of at.keys()) {
        for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) if (!ids.has(r_plate[adjList[k]])) { src.set(r, r); front.push(r); break; }
    }
    const kmTo = (a, c) => Math.acos(Math.min(1, xyz[3 * a] * xyz[3 * c] + xyz[3 * a + 1] * xyz[3 * c + 1] + xyz[3 * a + 2] * xyz[3 * c + 2])) * R_KM;
    for (let s = 1; s < hops && front.length; s++) {
        const next = new Set();
        for (const r of front) for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
            const o = adjList[k];
            if (!at.has(o)) continue;
            const was = src.get(o), mine = src.get(r);
            if (was === undefined || (was !== mine && kmTo(o, mine) < kmTo(o, was))) { src.set(o, mine); next.add(o); }
        }
        front = [...next];
    }
    const noise = new FastNoise(((seed | 0) ^ 0x2c1b3c6d) >>> 1), k = R_KM / (1.5 * F);
    const out = { cells: [], centre: [], weight: [] };
    for (const [r, i] of at) {
        let f = 1;
        if (src.has(r)) {
            const wob = noise.fbm(xyz[3 * r] * k, xyz[3 * r + 1] * k, xyz[3 * r + 2] * k, 3, 0.5);
            // (half a cell in from the outline at least; the noise moves the foot in and out by up to a third of the fade)
            const x = Math.max(0, Math.min(1, (kmTo(r, src.get(r)) + 0.5 * edgeKm) / F - 0.35 * wob * Math.min(1, kmTo(r, src.get(r)) / (0.3 * F))));
            f = x * x * (3 - 2 * x);
        }
        out.cells.push(r); out.centre.push(b.centre[i]); out.weight.push(b.weight[i] * f);
    }
    return out;
}

/**
 * The layer (strokes, in the order painted) onto heights `h` (km per cell of the mesh {numCells, xyz, adjOffset,
 * adjList}); `also` (optional, same length) gets the same change — the uncarved surface the finish starts from.
 * `seed`: the world's. `pieces` ({ r_plate, seeds }: each cell's piece, the layout's list of piece ids) for the strokes
 * kept to chosen pieces; without it they paint everywhere. Returns the cells it changed.
 */
export function paintLayer(strokes, mesh, h, also, seed, pieces) {
    const { xyz } = mesh, n = mesh.numCells;
    const edgeKm = (Math.PI * R_KM) / Math.sqrt(n), cellKm2 = (4 * Math.PI * R_KM * R_KM) / n;
    // (each character's share of each cell, and how near its line the cell is: paint on paint, in order)
    const share = new Map(), centre = new Map(), lead = new Map(), width = new Map();
    strokes.forEach((st, k) => {
        let b = bandOf(st, (seed | 0) + k, mesh);
        if (st.in?.length && pieces) b = keepTo(b, new Set(st.in.filter(i => i < pieces.seeds.length).map(i => pieces.seeds[i])), pieces.r_plate, mesh, edgeKm, (seed | 0) + k);
        let mine = null, near = null;
        if (st.c) {
            if (!share.has(st.c)) { share.set(st.c, new Map()); centre.set(st.c, new Map()); }
            mine = share.get(st.c); near = centre.get(st.c);
            const was = lead.get(st.c);
            if (was === undefined || stampsOf(st).length > stampsOf(strokes[was]).length) lead.set(st.c, k);
            width.set(st.c, Math.max(width.get(st.c) ?? 0, st.rKm));
        }
        for (let i = 0; i < b.cells.length; i++) {
            const r = b.cells[i], w = b.weight[i];
            for (const [c, m] of share) {
                if (c === st.c) continue;
                const v = m.get(r);
                if (v === undefined) continue;
                const left = v * (1 - w);
                if (left < 1e-3) m.delete(r); else m.set(r, left);
            }
            if (mine) {
                if (!(mine.get(r) >= w)) mine.set(r, w);
                if (!(near.get(r) >= b.centre[i])) near.set(r, b.centre[i]);
            }
        }
    });
    const reached = new Set();
    for (const [c, m] of share) {
        const cells = [...m.keys()];
        if (!cells.length) continue;
        const ch = CHARACTERS[c] ?? CHARACTERS[0], L = lead.get(c), s = stampsOf(strokes[L]), C = centre.get(c);
        // (the longest stroke's direction at its middle: a rift's blocks run with it)
        const a = s[Math.max(0, (s.length >> 1) - 1)], b = s[Math.min(s.length - 1, (s.length >> 1) + 1)];
        const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tl = Math.hypot(...t);
        const target = characterTarget(ch.id, cells, xyz, h, edgeKm, cells.length * cellKm2, (seed | 0) + L,
            { centre: Float32Array.from(cells, r => C.get(r)), widthKm: width.get(c),
                dir: tl > 1e-9 ? t.map(v => v / tl) : null, context: contextOf(cells, mesh, h, edgeKm) });
        if (!target) continue;
        // (Shallow sea takes land under five times as fast across its fades: islands, an earlier archipelago's too, go
        // under rather than standing on in the band's transition or a kept plate's fade-in)
        const drowns = ch.id === 'shallow', change = new Float32Array(cells.length);
        for (let i = 0; i < cells.length; i++) {
            const r = cells[i], w = m.get(r);
            change[i] = (drowns && h[r] > 0 && target[i] < 0 ? Math.min(1, 5 * w) : w) * (target[i] - h[r]);
        }
        if (SINKS.has(ch.id)) softenFloor(cells, change, h, mesh, edgeKm);
        for (let i = 0; i < cells.length; i++) {
            const r = cells[i], dh = change[i];
            if (!dh) continue;
            h[r] += dh; reached.add(r);
            if (also && also !== h) also[r] += dh;
        }
    }
    return [...reached];
}

/** A sea character's change, its floor part smoothed over SEA_SOFTEN_KM: the slope from a painted shelf or swell down
 *  to the old floor falls kilometres, and unsmoothed, the cells of the mesh stand in it as steps. What ends near or
 *  above the sea (islands, the shelf top, land being drowned) keeps its change as it was, so islands keep their height
 *  and shape. Cells beyond the area count as unchanged, so the slope eases out into the floor as it was. */
function softenFloor(cells, change, h, mesh, edgeKm) {
    const { adjOffset, adjList } = mesh, passes = Math.max(1, Math.round(SEA_SOFTEN_KM / edgeKm));
    const at = new Map(); cells.forEach((r, i) => at.set(r, i));
    let a = change.slice(), b = new Float32Array(cells.length);
    for (let p = 0; p < passes; p++) {
        for (let i = 0; i < cells.length; i++) {
            const r = cells[i];
            let sum = a[i], k = 1;
            for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) { const q = at.get(adjList[j]); sum += q === undefined ? 0 : a[q]; k++; }
            b[i] = sum / k;
        }
        [a, b] = [b, a];
    }
    for (let i = 0; i < cells.length; i++) {
        const y = Math.max(0, Math.min(1, (h[cells[i]] + change[i] + 1.2) / 0.9)), keep = y * y * (3 - 2 * y);
        change[i] = keep * change[i] + (1 - keep) * a[i];
    }
}

/** The ground a painted area's relief is read against: the area and every cell within CONTEXT_KM of it, those on the
 *  same side of the sea as most of the area (a land character isn't measured against the ocean floor beside it). */
function contextOf(cells, mesh, h, edgeKm) {
    const { adjOffset, adjList } = mesh, hops = Math.max(1, Math.round(CONTEXT_KM / edgeKm));
    const wet = cells.reduce((k, r) => k + (h[r] < 0 ? 1 : 0), 0) > cells.length / 2;
    const seen = new Set(cells);
    let front = cells;
    for (let d = 0; d < hops && front.length; d++) {
        const next = [];
        for (const r of front) for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
            const o = adjList[k];
            if (!seen.has(o)) { seen.add(o); next.push(o); }
        }
        front = next;
    }
    const out = [];
    for (const r of seen) if ((h[r] < 0) === wet) out.push(r);
    return out.length >= cells.length / 4 ? out : cells;
}

/** Unit-sphere point (z-up) of a texture place [u, v], as PlanetView.cellUnder reads it. */
export function pointAt([u, v]) {
    const lon = u * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - v * Math.PI;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** Arc between two unit points, in km. */
export const arcKm = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * R_KM;
