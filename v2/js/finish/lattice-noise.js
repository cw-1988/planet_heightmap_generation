// The fine detail's lattice noises: a hash of a lattice point; a smooth noise on a jittered lattice; bumps. (The phacelle
// stripes that steered ridges, gullies and dunes are gone, 2026-11-18: up close they drew swirls and noodles.) Each
// lattice point sits in the middle half of its cell and reaches KR cells, so every point within reach of p is in the 27
// cells about p's: all are smooth everywhere (visiting only the 8 corners about p, they jumped at the cells' faces —
// dashes along the parallels and meridians; the simplex noise's kernels overran its simplices the same way).

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function hash3(x, y, z, s) {
    let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ s;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
}
const mixHash = h => { h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return (h ^ (h >>> 16)) >>> 0; };
const KR = 1.25, KR2 = KR * KR;
/** The nearest a lattice point of the cell offset o (−1, 0, 1) from p's can lie from p along one axis (f p's coordinate, c that cell's). */
const near = (o, f, c) => (o < 0 ? f - c - 0.75 : o > 0 ? c + 0.25 - f : 0);

/**
 * The tallest of the bumps about p (lattice units: one site a cell, each placed, sized and raised by its hash) — each 1
 * at its centre … 0 at its rim, (1 − r^a)^b across (r: the distance over its radius, rMin…rMax of a cell, ≤ 0.45: every
 * site in reach is in the 27 cells about p's); a site stands where its draw is under `density`, fading in as the density
 * passes it — so a field of them thins out smoothly. 0 where none reaches. (The max of continuous bumps: no seams.)
 */
export function bumps(fx, fy, fz, s, density, rMin, rMax, a, b) {
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 0;
    for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox, cy = iy + oy, cz = iz + oz, h = hash3(cx, cy, cz, s), h2 = mixHash(h), u = (h2 & 1023) / 1023;
        if (u >= density) continue;
        const size = rMin + (rMax - rMin) * ((h2 >>> 10) & 1023) / 1023;
        const dx = fx - cx - 0.25 - 0.5 * (h & 1023) / 1023, dy = fy - cy - 0.25 - 0.5 * ((h >>> 10) & 1023) / 1023, dz = fz - cz - 0.25 - 0.5 * ((h >>> 20) & 1023) / 1023;
        const r2 = (dx * dx + dy * dy + dz * dz) / (size * size);
        if (r2 >= 1) continue;
        const v = smooth(u, u + 0.15, density) * (0.6 + 0.8 * ((h2 >>> 20) & 1023) / 1023) * (1 - r2 ** (0.5 * a)) ** b;
        if (v > best) best = v;
    }
    return best;
}

/** Smooth noise at p (lattice units: one feature a cell), about −1 … 1: each lattice point's random slope, faded out by its kernel. */
export function smoothNoise(fx, fy, fz, s) {
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let v = 0;
    for (let oz = -1; oz <= 1; oz++) {
        const cz = iz + oz, ez = near(oz, fz, cz), ez2 = ez * ez;
        for (let oy = -1; oy <= 1; oy++) {
            const cy = iy + oy, ey = near(oy, fy, cy), eyz = ey * ey + ez2;
            if (eyz >= KR2) continue;
            for (let ox = -1; ox <= 1; ox++) {
                const cx = ix + ox, ex = near(ox, fx, cx);
                if (ex * ex + eyz >= KR2) continue;
                const h = hash3(cx, cy, cz, s), h2 = mixHash(h);
                const dx = fx - cx - 0.25 - 0.5 * (h & 1023) / 1023, dy = fy - cy - 0.25 - 0.5 * ((h >>> 10) & 1023) / 1023, dz = fz - cz - 0.25 - 0.5 * ((h >>> 20) & 1023) / 1023;
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 >= KR2) continue;
                const w = (1 - r2 / KR2) ** 2;
                v += w * (((h2 & 255) - 127.5) * dx + (((h2 >>> 8) & 255) - 127.5) * dy + (((h2 >>> 16) & 255) - 127.5) * dz);
            }
        }
    }
    return v * NOISE_K;
}
const NOISE_K = 1 / 100;     // (scales smoothNoise to about the simplex noise's spread: σ ≈ 0.42)
