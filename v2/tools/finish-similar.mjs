// How close a fast finish (docs/fast-mode.md) comes to the exact one: the measure that stands in for the hash check
// where a speed-up is allowed to change details. Run the exact finish once (--ref), then any fast mix against it:
//
//   node --max-old-space-size=16000 v2/tools/finish-similar.mjs --cells 2500000 --ref
//   node --max-old-space-size=16000 v2/tools/finish-similar.mjs --cells 2500000 --fast <part,part…>
//
// Same moment as v2/out/hash-finish.mjs (its cached frame), the meshes built ahead as the page builds them. Prints each
// measure against its limit (LIMITS) and the finish's time; exits 1 when any is out. For a trial not (yet) a fast part:
// `--climate '{"gridStepDeg":2}'` (the climate's options); `--save <name>` keeps the run for finish-kind.mjs; `--pass 160000` runs that pass first, as Add detail does.

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';
import { ladderCells } from '../js/terrain/synthesize.js';
import { finishPlanet } from '../js/finish/finish.js';
import { fastParts } from '../js/finish/fast-mode.js';
import { compareFinishes, LIMITS } from './finish-similar-measures.mjs';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CELLS = Number(arg('--cells', 2500000)), REF = process.argv.includes('--ref'), FAST = REF ? '' : arg('--fast', '1');
const CLIMATE = JSON.parse(arg('--climate', '{}')), SAVE = arg('--save', null);
const dir = path.join(ROOT, 'v2', 'out', 'similar'), refFile = path.join(dir, `ref-${CELLS}.bin`);
if (!REF && !fs.existsSync(refFile)) throw new Error(`no reference for ${CELLS} cells: run with --ref first`);

const { frame } = v8.deserialize(fs.readFileSync(path.join(ROOT, 'v2', 'out', 'frames', 'frame-799224-30-40000-290.bin')));
const simMesh = buildSimMesh(40000, 12345), pool = await TerrainPool.create(simMesh);
for (const c of [...ladderCells(simMesh.numCells, CELLS), CELLS]) terrainMesh(c);
// (`--pass <cells>`: a finish at those cells first, untimed, as Add detail's ladder runs one before — what the fast
// `climate` keeps its rounds from)
const PASS = Number(arg('--pass', 0));
if (PASS) await finishPlanet({ frame, simMesh, seed: 799224, cells: PASS, pool, fast: fastParts(FAST), climateOptions: CLIMATE });
const t0 = performance.now();
const fin = await finishPlanet({ frame, simMesh, seed: 799224, cells: CELLS, pool, closePool: true, fast: fastParts(FAST), climateOptions: CLIMATE });
const secs = (performance.now() - t0) / 1000;

// (what is compared: the ground, the sea, the rivers' drainage, the lakes, the climate the cells end with)
const keep = { z: fin.z, ocean: fin.ocean, area: fin.drain.area, lakeLevel: fin.lakeLevel, koppen: fin.climate.cell.koppen,
    tAnnual: fin.climate.cell.tAnnual, pAnnual: fin.climate.cell.pAnnual, secs, ms: fin.ms };
const stages = Object.entries(fin.ms).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(' · ');
if (SAVE) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${SAVE}-${CELLS}.bin`), v8.serialize(keep)); }
if (REF) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(refFile, v8.serialize(keep));
    console.log(`reference written: ${path.relative(ROOT, refFile)} · finish ${secs.toFixed(1)} s · ${stages}`);
    process.exit(0);
}
const ref = v8.deserialize(fs.readFileSync(refFile));
const rows = compareFinishes(fin.mesh, ref, keep);
let bad = 0;
for (const r of rows) {
    const ok = r.max != null ? r.value <= r.max : r.value >= r.min;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'OUT '} ${r.name.padEnd(34)} ${r.value.toFixed(4).padStart(10)}  (${r.max != null ? '≤ ' + r.max : '≥ ' + r.min})`);
}
console.log(`fast ${[...fastParts(FAST)].join(',')} · finish ${secs.toFixed(1)} s against ${ref.secs.toFixed(1)} s exact · ${stages}`);
console.log(bad ? `${bad} measure(s) out of their limits` : `similar: all ${rows.length} measures within their limits (${Object.keys(LIMITS).length} limits)`);
process.exit(bad ? 1 : 0);
