// The deposits alone (geology/deposits.js), on inputs a Generate build wrote out
// (bench-generate-memory.mjs --dump-deposits): how long they take, and a hash of everything they return — so a speed-up
// can show it changes nothing.
//
//   node v2/tools/bench-deposits.mjs v2/out/dep/in-2560000.bin [--workers 0: one thread | n]
//   OROGEN_SHARED=1 …  (memory shared, as the isolated page has it)

import fs from 'node:fs';
import v8 from 'node:v8';
import crypto from 'node:crypto';
import * as now from '../js/geology/deposits.js';
import { LatLonGrid } from '../js/finish/finish-grid.js';
import { meshFromArrays } from '../js/core/sim-mesh.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const file = process.argv[2], W = arg('--workers', null);
// (--base FILE: another deposits.js beside the geology — a copy of the code before a change — on one thread)
const { depositFields, depositFieldsOnWorkers } = arg('--base', null) ? await import(new URL(`../js/geology/${arg('--base')}`, import.meta.url)) : now;
const I = v8.deserialize(fs.readFileSync(file));
const o = { ...I, simMesh: meshFromArrays(I.simMesh), on: { grid: new LatLonGrid(I.on.gridStep), lat: I.on.lat, lon: I.on.lon } };
const t = performance.now();
const Dp = W === '0' || arg('--base', null) ? depositFields(o) : await depositFieldsOnWorkers(o, undefined, { workers: W === null ? null : Number(W) });
const ms = performance.now() - t;
const h = a => crypto.createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 12);
for (const [k, v] of Object.entries(Dp)) console.log(`${k} ${ArrayBuffer.isView(v) ? h(v) : v}`);
console.error(`${I.mesh.numCells.toLocaleString()} cells: deposits ${(ms / 1000).toFixed(2)} s`);
process.exit(0);
