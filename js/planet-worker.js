// The worker behind Generate and Import (plans/SHARED_CORE_PLAN.md): Generate's present-day world — its pieces
// (the plates the sliders and Ctrl-click shape) grouped into plates that move, its past in closed form and its ground on
// Generate's mesh (v2/js/present/) — or an imported heightmap's ground; each sent to the page as its first picture with the
// job Evolution's finish then does in the background (v2/js/finish/finish-worker.js, from the page).
// Commands: generate, reapply (the sculpting knobs: the same Frame, the ground again), editRecompute (pieces raised or
// sunk: the plates regrouped, the ground again), importHeightmap.

import { SEED_MAX } from './planet-code.js';
import { setDelaunator } from './sphere-mesh.js';
import { meshesFor } from './mesh-source.js';
import { generateCoarsePlates } from './coarse-plates.js';
import { detailSteps, piecesOn, regionsOf, regionLandOf, groundOnMesh, sendRung, rungJob, presentRungJob, plainSurface } from './detail-ladder.js';
import { warpTerrain, smoothElevation, sharpenRidges, applySoilCreep, applyDetailNoise } from './terrain-post.js';
import { applyPlatePhysics } from './plate-physics.js';
import { DETAIL_NOISE_DAMPEN_STRENGTH } from './terrain-config.js';
import { elevToHeightKm } from './color-map.js';
import { buildPresentPlates, classifyBoundaries, arrowAnchors, cellLandNow, motionsOf } from '../v2/js/present/plates.js';
import { presentLayout, presentSimMesh } from '../v2/js/present/layout.js';
import { presentWorld, presentTerrainMesh, presentGroundOf, presentTerrainOverrides, uneditedLayout } from '../v2/js/present/world.js';
import { storyFrame, finishFrame } from '../v2/js/present/layers.js';
import { finishConfigOf, finishOverrides, reliefShareOf } from '../v2/js/present/knobs.js';
import { hillshade } from '../v2/js/view/terrain-shade.js';
import { buildSimMesh } from '../v2/js/core/sim-mesh.js';
import { applyStroke } from './terrain-brush.js';
import { applyCuts } from './region-cut.js';
import { sketchGround } from './world-sketch.js';
import { TerrainPool } from '../v2/js/terrain/terrain-pool.js';
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';

setDelaunator(Delaunator);

// What the commands after the first keep: the mesh, the layout and its present-day world, or the imported heights
let W = null;

// The ground's surface drawn on worker threads (v2/js/terrain/terrain-pool.js, on the fixed sim mesh): started with the
// worker, so it is ready by the time a Frame is; the same ground, bit for bit. Without one (a pool that failed or broke)
// the ground is drawn here, as before.
let pool = null;
const poolReady = TerrainPool.create(presentSimMesh()).then(p => { p.onBroken = () => { pool = null; }; return (pool = p); }, e => { console.warn('[terrain] no worker pool, the ground drawn on this thread:', e.message); return null; });
/** The pool for a ground on `mesh`: what it keeps of earlier meshes let go. */
async function poolFor(mesh, r_xyz) {
    await poolReady;
    const tm = presentTerrainMesh(mesh, r_xyz);
    if (pool) for (const m of [...pool.meshes.keys()]) if (m !== tm) pool.forget(m);
    return pool;
}

const progress = (pct, label) => self.postMessage({ type: 'progress', pct, label });
const knobsOf = (d, nMag) => ({ nMag, terrainWarp: d.terrainWarp, smoothing: d.smoothing, hydraulicErosion: d.hydraulicErosion,
    thermalErosion: d.thermalErosion, ridgeSharpening: d.ridgeSharpening, glacialErosion: d.glacialErosion });

// ── the present-day world (plans/GENERATE_REDESIGN_PLAN.md) ──
// G1: the pieces (Generate's plates) grouped into plates that move, from the layout AS EDITED — so an edit regroups the
// plates as loading its planet code would (G1d, owner 2026-11-03): a raised piece rides its continent's plate, whose motion
// is fitted again — with the pieces' own motion from the UNEDITED layout (js/plate-physics.js, run once: re-run on an edit
// it moves every piece on the planet). reuse: the world built before on this mesh (an edit): its sim cells per region.
// M4: the layout as first built (`original`: the pieces' ocean before any edit) is kept as the world's `base` — its
// plates, its pieces' land: the plates there before move as they did, and the past is that layout's (present/world.js),
// so an edit reshapes the place edited, not the planet.
function presentPlatesFor({ coarse, P, pieceOcean, pieceVec, seed, mesh, r_xyz, r_plate, original, reuse = null }) {
    // on Evolution's sim mesh (v2/js/present/layout.js), free of the render mesh's Detail
    const L = reuse ? { ...reuse.L, pieceOcean, pieceVec } : presentLayout({ seed, P, coarse, pieceOcean, pieceVec });
    const edited = pieceOcean.size !== original.size || [...pieceOcean].some(id => !original.has(id));
    const base0 = reuse?.base ?? (edited ? uneditedLayout(L, original) : null);
    const plates = buildPresentPlates(L, undefined, base0 && edited ? motionsOf(base0.P) : null);
    const base = base0 ?? { P: plates, pieceLand: Uint8Array.from(L.pieceIds, id => (original.has(id) ? 0 : 1)) };
    const { regionCell, regionPlate } = regionsOf(L, plates, mesh, r_xyz, r_plate, reuse?.regionCell);
    return { L, P: plates, regionCell, regionPlate, r_plate, base };
}
/** The present-day world's ground for the pieces as edited (v2/js/present/world.js), with the uncarved surface the finish
 *  starts from. Kept on `present.world`. */
async function presentGround(present, plateIsOcean, mesh, r_xyz, seed, knobs, drawn = true) {
    const pieceLand = Uint8Array.from(present.L.pieceIds, id => (plateIsOcean.has(id) ? 0 : 1));
    // (G2c: each region's own piece as edited — the ground is held to the pieces' outlines at this Detail)
    const regionLand = regionLandOf(present.r_plate, plateIsOcean);
    present.world = await presentWorld(present, pieceLand, mesh, r_xyz, { seed, knobs, regionLand, regionCell: present.regionCell, regionPlate: present.regionPlate, finish: finishConfigOf(knobs), unedited: present.base, pool: await poolFor(mesh, r_xyz) });
    present.knobs = knobs;
    present.world.shade = hillshade(presentTerrainMesh(mesh, r_xyz), present.world.heightKm);
    if (drawn) groundDrawn(present, mesh, r_xyz);
}
/** The Detail ladder's steps after the first (js/detail-ladder.js: `ns`, the world's own Detail last), each mesh built
 *  by `build` as its turn comes; each step shown, the last one's ground, regions and mask laid into `present`, as if the
 *  world had been built on it from the start (`water`: each step sent with its rivers' and lakes' job). Returns the last mesh. */
async function climbTo(present, ns, build, plateIsOcean, seed, knobs, t0, water) {
    const N = ns[ns.length - 1];
    for (let i = 0; i < ns.length; i++) {
        progress(40 + 55 * i / ns.length, `Detail ${ns[i].toLocaleString('en-US')}…`);
        const tb = performance.now(), m = await build(ns[i]), tg = performance.now();
        const g = await groundOnMesh(present, m, plateIsOcean, seed, knobs, await poolFor(m.mesh, m.r_xyz));
        if (m.n !== N) { sendRung(m.mesh, m.r_xyz, g.heightKm, g.shade, m.n, N, t0, { mesh: tg - tb, ground: performance.now() - tg }, water && presentRungJob(present, g.surface, seed)); continue; }
        const w = present.world;
        Object.assign(w, { mask: g.mask, heightKm: g.heightKm, drainage: g.drainage, receivers: g.receivers, order: g.order, lava: g.lava, young: g.young, cut: g.cut, surface: g.surface, shade: g.shade, ms: { ...w.ms, ...g.ms, mesh: tg - tb } });
        Object.assign(present, { regionCell: g.regionCell, regionPlate: g.regionPlate, r_plate: m.r_plate });
        return m;
    }
}
// ── the terrain brushes (js/terrain-brush.js): the ground as drawn kept, the strokes replayed onto it ──
/** A ground just drawn: kept unbrushed (an undo replays from it), the strokes so far laid on it. */
function groundDrawn(present, mesh, r_xyz) {
    const w = present.world;
    present.unbrushed = { h: w.heightKm.slice(), s: w.surface.heightKm === w.heightKm ? null : w.surface.heightKm.slice() };
    present.brushed = 0;
    brushTo(present, mesh, r_xyz, W?.strokes ?? pendingStrokes);
}
let pendingStrokes = [];                                       // (a Generate's strokes, before W holds them)
/** The ground brushed with `strokes`: only the new ones if it holds a prefix of them, else from the unbrushed ground. */
function brushTo(present, mesh, r_xyz, strokes) {
    const w = present.world, tm = presentTerrainMesh(mesh, r_xyz);
    let changed = false;
    if (strokes.length < present.brushed) {
        w.heightKm.set(present.unbrushed.h);
        if (present.unbrushed.s) w.surface.heightKm.set(present.unbrushed.s);
        present.brushed = 0; changed = true;
    }
    for (let i = present.brushed; i < strokes.length; i++) { applyStroke(strokes[i], tm, w.heightKm, w.surface.heightKm); changed = true; }
    present.brushed = strokes.length;
    if (changed) w.shade = hillshade(tm, w.heightKm);
}
/** Reapply (G6): the same Frame, only the ground drawn again with the sculpting knobs. */
async function presentReground(present, mesh, r_xyz, seed, knobs) {
    const g = await presentGroundOf(present.world.frame, present.L.sim, mesh, r_xyz, { seed, knobs, mask: present.world.mask, frontKm: present.world.frontKm, finish: finishConfigOf(knobs), pool: await poolFor(mesh, r_xyz) });
    Object.assign(present.world, { heightKm: g.heightKm, surface: g.surface, shade: hillshade(presentTerrainMesh(mesh, r_xyz), g.heightKm) });
    present.knobs = knobs;
    groundDrawn(present, mesh, r_xyz);
}
/** The Inspect list's layers of the present-day world's past (G6b), per render region off its sim cell. */
function pastLayers(present, n) {
    const f = present.world.frame, cellOf = present.regionCell;
    const floorAge = new Float32Array(n), beltKind = new Float32Array(n), beltAge = new Float32Array(n), craton = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        const c = cellOf[r];
        floorAge[r] = f.type[c] === 0 ? -f.formedAt[c] : 0;
        beltKind[r] = f.oroType[c];
        beltAge[r] = f.oroType[c] ? (f.oroLast[c] >= 0 ? 0 : -f.oroLast[c]) : 0;
        craton[r] = f.type[c] === 2 ? 1 : 0;
    }
    return { presentFloorAge: floorAge, presentBeltKind: beltKind, presentBeltAge: beltAge, presentCraton: craton };
}
/** What the page draws of the plates: which plate each region rides on, the plates, the boundaries, the motion's anchors,
 *  and what the hover tells of each place's crust (its sim cell and the few records it reads there). */
function presentMessage(present, plateIsOcean) {
    const { L, P, regionCell } = present;
    const B = present.world?.B ?? classifyBoundaries(L, P, cellLandNow(L, P, Uint8Array.from(L.pieceIds, id => (plateIsOcean.has(id) ? 0 : 1))));
    const f = present.world.frame;
    return {
        regionPlate: present.regionPlate,
        plates: P.plates.map(p => ({ index: p.index, key: p.key, continental: p.continental, share: p.share, landShare: p.landShare, speedCmYr: p.speedCmYr, euler: p.euler, centroid: p.centroid })),
        boundaries: { count: B.count, mid: B.mid, a: B.a, b: B.b, kind: B.kind, openCmYr: B.openCmYr, slipCmYr: B.slipCmYr, over: B.over },
        arrows: present.arrows ?? (present.arrows = arrowAnchors(L, P)),
        regionCell, rec: { type: f.type, oroType: f.oroType, oroStart: f.oroStart, oroLast: f.oroLast, formedAt: f.formedAt, volcType: f.volcType, volcAt: f.volcAt, volcKm: f.volcKm },
    };
}
/**
 * What the page needs of a world (js/main.js; plans/SHARED_CORE_PLAN.md U3): its mesh in Evolution's z-up frame (the
 * planet view paints it, the hover locates on it), the first picture (the ground in km and its hillshade), the record the
 * hover's stories read (layers.js storyFrame), each region's sim cell, and the finish's job — the Frame, the sim mesh, the
 * uncarved surface and the configs it was drawn with. Copies, sent as transfers (the worker keeps its own).
 */
function sharedPayload(present, mesh, r_xyz, seed) {
    const w = present.world, tm = presentTerrainMesh(mesh, r_xyz), sim = present.L.sim, transfer = [];
    const copy = (a) => { const c = a.slice(); transfer.push(c.buffer); return c; };
    // (the Frame on the history's clock, as Evolution's finish reads it — its `time` the history's length: v2/js/present/layers.js)
    const ff = finishFrame(w.frame, w.belts.record);
    const frame = Object.fromEntries(Object.entries(ff).map(([k, v]) => [k, ArrayBuffer.isView(v) ? copy(v) : v]));
    const story = storyFrame(ff);
    for (const v of Object.values(story)) if (ArrayBuffer.isView(v)) transfer.push(v.buffer);
    const s = w.surface, surface = { heightKm: copy(s.heightKm), recCell: copy(s.recCell), cues: copy(s.cues), carveIn: Object.fromEntries(Object.entries(s.carveIn).map(([k, a]) => [k, copy(a)])) };
    const payload = {
        mesh: { numCells: tm.numCells, xyz: copy(tm.xyz), adjOffset: copy(tm.adjOffset), adjList: copy(tm.adjList) },
        heightKm: copy(w.heightKm), shade: copy(w.shade), story, regionCell: copy(present.regionCell),
        finish: { frame, simMesh: { numCells: sim.numCells, xyz: copy(sim.xyz), adjOffset: copy(sim.adjOffset), adjList: copy(sim.adjList) }, seed, surface,
            terrain: presentTerrainOverrides({ knobs: present.knobs }), finish: finishOverrides(present.knobs ?? {}),
            // (and for a region, drawn again finer: the fine relief's share and the fronts its ridges follow — region-synth.js)
            relief: reliefShareOf(present.knobs ?? {}), frontKm: w.frontKm ? copy(w.frontKm) : null },
    };
    return { payload, transfer };
}
/** A present-day world sent to the page: the plates' message, the Inspect layers, the shared payload. */
function sendWorld(type, extra = {}) {
    const { present, mesh, r_xyz, seed } = W, n = mesh.numRegions, shared = sharedPayload(present, mesh, r_xyz, seed), layers = pastLayers(present, n);
    self.postMessage({ type, seed, present: presentMessage(present, W.plateIsOcean), debugLayers: layers, shared: shared.payload, ...extra },
        [...shared.transfer, ...Object.values(layers).map(a => a.buffer), ...(extra.r_plate ? [extra.r_plate.buffer] : [])]);
}

/** The first sketch (js/world-sketch.js): land and sea as soon as the plates are projected, while the world is built. */
function sendSketch(mesh, r_xyz, r_plate, plateIsOcean, seed) {
    const tm = presentTerrainMesh(mesh, r_xyz), land = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < land.length; r++) land[r] = plateIsOcean.has(r_plate[r]) ? 0 : 1;
    const { heightKm, shade } = sketchGround(tm, land, seed), m = { numCells: tm.numCells, xyz: tm.xyz.slice(), adjOffset: tm.adjOffset.slice(), adjList: tm.adjList.slice() };
    self.postMessage({ type: 'sketch', mesh: m, heightKm, shade }, [m.xyz.buffer, m.adjOffset.buffer, m.adjList.buffer, heightKm.buffer, shade.buffer]);
}

async function handleGenerate(data) {
    const { N, P, jitter, nMag, numContinents, continentSizeVariety = 0, landCoverage = 0.3, seed: overrideSeed, toggledIndices } = data;
    const t0 = performance.now();
    progress(0, 'Shaping the world…');
    const seed = overrideSeed ?? Math.floor(Math.random() * SEED_MAX);
    progress(10, 'Generating coarse plates…');
    const coarseLayout = generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);
    applyCuts(data.cuts, coarseLayout);                       // (the region cuts, before the first land is read off it)
    const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } = coarseLayout;
    const coarse = { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds };
    W = null; pendingStrokes = data.strokes ?? [];
    progress(20, 'Projecting plates…');
    // (the Detail ladder, js/detail-ladder.js: coarsest step first, then finer up to N; N alone with Progressive off)
    const ns = detailSteps(N, data.progressive), meshes = meshesFor(ns, jitter, seed), build = async (n) => piecesOn(n, await meshes[ns.indexOf(n)], seed, coarse, P);
    let { mesh, r_xyz, r_plate } = await build(ns[0]);
    const plateSeeds = coarsePlateSeeds, plateIsOcean = coarsePlateIsOcean, originalPlateIsOcean = new Set(plateIsOcean);
    // (a planet code's edits: pieces raised or sunk, by their index in the layout)
    if (toggledIndices?.length) {
        const seedArr = Array.from(plateSeeds);
        for (const i of toggledIndices) if (i < seedArr.length) { const r = seedArr[i]; if (plateIsOcean.has(r)) plateIsOcean.delete(r); else plateIsOcean.add(r); }
    }
    sendSketch(mesh, r_xyz, r_plate, plateIsOcean, seed);
    progress(28, 'Moving the plates…');
    // the pieces' motion: the physics on the unedited layout
    const pieceVec = JSON.parse(JSON.stringify(coarsePlateVec));
    applyPlatePhysics(pieceVec, plateSeeds, originalPlateIsOcean, coarse_r_plate, coarseMesh, coarse_xyz, seed);
    const present = presentPlatesFor({ coarse, P, pieceOcean: plateIsOcean, pieceVec, seed, mesh, r_xyz, r_plate, original: originalPlateIsOcean });
    present.edit = { pieceVec, coarse, P, original: originalPlateIsOcean };   // (kept for an edit: the coarse layout, the pieces' motion — G1d — and their first land)
    progress(35, ns.length > 1 ? `Detail ${ns[0].toLocaleString('en-US')}…` : 'Raising the ground…');
    const knobs = knobsOf(data, nMag);
    await presentGround(present, plateIsOcean, mesh, r_xyz, seed, knobs, ns.length === 1);
    if (ns.length > 1) {
        sendRung(mesh, r_xyz, present.world.heightKm, present.world.shade, ns[0], N, t0, null, data.progressiveWater && presentRungJob(present, present.world.surface, seed));
        ({ mesh, r_xyz, r_plate } = await climbTo(present, ns.slice(1), build, plateIsOcean, seed, knobs, t0, data.progressiveWater));
        groundDrawn(present, mesh, r_xyz);
    }
    W = { mesh, r_xyz, seed, nMag, plateIsOcean: new Set(plateIsOcean), present, r_plate: new Int32Array(r_plate), strokes: pendingStrokes };
    present.r_plate = W.r_plate;
    progress(95, 'Done');
    sendWorld('done', { r_plate, plateSeeds: Array.from(plateSeeds), plateIsOcean: Array.from(plateIsOcean), originalPlateIsOcean: Array.from(originalPlateIsOcean), _workerTotal: performance.now() - t0, _ms: present.world.ms });
}

async function handleReapply(data) {
    if (!W) { self.postMessage({ type: 'error', message: 'No retained state for reapply' }); return; }
    if (W.imported) return importGround(data, true);
    const t0 = performance.now();
    if (data.nMag !== undefined) W.nMag = data.nMag;
    await presentReground(W.present, W.mesh, W.r_xyz, W.seed, knobsOf(data, W.nMag));
    sendWorld('reapplyDone', { _workerTotal: performance.now() - t0 });
}

async function handleEditRecompute(data) {
    if (!W?.present) { self.postMessage({ type: 'error', message: 'No retained state for editRecompute' }); return; }
    const t0 = performance.now();
    progress(0, 'Rebuilding…');
    W.plateIsOcean = new Set(data.plateIsOcean);
    W.nMag = data.nMag;                                       // (Reapply after a Rebuild reads the Roughness it was built with)
    // the plates regrouped and moved on the layout as edited (as loading the code would), then the ground again
    const E = W.present.edit;
    W.present = { ...presentPlatesFor({ coarse: E.coarse, P: E.P, pieceOcean: W.plateIsOcean, pieceVec: E.pieceVec, seed: W.seed, mesh: W.mesh, r_xyz: W.r_xyz, r_plate: W.r_plate, original: E.original, reuse: W.present }), edit: E };
    await presentGround(W.present, W.plateIsOcean, W.mesh, W.r_xyz, W.seed, knobsOf(data, W.nMag));
    sendWorld('editDone', { _workerTotal: performance.now() - t0 });
}

/** The terrain brushes: all strokes so far (fewer than before: an undo). */
function handleBrush(data) {
    if (!W?.present) { self.postMessage({ type: 'error', message: 'No retained state for brush' }); return; }
    const t0 = performance.now();
    W.strokes = data.strokes;
    brushTo(W.present, W.mesh, W.r_xyz, W.strokes);
    sendWorld('editDone', { _workerTotal: performance.now() - t0 });
}

// ── an imported heightmap (js/import-main.js; plans/SHARED_CORE_PLAN.md U4): the image's heights on Generate's mesh,
// shaped by the sliders that shape an image (Terrain Warp, Smoothing, Ridge Sharpening: terrain-post.js), as the first
// picture — then Evolution's finish erodes it by its climate (the erosion sliders read there), with the carving's inputs
// of ground with no history (synthesize.js plainCarveInputs) and no Frame: no rocks ──
/** Bilinear interpolation with equirectangular wrapping. */
function sampleBilinear(pixels, imgW, imgH, px, py) {
    py = Math.max(0, Math.min(py, imgH - 1));
    const x0 = Math.floor(px), y0 = Math.floor(py), x1 = (x0 + 1) % imgW, y1 = Math.min(y0 + 1, imgH - 1), fx = px - x0, fy = py - y0;
    const xa = ((x0 % imgW) + imgW) % imgW;
    return pixels[y0 * imgW + xa] * (1 - fx) * (1 - fy) + pixels[y0 * imgW + x1] * fx * (1 - fy) + pixels[y1 * imgW + xa] * (1 - fx) * fy + pixels[y1 * imgW + x1] * fx * fy;
}
/** Grey 0–255 → Generate's elevation: 0 the sea floor; 1–255 the inverse of 6·t², so grey maps linearly to km (white 6 km). */
const greyToElevation = (v) => (v < 1 ? -0.5 : Math.sqrt((v - 1) / 254));
/** An equirectangular grey heightmap sampled onto the mesh's regions. */
function sampleHeightmap(mesh, r_xyz, image, imgW, imgH) {
    const elev = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        const lat = Math.asin(Math.max(-1, Math.min(1, y))), lon = Math.atan2(x, z);
        elev[r] = greyToElevation(sampleBilinear(image, imgW, imgH, (lon / Math.PI + 1) * 0.5 * imgW, (0.5 - lat / Math.PI) * imgH));
    }
    return elev;
}
/** The image's own shape: warped, smoothed, a little detail, its ridges sharpened, its slopes crept (its erosion the finish's). */
function shapeImported(mesh, r_xyz, elev, data, seed) {
    if (data.terrainWarp > 0) warpTerrain(mesh, elev, r_xyz, seed, data.terrainWarp);
    const sea = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < sea.length; r++) if (elev[r] <= 0) sea[r] = 1;
    if (data.smoothing > 0) smoothElevation(mesh, elev, sea, Math.round(1 + data.smoothing * 4), 0.2 + data.smoothing * 0.5);
    applyDetailNoise(mesh, r_xyz, elev, sea, seed, { dampenField: null, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: null });
    if (data.ridgeSharpening > 0) sharpenRidges(mesh, elev, sea, Math.round(1 + data.ridgeSharpening * 3), data.ridgeSharpening * 0.08);
    applySoilCreep(mesh, elev, sea, 3, 0.1125);
}
const IMPORT_SIM_CELLS = 20000;
let importSim = null;
async function importGround(data, again = false) {
    const t0 = performance.now();
    if (!again) {
        progress(0, 'Building sphere mesh…');
        const seed = data.seed ?? Math.floor(Math.random() * SEED_MAX);
        // (the Detail ladder, js/detail-ladder.js: the image shaped on each coarser step first, each shown)
        const ns = detailSteps(data.N, data.progressive), meshes = meshesFor(ns, data.jitter, seed), knobs = knobsOf(data, 0.4);
        if (data.progressiveWater) importSim ??= buildSimMesh(IMPORT_SIM_CELLS, 12345);
        for (const [i, n] of ns.slice(0, -1).entries()) {
            progress(5, `Detail ${n.toLocaleString('en-US')}…`);
            const s = await meshes[i], elev = sampleHeightmap(s.mesh, s.r_xyz, data.grayscale, data.imageWidth, data.imageHeight), tm = presentTerrainMesh(s.mesh, s.r_xyz);
            shapeImported(s.mesh, s.r_xyz, elev, data, seed);
            const h = Float32Array.from(elev, elevToHeightKm);
            sendRung(s.mesh, s.r_xyz, h, hillshade(tm, h), n, data.N, t0, null, data.progressiveWater && rungJob({ sim: importSim, seed, surface: plainSurface(tm, h, knobs, seed), knobs }));
        }
        const { mesh, r_xyz } = await meshes[ns.length - 1];
        progress(25, 'Sampling heightmap…');
        W = { mesh, r_xyz, seed, imported: sampleHeightmap(mesh, r_xyz, data.grayscale, data.imageWidth, data.imageHeight) };
    }
    progress(50, 'Shaping the ground…');
    const { mesh, r_xyz, seed } = W, elev = new Float32Array(W.imported);
    shapeImported(mesh, r_xyz, elev, data, seed);
    const tm = presentTerrainMesh(mesh, r_xyz), n = mesh.numRegions, heightKm = new Float32Array(n);
    for (let r = 0; r < n; r++) heightKm[r] = elevToHeightKm(elev[r]);
    importSim ??= buildSimMesh(IMPORT_SIM_CELLS, 12345);
    const knobs = knobsOf(data, 0.4), surface = plainSurface(tm, heightKm.slice(), knobs, seed);
    const transfer = [surface.heightKm.buffer, ...Object.values(surface.carveIn).map(a => a.buffer)], copy = (a) => { const c = a.slice(); transfer.push(c.buffer); return c; };
    const shade = hillshade(tm, heightKm);
    transfer.push(heightKm.buffer, shade.buffer);
    const shared = {
        mesh: { numCells: n, xyz: copy(tm.xyz), adjOffset: copy(tm.adjOffset), adjList: copy(tm.adjList) },
        heightKm, shade, story: null, regionCell: null,
        finish: { frame: null, simMesh: { numCells: importSim.numCells, xyz: copy(importSim.xyz), adjOffset: copy(importSim.adjOffset), adjList: copy(importSim.adjList) }, seed, surface,
            terrain: presentTerrainOverrides({ knobs }), finish: finishOverrides(knobs) },
    };
    progress(95, 'Done');
    self.postMessage({ type: again ? 'reapplyDone' : 'done', seed, shared, _workerTotal: performance.now() - t0 }, transfer);
}

// (the commands one after another, as they came: a ground drawn on the pool is awaited, and the next waits for it)
let queue = Promise.resolve();
self.onmessage = (e) => {
    const handlers = { generate: handleGenerate, reapply: handleReapply, editRecompute: handleEditRecompute, brush: handleBrush, importHeightmap: (d) => importGround(d) };
    const run = handlers[e.data.cmd];
    if (!run) { self.postMessage({ type: 'error', message: `Unknown command: ${e.data.cmd}` }); return; }
    queue = queue.then(() => run(e.data)).catch(err => self.postMessage({ type: 'error', message: err.message, stack: err.stack }));
};
