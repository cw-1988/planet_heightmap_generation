// The Finish step (plans/V2_FINISH_PLAN.md): one moment of a history sculpted with care, on request — the surface
// domain-warped and roughened where it is high and steep (F1), the climate calculated on it, the rivers carving it for
// longer with the climate's runoff, dry basins left closed, sediment laid down, hillslopes by climate (F2), an Earth-like
// last ice age (F3), and the wind's work (F4). Runs in finish-worker.js (or Node): the terrain pool builds the surface in
// slices, everything else runs here, on a mesh of any size — 10M cells included, which only this worker holds.

import { FINISH } from './finish-config.js';
import { LatLonGrid } from './finish-grid.js';
import { closedBasins } from './finish-basins.js';
import { depositSediment, creepByClimate, dissect } from './finish-sediment.js';
import { rocksBefore, differentialRelief, carveByRock, coverStairs } from './finish-lithology.js';
import { lastIceAge } from './finish-ice.js';
import { windWork } from './finish-wind.js';
import { coastWork } from './finish-coast.js';
import { detailDrivers } from './finish-drivers.js';
import { fastParts, roundsKey, keptRounds, keepRounds } from './fast-mode.js';
import { hydrology, openStraits, fillSeaBasins, Water } from './finish-hydro.js';
import { pondShare } from './small-lakes.js';
import { biasTowardClimate, coverRain } from './finish-cover.js';
import { finalCover, corners } from './final-cover.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { terrainMesh } from '../terrain/terrain-mesh.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { deriveRecords } from '../terrain/records.js';
import { carveLadder, carveSettings } from '../terrain/synthesize.js';
import { surfaceWarp } from '../terrain/surface-warp.js';
import { carveTerrain, forgetMesh, meanOnCoarser, prepareCarve } from '../terrain/carve.js';
import { forgetEdgeKm } from '../core/min-heap.js';
import { planetClimate } from '../climate/climate.js';
import { CORE_DEFAULTS } from '../climate/core.js';
import { pageClimate } from '../evolution/climate-fields.js';
import { FastNoise } from '../core/fast-noise.js';
import { classifyRocks } from '../geology/rocks.js';
import { depositFields, DEPOSITS, METALS } from '../geology/deposits.js';
import { reportTo, part, report } from '../core/progress.js';
import { farmCells } from '../farming/farming.js';

const DEPOSIT_IDS = DEPOSITS.map(d => d.id);

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The finish's erosion at F.erosionStrength (finish-config.js erosionLevels, linear between the levels): the stream power's
 *  m, and its k as a multiple of the terrain's (a river draining F.erosionPivotKm2 cuts as fast as before); the dissection's
 *  deepest cut, the soil creep's reach (km) and the crests' hardness. */
export function erosionAt(F, cfg) {
    const L = F.erosionLevels, s = Math.min(L.carveM.length - 1, Math.max(0, F.erosionStrength ?? 0)), i = Math.min(L.carveM.length - 2, Math.floor(s)), f = s - i;
    const at = a => a[i] + (a[i + 1] - a[i]) * f, m = at(L.carveM);
    return { m, kMul: F.erosionPivotKm2 ** (cfg.carveM - m), dissectKm: at(L.dissectKm), creepKm: at(L.creepKm), crestHardness: at(L.crestHardness) };
}

/** The stages, in order, with their rough share of the time (for the progress bar; the shares sum to 1). */
export const STAGES = [['mesh', 0.1], ['surface', 0.14], ['climate', 0.09], ['bedrock', 0.03], ['rivers', 0.17], ['sediment', 0.05], ['hillslopes', 0.04], ['ice age', 0.07], ['wind', 0.04], ['sea', 0.02], ['coast', 0.03], ['water', 0.04], ['detail', 0.02], ['geology', 0.03], ['final climate', 0.03], ['deposits', 0.03], ['farming', 0.02], ['picture', 0.08]];

/**
 * The terrain config the finish's surface is drawn with: the carving's inputs at the finish's erosion strength (its stream
 * power's k, its crests' hardness) — for a page that draws the surface itself (finishPlanet's `surface`).
 */
export function surfaceConfig(F, cfg) {
    const E = erosionAt(F, cfg);
    return { ...cfg, carveK: cfg.carveK * E.kMul, carveCrestHardness: E.crestHardness };
}

/**
 * @param {{frame: Object, simMesh: Object, seed: number, cells: number, pool: import('../terrain/terrain-pool.js').TerrainPool,
 *          onStage?: (name: string) => void, F?: Object, cfg?: Object, mesh?: Object, surface?: Function}} o
 *   mesh: the mesh to finish on (else the terrain mesh of `cells`); surface: the page's own surface on it, instead of
 *   the history's drawn here — (mesh, cfg) → {heightKm, carveIn, recCell, cues} (or a promise of it), drawn with
 *   surfaceConfig's cfg (Generate: v2/js/present/world.js presentSynthesize's `surface`); no pool is needed then.
 *   onTerrain({mesh, z, ocean, lake, lakeLevel, rivers, drain}): the terrain as soon as it is final (after the water),
 *   awaited — the rest (detail, rocks, final climate, deposits, farming) changes none of it; returning true stops there · onDrivers(drivers): the detail's drivers once drawn
 *   · onProgress(share): the stage under way's own progress (0 … 1), reported from inside it (core/progress.js; the sink
 *   is this thread's: its caller clears it with reportTo(null) when the finish ends)
 * @returns {Promise<{mesh: Object, z: Float32Array, ocean: Uint8Array, ms: Object, stats: Object}>}
 */
export async function finishPlanet({ frame, simMesh, seed, cells, pool = null, closePool = false, onStage = () => {}, F = FINISH, cfg = terrainConfig(), debug = false, climateOptions = {}, driversWidth = cells >= 1.5e6 ? 2048 : 1024, inspect = null, mesh: givenMesh = null, surface = null, onTerrain = null, onDrivers = null, climate = planetClimate, onProgress = null, fast = null }) {
    const ms = {}, stats = {}, said = onStage, FP = fastParts(fast);
    if (FP.size) stats.fast = [...FP].sort();                         // (a fast finish says so: fast-mode.js)
    onStage = s => { said(s); reportTo(onProgress); };                // (each stage's reports from 0, over all of it)
    let t0 = performance.now();
    const lap = name => { const t = performance.now(); ms[name] = t - t0; t0 = t; };
    // (the finished mesh's edge lengths, which most stages' spreads read: kept from stage to stage up to PREP_CELLS — at
    // 2.5M ~0.15 s each time they were built anew — and let go between stages above it, where they are 240 MB at 10M)
    const midEdgeKm = () => { if (n > PREP_CELLS) forgetEdgeKm(mesh); };
    onStage('mesh');
    const mesh = givenMesh ?? terrainMesh(cells), n = mesh.numCells, cellKm2 = 4 * Math.PI * R * R / n;
    lap('mesh');

    // ── F1: the surface, domain-warped (its positions displaced before anything is read there), roughened where high —
    // or the page's own (Generate's present-day ground: its own warp and fine relief) ──
    onStage('surface');
    // (memory: at 10M cells every array is 40 MB or more — each let go as soon as it is done with, the warped positions
    // and the sampler with the surface, the carving's inputs and caches with the carve)
    // (warped on the pool's workers, each its own chunks: terrain/surface-warp.js — ~1 s at 2.5M off this thread, before they start)
    let warped = surface ? null : { numCells: n, xyz: mesh.xyz, edgeKm: mesh.edgeKm, warp: surfaceWarp(seed, F) };
    // (the carving's inputs at the finish's erosion strength: its stream power's k, its crests' hardness)
    const E = erosionAt(F, cfg), fade = lam => smooth(cfg.minWavesPerCell, cfg.fullWavesPerCell, lam / mesh.edgeKm);
    const surfDone = part(0, 0.9);                                    // (the pool's slices, as they come back: terrain-pool.js)
    const surfJob = surface ? Promise.resolve(surface(mesh, surfaceConfig(F, cfg)))
        : pool.synthesize(frame, warped, { cfg: surfaceConfig(F, cfg), seed, records: false, carveInputs: true, recCells: !!frame.coverKm });
    // (while the workers draw the surface, this thread builds ahead what needs only the mesh — the carving's ladder of
    // meshes, their distances and the maps between them and to the lake sites' coarser mesh, the rivers' meander: the same
    // values, ~2 s sooner at 2.5M. Up to PREP_CELLS: at 10M their memory waits for the carve, as before)
    await new Promise(r => setTimeout(r, 0));                         // (the pool hands its jobs out first)
    const ladder = carveLadder(simMesh, mesh, terrainMesh), broad = broadMesh(ladder, mesh, F);
    let meanderV = null;
    if (n <= PREP_CELLS) { prepareCarve(ladder, broad ? [[broad, mesh]] : []); meanderV = meanderValues(mesh, seed, F, fade); }
    // (the detail's records — the margins and belts on the sim mesh, which read only the moment: ~0.4 s at any size)
    const driverRec = frame ? deriveRecords(frame, simMesh, cfg, seed) : null;
    let surf = await surfJob;
    surfDone();
    if (closePool) pool?.terminate();                                 // (its workers' memory back before the heavy stages)
    if (warped) pool?.forget?.(warped);
    let carveIn = surf.carveIn;
    // (for the geology: the world cell whose record each cell shows, as the surface read it, and the structure the
    // surface drew there — an old belt's bands, the far field's folds, a shield's grain: geology/rocks.js)
    const recCell = surf.recCell, cues = surf.cues;
    const z = surf.heightKm;
    surf = null; warped = null;
    if (!surface) roughen(mesh, z, seed, F, fade, carveIn.lip);
    lap('surface');

    // ── the climate, on this surface ──
    onStage('climate');
    // (climateOptions: the page's Greenhouse and Precipitation — greenhouseWm2, precipScale)
    const climDone = part(0, 0.85);
    // (fast `climate`: the coupled rounds a coarser pass of this moment solved — fast-mode.js)
    const rKey = FP.has('climate') && climate === planetClimate ? roundsKey(frame, seed, climateOptions) : null;
    const coupled = rKey && keptRounds(rKey, n);
    let res = climate({ xyz: mesh.xyz, elevKm: z, axes: 'z-up' }, coupled ? { ...climateOptions, coupled } : climateOptions);
    if (rKey && !coupled) keepRounds(rKey, n, res.stages.coupled);
    climDone();
    const { koppen, tAnnual: tAnn, pAnnual: pAnn, lat, lon } = res.cell, G = res.grid.size;
    for (let c = 0; c < n; c++) if (pAnn[c] > F.rainMaxMm) pAnn[c] = F.rainMaxMm;     // (the climate's rare wet hotspots)
    // (the warmest month at sea level, and the winds, on the climate's grid)
    // (and the coldest: the sea's winter warmth, which reefs and mangroves need — finish-coast.js)
    const gamma = CORE_DEFAULTS.lapseRateCPerKm, warmG = new Float32Array(G).fill(-Infinity), coldG = new Float32Array(G).fill(Infinity);
    for (let g = 0; g < G; g++) {
        const href = res.surface.meanLandKm[g] === res.surface.meanLandKm[g] ? Math.max(0, res.surface.meanLandKm[g]) : 0;
        for (let m = 0; m < 12; m++) { const t = res.months.T[m * G + g] + gamma * href; if (t > warmG[g]) warmG[g] = t; if (t < coldG[g]) coldG[g] = t; }
    }
    const circ = res.stages.circulation, year = (a, m = -1) => { const o = new Float32Array(G); for (let g = 0; g < G; g++) { if (m >= 0) o[g] = a[m * G + g]; else { let s = 0; for (let k = 0; k < 12; k++) s += a[k * G + g]; o[g] = s / 12; } } return o; };
    const wind = { year: [year(circ.u), year(circ.v)], jan: [year(circ.u, 0), year(circ.v, 0)], jul: [year(circ.u, 6), year(circ.v, 6)] };
    const climGrid = { w: res.grid.w, h: res.grid.h }, warmSl = new Float32Array(n);
    const coldSl = new Float32Array(n);
    for (let c = 0; c < n; c++) { warmSl[c] = bilinear(climGrid, warmG, lat[c], lon[c]); coldSl[c] = bilinear(climGrid, coldG, lat[c], lon[c]); }
    // (the months each place's rain passes a share of its evaporation, or it freezes — the rivers' seasons)
    const wetG = new Float32Array(G), wetMonths = new Float32Array(n);
    for (let g = 0; g < G; g++) {
        let k = 0;
        for (let m = 0; m < 12; m++) { const T = res.months.T[m * G + g], P = res.months.P[m * G + g], E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12); if (T < 0 || P > F.wetShare * E) k++; }
        wetG[g] = k;
    }
    for (let c = 0; c < n; c++) wetMonths[c] = bilinear(climGrid, wetG, lat[c], lon[c]);
    // (the climate classifies only land above the sea; ground below sea level the ocean does not reach — a sunk basin, a
    // Caspian — takes the grid's year: its rain, and its temperature at sea level)
    const pG = new Float32Array(G), tG = new Float32Array(G);
    for (let g = 0; g < G; g++) {
        const href = res.surface.meanLandKm[g] === res.surface.meanLandKm[g] ? Math.max(0, res.surface.meanLandKm[g]) : 0;
        let p = 0, t = 0;
        for (let m = 0; m < 12; m++) { p += res.months.P[m * G + g]; t += res.months.T[m * G + g] / 12; }
        pG[g] = p; tG[g] = t + gamma * href;
    }
    for (let c = 0; c < n; c++) if (!(pAnn[c] === pAnn[c])) { pAnn[c] = bilinear(climGrid, pG, lat[c], lon[c]); tAnn[c] = bilinear(climGrid, tG, lat[c], lon[c]) - gamma * Math.max(0, z[c]); }
    // (each place's runoff shared over the months — rain, snow kept until it melts, less a share of each month's
    // evaporation; a share, where it is humid, through the ground, which drains back slowly — and each month's dryness)
    report(0.95);
    const monthly = runoffMonths(res.months, G, F);
    // (kept for the finished moment's own climate, at the end: the page's grid fields, and the grid's climate to finish
    // each cell again on the finished surface)
    const pageC = pageClimate(res, { cells: false }), gridClimate = { grid: res.grid, surface: res.surface, months: res.months, cell: { lat, lon } };
    res = null;                                                       // (the rest of the climate's arrays go)
    lap('climate');

    // ── the rocks shape the land (plans/V2_LITHOLOGY_RELIEF_PLAN.md; finish-lithology.js): what the uncarved surface is made
    // of — the history's record read where the terrain read it — hard rock left standing and soft rock worn down, the
    // carve's stream power and critical slope by the rock. A moment without the record: none of it ──
    const grid = new LatLonGrid(0.25);
    let rocks0 = null, lithoDz = null;
    if (frame?.coverKm && recCell) {
        onStage('bedrock');
        const rocksDone = part(0, 0.5);                               // (its rock pass: geology/rocks.js classifyRocks)
        rocks0 = rocksBefore({ mesh, z, frame, simMesh, seed, cfg, recCell, cues, lat, lon, rain: pAnn, temp: tAnn, grid });
        rocksDone();
        lithoDz = differentialRelief(mesh, z, rocks0, { frame, recCell, lat, lon, hold: carveIn.hold, lip: carveIn.lip }, F);
        carveByRock(carveIn, rocks0, F);
        let sum = 0, land = 0;
        for (let c = 0; c < n; c++) if (rocks0.rock[c]) { sum += Math.abs(lithoDz[c]); land++; }
        stats.lithoMeanM = land ? Math.round(1000 * sum / land) : 0;
        lap('bedrock');
    }

    // ── the rivers: runoff (rain less evaporation) weights the drainage; dry basins stay closed; carved for longer ──
    onStage('rivers');
    const runoff = new Float32Array(n), pet = new Float32Array(n);
    let oldW = 0, sumR = 0, sumP = 0, landN = 0;
    for (let c = 0; c < n; c++) {
        if (!(pAnn[c] === pAnn[c])) continue;
        const P = Math.max(0, pAnn[c]), E0 = Math.max(F.petMinMm, F.petBaseMm + F.petPerC * tAnn[c]);
        pet[c] = E0;
        runoff[c] = P > 0 ? Math.max(0, P - P * (1 + E0 / P - (1 + (E0 / P) ** F.budykoW) ** (1 / F.budykoW))) : 0;
        if (z[c] > 0) { oldW += carveIn.rain[c]; sumR += runoff[c]; sumP += P; landN++; }
    }
    const meanR = landN ? sumR / landN : 1, meanP = landN ? sumP / landN : 1, meanW = landN ? oldW / landN : 1;
    for (let c = 0; c < n; c++) if (z[c] > 0 && pAnn[c] === pAnn[c])
        carveIn.rain[c] = meanW * Math.min(F.wetMax, Math.max(F.runoffFloor, (1 - F.rainShare) * runoff[c] / meanR + F.rainShare * Math.max(0, pAnn[c]) / meanP) ** F.wetPower);
    if (meanderV) { const micro = carveIn.micro; for (let c = 0; c < n; c++) micro[c] += F.meanderKm * meanderV[c]; }
    else meander(mesh, carveIn.micro, seed, F, fade);
    // (the tectonic surface's own hollows, where lakes may stand, read on the carving's mesh nearest tectonicHollowMeshKm
    // across: a range's troughs and a lowland's hummocks averaged away there — finish-basins.js)
    const coarse = broad ? meanOnCoarser(broad, mesh, z) : null;
    const B = closedBasins(mesh, z, runoff, pet, pAnn, cellKm2, F, coarse && { mesh: broad, z: coarse.values, nearest: coarse.nearest });
    stats.closedBasins = B.basins;
    const before = z.slice();
    // (how cold each coast is — its warmest month at sea level: fjords where it is cold, rias where not; carve.js drownValleys)
    const [warmC, coldC] = cfg.drownColdC ?? [19, 13];
    carveIn.fjord = new Float32Array(n);
    for (let c = 0; c < n; c++) carveIn.fjord[c] = smooth(warmC, coldC, warmSl[c]);
    // (the finish's own: on a rising belt's wet, steep front its rivers are held back less — from the timeline's hold to
    // F.activeHold as the drainage's water goes from the mean to twice it, and the ground from gentle to steep: the
    // rain-fed front cuts as deep as the Himalayan front's, while a plateau — flat, and mostly dry — keeps its rivers high
    // and its top whole; and a valley wider than its cell carried into the cells beside it)
    const hold = carveIn.hold.slice(), wetHold = (F.activeHold ?? cfg.carveActiveHold) / cfg.carveActiveHold, { adjOffset: aO, adjList: aL } = mesh;
    for (let c = 0; c < n; c++) {
        if (!(hold[c] > 0)) continue;
        let s = 0;
        for (let k = aO[c]; k < aO[c + 1]; k++) s += Math.abs(z[aL[k]] - z[c]);
        const steep = smooth(F.frontSlope[0], F.frontSlope[1], s / (aO[c + 1] - aO[c]) / mesh.edgeKm);
        hold[c] *= 1 - (1 - wetHold) * smooth(meanW, 2 * meanW, carveIn.rain[c]) * steep;
    }
    const settings = carveSettings({ ...cfg, carveM: E.m, carveTimeMyr: F.carveTimeMyr, carveRounds: F.carveRounds, carveValleySides: F.valleySides ?? 0 });
    const carveDone = part(0.08, 0.88);                               // (its levels' rounds: carve.js carveTerrain)
    const C = carveTerrain(ladder, { ...carveIn, hold, z, sink: B.sink, base: B.base }, settings);
    carveDone();
    // (where flood basalt still caps the ground after the carving — its pile not cut through — for the satellite view)
    const basalt = new Uint8Array(n), lip0 = carveIn.lip;
    for (let c = 0; c < n; c++) if (carveIn.lip[c] > 0) basalt[c] = Math.round(255 * carveIn.lip[c] * smooth(0, 0.05, C.z[c] - carveIn.lipBase[c]));
    // (and how young the mountains are: the belt's activity, 1 while the history still raises it — the satellite view's tone)
    const young = new Uint8Array(n);
    for (let c = 0; c < n; c++) young[c] = Math.round(255 * Math.max(0, Math.min(1, carveIn.hold[c])));
    carveIn = null;
    forgetMesh(mesh); midEdgeKm();                                    // (the carve's caches for this mesh: ~0.5 GB at 10M)
    // (the dissection deeper in soft rock; and where the rivers cut into bedded cover, its walls stepped)
    let soft = null;
    if (rocks0) { soft = new Float32Array(n); const [s0, s1] = F.lithDissect; for (let c = 0; c < n; c++) soft[c] = rocks0.rock[c] ? s0 + (s1 - s0) * rocks0.hard[c] : 1; }
    dissect(mesh, C.z, C, cellKm2, { ...F, dissectKm: E.dissectKm }, soft);
    report(0.95);
    if (rocks0) coverStairs(C.z, before, C, rocks0, pAnn, lip0, F, seed);
    lap('rivers');

    // ── F2: sediment, then hillslopes by climate ──
    onStage('sediment');
    // (for the geology: how deep the rivers cut here — the carving and its dissection, from the surface before — and how
    // much sediment they lay; a byte each: 20 m, and 2 m, steps)
    const geo = frame?.coverKm ? { cut: new Uint8Array(n), cutStepKm: 0.02, alluv: new Uint8Array(n), alluvStepKm: 0.002 } : null;
    if (geo) for (let c = 0; c < n; c++) geo.cut[c] = Math.min(255, Math.max(0, Math.round((before[c] - C.z[c]) / geo.cutStepKm)));
    let zPre = geo ? C.z.slice() : null;
    report(0.1);
    const Sd = depositSediment(mesh, before, C, B.sink, cellKm2, F), mouths = Sd.mouths;   // (the mouths' load: the coast's sand)
    stats.deltas = Sd.deltas;
    report(0.9);
    if (geo) for (let c = 0; c < n; c++) geo.alluv[c] = Math.min(255, Math.max(0, Math.round((C.z[c] - zPre[c]) / geo.alluvStepKm)));
    zPre = null;
    lap('sediment');
    onStage('hillslopes');
    // (none on a flood basalt's cap; less on hard rock)
    let hardC = basalt;
    if (rocks0) { hardC = new Uint8Array(n); for (let c = 0; c < n; c++) hardC[c] = Math.max(basalt[c], Math.round(255 * F.lithCreep * rocks0.hard[c])); }
    creepByClimate(mesh, C.z, pAnn, tAnn, { ...F, creepKm: E.creepKm }, C.area, hardC);
    hardC = null;
    const hardKeep = rocks0?.hard ?? null;                            // (the coast's: soft rock worn back gives sand)
    rocks0 = null;                                                  // (~120 MB at 10M cells)
    lap('hillslopes');

    // ── F3: the last ice age ──
    onStage('ice age');
    const I = lastIceAge({ mesh, z: C.z, lat, lon, warmSl, rain: pAnn, grid, cellKm2, seed }, F);
    midEdgeKm();
    stats.iceKm2 = I.iceKm2; stats.iceSheets = I.sheets;
    lap('ice age');

    // ── F4: the wind ──
    onStage('wind');
    const W = windWork({ mesh, z: C.z, lat, lon, koppen, grid, wind, climGrid, outwash: I.margin, seed, fade, debug, tAnnual: tAnn }, F);
    stats.ergKm2 = W.ergKm2; stats.loessKm2 = W.loessKm2;
    lap('wind');

    // ── the sea: water below sea level that the open ocean reaches (fjords, sunk basins); hollows it cannot reach stay land ──
    onStage('sea');
    let ocean = oceanMask(mesh, C.z);
    report(0.3);
    // (an inland sea the ocean all but reaches — behind a low, short barrier — is opened into it; one left closed is a
    // remnant of the sea in a basin, for the hydrology: finish-hydro.js)
    const straits = openStraits(mesh, C.z, ocean, F);
    stats.straits = straits;
    if (straits.opened) ocean = oceanMask(mesh, C.z);
    report(0.6);
    const seaBasin = fillSeaBasins(mesh, C.z, ocean, F);
    forgetMesh(mesh); midEdgeKm();                                    // (the carve's and the distances' caches for this mesh)
    lap('sea');

    // ── the sea's work on its coasts: waves, tides, the sand they move (finish-coast.js; docs/coast-processes.md) ──
    onStage('coast');
    const Co = coastWork({ mesh, z: C.z, ocean, lat, lon, wind, climGrid, tAnn, coldSl, hard: hardKeep, mouths, deltaShare: F.deltaShare, grid, seed }, F);
    stats.coast = Co.stats;
    lap('coast');

    // ── R1: rivers and lakes, by the climate ──
    onStage('water');
    const ice = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (koppen[c] === KOPPEN_ID.EF) ice[c] = 1;
    const bi = new Int32Array(4), bw = new Float64Array(4), at = (f, c) => f[bi[0]] * bw[0] + f[bi[1]] * bw[1] + f[bi[2]] * bw[2] + f[bi[3]] * bw[3];
    const months = { at: (c, m0, M, share, arid) => { corners(climGrid, lat[c], lon[c], bi, bw); for (let j = 0; j < M; j++) { share[j] = at(monthly.share[m0 + j], c); arid[j] = at(monthly.arid[m0 + j], c); } } };
    // (across a flat, the rivers wander as the carving's did: the same meander, read where the water needs it)
    const wander = meanderV ? c => meanderV[c] : meanderAt(mesh, seed, F, fade);
    const hydroDone = part(0, 0.9);                                   // (its phases: finish-hydro.js hydrology)
    const Hy = hydrology({ mesh, z: C.z, ocean, runoff, pet, rain: pAnn, wetMonths, ice, glaciated: I.ice, tectonic: B.tectonic, seaBasin, fillHollows: true, lat, lon, months, wander, debug }, F);
    hydroDone();
    Object.assign(stats, { water: Hy.stats });
    // (the sea again, after the rivers' gorges)
    ocean = oceanMask(mesh, C.z);
    // (the lakes too small for the mesh: each cell's share of them, small-lakes.js)
    const ponds = pondShare({ mesh, z: C.z, ocean, lake: Hy.lake, ice, glaciated: I.ice, iceH: I.H, tAnn, pAnn, q: Hy.q, cellKm2 }, F), pond = { share: ponds.share, seed };
    stats.ponds = ponds.stats;
    lap('water');
    // (the terrain is final from here — its heights, sea, lakes and rivers: the stages below change none of them — so a
    // page can show it now, while the climate's, the rocks' and the farming's layers follow)
    if (await onTerrain?.({ mesh, z: C.z, ocean, lake: Hy.lake, lakeLevel: Hy.lakeLevel, pond, rivers: Hy.rivers, drain: drainOf(Hy, ocean, C.z) }) === true) {
        forgetEdgeKm(mesh);                                           // (true: the terrain was all that was asked)
        return { mesh, z: C.z, ocean, ms, stats, terrainOnly: true };
    }

    // ── what the detail finer than the mesh is drawn from (finish-drivers.js; plans/V2_FINE_DETAIL_PLAN.md) ──
    onStage('detail');
    const drivers = detailDrivers({ mesh, z: C.z, ice: I.ice, iceH: I.H, iceS: I.S, erg: W.erg, wind, climGrid, warmSl, rain: pAnn, young, frame, simMesh, cfg, seed, rec: driverRec, width: driversWidth, coast: Co });
    lap('detail'); onDrivers?.(drivers);                              // (a page's zoomed tiles need no more: sent now)

    // ── the geology (plans/V2_GEOLOGY_PLAN.md G2): what each place is made of at the surface — the history's rock column
    // (the frame's geological record), read where the terrain read it, with the cuts and the young sediment of this
    // surface (geology/rocks.js) — before the land's cover, whose bare ground shows its rock (L6) ──
    let geology = null, Rk = null;
    if (geo) {
        onStage('geology');
        Rk = classifyRocks({ mesh, z: C.z, ocean, frame, simMesh, seed, cfg, recCell, on: { grid, lat, lon },
            local: { ...geo, erg: W.erg, loess: W.loess, loessShare: 1 / F.loessKm, till: I.till, glaciated: I.ice, lava: basalt, q: Hy.q, cues, lithoDz, column: true } });
        geology = { rock: Rk.rock, rec: Rk.rec, simCells: simMesh.numCells, cues };          // (cues: for the checks; not in the picture)
        stats.rocks = Array.from(Rk.shares, v => +v.toFixed(4)); stats.youngBy = Array.from(Rk.youngBy, v => +v.toFixed(4));
        midEdgeKm();                                                  // (the river plains' distances: their cache for this mesh)
        lap('geology');
    }

    // ── the finished moment's climate, at its detail: the grid's climate as calculated above, each cell's own (its
    // height, its relief, and sunk basins the sea does not reach as land) on the finished surface ──
    // And the land's cover from each cell's twelve months (finish-cover.js; plans/V2_SATELLITE_PLAN.md): its colour as from
    // space for the year, January and July (sRGB, 3 bytes each), and its biome (bits 0–4) with snow in January (bit 5) and
    // in July (bit 6), for the readout.
    // Each cell its own: on worker threads by cell range (final-cover.js) — with the measures beyond Köppen (cell-stats.js),
    // the deposits' climate tests (geology/deposits.js), the farming's parts the months decide (farming/farming.js) and the
    // climate as shares for the Satellite view's transitions (climate/koppen-soft.js).
    onStage('final climate');
    const land = new Uint8Array(n);
    for (let c = 0; c < n; c++) land[c] = ocean[c] ? 0 : 1;
    // (the rain the cover reads: a little smoother, warped and roughened — from the climate stage's rain, its regional
    // pattern being all that is read)
    const rainTarget = coverRain(pAnn, lat, lon, c => land[c] === 1, new LatLonGrid(0.5), seed);
    report(0.02);
    const fc = await finalCover({ xyz: mesh.xyz, z: C.z, land, lat, lon, rainTarget, erg: W.erg, loess: W.loess, basalt, rock: Rk?.rock ?? null },
        { grid: gridClimate.grid, meanLandKm: gridClimate.surface.meanLandKm, months: gridClimate.months }, { seed, F, clim: !!geo });
    const { sat, ripSat, cover, clim } = fc, cellsClimate = fc, farmC = fc.farm;
    // (and toward each climate's own colours, regionally — on a coarser grid: the correction is smooth, ~100 km)
    biasTowardClimate(sat, cellsClimate.koppen, lat, lon, c => land[c] === 1 && cellsClimate.koppen[c] > 0, new LatLonGrid(0.5), seed);
    lap('final climate');

    // the deposits (G3, G4): the history's mineral systems where they survive, the climate's and the rivers' — on a grid (after
    // the land's cover: its biomes and climate tests)
    if (geo) {
        onStage('deposits');
        const depIn = { mesh, z: C.z, ocean, frame, simMesh, seed, rock: Rk.rock, rec: Rk.rec, on: { grid, lat, lon },
            local: { glaciated: I.ice, till: I.till, lake: Hy.lake, q: Hy.q, recv: Hy.recv, order: Hy.order, biome: cover, clim, ice, colS: Rk.colS, colT: Rk.colT, colArch: Rk.colArch,
                erg: W.erg, coastSand: Co.sand, coastWave: Co.wave, coastWinter: Co.winter } };
        inspect?.('deposits', depIn);                                 // (the tools' look at the deposits' inputs: render-deposits.mjs)
        const Dp = depositFields(depIn);
        geology.deposits = Dp;
        stats.deposits = Object.fromEntries(DEPOSIT_IDS.map((id, k) => [id, [+Dp.shares[3 * k].toFixed(4), +Dp.shares[3 * k + 1].toFixed(4), +Dp.shares[3 * k + 2].toFixed(4)]]));
        stats.metals = Object.fromEntries(METALS.map((m, i) => [m.id, [+Dp.metalShares[3 * i].toFixed(4), +Dp.metalShares[3 * i + 1].toFixed(4), +Dp.metalShares[3 * i + 2].toFixed(4)]]));
        lap('deposits');
    }

    // ── farming (plans/V2_FARMING_PLAN.md C1): each cell's soil, ground and the water rivers and lakes could bring — with
    // the growing season the final climate gave (farming/farming.js) ──
    onStage('farming');
    const farm = farmCells({ mesh, z: C.z, ocean, q: Hy.q, lat, lon, lake: Hy.lake, lakeLevel: Hy.lakeLevel, rock: Rk?.rock, youngKind: Rk?.youngKind, young, climate: farmC });
    const farming = { ...farm, rain: farmC.rain, warm: farmC.warm, pasture: farmC.pasture, crops: farmC.crops };
    Rk = null;
    forgetEdgeKm(mesh);                                               // (the river plains' and the canals' distances: their cache for this mesh)
    lap('farming');
    const flow = new Float32Array(n);
    for (let c = 0; c < n; c++) flow[c] = Math.log10(Math.max(1, Hy.area[c]));
    // (drain: where each cell's water goes, the land it drains (km²), its water (m³/s), height (km) and lake, for the region pick's valleys — js/region-basin.js)
    return { mesh, z: C.z, ocean, lake: Hy.lake, lakeLevel: Hy.lakeLevel, pond, rivers: Hy.rivers, drain: drainOf(Hy, ocean, C.z), drivers, ms, stats, geology, farming,
        climate: { page: pageC, cell: { koppen: cellsClimate.koppen, tAnnual: cellsClimate.tAnnual, pAnnual: cellsClimate.pAnnual, sat, cover, stats: fc.stats, mottleSeed: ((seed | 0) * 0x2f71 + 0x6d) >>> 0,
            flow, young, rivers: Hy.rivers, ripSat, families: fc.families } },
        layers: debug ? { ice: I.ice, sink: B.sink, erg: W.erg, loess: W.loess, basalt, koppen, before, rain: pAnn, lat, lon, q: Hy.q, terminal: Hy.terminal } : null };
}

/** Where each cell's water goes, the land it drains (km²), its water (m³/s), height (km) and lake — copies, for the page. */
function drainOf(Hy, ocean, z) {
    return { recv: Hy.recv.slice(), area: Hy.area.slice(), sea: ocean.slice(), q: Float32Array.from(Hy.q), z: Float32Array.from(z), lake: Hy.lake.slice() };
}

/** The rivers' fine routing relief (added to the carve's micro-relief, which shapes the routing only): octaves from
 *  F.meanderFromKm down to what the mesh can show — channels wander instead of running straight down smooth slopes. */
/** The finish builds ahead, while its surface is drawn, only up to this many cells (memory: see finishPlanet). */
const PREP_CELLS = 3e6;

/** The carving's mesh nearest F.tectonicHollowMeshKm across, where the lake sites are read — null for the finished mesh itself. */
function broadMesh(ladder, mesh, F) {
    if (!(F.tectonicHollowMeshKm > 0)) return null;
    let bm = ladder[0];
    for (const m of ladder) if (Math.abs(Math.log(m.edgeKm / F.tectonicHollowMeshKm)) < Math.abs(Math.log(bm.edgeKm / F.tectonicHollowMeshKm))) bm = m;
    return bm === mesh ? null : bm;
}

/** The rivers' meander at every cell (meanderAt's values, kept exactly), or null if the mesh shows none. */
function meanderValues(mesh, seed, F, fade) {
    const at = meanderAt(mesh, seed, F, fade);
    if (!at) return null;
    const v = new Float64Array(mesh.numCells);
    for (let c = 0; c < v.length; c++) v[c] = at(c);
    return v;
}

function meander(mesh, micro, seed, F, fade) {
    const at = meanderAt(mesh, seed, F, fade);
    if (!at) return;
    for (let c = 0; c < mesh.numCells; c++) micro[c] += F.meanderKm * at(c);
}

/** The rivers' wander at cell c (about −1 … 1): its octaves from F.meanderFromKm down to what the mesh shows; null if none. */
function meanderAt(mesh, seed, F, fade) {
    const { xyz } = mesh, noise = new FastNoise((seed | 0) * 37 + 29), oct = [];
    for (let lam = F.meanderFromKm, a = 1; lam > 1 && oct.length < 5; lam /= 2, a *= 0.6) { const s = a * fade(lam); if (s > 0.02) oct.push([R / lam, s]); }
    if (!oct.length) return null;
    return c => {
        let v = 0;
        for (let o = 0; o < oct.length; o++) { const [f, s] = oct[o]; v += s * noise.noise3D(xyz[3 * c] * f + 7.7 * o, xyz[3 * c + 1] * f + 2.2, xyz[3 * c + 2] * f + 4.4 * o); }
        return v;
    };
}

/** Fine relief on high ground (craggier the higher), octaves from F.craggyFromKm down to what the mesh can show — none on
 *  the lava of a flood basalt (`lava`: its share per cell), whose flows lie flat (developer, 2026-10-27). */
function roughen(mesh, z, seed, F, fade, lava = null) {
    const { xyz, numCells: n } = mesh, noise = new FastNoise((seed | 0) * 71 + 3), oct = [];
    for (let lam = F.craggyFromKm, a = 1; lam > 1 && oct.length < 5; lam /= 2, a *= 0.55) { const s = a * fade(lam); if (s > 0.02) oct.push([R / lam, s]); }
    if (!oct.length) return;
    for (let c = 0; c < n; c++) {
        if (!(z[c] > 0.3)) continue;
        let v = 0;
        for (let o = 0; o < oct.length; o++) { const [f, s] = oct[o]; v += s * noise.noise3D(xyz[3 * c] * f + 3.3 * o, xyz[3 * c + 1] * f + 1.7, xyz[3 * c + 2] * f + 5.9 * o); }
        z[c] += F.craggyKm * smooth(0.3, 3, z[c]) * v * (lava ? 1 - Math.min(1, lava[c]) : 1);
    }
}

/** Per month (12 fields each, on the climate grid): the share of a year's runoff that comes in that month, and how dry the
 *  month is (0 where rain meets its potential evaporation, or the ground is frozen; 1 without rain). Each month's water —
 *  rain, and snow kept until it melts — less a share of its potential evaporation; a share of that (more where it is
 *  humid) seeps into the ground, which drains back into the rivers slowly (baseflowMonths: a dry season's flow dwindles
 *  month by month). Three years, from dry ground: the store and the snow settle to their yearly round. */
function runoffMonths(months, G, F) {
    const out = Array.from({ length: 12 }, () => new Float32Array(G)), arid = Array.from({ length: 12 }, () => new Float32Array(G));
    const liquid = new Float64Array(12), flow = new Float64Array(12);
    const drain = 1 - Math.exp(-1 / F.baseflowMonths);
    for (let g = 0; g < G; g++) {
        let Pyr = 0, Eyr = 0;
        for (let m = 0; m < 12; m++) { const T = months.T[m * G + g]; Pyr += Math.max(0, months.P[m * G + g]); Eyr += Math.max(5, (F.petBaseMm + F.petPerC * T) / 12); }
        const base = F.baseflowShare * smooth(0.2, 1, Pyr / Eyr);
        let snow = 0, store = 0, sf = 0, sl = 0;
        for (let cyc = 0; cyc < 3; cyc++) for (let m = 0; m < 12; m++) {
            const T = months.T[m * G + g], P = Math.max(0, months.P[m * G + g]), E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12);
            let liq;
            if (T < 0) { snow += P; liq = 0; } else { const melt = Math.min(snow, F.snowMeltMmPerC * T); snow -= melt; liq = P + melt; }
            const quick = Math.max(0, liq - F.monthEvapShare * E), d = store * drain;
            store += base * quick - d;
            if (cyc === 2) { flow[m] = (1 - base) * quick + d; liquid[m] = liq; sf += flow[m]; sl += liq; }
        }
        for (let m = 0; m < 12; m++) {
            out[m][g] = sf > 0 ? flow[m] / sf : sl > 0 ? liquid[m] / sl : 1 / 12;
            const T = months.T[m * G + g], E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12);
            arid[m][g] = T < 0 ? 0 : smooth(0, 1, (E - Math.max(0, months.P[m * G + g])) / E);
        }
    }
    return { share: out, arid };
}

function bilinear(g, field, lat, lon) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    return (1 - fx) * (1 - fy) * field[y0 * w + i0] + fx * (1 - fy) * field[y0 * w + i1] + (1 - fx) * fy * field[j1 * w + i0] + fx * fy * field[j1 * w + i1];
}

/** 1 where the open ocean reaches (from the deep sea, through ground below sea level). */
export function oceanMask(mesh, z, seaSeedKm2 = FINISH.seaSeedKm2, deepKm = FINISH.seaDeepKm) {
    // (sea: a body below sea level that holds deep water and is big enough — a small pit on a continent is a basin, not a
    // sea: developer, "tiny bits of 'sea' surrounded by continent … where rivers end … should NOT be a valid end"; then,
    // "lets reduce what we consider a valid end sea": the size is the whole body's, not only its deep water's)
    const { adjOffset, adjList, numCells: n } = mesh, ocean = new Uint8Array(n), seen = new Uint8Array(n), cellKm2 = 4 * Math.PI * R * R / n;
    // (each body's cells in one typed queue, reused: a growing JS array of a 1.7M-cell ocean was ~0.5 s a call at 2.5M)
    const cells = new Int32Array(n);
    for (let s = 0; s < n; s++) {
        if (!(z[s] < 0) || seen[s]) continue;
        let len = 1;
        cells[0] = s; seen[s] = 1;
        let deep = z[s] < -deepKm;
        for (let i = 0; i < len; i++) for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) {
            const nb = adjList[k];
            if (z[nb] < 0 && !seen[nb]) { seen[nb] = 1; cells[len++] = nb; if (z[nb] < -deepKm) deep = true; }
        }
        if (deep && len * cellKm2 >= seaSeedKm2) for (let i = 0; i < len; i++) ocean[cells[i]] = 1;
    }
    return ocean;
}

export { finishRaster, FARM_KEYS } from './finish-raster.js';
