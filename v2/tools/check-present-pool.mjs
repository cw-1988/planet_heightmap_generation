// The present-day ground drawn on a TerrainPool (js/planet-worker.js: its surface on worker threads) is the ground drawn
// on one thread, bit for bit: the first picture, the finish's surface (its heights, carving inputs — the finish's
// erodibility, kAlt, among them — records and cues), the carving's rivers, lava and cut; and the surface's rest drawn again
// for a second finish (present/world.js presentSurfaceRest) the same as the first.
//
//   node v2/tools/check-present-pool.mjs

import { check, section, finish } from './lib/check-kit.mjs';
import { generateCoarsePlates, projectCoarsePlates } from '../../js/coarse-plates.js';
import { smoothAndReconnectPlates } from '../../js/plates.js';
import { applyPlatePhysics } from '../../js/plate-physics.js';
import { buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { buildPresentPlates } from '../js/present/plates.js';
import { presentLayout } from '../js/present/layout.js';
import { presentWorld, presentTerrainMesh, presentSynthesize, presentTerrainOverrides, presentSurfaceRest } from '../js/present/world.js';
import { finishConfigOf, reliefShareOf } from '../js/present/knobs.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';

const same = (a, b) => { if (!a || !b) return a === b; if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) return false; return true; };

section('the present-day ground on a pool: the same as on one thread');
for (const seed of [2, 777]) {
    const P = 80, g = generateCoarsePlates(seed, P, seed === 777 ? 1 : 4, 0.35, 0.3), pieceVec = JSON.parse(JSON.stringify(g.coarsePlateVec));
    applyPlatePhysics(pieceVec, g.coarsePlateSeeds, g.coarsePlateIsOcean, g.coarse_r_plate, g.coarseMesh, g.coarse_xyz, seed);
    const L = presentLayout({ seed, P, coarse: g, pieceOcean: new Set(g.coarsePlateIsOcean), pieceVec }), W = buildPresentPlates(L);
    const { mesh, r_xyz } = buildSphere(60000, 0.75, makeRng(seed));
    const r_plate = projectCoarsePlates(mesh, r_xyz, g.coarseMesh, g.coarse_xyz, g.coarse_r_plate, seed, P);
    smoothAndReconnectPlates(mesh, r_plate, g.coarsePlateSeeds, 3);
    const nR = mesh.numRegions, regionLand = new Uint8Array(nR), regionCell = new Int32Array(nR), regionPlate = new Int16Array(nR), pIdx = new Map(L.pieceIds.map((id, i) => [id, i]));
    for (let q = 0; q < nR; q++) {
        regionLand[q] = L.pieceOcean.has(r_plate[q]) ? 0 : 1;
        regionCell[q] = L.sim.index.nearest(r_xyz[3 * q + 2], r_xyz[3 * q], r_xyz[3 * q + 1]);
        const i = pIdx.get(r_plate[q]), pp = i === undefined ? -1 : W.piecePlate[i];
        regionPlate[q] = pp < 0 || W.splitPiece[i] ? W.cellPlate[regionCell[q]] : pp;
    }
    const pieceLand = Uint8Array.from(L.pieceIds, id => (L.pieceOcean.has(id) ? 0 : 1)), F = finishConfigOf({});
    const o = { seed, regionLand, regionCell, regionPlate, finish: F };
    const pool = await TerrainPool.create(L.sim, 4);
    const t0 = performance.now(), A = presentWorld({ L, P: W }, pieceLand, mesh, r_xyz, o), t1 = performance.now();
    const B = await presentWorld({ L, P: W }, pieceLand, mesh, r_xyz, { ...o, pool }), t2 = performance.now();
    // (the synthesis alone, too, as Reapply draws it)
    const tm = presentTerrainMesh(mesh, r_xyz), cfg = terrainConfig(presentTerrainOverrides({})), relief = reliefShareOf({});
    const a = presentSynthesize(A.frame, L.sim, tm, cfg, seed, relief, A.mask, A.frontKm, F), b = await presentSynthesize(A.frame, L.sim, tm, cfg, seed, relief, A.mask, A.frontKm, F, pool);
    // (the surface's rest drawn again for a second finish — the planet worker sends the first away: docs/generate-memory.md)
    const t3 = performance.now(), R = await presentSurfaceRest(A.frame, L.sim, mesh, r_xyz, { ...o, pool }), t4 = performance.now(), R1 = await presentSurfaceRest(A.frame, L.sim, mesh, r_xyz, o);
    pool.terminate();
    const restSame = r => Object.keys(r.carveIn).length === Object.keys(A.surface.carveIn).length && Object.keys(A.surface.carveIn).every(k => same(A.surface.carveIn[k], r.carveIn[k])) && same(A.surface.recCell, r.recCell) && same(A.surface.cues, r.cues);
    check(`seed ${seed}: the surface's rest drawn again the same, on the pool (${((t4 - t3) / 1000).toFixed(1)} s) and on one thread`, restSame(R) && restSame(R1));
    const keys = Object.keys(A.surface.carveIn), carveSame = keys.every(k => same(A.surface.carveIn[k], B.surface.carveIn[k])) && keys.length === Object.keys(B.surface.carveIn).length;
    check(`seed ${seed}: the ground the same (${((t1 - t0) / 1000).toFixed(1)} s on one thread, ${((t2 - t1) / 1000).toFixed(1)} s on the pool)`,
        same(A.heightKm, B.heightKm) && same(A.drainage, B.drainage) && same(A.lava, B.lava) && same(A.cut, B.cut) && same(A.young, B.young));
    check(`seed ${seed}: the finish's surface the same — heights, ${keys.length} carving inputs (k at the finish's strength among them), records, cues`,
        same(A.surface.heightKm, B.surface.heightKm) && carveSame && same(A.surface.recCell, B.surface.recCell) && same(A.surface.cues, B.surface.cues));
    check(`seed ${seed}: Reapply's synthesis the same`, same(a.heightKm, b.heightKm) && same(a.surface.heightKm, b.surface.heightKm) && same(a.surface.carveIn.k, b.surface.carveIn.k));
}
finish('Present ground on a pool');
