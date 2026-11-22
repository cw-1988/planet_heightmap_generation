// Sphere mesh construction: Fibonacci sphere → Delaunay → close pole → SphereMesh.
// Adapted from Red Blob Games sphere-mesh.js.

let _Delaunator = null;
export function setDelaunator(D) { _Delaunator = D; }

// Fibonacci sphere with jitter — evenly-distributed points using the
// Fibonacci spiral. Jitter randomises positions for more organic Voronoi cells.
export function generateFibonacciSphere(N, jitter, rng) {
    const r_xyz = new Float32Array(3 * N);
    const s = 3.6 / Math.sqrt(N);
    const dlong = Math.PI * (3 - Math.sqrt(5));
    const dz = 2.0 / N;

    for (let k = 0, lng = 0, z = 1 - dz / 2; k < N; k++, z -= dz) {
        const r = Math.sqrt(1 - z * z);
        let latDeg = Math.asin(z) * 180 / Math.PI;
        let lonDeg = lng * 180 / Math.PI;

        if (jitter > 0) {
            const jLat = (rng() - rng());
            const jLon = (rng() - rng());
            const nextZ = Math.max(-1, z - dz * 2 * Math.PI * r / s);
            latDeg += jitter * jLat * (latDeg - Math.asin(nextZ) * 180 / Math.PI);
            lonDeg += jitter * jLon * (s / r * 180 / Math.PI);
        }

        const latR = latDeg * Math.PI / 180;
        const lonR = lonDeg * Math.PI / 180;
        r_xyz[3*k]   = Math.cos(latR) * Math.cos(lonR);
        r_xyz[3*k+1] = Math.cos(latR) * Math.sin(lonR);
        r_xyz[3*k+2] = Math.sin(latR);

        lng += dlong;
    }
    return r_xyz;
}

// Stereographic projection (for Delaunay on a sphere).
// Projects every point from the "north pole" (0,0,1) onto a plane.
export function stereographicProjection(r_xyz, N) {
    const flat = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) {
        const z = r_xyz[3*i+2];
        // Clamp denominator to prevent Infinity when a jittered point lands
        // on or near the projection pole (z ≈ 1). The exact projected position
        // doesn't matter for near-pole points — addPoleToMesh corrects connectivity.
        const denom = Math.max(1e-12, 1 - z);
        flat[2*i]   = r_xyz[3*i]   / denom;
        flat[2*i+1] = r_xyz[3*i+1] / denom;
    }
    return flat;
}

// Add pole back into mesh — close the mesh by connecting hull edges to the pole.
export function addPoleToMesh(poleId, triangles, halfedges) {
    const numSides = triangles.length;
    const next = s => (s % 3 === 2) ? s - 2 : s + 1;

    let numUnpaired = 0, firstUnpaired = -1;
    const pointToSide = [];
    for (let s = 0; s < numSides; s++) {
        if (halfedges[s] === -1) {
            numUnpaired++;
            pointToSide[triangles[s]] = s;
            firstUnpaired = s;
        }
    }

    const nt = new Int32Array(numSides + 3 * numUnpaired);
    const nh = new Int32Array(numSides + 3 * numUnpaired);
    nt.set(triangles);
    nh.set(halfedges);

    for (let i = 0, s = firstUnpaired;
         i < numUnpaired;
         i++, s = pointToSide[nt[next(s)]]) {
        const ns = numSides + 3 * i;
        nh[s] = ns;
        nh[ns] = s;
        nt[ns]     = nt[next(s)];
        nt[ns + 1] = nt[s];
        nt[ns + 2] = poleId;
        const k = numSides + (3 * i + 4) % (3 * numUnpaired);
        nh[ns + 2] = k;
        nh[k]      = ns + 2;
    }

    return { triangles: nt, halfedges: nh };
}

// The sphere's regions (Voronoi cells) and each one's neighbours, in order around it, read off Delaunator's triangles
// and half-edges. Only the neighbours are kept: nothing reads the triangles once these are built, and at 2.56M cells
// the triangles, the half-edges and the triangles around each region were ~190 MB the planet worker kept for no reader
// (docs/page-memory.md).
export class SphereMesh {
    constructor(triangles, halfedges, numRegions) {
        this.numRegions = numRegions;
        const numSides = triangles.length, next = s => (s % 3 === 2 ? s - 2 : s + 1);
        const r_s = new Int32Array(numRegions).fill(-1);              // (a side leaving each region)
        for (let s = 0; s < numSides; s++) if (r_s[triangles[s]] === -1) r_s[triangles[s]] = s;
        // flat adjacency lists (cache-friendly array reads instead of a half-edge walk per call)
        const adjOffset = new Int32Array(numRegions + 1);
        for (let r = 0; r < numRegions; r++) {
            let count = 0;
            const s0 = r_s[r];
            if (s0 !== -1) { let s = s0; do { count++; s = next(halfedges[s]); } while (s !== s0); }
            adjOffset[r + 1] = adjOffset[r] + count;
        }
        const adjList = new Int32Array(adjOffset[numRegions]);
        for (let r = 0; r < numRegions; r++) {
            const s0 = r_s[r];
            if (s0 === -1) continue;
            let s = s0, idx = adjOffset[r];
            do { adjList[idx++] = triangles[next(s)]; s = next(halfedges[s]); } while (s !== s0);
        }
        this.adjOffset = adjOffset;
        this.adjList = adjList;
    }

    /** Its arrays, to send to another thread (js/mesh-worker.js), and the mesh again from them, nothing worked out anew. */
    parts() { return { numRegions: this.numRegions, adjOffset: this.adjOffset, adjList: this.adjList }; }
    static fromParts(p) {
        return Object.assign(Object.create(SphereMesh.prototype), { numRegions: p.numRegions, adjOffset: p.adjOffset, adjList: p.adjList });
    }

    r_circulate_r(out, r) {
        const start = this.adjOffset[r], len = this.adjOffset[r + 1] - start;
        out.length = len;
        for (let i = 0; i < len; i++) out[i] = this.adjList[start + i];
        return out;
    }
}

// Build sphere — Fibonacci points → Delaunay → close pole.
export function buildSphere(N, jitter, rng) {
    const r_xyz = generateFibonacciSphere(N, jitter, rng);
    const flat = stereographicProjection(r_xyz, N);
    const delaunay = new _Delaunator(flat);

    const poleXYZ = new Float32Array(3 * (N + 1));
    poleXYZ.set(r_xyz);
    poleXYZ[3*N] = 0;  poleXYZ[3*N+1] = 0;  poleXYZ[3*N+2] = 1;

    const closed = addPoleToMesh(N, delaunay.triangles, delaunay.halfedges);
    const mesh = new SphereMesh(closed.triangles, closed.halfedges, N + 1);
    return { mesh, r_xyz: poleXYZ };
}

// Pre-compute Euclidean distance between each region and its neighbors.
// Indexed by the same adjacency slot as adjList: neighborDist[i] is the
// distance from region r to adjList[i] where adjOffset[r] <= i < adjOffset[r+1].
export function computeNeighborDist(mesh, r_xyz) {
    const { adjOffset, adjList } = mesh;
    const neighborDist = new Float32Array(adjList.length);
    for (let r = 0; r < mesh.numRegions; r++) {
        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        for (let i = adjOffset[r]; i < adjOffset[r+1]; i++) {
            const nb = adjList[i];
            const dx = x - r_xyz[3*nb], dy = y - r_xyz[3*nb+1], dz = z - r_xyz[3*nb+2];
            neighborDist[i] = Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
    }
    return neighborDist;
}
