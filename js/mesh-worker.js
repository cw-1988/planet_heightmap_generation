// Generate's meshes built on a thread of their own (js/mesh-source.js): the Detail ladder's next mesh is triangulated
// here while the planet worker draws the ground on the one before. The same buildSphere, the same mesh, bit for bit.
// In: {id, N, jitter, seed}. Out: {id, parts, r_xyz} (SphereMesh.parts, sent as transfers) or {id, error}.

import { makeRng } from './rng.js';
import { setDelaunator, buildSphere } from './sphere-mesh.js';
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';

setDelaunator(Delaunator);

self.onmessage = ({ data: { id, N, jitter, seed } }) => {
    try {
        const { mesh, r_xyz } = buildSphere(N, jitter, makeRng(seed)), parts = mesh.parts();
        self.postMessage({ id, parts, r_xyz }, [...Object.values(parts).filter(ArrayBuffer.isView).map(a => a.buffer), r_xyz.buffer]);
    } catch (err) {
        self.postMessage({ id, error: String(err?.message ?? err) });
    }
};
