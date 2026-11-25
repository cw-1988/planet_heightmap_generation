// The sea's work on its coasts (docs/coast-processes.md): the waves each coast takes — storm waves grown over the open
// water upwind of it (its fetch, along 16 bearings) and the ocean's swell — the tide it has — a shelf's width and a bay's
// funnel raising it — and the sand it is given — soft rock worn back, and what the rivers bring to the sea that the delta
// did not keep, carried along the shore. Then the mesh's shore by them: a sandy coast's shoreface eased to its equilibrium
// (Dean's h = A·x^⅔), a sheltered macrotidal coast's flats and marsh. The finer forms — cliffs and their platforms,
// beaches, dunes, the tidal flats' edges — are the fine detail's (littoral.js), drawn from the fields made here.

import { report } from '../core/progress.js';
import { mudShare, LITTORAL } from './littoral.js';
import { LatLonGrid } from './finish-grid.js';

const R = 6371, KM_DEG = R * Math.PI / 180, D2R = Math.PI / 180, TAU = 2 * Math.PI, G = 9.81;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const COAST = {
    bearings: 16, stepKm: 12, maxFetchKm: 3000,     // the open water's reach upwind, along each bearing (a rhumb line)
    stormMs: [9, 1.3, 26],      // a storm's wind (m/s): this much, plus this many times the season's mean wind, at most this
    anySide: 0.3,               // a storm's wind from any bearing (storms turn about), the rest by the prevailing wind's onshore share
    swellM: 1.6, swellKm: [300, 3000],   // the ocean's swell, from an open fetch this long (none … all)
    iceC: [-14, -2],            // sea ice: no waves where the year's mean is below the first °C, all above the second
    waveM: [0.5, 4],            // how exposed (0 … 1): the storm's significant height, m
    deepKm: 0.2, shelfMaxKm: 600,          // the shelf: out to this depth, read this far
    tideM: [0.6, 3.2], shelfKm: [40, 400], // a tide: this on a narrow shelf, plus this much on a wide one
    funnel: 1.6, funnelShelfKm: [30, 200], bayKm: 200,  // a bay's funnel (the share of bearings closed within bayKm) raises it
    phaseKm: 2500, amp: [0.55, 1.35],      // the tide's own pattern (amphidromes): a factor varying over thousands of km
    enclosedKm: [300, 2000], enclosedFloor: 0.15,   // an enclosed sea (no bearing open past these) has little tide
    tideMaxM: 12,
    softSand: 0.45, mouthKm: 150,          // sand: soft rock's share, and a river's load carried this far along the shore
    hops: 3,                    // the fields reach this many cells each side of the coast
    winterC: [-10, 35],         // the winter driver's 0 … 255: the coldest month at sea level, °C (reefs, mangroves)
    deanA: 0.1, deanKm: 24, deanShare: 0.6, // the shoreface's equilibrium: depth (m) = A·x(m)^⅔, within this many km
};

/**
 * @param {Object} o  { mesh, z (km; the shore eased in place — the sea stays sea, the land land), ocean, lat, lon (degrees),
 *   wind ({year, jan, jul}: [u, v] on climGrid), climGrid, tAnn (°C), coldSl (the coldest month at sea level, °C), hard (rock hardness 0 … 1, or null), mouths (Map:
 *   river mouth cell → load km³), deltaShare, grid (LatLonGrid), seed }
 * @returns {{wave, tide, sand, winter, muddy, waveE, waveN: Uint8Array, stats: Object}}  per cell, near the coast: how
 *   exposed (0 … 255), the tide's range (255 = tideMaxM), the sand's supply (0 … 255), the winter's warmth (winterC), the
 *   rivers' mud (0 … 255), the way the waves travel (east, north: 128 ± 127 × their energy's mean direction)
 */
export function coastWork(o, F = {}) {
    const C = { ...COAST, ...(F.coast ?? {}) }, { mesh, z, ocean, lat, lon, tAnn, grid } = o;
    const n = mesh.numCells, { adjOffset: aO, adjList: aL, edgeKm } = mesh, B = C.bearings;
    // ── the coast's cells: land beside the sea, sea beside the land ──
    const list = [];
    for (let c = 0; c < n; c++) for (let k = aO[c]; k < aO[c + 1]; k++) if (ocean[aL[k]] !== ocean[c]) { list.push(c); break; }
    const L = list.length, at = new Int32Array(n).fill(-1);
    for (let i = 0; i < L; i++) at[list[i]] = i;
    report(0.05);
    // ── the open water upwind: the sea on the grid, rays from each coast's grid cell ──
    const share = grid.average(lat, lon, ocean), filled = grid.blur(share, 30), seaG = new Uint8Array(grid.size);
    for (let g = 0; g < grid.size; g++) seaG[g] = (share[g] === share[g] ? share[g] : filled[g]) > 0.5 ? 1 : 0;
    const slot = new Int32Array(grid.size).fill(-1), gOf = new Int32Array(L);
    let slots = 0;
    for (let i = 0; i < L; i++) { const g = grid.index(lat[list[i]], lon[list[i]]); gOf[i] = g; if (slot[g] < 0) slot[g] = slots++; }
    const fetch = new Float32Array(slots * B), sinB = new Float64Array(B), cosB = new Float64Array(B);
    for (let b = 0; b < B; b++) { sinB[b] = Math.sin(TAU * b / B); cosB[b] = Math.cos(TAU * b / B); }
    let done = 0;
    for (let g = 0; g < grid.size; g++) {
        const s0 = slot[g];
        if (s0 < 0) continue;
        if ((++done & 4095) === 0) report(0.05 + 0.5 * done / slots);
        const la0 = 90 - (Math.floor(g / grid.w) + 0.5) * grid.step, lo0 = -180 + (g % grid.w + 0.5) * grid.step;
        for (let b = 0; b < B; b++) {
            let la = la0, lo = lo0, s = 0, f = C.maxFetchKm;
            while (s < C.maxFetchKm) {
                s += C.stepKm;
                la += cosB[b] * C.stepKm / KM_DEG;
                if (la > 89 || la < -89) { f = s; break; }
                lo += sinB[b] * C.stepKm / (KM_DEG * Math.max(0.02, Math.cos(la * D2R)));
                if (lo >= 180) lo -= 360; else if (lo < -180) lo += 360;
                const h = grid.index(la, lo);
                if (h !== g && !seaG[h]) { f = s; break; }
            }
            fetch[s0 * B + b] = f;
        }
    }
    report(0.55);
    // ── the shelf: how far each sea cell is from deep water (hops over the sea) ──
    const cap = Math.ceil(C.shelfMaxKm / edgeKm), hop = new Uint16Array(n).fill(65535), queue = new Int32Array(n);
    let qn = 0;
    for (let c = 0; c < n; c++) if (ocean[c] && z[c] < -C.deepKm) { hop[c] = 0; queue[qn++] = c; }
    for (let q = 0; q < qn; q++) {
        const c = queue[q];
        if (hop[c] >= cap) continue;
        for (let k = aO[c]; k < aO[c + 1]; k++) { const nb = aL[k]; if (ocean[nb] && hop[nb] === 65535) { hop[nb] = hop[c] + 1; queue[qn++] = nb; } }
    }
    report(0.65);
    // ── the sand the rivers bring: what the delta did not keep, carried along the shore ──
    const supply = new Float32Array(L), stamp = new Int32Array(L).fill(-1), H = Math.ceil(3 * C.mouthKm / edgeKm);
    let loadSum = 0, loads = 0, mId = 0;
    const ring = [], next = [];
    for (const [m, v0] of o.mouths ?? []) {
        const v = v0 * (1 - (o.deltaShare ?? 0));
        if (!(v > 0)) continue;
        loadSum += v; loads++; mId++;
        // (from the mouth's coast cells: itself if on the coast, else those beside it)
        ring.length = 0;
        if (at[m] >= 0) ring.push(m); else for (let k = aO[m]; k < aO[m + 1]; k++) if (at[aL[k]] >= 0) ring.push(aL[k]);
        for (const c of ring) stamp[at[c]] = mId;
        for (let h = 0; h <= H && ring.length; h++) {
            const w = v * Math.exp(-h * edgeKm / C.mouthKm);
            next.length = 0;
            for (const c of ring) {
                supply[at[c]] += w;
                for (let k = aO[c]; k < aO[c + 1]; k++) { const nb = aL[k], i = at[nb]; if (i >= 0 && stamp[i] !== mId) { stamp[i] = mId; next.push(nb); } }
            }
            ring.length = 0; for (const c of next) ring.push(c);
        }
    }
    const meanLoad = loads ? loadSum / loads : 1;
    report(0.75);
    // ── each coast cell: its waves, its tide, its sand ──
    const seasons = [o.wind.year, o.wind.jan, o.wind.jul], wv = new Float32Array(L), td = new Float32Array(L), sd = new Float32Array(L);
    const dE = new Float32Array(L), dN = new Float32Array(L), cw = new Float32Array(L), md = new Float32Array(L);
    const ph = phases(o.seed ?? 0), kPh = TAU * R / C.phaseKm, cg = new LatLonGrid(180 / o.climGrid.h);
    let sumH = 0, sumT = 0, sandy = 0;
    for (let i = 0; i < L; i++) {
        const c = list[i], la = lat[c], lo = lon[c], f0 = slot[gOf[i]] * B;
        // the storm waves, season by season (the roughest counts), and the swell
        // (and which way the waves travel, all seasons' and the swell's energy together: from bearing b toward the coast —
        // the longshore drift's driver, littoral's spits and barriers)
        let rough = 0, swell = 0, open = 0, far = 0, sE = 0, sN = 0, sT = 0;
        for (const [uF, vF] of seasons) {
            const u = cg.at(uF, la, lo), v = cg.at(vF, la, lo), sp = Math.hypot(u, v);
            const U = Math.min(C.stormMs[2], C.stormMs[0] + C.stormMs[1] * sp);
            let E = 0;
            for (let b = 0; b < B; b++) {
                const on = sp > 0.1 ? Math.max(0, -(u * sinB[b] + v * cosB[b]) / sp) : 0, Ub = U * (C.anySide + (1 - C.anySide) * on);
                const Hb = Math.min(0.0016 * Ub * Math.sqrt(1000 * fetch[f0 + b] / G), 0.21 * Ub * Ub / G), e = Hb * Hb;
                E += e; sE -= e * sinB[b]; sN -= e * cosB[b]; sT += e;
            }
            if (E > rough) rough = E;
        }
        for (let b = 0; b < B; b++) {
            const fb = fetch[f0 + b], s = C.swellM * smooth(C.swellKm[0], C.swellKm[1], fb);
            swell += s * s; sE -= 3 * s * s * sinB[b]; sN -= 3 * s * s * cosB[b]; sT += 3 * s * s;
            if (fb < C.bayKm) open++;
            if (fb > far) far = fb;
        }
        const t = tAnn[c], ice = t === t ? smooth(C.iceC[0], C.iceC[1], t) : 1;
        const Hs = Math.sqrt((rough + swell) / (B / 2)) * ice;
        wv[i] = smooth(C.waveM[0], C.waveM[1], Hs);
        if (sT > 0) { dE[i] = sE / sT; dN[i] = sN / sT; }
        cw[i] = o.coldSl ? o.coldSl[c] : NaN;
        // the tide: the shelf's width (a land cell's: its sea neighbours'), the bay's funnel, an enclosed sea's damping
        let hc = ocean[c] ? hop[c] : 65535;
        if (!ocean[c]) for (let k = aO[c]; k < aO[c + 1]; k++) if (ocean[aL[k]] && hop[aL[k]] < hc) hc = hop[aL[k]];
        const shelf = Math.min(C.shelfMaxKm, hc * edgeKm), funnel = smooth(0.4, 0.85, open / B);
        const x = Math.cos(la * D2R) * Math.cos(lo * D2R), y = Math.cos(la * D2R) * Math.sin(lo * D2R), zz = Math.sin(la * D2R);
        const s1 = Math.sin(kPh * (x * ph[0] + y * ph[1] + zz * ph[2]) + ph[6]), s2 = Math.sin(kPh * (x * ph[3] + y * ph[4] + zz * ph[5]) + ph[7]);
        const amp = C.amp[0] + (C.amp[1] - C.amp[0]) * (0.5 + 0.25 * (s1 + s2));
        const encl = C.enclosedFloor + (1 - C.enclosedFloor) * smooth(C.enclosedKm[0], C.enclosedKm[1], far);
        td[i] = Math.min(C.tideMaxM, amp * encl * (C.tideM[0] + C.tideM[1] * smooth(C.shelfKm[0], C.shelfKm[1], shelf)) * (1 + C.funnel * funnel * smooth(C.funnelShelfKm[0], C.funnelShelfKm[1], shelf)));
        // the sand: soft rock worn back, and the rivers' load
        const soft = 1 - (o.hard ? nearHard(o.hard, ocean, aO, aL, c) : 0.5);
        md[i] = 1 - Math.exp(-supply[i] / meanLoad);
        sd[i] = Math.min(1, C.softSand * soft + 0.9 * md[i]) * (0.4 + 0.6 * smooth(-12, 0, t === t ? t : 10));
        sumH += Hs; sumT += td[i]; if (sd[i] > 0.5) sandy++;
    }
    report(0.85);
    // ── the fields, a few cells each side of the coast (each cell its nearest coast cell's), and the shore eased ──
    const wave = new Uint8Array(n), tide = new Uint8Array(n), sand = new Uint8Array(n), src = new Int32Array(n).fill(-1), dist = new Uint8Array(n);
    const winter = new Uint8Array(n), muddy = new Uint8Array(n), waveE = new Uint8Array(n).fill(128), waveN = new Uint8Array(n).fill(128);
    const unit = v => Math.max(0, Math.min(255, Math.round(128 + 127 * v)));
    let ring2 = list.slice();
    for (let i = 0; i < L; i++) src[list[i]] = i;
    for (let h = 1; h <= C.hops && ring2.length; h++) {
        const nx = [];
        for (const c of ring2) for (let k = aO[c]; k < aO[c + 1]; k++) { const nb = aL[k]; if (src[nb] < 0) { src[nb] = src[c]; dist[nb] = h; nx.push(nb); } }
        ring2 = nx;
    }
    for (let c = 0; c < n; c++) {
        const i = src[c];
        if (i < 0) continue;
        wave[c] = Math.round(255 * wv[i]); tide[c] = Math.round(255 * td[i] / C.tideMaxM); sand[c] = Math.round(255 * sd[i]);
        muddy[c] = Math.round(255 * md[i]); waveE[c] = unit(dE[i]); waveN[c] = unit(dN[i]);
        if (cw[i] === cw[i]) winter[c] = Math.max(0, Math.min(255, Math.round(255 * (cw[i] - C.winterC[0]) / (C.winterC[1] - C.winterC[0]))));
        const mud = mudShare(wv[i], td[i]);
        if (ocean[c]) {
            // (the shoreface: sand eases it toward Dean's profile — cut where shoal, filled where deep; a sheltered macrotidal
            // coast's flats raised toward the low-tide line)
            const xKm = (dist[c] + 0.5) * edgeKm, dean = -C.deanA * (1000 * xKm) ** (2 / 3) / 1000;
            const w = C.deanShare * sd[i] * (0.3 + 0.7 * wv[i]) * (1 - smooth(0.5 * C.deanKm, C.deanKm, xKm));
            let v = z[c] + (dean - z[c]) * w;
            // (each by the share of the cell its flats cover — 0.35 km a metre of tide, littoral.js: raised whole, a coarse
            // mesh's 50 km cells made 100–250 km of water a few metres deep, its sandy bed a pale blue glow round every muddy
            // coast on the Satellite — the owner, 2026-11-20, docs/satellite-sea.md)
            const fl = mud * flatShare(LITTORAL.flatKmPerM * td[i], dist[c], edgeKm);
            if (fl > 0) v = Math.max(v, v + (-0.0005 * td[i] * (dist[c] + 0.5) - v) * fl);
            z[c] = Math.min(-0.0005, v);
        } else if (dist[c] === 0 && mud > 0 && z[c] > 0 && z[c] < 0.02) {
            // (a marsh: low land behind the flats settled to the high-tide line, by the share of the cell it covers)
            z[c] = Math.max(0.0005, z[c] + (0.0004 * td[i] - z[c]) * 0.7 * mud * flatShare(LITTORAL.marshKmPerM * td[i], 0, edgeKm));
        }
    }
    report(0.98);
    return { wave, tide, sand, winter, muddy, waveE, waveN, stats: { coastCells: L, meanWaveM: L ? +(sumH / L).toFixed(2) : 0, meanTideM: L ? +(sumT / L).toFixed(2) : 0, sandyShare: L ? +(sandy / L).toFixed(3) : 0 } };
}

/** The share of a cell `hops` cells from the coast (each `edgeKm` across) that a band `widthKm` wide from the shore covers. */
const flatShare = (widthKm, hops, edgeKm) => Math.max(0, Math.min(1, (widthKm - hops * edgeKm) / edgeKm));

/** A land coast cell's rock hardness; a sea one's, its land neighbours' mean. */
function nearHard(hard, ocean, aO, aL, c) {
    if (!ocean[c]) return hard[c] === hard[c] ? hard[c] : 0.5;
    let s = 0, k0 = 0;
    for (let k = aO[c]; k < aO[c + 1]; k++) { const nb = aL[k]; if (!ocean[nb] && hard[nb] === hard[nb]) { s += hard[nb]; k0++; } }
    return k0 ? s / k0 : 0.5;
}

/** Two seeded directions (unit vectors) and phases: the tide's own pattern. */
function phases(seed) {
    let s = (seed * 2654435761 + 977) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const out = new Float64Array(8);
    for (let v = 0; v < 2; v++) {
        const zz = 2 * rnd() - 1, a = TAU * rnd(), r = Math.sqrt(1 - zz * zz);
        out[3 * v] = r * Math.cos(a); out[3 * v + 1] = r * Math.sin(a); out[3 * v + 2] = zz;
    }
    out[6] = TAU * rnd(); out[7] = TAU * rnd();
    return out;
}
