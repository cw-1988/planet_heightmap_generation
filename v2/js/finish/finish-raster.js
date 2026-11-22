// The finished planet's picture (finish.js finishPlanet's result, drawn): heights, sea, lakes and small lakes per pixel,
// and at most 4096 px wide the land's climate, cover, rocks and farming. Each band of rows is its own (rasterBand):
// raster-workers.js draws the bands on short-lived workers and stitches them; finishRaster here draws them all at once.

import { pondRaster } from './small-lakes-draw.js';
import { fineMottle, terrainLook } from './finish-cover.js';
import { STAT_KEYS } from '../climate/cell-stats.js';
import { FastNoise } from '../core/fast-noise.js';
import { locate } from '../core/mesh-locate.js';
import { encHarvests, decHarvests, hasHarvests } from '../farming/farming.js';

const R = 6371;
/** The widest climate picture a finish makes: the page's sharpest texture (finer would not be seen). */
export const CLIMATE_WIDTH_MAX = 4096;
/** The farming's parts the picture carries per pixel (farming/farming.js farmCells, and the seasons). */
export const FARM_KEYS = ['soil', 'rain', 'warm', 'flood', 'canal', 'slope', 'wetland', 'pasture'];

/** The climate picture's width for a picture `w` wide (0: none), and its step in the heights' pixels. */
export function climateWidth(w, climate) {
    const cw = climate ? Math.min(w, CLIMATE_WIDTH_MAX) : 0;
    return { cw, ch: cw >> 1, f: cw ? w / cw : 0 };
}

/**
 * The finished planet as an equirectangular picture of heights: w × w/2 pixels (rows north → south, columns from −180°
 * east), 16-bit metres, and the ocean (1) — for the page to paint and shade, and to export. Heights blended over the
 * mesh triangle under each pixel; `onRow` reports progress.
 */
export function finishRaster(mesh, z, ocean, w, onRow = null, lake = null, lakeLevel = null, climate = null, geology = null, farming = null, located = null, pond = null) {
    const h = w >> 1;
    // (located: each pixel's three cells and weights — an empty {} is filled, a filled one read instead of locating again:
    // the terrain's early picture and the finished one share them)
    const got = located?.c ? located : null, keep = located && !got ? Object.assign(located, { c: new Int32Array(3 * w * h), w: new Float64Array(3 * w * h) }) : null;
    const S = { mesh, z, ocean, lake, lakeLevel, climate, geology, farming, pond, got, keep };
    return rasterFinish(rasterBand(S, w, 0, h, onRow), S, w);
}

/**
 * Rows py0…py1−1 of the picture (py0 a multiple of the climate picture's step): the band's own arrays, its first row
 * the band's. S {mesh, z, ocean, lake, lakeLevel, climate, geology, farming, pond, got, keep} — got / keep the band's
 * pixels' cells and weights, read or filled (3 a pixel, from the band's first).
 */
export function rasterBand(S, w, py0, py1, onRow = null) {
    const { mesh, z, ocean, lake, lakeLevel, climate, geology, farming, pond, got, keep } = S;
    const h = w >> 1, rows = py1 - py0, P = w * rows, c3 = [0, 0, 0], w3 = [0, 0, 0];
    const heightM = new Int16Array(P), sea = new Uint8Array(P), water = new Uint8Array(P), waterLevel = lake ? new Int16Array(P) : null;
    // (the small lakes' share per pixel, small-lakes.js: pond {share (per cell), seed})
    const pondPx = pond && lake ? new Uint8Array(P) : null;
    // (the climate's picture: at most as wide as the page's sharpest texture — every f-th pixel of the heights' — the
    // land's Köppen class (its weightiest land cell's), °C × 100 and mm a year (its land cells' weighted mean); the sea
    // −32768 °C, 0 mm. With the land's cover: its colours from space (the year, January, July: its land cells' weighted
    // mean) and its biome and snow (the weightiest's))
    const { cw, f } = climateWidth(w, climate), k0 = cw ? py0 / f : 0, Q = cw ? cw * Math.ceil(rows / f) : 0;
    const kop = cw ? new Uint8Array(Q) : null, tA = cw ? new Int16Array(Q).fill(-32768) : null, pA = cw ? new Uint16Array(Q) : null;
    const sat = cw && climate.sat ? climate.sat.map(() => new Uint8Array(3 * Q)) : null, cov = sat ? new Uint8Array(Q) : null, s3 = [0, 0, 0];
    const mottle = sat ? new FastNoise(climate.mottleSeed ?? 0) : null, flowPx = sat && climate.flow ? new Float32Array(Q) : null;
    const youngPx = sat && climate.young ? new Uint8Array(Q) : null;
    const ripPx = sat && climate.ripSat ? climate.ripSat.map(() => new Uint8Array(3 * Q)) : null;
    // (and the land's measures beyond Köppen, cell-stats.js bytes — the weightiest land cell's)
    const statPx = cw && climate.stats ? Object.fromEntries(STAT_KEYS.map(k => [k, new Uint8Array(Q)])) : null;
    // (and the geology's rocks, on the climate's picture — its weightiest land cell's, as the Köppen class — and the
    // history's record cell each shows, for the Geology tab's other views)
    const rockPx = cw && geology?.rock ? new Uint8Array(Q) : null, recPx = rockPx && geology.rec ? new (geology.simCells < 65536 ? Uint16Array : Int32Array)(Q) : null, dither = rockPx ? new FastNoise(0x6e0c) : null, ditherF = R / (1.5 * (mesh.edgeKm ?? 30));
    // (and the farming's parts, on the climate's picture: its land cells' weighted mean — the soil's kind the weightiest's)
    const farmPx = cw && farming ? Object.fromEntries(FARM_KEYS.map(k => [k, new Uint8Array(Q)])) : null, farmKind = farmPx ? new Uint8Array(Q) : null;
    // (each crop group's harvests a year, by rain and watered — two bytes a pixel under its name: each averaged in
    // harvests, not in its byte)
    const cropPx = farmPx && hasHarvests(farming) ? Object.fromEntries(Object.keys(farming.crops).map(key => [key, new Uint8Array(2 * Q)])) : null;
    // (each column's longitude's cosine and sine, once)
    const cosLon = new Float64Array(w), sinLon = new Float64Array(w);
    for (let px = 0; px < w; px++) { const lon = ((px + 0.5) / w - 0.5) * 2 * Math.PI; cosLon[px] = Math.cos(lon); sinLon[px] = Math.sin(lon); }
    for (let py = py0; py < py1; py++) {
        const lat = (0.5 - (py + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let px = 0; px < w; px++) {
            const i = (py - py0) * w + px, o3 = 3 * i;
            if (got) { c3[0] = got.c[o3]; c3[1] = got.c[o3 + 1]; c3[2] = got.c[o3 + 2]; w3[0] = got.w[o3]; w3[1] = got.w[o3 + 1]; w3[2] = got.w[o3 + 2]; }
            else {
                locate(mesh, cl * cosLon[px], cl * sinLon[px], sl, c3, w3);
                if (keep) { keep.c[o3] = c3[0]; keep.c[o3 + 1] = c3[1]; keep.c[o3 + 2] = c3[2]; keep.w[o3] = w3[0]; keep.w[o3 + 1] = w3[1]; keep.w[o3 + 2] = w3[2]; }
            }
            const v = w3[0] * z[c3[0]] + w3[1] * z[c3[1]] + w3[2] * z[c3[2]];
            heightM[i] = Math.max(-32000, Math.min(32000, Math.round(v * 1000)));
            // (the sea: below sea level where one of the pixel's cells is the ocean's — its coast the heights' 0 m contour, not
            // the nearest cell's edge: a coastal cell's block went out to sea as flat land wherever the floor fell steeply
            // beside it, the owner, 2026-11-20: "why is this transition from land towards sea/lake still so bad?"; a hollow
            // the ocean cannot reach has no ocean cell, so it stays land)
            sea[i] = v < 0 && ((w3[0] > 0 && ocean[c3[0]]) || (w3[1] > 0 && ocean[c3[1]]) || (w3[2] > 0 && ocean[c3[2]])) ? 1 : 0;
            // (a lake: under its level, where one of the pixel's cells is lake — its shore as crisp as the heights; its level (m) kept, the depth over its bed: lake-water.js)
            if (lake) for (let j = 0; j < 3; j++) { const c = c3[j]; if (lake[c] && w3[j] > 0.2 && v < lakeLevel[c]) { water[i] = lake[c]; waterLevel[i] = Math.round(lakeLevel[c] * 1000); break; } }
            if (pondPx && !sea[i]) pondPx[i] = Math.round(w3[0] * pond.share[c3[0]] + w3[1] * pond.share[c3[1]] + w3[2] * pond.share[c3[2]]);
            if (cw && !sea[i] && px % f === 0 && py % f === 0) {
                let ws = 0, t = 0, p = 0, best = -1, bw = 0;
                for (let j = 0; j < 3; j++) {
                    const c = c3[j];
                    if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue;
                    ws += w3[j]; t += w3[j] * climate.tAnnual[c]; p += w3[j] * climate.pAnnual[c];
                    if (w3[j] > bw) { bw = w3[j]; best = c; }
                }
                if (best >= 0) {
                    const k = (py / f - k0) * cw + px / f;
                    kop[k] = climate.koppen[best]; tA[k] = Math.round(100 * t / ws); pA[k] = Math.min(65535, Math.round(p / ws));
                    if (statPx) for (const key of STAT_KEYS) statPx[key][k] = climate.stats[key][best];
                    if (farmPx) {
                        for (const key of FARM_KEYS) {
                            const f = farming[key];
                            let s = 0;
                            for (let j = 0; j < 3; j++) { const c = c3[j]; if (!ocean[c] && climate.tAnnual[c] === climate.tAnnual[c]) s += w3[j] * f[c]; }
                            farmPx[key][k] = Math.round(s / ws);
                        }
                        farmKind[k] = farming.kind[best];
                        if (cropPx) for (const key in cropPx) for (let q = 0; q < 2; q++) {
                            const b = farming.crops[key];
                            let s = 0;
                            for (let j = 0; j < 3; j++) { const c = c3[j]; if (!ocean[c] && climate.tAnnual[c] === climate.tAnnual[c]) s += w3[j] * decHarvests(b[2 * c + q]); }
                            cropPx[key][2 * k + q] = encHarvests(s / ws);
                        }
                    }
                    if (rockPx) {
                        // (the rock: where the pixel's cells differ, the one with the largest share scaled by a noise of
                        // its own about a cell across — contacts ragged within a cell, never the mesh's straight edges)
                        let pick = best, pv = -1;
                        const r0 = geology.rock[best];
                        for (let j = 0; j < 3; j++) {
                            const c = c3[j];
                            if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c]) || geology.rock[c] === r0) continue;
                            pick = -1;
                            break;
                        }
                        if (pick < 0) for (let j = 0; j < 3; j++) {
                            const c = c3[j];
                            if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue;
                            const x = cl * cosLon[px] * ditherF + (c % 101) * 1.37, y = cl * sinLon[px] * ditherF + (c % 89) * 2.11, zz = sl * ditherF + (c % 83) * 0.73;
                            const v = w3[j] * Math.exp(1.6 * dither.noise3D(x, y, zz));
                            if (v > pv) { pv = v; pick = c; }
                        }
                        rockPx[k] = geology.rock[pick];
                        if (recPx) recPx[k] = geology.rec[pick];
                    }
                    if (sat) {
                        // (a fine mottling of the brightness, per pixel — the same in every view)
                        const mf = fineMottle(cl * cosLon[px], cl * sinLon[px], sl, mottle);
                        for (let v = 0; v < 3; v++) {
                            const S = climate.sat[v];
                            s3[0] = s3[1] = s3[2] = 0;
                            for (let j = 0; j < 3; j++) {
                                const c = c3[j];
                                if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue;
                                s3[0] += w3[j] * S[3 * c]; s3[1] += w3[j] * S[3 * c + 1]; s3[2] += w3[j] * S[3 * c + 2];
                            }
                            const o = 3 * k, D = sat[v];
                            D[o] = Math.min(255, Math.round(mf * s3[0] / ws)); D[o + 1] = Math.min(255, Math.round(mf * s3[1] / ws)); D[o + 2] = Math.min(255, Math.round(mf * s3[2] / ws));
                        }
                        cov[k] = climate.cover[best];
                        if (ripPx) for (let v = 0; v < 3; v++) {
                            const S = climate.ripSat[v];
                            s3[0] = s3[1] = s3[2] = 0;
                            for (let j = 0; j < 3; j++) { const c = c3[j]; if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue; s3[0] += w3[j] * S[3 * c]; s3[1] += w3[j] * S[3 * c + 1]; s3[2] += w3[j] * S[3 * c + 2]; }
                            const o = 3 * k, D = ripPx[v];
                            D[o] = Math.round(mf * s3[0] / ws); D[o + 1] = Math.round(mf * s3[1] / ws); D[o + 2] = Math.min(255, Math.round(mf * s3[2] / ws));
                        }
                        // (the flow: the land cells' log-area, the most of the three — so a valley's line stays a line)
                        if (flowPx) { let fl = 0; for (let j = 0; j < 3; j++) { const c = c3[j]; if (!ocean[c] && w3[j] > 0.15) fl = Math.max(fl, climate.flow[c]); } flowPx[k] = fl; }
                        if (youngPx) { let yg = 0; for (let j = 0; j < 3; j++) { const c = c3[j]; if (!ocean[c]) yg += w3[j] * climate.young[c]; } youngPx[k] = Math.round(yg / ws); }
                    }
                }
            }
        }
        if (onRow && (py & 63) === 0) onRow(py / h);
    }
    return { heightM, sea, water, waterLevel, pondPx, kop, tA, pA, sat, cov, flowPx, youngPx, ripPx, statPx, rockPx, recPx, farmPx, farmKind, cropPx };
}

/** The whole picture's bands as one, then what reads it whole: the small lakes, the terrain on the satellite picture. */
export function rasterFinish(B, S, w) {
    const { lake, climate, geology, farming, pond } = S, h = w >> 1, { cw, ch } = climateWidth(w, climate);
    const { heightM, sea, water, waterLevel, pondPx, kop, tA, pA, sat, cov, flowPx, youngPx, ripPx, statPx, rockPx, recPx, farmPx, farmKind, cropPx } = B;
    if (pondPx) pondRaster({ w, h, heightM, sea, water, waterLevel, share: pondPx }, pond.seed);
    // (the terrain on the satellite picture: rock where steep, slopes and valleys in dry country — from the heights)
    if (sat) terrainLook({ w: cw, h: ch, sat: { year: sat[0], jan: sat[1], jul: sat[2] }, cover: cov, tAnnual: tA, pAnnual: pA, koppen: kop, flow: flowPx, young: youngPx, noise: new FastNoise(climate.mottleSeed ?? 0), rivers: climate.rivers, water: lake ? water : null, ripSat: ripPx ? { year: ripPx[0], jan: ripPx[1], jul: ripPx[2] } : null }, heightM, w);
    return { w, h, heightM, ocean: sea, water, waterLevel, pond: pondPx ? { w, h, share: pondPx, seed: pond.seed } : null, geology: rockPx ? { w: cw, h: ch, rock: rockPx, rec: recPx, deposits: geology.deposits ?? null } : null,
        farming: farmPx ? { w: cw, h: ch, ...farmPx, kind: farmKind, ...(cropPx ? { crops: cropPx } : {}) } : null, climate: cw ? { w: cw, h: ch, koppen: kop, tAnnual: tA, pAnnual: pA, ...(statPx ? { stats: statPx } : {}), ...(climate.families ? { families: climate.families } : {}), ...(sat ? { sat: { year: sat[0], jan: sat[1], jul: sat[2] }, cover: cov } : {}) } : null };
}
