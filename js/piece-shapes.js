// Piece characters (fork addition): a piece (a Generate plate, the thing Ctrl-click floods or raises) given a character —
// Flat, Hilly, Mountainous, Plateau, Archipelago, Shallow sea, Lakeland, Rifted, Volcanic, Swamp, Ocean — and a level nudge. Each
// stands for something a world does to its ground, laid on the piece's heights after they are drawn and before the
// finish erodes them (so rivers, lakes, coasts and the climate all follow). Each reshapes the ground the plates made, never
// paints new ground: the old ranges, basins and grain carry through (an archipelago's islands are its old high ground).
//   Flat         a craton's worn-down shield or a sedimentary platform: relief pressed down to a few hundred metres
//   Hilly        an old, eroded orogen: rolling hills, no high peaks
//   Mountainous  a young orogen: the high ground lifted and ridged, up to ~4–5 km
//   Plateau      crust thickened and lifted as a block (Tibet, the Altiplano, Colorado): a high, fairly level top
//                behind a steep escarpment
//   Archipelago  a drowned continental margin: sunk until only its old high ground stands above the sea
//   Shallow sea  a flooded shelf or epicontinental sea (Hudson Bay, the Sunda Shelf): ~40 to ~200 m deep, its shoals
//                kept far enough under that the finish doesn't lift them into islands
//   Lakeland     a glacier-scoured shield: low ground pitted with closed hollows the finish fills as lakes
//   Rifted       crust stretched apart (Basin and Range): parallel horsts and grabens across one direction
//   Volcanic     a hotspot or a volcanic province: cones on a basalt plain, or rising from the sea floor as islands
//   Swamp        a low, poorly drained plain barely above the sea (a delta's back swamps, the Pantanal, the Sudd): tens
//                of metres of relief at most; how wet it is stays the climate's and the rivers' call
//   Ocean        the deep ocean floor: sunk to the abyssal plain (~3.5–4.5 km), a continental slope where it meets land
// The same characters paint along a brush stroke (terrain-brush.js, characterTarget with a `line`): there the directional
// ones follow the stroke — a range's crest along its middle, an archipelago's islands strung along it, a rift's blocks
// running with it, volcanoes along it.
// Every distance is in km (the ramp from the piece's edge, the noise's wavelengths, the cones' size), so a character looks
// the same at every Detail; features finer than the mesh can hold are left out rather than aliased.
//
// Shape: { piece: the piece's id (its seed region), c: the character (an index into CHARACTERS, 0 none), lv: the level
// nudge in km (−1.5 … +1.5) }
import { FastNoise } from '../v2/js/core/fast-noise.js';
import { makeRng } from './rng.js';

const R_KM = 6371;
/** The characters, in the planet code's order (never reorder: a shared code names them by index). `land`: the character
 *  makes the piece land (the page raises a sunk piece it is given to); `sea`: it makes the piece sea (the page floods a
 *  land piece it is given to); the others keep the piece's land or sea. */
// tip: what painting it does to the surface (the picker's tooltip and hint line).
// tok: the paint layer's colour (a categorical token, docs/style-guide/maps.md): eight hues, so the families share one —
// the seas, and plateau with rifted — and the readout names the member.
export const CHARACTERS = [
    { id: 'none', name: 'Unchanged', land: false },
    { id: 'flat', name: 'Flat', land: true, tok: '--cat-5', tip: 'Presses the relief down to a few hundred metres: a worn shield or a level plain' },
    { id: 'hilly', name: 'Hilly', land: true, tok: '--cat-1', tip: 'Wears the high ground into rolling hills, with no high peaks: an old, eroded range' },
    { id: 'mountainous', name: 'Mountainous', land: true, tok: '--cat-3', tip: 'Lifts the high ground into ridged peaks up to 4–5 km: a young range, its crest along the stroke' },
    { id: 'plateau', name: 'Plateau', land: true, tok: '--cat-6', tip: 'Raises the ground as a high, fairly level block behind a steep escarpment' },
    { id: 'archipelago', name: 'Archipelago', land: false, tok: '--cat-7', tip: 'Sinks the ground until only its old high ground stands above the sea as islands, strung along the stroke' },
    { id: 'shallow', name: 'Shallow sea', land: false, tok: '--cat-7', tip: 'Lifts deep sea floor to a shelf sea 40–200 m deep and floods any land in it, islands too' },
    { id: 'lakeland', name: 'Lakeland', land: true, tok: '--cat-4', tip: 'Lowers the ground and pits it with closed hollows that fill as lakes (salt lakes and pans where it is dry)' },
    { id: 'rifted', name: 'Rifted', land: true, tok: '--cat-6', tip: 'Pulls the crust apart into parallel ridges and basins that run with the stroke' },
    { id: 'volcanic', name: 'Volcanic', land: false, tok: '--cat-8', tip: 'Sets volcanic cones on a basalt plain, or raises them from the sea floor as islands' },
    { id: 'swamp', name: 'Swamp', land: true, tok: '--cat-2', tip: 'Lowers the ground to waterlogged flats barely above the sea, tens of metres of relief at most' },
    { id: 'ocean', name: 'Ocean', land: false, sea: true, tok: '--cat-7', tip: 'Sinks the ground to the deep ocean floor, about 4 km down, with a continental slope where it meets land' },
];
/** The characters that take a piece under the sea: they blend only into neighbouring land, not the old coast. */
export const SINKS = new Set(['archipelago', 'shallow', 'ocean']);
export const LEVEL_MIN = -1.5, LEVEL_MAX = 1.5, LEVEL_STEP = 0.1;
/** A shape that changes nothing. */
export const isPlain = s => !s || (!s.c && !s.lv);

/**
 * Each shape onto the ground (mutated): `h` the heights (km), `also` the uncarved surface's (or null / the same array),
 * on the terrain mesh `tm` (presentTerrainMesh: unit xyz, z-up; numCells, adjOffset, adjList), `r_plate` each cell's
 * piece. The same change lands on both, as a brush stroke's does. Returns whether anything changed.
 */
export function applyShapes(shapes, tm, r_plate, h, also, seed) {
    const list = (shapes ?? []).filter(s => !isPlain(s));
    if (!list.length) return false;
    const n = tm.numCells, xyz = tm.xyz, edgeKm = (Math.PI * R_KM) / Math.sqrt(n), cellKm2 = (4 * Math.PI * R_KM * R_KM) / n;
    const byPiece = new Map(list.map(s => [s.piece, s]));
    const cellsOf = new Map(list.map(s => [s.piece, []]));
    for (let r = 0; r < n; r++) cellsOf.get(r_plate[r])?.push(r);
    const both = also && also !== h ? also : null;
    let changed = false;
    for (const [piece, cells] of cellsOf) {
        if (!cells.length) continue;
        const s = byPiece.get(piece), ch = CHARACTERS[s.c] ?? CHARACTERS[0];
        const areaKm2 = cells.length * cellKm2, sizeKm = Math.sqrt(areaKm2);
        // the blend from the piece's edge inward (hops of the mesh's spacing: scale-invariant), so it meets its
        // neighbours where it did; a plateau rises behind a steeper escarpment
        const rampKm = Math.min(ch.id === 'plateau' ? 50 : 140, 0.25 * sizeKm), sinks = SINKS.has(ch.id) || (s.lv || 0) < 0;
        // (a piece that sinks meets the sea where it borders the sea: it blends only into neighbouring land, so no rim of
        // the old coast is left standing)
        const w = edgeWeights(tm, r_plate, piece, cells, Math.max(1, Math.round(rampKm / edgeKm)), sinks ? (o => h[o] >= 0) : null);
        const target = characterTarget(ch.id, cells, xyz, h, edgeKm, areaKm2, hash(seed, piece, s.c));
        for (let i = 0; i < cells.length; i++) {
            const r = cells[i], t = target ? target[i] : h[r];
            const d = w[i] * (t - h[r] + (s.lv || 0));
            if (!d) continue;
            h[r] += d;
            if (both) both[r] += d;
            changed = true;
        }
    }
    return changed;
}

/** Each cell's weight, 0 at the piece's edge → 1 `hops` hops in (smoothstep): a breadth-first walk from the cells
 *  that touch another piece (only those whose neighbour passes `blendsInto`, when given). */
function edgeWeights(tm, r_plate, piece, cells, hops, blendsInto = null) {
    const { adjOffset, adjList } = tm, dist = new Map(), queue = [];
    for (const r of cells) {
        for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
            const o = adjList[k];
            if (r_plate[o] !== piece && (!blendsInto || blendsInto(o))) { dist.set(r, 0); queue.push(r); break; }
        }
    }
    for (let q = 0; q < queue.length; q++) {
        const r = queue[q], d = dist.get(r);
        if (d >= hops) continue;
        for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
            const o = adjList[k];
            if (r_plate[o] === piece && !dist.has(o)) { dist.set(o, d + 1); queue.push(o); }
        }
    }
    return cells.map(r => { const d = dist.get(r); if (d === undefined) return 1; const x = d / hops; return x * x * (3 - 2 * x); });
}

/** The character's heights for each of the cells (km), or null to keep them (Unchanged: the level alone). Each
 *  reshapes the ground the plates made rather than painting new ground: `rel`, the cells' own relief (their heights from
 *  their low end, 0, to their high end, 1), carries the old ranges, basins and grain into every character.
 *  `line` (a brush stroke's band, terrain-brush.js): { centre: per cell 1 on the stroke's line → 0 at the band's edge,
 *  widthKm: the band's half-width, dir: the stroke's direction at its middle (a unit tangent, or null) }; the directional
 *  characters follow it, and their features are sized to the band; context: the cells whose relief the band is read
 *  against (its pieces), so it keeps its place in the ground around it rather than spanning low to high on its own. */
export function characterTarget(id, cells, xyz, h, edgeKm, areaKm2, pieceSeed, line = null) {
    if (id === 'none') return null;
    const C = line?.centre, wKm = line?.widthKm ?? Infinity;
    const fit = (lambdaKm, share) => Math.max(2.5 * edgeKm, Math.min(lambdaKm, share * wKm));     // (a feature no wider than the band)
    const noise = new FastNoise(pieceSeed);
    // (noise at a wavelength in km; one finer than ~2.5 cells is left out, as the mesh can't hold it)
    const at = (r, lambdaKm, octaves = 4) => {
        if (lambdaKm < 2.5 * edgeKm) return 0;
        const k = R_KM / lambdaKm, oct = Math.max(1, Math.min(octaves, Math.floor(Math.log2(lambdaKm / (2.5 * edgeKm))) + 1));
        return noise.fbm(xyz[3 * r] * k, xyz[3 * r + 1] * k, xyz[3 * r + 2] * k, oct, 0.5);
    };
    const ridged = (r, lambdaKm, octaves) => { const v = 1 - Math.abs(at(r, lambdaKm, octaves)); return v * v; };
    // the piece's relief: its heights between their 5th and 95th percentiles as 0 … 1 (a little past at the extremes)
    const sorted = Float32Array.from(line?.context ?? cells, r => h[r]).sort();
    const lo = sorted[Math.floor(0.05 * (sorted.length - 1))], hi = sorted[Math.floor(0.95 * (sorted.length - 1))];
    const span = Math.max(0.05, hi - lo);
    const rel = Float32Array.from(cells, r => Math.max(-0.1, Math.min(1.1, (h[r] - lo) / span)));
    const out = new Float32Array(cells.length);
    // (painted over a sea floor deeper than the character's own: the floor rises toward the stroke's line across the
    // whole band, a broad swell with a ragged foot (bays and spurs a few hundred km and a band's width across), rather than standing at the character's level out to the band's edge
    // and dropping off there, a flat-topped ribbon tracing the stroke)
    // (`from`, `span`: where on the band, by its centre value, the rise starts and how far in it is whole: the shelf
    // whole over most of the band, the islands' floor only near the line. `islands`: what stands near or above the sea
    // keeps its full height wherever it is, its flanks dropping to the old floor over the last 1.2 km below the sea)
    const riseSoftly = (from, span, islands = false) => {
        if (!C) return;
        const lf = fit(400, 1.2), lb = fit(1000, 3.5);
        cells.forEach((r, i) => {
            if (!(h[r] < 0 && out[i] > h[r])) return;
            const x = Math.max(0, Math.min(1, (C[i] + 0.3 * at(r, lf, 3) + 0.25 * at(r, lb, 2) - from) / span));
            const y = islands ? Math.max(0, Math.min(1, (out[i] + 1.2) / 1.2)) : 0;
            const f = Math.max(x * x * (3 - 2 * x), y * y * (3 - 2 * y));
            out[i] = h[r] + (out[i] - h[r]) * f;
        });
    };
    switch (id) {
        case 'flat':
            // (the relief pressed down to a few hundred metres: the old ranges still faintly there)
            cells.forEach((r, i) => { out[i] = 0.1 + 0.35 * rel[i] + 0.04 * at(r, 300) + 0.02 * at(r, 60); });
            break;
        case 'hilly':
            // (the relief softened to ~1.3 km at most, rolling hills on it)
            cells.forEach((r, i) => { out[i] = 0.2 + 0.85 * rel[i] + 0.2 * Math.abs(at(r, 90)) + 0.06 * at(r, 30); });
            break;
        case 'mountainous':
            // (the relief lifted and sharpened: ridges strongest where the ground was already high and reaching down its
            // slopes (the relief's square root), a soft ceiling near 5 km)
            // (painted: the crest runs along the stroke's middle, the old high ground lifted with it)
            {
                const l1 = fit(280, 0.9), l2 = fit(70, 0.25);
                cells.forEach((r, i) => {
                    const x = C ? Math.max(Math.pow(C[i], 1.3), 0.5 * Math.sqrt(Math.max(0, rel[i]))) : Math.sqrt(Math.max(0, rel[i]));
                    out[i] = 5 * Math.tanh((0.5 + 1.4 * x + x * (3.0 * ridged(r, l1, 4) + 0.6 * ridged(r, l2, 3))) / 5);
                });
            }
            break;
        case 'plateau':
            // (the ground lifted as a block, its relief kept but pressed: a high, fairly level top)
            cells.forEach((r, i) => { out[i] = 2.3 + 0.5 * (rel[i] - 0.5) + 0.1 * at(r, 300) + 0.06 * at(r, 60); });
            break;
        case 'archipelago':
            // (the piece drowned until only its high ground (the old ranges and uplands) stands above the sea)
            // (painted: a chain of islands strung along the stroke's middle, the sea around them)
            if (C) {
                // (in groups: a long, slow noise opens straits between clusters and lets a few stand off the line)
                const li = fit(260, 0.7), lg = fit(900, 3), l2 = fit(70, 0.2);
                cells.forEach((r, i) => { out[i] = 1.6 * (0.7 * C[i] + 0.8 * at(r, li) + 0.6 * at(r, lg, 2) + 0.2 * rel[i] - 0.76) + 0.08 * at(r, l2); });
            }
            else cells.forEach((r, i) => { out[i] = 1.5 * (rel[i] - 0.68) + 0.16 * at(r, 260) + 0.1 * at(r, 70); });
            riseSoftly(0.08, 0.75, true);
            break;
        case 'shallow':
            // (flooded to a shelf: the old hills under the water as shoals and banks, the low ground deepest. The shoals
            // stay ≥ ~35 m down: shallower ones came up as islands once the finish had worked on the ground)
            // (and hollows of its own, a few hundred km across, so a shelf painted over even floor isn't one even shade:
            // only ever deeper, as a bank brought nearer the surface comes up as an island once the finish has worked)
            { const lk = fit(350, 1.4);
                cells.forEach((r, i) => { out[i] = Math.min(-0.035, -0.05 - 0.14 * Math.pow(Math.max(0, 1 - rel[i]), 1.2) - 0.09 * Math.abs(at(r, lk, 3)) + 0.012 * at(r, 80)); }); }
            riseSoftly(-0.05, 0.4);
            break;
        case 'ocean':
            // (sunk to the abyssal plain: the old relief a faint swell on it, long low rises and a little roughness.
            // Where it meets land the transition is the continental slope)
            cells.forEach((r, i) => { out[i] = -4.0 + 0.5 * (Math.max(0, Math.min(1, rel[i])) - 0.5) + 0.25 * at(r, 600) + 0.08 * at(r, 80); });
            break;
        case 'lakeland':
            // (low, scoured ground on the old relief, with closed hollows where the noise dips past a threshold. The
            // hollows are ~100 km across (noise of 240 km, or 4 cells on a coarse mesh), as finer ones the finish's mesh
            // averages away. Their floors stay above the sea, so they fill as lakes, not inlets; and they are deeper than
            // the finish's outlet gorges (breachKm, 0.6 km). What stands in them is the climate's call: fresh lakes where
            // it is wet, salt lakes and pans in the dry belts, and a big river through a hollow may still cut it or silt
            // it up (the Lakes slider keeps more))
            {
                const pitKm = Math.max(240, 4 * edgeKm);
                cells.forEach((r, i) => {
                    // (steep sides, flat floors: most of a hollow a full km down, so a lake still stands behind the cut)
                    const pit = Math.min(1, Math.max(0, -at(r, pitKm, 3) - 0.25) / 0.08);
                    const ground = 0.9 + 0.3 * rel[i] + 0.05 * at(r, 300) + 0.05 * at(r, 30);
                    out[i] = Math.max(0.03, ground - 1.1 * pit * pit * (3 - 2 * pit));
                });
            }
            break;
        case 'rifted': {
            // (horsts and grabens across one direction: distance from a great circle through the piece, warped, folded
            // into ridges a few cells apart however fine the mesh)
            const rand = makeRng(pieceSeed), c = [0, 0, 0];
            for (const r of cells) for (let a = 0; a < 3; a++) c[a] += xyz[3 * r + a];
            const cl = Math.hypot(...c) || 1; for (let a = 0; a < 3; a++) c[a] /= cl;
            // the stretching direction: a random tangent at the piece's middle (painted: across the stroke, so the blocks
            // run along it)
            const t = line?.dir;
            const v = t ? [c[1] * t[2] - c[2] * t[1], c[2] * t[0] - c[0] * t[2], c[0] * t[1] - c[1] * t[0]] : [rand() - 0.5, rand() - 0.5, rand() - 0.5];
            const vc = v[0] * c[0] + v[1] * c[1] + v[2] * c[2];
            for (let a = 0; a < 3; a++) v[a] -= vc * c[a];
            const vl = Math.hypot(...v) || 1; for (let a = 0; a < 3; a++) v[a] /= vl;
            const spacingKm = Math.max(4 * edgeKm, Math.min(160, 0.7 * wKm));
            cells.forEach((r, i) => {
                const along = Math.asin(Math.max(-1, Math.min(1, v[0] * xyz[3 * r] + v[1] * xyz[3 * r + 1] + v[2] * xyz[3 * r + 2]))) * R_KM;
                const ph = (along + 0.4 * spacingKm * at(r, 3 * spacingKm, 2)) / spacingKm * 2 * Math.PI;
                const block = Math.tanh(2.5 * Math.cos(ph)) / Math.tanh(2.5);
                out[i] = 0.6 + 0.7 * rel[i] + 0.55 * block + 0.05 * at(r, 40);      // (on the old relief)
            });
            break;
        }
        case 'volcanic': {
            // (cones on a basalt plain, by the piece's size; on a sunk piece they rise from the floor as islands)
            const rand = makeRng(pieceSeed), sunk = cells.reduce((a, r) => a + (h[r] < 0 ? 1 : 0), 0) > cells.length / 2;
            // (painted: the cones stand along the stroke's middle)
            const count = Math.max(C ? 1 : 2, Math.min(40, Math.round(areaKm2 / (C ? 120000 : 250000))));
            const sites = C ? cells.filter((r, i) => C[i] > 0.6) : cells;
            const cones = [];
            for (let k = 0; k < count && sites.length; k++) {
                const r = sites[Math.floor(rand() * sites.length)];
                const radiusKm = Math.max(2.5 * edgeKm, Math.min(30 + 60 * rand(), C ? 0.8 * wKm : Infinity));
                cones.push({ p: [xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]], rad: radiusKm / R_KM, top: sunk ? 0.6 + 2.0 * rand() : 1.6 + 1.8 * rand() });
            }
            cells.forEach((r, i) => {
                // (on land a basalt plain floods the low ground and the old heights stand out of it)
                const base = sunk ? h[r] : Math.max(h[r], 0.45 + 0.08 * at(r, 300) + 0.03 * at(r, 50));
                let t = base;
                for (const cn of cones) {
                    const dot = cn.p[0] * xyz[3 * r] + cn.p[1] * xyz[3 * r + 1] + cn.p[2] * xyz[3 * r + 2];
                    const d = Math.acos(Math.max(-1, Math.min(1, dot))) / cn.rad;
                    if (d >= 1) continue;
                    let f = Math.pow(1 - d, 1.6);
                    if (d < 0.1 && cn.rad * R_KM > 6 * edgeKm) f -= 0.15 * (1 - d / 0.1);   // (a crater, where the mesh can hold one)
                    t = Math.max(t, base + Math.max(0, cn.top - base) * f);
                }
                out[i] = t;
            });
            break;
        }
        case 'swamp':
            // (a low plain barely above the sea, its relief pressed to tens of metres: the water lingers on it)
            cells.forEach((r, i) => { out[i] = Math.max(0.004, 0.015 + 0.03 * Math.max(0, Math.min(1, rel[i])) + 0.008 * at(r, 200) + 0.004 * at(r, 40)); });
            break;
        default: return null;
    }
    return out;
}

/** A piece's own seed for its character: the world's seed, the piece and the character mixed. */
function hash(seed, piece, c) {
    let x = (seed | 0) ^ Math.imul(piece + 1, 0x9e3779b1) ^ Math.imul(c + 7, 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d); x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return ((x ^ (x >>> 16)) >>> 0) % 2147483646;
}
