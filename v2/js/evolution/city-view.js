// City size (fork addition): how many people a city at each place could live on — the people the land within its
// reach could feed (the People view's a km², farming-view.js peopleGrid). The reach is what a haul may cost, in days by
// cart (CART_KM a day), kept in farmOptions.reach and set by the Food row's slider or Shift+scroll over the planet
// (view/planet-view.js). Its count is
// the larger of the land within that disc by cart alone (below) and what boats bring by river, lake and sea for the
// same cost (city-haul.js). A heat map on a log scale, from the richest place's count down ten-thousandfold.
//
// The sum: the people of the farming picture summed into a grid coarse enough that the disc spans a few dozen rows at
// most (a reach of 300 km on 5 km pixels would be slow), each row's running total read at fractions of a pixel, the
// disc cut into thin strips of latitude, each as wide as the circle is there — so even a reach smaller than a pixel
// sums its own area, not the pixel's.
import { farmOptions, farmOptionsKey, peopleGrid, ramp } from './farming-view.js';
import { HAUL, waterHaul } from './city-haul.js';

const R = 6371;
/** The slider's range, in days by cart (farmOptions.reach): from half a day to market to a capital's grain carted
 *  ~300 km (about twice its price); CART_KM a loaded cart's day. */
export const CITY_REACH = { min: 0.5, max: 12, step: 0.5 };
export const CART_KM = 25;
/** The reach as km by cart. */
export const reachKm = () => farmOptions.reach * CART_KM;
const days = d => `${d} day${d === 1 ? '' : 's'}`;
/** The slider's label: the days by cart. */
export const reachText = () => days(farmOptions.reach);
/** The share of the land's food a town could get: farmers eat most of their harvest, so towns held ~10–15 % of the
 *  people before industry (the richest lands, Song China, the Low Countries, Roman Italy, up to ~15–20 %). */
export const SURPLUS = 0.15;
const SPAN = 4;            // (decades the colours span, below the richest place's count)
// pale where few could be fed, through straw and orange to red and a deep wine where the most
const HEAT = [[0, [216, 210, 198]], [0.3, [238, 214, 130]], [0.55, [236, 150, 60]], [0.8, [200, 56, 44]], [1, [100, 16, 48]]];

const cache = new WeakMap();
/** The people within reach of each cell of a grid `w` × `h` (as coarse as the reach allows): { w, h, sum, most } — per
 *  finished moment, options and reach. */
export function cityGrid(fin) {
    const F = fin.raster.farming, key = farmOptionsKey(), kept = cache.get(F);
    if (kept?.key === key) return kept;
    const dens = peopleGrid(fin), reach = reachKm(), rowKmF = Math.PI * R / F.h;
    // (b: F's pixels to a cell a side — a power of two dividing the picture, the cells no finer than a sixth of the
    // reach, nor the grid wider than 2048)
    let b = 1;
    while (F.w % (2 * b) === 0 && F.h % (2 * b) === 0 && (2 * b * rowKmF <= reach / 6 || F.w / b > 2048)) b *= 2;
    const w = F.w / b, h = F.h / b, rowRad = Math.PI / h, cellRad = 2 * Math.PI / w;
    // the townsfolk each cell's land could feed: its surplus, SURPLUS of the people a km² × its area
    const mass = new Float64Array(w * h), dl = 2 * Math.PI / F.w, dt = Math.PI / F.h;
    for (let y = 0; y < F.h; y++) {
        const top = Math.PI / 2 - y * dt, area = SURPLUS * R * R * dl * (Math.sin(top) - Math.sin(top - dt)), row = Math.floor(y / b) * w;
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
            sum[y * w + x] = v * wt;
        }
    }
    // by water (city-haul.js): the larger of the two, the land's kept for the readout
    const land = sum.slice(), haul = waterHaul(fin, { w, h, mass }, reach);
    for (let i = 0; i < w * h; i++) {
        if (haul && haul.sum[i] > sum[i]) sum[i] = haul.sum[i];
        if (sum[i] > most) most = sum[i];
    }
    const out = { key, w, h, sum, land, most };
    cache.set(F, out);
    return out;
}

/** The people within reach at a picture `W` wide's pixel (x, y): the grid read smoothly between its cells. */
function sampler(G, W, sum = G.sum) {
    const { w, h } = G, s = w / W;
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
    const G = cityGrid(fin), x = u * G.w - 0.5, y = v * G.h - 0.5, people = sampler(G, G.w)(x, y), land = sampler(G, G.w, G.land)(x, y);
    const by = people > 1.05 * land ? `, most by boat (cart ${count(land)})` : ' by cart';
    return `<b>~${count(people)}</b> could be fed within ${days(farmOptions.reach)}’ haul${by}`;
}
/** How far the reach carries by each way (km), for the legend. */
const ways = r => `${r} km by cart, ${Math.round(r / HAUL.river)} by river, ${Math.round(r / HAUL.lake)} by lake or ${Math.round(r / HAUL.sea)} by sea`;
/** The legend, with the Food legend's parts: head, note, chips (the techniques), bar(stops, label). */
export function cityLegendHTML(fin, { head, note, chips, bar }) {
    const G = cityGrid(fin), r = reachKm();
    return head(`City size — the people ${days(farmOptions.reach)} by cart could feed`) + `<div class="evo-farm-chips">${chips}</div>` +
        bar(HEAT, `${count(G.most / 10 ** SPAN)} → ${count(G.most)} people`) +
        note(`The most around any one place: ~${count(G.most)}. A pre-industrial city lived off its hinterland: grain went about a day’s cart ride ` +
            `(~15–30 km) by road, but far by water, which cost about a twentieth as much by sea and a fifth by river (navigable from ${HAUL.navQ} m³/s). ` +
            `The reach is counted in what a day by cart (${CART_KM} km) costs; this one buys ${ways(r)}, the legs added up: cart to the water, boat, cart from the fields. ` +
            `Each place is counted by its own way of life (the People view), and only its surplus: farmers eat most of what they grow, so towns got ~${Math.round(100 * SURPLUS)} % of it. ` +
            'A ceiling for one city taking all of it: neighbouring towns shared the same land. Set the reach with the slider above the map, or Shift+scroll over the planet. ' +
            'The ring at the pointer is the reach by cart');
}
