// A grid's broad shape: a box blur run twice along each axis (a tent, close to a Gaussian), each pixel the mean of the
// pixels its box holds on the grid — no padding, so a pixel at the edge is the mean of fewer. Used by the small lakes
// (small-lakes-draw.js pondsInWindow): a lake sits in the detail's broad swells, not in the picture's level under them.

/** f (w × h) blurred over a radius of r pixels (twice per axis); a new array. */
export function lowPass(f, w, h, r) {
    const out = Float32Array.from(f), tmp = new Float64Array(Math.max(w, h) + 1);
    for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < h; j++) line(out, j * w, 1, w, r, tmp);
        for (let i = 0; i < w; i++) line(out, i, w, h, r, tmp);
    }
    return out;
}

/** One line of n values from `start`, `step` apart, replaced by its box means (radius r), in place. */
function line(a, start, step, n, r, sum) {
    sum[0] = 0;
    for (let k = 0; k < n; k++) sum[k + 1] = sum[k] + a[start + k * step];
    for (let k = 0; k < n; k++) {
        const lo = Math.max(0, k - r), hi = Math.min(n, k + r + 1);
        a[start + k * step] = (sum[hi] - sum[lo]) / (hi - lo);
    }
}
