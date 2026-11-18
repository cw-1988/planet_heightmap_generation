// A region's rivers as lines (fork addition): its water's paths (Q, rec from region-wear.js) traced into polylines, each
// main stem whole from its mouth up its largest branch, and smoothed (Chaikin), so they read as rivers, not as steps
// from cell to cell. The same lines are drawn over the region and over its zoom tiles and are what a tile cuts its
// valleys along (region-tiles.js), so a river runs on unbroken where the finer ground begins.

/**
 * The rivers of `region` from `qFrom` m³/s: [{ x, y, q }] Float32Arrays, the points in the region's cells (a cell's
 * centre at +0.5) and the water there. A side branch begins one cell down its main stem (hidden under it), a river
 * ending in the sea or a lake at that cell's centre.
 */
export function riverLines(region, qFrom = 1) {
    const { frame: F, Q, rec, sea, lake } = region, N = F.n, n = N * N;
    const isR = (c) => c >= 0 && Q[c] >= qFrom && !sea[c] && lake[c] !== 1, main = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) {
        const r = rec[c];
        if (isR(c) && isR(r) && (main[r] < 0 || Q[c] > Q[main[r]])) main[r] = c;
    }
    const lines = [];
    for (let c = 0; c < n; c++) {
        const r = rec[c];
        if (!isR(c) || (isR(r) && main[r] === c)) continue;                       // (inside a line)
        const p = [], pt = (k, q) => p.push(k % N + 0.5, Math.floor(k / N) + 0.5, q);
        if (isR(r)) { if (isR(rec[r])) pt(rec[r], Q[rec[r]]); pt(r, Q[r]); }
        else if (r >= 0 && (sea[r] || lake[r] === 1)) pt(r, Q[c]);
        for (let k = c; k >= 0; k = main[k]) pt(k, Q[k]);
        if (p.length >= 6) lines.push(smoothOpen(p, 2));
    }
    return lines;
}

/** An open polyline [x, y, q, …] cut at its corners `n` times (Chaikin), its ends kept: { x, y, q }. */
function smoothOpen(p, n) {
    for (let r = 0; r < n; r++) {
        const L = p.length / 3, o = [p[0], p[1], p[2]];
        for (let k = 0; k < L - 1; k++) {
            const a = 3 * k, b = a + 3;
            for (const t of [0.25, 0.75]) o.push(p[a] + (p[b] - p[a]) * t, p[a + 1] + (p[b + 1] - p[a + 1]) * t, p[a + 2] + (p[b + 2] - p[a + 2]) * t);
        }
        o.push(p[p.length - 3], p[p.length - 2], p[p.length - 1]);
        p = o;
    }
    const L = p.length / 3, x = new Float32Array(L), y = new Float32Array(L), q = new Float32Array(L);
    for (let k = 0; k < L; k++) { x[k] = p[3 * k]; y[k] = p[3 * k + 1]; q[k] = p[3 * k + 2]; }
    return { x, y, q };
}

/** The lines' segments from `qMin` m³/s up, sorted into width classes (each four times the water of the last):
 *  [{ q: the class's least flow, seg: Float32Array (x0, y0, x1, y1, …) in cells }]. */
export function riverClasses(lines, qMin) {
    const classes = [1, 4, 16, 64, 256, 1024].map((k) => ({ q: qMin * k, seg: [] }));
    for (const { x, y, q } of lines) for (let k = 0; k < x.length - 1; k++) {
        const v = 0.5 * (q[k] + q[k + 1]);
        if (v < qMin) continue;
        const c = Math.min(classes.length - 1, Math.floor(Math.log(v / qMin) / Math.log(4)));
        classes[c].seg.push(x[k], y[k], x[k + 1], y[k + 1]);
    }
    return classes.map(({ q, seg }) => ({ q, seg: Float32Array.from(seg) }));
}
