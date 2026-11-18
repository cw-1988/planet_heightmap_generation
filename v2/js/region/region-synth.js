// The planet's own generator at the region's detail (fork addition). The planet's heights come from a synthesis
// (terrain/synthesize.js surfaceRange: the belts, the platforms, the coasts and their fractal detail) with a fine ridged
// relief on the uplands (present/relief.js, its ridges drawn out along the plates' old fronts); each fades out the
// waves its mesh is too coarse to hold. Here both are drawn again over the region — on a grid of at most GEN_MAX² cells
// (about 2 km a cell: the generator costs ~15 µs a point) and, for what the planet already holds, on a grid a quarter
// as fine at the planet's own spacing — and the difference is the detail the planet's mesh could not show: the same
// mountains, with the spurs, ridges and coves the generator draws on a mesh this fine. region-relief.js adds it to the
// planet's finished (eroded) heights, so the planet's valleys, coasts and rivers stay where they are, and draws only
// the waves finer than this grid with its own noise.

import { preparePlan, surfaceRange } from '../terrain/synthesize.js';
import { sampleRange } from '../terrain/terrain-mesh.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { addFineRelief } from '../present/relief.js';
import { meshFromArrays } from '../core/sim-mesh.js';
import { placeAt } from './region-frame.js';

const D = Math.PI / 180, SLICE = 32768, GEN_MAX = 512;

/** The unit positions of an m × m grid over frame F (cell centres). */
function gridXyz(F, m) {
    const xyz = new Float32Array(3 * m * m), ll = [0, 0], cell = F.km / m;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        placeAt(F, (i + 0.5) * cell - F.km / 2, F.km / 2 - (j + 0.5) * cell, ll);
        const la = ll[0] * D, lo = ll[1] * D, cl = Math.cos(la), c = 3 * (j * m + i);
        xyz[c] = cl * Math.cos(lo); xyz[c + 1] = cl * Math.sin(lo); xyz[c + 2] = Math.sin(la);
    }
    return xyz;
}

/** A grid's value read smoothly at (x, y) in its cells (bilinear, held at the edges). */
export function gridAt(a, m, x, y) {
    x = Math.min(m - 1.001, Math.max(0, x - 0.5)); y = Math.min(m - 1.001, Math.max(0, y - 0.5));
    const i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j, c = j * m + i;
    return (a[c] * (1 - tx) + a[c + 1] * tx) * (1 - ty) + (a[c + m] * (1 - tx) + a[c + m + 1] * tx) * ty;
}

/**
 * The generator's detail finer than the planet's mesh over frame F: { m, cellKm, d (m × m, metres) }, or null without a
 * job. job: the finish's job (the Frame, the sim mesh, the seed, the terrain overrides) with the fine relief's share and
 * the fronts' distances (planet-worker.js sharedPayload); planetEdgeKm the planet mesh's spacing. progress(f) as it goes.
 */
export function generatorDetail(F, job, planetEdgeKm, progress) {
    if (!job?.frame || !job.simMesh) return null;
    const sim = meshFromArrays(job.simMesh), cfg = terrainConfig(job.terrain ?? {}), seed = job.seed;
    const m = Math.min(F.n, GEN_MAX), mc = Math.max(8, m >> 2), cellKm = F.km / m;
    // (one grid drawn at one spacing: the sim cells each point reads, the surface, the fine relief)
    const draw = (g, edgeKm, at, share) => {
        const n = g * g, xyz = gridXyz(F, g), cells = new Int32Array(3 * n), weights = new Float32Array(3 * n), out = new Float32Array(n);
        sampleRange(sim, xyz, cfg, seed, 0, n, cells, weights);
        const plan = preparePlan(job.frame, sim, cfg, seed, edgeKm);
        for (let a = 0; a < n; a += SLICE) {
            surfaceRange(plan, cfg, seed, edgeKm, xyz, cells, weights, a, Math.min(n, a + SLICE), out);
            progress?.(at + share * Math.min(1, (a + SLICE) / n));
        }
        addFineRelief(out, xyz, edgeKm, seed, cfg, job.relief ?? 0, job.frontKm ? { frontKm: job.frontKm, cells, weights } : null);
        return out;
    };
    const coarse = draw(mc, planetEdgeKm, 0, 0.1), d = draw(m, cellKm, 0.1, 0.9), k = mc / m;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        const c = j * m + i;
        d[c] = 1000 * (d[c] - gridAt(coarse, mc, (i + 0.5) * k, (j + 0.5) * k));
    }
    return { m, cellKm, d };
}
