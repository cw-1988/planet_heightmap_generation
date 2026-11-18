// Terrain brushes (fork addition): strokes of stamps on the terrain mesh (Evolution's z-up frame, unit sphere), each
// stamp a cosine-falloff cap. Strokes are kept as world-space stamps, not per-cell deltas, so they replay onto any
// Detail (a Rebuild, a Reapply, a plate edit): the worker replays them after every ground it draws, the page applies
// the newest stroke at once as a preview.
//
// Stroke: { mode: 'raise'|'lower'|'smooth'|'flatten', rKm, km, target, stamps: [[x, y, z], …] }
//   rKm: the stamp's radius; km: raise/lower per stamp at its centre (smooth/flatten: 0…1, the pull per stamp);
//   target: flatten's height (km), read where the stroke began.

const R_KM = 6371;

/** The cells a stroke can reach: those within its widest stamp's radius of any stamp (a cap around the stroke). */
function reach(stroke, xyz, n) {
    const s = stroke.stamps, cx = [0, 0, 0];
    for (const p of s) { cx[0] += p[0]; cx[1] += p[1]; cx[2] += p[2]; }
    const len = Math.hypot(cx[0], cx[1], cx[2]) || 1;
    cx[0] /= len; cx[1] /= len; cx[2] /= len;
    let spread = 0;
    for (const p of s) spread = Math.max(spread, Math.acos(Math.min(1, p[0] * cx[0] + p[1] * cx[1] + p[2] * cx[2])));
    const cosCap = Math.cos(Math.min(Math.PI, spread + stroke.rKm / R_KM));
    const out = [];
    for (let r = 0; r < n; r++) if (xyz[3 * r] * cx[0] + xyz[3 * r + 1] * cx[1] + xyz[3 * r + 2] * cx[2] >= cosCap) out.push(r);
    return Int32Array.from(out);
}

/**
 * One stroke onto heights `h` (km per cell of the mesh {numCells, xyz, adjOffset, adjList}); `also` (optional, same
 * length) gets the same change — the uncarved surface the finish starts from.
 */
export function applyStroke(stroke, mesh, h, also = null) {
    const { xyz, adjOffset, adjList } = mesh, cand = reach(stroke, xyz, mesh.numCells);
    const rad = stroke.rKm / R_KM, cosR = Math.cos(rad), w = new Float32Array(cand.length), next = new Float32Array(cand.length);
    for (const p of stroke.stamps) {
        // the falloff of this stamp at each cell it reaches
        let any = false;
        for (let i = 0; i < cand.length; i++) {
            const r = cand[i], d = xyz[3 * r] * p[0] + xyz[3 * r + 1] * p[1] + xyz[3 * r + 2] * p[2];
            if (d < cosR) { w[i] = 0; continue; }
            const a = Math.acos(Math.min(1, d)) / rad;
            w[i] = 0.5 * (1 + Math.cos(Math.PI * a)); any = true;
        }
        if (!any) continue;
        for (let i = 0; i < cand.length; i++) {
            const r = cand[i], f = w[i];
            if (!f) { next[i] = h[r]; continue; }
            if (stroke.mode === 'raise') next[i] = h[r] + stroke.km * f;
            else if (stroke.mode === 'lower') next[i] = h[r] - stroke.km * f;
            else if (stroke.mode === 'flatten') next[i] = h[r] + (stroke.target - h[r]) * stroke.km * f;
            else {                                                       // smooth: towards the neighbours' mean
                let sum = 0, k = 0;
                for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) { sum += h[adjList[j]]; k++; }
                next[i] = k ? h[r] + (sum / k - h[r]) * stroke.km * f : h[r];
            }
        }
        for (let i = 0; i < cand.length; i++) {
            const r = cand[i], dh = next[i] - h[r];
            if (!dh) continue;
            h[r] = next[i];
            if (also && also !== h) also[r] += dh;
        }
    }
}

/** Unit-sphere point (z-up) of a texture place [u, v], as PlanetView.cellUnder reads it. */
export function pointAt([u, v]) {
    const lon = u * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - v * Math.PI;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** Arc between two unit points, in km. */
export const arcKm = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * R_KM;
