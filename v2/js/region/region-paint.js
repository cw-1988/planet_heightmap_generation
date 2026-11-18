// A region's pictures (fork addition): the ground as an image one pixel a cell — the Satellite look (the planet's colour
// from space at that place, lit by the region's own relief) or Relief (height bands, lit the same) — the sea by its
// depth, lakes, dry pans; and its rivers as lines, from a chosen flow up, each segment as wide as its water.

import { placeAt } from './region-frame.js';

const SEA = [[0, [88, 140, 170]], [-200, [52, 102, 146]], [-2000, [24, 58, 104]], [-6000, [10, 28, 64]]];
const RELIEF = [[0, [112, 150, 96]], [300, [168, 182, 118]], [800, [206, 190, 136]], [1600, [178, 140, 100]], [2600, [150, 128, 116]], [3800, [236, 236, 240]]];
const LAKE = [70, 122, 160], PAN = [214, 204, 178], SNOW = [238, 240, 245];

function ramp(stops, v, out) {
    const up = stops[1][0] > stops[0][0];
    let k = 0;
    while (k < stops.length - 2 && (up ? v > stops[k + 1][0] : v < stops[k + 1][0])) k++;
    const [a, A] = stops[k], [b, B] = stops[k + 1], t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let c = 0; c < 3; c++) out[c] = A[c] + (B[c] - A[c]) * t;
    return out;
}

/** The ground's image (ImageData-sized RGBA, N × N): look 'satellite' or 'relief'; outside the pieces and their border
 *  (mask 0) greyed. */
export function paintGround(region, look, mask) {
    const { frame: F, h, sea, lake, rgb, T } = region, N = F.n, px = new Uint8ClampedArray(4 * N * N), dx = F.cellKm * 1000;
    // (the light from the north-west, 45° up; the relief drawn taller the coarser the cells, as a map's hillshade is)
    const col = [0, 0, 0], lx = -0.5, ly = 0.5, lz = Math.SQRT1_2, ex = 3 * Math.sqrt(Math.max(0.25, F.cellKm));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = j * N + i, o = 4 * c;
        if (sea[c]) ramp(SEA, h[c], col);
        else if (lake[c] === 1) { col[0] = LAKE[0]; col[1] = LAKE[1]; col[2] = LAKE[2]; }
        else {
            if (lake[c] === 2) { col[0] = PAN[0]; col[1] = PAN[1]; col[2] = PAN[2]; }
            else if (look === 'relief') ramp(RELIEF, h[c], col);
            else {
                // (the colour from space; snow where the detail rises colder than the planet's pixel knew, eased in)
                const sn = Math.min(1, Math.max(0, (-4 - T[c]) / 6)) * 0.85;
                for (let q = 0; q < 3; q++) col[q] = rgb[3 * c + q] + (SNOW[q] - rgb[3 * c + q]) * sn;
            }
            const e = h[c], gx = ((i < N - 1 ? h[c + 1] : e) - (i > 0 ? h[c - 1] : e)) / (2 * dx) * ex, gy = ((j > 0 ? h[c - N] : e) - (j < N - 1 ? h[c + N] : e)) / (2 * dx) * ex;
            const s = Math.max(0, (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1)), k = 0.45 + 0.8 * s;
            for (let q = 0; q < 3; q++) col[q] *= k;
        }
        const out = mask ? mask.beyond(i, j) : 0;                                         // (0 inside the border … 1 a cell past it)
        if (out > 0) { const g = (col[0] + col[1] + col[2]) / 3; for (let q = 0; q < 3; q++) col[q] += (0.45 * (0.5 * col[q] + 0.5 * g) + 40 - col[q]) * out; }
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
    return new ImageData(px, N, N);
}

/** The rivers from `qMin` m³/s up, as line segments in cells (x0, y0, x1, y1) sorted into width classes:
 *  [{ q: the class's least flow, seg: Float32Array }]. */
export function riverSegments(region, qMin) {
    const { frame: F, Q, rec, sea, lake } = region, N = F.n, n = N * N, isRiver = (c) => Q[c] >= qMin && !sea[c] && lake[c] !== 1;
    const classes = [qMin, qMin * 4, qMin * 16, qMin * 64, qMin * 256, qMin * 1024].map((q) => ({ q, seg: [] }));
    for (let c = 0; c < n; c++) {
        if (!isRiver(c)) continue;
        const r = rec[c];
        if (r < 0) continue;
        let k = 0;
        while (k < classes.length - 1 && Q[c] >= classes[k + 1].q) k++;
        classes[k].seg.push(c % N + 0.5, Math.floor(c / N) + 0.5, r % N + 0.5, Math.floor(r / N) + 0.5);
    }
    return classes.map(({ q, seg }) => ({ q, seg: Float32Array.from(seg) }));
}

/** The pieces' outline on the mask's grid, as segments in cells. */
export function maskOutline(mask, N) {
    if (!mask) return new Float32Array(0);
    const { m, on } = mask, s = N / m, seg = [];
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
        const a = on[y * m + x] === 2;
        if (x < m - 1 && a !== (on[y * m + x + 1] === 2)) seg.push((x + 1) * s, y * s, (x + 1) * s, (y + 1) * s);
        if (y < m - 1 && a !== (on[(y + 1) * m + x] === 2)) seg.push(x * s, (y + 1) * s, (x + 1) * s, (y + 1) * s);
    }
    return Float32Array.from(seg);
}

/** The readout's lines at cell (i, j). */
export function regionLines(region, i, j, mask) {
    const { frame: F, h, sea, lake, level, Q, T, P } = region, N = F.n;
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    const c = j * N + i, ll = placeAt(F, (i + 0.5) * F.cellKm - F.km / 2, F.km / 2 - (j + 0.5) * F.cellKm), dx = F.cellKm * 1000;
    const gx = (h[Math.min(c + 1, c - i + N - 1)] - h[Math.max(c - 1, c - i)]) / (2 * dx), gy = (h[Math.min(c + N, N * N - 1)] - h[Math.max(c - N, 0)]) / (2 * dx);
    const slope = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI;
    const where = sea[c] ? `Sea, ${Math.round(-h[c])} m deep` : lake[c] === 1 ? `Lake, its surface at ${Math.round(level[c])} m` : lake[c] === 2 ? `Dry pan at ${Math.round(h[c])} m`
        : `<b>${Math.round(h[c])} m</b> · slope ${slope.toFixed(1)}°`;
    const lines = [where];
    if (!sea[c] && Q[c] >= 0.5) lines.push(`<span class="hi-label">Water</span> ${Q[c] >= 10 ? Math.round(Q[c]) : Q[c].toFixed(1)} m³/s`);
    lines.push(`<span class="hi-label">Climate</span> ${T[c].toFixed(1)} °C a year · ${Math.round(P[c])} mm`);
    const part = mask ? ['outside the border', 'in the border', 'in the chosen pieces'][mask.at(i, j)] : '';
    lines.push(`${Math.abs(ll[0]).toFixed(2)}° ${ll[0] >= 0 ? 'N' : 'S'}, ${Math.abs(ll[1]).toFixed(2)}° ${ll[1] >= 0 ? 'E' : 'W'}${part ? ` · ${part}` : ''}`);
    return lines;
}
