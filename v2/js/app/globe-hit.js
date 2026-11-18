// (fork addition) The texture's UV where a ray meets the globe as it is drawn. The globe is a SphereGeometry of flat
// triangles (128 × 64); the shader reads each pixel at its point on the triangle pushed out to the sphere
// (globe-view.js: normalize(vSphere)). The ray's own hit on the unit sphere lies further along the ray than the
// triangle's, so seen at a slant it is another place: off by up to ~1 texel of the zoomed tiles (−1.05 measured at
// 32,768 px round the planet), and a place picked there was not the place drawn under the pointer (the region pick's
// coast a pixel off the tint). Only the triangles round the sphere's hit are tried: microseconds, not all 16,384.
import * as THREE from 'three';

const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3();
const R = new THREE.Ray(), INV = new THREE.Matrix4();

/** The point (mesh space, on the unit sphere) the shader draws where `ray` meets `mesh`'s triangles near `p`, the ray's
 *  hit on the unit sphere (world space); null if none of them is met. */
export function drawnPointAt(mesh, ray, p) {
    const g = mesh.geometry, { widthSegments: nx, heightSegments: ny } = g.parameters, pos = g.attributes.position;
    INV.copy(mesh.matrixWorld).invert();
    R.copy(ray).applyMatrix4(INV);
    P.copy(p).applyMatrix4(INV).normalize();
    const phi = Math.atan2(P.z, -P.x), theta = Math.acos(Math.max(-1, Math.min(1, P.y)));
    const ix0 = Math.floor((phi < 0 ? phi + 2 * Math.PI : phi) / (2 * Math.PI) * nx), iy0 = Math.floor(theta / Math.PI * ny);
    let best = Infinity, out = null;
    for (let dy = -1; dy <= 1; dy++) {
        const iy = iy0 + dy;
        if (iy < 0 || iy >= ny) continue;
        for (let dx = -1; dx <= 1; dx++) {
            const ix = (((ix0 + dx) % nx) + nx) % nx, a = iy * (nx + 1) + ix + 1, b = iy * (nx + 1) + ix, c = b + nx + 1, d = c + 1;
            for (const [i, j, k] of [[a, b, d], [b, c, d]]) {
                A.fromBufferAttribute(pos, i); B.fromBufferAttribute(pos, j); C.fromBufferAttribute(pos, k);
                if (!R.intersectTriangle(A, B, C, false, P)) continue;
                const e = R.origin.distanceToSquared(P);
                if (e < best) { best = e; out = (out ?? new THREE.Vector3()).copy(P).normalize(); }
            }
        }
    }
    return out;
}
