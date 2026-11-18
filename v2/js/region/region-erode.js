// A region's erosion (fork addition): rivers cut their valleys into the ground region-relief.js made, round after round.
// Each round the ground drains (a priority flood with a sliver of slope across flats and pits, from the sea's shore and
// the box's edges; then each cell to its steepest neighbour downhill on that filled ground), the water gathers down the
// network (each cell's runoff from its rain and evaporation, and the planet's rivers coming in), the streams cut toward
// their receivers (stream power, implicit, so big rivers grade at once without overshooting), pits silt up halfway, and
// the slopes creep (diffusion). Nothing is cut deeper than half again the detail's height below the start, so the planet's
// own heights hold. The box's edges stay as they are: water leaves there.

const SQ2 = Math.SQRT2;
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], DL = [1, SQ2, 1, SQ2, 1, SQ2, 1, SQ2];
const EPS = 1e-3;          // (m: the slope laid across flats and pits)
/** Stream power's strength (F = KS · √Q, Q in m³/s), the creep's, and the share of a pit filled a round. */
export const ERODE = { KS: 0.3, creep: 0.12, silt: 0.5 };

/** The drainage's working arrays for an N × N grid, kept between rounds. */
export function drainage(N) {
    const n = N * N;
    return { N, filled: new Float64Array(n), rec: new Int32Array(n), order: new Int32Array(n), count: 0, closed: new Uint8Array(n),
        hi: new Int32Array(n), hk: new Float64Array(n), pit: new Int32Array(n), cnt: new Int32Array(n), Q: new Float32Array(n) };
}

/** Drain `h` (sea cells: sea[c]): filled, receivers (-1 at the box's edge; a sea cell for the shore), and the land's
 *  cells in order from the heads down (order[0 … count)). */
export function drain(h, sea, W) {
    const { N, filled, rec, order, closed, hi, hk, pit, cnt } = W, n = N * N;
    closed.fill(0); rec.fill(-1);
    let hn = 0, ph = 0, pt = 0;
    const push = (c, k) => {
        let i = hn++;
        while (i) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hi[i] = hi[p]; hk[i] = hk[p]; i = p; }
        hi[i] = c; hk[i] = k;
    };
    const pop = () => {
        const top = hi[0], c = hi[--hn], k = hk[hn];
        let i = 0;
        for (;;) {
            let m = 2 * i + 1;
            if (m >= hn) break;
            if (m + 1 < hn && hk[m + 1] < hk[m]) m++;
            if (hk[m] >= k) break;
            hi[i] = hi[m]; hk[i] = hk[m]; i = m;
        }
        if (hn) { hi[i] = c; hk[i] = k; }
        return top;
    };
    // the outlets: the sea, and the land along the box's edge or the shore
    for (let c = 0; c < n; c++) if (sea[c]) { closed[c] = 1; filled[c] = h[c]; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = j * N + i;
        if (sea[c]) continue;
        let out = i === 0 || j === 0 || i === N - 1 || j === N - 1 ? -2 : -1;
        if (out === -1) for (let d = 0; d < 8; d++) { const b = c + DY[d] * N + DX[d]; if (sea[b]) { out = b; break; } }
        if (out === -1) continue;
        closed[c] = 1; filled[c] = h[c]; rec[c] = out >= 0 ? out : -1; push(c, h[c]);
    }
    // the flood: the lowest open edge first; a neighbour no higher than it is lifted a sliver above and goes first
    while (hn || ph < pt) {
        const c = ph < pt ? pit[ph++] : pop(), i = c % N, j = (c - i) / N, f = filled[c];
        for (let d = 0; d < 8; d++) {
            const x = i + DX[d], y = j + DY[d];
            if (x < 0 || y < 0 || x >= N || y >= N) continue;
            const b = y * N + x;
            if (closed[b]) continue;
            closed[b] = 1; rec[b] = c;
            if (h[b] <= f + EPS) { filled[b] = f + EPS; pit[pt++] = b; } else { filled[b] = h[b]; push(b, h[b]); }
        }
    }
    // each inland cell to its steepest neighbour down the filled ground (its flood parent is always lower)
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const c = j * N + i;
        if (sea[c] || rec[c] < 0 || sea[rec[c]]) continue;
        let best = rec[c], bs = (filled[c] - filled[best]) / DL[dirOf(c, best, N)];
        for (let d = 0; d < 8; d++) {
            const b = c + DY[d] * N + DX[d], s = (filled[c] - filled[b]) / DL[d];
            if (s > bs) { bs = s; best = b; }
        }
        rec[c] = best;
    }
    // the order from the heads down: each cell once all that drains into it is done
    cnt.fill(0);
    for (let c = 0; c < n; c++) if (!sea[c] && rec[c] >= 0) cnt[rec[c]]++;
    let k = 0;
    for (let c = 0; c < n; c++) if (!sea[c] && !cnt[c]) order[k++] = c;
    for (let t = 0; t < k; t++) {
        const r = rec[order[t]];
        if (r >= 0 && !sea[r] && --cnt[r] === 0) order[k++] = r;
    }
    W.count = k;
    return W;
}
function dirOf(c, b, N) { const dx = (b % N) - (c % N), dy = Math.round((b - c - dx) / N); for (let d = 0; d < 8; d++) if (DX[d] === dx && DY[d] === dy) return d; return 0; }

/** The water each cell carries (m³/s): its own runoff, what drains into it, and the inflows ([cell, m³/s]). */
export function gather(W, runoff, inflow, sea) {
    const { Q, rec, order, count } = W;
    Q.set(runoff);
    for (const [c, q] of inflow) Q[c] += q;
    for (let t = 0; t < count; t++) { const c = order[t], r = rec[c]; if (r >= 0 && !sea[r]) Q[r] += Q[c]; }
    return Q;
}

/**
 * One round of erosion on `h`: streams cut (downstream first), pits silt up, slopes creep; never below `floor`. Planet
 * lakes (lakeP) are left as they are.
 */
export function erodeRound(h, W, sea, lakeP, floor) {
    const { N, Q, rec, order, count, filled } = W;
    for (let t = count - 1; t >= 0; t--) {
        const c = order[t], r = rec[c];
        if (r < 0 || lakeP[c] || filled[c] - h[c] > 0.01) continue;
        const hr = sea[r] ? 0 : h[r];
        if (h[c] <= hr) continue;
        const F = ERODE.KS * Math.sqrt(Q[c]), v = (h[c] + F * hr) / (1 + F);
        h[c] = v > floor[c] ? v : Math.min(h[c], floor[c]);
    }
    for (let c = 0; c < N * N; c++) if (!sea[c] && !lakeP[c]) { const d = filled[c] - h[c]; if (d > 0) h[c] += ERODE.silt * d; }
    // the creep: toward the four neighbours' mean, the box's edge held
    const old = Float32Array.from(h);
    for (let j = 1; j < N - 1; j++) for (let i = 1, c = j * N + 1; i < N - 1; i++, c++) {
        if (sea[c] || lakeP[c]) continue;
        const v = old[c] + ERODE.creep * ((old[c - 1] + old[c + 1] + old[c - N] + old[c + N]) / 4 - old[c]);
        h[c] = v > floor[c] ? v : Math.min(old[c], floor[c]);
    }
}

/** Each cell's runoff (m³/s) from its rain P (mm) and temperature T (°C): Pike's evaporation from the PET. */
export function runoffOf(P, T, sea, cellKm) {
    const n = P.length, out = new Float32Array(n), area = cellKm * cellKm * 1e6 / 31.557e6 / 1000;
    for (let c = 0; c < n; c++) {
        if (sea[c]) continue;
        const pet = Math.max(100, 300 + 55 * T[c]), p = P[c], e = p / Math.sqrt(1 + (p / pet) ** 2);
        out[c] = Math.max(0, p - e) * area;
    }
    return out;
}
