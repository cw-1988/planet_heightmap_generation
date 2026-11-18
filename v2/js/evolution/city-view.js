// City size (fork addition): how many people a city at each place could live on — the people the land within its
// reach could feed (the People view's a km², farming-view.js peopleGrid, summed over the disc of that radius around it).
// A heat map on a log scale, from the richest place's count down ten-thousandfold. The reach (km) is the Food row's
// slider, or Shift+scroll over the planet (view/planet-view.js), kept in farmOptions.reach.
//
// The sum: the people of the farming picture summed into a grid coarse enough that the disc spans a few dozen rows at
// most (a reach of 1000 km on 20 km pixels would be slow), each row's running total read at fractions of a pixel, the
// disc cut into thin strips of latitude, each as wide as the circle is there — so even a reach smaller than a pixel
// sums its own area, not the pixel's.
import { farmOptions, farmOptionsKey, peopleGrid, ramp } from './farming-view.js';

const R = 6371;
/** The slider's range (km): from a walk to market to a river-and-sea empire's grain. */
export const CITY_REACH = { min: 5, max: 1000, step: 5 };
const SPAN = 4;            // (decades the colours span, below the richest place's count)
// pale where few could be fed, through straw and orange to red and a deep wine where the most
const HEAT = [[0, [216, 210, 198]], [0.3, [238, 214, 130]], [0.55, [236, 150, 60]], [0.8, [200, 56, 44]], [1, [100, 16, 48]]];

const cache = new WeakMap();
/** The people within reach of each cell of a grid `w` × `h` (as coarse as the reach allows): { w, h, sum, most } — per
 *  finished moment, options and reach. */
export function cityGrid(fin) {
    const F = fin.raster.farming, key = farmOptionsKey(), kept = cache.get(F);
    if (kept?.key === key) return kept;
    const dens = peopleGrid(fin), reach = farmOptions.reach, rowKmF = Math.PI * R / F.h;
    // (b: F's pixels to a cell a side — a power of two dividing the picture, the cells no finer than a sixth of the
    // reach, nor the grid wider than 2048)
    let b = 1;
    while (F.w % (2 * b) === 0 && F.h % (2 * b) === 0 && (2 * b * rowKmF <= reach / 6 || F.w / b > 2048)) b *= 2;
    const w = F.w / b, h = F.h / b, rowRad = Math.PI / h, cellRad = 2 * Math.PI / w;
    // the people each cell's land could feed: a km² × its area
    const mass = new Float64Array(w * h), dl = 2 * Math.PI / F.w, dt = Math.PI / F.h;
    for (let y = 0; y < F.h; y++) {
        const top = Math.PI / 2 - y * dt, area = R * R * dl * (Math.sin(top) - Math.sin(top - dt)), row = Math.floor(y / b) * w;
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) if (dens[i] > 0) mass[row + Math.floor(x / b)] += dens[i] * area;
    }
    // each row's running total (w + 1 a row), read at a fraction t of a cell, round the world as often as it goes
    const pre = new Float64Array(h * (w + 1));
    for (let y = 0; y < h; y++) for (let x = 0, o = y * (w + 1); x < w; x++) pre[o + x + 1] = pre[o + x] + mass[y * w + x];
    const at = (o, t) => { const n = Math.floor(t / w), r = t - n * w, i = Math.min(w - 1, Math.floor(r)); return n * pre[o + w] + pre[o + i] + (r - i) * (pre[o + i + 1] - pre[o + i]); };
    const d = reach / R, n = Math.max(8, 2 * Math.ceil(2 * d / rowRad)), ds = 2 * d / n, wt = ds / rowRad, cd = Math.cos(d);
    const sum = new Float32Array(w * h), rows = new Int32Array(n), half = new Float64Array(n);
    let most = 0;
    for (let y = 0; y < h; y++) {
        const phi = Math.PI / 2 - (y + 0.5) * rowRad, sp = Math.sin(phi), cp = Math.cos(phi);
        // (the strips: each one's row and how far round it the circle reaches either side, in cells — the whole row past a pole)
        let m = 0;
        for (let s = 0; s < n; s++) {
            const ps = phi - d + (s + 0.5) * ds;
            if (Math.abs(ps) >= Math.PI / 2) continue;
            const c = (cd - sp * Math.sin(ps)) / (cp * Math.cos(ps));
            if (c >= 1) continue;
            rows[m] = Math.min(h - 1, Math.max(0, Math.floor((Math.PI / 2 - ps) / rowRad)));
            half[m++] = c <= -1 ? w : Math.acos(c) / cellRad;
        }
        for (let x = 0; x < w; x++) {
            let v = 0;
            for (let s = 0; s < m; s++) {
                const o = rows[s] * (w + 1), hw = half[s];
                v += 2 * hw >= w ? pre[o + w] : at(o, x + 0.5 + hw) - at(o, x + 0.5 - hw);
            }
            v *= wt;
            sum[y * w + x] = v;
            if (v > most) most = v;
        }
    }
    const out = { key, w, h, sum, most };
    cache.set(F, out);
    return out;
}

/** The people within reach at a picture `W` wide's pixel (x, y): the grid read smoothly between its cells. */
function sampler(G, W) {
    const { w, h, sum } = G, s = w / W;
    return (x, y) => {
        const gx = (x + 0.5) * s - 0.5, gy = Math.min(h - 1, Math.max(0, (y + 0.5) * s - 0.5)), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
        const xa = (x0 + w) % w, xb = (x0 + 1) % w, ya = y0 * w, yb = Math.min(h - 1, y0 + 1) * w;
        return (sum[ya + xa] * (1 - fx) + sum[ya + xb] * fx) * (1 - fy) + (sum[yb + xa] * (1 - fx) + sum[yb + xb] * fx) * fy;
    };
}
/** The City size view's colour (into c) at a picture `W` wide's land pixel (x, y). */
export function cityColorAt(fin, W) {
    const G = cityGrid(fin), at = sampler(G, W), top = Math.log10(1 + G.most);
    return (x, y, c) => ramp(HEAT, 1 + (Math.log10(1 + at(x, y)) - top) / SPAN, c);
}
/** The people within reach at a picture `W` wide's pixel, for the export's data maps. */
export function cityValueAt(fin, W) { return sampler(cityGrid(fin), W); }

const count = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : v >= 1e7 ? `${Math.round(v / 1e6)} million` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} million`
    : v >= 1e4 ? `${Math.round(v / 1e3)} thousand` : v >= 100 ? String(Math.round(v / 10) * 10) : String(Math.round(v)));
/** The readout's line at (u, v) of the map (0…1). */
export function cityLine(fin, u, v) {
    const G = cityGrid(fin), people = sampler(G, G.w)(u * G.w - 0.5, v * G.h - 0.5);
    return `<b>~${count(people)}</b> could be fed within ${farmOptions.reach} km`;
}
/** The legend, with the Food legend's parts: head, note, chips (the techniques), bar(stops, label). */
export function cityLegendHTML(fin, { head, note, chips, bar }) {
    const G = cityGrid(fin), r = farmOptions.reach;
    return head(`City size — the people the land within ${r} km could feed`) + `<div class="evo-farm-chips">${chips}</div>` +
        bar(HEAT, `${count(G.most / 10 ** SPAN)} → ${count(G.most)} people`) +
        note(`The most around any one place: ~${count(G.most)}. A pre-industrial city lived off its hinterland — grain went about a day’s cart ride ` +
            '(~30 km) by land, but hundreds of kilometres by river and sea. Each place counted by its own way of life (the People view). ' +
            'Set the reach with the slider above the map, or Shift+scroll over the planet');
}
