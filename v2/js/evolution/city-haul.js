// City size's haul by water (fork addition): the other half of city-view.js, the people a city could be fed from by boat.
// Medieval grain went a day or two by cart, but far by water. For the same distance, carrying it cost about 1 by sea,
// 4–6 by river and 20–40 by road (the usual rule of thumb). London c. 1300 drew its grain ~15–30 km by road but ~100 km
// up the Thames. So the reach is a budget of cart-km: a km by river costs HAUL.river of it, by lake HAUL.lake, by sea
// HAUL.sea.
//
// How: a city carts to its nearest water (a chamfer distance over the grid, km), ships along the waterways (a coarser
// grid of the water, so the sea's reach spans about HAUL.seaCells cells: Dijkstra from each port), and the food is carted
// from its land to that land's own nearest water. Food counts when the three legs fit the budget together; the legs'
// leftovers are kept in HAUL.bins steps. city-view.js takes the larger of this and the land within the reach by cart
// alone (this one includes its own port's land, so nothing is counted twice).

const R = 6371;
/** The cost of a km by water, in cart-km; a river from navQ m³/s; the leftovers' steps; the sea's reach in coarse cells. */
export const HAUL = { sea: 0.05, lake: 0.1, river: 0.2, navQ: 50, bins: 8, seaCells: 8 };

/** Each cell of a grid `w` × `h`: 0 land, else its water's cost a km (sea, lake, or a river of navQ m³/s or more). */
function waterCells(fin, w, h) {
    const P = fin.raster, hw = P.w, hh = P.h ?? Math.round(P.ocean.length / hw), kind = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        const py = Math.min(hh - 1, Math.floor((y + 0.5) / h * hh)) * hw;
        for (let x = 0; x < w; x++) {
            const p = py + Math.min(hw - 1, Math.floor((x + 0.5) / w * hw));
            if (P.ocean[p]) kind[y * w + x] = HAUL.sea; else if (P.water?.[p] === 1) kind[y * w + x] = HAUL.lake;
        }
    }
    const V = fin.rivers;
    if (!V) return kind;
    const { start, lat, lon, q } = V, starts = [...start, lat.length];
    for (let s = 0; s < starts.length - 1; s++) for (let i = starts[s]; i < starts[s + 1] - 1; i++) {
        if (!(q[i] >= HAUL.navQ)) continue;
        const x0 = (lon[i] + 180) / 360 * w, y0 = (90 - lat[i]) / 180 * h, x1 = (lon[i + 1] + 180) / 360 * w, y1 = (90 - lat[i + 1]) / 180 * h;
        if (Math.abs(x1 - x0) > w / 2) continue;
        const n = Math.ceil(2 * Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
        for (let t = 0; t <= n; t++) {
            const x = ((Math.floor(x0 + (x1 - x0) * t / n) % w) + w) % w, y = Math.min(h - 1, Math.max(0, Math.floor(y0 + (y1 - y0) * t / n)));
            if (!kind[y * w + x]) kind[y * w + x] = HAUL.river;
        }
    }
    return kind;
}

/** Each cell's km by cart to its nearest water, and that water's cell (-1 with none): two rounds of a chamfer pass each
 *  way, round the world east–west. */
function cartToWater(kind, w, h) {
    const n = w * h, d = new Float32Array(n).fill(Infinity), port = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (kind[i]) { d[i] = 0; port[i] = i; }
    const ns = Math.PI * R / h, ew = new Float64Array(h), dg = new Float64Array(h);
    for (let y = 0; y < h; y++) {
        ew[y] = 2 * Math.PI * R / w * Math.cos(Math.PI / 2 - (y + 0.5) * Math.PI / h);
        dg[y] = y ? Math.hypot((ew[y] + ew[y - 1]) / 2, ns) : 0;    // (row y to row y − 1, diagonally)
    }
    const relax = (i, j, len) => { const v = d[j] + len; if (v < d[i]) { d[i] = v; port[i] = port[j]; } };
    for (let round = 0; round < 2; round++) {
        for (let y = 0; y < h; y++) for (let x = 0, o = y * w; x < w; x++) {
            const i = o + x, l = (x + w - 1) % w, r = (x + 1) % w;
            relax(i, o + l, ew[y]);
            if (y) { relax(i, i - w, ns); relax(i, o - w + l, dg[y]); relax(i, o - w + r, dg[y]); }
        }
        for (let y = h - 1; y >= 0; y--) for (let x = w - 1, o = y * w; x >= 0; x--) {
            const i = o + x, l = (x + w - 1) % w, r = (x + 1) % w;
            relax(i, o + r, ew[y]);
            if (y < h - 1) { relax(i, i + w, ns); relax(i, o + w + r, dg[y + 1]); relax(i, o + w + l, dg[y + 1]); }
        }
    }
    return { d, port };
}

/** A binary heap of (node, cost), the cheapest first. */
function heap() {
    const node = [], cost = [];
    return {
        get size() { return node.length; },
        push(a, c) {
            let i = node.length; node.push(a); cost.push(c);
            while (i) { const p = (i - 1) >> 1; if (cost[p] <= c) break; node[i] = node[p]; cost[i] = cost[p]; i = p; }
            node[i] = a; cost[i] = c;
        },
        pop(out) {
            out[0] = node[0]; out[1] = cost[0];
            const a = node.pop(), c = cost.pop(), n = node.length;
            if (!n) return out;
            let i = 0;
            for (;;) {
                let k = 2 * i + 1;
                if (k >= n) break;
                if (k + 1 < n && cost[k + 1] < cost[k]) k++;
                if (cost[k] >= c) break;
                node[i] = node[k]; cost[i] = cost[k]; i = k;
            }
            node[i] = a; cost[i] = c;
            return out;
        },
    };
}

/**
 * The people each cell of the grid `G` ({ w, h, mass: each cell's people }) could be fed from within the reach `B`
 * (cart-km), by cart to water, boat, and cart again; and each cell's cart-km to its nearest water. `{ sum, d }`, or
 * null without the sea's map.
 */
export function waterHaul(fin, G, B) {
    if (!fin.raster?.ocean || !fin.raster.w) return null;
    const { w, h, mass } = G, n = w * h, K = HAUL.bins, K1 = K + 1, step = B / K;
    const kind = waterCells(fin, w, h), { d, port } = cartToWater(kind, w, h);
    // the waterways' grid: g cells a side, so the sea's reach (B / HAUL.sea) spans about HAUL.seaCells of them; a cell
    // with any water is water, at its cheapest water's cost
    const rowKm = Math.PI * R / h;
    let g = 1;
    while (w % (2 * g) === 0 && h % (2 * g) === 0 && g * rowKm * HAUL.seaCells < B / HAUL.sea) g *= 2;
    const cw = w / g, ch = h / g, cn = cw * ch, cf = new Float32Array(cn), coarse = i => Math.floor(Math.floor(i / w) / g) * cw + Math.floor((i % w) / g);
    for (let i = 0; i < n; i++) if (kind[i]) { const c = coarse(i); if (!cf[c] || kind[i] < cf[c]) cf[c] = kind[i]; }
    // each port's food: the people carted to it within each step of the budget (running totals)
    const sup = new Float64Array(cn * K1), used = new Uint8Array(cn), cport = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        if (!(d[i] <= B) || kind[i] === HAUL.sea || kind[i] === HAUL.lake) continue;     // (the land's cells only: a river's are land)
        const c = coarse(port[i]);
        cport[i] = c; used[c] = 1;
        if (mass[i] > 0) sup[c * K1 + Math.min(K, Math.ceil(d[i] / step - 1e-9))] += mass[i];
    }
    for (let c = 0; c < cn; c++) if (cf[c]) for (let k = 1; k < K1; k++) sup[c * K1 + k] += sup[c * K1 + k - 1];
    // from each port, by boat: the food of every port within each step of the budget
    const V = new Float64Array(cn * K1), dist = new Float64Array(cn).fill(Infinity), seen = [], Q = heap(), top = [0, 0];
    const ns = Math.PI * R / ch, ew = new Float64Array(ch);
    for (let y = 0; y < ch; y++) ew[y] = 2 * Math.PI * R / cw * Math.cos(Math.PI / 2 - (y + 0.5) * Math.PI / ch);
    for (let P = 0; P < cn; P++) {
        if (!used[P]) continue;
        dist[P] = 0; seen.push(P); Q.push(P, 0);
        while (Q.size) {
            const [a, W] = Q.pop(top);
            if (W > dist[a]) continue;
            for (let k = 0; k < K1; k++) { const r = k * step - W; if (r > -1e-9) V[P * K1 + k] += sup[a * K1 + Math.min(K, Math.floor(r / step + 1e-9))]; }
            const ax = a % cw, ay = (a - ax) / cw;
            for (let dy = -1; dy <= 1; dy++) {
                const by = ay + dy;
                if (by < 0 || by >= ch) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const b = by * cw + (ax + dx + cw) % cw;
                    if (!cf[b]) continue;
                    const len = !dy ? ew[ay] : !dx ? ns : Math.hypot((ew[ay] + ew[by]) / 2, ns), c = W + len * (cf[a] + cf[b]) / 2;
                    if (c > B || c >= dist[b]) continue;
                    if (dist[b] === Infinity) seen.push(b);
                    dist[b] = c; Q.push(b, c);
                }
            }
        }
        for (const s of seen) dist[s] = Infinity;
        seen.length = 0;
    }
    // each cell: its port's food with the budget its own cart leg leaves, read between the steps
    const sum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const c = cport[i];
        if (c < 0) continue;
        const t = (B - d[i]) / step, k0 = Math.min(K, Math.floor(t)), f = t - k0, v0 = V[c * K1 + k0];
        sum[i] = k0 < K ? v0 + f * (V[c * K1 + k0 + 1] - v0) : v0;
    }
    return { sum, d };
}
