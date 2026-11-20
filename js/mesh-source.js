// Generate's and Import's meshes, built ahead on their own thread (js/mesh-worker.js): the Detail ladder's steps
// (js/detail-ladder.js) asked for all at once, so each next mesh is triangulated while the planet worker draws the
// ground on the one before. Without that thread (it failed to start or broke), each mesh is built here, as before.

import { makeRng } from './rng.js';
import { buildSphere, SphereMesh } from './sphere-mesh.js';

let worker = null, nextId = 0;
const waiting = new Map();
function meshWorker() {
    if (worker) return worker;
    try { worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' }); } catch { return null; }
    worker.onmessage = ({ data }) => {
        const w = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error) w.reject(new Error(data.error)); else w.resolve({ mesh: SphereMesh.fromParts(data.parts), r_xyz: data.r_xyz });
    };
    worker.onerror = (e) => { for (const w of waiting.values()) w.reject(new Error(e.message)); waiting.clear(); worker.terminate(); worker = null; };
    return worker;
}
meshWorker();                                                   // (started with the planet worker: ready by the first Generate)

/** The meshes at Details `ns`, as buildSphere(N, jitter, makeRng(seed)) makes them: a promise each, built in order. */
export function meshesFor(ns, jitter, seed) {
    const here = (N) => () => buildSphere(N, jitter, makeRng(seed));
    return ns.map(N => {
        const w = meshWorker();
        if (!w) return Promise.resolve().then(here(N));
        const id = nextId++;
        return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); w.postMessage({ id, N, jitter, seed }); }).catch(here(N));
    });
}
