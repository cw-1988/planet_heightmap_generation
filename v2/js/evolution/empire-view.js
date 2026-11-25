// Empire (fork addition): where to found cities. A heat map of how good a site each place would make, from four things a
// pre-industrial founder weighed, and the best spots ranked. The owner, 2026-11-24: "an empire tab where you could add
// regions to it … and figure out a heat map of where to place cities based on a couple of metrics".
//
// The four, each 0…1 (a toggle in the legend):
// - Food: the people the land within the reach could feed (City size's count, city-view.js), on its log scale.
// - Fresh water: a river at the door (the bigger the better, best navigable) or a fresh lake; fading within a few km.
// - Trade: a sea coast, a navigable river or a lake: a port, a crossing, a river's mouth (sea and river together).
// - Ground: flat enough to build on, not a marsh, not high in the mountains — and a rise nearby to hold (local relief of
//   a few tens to a few hundred metres within ~8 km).
// The site's score is their geometric mean (each as 0.1 + 0.9 × it): a place weak in one is weak, as a city without
// water was. The spots: the best place first, then the next best at least a reach apart, up to a count the user sets.
//
// Focus: the valleys chosen with Generate's Region pick (js/region-pick.js) — `empireOptions.mask`, set by the page:
// { grid: the valleys' map (2048 × 1024, rows from the south, −1 sea), ids: the chosen valleys }. Outside them the map
// is greyed and no spot is placed; with none chosen, the whole planet counts.
import { farmOptions, farmOptionsKey, ramp } from './farming-view.js';
import { cityGrid, reachKm } from './city-view.js';
import { HAUL } from './city-haul.js';
import { KOPPEN_ID } from '../climate/koppen.js';

const R = 6371, D = Math.PI / 180;
/** The view's options: the metrics counted, how many cities, the valleys in focus (set by the page) and a count bumped
 *  whenever they change (the pictures' key). */
export const empireOptions = { food: true, water: true, trade: true, ground: true, cities: 5, mask: null, version: 0 };
export const EMPIRE_CITIES = { min: 1, max: 20 };
const METRICS = [
    ['food', 'Food', 'The people the land within the reach could feed — City size’s count'],
    ['water', 'Fresh water', 'A river at the door (best a navigable one) or a fresh lake'],
    ['trade', 'Trade', 'A sea coast, a navigable river or a lake: a port, a crossing, a river’s mouth'],
    ['ground', 'Ground', 'Flat enough to build on, no marsh, not high in the mountains — and a rise nearby to hold'],
];
/** The pictures' key for the Empire view's options. */
export const empireKey = () => { const o = empireOptions; return `e${+o.food}${+o.water}${+o.trade}${+o.ground}|${o.cities}|${o.version}`; };

// (the City size ramp: pale for a poor site, through straw and orange to red and a deep wine for the best)
const HEAT = [[0, [216, 210, 198]], [0.3, [238, 214, 130]], [0.55, [236, 150, 60]], [0.8, [200, 56, 44]], [1, [100, 16, 48]]];
const PAPER = [222, 217, 204];            // (map-paper: outside the valleys in focus)
const PIN_FILL = [255, 255, 255], PIN_INK = [27, 42, 58];   // (pin-fill, pin-ink)
const PIN_KM = 15, PIN_PX = 4;            // (a pin's radius: ~15 km, never under 4 pixels of the picture)
const WATER_KM = 8, SEA_KM = 12, NAV_KM = 8, RISE_KM = 8;   // (how far each fades, and the rise's ring)
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * A weighted distance (km) over a grid `w` × `h` (rows from the north, round the world east–west): each cell starts at
 * `d0` (Infinity where no source), and takes the nearest of its neighbours' plus the step's length — two rounds of a
 * chamfer pass each way. Its value at a cell: the best source's weight × e^(−km / L), with d0 = −L ln(weight).
 */
export function spread(d, w, h) {
    const ns = Math.PI * R / h, ew = new Float64Array(h), dg = new Float64Array(h);
    for (let y = 0; y < h; y++) {
        ew[y] = 2 * Math.PI * R / w * Math.cos(Math.PI / 2 - (y + 0.5) * Math.PI / h);
        dg[y] = y ? Math.hypot((ew[y] + ew[y - 1]) / 2, ns) : 0;
    }
    const relax = (i, j, len) => { const v = d[j] + len; if (v < d[i]) d[i] = v; };
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
    return d;
}

/** A grid `w` × `h`'s value at (u, v) of the map (0…1), read smoothly between its cells. */
export function sample(a, w, h, u, v) {
    const gx = u * w - 0.5, gy = Math.min(h - 1, Math.max(0, v * h - 0.5)), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const xa = (x0 % w + w) % w, xb = (x0 + 1) % w, ya = y0 * w, yb = Math.min(h - 1, y0 + 1) * w;
    return (a[ya + xa] * (1 - fx) + a[ya + xb] * fx) * (1 - fy) + (a[yb + xa] * (1 - fx) + a[yb + xb] * fx) * fy;
}

/** The four metrics on a grid as fine as the farming picture (no wider than 2048): per finished moment, its farming
 *  options and the reach (the food's). { w, h, land, food, water, trade, ground, wet, nav, sea, rise, slope }. */
const metricCache = new WeakMap();
/** Metrics worked out elsewhere (the states' worker, states-view.js) kept for this farming raster. */
export const metricsKeep = (F, M) => { metricCache.set(F, M); };
export function metrics(fin) {
    const F = fin.raster.farming, K = fin.climate.raster, key = farmOptionsKey(), kept = metricCache.get(F);
    if (kept?.key === key) return kept;
    let b = 1;
    while (F.w / b > 2048 && F.w % (2 * b) === 0 && F.h % (2 * b) === 0) b *= 2;
    const w = F.w / b, h = F.h / b, n = w * h, rowKm = Math.PI * R / h, half = rowKm / 2;
    // the land, its slope and its wet ground, each cell's share of the farming picture's pixels
    const land = new Uint8Array(n), slope = new Float32Array(n), wet = new Float32Array(n), cnt = new Uint16Array(n);
    for (let y = 0; y < F.h; y++) for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
        const k = K.koppen[i];
        if (!k || k === KOPPEN_ID.EF) continue;
        const c = Math.floor(y / b) * w + Math.floor(x / b);
        cnt[c]++; slope[c] += 2 * F.slope[i]; wet[c] += F.wetland[i] / 255;
    }
    for (let c = 0; c < n; c++) if (cnt[c] * 2 >= b * b) { land[c] = 1; slope[c] /= cnt[c]; wet[c] /= cnt[c]; } else { slope[c] = 0; wet[c] = 0; }
    // the sea, the lakes and the heights, read at each cell's centre off the finished picture
    const P = fin.raster, pw = P.w, ph = P.h ?? Math.round(P.ocean.length / pw), Hm = P.heightM;
    const at = (lat, lon) => Math.min(ph - 1, Math.max(0, Math.floor((90 - lat) / 180 * ph))) * pw + ((Math.floor((lon + 180) / 360 * pw) % pw) + pw) % pw;
    const sea = new Uint8Array(n), lake = new Uint8Array(n), rise = new Float32Array(n), alt = new Float32Array(n);
    for (let y = 0; y < h; y++) {
        const lat = 90 - (y + 0.5) / h * 180, dLat = RISE_KM / R / D, dLon = dLat / Math.max(0.05, Math.cos(lat * D));
        for (let x = 0; x < w; x++) {
            const c = y * w + x, lon = (x + 0.5) / w * 360 - 180, p = at(lat, lon);
            if (P.ocean[p]) sea[c] = 1; else if (P.water?.[p]) lake[c] = P.water[p];
            if (!land[c] || !Hm) continue;
            // (a rise to hold: the highest of eight points ~8 km round, over the lowest of them and the place)
            const h0 = Hm[p];
            let hi = h0, lo = h0;
            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4, v = Hm[at(lat + dLat * Math.sin(a), lon + dLon * Math.cos(a))];
                if (v > hi) hi = v; if (v < lo) lo = v;
            }
            rise[c] = hi - lo; alt[c] = h0;
        }
    }
    // the rivers, by their flow (m³/s), drawn onto the grid
    const flow = new Float32Array(n), V = fin.rivers;
    if (V) {
        const { start, lat, lon, q } = V, starts = [...start, lat.length];
        for (let s = 0; s < starts.length - 1; s++) for (let i = starts[s]; i < starts[s + 1] - 1; i++) {
            const x0 = (lon[i] + 180) / 360 * w, y0 = (90 - lat[i]) / 180 * h, x1 = (lon[i + 1] + 180) / 360 * w, y1 = (90 - lat[i + 1]) / 180 * h;
            if (Math.abs(x1 - x0) > w / 2) continue;
            const m = Math.ceil(2 * Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
            for (let t = 0; t <= m; t++) {
                const x = ((Math.floor(x0 + (x1 - x0) * t / m) % w) + w) % w, y = Math.min(h - 1, Math.max(0, Math.floor(y0 + (y1 - y0) * t / m)));
                if (q[i] > flow[y * w + x]) flow[y * w + x] = q[i];
            }
        }
    }
    // fresh water: a river (a stream counts some, a navigable river fully) or a fresh lake, fading over WATER_KM
    // (distances from the cell's edge, not its centre: a cell holds the place a city would stand at)
    const src = (wt, L) => (wt > 0 ? -L * Math.log(wt) : Infinity), fresh = new Float32Array(n), dSea = new Float32Array(n), dNav = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        const qw = flow[c] > 0 ? Math.max(0.35, Math.min(1, 0.35 + 0.65 * Math.log10(1 + flow[c]) / Math.log10(1 + HAUL.navQ))) : 0;
        fresh[c] = src(Math.max(qw, lake[c] === 1 ? 0.9 : 0), WATER_KM);
        dSea[c] = sea[c] ? 0 : Infinity;
        dNav[c] = src(flow[c] >= HAUL.navQ ? 1 : lake[c] ? 0.75 : 0, NAV_KM);
    }
    spread(fresh, w, h); spread(dSea, w, h); spread(dNav, w, h);
    const decay = (d, L) => Math.exp(-Math.max(0, d - half) / L);
    // food: City size's count, on its log scale (four decades below the richest place)
    const G = cityGrid(fin), top = Math.log10(1 + G.most);
    const food = new Float32Array(n), water = new Float32Array(n), trade = new Float32Array(n), ground = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = y * w + x;
        if (!land[c]) continue;
        food[c] = Math.max(0, Math.min(1, 1 + (Math.log10(1 + sample(G.sum, G.w, G.h, (x + 0.5) / w, (y + 0.5) / h)) - top) / 4));
        water[c] = decay(fresh[c], WATER_KM);
        const s = decay(dSea[c], SEA_KM), r = 0.8 * decay(dNav[c], NAV_KM);
        trade[c] = 1 - (1 - s) * (1 - r);
        const flat = 1 - smooth(6, 40, slope[c]), marsh = smooth(0.2, 0.5, wet[c]);
        const hold = smooth(15, 60, rise[c]) * (1 - 0.6 * smooth(400, 900, rise[c])), high = smooth(2500, 4500, alt[c]);
        ground[c] = flat * (1 - 0.85 * marsh) * (0.55 + 0.45 * hold) * (1 - 0.8 * high);
    }
    const out = { key, w, h, land, food, water, trade, ground, flow, sea: dSea, nav: dNav, rise, slope, wet, alt, half, lake };
    metricCache.set(F, out);
    return out;
}

/** The valley mask's reading at (u, v) of the map: true if in focus (or nothing chosen). */
function inFocus(u, v) {
    const M = empireOptions.mask;
    if (!M?.ids?.size || !M.grid) return true;
    const gx = Math.min(2047, Math.floor(u * 2048)), gy = 1023 - Math.min(1023, Math.floor(v * 1024));
    return M.ids.has(M.grid[gy * 2048 + gx]);
}

/** The site scores and the spots, per finished moment and every option: { M, score, focus, best, spots: [{ c, lat,
 *  lon, score }] }. */
const scoreCache = new WeakMap();
export function empireSites(fin) {
    const F = fin.raster.farming, M = metrics(fin), key = `${M.key}|${empireKey()}`, kept = scoreCache.get(F);
    if (kept?.key === key) return kept;
    const { w, h, land } = M, n = w * h, o = empireOptions, on = METRICS.map(([k]) => k).filter(k => o[k]);
    const score = new Float32Array(n), focus = new Uint8Array(n);
    let best = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = y * w + x;
        if (!land[c]) continue;
        let s = 0;
        for (const k of on) s += Math.log(0.1 + 0.9 * M[k][c]);
        score[c] = on.length ? Math.exp(s / on.length) : 0;
        if (inFocus((x + 0.5) / w, (y + 0.5) / h)) { focus[c] = 1; if (score[c] > best) best = score[c]; }
    }
    // the spots: the best place in focus, then the next best at least a reach (and two cells) from every one taken
    const spots = [], blocked = new Uint8Array(n), apart = Math.max(reachKm(), 2 * Math.PI * R / h), rowKm = Math.PI * R / h;
    for (let k = 0; k < o.cities; k++) {
        let c = -1, top = 0;
        for (let i = 0; i < n; i++) if (focus[i] && !blocked[i] && score[i] > top) { top = score[i]; c = i; }
        if (c < 0) break;
        const y = Math.floor(c / w), x = c - y * w, lat = 90 - (y + 0.5) / h * 180, lon = (x + 0.5) / w * 360 - 180;
        spots.push({ c, lat, lon, score: top });
        const dy = Math.ceil(apart / rowKm), cl = Math.cos(lat * D);
        for (let yy = Math.max(0, y - dy); yy <= Math.min(h - 1, y + dy); yy++) {
            const la = 90 - (yy + 0.5) / h * 180, cos2 = Math.max(0.02, Math.min(cl, Math.cos(la * D)));
            const dx = Math.min(w >> 1, Math.ceil(apart / (2 * Math.PI * R / w * cos2)));
            for (let xx = x - dx; xx <= x + dx; xx++) {
                const i = yy * w + ((xx % w) + w) % w, lo = (((xx % w) + w) % w + 0.5) / w * 360 - 180;
                if (arcKm(lat, lon, la, lo) < apart) blocked[i] = 1;
            }
        }
    }
    const out = { key, M, score, focus, best, spots };
    scoreCache.set(F, out);
    return out;
}
export const arcKm = (a1, o1, a2, o2) => {
    const s = Math.sin((a2 - a1) * D / 2) ** 2 + Math.cos(a1 * D) * Math.cos(a2 * D) * Math.sin((o2 - o1) * D / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** The Empire view's colour (into c) at a picture `W` wide's land pixel (x, y): the site's heat, greyed outside the
 *  valleys in focus, and the spots' pins (white, ringed in ink). */
export function empireColorAt(fin, W) {
    const S = empireSites(fin), { M } = S, H = W >> 1, lo = 0.15, span = Math.max(1e-3, S.best - lo), anyFocus = !!empireOptions.mask?.ids?.size;
    // (the pins in the picture's pixels: centre, radius, and the rows they cover)
    const pxKm = 2 * Math.PI * R / W, pins = S.spots.map(s => {
        const r = Math.max(PIN_PX, PIN_KM / pxKm), cx = (s.lon + 180) / 360 * W, cy = (90 - s.lat) / 180 * H, sq = Math.max(0.05, Math.cos(s.lat * D));
        return { cx, cy, r, sq, y0: cy - r - 1, y1: cy + r + 1 };
    });
    return (x, y, c) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        for (const p of pins) {
            if (y < p.y0 || y > p.y1) continue;
            let dx = Math.abs(x + 0.5 - p.cx); dx = Math.min(dx, W - dx); dx *= p.sq;
            const d = Math.hypot(dx, y + 0.5 - p.cy);
            if (d <= p.r) { const k = d > 0.62 * p.r ? PIN_INK : PIN_FILL; c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; return c; }
        }
        ramp(HEAT, Math.max(0, Math.min(1, (sample(S.score, M.w, M.h, u, v) - lo) / span)), c);
        if (anyFocus && !inFocus(u, v)) for (let i = 0; i < 3; i++) c[i] = PAPER[i] + 0.22 * (c[i] - PAPER[i]);
        return c;
    };
}
/** The site's score at a picture `W` wide's pixel (0…1), for the export's data maps. */
export function empireValueAt(fin, W) {
    const S = empireSites(fin), H = W >> 1;
    return (x, y) => sample(S.score, S.M.w, S.M.h, (x + 0.5) / W, (y + 0.5) / H);
}

// ── the readout and the legend ──
const grade = s => (s >= 0.8 ? 'excellent' : s >= 0.6 ? 'good' : s >= 0.4 ? 'fair' : s >= 0.2 ? 'poor' : 'very poor');
/** What makes a place's site, in words, at cell `c`. */
function why(M, c) {
    const out = [];
    out.push(M.food[c] >= 0.75 ? 'rich land around' : M.food[c] >= 0.5 ? 'fair land around' : 'little food near');
    out.push(M.flow[c] >= HAUL.navQ ? 'on a navigable river' : M.flow[c] > 0 ? 'on a river' : M.water[c] >= 0.5 ? 'fresh water near' : 'far from fresh water');
    if (M.sea[c] <= M.half * 1.01 + 1e-6 || Math.exp(-Math.max(0, M.sea[c] - M.half) / SEA_KM) >= 0.6) out.push('on the coast');
    else if (M.trade[c] >= 0.5) out.push('on a waterway');
    out.push(M.wet[c] >= 0.35 ? 'marshy' : M.slope[c] < 6 ? 'flat' : M.slope[c] < 15 ? 'rolling' : M.slope[c] < 35 ? 'hilly' : 'steep');
    if (M.rise[c] >= 30 && M.rise[c] <= 600) out.push('a rise to hold');
    return out.join(', ');
}
/** The readout's line at (u, v) of the map (0…1). */
export function empireLine(fin, u, v) {
    const S = empireSites(fin), M = S.M, x = Math.min(M.w - 1, Math.floor(u * M.w)), y = Math.min(M.h - 1, Math.floor(v * M.h)), c = y * M.w + x;
    if (!M.land[c]) return '';
    const lat = 90 - v * 180, lon = u * 360 - 180, pinKm = Math.max(PIN_KM, 2 * Math.PI * R / M.w);
    const k = S.spots.findIndex(s => arcKm(lat, lon, s.lat, s.lon) <= pinKm);
    const s = sample(S.score, M.w, M.h, u, v);
    return `${k >= 0 ? `<b>City site ${k + 1}</b> · ` : ''}<b>${grade(s)} site</b> (${Math.round(100 * s)}) — ${why(M, c)}${S.focus[c] || !empireOptions.mask?.ids?.size ? '' : ' · outside the valleys chosen'}`;
}

const chip = (key, label, title, on) => `<button type="button" class="evo-farm-chip${on ? ' on' : ''}" data-empire="${key}" title="${title}" aria-pressed="${on}">${label}</button>`;
const where = (lat, lon) => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
/** The legend, with the Food legend's parts: head, note, bar(stops, label). */
export function empireLegendHTML(fin, { head, note, bar }) {
    const S = empireSites(fin), o = empireOptions, focus = o.mask?.ids?.size ?? 0;
    const metrics = METRICS.map(([k, label, title]) => chip(k, label, title, o[k])).join('');
    const count = `<span class="empire-count">Cities <button type="button" class="evo-farm-chip" data-empire-cities="-1" aria-label="One city fewer" title="One city fewer"${o.cities <= EMPIRE_CITIES.min ? ' disabled' : ''}>−</button>` +
        `<em>${o.cities}</em><button type="button" class="evo-farm-chip" data-empire-cities="1" aria-label="One city more" title="One city more"${o.cities >= EMPIRE_CITIES.max ? ' disabled' : ''}>+</button></span>`;
    const list = S.spots.length ? `<ol class="empire-spots">${S.spots.map(s => `<li><b>${grade(s.score)}</b> (${Math.round(100 * s.score)}) · ${where(s.lat, s.lon)} — ${why(S.M, s.c)}</li>`).join('')}</ol>`
        : note(focus ? 'No land in the valleys chosen' : 'No land to found a city on');
    return head(focus ? `Empire — where to found cities in the ${focus} valle${focus > 1 ? 'ys' : 'y'} chosen` : 'Empire — where to found cities') +
        `<div class="evo-farm-chips">${metrics}${count}</div>` + bar(HEAT, 'a poor site → the best') + list +
        note(`${focus ? 'Choose more valleys, or click one again to drop it; ' : 'Click valleys on the planet to focus on a region (the Region pick); '}the best site comes first, each next at least ${Math.round(reachKm())} km ` +
            `(the reach, ${farmOptions.reach} day${farmOptions.reach === 1 ? '' : 's'} by cart) from the others. A site weighs the food within reach, fresh water, trade by sea, river or lake, ` +
            'and the ground — flat, dry, not too high, with a rise nearby to hold; weak in one, it is weak. Where cities could stand, not where they would');
}

/** A click on the legend's chips: a metric on or off, a city more or fewer; true if it was one. */
export function empireChipClicked(target) {
    const n = target.closest?.('[data-empire-cities]');
    if (n) { empireOptions.cities = Math.max(EMPIRE_CITIES.min, Math.min(EMPIRE_CITIES.max, empireOptions.cities + Number(n.dataset.empireCities))); return true; }
    const b = target.closest?.('[data-empire]');
    if (!b) return false;
    const k = b.dataset.empire, on = METRICS.filter(([m]) => empireOptions[m]).length;
    if (empireOptions[k] && on <= 1) return false;     // (one at least)
    empireOptions[k] = !empireOptions[k];
    return true;
}
