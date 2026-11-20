// The Detail ladder (docs/progressive-detail.md): a new planet built coarse first, then finer step by step up to the
// Detail chosen — 5,000 cells, then twice as many each step, then the Detail itself — each step's ground sent to
// the page as a `rung` and shown in place of the last. The plates, their motion, the past and the Frame are worked out
// once (on the sim mesh, free of Detail); each step draws only the ground on its own mesh. The last step is the
// planet as it always was: the same mesh, the same ground, bit for bit.

import { projectCoarsePlates } from './coarse-plates.js';
import { smoothAndReconnectPlates } from './plates.js';
import { presentTerrainMesh, presentGroundOf } from '../v2/js/present/world.js';
import { finishConfigOf } from '../v2/js/present/knobs.js';
import { hillshade } from '../v2/js/view/terrain-shade.js';

/** The ladder's first step, and how much finer each next one is: twice the cells, √2 the sharpness (×4 jumped too far
 *  between pictures: the owner, 2026-11-20). */
export const RUNG_FIRST = 5000, RUNG_STEP = 2;

/** The coarser steps shown before Detail `N` (none at 5,000 or less): 5,000, 10,000, 20,000 … while below N. */
export function detailRungs(N) {
    const out = [];
    for (let n = RUNG_FIRST; n < N; n *= RUNG_STEP) out.push(n);
    return out;
}

/** Generate's mesh at Detail `n` (js/mesh-source.js) with the pieces projected on it (as handleGenerate always did). */
export function piecesOn(n, { mesh, r_xyz }, seed, coarse, P) {
    const r_plate = projectCoarsePlates(mesh, r_xyz, coarse.coarseMesh, coarse.coarse_xyz, coarse.coarse_r_plate, seed, P);
    smoothAndReconnectPlates(mesh, r_plate, coarse.coarsePlateSeeds, 3);
    return { n, mesh, r_xyz, r_plate };
}

/** Each render region's sim cell (its nearest; the sim mesh's index is in Evolution's z-up frame) and its plate: its own
 *  piece's (G1c: a plate is whole pieces), or its sim cell's in a piece split down a narrow sea or too small to hold one. */
export function regionsOf(L, plates, mesh, r_xyz, r_plate, regionCell = null) {
    if (!regionCell) {
        regionCell = new Int32Array(mesh.numRegions);
        for (let r = 0; r < mesh.numRegions; r++) regionCell[r] = L.sim.index.nearest(r_xyz[3 * r + 2], r_xyz[3 * r], r_xyz[3 * r + 1]);
    }
    const pieceIndex = new Map(L.pieceIds.map((id, i) => [id, i]));
    const regionPlate = new Int16Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        const i = pieceIndex.get(r_plate[r]), pp = i === undefined ? -1 : plates.piecePlate[i];
        regionPlate[r] = pp < 0 || plates.splitPiece[i] ? plates.cellPlate[regionCell[r]] : pp;
    }
    return { regionCell, regionPlate };
}

/** Each region's land as the pieces are edited (G2c: the ground held to the pieces' outlines at this Detail). */
export function regionLandOf(r_plate, plateIsOcean) {
    const land = new Uint8Array(r_plate.length);
    for (let r = 0; r < land.length; r++) land[r] = plateIsOcean.has(r_plate[r]) ? 0 : 1;
    return land;
}

/**
 * The ground of the world `present` (its Frame already worked out, on another mesh) drawn on the mesh `m`: the hold
 * to the pieces read again on m's regions, then the ground as Reapply draws it. Returns the ground with its regions,
 * mask and hillshade.
 */
export async function groundOnMesh(present, m, plateIsOcean, seed, knobs, pool) {
    const w = present.world, { regionCell, regionPlate } = regionsOf(present.L, present.P, m.mesh, m.r_xyz, m.r_plate);
    const mask = w.mask ? { ...w.mask, regionLand: regionLandOf(m.r_plate, plateIsOcean), regionCell, regionPlate } : null;
    if (mask) delete mask.fitShelf;                              // (the last mesh's: groundFrom works it out again)
    const g = await presentGroundOf(w.frame, present.L.sim, m.mesh, m.r_xyz, { seed, knobs, mask, frontKm: w.frontKm, finish: finishConfigOf(knobs), pool });
    return { ...g, mask, regionCell, regionPlate, shade: hillshade(presentTerrainMesh(m.mesh, m.r_xyz), g.heightKm) };
}

/** A step of the ladder sent to the page: its mesh (Evolution's z-up frame), heights and hillshade, its Detail, and when
 *  (ms since the build began at `t0`). */
export function sendRung(mesh, r_xyz, heightKm, shade, n, of, t0, ms = null) {
    const tm = presentTerrainMesh(mesh, r_xyz), h = heightKm.slice(), s = shade.slice();
    const m = { numCells: tm.numCells, xyz: tm.xyz.slice(), adjOffset: tm.adjOffset.slice(), adjList: tm.adjList.slice() };
    self.postMessage({ type: 'rung', mesh: m, heightKm: h, shade: s, detail: n, of, at: performance.now() - t0, ms }, [m.xyz.buffer, m.adjOffset.buffer, m.adjList.buffer, h.buffer, s.buffer]);
}
