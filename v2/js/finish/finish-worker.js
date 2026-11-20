// The Finish step's worker (plans/V2_FINISH_PLAN.md): finishes one moment (finish.js) and sends back its picture of
// heights. It keeps the mesh it built (a 10M-cell mesh takes ~15 s to build — only this worker ever holds it) until a
// finish at another detail (one fine mesh at a time: they are big); its
// terrain pool (the surface, in slices) lives only for the surface and is let go before the heavy stages.
//
// Message in:  {type: 'finish', id, frame (the terrain fields of a frame, terrain-pool.js FRAME_FIELDS, and the plates'
//              rotations), simMesh {numCells, xyz, adjOffset, adjList}, seed, cells, width, delaunatorUrl, poolSize?,
//              keepCells? (a pass of Add detail's ladder: the last pass's detail, whose meshes stay), earlyTerrain? (send
//              the terrain as soon as it is final: the 'terrain' message), valleyQ? (with it, the valleys' lines for the
//              rivers of at least this m³/s: river-valleys.js riverLines), terrainOnly? (with earlyTerrain: stop after the
//              'terrain' message, its 'done' bare — a step of the Detail ladder's water, js/rung-view.js; its climate step-climate.js's)}
//              · {type: 'prepare', cells, simCells, delaunatorUrl} — the meshes a finish at `cells` needs, built ahead
//              while nothing waits on them (no reply; a finish asked for meanwhile waits for them, then finds them built)
//              A page that draws its own surface (Generate: plans/SHARED_CORE_PLAN.md U1) adds mesh {numCells, xyz, adjOffset,
//              adjList} (its own mesh, finished on instead of a terrain mesh), surface {heightKm, carveIn, recCell, cues}
//              (drawn on it with finish.js surfaceConfig's terrain config), and the overrides of its terrain config
//              (`terrain`) and of the finish's (`finish`) — no terrain pool then
// Messages out: {type: 'stage', id, stage} · {type: 'progress', id, share} (the picture) · {type: 'terrain', id, raster
//              {w, h, heightM, ocean, water, waterLevel (the lakes' level, m)}, rivers, drain, valleyQ, lines} (with earlyTerrain: the terrain, before the other layers) · {type: 'drivers', id, drivers}
//              (with earlyTerrain: the fine detail's drivers once drawn, so the terrain zooms in; 'done' then without them) · {type: 'done', id, raster:
//              {w, h, heightM, ocean, water, geology, farming (farming/farming.js: its parts per pixel)}, rivers
//              (finish-hydro.js), climate (the moment's own, at its detail: the
//              grid's fields, climate-fields.js, and raster {w, h, koppen, tAnnual (°C × 100), pAnnual (mm), stats} — the land's
//              climate, at most 4096 px wide), stats, ms} · {type: 'error', id, message}

import { finishPlanet, finishRaster, FARM_KEYS } from './finish.js';
import { FINISH } from './finish-config.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { driverWidth, DRIVER_FIELDS } from './finish-drivers.js';
import { climateTransfers } from '../evolution/climate-fields.js';
import { TerrainPool } from '../terrain/terrain-pool.js';
import { keepOnlyTerrainMesh, terrainMesh } from '../terrain/terrain-mesh.js';
import { ladderCells } from '../terrain/synthesize.js';
import { meshFromArrays } from '../core/sim-mesh.js';
import { setDelaunator } from '../../../js/sphere-mesh.js';
import { riverLines } from './river-valleys.js';
import { stepClimate } from './step-climate.js';

let sim = null, simCells = 0, delaunatorSet = false;
const LOCATED_WIDTH = 2048;                                          // (2048 × 1024 pixels' cells: ~75 MB while the finish runs)

self.onmessage = async ({ data }) => {
    if (data.type === 'prepare') {
        // (the fine mesh and the coarser ones its carving climbs — ~3 s at 2.5M — built before the first Add detail)
        try {
            if (!delaunatorSet) { setDelaunator((await import(data.delaunatorUrl)).default); delaunatorSet = true; }
            const sizes = ladderCells(data.simCells, data.cells);
            keepOnlyTerrainMesh(data.cells, ...sizes);
            for (const c of [...sizes, data.cells]) terrainMesh(c);
        } catch { /* (built when a finish asks for them, then) */ }
        return;
    }
    if (data.type !== 'finish') return;
    const { id, frame, seed, width, poolSize = null, climateOptions = {}, surface = null, earlyTerrain = false, valleyQ = 0, terrainOnly = false } = data;
    try {
        if (!delaunatorSet) { setDelaunator((await import(data.delaunatorUrl)).default); delaunatorSet = true; }
        if (!sim || simCells !== data.simMesh.numCells) { sim = meshFromArrays(data.simMesh); simCells = data.simMesh.numCells; }
        // (the page's own mesh and surface, or a terrain mesh of `cells` and the history's surface drawn by the pool)
        const mesh = data.mesh ? meshFromArrays(data.mesh) : null, cells = mesh ? mesh.numCells : data.cells;
        // (another detail's mesh goes: one fine mesh at a time; the coarser ones its carving climbs stay — and, on a pass of
        // Add detail's ladder, the last pass's (keepCells), built ahead by prepare)
        const keepCells = mesh ? 0 : data.keepCells ?? 0;
        keepOnlyTerrainMesh(...(mesh ? [] : [cells]), ...(keepCells ? [keepCells] : []), ...ladderCells(sim.numCells, Math.max(cells, keepCells)));
        const pool = surface ? null : await TerrainPool.create(sim, poolSize);
        const own = mesh && surface ? { mesh, surface: () => surface } : {};
        // (the terrain, as soon as it is final: its picture of heights, sea and lakes, its rivers and drain — copies; the
        // pixels' cells kept for the finished picture, up to LOCATED_WIDTH: wider, their memory outweighs the second saved)
        const located = earlyTerrain && width <= LOCATED_WIDTH ? {} : null;
        const onTerrain = earlyTerrain ? t => {
            const raster = finishRaster(t.mesh, t.z, t.ocean, width, null, t.lake, t.lakeLevel, null, null, null, located);
            // (and the valleys' lines the zoomed tiles cut, for the rivers the page draws — ~0.15 s off its thread; built on a
            // copy, so the rivers sent with 'done' carry no cache)
            const lines = valleyQ > 0 && valleyQ < Infinity ? riverLines({ ...t.rivers }, valleyQ, raster) : null;
            self.postMessage({ type: 'terrain', id, raster, rivers: t.rivers, drain: t.drain, valleyQ, lines },
                [raster.heightM.buffer, raster.ocean.buffer, raster.water.buffer, raster.waterLevel.buffer, ...Object.values(t.drain).map(a => a.buffer), ...(lines ? [lines.buffer] : [])]);
            return terrainOnly;
        } : null;
        // (and the fine detail's drivers once drawn — the terrain zooms in with them, not only after the rocks and farming;
        // handed over, so 'done' comes without them: finish-view.js adds them back)
        let driversSent = false;
        const onDrivers = earlyTerrain ? dr => { self.postMessage({ type: 'drivers', id, drivers: dr }, DRIVER_FIELDS.map(k => dr[k].buffer)); driversSent = true; } : null;
        const out = await finishPlanet({ frame, simMesh: sim, seed, cells, pool, closePool: !!pool, climateOptions, driversWidth: driverWidth(width), onStage: stage => self.postMessage({ type: 'stage', id, stage }),
            onTerrain, onDrivers, ...own, ...(terrainOnly ? { climate: stepClimate } : {}),...(data.terrain ? { cfg: terrainConfig(data.terrain) } : {}), ...(data.finish ? { F: { ...FINISH, ...data.finish } } : {}) });
        if (out.terrainOnly) { self.postMessage({ type: 'done', id, terrainOnly: true, ms: out.ms }); return; }
        self.postMessage({ type: 'stage', id, stage: 'picture' });
        const t0 = performance.now();
        const raster = finishRaster(out.mesh, out.z, out.ocean, width, share => self.postMessage({ type: 'progress', id, share }), out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming, located);
        const farm = raster.farming ? [...[...FARM_KEYS, 'kind'].map(k => raster.farming[k].buffer), ...Object.values(raster.farming.crops ?? {}).map(a => a.buffer)] : [];
        out.ms.picture = performance.now() - t0;
        // (the finished moment's climate: the grid's fields, and its own picture of the land's climate)
        const climate = { ...out.climate.page, raster: raster.climate };
        delete raster.climate;
        // (what the detail finer than the mesh is drawn from: kept with the picture, and saved with it)
        if (!driversSent) raster.drivers = out.drivers;
        const rv = out.rivers, drain = out.drain;
        self.postMessage({ type: 'done', id, raster, rivers: rv, drain, climate, stats: out.stats, ms: out.ms },
            [drain.recv.buffer, drain.area.buffer, drain.sea.buffer, drain.q.buffer, drain.z.buffer, drain.lake.buffer, raster.heightM.buffer, raster.ocean.buffer, raster.water.buffer, raster.waterLevel.buffer, ...farm, ...(raster.geology ? [raster.geology.rock.buffer, ...(raster.geology.rec ? [raster.geology.rec.buffer] : []), ...(raster.geology.deposits ? [raster.geology.deposits.cells.buffer, raster.geology.deposits.data.buffer, raster.geology.deposits.land.buffer] : [])] : []), rv.start.buffer, rv.lat.buffer, rv.lon.buffer, rv.q.buffer, rv.season.buffer,
                ...(rv.regime ? [rv.regime.buffer, rv.floodFrom.buffer, rv.floodTo.buffer, rv.farFed.buffer] : []), ...climateTransfers(climate),
                ...(raster.drivers ? DRIVER_FIELDS.map(k => raster.drivers[k].buffer) : [])]);
    } catch (err) {
        self.postMessage({ type: 'error', id, message: err?.stack ?? String(err) });
    }
};
