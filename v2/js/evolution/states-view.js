// States (fork addition): a political map drawn automatically for the whole planet as it is now — a base to whip into
// shape, not a history. The owner, 2026-11-24: "automatic empire generation, based on a regions food and economic
// output, natural bottlenecks, contested resource spots etc." … "do the entire planet for the current snapshot …
// just a base we can whip into shape".
//
// How it is drawn (every step a knob or a click away):
// 1. The cost of holding ground, per km: open, fed land cheapest; hills, mountains, high ground, marsh and empty land
//    (desert, tundra: few to tax) dearer; a navigable river cheaper; the sea dear, the open ocean dearest (cheaper with
//    Sea lanes). A low-frequency noise, rolled with Reroll, so a reroll redraws the borders a little too. Climbing is
//    dear and crossing a big river is dear (River borders), so borders settle on crests and rivers (see CROSS_KM below).
// 2. The capitals: the best city sites (Empire's four metrics, empire-view.js) weighted by the people the land within
//    reach could feed (City size), spaced over the peopled land; places the user clicked first, places they dropped never.
// 3. Growth: from every capital at once, the cheapest way out (a Dijkstra over the grid, round the world east–west),
//    each step's cost divided by the capital's power (the people within its reach, to the 0.35); a place belongs to
//    the capital it is cheapest from, and none beyond Reach. Each place keeps its second-cheapest capital too. Then the
//    owners are read through a warp (Borders), calmed on mountains and rivers and gone at a capital, so borders wind.
// 4. Contested: where the second is nearly as cheap as the first (the frontier); flashpoints are the richest contested
//    places — scarce metals (tin, gold, silver, copper), salt, iron, good sites and good land.
// 5. Bottlenecks: for each two states that meet, the cheapest crossing of their border (capital to capital through it)
//    — where the rest of the border is dear (mountains, desert, sea), that crossing is the pass, the strait, the ford.
//
// The grid: Empire's metric grid, no wider than 1024 (~40 km a cell at the equator), rows from the north.
import { farmOptions, farmOptionsKey, peopleGrid, lifeGrid, ramp } from './farming-view.js';
import { natureShares, naturalTree, landformOf, livelihoodOf, landWords, NATURE_KM2 } from './states-nature.js';
import { metrics, metricsKeep, spread, sample, arcKm } from './empire-view.js';
import { cityGrid, cityKeep, SURPLUS, SHARE, CART_KM } from './city-view.js';
import { HAUL } from './city-haul.js';
import { DEPOSITS, METALS } from '../geology/deposits.js';
import { GEOLOGY } from '../geology/geology-config.js';

const R = 6371, D = Math.PI / 180;
/** The view's options: how many states, how far power reaches (km of open, fed land; 0: by the states' spacing), whether the sea joins (coastal
 *  sea cheap), whether a capital weighs its metals, the roll; the capitals placed and dropped by hand ([lat, lon]). */
export const statesOptions = { count: 16, reach: 0, seas: true, ores: true, rivers: true, wiggle: 2, bend: 2, roll: 0, pins: [], drops: [], version: 0 };
export const STATES_COUNT = { min: 2, max: 48 };
// (whether the regions show — their borders, their names and the hovered one lit — here and in the States overlay: the
// view strip's Regions switch, off by default and kept between visits; the owner, 2026-11-25: "the region highlight
// should be a toggle and regions should be invisible when this toggle isnt enabled")
const REGIONS_PREF = 'orogen.generate.statesRegions';
export const regionsShown = { on: false };
try { regionsShown.on = localStorage.getItem(REGIONS_PREF) === '1'; } catch { /* (no storage: off) */ }
export function setRegionsShown(on) {
    regionsShown.on = on;
    try { localStorage.setItem(REGIONS_PREF, on ? '1' : '0'); } catch { /* (kept for this visit only) */ }
}
const REACHES = [300, 450, 600, 900, 1300, 1800, 2500, 3500, 5000, 7000];
const AUTO_REACH = 1.6;   // (Reach left to itself: this many times the capitals' spacing)
export const statesKey = () => { const o = statesOptions; return `s${o.count}|${o.reach}|${+o.seas}|${+o.ores}|${+o.rivers}|${o.wiggle}|${o.bend}|${o.roll}|${o.version}`; };
// The borders' lay (the owner, 2026-11-24: "i kinda hate how the regions and empire borders dont flow natural"). A big
// river is dear to cross (River borders): borders settle on it, as the Rhine's and the Danube's did. Climbing is dear, a
// km of it as CLIMB_KM of open land: borders settle on the crests and the watersheds. And the borders are bent by a warp —
// where a place's owner is read, it is read a little way off, by a noise of a few lattices (km), each swaying SWAY of its
// lattice: WARP_KM baked into the build (so every place, town and region agrees with the map), FINE_KM where the map is
// drawn (detail as you zoom in, finer than the grid). Less of it on mountains and big rivers (the border is on them), none
// at a capital. Borders sets how much: ruled (none, the bare cost) to wild.
const CROSS_KM = 220, CROSS_Q = [HAUL.navQ, 2000], CLIMB_KM = 80;
const WARP_KM = [420, 170, 70], FINE_KM = [40, 16, 6], SWAY = 0.32, FINE_SWAY = 0.4, CALM_KM = 250;
export const WIGGLES = [0, 0.5, 1, 1.5, 2.2], WIGGLE_WORDS = ['ruled', 'gentle', 'natural', 'winding', 'wild'];
// The roads' lay (the owner, 2026-11-24: the road network is "too angular"). A road is found as a stair of cells, eight
// ways only; its stair is smoothed away (passes of 1-2-1 over the cells, a cell or so either way, so it keeps its
// valley), then it is bent a little off its line by a noise of a few lattices (km), each swaying sway of its lattice —
// less on mountains and big rivers (the road keeps to the valley, the bank), none at its ends (the places, the forks).
// Roads sets how much: straight (smoothed, no bend) to wild.
const ROAD_FLOW = { passes: 4, step: 1 / 3, km: [110, 40, 15], sway: 0.16, taperKm: 35 };
// How a road is found (roadsOf): a cell's cost, and a km of height climbed or come down as climbKm of open road, so
// a road takes the valley round a hill rather than over it. And three places a road would chain (A to B to C, no road
// from A to C) meet at a fork instead — the point between them the three ways to it cost least (the cost-weighted
// Fermat point, a Steiner junction) — where that is forkGain cheaper than the chain and the chain's corner is under
// forkAngle (degrees).
const ROAD_LAY = { climbKm: 100, forkGain: 0.06, forkAngle: 115 };
export const BENDS = [0, 0.5, 1, 1.6, 2.4], BEND_WORDS = ['straight', 'gentle', 'natural', 'winding', 'wild'];

// (the categorical eight, cat-1 … cat-8 in tokens.css, in order; neighbours never share one)
export const CAT = [[208, 143, 52], [49, 180, 172], [139, 61, 44], [136, 150, 239], [114, 132, 49], [123, 53, 139], [5, 120, 164], [198, 97, 120]];
const PAPER = [222, 217, 204];            // (map-paper: land no state holds)
const PIN_FILL = [255, 255, 255], PIN_INK = [27, 42, 58];   // (pin-fill, pin-ink)
/** A region's border: its state's colour this far toward ink (the state's own border is ink in full; it was 0.7, the
 *  owner, 2026-11-25: "region border are kinda awful. can you make them more subtle?"). */
export const REGION_INK = 0.45;
/** A region's border colour for a state colour k, into c. */
export const regionEdge = (k, c) => { for (let j = 0; j < 3; j++) c[j] = Math.round(k[j] + REGION_INK * (PIN_INK[j] - k[j])); return c; };
const PIN_KM = 18, PIN_PX = 4, MARK_KM = 12, MARK_PX = 3;
// (the metals a state weighs, and how much a contested deposit of each is worth fighting for: the scarce most)
const WANT = { tin: 1.5, gold: 1.25, silver: 1.15, copper: 1, salt: 0.9, iron: 0.5, leadZinc: 0.6, diamonds: 0.8 };
const WANT_IDS = Object.keys(WANT), WANT_I = WANT_IDS.map(id => METALS.findIndex(m => m.id === id));
const RIVER_Q = 8;   // (a river town's river: this many times a navigable river's least flow, HAUL.navQ, to count fully)
const FINE_STONE = ['obsidian', 'jade', 'agate', 'stoneMarble'];   // (the stones worth a journey: tools, carving, building)
const NEED = ['iron', 'copper', 'tin', 'salt'];   // (what a state lacks, said in the legend: a Bronze or Iron Age's needs)
// (each metal's kind, the badge it earns a place: base metals, gold and silver, salt, and diamonds among the gems)
const KIND = { iron: 'mine', copper: 'mine', tin: 'mine', leadZinc: 'mine', gold: 'precious', silver: 'precious', salt: 'mineral', diamonds: 'gem' };
/** What a district of each good is worth to the people who would work it, rich (0…1): what the old trades paid for a
 *  load of it, and how far it was carried for it — gold and the finest gems most, iron and the common stones least (a
 *  moderate deposit half as much; GEOLOGY.deposits.grades). It sites the places by the deposits (minesOf), counts their
 *  people and badges the places that stand by one. */
const WORTH = { gold: 1, diamonds: 1, silver: 0.85, tin: 0.8, copper: 0.6, salt: 0.55, iron: 0.4, leadZinc: 0.4 };
const GEM_WORTH = { corundum: 1, emerald: 1, gemPlacer: 0.9, lapis: 0.85, opal: 0.85, turquoise: 0.7, pegmatite: 0.7, basaltGems: 0.6, amethyst: 0.5, garnet: 0.35 };
const STONE_WORTH = { jade: 0.75, obsidian: 0.5, agate: 0.4, stoneMarble: 0.4 };
/** The goods a road carries, the bits of a place's goods (roadsOf): its ways of life, the sea's trade, and its
 *  deposits — each with its worth to a trader (a ton's dearness and how far it went) and its words. */
const GOODS = [['grain', 0.5, 'grain'], ['herds', 0.5, 'livestock'], ['furs', 0.4, 'furs and game'], ['sea', 0.5, 'goods off the sea'],
    ['gold', 1, 'gold'], ['silver', 0.85, 'silver'], ['gems', 0.9, 'gems'], ['tin', 0.8, 'tin'], ['copper', 0.6, 'copper'],
    ['salt', 0.6, 'salt'], ['iron', 0.45, 'iron'], ['lead', 0.35, 'lead'], ['stone', 0.45, 'fine stone']];
const GOOD_BIT = Object.fromEntries(GOODS.map((g, i) => [g[0], 1 << i]));
const GOOD_OF = { gold: 'gold', silver: 'silver', diamonds: 'gems', tin: 'tin', copper: 'copper', salt: 'salt', iron: 'iron', leadZinc: 'lead' };
/** A goods mask's worth (the goods' worths summed). */
const goodsWorth = m => { let t = 0; for (let i = 0; m; i++, m >>>= 1) if (m & 1) t += GOODS[i][1]; return t; };
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Value noise (0…1) at a place, its lattice `km` apart, round the world east–west; one roll a pattern. */
function noise(lat, lon, km, roll) {
    const ny = Math.max(2, Math.round(Math.PI * R / km)), nx = Math.max(3, Math.round(2 * Math.PI * R / km));
    const gx = (lon + 180) / 360 * nx, gy = (90 - lat) / 180 * ny, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const v = (x, y) => hash(((x % nx) + nx) % nx, y, roll + 17);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
}

// ── names: syllables rolled per capital (a base to rename) ──
const ONSETS = ['', 'b', 'd', 'g', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'z', 'th', 'sh', 'kh', 'br', 'dr', 'gr', 'tr', 'st', 'ar', 'el', 'h', 'y', 'q'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'ai', 'au', 'ia', 'ei'];
const CODAS = ['', '', '', 'n', 'r', 'l', 's', 'th', 'k', 'm', 'nd', 'rk', 'sh'];
function nameOf(a, b, roll) {
    let k = 0;
    const r = () => hash(a, b + 31 * k++, roll + 5);
    const n = 2 + (r() < 0.45 ? 1 : 0);
    let s = '';
    for (let i = 0; i < n; i++) s += ONSETS[Math.floor(r() * ONSETS.length)] + VOWELS[Math.floor(r() * VOWELS.length)] + (i === n - 1 ? CODAS[Math.floor(r() * CODAS.length)] : '');
    s = s.replace(/(.)\1\1+/g, '$1$1');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The grid the states are drawn on, per finished moment and its farming options: Empire's metrics, coarsened. */
const gridCache = new WeakMap();
function stateGrid(fin) {
    const F = fin.raster.farming, M = metrics(fin), key = `${M.key}`, kept = gridCache.get(F);
    if (kept?.key === key) return kept;
    let b = 1;
    while (M.w / b > 1024 && M.w % (2 * b) === 0 && M.h % (2 * b) === 0) b *= 2;
    const w = M.w / b, h = M.h / b, n = w * h, rowKm = Math.PI * R / h;
    const land = new Uint8Array(n), slope = new Float32Array(n), alt = new Float32Array(n), wet = new Float32Array(n), nav = new Uint8Array(n);
    const site = new Float32Array(n), at = new Int32Array(n).fill(-1), cnt = new Uint16Array(n), shore = new Uint8Array(n), riv = new Float32Array(n);
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
        const i = y * M.w + x, c = Math.floor(y / b) * w + Math.floor(x / b);
        if (M.flow[i] >= HAUL.navQ) nav[c] = 1;
        if (M.flow[i] > riv[c]) riv[c] = M.flow[i];   // (the biggest river through the cell, m³/s)
        if (!M.land[i]) continue;
        if (M.sea[i] <= 3 * M.half) shore[c] = 1;     // (beside the open sea, a diagonal step included — a lake's shore is not a coast)
        cnt[c]++; slope[c] += M.slope[i]; alt[c] += M.alt[i]; wet[c] += M.wet[i];
        if (M.lake[i]) continue;                       // (no place stands in a lake: Köppen's land holds them)
        let s = 0;
        for (const k of ['food', 'water', 'trade', 'ground']) s += Math.log(0.1 + 0.9 * M[k][i]);
        s = Math.exp(s / 4);
        if (s > site[c]) { site[c] = s; at[c] = i; }
    }
    for (let c = 0; c < n; c++) if (cnt[c] * 2 >= b * b) { land[c] = 1; slope[c] /= cnt[c]; alt[c] /= cnt[c]; wet[c] /= cnt[c]; } else { site[c] = 0; slope[c] = 0; alt[c] = 0; wet[c] = 0; }
    // the people the land could feed, per cell (People's count a km² × the area)
    const dens = peopleGrid(fin), pop = new Float64Array(n), fx = F.w / w, fy = F.h / h, dl = 2 * Math.PI / F.w, dt = Math.PI / F.h;
    for (let y = 0; y < F.h; y++) {
        const top = Math.PI / 2 - y * dt, area = R * R * dl * (Math.sin(top) - Math.sin(top - dt)), row = Math.floor(y / fy) * w;
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) if (dens[i] > 0) pop[row + Math.floor(x / fx)] += dens[i] * area;
    }
    const area = new Float64Array(h);
    for (let y = 0; y < h; y++) { const t = Math.PI / 2 - y * Math.PI / h; area[y] = R * R * 2 * Math.PI / w * (Math.sin(t) - Math.sin(t - Math.PI / h)); }
    // the sea's distance from land (km)
    const toLand = new Float32Array(n);
    for (let c = 0; c < n; c++) toLand[c] = land[c] ? 0 : Infinity;
    spread(toLand, w, h);
    // the metals a state would want, per cell: each one's richness (0…255) — off the deposits' 0.25° grid
    const Dp = fin.raster.geology?.deposits, ores = new Uint8Array(n * WANT_IDS.length), SYS = DEPOSITS.length;
    if (Dp) {
        const K = Dp.cells.length;
        for (let j = 0; j < K; j++) {
            const g = Dp.cells[j], gy = Math.floor(g / Dp.w), gx = g - gy * Dp.w;
            const lat = 90 - (gy + 0.5) * Dp.step, lon = (gx + 0.5) * Dp.step - 180;
            const c = Math.min(h - 1, Math.floor((90 - lat) / 180 * h)) * w + Math.min(w - 1, Math.floor((lon + 180) / 360 * w));
            for (let m = 0; m < WANT_IDS.length; m++) {
                if (WANT_I[m] < 0) continue;
                const v = Dp.data[(SYS + WANT_I[m]) * K + j];
                if (v > ores[c * WANT_IDS.length + m]) ores[c * WANT_IDS.length + m] = v;
            }
        }
    }
    // the gems and the fine stones, per cell: the dearest of each (its worth, WORTH, times its richness) — its richness
    // (0…255) and which deposit it is (flint left out: it is knapped almost anywhere)
    const fine = new Uint8Array(n * 2), fineK = new Int16Array(n * 2).fill(-1), dear = new Float32Array(n * 2);
    if (Dp) {
        const K = Dp.cells.length, rows = DEPOSITS.map((d, k) => d.group === 'gem' ? [k, 0, GEM_WORTH[d.id] ?? 0.6] : FINE_STONE.includes(d.id) ? [k, 1, STONE_WORTH[d.id] ?? 0.4] : null).filter(Boolean);
        for (let j = 0; j < K; j++) {
            const g = Dp.cells[j], gy = Math.floor(g / Dp.w), gx = g - gy * Dp.w;
            const c = Math.min(h - 1, Math.floor((gy + 0.5) * Dp.step / 180 * h)) * w + Math.min(w - 1, Math.floor((gx + 0.5) * Dp.step / 360 * w));
            for (const [k, slot, worth] of rows) {
                const v = Dp.data[k * K + j], q = c * 2 + slot;
                if (v * worth > dear[q]) { dear[q] = v * worth; fine[q] = v; fineK[q] = k; }
            }
        }
    }
    // the ways of life on each cell (farming-view.js lifeGrid): a bit each — 1 farming, 2 herding, 4 gathering — for
    // every one on a quarter of its land or more (where herders and farmers meet, both)
    const lives = lifeGrid(fin), life = new Uint8Array(n);
    if (lives && lives.length === F.w * F.h) {
        const tally = new Uint16Array(n * 4);
        for (let y = 0; y < F.h; y++) {
            const row = Math.min(h - 1, Math.floor(y * h / F.h)) * w;
            for (let x = 0, i = y * F.w; x < F.w; x++, i++) { const c = row + Math.min(w - 1, Math.floor(x * w / F.w)); tally[c * 4 + lives[i]]++; }
        }
        for (let c = 0; c < n; c++) {
            const t = tally[c * 4 + 1] + tally[c * 4 + 2] + tally[c * 4 + 3];
            if (t) for (let l = 1; l <= 3; l++) if (tally[c * 4 + l] * 4 >= t) life[c] |= 1 << (l - 1);
        }
    }
    // the people within reach of each cell (City size's), for a capital's power and its pick
    const G = cityGrid(fin), within = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) within[y * w + x] = sample(G.sum, G.w, G.h, (x + 0.5) / w, (y + 0.5) / h);
    const out = { key, w, h, n, b, rowKm, land, shore, slope, alt, wet, nav, riv, site, at, pop, area, toLand, ores, fine, fineK, life, within, Mw: M.w, Mh: M.h };
    // the natural regions under the states, nested (states-nature.js)
    out.nature = naturalTree(out, natureShares(out, fin.climate?.raster, lives), dividesOf(out));
    const flat = new Float32Array(n);
    out.nature.nodes.forEach((nodes, l) => labelPoints(out, nodes, out.nature.levels[l], flat, 1));
    gridCache.set(F, out);
    return out;
}

/** The cost of holding a cell, per km of it (1: open, well-fed lowland). */
function costs(S, o) {
    const { w, h, n, land, slope, alt, wet, nav, pop, area, toLand } = S, cost = new Float32Array(n);
    for (let y = 0; y < h; y++) {
        const lat = 90 - (y + 0.5) / h * 180;
        for (let x = 0; x < w; x++) {
            const c = y * w + x, lon = (x + 0.5) / w * 360 - 180, jit = Math.exp(0.5 * (noise(lat, lon, 600, o.roll) - 0.5));
            if (!land[c]) {
                // (the sea: coastal water a boat's road, the open ocean a wall — less of one with Sea lanes)
                const d = toLand[c];
                cost[c] = (o.seas ? 1.6 : 4) + (o.seas ? 8 : 30) * smooth(80, 450, d);
                continue;
            }
            const dens = pop[c] / area[y], sparse = 1 - smooth(0.3, 8, dens);
            let k = 1 + 3.5 * smooth(6, 40, slope[c]) + 2.5 * smooth(1200, 3500, alt[c]) + 1.5 * smooth(0.2, 0.5, wet[c]) + 3 * sparse;
            if (nav[c]) k *= 0.55;
            cost[c] = k * jit;
        }
    }
    return cost;
}

/** The borders' lay, per cell: X, the cost (km of open land) of coming onto it from off a big river — CROSS_KM on the
 *  biggest, less on a smaller, none without River borders; A, its height (m, land only), climbing dear. */
function layOf(S, o) {
    const { n, land, riv, alt } = S, X = new Float32Array(n), A = new Float32Array(n), lq = Math.log(CROSS_Q[1] / CROSS_Q[0]);
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        A[c] = Math.max(0, alt[c]);
        if (o.rivers && riv && riv[c] >= CROSS_Q[0]) X[c] = CROSS_KM * smooth(0, 1, Math.log(riv[c] / CROSS_Q[0]) / lq);
    }
    return { X, A };
}

/** The land's dividing lines, per cell (0…1), for the natural regions (states-nature.js) to split along: a crest (the
 *  cell standing above the ground DIVIDE.km away on both sides, along any of four directions: DIVIDE.rise m and up
 *  counts fully) or a big river (as River borders weighs one, CROSS_Q, whatever that option). In km and m, so the same
 *  at every Detail. (The owner, 2026-11-25: regions were cutting across ranges and rivers.) */
const DIVIDE = { km: 80, rise: [120, 700] };
function dividesOf(S) {
    const { w, h, n, land, riv, alt, rowKm } = S, out = new Float32Array(n), crests = S.crest = new Float32Array(n), lq = Math.log(CROSS_Q[1] / CROSS_Q[0]);
    const ky = Math.max(1, Math.round(DIVIDE.km / rowKm)), A = c => (land[c] ? Math.max(0, alt[c]) : 0);
    for (let y = 0; y < h; y++) {
        const kx = Math.max(1, Math.min(w >> 2, Math.round(DIVIDE.km / (rowKm * Math.max(0.05, Math.sin((y + 0.5) / h * Math.PI))))));
        const up = Math.max(0, y - ky) * w, dn = Math.min(h - 1, y + ky) * w;
        for (let x = 0; x < w; x++) {
            const c = y * w + x;
            if (!land[c]) continue;
            const a = A(c), xl = (x - kx + w) % w, xr = (x + kx) % w;
            const rise = Math.max(Math.min(a - A(y * w + xl), a - A(y * w + xr)), Math.min(a - A(up + x), a - A(dn + x)),
                Math.min(a - A(up + xl), a - A(dn + xr)), Math.min(a - A(up + xr), a - A(dn + xl)));
            const crest = smooth(DIVIDE.rise[0], DIVIDE.rise[1], rise);
            const river = riv && riv[c] >= CROSS_Q[0] ? smooth(0, 1, Math.log(riv[c] / CROSS_Q[0]) / lq) : 0;
            crests[c] = crest; out[c] = Math.max(crest, river);
        }
    }
    return out;
}

/** How far the warp may move a place's owner, per cell (0…1): less on rugged and high ground (the border is on the
 *  crest) and on big rivers (it is on the river), rising again over ~2 cells round them; none within CALM_KM of
 *  a capital (key1: the cost from the owner, over its power). */
function calmOf(S, lay, G, power) {
    const { w, h, n, land, slope, alt } = S, calm = new Float32Array(n), out = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!land[c]) { calm[c] = 1; continue; }
        const rough = Math.max(smooth(8, 28, slope[c]), smooth(1200, 3000, alt[c]), S.crest ? S.crest[c] : 0), river = lay.X[c] / CROSS_KM;
        calm[c] = (1 - 0.85 * rough) * (1 - 0.9 * river);
    }
    // (eased round the calm: a cell beside a river may not take its owner from across it)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let m = 1;
        for (let dy = -2; dy <= 2; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -2; dx <= 2; dx++) m = Math.min(m, calm[yy * w + (x + dx + w) % w] + 0.22 * Math.hypot(dx, dy));
        }
        const c = y * w + x, o = G?.own1[c];
        out[c] = Math.min(1, m) * (G && o >= 0 ? smooth(0, CALM_KM, G.key1[c] * power[o]) : 1);
    }
    return out;
}

/** The warp's sway (km east, km north) at a place: its noise's lattices, each swaying `sway` of itself. */
function warpKm(lat, lon, lattices, sway, roll, out) {
    out[0] = 0; out[1] = 0;
    for (let k = 0; k < lattices.length; k++) {
        const km = lattices[k], s = 2 * sway * km;
        out[0] += s * (noise(lat, lon, km, roll + 41 + 2 * k) - 0.5);
        out[1] += s * (noise(lat, lon, km, roll + 42 + 2 * k) - 0.5);
    }
    return out;
}
/** A place (u, v) of the map moved by a sway of (east, north) km, into out [u, v]. */
const moveUV = (u, v, east, north, out) => {
    const cl = Math.max(0.1, Math.cos((90 - v * 180) * D));
    out[0] = u + east / (2 * Math.PI * R * cl); out[1] = Math.min(1, Math.max(0, v - north / (Math.PI * R)));
    return out;
};

/** A grown field read again at each cell's warped place (the build's warp): { own1, own2, key1, key2 } as grow's. */
function warpField(S, G, L, du, dv) {
    const { w, h, n } = S, I = G.own1.constructor, r = {};
    const F = { own1: new I(n).fill(-1), own2: new I(n).fill(-1), key1: new Float32Array(n).fill(Infinity), key2: new Float32Array(n).fill(Infinity) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = y * w + x;
        ownerCore(S, L, G, (x + 0.5) / w + du[c], (y + 0.5) / h + dv[c], r);
        F.own1[c] = r.a; F.key1[c] = r.ka; F.own2[c] = r.b; F.key2[c] = r.kb;
    }
    return F;
}
/** The build's warp, per cell: how far (in u and v) each cell's owner is read off. */
function warpCells(S, calm, mult, roll) {
    const { w, h, n } = S, du = new Float32Array(n), dv = new Float32Array(n), k = [0, 0], m = [0, 0];
    if (mult <= 0) return { du, dv };
    for (let y = 0; y < h; y++) {
        const lat = 90 - (y + 0.5) / h * 180, v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
            const c = y * w + x, s = mult * calm[c];
            if (s <= 0) continue;
            const lon = (x + 0.5) / w * 360 - 180, u = (x + 0.5) / w;
            warpKm(lat, lon, WARP_KM, SWAY, roll, k);
            moveUV(u, v, s * k[0], s * k[1], m);
            du[c] = m[0] - u; dv[c] = m[1] - v;
        }
    }
    return { du, dv };
}

/** The capitals: the hand-placed first, then the best sites, weighted by the people within reach (and their metals),
 *  spaced over the peopled land. [{ c, lat, lon, hand }] */
function capitals(S, o) {
    const { w, h, n, land, site, within, pop, area, ores, at, Mw, Mh } = S, top = Math.log10(1 + within.reduce((m, v) => (v > m ? v : m), 0));
    const latOf = c => { const i = at[c]; return i >= 0 ? 90 - (Math.floor(i / Mw) + 0.5) / Mh * 180 : 90 - (Math.floor(c / w) + 0.5) / h * 180; };
    const lonOf = c => { const i = at[c]; return i >= 0 ? (i % Mw + 0.5) / Mw * 360 - 180 : (c % w + 0.5) / w * 360 - 180; };
    const cellOf = (lat, lon) => Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / 180 * h))) * w + ((Math.floor((lon + 180) / 360 * w) % w) + w) % w;
    const caps = o.pins.map(([lat, lon]) => ({ c: cellOf(lat, lon), lat, lon, hand: true }));
    const N = Math.max(caps.length, Math.min(STATES_COUNT.max, o.count));
    // (the peopled land's area: the spacing a state's share of it)
    let peopled = 0;
    for (let c = 0; c < n; c++) if (land[c] && pop[c] / area[Math.floor(c / w)] >= 1) peopled += area[Math.floor(c / w)];
    const cand = [];
    for (let c = 0; c < n; c++) {
        if (!land[c] || site[c] < 0.15) continue;
        let v = site[c] * Math.max(0, (Math.log10(1 + within[c]) - top + 3) / 3);
        if (o.ores) { let r = 0; for (let m = 0; m < WANT_IDS.length; m++) r = Math.max(r, ores[c * WANT_IDS.length + m] / 255 * WANT[WANT_IDS[m]]); v *= 1 + 0.25 * r; }
        v *= 0.8 + 0.4 * hash(c, 7, o.roll);
        if (v > 0) cand.push([v, c]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const dropped = (lat, lon) => o.drops.some(([a, b]) => arcKm(a, b, lat, lon) < 250);
    let apart = 0.9 * Math.sqrt(peopled / Math.max(1, N));
    caps.apart = apart;
    for (let round = 0; round < 6 && caps.length < N; round++, apart *= 0.7) {
        caps.apart = apart;
        for (const [, c] of cand) {
            if (caps.length >= N) break;
            const lat = latOf(c), lon = lonOf(c);
            if (dropped(lat, lon) || caps.some(k => arcKm(k.lat, k.lon, lat, lon) < apart)) continue;
            caps.push({ c, lat, lon, hand: false });
        }
    }
    return caps;
}

/** A growable heap of (key, value) — the cheapest first. */
class Heap {
    constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
    push(k, v) {
        if (this.n === this.k.length) { const K = new Float64Array(this.n * 2), V = new Int32Array(this.n * 2); K.set(this.k); V.set(this.v); this.k = K; this.v = V; }
        let i = this.n++;
        const A = this.k, B = this.v;
        while (i > 0) { const p = (i - 1) >> 1; if (A[p] <= k) break; A[i] = A[p]; B[i] = B[p]; i = p; }
        A[i] = k; B[i] = v;
    }
    pop() {
        const A = this.k, B = this.v, top = B[0], n = --this.n, k = A[n], v = B[n];
        let i = 0;
        for (;;) {
            let c = 2 * i + 1;
            if (c >= n) break;
            if (c + 1 < n && A[c + 1] < A[c]) c++;
            if (A[c] >= k) break;
            A[i] = A[c]; B[i] = B[c]; i = c;
        }
        A[i] = k; B[i] = v;
        return top;
    }
}

/** A heap of the cells 0 … n−1 keyed by `key` (theirs to hold, the caller's to lower): each cell in it at most once, so
 *  it never grows — a shortest-path growth over a whole grid in 8 bytes a cell beside its keys. */
class CellHeap {
    constructor(n, key) { this.key = key; this.h = new Int32Array(n); this.at = new Int32Array(n).fill(-1); this.n = 0; }
    /** Puts c in, or moves it up once its key was lowered. */
    lower(c) {
        const K = this.key, h = this.h, at = this.at, k = K[c];
        let i = at[c];
        if (i < 0) i = this.n++;
        while (i > 0) { const p = (i - 1) >> 1, q = h[p]; if (K[q] <= k) break; h[i] = q; at[q] = i; i = p; }
        h[i] = c; at[c] = i;
    }
    pop() {
        const K = this.key, h = this.h, at = this.at, top = h[0], n = --this.n;
        at[top] = -2;                                   // (settled: not put in again)
        if (n > 0) {
            const c = h[n], k = K[c];
            let i = 0;
            for (;;) {
                let j = 2 * i + 1;
                if (j >= n) break;
                if (j + 1 < n && K[h[j + 1]] < K[h[j]]) j++;
                if (K[h[j]] >= k) break;
                h[i] = h[j]; at[h[i]] = i; i = j;
            }
            h[i] = c; at[c] = i;
        }
        return top;
    }
}

/** Grows every capital at once: each cell's cheapest owner and its second (key: the cost from it, over its power).
 *  opt: { ow: the most owners there can be (64; the regions 1,024), allow(o, c): whether owner o may take cell c }. An owner
 *  with `cells` grows from each of them. */
function grow(S, cost, caps, power, L, opt = {}) {
    const { w, h, n } = S, OW = opt.ow ?? 64, I = OW > 127 ? Int16Array : Int8Array, allow = opt.allow, X = opt.lay?.X, A = opt.lay?.A;
    const own1 = new I(n).fill(-1), own2 = new I(n).fill(-1), key1 = new Float32Array(n).fill(Infinity), key2 = new Float32Array(n).fill(Infinity);
    const t1k = new Float64Array(n).fill(Infinity), t2k = new Float64Array(n).fill(Infinity), t1o = new I(n).fill(-1);
    const ns = Math.PI * R / h, ew = new Float64Array(h);
    for (let y = 0; y < h; y++) ew[y] = Math.max(1, 2 * Math.PI * R / w * Math.cos(Math.PI / 2 - (y + 0.5) * Math.PI / h));
    const H = new Heap(4 * n);
    const offer = (c, o, k) => {
        if (k > L || own2[c] >= 0 || own1[c] === o || (allow && !allow(o, c))) return;
        if (own1[c] < 0) {
            if (o === t1o[c]) { if (k < t1k[c]) { t1k[c] = k; H.push(k, c * OW + o); } return; }
            if (k < t1k[c]) { t2k[c] = Math.min(t2k[c], t1k[c]); t1k[c] = k; t1o[c] = o; H.push(k, c * OW + o); return; }
            if (k < t2k[c]) { t2k[c] = k; H.push(k, c * OW + o); }
            return;
        }
        if (k < t2k[c]) { t2k[c] = k; H.push(k, c * OW + o); }
    };
    caps.forEach((k, o) => { if (k.cells) for (const c of k.cells) offer(c, o, 0); else offer(k.c, o, 0); });   // (a province grows from all its land at once)
    while (H.n) {
        const k = H.k[0], v = H.pop(), c = (v / OW) | 0, o = v - c * OW;
        if (own2[c] >= 0 || own1[c] === o) continue;
        if (own1[c] < 0) { own1[c] = o; key1[c] = k; t2k[c] = Infinity; }
        else { own2[c] = o; key2[c] = k; }
        const y = (c / w) | 0, x = c - y * w, p = power[o], cc = cost[c], xc = X ? X[c] : 0, ac = A ? A[c] : 0;
        // (a step: its ground's cost; onto a bigger river than the one it is on, the crossing — a diagonal step between
        // two river cells crosses their river too; uphill, the climb)
        const step = (d, len, m1 = -1, m2 = -1) => {
            let e = len * 0.5 * (cc + cost[d]);
            if (X) {
                let xd = X[d] - xc;
                if (m1 >= 0) xd = Math.max(xd, Math.min(X[m1], X[m2]) - Math.max(xc, X[d]));
                if (xd > 0) e += xd;
                if (A[d] > ac && ac > 0) e += CLIMB_KM * (A[d] - ac) / 1000;
            }
            offer(d, o, k + e / p);
        };
        const xr = (x + 1) % w, xl = (x + w - 1) % w;
        step(y * w + xr, ew[y]); step(y * w + xl, ew[y]);
        if (y > 0) { const e = (ew[y] + ew[y - 1]) / 2, dg = Math.hypot(e, ns), u = (y - 1) * w; step(c - w, ns); step(u + xr, dg, u + x, y * w + xr); step(u + xl, dg, u + x, y * w + xl); }
        if (y < h - 1) { const e = (ew[y] + ew[y + 1]) / 2, dg = Math.hypot(e, ns), u = (y + 1) * w; step(c + w, ns); step(u + xr, dg, u + x, y * w + xr); step(u + xl, dg, u + x, y * w + xl); }
    }
    return { own1, own2, key1, key2 };
}

// (a cell's place: its finer site where the metric grid has one, else the cell's middle)
const latOfCell = (S, c) => { const i = S.at[c]; return i >= 0 ? 90 - (Math.floor(i / S.Mw) + 0.5) / S.Mh * 180 : 90 - (Math.floor(c / S.w) + 0.5) / S.h * 180; };
const lonOfCell = (S, c) => { const i = S.at[c]; return i >= 0 ? (i % S.Mw + 0.5) / S.Mw * 360 - 180 : (c % S.w + 0.5) / S.w * 360 - 180; };

/** Where each state's name goes (the overlay's labels): the land it holds farthest from its edge (a chamfer distance in
 *  km, round the world east–west), and how far that is — s.label = { lat, lon, km }. */
function labelPoints(S, states, own1, key1, L) {
    const { w, h, n, land } = S, ns = Math.PI * R / h, d = new Float32Array(n);
    const held = c => (land[c] && own1[c] >= 0 && key1[c] <= L ? own1[c] : -1);
    for (let c = 0; c < n; c++) {
        const a = held(c), y = (c / w) | 0, x = c - y * w;
        const edge = a < 0 || y === 0 || y === h - 1 || held(y * w + (x + 1) % w) !== a || held(y * w + (x + w - 1) % w) !== a || held(c - w) !== a || held(c + w) !== a;
        d[c] = a < 0 ? 0 : edge ? 0.5 * ns : Infinity;
    }
    const ew = y => Math.max(1, 2 * Math.PI * R / w * Math.cos(Math.PI / 2 - (y + 0.5) * Math.PI / h));
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 1; y < h; y++) { const e = ew(y), g = Math.hypot(e, ns); for (let x = 0; x < w; x++) { const c = y * w + x; if (!(d[c] > 0)) continue;
            d[c] = Math.min(d[c], d[y * w + (x + w - 1) % w] + e, d[c - w] + ns, d[(y - 1) * w + (x + w - 1) % w] + g, d[(y - 1) * w + (x + 1) % w] + g); } }
        for (let y = h - 2; y >= 0; y--) { const e = ew(y), g = Math.hypot(e, ns); for (let x = w - 1; x >= 0; x--) { const c = y * w + x; if (!(d[c] > 0)) continue;
            d[c] = Math.min(d[c], d[y * w + (x + 1) % w] + e, d[c + w] + ns, d[(y + 1) * w + (x + 1) % w] + g, d[(y + 1) * w + (x + w - 1) % w] + g); } }
    }
    const best = new Float32Array(states.length).fill(-1), at = new Int32Array(states.length).fill(-1);
    for (let c = 0; c < n; c++) { const a = held(c); if (a >= 0 && d[c] > best[a]) { best[a] = d[c]; at[a] = c; } }
    for (const s of states) {
        const c = at[s.i];
        s.label = c >= 0 ? { lat: 90 - ((c / w | 0) + 0.5) / h * 180, lon: (c % w + 0.5) / w * 360 - 180, km: best[s.i] } : null;
    }
    spines(S, states, held, d, at, best);
}

// The names written along the land, as an atlas does (fork addition; the owner, 2026-11-24: the empire and region names
// should be "edged into the terrain ... or at least write them on top instead of a floating text ... just like the
// normal atlases in geography class do"). Each state's and region's name runs along its spine: the long way through its
// land, bent as the land bends, spaced out to fill it.
/** core: the cells that weigh in the land's long way (those at least this share as far from the edge as its farthest);
 *  bins: the slices across it; keep: the slices the spine runs through (their land at least this share as thick as the
 *  thickest); round: under this ratio of its long way to its short, the land counts as round and its name runs east–west;
 *  span: the least the spine runs, a share of the land's breadth (twice its farthest from the edge), where it has land;
 *  bend: the most the spine bows from its chord (a share of its length); trim: the share of the kept slices it spans. */
export const SPINE = { core: 0.3, bins: 24, keep: 0.4, span: 1.2, round: 1.5, bend: 0.12, trim: 0.9, points: 9 };
/** Each item's spine — item.label.spine = [[lat, lon], …] (west to east as far as it can), item.label.len (km) — from
 *  the cells it holds weighted by how far each is from its edge (d): their long axis (the weighted principal axis, in a
 *  plane about the label point), each slice across it its weighted middle, a curve (a bounded quadratic) fitted to
 *  those middles over the slices thick enough to hold the name. */
function spines(S, items, held, d, at, best) {
    const m = at.length, byI = new Array(m);
    for (const it of items) if (it.i >= 0 && it.i < m) byI[it.i] = it;
    const { w, h, n } = S, KD = Math.PI * R / 180, F = SPINE, NB = F.bins;
    const la0 = new Float64Array(m), lo0 = new Float64Array(m), cl = new Float64Array(m);
    for (let i = 0; i < m; i++) if (at[i] >= 0) {
        la0[i] = 90 - ((at[i] / w | 0) + 0.5) / h * 180; lo0[i] = (at[i] % w + 0.5) / w * 360 - 180;
        cl[i] = Math.max(0.05, Math.cos(la0[i] * Math.PI / 180));
    }
    let X = 0, Y = 0;
    const xy = (c, i) => {
        const lat = 90 - ((c / w | 0) + 0.5) / h * 180, lon = (c % w + 0.5) / w * 360 - 180;
        X = ((lon - lo0[i] + 540) % 360 - 180) * cl[i] * KD; Y = (lat - la0[i]) * KD;
    };
    // (the weighted moments of the core)
    const M = new Float64Array(m * 6);
    for (let c = 0; c < n; c++) {
        const i = held(c);
        if (i < 0 || at[i] < 0 || !(d[c] >= F.core * best[i])) continue;
        xy(c, i); const wt = d[c], o = 6 * i;
        M[o] += wt; M[o + 1] += wt * X; M[o + 2] += wt * Y; M[o + 3] += wt * X * X; M[o + 4] += wt * X * Y; M[o + 5] += wt * Y * Y;
    }
    const ax = new Float64Array(m * 4);   // (mx, my, ux, uy)
    for (let i = 0; i < m; i++) {
        const o = 6 * i, sw = M[o];
        if (!(sw > 0)) continue;
        const mx = M[o + 1] / sw, my = M[o + 2] / sw, cxx = M[o + 3] / sw - mx * mx, cxy = M[o + 4] / sw - mx * my, cyy = M[o + 5] / sw - my * my;
        const tr = (cxx + cyy) / 2, df = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy), l1 = tr + df, l2 = Math.max(1e-6, tr - df);
        const th = Math.sqrt(l1 / l2) < F.round ? 0 : 0.5 * Math.atan2(2 * cxy, cxx - cyy);
        ax.set([mx, my, Math.cos(th), Math.sin(th)], 4 * i);
    }
    // (how far each reaches along its axis, then its slices: their weight, weighted middle and thickest land)
    const lo = new Float64Array(m).fill(Infinity), hi = new Float64Array(m).fill(-Infinity);
    const U = (i) => (X - ax[4 * i]) * ax[4 * i + 2] + (Y - ax[4 * i + 1]) * ax[4 * i + 3];
    for (let c = 0; c < n; c++) {
        const i = held(c);
        if (i < 0 || !(M[6 * i] > 0) || !(d[c] > 0)) continue;
        xy(c, i); const u = U(i);
        if (u < lo[i]) lo[i] = u; if (u > hi[i]) hi[i] = u;
    }
    const B = new Float64Array(m * NB * 3);
    for (let c = 0; c < n; c++) {
        const i = held(c);
        if (i < 0 || !(M[6 * i] > 0) || !(d[c] > 0)) continue;
        xy(c, i); const u = U(i), v = -(X - ax[4 * i]) * ax[4 * i + 3] + (Y - ax[4 * i + 1]) * ax[4 * i + 2];
        const k = Math.min(NB - 1, Math.floor((u - lo[i]) / Math.max(1e-6, hi[i] - lo[i]) * NB)), o = 3 * (i * NB + k);
        B[o] += d[c]; B[o + 1] += d[c] * v; if (d[c] > B[o + 2]) B[o + 2] = d[c];
    }
    for (let i = 0; i < m; i++) {
        const item = byI[i];
        if (!item?.label || !(M[6 * i] > 0) || !(hi[i] > lo[i])) continue;
        const [mx, my, ux, uy] = ax.subarray(4 * i, 4 * i + 4), bw = (hi[i] - lo[i]) / NB;
        // (the slices thick enough, run out both ways from the label point's)
        const u0 = -mx * ux - my * uy, k0 = Math.max(0, Math.min(NB - 1, Math.floor((u0 - lo[i]) / bw))), ok = k => B[3 * (i * NB + k) + 2] >= F.keep * best[i];
        let a = k0, b = k0;
        while (a > 0 && ok(a - 1)) a--;
        while (b < NB - 1 && ok(b + 1)) b++;
        // (and at least as long as the land is broad, where it has land there: a round land's name spans it, as an atlas's)
        const has = k => B[3 * (i * NB + k)] > 0;
        while ((b - a + 1) * bw < F.span * 2 * best[i]) {
            const l = a > 0 && has(a - 1) ? B[3 * (i * NB + a - 1) + 2] : -1, r = b < NB - 1 && has(b + 1) ? B[3 * (i * NB + b + 1) + 2] : -1;
            if (l < 0 && r < 0) break;
            if (l >= r) a--; else b++;
        }
        // (a quadratic v = p + q t + r t² through the slices' middles, t from the span's middle, weighted by their land)
        const uc = lo[i] + (a + b + 1) / 2 * bw, half = (b - a + 1) / 2 * bw;
        const N = new Float64Array(9), Z = new Float64Array(3);
        for (let k = a; k <= b; k++) {
            const o = 3 * (i * NB + k), wt = B[o];
            if (!(wt > 0)) continue;
            const t = (lo[i] + (k + 0.5) * bw - uc) / half, v = B[o + 1] / wt, f = [1, t, t * t];
            for (let r = 0; r < 3; r++) { Z[r] += wt * f[r] * v; for (let s = 0; s < 3; s++) N[3 * r + s] += wt * f[r] * f[s]; }
        }
        let [p, q, r] = solve3(N, Z);
        // (kept gentle: an atlas's name bows, it never snakes)
        const lim = F.bend * 2 * half;
        q = Math.max(-0.35 * half, Math.min(0.35 * half, q)); r = Math.max(-lim, Math.min(lim, r));
        const pts = [];
        for (let j = 0; j < F.points; j++) {
            const t = F.trim * (2 * j / (F.points - 1) - 1), u = uc + t * half, v = p + q * t + r * t * t;
            const x = mx + u * ux - v * uy, y = my + u * uy + v * ux;
            pts.push([+(la0[i] + y / KD).toFixed(3), +(lo0[i] + x / (cl[i] * KD)).toFixed(3)]);
        }
        item.label.spine = pts; item.label.len = 2 * F.trim * half;
    }
}
/** The solution of a 3×3 system (row-major N, right side Z); a straight line, or the mean, where it is singular. */
function solve3(N, Z) {
    const det = (a) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
    const D0 = det(N);
    if (Math.abs(D0) > 1e-9 * (N[0] * N[4] * N[8] || 1)) {
        const out = [];
        for (let c = 0; c < 3; c++) { const A = N.slice(); for (let r = 0; r < 3; r++) A[3 * r + c] = Z[r]; out.push(det(A) / D0); }
        if (out.every(Number.isFinite)) return out;
    }
    const d2 = N[0] * N[4] - N[1] * N[3];
    if (Math.abs(d2) > 1e-9) return [(Z[0] * N[4] - N[1] * Z[1]) / d2, (N[0] * Z[1] - Z[0] * N[3]) / d2, 0];
    return [N[0] ? Z[0] / N[0] : 0, 0, 0];
}

/** The settlements, tier under tier — a central-place hierarchy (Christaller's, 1933): each tier's places spaced about
 *  twice as close as the tier above's, the best sites taken first. In km, so it reads the same at every Detail:
 *  - city: the best city sites by how many the land round them could feed, up to CITY_MOST a state (they get the roads);
 *  - town: a market town for its countryside, where the land feeds at least TOWN_DENS a km²;
 *  - village: the farmland's own, where it feeds at least VILLAGE_DENS a km² (a village per ~VILLAGE_KM of it: the
 *    grid can't hold the real ones, a few km apart, so these stand for the bigger of them).
 *  The overlay shows each tier once its spacing reads on the screen (the zoom). */
export const TIERS = { cityKm: 280, townKm: 130, villageKm: 65 };
const CITY_MOST = 12, TOWN_DENS = 4, VILLAGE_DENS = 1, MOST_PLACES = 24000;
/** A spacing check over the grid: whether a place keeps `km` from all the places added, looked up in the cells round it. */
function spacer(S) {
    const { w, h, rowKm } = S, at = new Map();
    const cellOf = (lat, lon) => [Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / 180 * h))), Math.min(w - 1, Math.floor((lon + 180) / 360 * w))];
    return {
        free(lat, lon, km) {
            const [y, x] = cellOf(lat, lon), ry = Math.ceil(km / rowKm), rx = Math.min(w >> 1, Math.ceil(km / (rowKm * Math.max(0.05, Math.cos((Math.abs(lat) + ry * rowKm / 111) * D)))));
            for (let yy = Math.max(0, y - ry); yy <= Math.min(h - 1, y + ry); yy++) for (let dx = -rx; dx <= rx; dx++) {
                const l = at.get(yy * w + (x + dx + w) % w);
                if (l) for (const p of l) if (arcKm(p.lat, p.lon, lat, lon) < km) return false;
            }
            return true;
        },
        /** The nearest place added within km that ok() takes, or null. */
        nearest(lat, lon, km, ok) {
            const [y, x] = cellOf(lat, lon), ry = Math.ceil(km / rowKm), rx = Math.min(w >> 1, Math.ceil(km / (rowKm * Math.max(0.05, Math.cos((Math.abs(lat) + ry * rowKm / 111) * D)))));
            let best = null, bd = km;
            for (let yy = Math.max(0, y - ry); yy <= Math.min(h - 1, y + ry); yy++) for (let dx = -rx; dx <= rx; dx++) {
                const l = at.get(yy * w + (x + dx + w) % w);
                if (l) for (const p of l) { const d = arcKm(p.lat, p.lon, lat, lon); if (d < bd && (!ok || ok(p))) { bd = d; best = p; } }
            }
            return best;
        },
        add(p) { const [y, x] = cellOf(p.lat, p.lon), k = y * w + x; (at.get(k) ?? at.set(k, []).get(k)).push(p); },
    };
}
/** The cities (the overlay names them first; each gets a road to its capital). [{ c, lat, lon, state, name }] */
function townsOf(S, caps, states, own1, key1, L, o, sp) {
    const { n, land, site, within } = S, gap = Math.max(TIERS.cityKm, 0.12 * caps.apart), cand = [];
    for (let c = 0; c < n; c++) {
        if (!land[c] || own1[c] < 0 || key1[c] > L || site[c] < 0.3) continue;
        cand.push([site[c] * Math.log10(2 + within[c]) * (0.85 + 0.3 * hash(c, 11, o.roll)), c]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const per = new Uint8Array(states.length), towns = [];
    for (const [, c] of cand) {
        const a = own1[c];
        if (per[a] >= CITY_MOST) continue;
        const lat = latOfCell(S, c), lon = lonOfCell(S, c);
        if (!sp.free(lat, lon, gap)) continue;
        const t = { c, lat, lon, state: a, rank: 'city', name: nameOf(Math.round(lat * 10), Math.round(lon * 10), o.roll + 1) };
        sp.add(t); per[a]++; towns.push(t);
    }
    return towns;
}
/** The towns and the villages under the cities: by the people the land about them could feed (a little of the site's
 *  worth too), each tier spaced its own km from every place above it and beside it. [{ c, lat, lon, state, rank, name }] */
function smallPlaces(S, own1, key1, L, o, sp, out) {
    const { w, n, land, site, pop, area } = S;
    for (const [rank, km, dens, salt] of [['town', TIERS.townKm, TOWN_DENS, 3], ['village', TIERS.villageKm, VILLAGE_DENS, 4]]) {
        const cand = [];
        for (let c = 0; c < n; c++) {
            if (!land[c] || own1[c] < 0 || key1[c] > L || S.at[c] < 0) continue;
            const d = pop[c] / area[(c / w) | 0];
            if (d < dens) continue;
            cand.push([(0.4 + site[c]) * Math.log10(1 + d) * (0.8 + 0.4 * hash(c, 13 + salt, o.roll)), c]);
        }
        cand.sort((a, b) => b[0] - a[0]);
        for (const [, c] of cand) {
            if (out.length >= MOST_PLACES) return;
            const lat = latOfCell(S, c), lon = lonOfCell(S, c);
            if (!sp.free(lat, lon, km)) continue;
            const p = { c, lat, lon, state: own1[c], rank, name: nameOf(Math.round(lat * 10), Math.round(lon * 10), o.roll + salt) };
            sp.add(p); out.push(p);
        }
    }
}
/** The places by the deposits worth working — gold and silver, gems, tin and copper, salt, jade — which the farmland
 *  alone never sites: the mountains and the dry country they form in feed few (Potosí, Kutná Hora, the Rand, the opal
 *  fields of the desert all stood where farming would not have put them). Each cell held by a state whose deposits are
 *  worth MINE.least or more (worthAt: WORTH × richness), the dearest first: a place already within MINE.joinKm works it
 *  (the worth of its deposits counts its miners, peopleOf; a village by one worth MINE.townWorth grows into a town);
 *  else a new place there, a town if worth MINE.townWorth, else a village, spaced MINE.apartKm from the other new ones
 *  and MINE.clearKm from every place, at most MINE.perState a state. Into each such place: res { name, kind, worth,
 *  made (a new place) }. Returns the new places. */
export const MINE = { least: 0.3, townWorth: 0.8, joinKm: 30, apartKm: 60, clearKm: 30, perState: 40, people: 15000 };
function minesOf(S, own1, key1, L, o, states, all) {
    const { n, land } = S, cand = [];
    for (let c = 0; c < n; c++) {
        if (!land[c] || own1[c] < 0 || key1[c] > L || S.at[c] < 0) continue;
        const list = depositsNear(S, c, 0), wv = worthAt(list);
        if (wv >= MINE.least) cand.push([wv * (0.9 + 0.2 * hash(c, 21, o.roll)), wv, c, list[0]]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const sp = spacer(S), fresh = spacer(S), per = new Uint16Array(states.length), made = [];
    for (const p of all) sp.add(p);
    for (const [, wv, c, top] of cand) {
        const lat = latOfCell(S, c), lon = lonOfCell(S, c), a = own1[c];
        const res = { name: top.name, kind: top.kind, worth: Math.min(1.25, wv) };
        const there = sp.nearest(lat, lon, MINE.joinKm, p => p.state === a && p.rank !== 'fort');
        if (there) {
            if (!there.res || there.res.worth < res.worth) there.res = { ...res, made: !!there.res?.made };
            if (there.rank === 'village' && wv >= MINE.townWorth) there.rank = 'town';
            continue;
        }
        if (per[a] >= MINE.perState || !sp.free(lat, lon, MINE.clearKm) || !fresh.free(lat, lon, MINE.apartKm)) continue;
        const p = { c, lat, lon, state: a, rank: wv >= MINE.townWorth ? 'town' : 'village', res: { ...res, made: true }, name: nameOf(Math.round(lat * 10), Math.round(lon * 10), o.roll + 7) };
        sp.add(p); fresh.add(p); per[a]++; made.push(p);
    }
    return made;
}
/** How many live in each place, as City size counts them (city-view.js): the surplus of the land it can reach (SURPLUS
 *  of the people it could feed: farmers eat the rest), each field's share falling with the haul (to about a third every
 *  SHARE.decayDays by cart), shared with every other place of its state that reaches the same land (Reilly's and Huff's
 *  gravity: each pulls by its tier's weight over the distance squared), and the share of that food the place itself
 *  eats (the rest feeds the market towns and hamlets too small to show). A port or a river town hauls its food half as
 *  far again. Land no place reaches feeds its farms and hamlets alone. Into each place: people (in it), fed (its
 *  hinterland, decayed); into each state: inPlaces (all its places' people). Tunables, each a physical quantity. */
export const PEOPLE = {
    reachKm: { cap: 350, city: 220, town: 110, fort: 70, village: 55 },   // (how far its market draws food, by cart)
    pull: { cap: 10, city: 5, town: 2, fort: 1, village: 1 },             // (its weight against the others)
    lives: { cap: 1, city: 0.8, town: 0.4, fort: 0.2, village: 0.12 },   // (the share of its food it eats itself)
    water: 1.5,   // (a port's or a river town's reach, times)
    nearKm: 15,   // (the distance added before squaring: its own land is not infinitely its own)
};
/** How far a place's market draws food, km. */
export const feedKm = p => PEOPLE.reachKm[p.rank] * (p.why?.includes('port') || p.river ? PEOPLE.water : 1);
function peopleOf(S, own1, key1, L, states, all) {
    const { w, h, n, land, pop, rowKm } = S, colKm = 2 * Math.PI * R / w, Q = PEOPLE, tot = new Float64Array(n);
    // (each place's cells within reach, and its pull on each: worked out once, used twice)
    const reach = (p, f) => {
        const r = feedKm(p), pw = Q.pull[p.rank] * (p.hub || p.market ? 1.4 : 1);
        const y0 = (p.c / w) | 0, x0 = p.c - y0 * w, ry = Math.ceil(r / rowKm);
        for (let dy = -ry; dy <= ry; dy++) {
            const y = y0 + dy;
            if (y < 0 || y >= h) continue;
            const ck = colKm * Math.max(0.05, Math.cos((90 - (y + 0.5) / h * 180) * D)), rx = Math.min(w >> 1, Math.ceil(r / ck));
            for (let dx = -rx; dx <= rx; dx++) {
                const c = y * w + (x0 + dx + w) % w;
                if (!land[c] || own1[c] !== p.state || key1[c] > L || pop[c] <= 0) continue;
                const d = Math.hypot(dy * rowKm, dx * ck);
                if (d <= r) f(c, pw / ((d + Q.nearKm) * (d + Q.nearKm)), d);
            }
        }
    };
    // (and each cell's strongest pull: the place it would sell its food to, drawn as that place's reach when it is picked)
    const top = new Float64Array(n), feeder = new Int32Array(n).fill(-1);
    all.forEach((p, i) => { p.i = i; p.km2 = 0; reach(p, (c, g) => { tot[c] += g; if (g > top[c]) { top[c] = g; feeder[c] = i; } }); });
    for (let c = 0; c < n; c++) if (feeder[c] >= 0) all[feeder[c]].km2 += S.area[(c / w) | 0];
    for (const s of states) s.inPlaces = 0;
    for (const p of all) {
        let fed = 0;
        const lam = SHARE.decayDays * CART_KM * feedKm(p) / Q.reachKm[p.rank];
        reach(p, (c, g, d) => { fed += pop[c] * g / tot[c] * Math.exp(-d / lam); });
        // (and a place by a deposit, its miners, smelters and carters: fed by the food it buys — MINE.people where one
        //  is worth 1, falling with the square of its worth: a rich silver lode a Kutná Hora, a garnet pit a hamlet)
        p.miners = p.res ? MINE.people * p.res.worth * p.res.worth : 0;
        p.fed = fed; p.people = fed * SURPLUS * Q.lives[p.rank] + p.miners;
        states[p.state].inPlaces += p.people;
    }
    return { feeder, all };
}
/** The narrows the roads run through, worth a fort whoever's border is near: a valley or a river's pass where high
 *  ground closes in on both sides (Thermopylae, the Iron Gates, the Khyber), on the ground the people hold. Read off the
 *  finished heights (km, so the same at every Detail): the lowest point of each road cell is the floor; on the best of
 *  four axes through it the ground rises `rise` m or more within `flankKm` on both sides, while along the valley (the
 *  axis across it) it rises less than half that. The fort stands up on the nearer flank, over the way through.
 *  Scored by how high the flanks stand, the road's traffic and a river; the best first. */
export const FORT = { rise: 300, flankKm: 15, stepKm: 1.5, apartKm: 110, perState: 4, least: 0.35 };
function narrowsOf(fin, S, routes, main, own1, key1, L) {
    const P = fin.raster, Hm = P.heightM;
    if (!Hm) return [];
    const pw = P.w, ph = P.h ?? Math.round(P.ocean.length / pw), { w, h, land, riv } = S;
    const hAt = (lat, lon) => Hm[Math.min(ph - 1, Math.max(0, Math.floor((90 - lat) / 180 * ph))) * pw + ((Math.floor((lon + 180) / 360 * pw) % pw) + pw) % pw];
    const step = (lat, lon, a, km) => { const d = km / R / D; return [lat + d * Math.sin(a), lon + d * Math.cos(a) / Math.max(0.05, Math.cos(lat * D))]; };
    const best = new Map();   // (cell → its candidate: one per cell, the best road's)
    for (const r of routes) {
        if (r.tier > 2) continue;
        for (const c of r.cells) {
            const a0 = own1[c];
            if (!land[c] || a0 < 0 || key1[c] > L) continue;
            // (the floor: the lowest of 4 × 4 points across the cell)
            const y = (c / w) | 0, x = c - y * w;
            let fl = Infinity, flat = 0, flon = 0;
            for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
                const lat = 90 - (y + (j + 0.5) / 4) / h * 180, lon = (x + (i + 0.5) / 4) / w * 360 - 180, v = hAt(lat, lon);
                if (v < fl) { fl = v; flat = lat; flon = lon; }
            }
            if (fl <= 0) continue;
            // (each side of each axis: how high it rises within flankKm, and where its crest is)
            const side = [];
            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4;
                let top = 0, at = 0;
                for (let km = FORT.stepKm; km <= FORT.flankKm + 1e-6; km += FORT.stepKm) {
                    const [la, lo] = step(flat, flon, a, km), v = hAt(la, lo) - fl;
                    if (v > top) { top = v; at = km; }
                }
                side.push([top, at, a]);
            }
            let ax = -1, across = 0;
            for (let k = 0; k < 4; k++) { const v = Math.min(side[k][0], side[k + 4][0]); if (v > across) { across = v; ax = k; } }
            if (across < FORT.rise) continue;
            const q = (ax + 2) % 4, along = Math.min(side[q][0], side[q + 4][0]);
            if (along >= 0.5 * across) continue;
            const river = riv[c] >= CROSS_Q[0];
            const score = smooth(FORT.rise, 3 * FORT.rise, across) * (1 + 0.3 * Math.log2(1 + main[c])) * (r.tier === 1 ? 1.3 : 1) + (river ? 0.3 : 0);
            if (score < FORT.least || best.get(c)?.score >= score) continue;
            // (the fort: up the nearer flank, three-fifths of the way to its crest)
            const fs = side[ax][1] <= side[ax + 4][1] ? side[ax] : side[ax + 4], [lat, lon] = step(flat, flon, fs[2], 0.6 * fs[1]);
            const yy = Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / 180 * h))), xx = ((Math.floor((lon + 180) / 360 * w) % w) + w) % w, cf = yy * w + xx;
            const fc = land[cf] && own1[cf] === a0 && key1[cf] <= L ? cf : c;
            best.set(c, { c: fc, lat, lon, state: a0, score, kind: river ? 'river pass' : 'valley narrows', ends: r.ends });
        }
    }
    return [...best.values()].sort((p, q) => q.score - p.score);
}
/** The forts: one on each side of every crossing between two states that is worth guarding — a mountain pass, a ford
 *  of a navigable river, a strait, a way through the marshes, a gap — on the state's own land nearest the crossing. A
 *  city or town already standing there is the fort instead (it gains the reason); else a new place. Open frontiers and
 *  crossings of the open sea get none. Then the narrows on the roads (narrowsOf), the best first, FORT.apartKm from
 *  every fort and FORT.perState to a state. */
function fortsOf(S, chokes, states, own1, key1, L, o, cities, places, narrows = []) {
    const { w, h, land, rowKm } = S, forts = [], near = 0.75 * TIERS.villageKm;
    const mine = (c, a) => c >= 0 && land[c] && S.at[c] >= 0 && own1[c] === a && key1[c] <= L;
    /** The state's land cell nearest c (c itself when it is), within ~250 km. */
    const landOf = (c, a) => {
        if (mine(c, a)) return c;
        const y = (c / w) | 0, x = c - y * w, r = Math.ceil(250 / rowKm);
        let best = -1, bd = Infinity;
        for (let dy = -r; dy <= r; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -r; dx <= r; dx++) { const d = yy * w + (x + dx + w) % w, k = dx * dx + dy * dy; if (k < bd && mine(d, a)) { bd = k; best = d; } }
        }
        return best;
    };
    for (const k of chokes) {
        if (k.kind === 'open frontier' || k.kind === 'sea crossing') continue;
        for (const [c0, a, b] of [[k.at, own1[k.at], own1[k.at2]], [k.at2, own1[k.at2], own1[k.at]]]) {
            if (a < 0 || b < 0) continue;
            const c = landOf(c0, a);
            if (c < 0) continue;
            const lat = latOfCell(S, c), lon = lonOfCell(S, c), guards = { kind: k.kind, to: states[b].name };
            const there = cities.concat(places).find(p => p.state === a && p.rank !== 'village' && arcKm(p.lat, p.lon, lat, lon) < near);
            if (there) { (there.guards ??= []).push(guards); continue; }
            const f = forts.find(p => p.state === a && arcKm(p.lat, p.lon, lat, lon) < near);
            if (f) { f.guards.push(guards); continue; }
            forts.push({ c, lat, lon, state: a, rank: 'fort', guards: [guards], name: nameOf(Math.round(lat * 10), Math.round(lon * 10), o.roll + 6) });
        }
    }
    const inner = new Uint16Array(states.length), held = cities.concat(places);
    for (const k of narrows) {
        const { c, lat, lon, state: a } = k;
        if (inner[a] >= FORT.perState || forts.some(f => arcKm(f.lat, f.lon, lat, lon) < FORT.apartKm)
            || held.some(p => p.guards && arcKm(p.lat, p.lon, lat, lon) < FORT.apartKm)) continue;
        const guards = { kind: k.kind, road: k.ends.filter(e => e !== 'a fork') };
        inner[a]++;
        const there = held.find(p => p.state === a && p.rank !== 'village' && arcKm(p.lat, p.lon, lat, lon) < near);
        if (there) { (there.guards ??= []).push(guards); continue; }
        forts.push({ c, lat, lon, state: a, rank: 'fort', guards: [guards], name: nameOf(Math.round(lat * 10), Math.round(lon * 10), o.roll + 6) });
    }
    // (a village standing on a fort's ground gives way to it)
    for (let i = places.length - 1; i >= 0; i--) if (places[i].rank === 'village' && forts.some(f => arcKm(f.lat, f.lon, places[i].lat, places[i].lon) < near)) places.splice(i, 1);
    return forts;
}

// ── the roads, the trade hubs, and why each place stands ──
/** The road network: every place (the capitals, cities, towns and villages) joined to its near neighbours, as roads
 *  grow — from the places outward, each settling for the one next door, not a far capital.
 *  - Each place's own ground: a multi-source shortest-path growth over the travel cost from every place at once (its
 *    cost-weighted Voronoi cell). Two places whose grounds meet are neighbours, joined by the cheapest way across their
 *    meeting: down each one's own shortest-path tree.
 *  - Kept: the links no third place stands between (the relative-neighbourhood graph, Toussaint 1980, by travel cost):
 *    the sparse, planar web real road networks look like.
 *  - The main roads (tier 0): each city's way to its capital, and each capital's to the capitals it borders, the
 *    cheapest along that web, so they run through the towns between and merge as they near the capital.
 *  - The roads (tier 1): each town's way to its nearest city or capital. The tracks (tier 2): each village's way to its
 *    nearest town or above, and the short links between near neighbours (under ROAD.trackOver of the median link).
 *  - The hubs: the towns and cities where the goods of different places first meet on their ways up (goodsMeet:
 *    worth ROAD.meetHub or more), ranked by that worth (× ROAD.meetW), then as junctions — the main roads and roads (not
 *    tracks) meeting there, the ways of the places round that pass through it (a village 1, a town 3, a city 8) and a
 *    landing; about ROAD.hubsPer a state at most, spaced (a town grows into a city). The villages the most tracks run
 *    through (ROAD.marketPass or more), or where goods worth ROAD.meetMarket meet, clear of any town, grow into market
 *    towns: towns, not hubs. Into each hub and market town: meets (the goods meeting there, in words).
 *  Returns { main (how many main roads cross each cell), routes: [{ ends, cells, tier }], added (towns grown into
 *  cities: out of places, for the cities) }. */
const ROAD = { trackOver: 1.6, marketPass: 6, hubRoads: 3, hubsPer: 1.5, meetW: 3, meetHub: 0.5, meetMarket: 1 };
/** Where goods meet (Ullman's complementarity: trade runs between places that make what the other lacks; Cooley's
 *  break-of-bulk: towns rise where goods change hands — a coast, a mountain's foot, the edge of the steppe). Each place
 *  makes its goods (GOODS): its ways of life (farming grain, herding livestock, gathering furs and game; S.life), the
 *  sea's trade on a coast, and the deposits worth working round it (depositsNear, and a place's own, res). The goods
 *  travel up each place's way (a village's to its town, a town's to its city, a city's to its capital, and the
 *  capitals' to each other), gathering what the places along it make. At each place, the goods arriving by each road
 *  (and its own) are a branch; where they meet: the worth of all of them together less the dearest branch's (0 where
 *  one road brings everything, as on the way down from a hub — the goods meet the first time at the hub, not after).
 *  Returns { meet (per place), names(i) (the goods meeting there, the dearest first, in words) }. */
function goodsMeet(S, nodes, N, K, tierOf, up, across) {
    const own = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
        const p = nodes[i], l = S.life[p.c];
        let m = (l & 1 ? GOOD_BIT.grain : 0) | (l & 2 ? GOOD_BIT.herds : 0) | (l & 4 ? GOOD_BIT.furs : 0) | (S.shore[p.c] ? GOOD_BIT.sea : 0);
        for (const d of depositsNear(S, p.c)) if (d.worth >= MINE.least) m |= GOOD_BIT[d.good];
        if (p.res) for (const d of depositsNear(S, p.c, 0)) if (d.worth >= MINE.least) m |= GOOD_BIT[d.good];
        own[i] = m;
    }
    const carry = own.slice(), inc = Array.from({ length: N }, () => new Map());
    const send = (r, m) => { for (let k = 1; k < r.length; k++) { const u = r[k], v = r[k - 1]; inc[u].set(v, (inc[u].get(v) ?? 0) | m); carry[u] |= m; } };
    // (the smallest first, so a town sends on what its villages brought it)
    const order = [];
    for (let i = 0; i < N; i++) if (up[i]) order.push(i);
    order.sort((a, b) => tierOf(b) - tierOf(a));
    for (const i of order) send(up[i], carry[i]);
    for (const r of across) { send(r, carry[r[0]]); send(r.slice().reverse(), carry[r[r.length - 1]]); }
    const meet = new Float32Array(N), all = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
        let u = own[i], top = goodsWorth(own[i]), ways = own[i] ? 1 : 0;
        for (const m of inc[i].values()) { u |= m; top = Math.max(top, goodsWorth(m)); if (m) ways++; }
        all[i] = u;
        meet[i] = ways >= 2 ? goodsWorth(u) - top : 0;
    }
    const names = i => GOODS.map((g, k) => [g, k]).filter(([, k]) => all[i] & (1 << k)).sort((a, b) => b[0][1] - a[0][1]).map(([g]) => g[2]);
    return { meet, names };
}
function roadsOf(S, cost, meet, states, caps, cities, places, o) {
    const { w, h, n } = S, K = caps.length;
    caps.forEach((k, i) => { k.state = i; });
    const nodes = caps.concat(cities, places.filter(p => p.rank !== 'fort')), N = nodes.length;
    const tierOf = i => (i < K ? 0 : nodes[i].rank === 'city' ? 1 : nodes[i].rank === 'town' ? 2 : 3);
    // (each place's ground)
    const dist = new Float64Array(n).fill(Infinity), vo = new Int32Array(n).fill(-1), par = new Int32Array(n).fill(-1);
    const ns = Math.PI * R / h, ew = new Float64Array(h), dgUp = new Float64Array(h);
    for (let y = 0; y < h; y++) ew[y] = Math.max(1, 2 * Math.PI * R / w * Math.cos(Math.PI / 2 - (y + 0.5) * Math.PI / h));
    for (let y = 1; y < h; y++) dgUp[y] = Math.hypot((ew[y] + ew[y - 1]) / 2, ns);
    // (a step's cost: its ground's, and the height climbed or come down on land)
    const { land, alt } = S, CL = ROAD_LAY.climbKm / 1000;
    const stepCost = (c, d, len) => len * 0.5 * (cost[c] + cost[d]) + (land[c] && land[d] ? CL * Math.abs(alt[d] - alt[c]) : 0);
    // (a cell's eight neighbours, f(d, len))
    const around = (c, f) => {
        const y = (c / w) | 0, x = c - y * w, xr = (x + 1) % w, xl = (x + w - 1) % w;
        f(y * w + xr, ew[y]); f(y * w + xl, ew[y]);
        if (y > 0) { const dg = dgUp[y], u = (y - 1) * w; f(c - w, ns); f(u + xr, dg); f(u + xl, dg); }
        if (y < h - 1) { const dg = dgUp[y + 1], u = (y + 1) * w; f(c + w, ns); f(u + xr, dg); f(u + xl, dg); }
    };
    // (each cell in the heap at most once, its key lowered in place: no stale entries piling up on a large world, and the
    //  keys at full precision, so a cell is never passed over as stale when it is not)
    const H = new CellHeap(n, dist);
    nodes.forEach((p, i) => { if (vo[p.c] < 0) { vo[p.c] = i; dist[p.c] = 0; H.lower(p.c); } });
    while (H.n) {
        const c = H.pop(), k = dist[c];
        around(c, (d, len) => { const v = k + stepCost(c, d, len); if (v < dist[d] && H.at[d] !== -2) { dist[d] = v; vo[d] = vo[c]; par[d] = c; H.lower(d); } });
    }
    // (the neighbours: whose grounds meet, and the cheapest way across)
    const ekey = (a, b) => (a < b ? a * N + b : b * N + a), E = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = y * w + x, a = vo[c];
        if (a < 0) continue;
        const pairs = [[y * w + (x + 1) % w, ew[y]]];
        if (y < h - 1) { const e = (ew[y] + ew[y + 1]) / 2, dg = Math.hypot(e, ns); pairs.push([c + w, ns], [(y + 1) * w + (x + 1) % w, dg], [(y + 1) * w + (x + w - 1) % w, dg]); }
        for (const [d, len] of pairs) {
            const b = vo[d];
            if (b < 0 || b === a) continue;
            const wt = dist[c] + dist[d] + stepCost(c, d, len), kk = ekey(a, b), e = E.get(kk);
            if (!e || wt < e.wt) E.set(kk, { a, b, wt, c, d, tier: 3, main: 0 });
        }
    }
    // (kept: the links with no third place nearer to both ends)
    const all = Array.from({ length: N }, () => []);
    for (const e of E.values()) { all[e.a].push(e); all[e.b].push(e); }
    const adj = Array.from({ length: N }, () => []), links = [];
    for (const e of E.values()) {
        let lune = false;
        for (const f of all[e.a]) {
            if (f.wt >= e.wt) continue;
            const k = f.a === e.a ? f.b : f.a, g = k === e.b ? null : E.get(ekey(e.b, k));
            if (g && g.wt < e.wt) { lune = true; break; }
        }
        if (!lune) { adj[e.a].push(e); adj[e.b].push(e); links.push(e); }
    }
    // (the cheapest ways along the web: from the sources, along the links ok() allows, stopping at tgt if one is given)
    const gd = new Float64Array(N), gp = new Int32Array(N), gH = new Heap(4 * N);
    const ways = (srcs, ok, tgt = -1) => {
        gd.fill(Infinity); gp.fill(-1); gH.n = 0;
        for (const s of srcs) { gd[s] = 0; gH.push(0, s); }
        while (gH.n) {
            const k = gH.k[0], u = gH.pop();
            if (k > gd[u]) continue;
            if (u === tgt) break;
            for (const e of adj[u]) {
                const v = e.a === u ? e.b : e.a;
                if (ok && !ok(u, v)) continue;
                const nk = k + e.wt;
                if (nk < gd[v]) { gd[v] = nk; gp[v] = u; gH.push(nk, v); }
            }
        }
    };
    const st = i => nodes[i].state;
    const pass = new Float32Array(N), mainPass = new Uint16Array(N);
    // (a place's way back along gp: its links take the tier, the places it runs through count it)
    const take = (i, tier, weight, rec) => {
        if (rec) rec.push(i);
        for (let v = i, g = 0; gp[v] >= 0 && g < N; g++) {
            const u = gp[v], e = E.get(ekey(u, v));
            if (rec) rec.push(u);
            if (tier < e.tier) e.tier = tier;
            if (tier === 0) e.main++;
            if (gp[u] >= 0) { pass[u] += weight; if (tier === 0) mainPass[u]++; }
            v = u;
        }
    };
    // (each place's way up — a village's to its town, a town's to its city, a city's to its capital — and the capitals'
    //  ways to each other, as lists of places from the start: the goods' ways, goodsMeet)
    let up = [], across = [];
    const net = () => {
        for (const e of links) { e.tier = 3; e.main = 0; }
        pass.fill(0); mainPass.fill(0);
        up = Array.from({ length: N }, () => null); across = [];
        const same = (u, v) => st(u) === st(v), byTier = [[], [], [], []];
        for (let i = 0; i < N; i++) byTier[tierOf(i)].push(i);
        // (the main roads: the cities to their capitals, the capitals to the capitals they border)
        for (let s = 0; s < K; s++) {
            const mine = byTier[1].filter(i => st(i) === s);
            if (!mine.length) continue;
            ways([s], same);
            for (const i of mine) take(i, 0, 8, up[i] = []);
        }
        for (const m of meet.values()) {
            if (m.at < 0) continue;
            ways([m.a], (u, v) => st(v) === m.a || st(v) === m.b, m.b);
            if (gd[m.b] < Infinity) { const r = []; take(m.b, 0, 0, r); across.push(r); }
        }
        // (the towns to their nearest city or capital; the villages to their nearest town or above)
        ways(byTier[0].concat(byTier[1]), same);
        for (const i of byTier[2]) take(i, 1, 3, up[i] = []);
        ways(byTier[0].concat(byTier[1], byTier[2]), same);
        for (const i of byTier[3]) take(i, 2, 1, up[i] = []);
        // (and the short links between near neighbours)
        const wts = links.filter(e => same(e.a, e.b)).map(e => e.wt).sort((a, b) => a - b), cut = ROAD.trackOver * (wts[wts.length >> 1] ?? 0);
        for (const e of links) if (e.tier === 3 && same(e.a, e.b) && e.a >= K && e.b >= K && e.wt <= cut) e.tier = 2;
    };
    net();
    // (the goods each place makes, and where the goods of different places first meet on their ways up)
    const G = goodsMeet(S, nodes, N, K, tierOf, up, across);
    // (the hubs: the towns and cities where the goods of different places first meet (goodsMeet: worth ROAD.meetHub
    // or more), the more and the dearer the better — then, among those, the junctions: the more drawn roads (main
    // roads and roads, not tracks) and main roads, the traffic through it and a landing; spaced, about 1.5 a state at
    // most, none where nothing meets — then the local markets among the villages, which are towns, not hubs: the
    // busiest crossroads of tracks, and the villages where goods worth ROAD.meetMarket meet)
    const near = 0.15 * caps.apart, gap = Math.max(120, 0.25 * caps.apart), most = Math.max(2, Math.round(ROAD.hubsPer * K));
    const landing = i => (S.shore[nodes[i].c] ? 0.5 : 0) + (S.nav[nodes[i].c] ? 0.5 : 0);
    const cand = [];
    for (let i = K; i < N; i++) {
        if (tierOf(i) > 2) continue;
        let roads = 0, mains = 0;
        for (const e of adj[i]) { if (e.tier <= 1) roads++; if (e.tier === 0) mains++; }
        if (G.meet[i] < ROAD.meetHub) continue;
        cand.push([mains + 0.5 * roads + 0.3 * Math.log2(1 + pass[i]) + landing(i) + ROAD.meetW * G.meet[i], i]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const hubs = [], added = [];
    for (const [, i] of cand) {
        if (hubs.length >= most) break;
        const p = nodes[i];
        if (caps.some(k => arcKm(k.lat, k.lon, p.lat, p.lon) < near) || hubs.some(q => arcKm(q.lat, q.lon, p.lat, p.lon) < gap)) continue;
        p.hub = true; hubs.push(p);
        if (p.rank === 'town') { p.rank = 'city'; added.push(p); }
    }
    const sp = spacer(S);
    for (let i = 0; i < N; i++) if (tierOf(i) <= 2) sp.add(nodes[i]);
    const vill = [];
    for (let i = K; i < N; i++) if (nodes[i].rank === 'village' && (pass[i] >= ROAD.marketPass || G.meet[i] >= ROAD.meetMarket)) vill.push(i);
    vill.sort((a, b) => pass[b] + 6 * G.meet[b] - pass[a] - 6 * G.meet[a]);
    for (const i of vill) {
        const p = nodes[i];
        if (!sp.free(p.lat, p.lon, 0.7 * TIERS.townKm)) continue;
        p.rank = 'town'; p.market = true; sp.add(p);
    }
    // (the goods that meet at each hub and market town, the dearest first)
    for (let i = K; i < N; i++) if ((nodes[i].hub || nodes[i].market) && G.meet[i] > 0) nodes[i].meets = G.names(i);
    for (const p of added) places.splice(places.indexOf(p), 1);
    // (the network again, with the hubs in their new tiers)
    net();
    // (the places whose roads meet at each hub: its neighbours along the roads, the bigger first)
    const index = new Map(nodes.map((p, i) => [p, i]));
    for (const p of hubs) {
        const i = index.get(p);
        p.joins = adj[i].filter(e => e.tier <= 2).map(e => (e.a === i ? e.b : e.a)).sort((a, b) => tierOf(a) - tierOf(b)).map(j => nodes[j].name);
    }
    // (each link as a road: back down each end's own tree — or, two links in a chain, as the three legs of a fork)
    const back = (c) => { const l = []; for (let g = 0; c >= 0 && g < n; g++) { l.push(c); c = par[c]; } return l; };
    const main = new Uint8Array(n), routes = [];
    const road = (ends, cells, tier, m) => {
        if (m) for (const c of cells) main[c] = Math.min(255, main[c] + m);
        routes.push({ ends, cells, tier });
    };
    const forked = forksOf(S, nodes, links, E, ekey, stepCost, around);
    for (const f of forked.legs) road(f.ends, f.cells, f.tier, f.main);
    for (const e of links) {
        if (e.tier > 2 || forked.used.has(e)) continue;
        road([nodes[e.a].name, nodes[e.b].name], back(e.c).reverse().concat(back(e.d)), e.tier, e.main);
    }
    return { main, routes, added };
}
/** The forks (ROAD_LAY): where a place B has drawn roads to A and to C and no road runs from A to C, the chain A–B–C
 *  becomes a fork — the cell J where the three ways to A, B and C cost least together, if that is forkGain cheaper than
 *  the chain — its three legs down each place's own shortest-path tree from J, found within that cost of each. The
 *  sharpest corners first; a link in one fork at most. Returns { legs: [{ ends, cells (from J), tier, main }], used (the
 *  links the forks stand for) }. */
function forksOf(S, nodes, links, E, ekey, stepCost, around) {
    const { n, land } = S, N = nodes.length, used = new Set(), legs = [];
    const mine = Array.from({ length: N }, () => []);
    for (const e of links) if (e.tier <= 2) { mine[e.a].push(e); mine[e.b].push(e); }
    // (the corner at b, in degrees, on the plane round it; and what a fork would save there on open ground — the plane's
    // Fermat point, by a few rounds of Weiszfeld's — so only the corners where one could pay are searched)
    const flat = (B, p) => { let dl = p.lon - B.lon; dl -= 360 * Math.round(dl / 360); return [dl * Math.cos(B.lat * D), p.lat - B.lat]; };
    const corner = (b, a, c) => {
        const [ax, ay] = flat(nodes[b], nodes[a]), [cx, cy] = flat(nodes[b], nodes[c]), la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
        return la && lc ? Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / (la * lc)))) / D : 180;
    };
    const saving = (b, a, c) => {
        const P = [[0, 0], flat(nodes[b], nodes[a]), flat(nodes[b], nodes[c])], chain = Math.hypot(...P[1]) + Math.hypot(...P[2]);
        let x = (P[1][0] + P[2][0]) / 3, y = (P[1][1] + P[2][1]) / 3;
        for (let k = 0; k < 12; k++) {
            let sx = 0, sy = 0, sw = 0;
            for (const [px, py] of P) { const d = Math.max(1e-9, Math.hypot(px - x, py - y)); sx += px / d; sy += py / d; sw += 1 / d; }
            x = sx / sw; y = sy / sw;
        }
        let s = 0;
        for (const [px, py] of P) s += Math.hypot(px - x, py - y);
        return chain > 0 ? 1 - s / chain : 0;
    };
    const pairs = [];
    for (let b = 0; b < N; b++) {
        const l = mine[b];
        for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
            const a = l[i].a === b ? l[i].b : l[i].a, c = l[j].a === b ? l[j].b : l[j].a;
            if (nodes[a].c === nodes[c].c || (E.get(ekey(a, c))?.tier ?? 3) <= 2) continue;
            const ang = corner(b, a, c);
            if (ang < ROAD_LAY.forkAngle && saving(b, a, c) >= 0.6 * ROAD_LAY.forkGain) pairs.push([ang, b, a, c, l[i], l[j]]);
        }
    }
    if (!pairs.length) return { legs, used };
    pairs.sort((p, q) => p[0] - q[0]);
    // (the cheapest ways from a place, as far as lim: three at a time, each its own costs, cells and back-steps)
    const fd = [0, 1, 2].map(() => new Float64Array(n).fill(Infinity)), fp = [0, 1, 2].map(() => new Int32Array(n).fill(-1));
    const touched = [[], [], []], fH = new Heap(1024);
    // (within: only the cells B's way reached — the fork is among them — so A's and C's stay as small)
    const reach = (j, src, lim, within) => {
        const Dj = fd[j], Pj = fp[j], T = touched[j];
        Dj[src] = 0; T.push(src); fH.n = 0; fH.push(0, src);
        while (fH.n) {
            const k = fH.k[0], c = fH.pop();
            if (k > Dj[c]) continue;
            around(c, (d, len) => {
                if (within && within[d] === Infinity) return;
                const v = k + stepCost(c, d, len);
                if (v <= lim && v < Dj[d]) { if (Dj[d] === Infinity) T.push(d); Dj[d] = v; Pj[d] = c; fH.push(v, d); }
            });
        }
    };
    const clear = () => { for (let j = 0; j < 3; j++) { for (const c of touched[j]) { fd[j][c] = Infinity; fp[j][c] = -1; } touched[j].length = 0; } };
    const leg = (j, from) => { const l = []; for (let c = from, g = 0; c >= 0 && g < n; g++) { l.push(c); c = fp[j][c]; } return l; };
    for (const [, b, a, c, e1, e2] of pairs) {
        if (used.has(e1) || used.has(e2)) continue;
        const ca = nodes[a].c, cb = nodes[b].c, cc = nodes[c].c, chain = e1.wt + e2.wt, lim = chain * (1 - ROAD_LAY.forkGain);
        reach(1, cb, lim); reach(0, ca, lim, fd[1]); reach(2, cc, lim, fd[1]);
        let J = -1, best = lim;
        for (const x of touched[1]) {
            if (!land[x]) continue;
            const s = fd[0][x] + fd[1][x] + fd[2][x];
            if (s < best) { best = s; J = x; }
        }
        if (J >= 0 && J !== ca && J !== cb && J !== cc) {
            used.add(e1); used.add(e2);
            const fork = 'a fork';
            legs.push({ ends: [fork, nodes[a].name], cells: leg(0, J), tier: e1.tier, main: e1.main });
            legs.push({ ends: [fork, nodes[b].name], cells: leg(1, J), tier: Math.min(e1.tier, e2.tier), main: e1.main + e2.main });
            legs.push({ ends: [fork, nodes[c].name], cells: leg(2, J), tier: e2.tier, main: e2.main });
        }
        clear();
    }
    return { legs, used };
}
/** The roads as one network to draw: every step from cell to cell that some road takes, once (at the highest tier any
 *  road takes it), chained between the places, the junctions and where a road changes tier, so roads that share a way
 *  share one line rather than running beside each other. Each chain is a line of [lon, lat] from a place's own spot
 *  (not its cell's middle), the longitudes unwrapped so it never jumps round the world, its stair steps dropped and its
 *  corners rounded (Douglas–Peucker within about two thirds of a cell, then three rounds of Chaikin) so it reads as a
 *  road, not a stair of cells. Sea lanes are left out. [{ tier, pts: [[lon, lat], …] }] */
function roadNet(S, routes, spots, calm, bend, roll) {
    const { w, h, n, land } = S, edge = new Map(), nb = new Map();
    const link = (a, b) => { let l = nb.get(a); if (!l) nb.set(a, l = []); if (!l.includes(b)) l.push(b); };
    for (const r of routes) for (let i = 1; i < r.cells.length; i++) {
        const a = r.cells[i - 1], b = r.cells[i];
        if (a === b || !land[a] || !land[b]) continue;
        const k = Math.min(a, b) * n + Math.max(a, b), t = edge.get(k);
        if (t === undefined) { link(a, b); link(b, a); edge.set(k, r.tier); } else if (r.tier < t) edge.set(k, r.tier);
    }
    const at = new Map();
    for (const p of spots) at.set(p.c, p);
    const key = (a, b) => Math.min(a, b) * n + Math.max(a, b), done = new Set();
    const stop = (c) => {
        const l = nb.get(c);
        return l.length !== 2 || at.has(c) || edge.get(key(c, l[0])) !== edge.get(key(c, l[1]));
    };
    const spot = (c) => { const p = at.get(c); return p ? [p.lon, p.lat] : [(c % w + 0.5) / w * 360 - 180, 90 - (((c / w) | 0) + 0.5) / h * 180]; };
    const chains = [];
    const walk = (a, b) => {
        const tier = edge.get(key(a, b)), cells = [a];
        let prev = a, c = b;
        done.add(key(a, b));
        for (;;) {
            cells.push(c);
            if (stop(c) || c === a) break;
            const next = nb.get(c).find(d => d !== prev);
            if (next === undefined || done.has(key(c, next))) break;
            done.add(key(c, next)); prev = c; c = next;
        }
        const pts = [];
        for (const c of cells) {
            const q = spot(c);
            if (pts.length) q[0] += 360 * Math.round((pts[pts.length - 1][0] - q[0]) / 360);
            pts.push(q);
        }
        chains.push({ tier, pts: smoothRoad(flowRoad(pts, S, calm, bend, roll), 0.1 * 180 / h, 2) });
    };
    for (const [c, l] of nb) if (stop(c)) for (const d of l) if (!done.has(key(c, d))) walk(c, d);
    for (const [c, l] of nb) for (const d of l) if (!done.has(key(c, d))) walk(c, d);   // (a ring with no stop on it)
    return chains;
}
/** A road's line of [lon, lat] (its cells' middles) made to flow (ROAD_FLOW): its stair of cells smoothed, laid
 *  out again every third of a cell, then bent off its line by the noise, times bend and the calm where it runs, none
 *  at its ends (so the chains still meet). */
function flowRoad(l, S, calm, bend, roll) {
    const { w, h } = S, KM = Math.PI * R / 180, F = ROAD_FLOW;
    for (let p = 0; p < F.passes && l.length > 2; p++) {
        const o = l.map(q => q.slice());
        for (let i = 1; i < l.length - 1; i++) for (let j = 0; j < 2; j++) o[i][j] = (l[i - 1][j] + 2 * l[i][j] + l[i + 1][j]) / 4;
        l = o;
    }
    if (l.length < 2) return l;
    // (along the line, in km)
    const kmOf = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * D), b[1] - a[1]) * KM;
    const along = [0];
    for (let i = 1; i < l.length; i++) along.push(along[i - 1] + kmOf(l[i - 1], l[i]));
    const len = along[along.length - 1], step = F.step * KM * 180 / h, m = Math.max(1, Math.round(len / step));
    const r = [], at = [];
    for (let k = 0, i = 0; k <= m; k++) {
        const s = len * k / m;
        while (i < l.length - 2 && along[i + 1] < s) i++;
        const t = along[i + 1] > along[i] ? Math.min(1, (s - along[i]) / (along[i + 1] - along[i])) : 0;
        r.push([l[i][0] + t * (l[i + 1][0] - l[i][0]), l[i][1] + t * (l[i + 1][1] - l[i][1])]); at.push(s);
    }
    if (!(bend > 0) || r.length < 3) return r;
    const o = r.map(q => q.slice());
    for (let i = 1; i < r.length - 1; i++) {
        const lon = r[i][0], lat = r[i][1], cl = Math.max(0.1, Math.cos(lat * D));
        const ease = smooth(0, F.taperKm, Math.min(at[i], len - at[i]));
        if (ease <= 0) continue;
        const u = (((lon + 180) / 360) % 1 + 1) % 1, v = Math.min(1, Math.max(0, (90 - lat) / 180));
        let off = 0;
        for (let k = 0; k < F.km.length; k++) off += 2 * F.sway * F.km[k] * (noise(lat, lon, F.km[k], roll + 141 + k) - 0.5);
        off *= bend * ease * sample(calm, w, h, u, v);
        const tx = (r[i + 1][0] - r[i - 1][0]) * cl, ty = r[i + 1][1] - r[i - 1][1], tl = Math.hypot(tx, ty) || 1;
        o[i][0] += off / KM * (-ty / tl) / cl; o[i][1] += off / KM * (tx / tl);
    }
    return o;
}
/** A line of [lon, lat] with its stair steps dropped (Douglas–Peucker within tol degrees, longitude by its cosine) and
 *  its corners rounded (rounds of Chaikin, three at first); its ends stay put, so the chains still meet. */
function smoothRoad(l, tol, rounds = 3) {
    if (l.length > 2) {
        const keep = new Uint8Array(l.length); keep[0] = keep[l.length - 1] = 1;
        const stack = [[0, l.length - 1]];
        while (stack.length) {
            const [a, b] = stack.pop(), k = Math.cos(((l[a][1] + l[b][1]) / 2) * Math.PI / 180);
            const ax = l[a][0] * k, ay = l[a][1], dx = l[b][0] * k - ax, dy = l[b][1] - ay, dd = dx * dx + dy * dy || 1e-12;
            let far = -1, best = tol;
            for (let i = a + 1; i < b; i++) {
                const px = l[i][0] * k - ax, py = l[i][1] - ay, t = Math.max(0, Math.min(1, (px * dx + py * dy) / dd));
                const e = Math.hypot(px - t * dx, py - t * dy);
                if (e > best) { best = e; far = i; }
            }
            if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
        }
        l = l.filter((_, i) => keep[i]);
    }
    for (let k = 0; k < rounds && l.length > 2; k++) {
        const o = [l[0]];
        for (let i = 0; i < l.length - 1; i++) {
            const [a, b] = [l[i], l[i + 1]];
            o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
        }
        o.push(l[l.length - 1]);
        l = o;
    }
    return l;
}

/** The reasons a place could stand where it does, the icons before its name: [kind, words] the strongest first, one
 *  or two. Each a reading of the land at the place (Empire's metrics, the deposits), none a dice roll. */
export const WHY = {
    trade: ['Trade hub', 'where the goods of different lands first meet on the roads: grain and livestock where farmers and herders meet, metals and gems coming down from the hills, the sea’s trade at a harbour'],
    port: ['Harbour', 'on the coast'],
    farm: ['Farmland', 'amid the land that could feed the most'],
    mine: ['Metals', 'by a deposit of tin or copper worth working, or a rich one of iron, lead or zinc'],
    precious: ['Gold and silver', 'by a deposit of gold or silver worth working'],
    mineral: ['Salt', 'by a rich deposit of salt: pans, flats and the beds of dry lakes'],
    gem: ['Gems', 'by a deposit of gems worth working: diamonds, ruby and sapphire, emerald, lapis, opal, turquoise, and garnet where it is rich'],
    stone: ['Fine stone', 'by a rich deposit of a stone worth a journey: jade, obsidian, agate, marble'],
    hold: ['Fort', 'guards a crossing between two states (a mountain pass, a ford, a strait, a way through the marshes) or a narrows on a road, where high ground closes in on a valley or a river’s pass'],
};
/** The icons (a 12-unit box, strokes only). */
export const WHY_ICON = {
    trade: 'M2 4.2h8M7.6 1.8 10 4.2 7.6 6.6M10 8.4H2M4.4 6 2 8.4l2.4 2.4',
    port: 'M6 3.4v7.4M3.8 5.2h4.4M2 7.6c.5 2.2 2.1 3.2 4 3.2s3.5-1 4-3.2M5 2.2a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    farm: 'M6 11V1.6M6 4.4 4 2.8M6 4.4 8 2.8M6 6.9 4 5.3M6 6.9 8 5.3M6 9.4 4 7.8M6 9.4 8 7.8',
    mine: 'M2.4 10.6 8 5M3.8 2.8c2.6-.6 5.2 1.6 5.6 5.4M5.2 1.8 10.4 7',
    precious: 'M1.2 10.4h9.6L9 6.4H3zM3.6 6.4l.9-3.6h3l.9 3.6',
    mineral: 'M6 1.4l4.4 2.4v4.6L6 10.8 1.6 8.4V3.8zM1.6 3.8 6 6.2l4.4-2.4M6 6.2v4.6',
    gem: 'M3 2h6l2 3-5 5.6L1 5zM1 5h10M4.6 2 3.8 5 6 10.6 8.2 5 7.4 2',
    stone: 'M1.5 10.5h9V7.3h-9zM3 7.3V4.1h6v3.2M6 7.3v3.2M5 4.1V1.5h2.6v2.6',
    hold: 'M2.4 10.8h7.2M3.4 10.8V5h5.2v5.8M3.2 5V2h1.4v1.3h1.4V2h1.4v1.3h1.4V2h1.4v3M5.4 10.8V8.6a.6.6 0 0 1 1.2 0v2.2',
};
/** A reason's badge: a disc in its colour (the categorical eight, styles.css .why-*) with its line drawing inside, as the
 *  inside of an SVG 14.4 units square (viewBox WHY_BOX). */
export const WHY_BOX = '-1.2 -1.2 14.4 14.4';
export const whyBadge = k => `<circle class="why-dot" cx="6" cy="6" r="6.6"/><path class="why-half" d="M6 -.15A6.15 6.15 0 0 1 6 12.15z"/><path class="why-ink" transform="translate(6 6) scale(.66) translate(-6 -6)" d="${WHY_ICON[k]}"/>`;
/** The badge as an inline icon, for the legend and the card. */
/** Which of a place's fields names the member of each kind, and the class that colours it (`why-is-<name>`, slugged). */
const MEMBER = { mine: 'metal', precious: 'precious', mineral: 'mineral', gem: 'gem', stone: 'stone' };
export const whyIs = (k, p) => { const n = p && typeof p === 'object' ? p[MEMBER[k]] : null; return n ? ` why-is-${n.replace(/[^a-z]+/g, '-')}` : ''; };
export const whyIcon = (k, p) => `<svg class="states-why why-${k}${whyIs(k, p)}" viewBox="${WHY_BOX}" aria-hidden="true">${whyBadge(k)}</svg>`;
/** A deposit's richness as a share of its worth (0 under GEOLOGY.deposits.grades' moderate; a moderate one half, a rich
 *  one in full). */
const richOf = v => { const [, p1, p2] = GEOLOGY.deposits.grades; return v < p1 ? 0 : 0.5 + 0.5 * smooth(p1, p2, v); };
/** How far round a place its deposits count, km: a day's walk to the workings and back. */
const DEPOSIT_KM = 40;
/** The deposits round a cell (within km, the cell alone at 0), each worth working: [{ kind (WHY's), good (GOODS'),
 *  name, worth (WORTH × its richness) }], the dearest first. */
function depositsNear(S, c, km = DEPOSIT_KM) {
    const { w, h, ores, fine, fineK, rowKm } = S, y = (c / w) | 0, x = c - y * w, NM = WANT_IDS.length, colKm = 2 * Math.PI * R / w;
    const metal = new Float32Array(NM), dear = [0, 0], which = [-1, -1], rich = [0, 0], ry = Math.round(km / rowKm);
    for (let dy = -ry; dy <= ry; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const rx = Math.min(w >> 1, Math.round(km / (colKm * Math.max(0.05, Math.cos((90 - (yy + 0.5) / h * 180) * D)))));
        for (let dx = -rx; dx <= rx; dx++) {
            const d = yy * w + (x + dx + w) % w;
            for (let m = 0; m < NM; m++) if (WANT_I[m] >= 0) metal[m] = Math.max(metal[m], ores[d * NM + m] / 255);
            for (let q = 0; q < 2; q++) {
                const k = fineK[d * 2 + q];
                if (k < 0) continue;
                const v = fine[d * 2 + q] / 255, wv = richOf(v) * ((q ? STONE_WORTH : GEM_WORTH)[DEPOSITS[k].id] ?? (q ? 0.4 : 0.6));
                if (wv > dear[q]) { dear[q] = wv; which[q] = k; rich[q] = v; }
            }
        }
    }
    const out = [];
    for (let m = 0; m < NM; m++) {
        const id = WANT_IDS[m], wv = WORTH[id] * richOf(metal[m]);
        if (wv > 0) out.push({ kind: KIND[id], good: GOOD_OF[id], name: METALS[WANT_I[m]].name.toLowerCase(), worth: wv });
    }
    for (let q = 0; q < 2; q++) if (dear[q] > 0) out.push({ kind: q ? 'stone' : 'gem', good: q ? 'stone' : 'gems', name: DEPOSITS[which[q]].name.toLowerCase(), worth: dear[q] });
    return out.sort((a, b) => b.worth - a.worth);
}
/** A cell's deposits at the cell alone, summed to one worth: the dearest in full, the rest a quarter each. */
const worthAt = list => list.reduce((t, d, i) => t + (i ? 0.25 : 1) * d.worth, 0);
/** Why a place stands where it does: the land's reasons (whyOf), a fort's guard first. */
function whyOf(S, M, c, traffic, hub, guard = false) {
    const i = S.at[c], r = [];
    let river = false;         // (by a great river or a lake: not a reason of its own — most places are — but it widens
                                //  the place's food reach, feedKm)
    if (hub) r.push(['trade', 2]);   // (only a hub: a busy road alone is what most towns stand on)
    if (i >= 0) {
        r.push(['port', 1 - smooth(M.half, M.half + 15, M.sea[i])]);
        // (a river big enough to carry the trade of a region, not just a boat — or the shore of a lake: most good sites
        // stand by some water, so only the great rivers count, at the place or a step from it)
        let q = 0, shore = 0;
        const my = (i / M.w) | 0, mx = i - my * M.w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const yy = my + dy;
            if (yy < 0 || yy >= M.h) continue;
            const j = yy * M.w + (mx + dx + M.w) % M.w;
            if (dx && dy) continue;
            q = Math.max(q, (dx || dy ? 0.6 : 1) * M.flow[j]);   // (a step off: a bit less of a river town)
            if (M.lake[j] === 1) shore = 1;
        }
        river = Math.max(0.9 * smooth(HAUL.navQ, RIVER_Q * HAUL.navQ, q), 0.6 * shore) >= 0.45;
        r.push(['farm', 0.85 * smooth(0.75, 0.95, M.food[i])]);
    }
    if (guard) r.push(['hold', 3]);
    // (the deposits round it, each kind by its dearest: a reason once it is worth MINE.least — the dear ones moderate
    //  or rich, the cheap ones only rich — so a place sited by a deposit always says so)
    const named = {};
    for (const d of depositsNear(S, c)) if (!(d.kind in named)) { named[d.kind] = d.name; r.push([d.kind, 0.45 + d.worth - MINE.least]); }
    r.sort((a, b) => b[1] - a[1]);
    // (only the reasons the land gives: a place with none is just where people farm, and says so with no icon)
    const why = r.filter(k => k[1] >= 0.45).map(k => k[0]), has = k => why.includes(k);
    return { why, river, metal: has('mine') ? named.mine : null, precious: has('precious') ? named.precious : null, mineral: has('mineral') ? named.mineral : null,
        gem: has('gem') ? named.gem : null, stone: has('stone') ? named.stone : null };
}
/** A place's reasons in words, for the readout. */
const goodsWords = p => (p.meets?.length ? `${list(p.meets.slice(0, 4))}${p.meets.length > 4 ? ' and more' : ''}` : '');
export function whyWords(T, p) {
    return p.why.map(k => k === 'trade' && p.meets?.length ? `a trade hub where ${goodsWords(p)} meet${p.joins?.length ? `, on the roads from ${list(p.joins.slice(0, 4))}${p.joins.length > 4 ? ' and more' : ''}` : ''}`
        : k === 'mine' && p.metal ? `by ${p.metal}` : k === 'precious' ? `by ${p.precious ?? 'gold'}` : k === 'mineral' ? `by ${p.mineral ?? 'salt'}` : k === 'gem' ? `by ${p.gem ?? 'gems'}` : k === 'stone' ? `by ${p.stone ?? 'fine stone'}` : k === 'trade' ? 'on a busy road' : k === 'port' ? 'a harbour'
        : k === 'farm' ? 'amid rich farmland' : `guarding ${guardWords(p)}`).join(', ');
}
/** A road through a narrows, in words: "from A to B", or "to B" from the place itself or from a fork. */
const roadWords = (p, ends) => { const e = ends.filter(n => n !== p.name); return e.length === 2 ? `from ${e[0]} to ${e[1]}` : e.length ? `to ${e[0]}` : 'past it'; };
/** What a fort guards, in words: "the mountain pass to X and the ford to Y". */
const guardWords = p => (p.guards ?? []).map(g => (g.road ? `the ${g.kind} on the road ${roadWords(p, g.road)}`
    : `the ${g.kind === 'river crossing' ? 'ford' : g.kind} to ${g.to}`)).join(' and ') || 'a crossing';

/** The most states there can be: the great ones (Count) and the smaller ones that rise between them. */
const MOST_STATES = 60;
/** New capitals for the land no capital reaches: the best sites in it (as capitals() weighs them), spaced half the
 *  capitals' spacing apart, one or more in each stretch of such land at least a fifth of a spacing squared and home to
 *  8 % of a state's share of the people — smaller or emptier land (scraps, ice, the deep desert) falls to its nearest
 *  state. [{ c, lat, lon, hand: false, between: true }] */
function gapCapitals(S, G, reach, caps, o) {
    const { w, h, n, land, site, within, area, pop } = S, { own1, key1 } = G, free = c => land[c] && (own1[c] < 0 || key1[c] > reach);
    let everyone = 0;
    for (let c = 0; c < n; c++) if (land[c]) everyone += pop[c];
    const fewest = 0.08 * everyone / Math.max(1, caps.length);   // (a stretch needs this many people to raise a state)
    const apart = 0.5 * caps.apart, minKm2 = 0.2 * caps.apart * caps.apart, comp = new Int32Array(n).fill(-1), big = [];
    // (the stretches of unheld land, east–west round the world, and their areas)
    const stack = [];
    for (let c0 = 0; c0 < n; c0++) {
        if (comp[c0] >= 0 || !free(c0)) continue;
        const id = big.length;
        let km2 = 0, folk = 0;
        comp[c0] = id; stack.push(c0);
        while (stack.length) {
            const c = stack.pop(), y = (c / w) | 0, x = c - y * w;
            km2 += area[y]; folk += pop[c];
            for (let dy = -1; dy <= 1; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= h) continue;
                for (let dx = -1; dx <= 1; dx++) { const d = yy * w + (x + dx + w) % w; if (comp[d] < 0 && free(d)) { comp[d] = id; stack.push(d); } }
            }
        }
        big.push(km2 >= minKm2 && folk >= fewest);
    }
    const cand = [];
    for (let c = 0; c < n; c++) if (comp[c] >= 0 && big[comp[c]] && S.at[c] >= 0) cand.push([(0.2 + site[c]) * Math.log10(2 + within[c]) * (0.8 + 0.4 * hash(c, 9, o.roll)), c]);
    cand.sort((a, b) => b[0] - a[0]);
    const add = [], all = () => caps.concat(add);
    for (const [, c] of cand) {
        if (caps.length + add.length >= MOST_STATES) break;
        const lat = latOfCell(S, c), lon = lonOfCell(S, c);
        if (o.drops.some(([a, b]) => arcKm(a, b, lat, lon) < 250) || all().some(k => arcKm(k.lat, k.lon, lat, lon) < apart)) continue;
        add.push({ c, lat, lon, hand: false, between: true });
    }
    return add;
}

// ── the build, in a worker (states-worker.js) ──
// The states take seconds of work — the grid under them most (Empire's metrics, City size's people within reach) — and
// on the page they froze it. A worker works them out instead, from a copy of the rasters they read (sent in slices, the
// page breathing between), and is ended once the states are back: the copy lasts only as long as the build. The grid
// and the metrics come back with the states and are kept, so a change of the states' own options (a capital dropped, a
// reroll) sends only those; a change of the food's options sends the rasters again.

/** The states, per finished moment: the latest worked out, whatever their options — { key, S, caps, own1, own2, key1,
 *  key2, power, states, flash, chokes, bottlenecks, L, towns (the hubs among them), places, routes, roads, … }. */
const statesCache = new WeakMap();
const gridKept = new WeakMap();   // (per farming raster: { fkey, S, M } — the grid and the metrics, by the food's options)
let job = null, want = null, failed = null, stamp = 0;
const cacheKey = () => `${farmOptionsKey()}|${statesKey()}`;
/** A count that goes up each time states arrive: what was drawn from the last ones is drawn again. */
export const statesStamp = () => stamp;
/** The states of a finished moment with the options as they are now. While those are worked out, the last ones worked out
 *  for it, or null before the first: the worker is asked for them, and statesStamp() goes up when they come. */
export function statesOf(fin) {
    const F = fin.raster.farming, kept = statesCache.get(F), key = cacheKey();
    if (kept?.key !== key) ask(fin, key);
    return kept ?? null;
}
/** The states worked out for the build's own step in the progress card (js/build-progress.js): onStep(words, share 0 … 1)
 *  at each step; `alive()` false ends it (a newer world). Resolves to the states, or null. */
export function statesBuild(fin, onStep = () => {}, alive = () => true) {
    const F = fin.raster.farming, key = cacheKey(), kept = statesCache.get(F);
    if (kept?.key === key) return Promise.resolve(kept);
    ask(fin, key);
    const j = job;
    if (!j) return Promise.resolve(null);
    j.onStep = (words, share) => { if (alive()) onStep(words, share); else if (job === j) stop(); };
    return j.done;
}
function ask(fin, key) {
    const F = fin.raster.farming;
    if (failed?.F === F && failed.key === key) return;
    want = { fin, key };
    if (job && (job.F !== F || job.fkey !== farmOptionsKey())) stop();
    if (!job) start();
}
function stop() { if (!job) return; job.worker.terminate(); job.resolve(null); job = null; }
function start() {
    const { fin, key } = want, F = fin.raster.farming, fkey = farmOptionsKey(), g = gridKept.get(F);
    want = null;
    const worker = new Worker(new URL('./states-worker.js', import.meta.url), { type: 'module' });
    let resolve;
    const done = new Promise(r => { resolve = r; });
    const me = job = { F, key, fkey, worker, done, resolve, onStep: null, t0: performance.now(), sent: 0 };
    const end = (out) => {
        worker.terminate();
        if (job === me) job = null;
        resolve(out);
        const next = want;
        want = null;
        if (next && !(next.fin.raster.farming === F && next.key === key)) ask(next.fin, next.key);
    };
    worker.onmessage = ({ data: m }) => {
        if (job !== me) return;
        if (m.step) { me.onStep?.(...m.step); return; }
        if (m.error) { console.error('[states] could not be worked out:', m.error); failed = { F, key }; end(null); return; }
        const out = m.out;
        out.caps.apart = m.apart;                       // (an array's own field: not carried over)
        if (m.M) { gridKept.set(F, { fkey, S: out.S, M: m.M }); metricsKeep(F, m.M); cityKeep(F, m.G); }
        const now = performance.now(), sec = t => (t / 1000).toFixed(1);
        console.info(me.sent ? `[states] the world sent to the worker in ${sec(me.sent - me.t0)} s, the states worked out in ${sec(now - me.sent)} s` : `[states] worked out in ${sec(now - me.t0)} s`);
        statesCache.set(F, out);
        statesOf.last = out; statesOf.fin = fin;        // (the latest and its planet, for a look from the console)
        stamp++;
        end(out);
    };
    worker.onerror = (e) => { if (job !== me) return; console.error('[states] the worker failed:', e.message); failed = { F, key }; end(null); };
    const run = { farm: { ...farmOptions }, states: JSON.parse(JSON.stringify(statesOptions)), key };
    if (g?.fkey === fkey) {
        const M = g.M;
        worker.postMessage({ run, given: { S: g.S, M: { key: M.key, w: M.w, h: M.h, half: M.half, sea: M.sea, flow: M.flow, lake: M.lake, food: M.food } } });
    } else sendFin(worker, fin, () => job === me).then(ok => { if (ok && job === me) { me.sent = performance.now(); worker.postMessage({ run }); } });
}
const BIG = 1 << 20, SLICE = 8 << 20;
// (a turn of the page's event loop by a message, not a timer: a hidden tab's timers wake once a second, and after five
// minutes once a minute — a large world's slices then took the states minutes to send; as export-panel.js's tick)
const tick = (() => {
    let ch = null;
    const waiting = [];
    return () => new Promise(r => {
        if (!ch) { ch = new MessageChannel(); ch.port1.onmessage = () => waiting.shift()?.(); }
        waiting.push(r); ch.port2.postMessage(0);
    });
})();
/** What the build reads of a finished moment, sent to the worker: its frame first (the small parts), then each big
 *  array in slices of SLICE bytes, the page breathing between them. False if `live()` went false on the way. */
async function sendFin(worker, fin, live) {
    const R = fin.raster, C = fin.climate, K = C?.raster, V = fin.rivers;
    const pick = { raster: { w: R.w, h: R.h, ocean: R.ocean, water: R.water, heightM: R.heightM, farming: R.farming,
            geology: R.geology?.deposits ? { deposits: R.geology.deposits } : null },
        climate: { raster: K && { w: K.w, h: K.h, koppen: K.koppen }, Tsea: C?.Tsea && { year: C.Tsea.year },
            upwelling: C?.upwelling && { year: C.upwelling.year }, seaIce: C?.seaIce && { year: C.seaIce.year } },
        rivers: V && { start: V.start, lat: V.lat, lon: V.lon, q: V.q } };
    const big = [], frame = strip(pick, big);
    worker.postMessage({ frame, specs: big.map(a => [a.constructor.name, a.length]) });
    for (let i = 0; i < big.length; i++) {
        const a = big[i], per = Math.max(1, Math.floor(SLICE / a.BYTES_PER_ELEMENT));
        for (let at = 0; at < a.length; at += per) {
            await tick();
            if (!live()) return false;
            const part = a.slice(at, at + per);
            worker.postMessage({ i, at, part }, [part.buffer]);
        }
    }
    return true;
}
/** A copy of `v` with each big typed array put in `big` and left as { big: its index } (functions left out). */
function strip(v, big) {
    if (ArrayBuffer.isView(v)) { if (v.byteLength < BIG) return v; big.push(v); return { big: big.length - 1 }; }
    if (Array.isArray(v)) return v.map(x => strip(x, big));
    if (!v || typeof v !== 'object' || v instanceof Map || v instanceof Set) return v;
    const o = {};
    for (const k of Object.keys(v)) if (typeof v[k] !== 'function') o[k] = strip(v[k], big);
    return o;
}
/** The worker's half (states-worker.js): the frame dressed again, with `arrays` (the big ones, filled in slices). */
export function dressFin(v, arrays) {
    if (ArrayBuffer.isView(v) || !v || typeof v !== 'object' || v instanceof Map || v instanceof Set) return v;
    if (Array.isArray(v)) return v.map(x => dressFin(x, arrays));
    const k = Object.keys(v);
    if (k.length === 1 && k[0] === 'big' && typeof v.big === 'number') return arrays[v.big];
    for (const key of k) v[key] = dressFin(v[key], arrays);
    return v;
}
/** The worker's build: the states for `fin` with the options as they are (the worker's copy of them); `given` the grid
 *  and the metrics kept from a build before ({ S, M }: only the states' own options changed). With `full`, the metrics
 *  and City size's grid come back too, for the page to keep. */
export function statesWork(fin, given, onStep) {
    const F = fin.raster.farming;
    if (given) { metricsKeep(F, given.M); gridCache.set(F, given.S); }
    onStep('Reading the land', 0);
    const S = stateGrid(fin), it = statesSteps(fin, S, cacheKey());
    let r;
    while (!(r = it.next()).done) onStep(...r.value);
    const out = r.value;
    return { out, apart: out.caps.apart, M: given ? null : metrics(fin), G: given ? null : cityGrid(fin) };
}
/** The states' build, step by step: yields [words, share] between its steps, returns the states. */
function* statesSteps(fin, S, key) {
    yield ['Founding the capitals', 0.4];
    const o = statesOptions, { w, h, n, land, pop, ores, site, nav, slope, alt, wet, within } = S;
    const cost = costs(S, o), caps = capitals(S, o), K = caps.length, lay = layOf(S, o), wiggle = WIGGLES[o.wiggle] ?? 1;
    // (power: the people within reach of the capital, to the 0.35, over the capitals' mean; ½ … 2)
    const raw = caps.map(k => Math.pow(1 + within[k.c], 0.35)), mean = raw.reduce((a, b) => a + b, 0) / Math.max(1, K);
    const powerOf = k => Math.max(0.5, Math.min(2, Math.pow(1 + within[k.c], 0.35) / mean));
    const power = caps.map(powerOf);
    // (no land is left to no one: land beyond every capital's Reach raises capitals of its own, smaller states between
    // the great ones; then every cell goes to whoever holds it cheapest, however far — a far islet to its nearest state)
    const reach = o.reach || Math.max(REACHES[0], Math.round(AUTO_REACH * caps.apart / 100) * 100);
    for (let round = 0; round < 6 && caps.length < MOST_STATES; round++) {
        const add = gapCapitals(S, grow(S, cost, caps, power, reach, { lay }), reach, caps, o);
        if (!add.length) break;
        for (const k of add) { caps.push(k); power.push(powerOf(k)); }
    }
    yield ['Drawing the borders', 0.45];
    // (grown, then read again through the build's warp: every count, place and region below agrees with the map)
    const L = 1e9, G0 = grow(S, cost, caps, power, L, { lay }), calm = calmOf(S, lay, null, power), calmCap = calmOf(S, lay, G0, power);
    const warp = warpCells(S, calmCap, wiggle, o.roll), G = warpField(S, G0, L, warp.du, warp.dv), { own1, own2, key1, key2 } = G;
    for (const [i, k] of caps.entries()) if (own1[k.c] !== i) { own1[k.c] = i; key1[k.c] = 0; }   // (a capital its own, whatever the warp)
    // each state's people, land, waters, metals; who meets whom
    const states = caps.map((k, i) => ({ i, cap: k, name: nameOf(Math.round(k.lat * 10), Math.round(k.lon * 10), o.roll), people: 0, km2: 0, coast: 0, river: 0, ores: new Float32Array(WANT_IDS.length), best: 0, power: power[i], neighbours: new Set(), colour: 0 }));
    const meet = new Map();     // (pair a*64+b, a < b: their border's cells and its cheapest crossing)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = y * w + x, a = own1[c];
        if (a < 0) continue;
        const s = states[a];
        if (land[c]) {
            if (S.shore[c]) s.coast++;
            s.people += pop[c]; s.km2 += S.area[y]; if (site[c] > s.best) s.best = site[c]; if (nav[c]) s.river++;
            for (let m = 0; m < WANT_IDS.length; m++) { const v = ores[c * WANT_IDS.length + m] / 255; if (v > s.ores[m]) s.ores[m] = v; }
        }
        // (the borders: this cell and its east and south neighbours)
        for (const d of [y * w + (x + 1) % w, y < h - 1 ? c + w : -1]) {
            if (d < 0) continue;
            const b = own1[d];
            if (b < 0 || b === a) continue;
            states[a].neighbours.add(b); states[b].neighbours.add(a);
            const lo = Math.min(a, b), hi = Math.max(a, b), pk = lo * 64 + hi;
            let e = meet.get(pk);
            if (!e) meet.set(pk, e = { a: lo, b: hi, cells: 0, costSum: 0, best: Infinity, at: -1, at2: -1 });
            // (the crossing: capital to capital through these two cells, in cost; the border's own ground, its dearness)
            const cross = key1[c] * power[a] + key1[d] * power[b];
            e.cells++; e.costSum += 0.5 * (cost[c] + cost[d]);
            if (cross < e.best) { e.best = cross; e.at = c; e.at2 = d; }
        }
    }
    // (the colours: neighbours never share one — the most-met first, each the first of the eight its neighbours lack,
    // ties to the one used least)
    const order = states.slice().sort((p, q) => q.neighbours.size - p.neighbours.size), used = new Array(8).fill(0);
    for (const s of order) {
        const taken = new Set([...s.neighbours].map(j => states[j].colourSet ? states[j].colour : -1));
        let best = -1;
        for (let k = 0; k < 8; k++) if (!taken.has(k) && (best < 0 || used[k] < used[best])) best = k;
        s.colour = best < 0 ? s.i % 8 : best; s.colourSet = true; used[s.colour]++;
    }
    // the bottlenecks: a crossing on ground much cheaper than the border's own
    const chokes = [];
    for (const e of meet.values()) {
        if (e.cells < 3 || e.at < 0) continue;
        const along = e.costSum / e.cells, here = 0.5 * (cost[e.at] + cost[e.at2]);
        const c = land[e.at] ? e.at : e.at2, y = Math.floor(e.at / w), x = e.at - y * w, y2 = Math.floor(e.at2 / w), x2 = e.at2 - y2 * w;
        let dx = x2 - x; if (dx > w / 2) dx -= w; if (dx < -w / 2) dx += w;
        const lat = 90 - ((y + y2) / 2 + 0.5) / h * 180, lon = (((x + dx / 2 + 0.5) / w * 360 + 360) % 360) - 180;
        const kind = !land[e.at] || !land[e.at2] ? (S.toLand[e.at] + S.toLand[e.at2] < 200 ? 'strait' : 'sea crossing')
            : nav[e.at] || nav[e.at2] ? 'river crossing' : slope[c] >= 20 || alt[c] >= 1800 ? 'mountain pass' : wet[c] >= 0.3 ? 'way through the marshes' : along >= 3 ? 'gap' : 'open frontier';
        chokes.push({ a: e.a, b: e.b, lat, lon, kind, ratio: here / along, along, cells: e.cells, at: e.at, at2: e.at2 });
    }
    chokes.sort((p, q) => p.ratio - q.ratio);
    const bottlenecks = chokes.filter(k => k.kind !== 'open frontier' && (k.ratio < 0.6 || k.along >= 4) && k.cells >= 4).slice(0, 12);
    // the contested places, and the flashpoints: the richest of them, far apart
    const flash = [], cand = [];
    for (let c = 0; c < n; c++) {
        if (!land[c] || own1[c] < 0 || own2[c] < 0 || key2[c] > 1.25 * key1[c] + 40) continue;
        let r = 0, m0 = -1;
        for (let m = 0; m < WANT_IDS.length; m++) { const v = ores[c * WANT_IDS.length + m] / 255 * WANT[WANT_IDS[m]]; if (v > r) { r = v; m0 = m; } }
        const v = (r >= GEOLOGY.deposits.grades[1] ? r : 0) + 0.5 * site[c] + 0.4 * Math.min(1, pop[c] / S.area[Math.floor(c / w)] / 60);
        if (v > 0.5) cand.push([v, c, r >= GEOLOGY.deposits.grades[1] ? m0 : -1]);
    }
    cand.sort((p, q) => q[0] - p[0]);
    for (const [v, c, m] of cand) {
        if (flash.length >= 10) break;
        const y = Math.floor(c / w), lat = 90 - (y + 0.5) / h * 180, lon = (c % w + 0.5) / w * 360 - 180;
        if (flash.some(f => arcKm(f.lat, f.lon, lat, lon) < 400) || flash.filter(f => (f.a === own1[c] && f.b === own2[c]) || (f.a === own2[c] && f.b === own1[c])).length >= 2) continue;
        flash.push({ c, lat, lon, a: own1[c], b: own2[c], metal: m >= 0 ? METALS[WANT_I[m]].name.toLowerCase() : null, value: v, site: site[c] });
    }
    labelPoints(S, states, own1, key1, L);
    yield ['Placing the cities, towns and villages', 0.57];
    // the cities, the roads from them and between the capitals, the hubs on those; the towns and villages under them,
    // the forts at the crossings; and why each place stands
    const sp = spacer(S);
    for (const k of caps) sp.add(k);
    const towns = townsOf(S, caps, states, own1, key1, L, o, sp), M = metrics(fin);
    const places = [];
    smallPlaces(S, own1, key1, L, o, sp, places);
    places.push(...minesOf(S, own1, key1, L, o, states, caps.concat(towns, places)));
    yield ['Laying the roads', 0.64];
    const { main, routes, added } = roadsOf(S, cost, meet, states, caps, towns, places, o);
    towns.unshift(...added);
    yield ['Raising the forts, and why each place stands', 0.82];
    caps.forEach((k, i) => { k.state = i; k.rank = 'cap'; });
    places.unshift(...fortsOf(S, chokes, states, own1, key1, L, o, towns.concat(caps), places, narrowsOf(fin, S, routes, main, own1, key1, L)));
    for (const k of caps) Object.assign(k, whyOf(S, M, k.c, null, false, !!k.guards));
    for (const t of towns) Object.assign(t, whyOf(S, M, t.c, main, t.hub, !!t.guards));
    for (const p of places) Object.assign(p, whyOf(S, M, p.c, null, p.hub, !!p.guards));
    for (const s of states) { s.towns = 0; s.villages = 0; s.forts = 0; }
    for (const p of places) states[p.state][p.rank === 'town' ? 'towns' : p.rank === 'village' ? 'villages' : 'forts']++;
    yield ['Counting the people', 0.84];
    const feeds = peopleOf(S, own1, key1, L, states, caps.concat(towns, places));
    const roads = roadNet(S, routes, caps.concat(towns, places), calm, BENDS[o.bend] ?? 1, o.roll);
    yield ['Dividing the regions', 0.88];
    const { reg, regions } = regionsOf(S, cost, caps, states, towns, places, G0.own1, own1, L, o, lay, warp);
    return { key, S, caps, own1, own2, key1, key2, power, states, chokes, bottlenecks, flash, towns, places, routes, roads, traffic: main, L, reach, cost, feeds, reg, regions,
        calm, wiggle, roll: o.roll };
}

/** The natural regions' names, for this roll and these places (states-nature.js draws them): each its lay of the land
 *  (landform), what it is in words, how its people would live, its proper name, and — where the places living by a
 *  metal, a gem or salt hold at least ORE_SHARE of its places' people — that ore: "the Copper Hills of Tharn". */
const ORE_SHARE = 0.2;
// (the commoner metals must hold more to name a region — over their worth to a state, WANT: iron twice as much as copper)
const ORE_RARITY = Object.fromEntries(WANT_IDS.map((id, m) => [METALS[WANT_I[m]]?.name.toLowerCase(), Math.min(1, WANT[id])]));
// (a deposit's name, short enough for a region's: "Amethyst Plateau", not "Amethyst geodes Plateau")
const ORE_WORD = { 'lead and zinc': 'lead', 'pegmatite gems': 'gem', 'gem gravels': 'gem', 'ruby and sapphire': 'ruby', 'lapis lazuli': 'lapis', diamonds: 'diamond' };
const oreWord = m => ORE_WORD[m] ?? m.split(/ (?:and|in|geodes)\b/)[0];
function natureNames(S, all, o) {
    const { levels, nodes } = S.nature;
    nodes.forEach((list, l) => {
        const lev = levels[l], ore = new Map(), tot = new Float64Array(list.length);
        for (const p of all) {
            const g = lev[p.c];
            if (g < 0) continue;
            tot[g] += p.people ?? 0;
            for (const k of p.why ?? []) {
                const m = k === 'mine' ? p.metal : k === 'precious' ? p.precious : k === 'gem' ? p.gem : k === 'mineral' ? p.mineral : null;
                if (!m) continue;
                let t = ore.get(g);
                if (!t) ore.set(g, t = new Map());
                t.set(m, (t.get(m) ?? 0) + (p.people ?? 0));
            }
        }
        for (const g of list) {
            Object.assign(g, landformOf(g));
            g.living = livelihoodOf(g);
            g.proper = nameOf(Math.round(g.lat * 10), Math.round(g.lon * 10), o.roll + 7);
            g.word = wordAt(g.land, g.lat, g.lon, o.roll);
            const t = ore.get(g.i), top = t && [...t].sort((p, q) => q[1] * (ORE_RARITY[q[0]] ?? 1) - p[1] * (ORE_RARITY[p[0]] ?? 1))[0];
            g.ore = top && top[1] * (ORE_RARITY[top[0]] ?? 1) >= ORE_SHARE * tot[g.i] ? top[0] : null;
            g.name = naturalName(g, g.proper);
        }
    });
}
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
/** A natural region's name with a proper name and one of its lay's words: "Tharn Hills", "Strath Tharn", or with its ore
 *  "Copper Hills of Tharn" (the plain word: the ore sets it apart). */
const naturalName = (g, proper, word = g.word) => (g.ore ? `${cap1(oreWord(g.ore))} ${g.land} of ${proper}` : (word ?? `% ${g.land}`).replace('%', proper));
/** Which of a lay's words a place picks: by where it is and the roll, so the same at every build. */
function wordAt(land, lat, lon, roll, skip = 0) {
    const ws = landWords(land);
    let h = Math.imul(Math.round(lat * 10), 73856093) ^ Math.imul(Math.round(lon * 10), 19349663) ^ Math.imul(roll + 13, 83492791);
    h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
    return ws[((h >>> 0) + skip) % ws.length];
}

/** The regions: the land's own parts, cut from the natural regions and blind to the states — a mountain range, a plain or
 *  a desert two states share is one region, its border drawn across theirs (the owner, 2026-11-24: "regions shouldnt be
 *  bound to empires, because some could cross empire bounds"). The natural level, one for the whole planet, whose big
 *  enough pieces (at least PROVINCE_LEAST of PROVINCE_KM2) number nearest the land over PROVINCE_KM2; the land of the pieces
 *  too small, and the islets, goes to the region cheapest to reach from it; an island of ISLAND_KM2 or more with
 *  no piece's seed on it seeds a region of its own (the owner, 2026-11-25: regions shouldn't cross the water). A region holding most of its natural region
 *  takes its name; one holding less, a name of its own with the region's lay of the land. Its seat: the capital in it
 *  (the biggest, if more), else its biggest place. Each region knows the states that hold it (g.states, [state, km²] the
 *  most first; g.state the first); every place gets p.region, every state s.regions (those it holds at least
 *  REGION_HELD of, and the ones it holds most of). */
const PROVINCE_KM2 = 600000, PROVINCE_LEAST = 0.35, PROVINCE_NAMED = 0.6, REGION_HELD = 0.15, ISLAND_KM2 = 0.1 * PROVINCE_KM2;
// (a landmass under ISLE_KM2 is an island — Madagascar and Borneo are, Greenland is not; a region with ISLE_ALL of its land
//  on islands is named as one, an isle where ISLE_ONE of it is on one island, else isles)
const ISLE_KM2 = 2.5 * PROVINCE_KM2, ISLE_ALL = 0.9, ISLE_ONE = 0.85;
// (a region grows from its natural region's core, the land at least CORE_SHARE as far inside it as its deepest point,
// and where two regions meet is found through the ground, as a state's border is: along a river, a crest. Once the core
// was all but the outer 90 km, and the borders kept the natural regions' blocky edges across ranges and rivers: the
// owner, 2026-11-25)
const CORE_SHARE = 0.6, CORE_CREST = 0.25, CREST_KM = 1200;
/** Each seed's core: its cells at least CORE_SHARE as far from another seed's land (or land no seed holds) as its
 *  farthest. The coast is not an edge. */
function coresOf(S, seeds) {
    const { w, h, n, land } = S, lab = new Int16Array(n).fill(-1), hop = new Int32Array(n).fill(-1), queue = new Int32Array(n);
    seeds.forEach((k, i) => { if (k.cells) for (const c of k.cells) lab[c] = i; });
    let qn = 0;
    const nb = (c, f) => { const y = (c / w) | 0, x = c - y * w; f(y * w + (x + 1) % w); f(y * w + (x + w - 1) % w); if (y > 0) f(c - w); if (y < h - 1) f(c + w); };
    for (let c = 0; c < n; c++) {
        if (lab[c] < 0) continue;
        let edge = false;
        nb(c, d => { if (land[d] && lab[d] !== lab[c]) edge = true; });
        if (edge) { hop[c] = 0; queue[qn++] = c; }
    }
    for (let qi = 0; qi < qn; qi++) {
        const c = queue[qi];
        nb(c, d => { if (lab[d] === lab[c] && hop[d] < 0) { hop[d] = hop[c] + 1; queue[qn++] = d; } });
    }
    for (const k of seeds) {
        if (!k.cells) continue;
        let far = 0;
        for (const c of k.cells) if (hop[c] > far) far = hop[c];
        const at = Math.ceil(CORE_SHARE * far), core = k.cells.filter(c => (hop[c] < 0 || hop[c] >= at) && !(S.crest?.[c] > CORE_CREST));
        if (core.length) { k.cells = core; k.c = core[0]; }
    }
}
/** An island with no province's seed on it, but of ISLAND_KM2 or more, seeds its own (biggest first, after the provinces):
 *  regions grow across the sea too, so without one it would go to the nearest province over the water. Smaller islets
 *  still join the nearest region, often a bigger neighbouring island's. Named after the natural region holding most of it. */
function islandSeeds(S, seeds, level, nodes, l) {
    const { w, h, n, land, area } = S, seen = new Uint8Array(n), queue = new Int32Array(n), add = [];
    for (const k of seeds) for (const c of k.cells ?? [k.c]) seen[c] = 2;
    for (let c0 = 0; c0 < n; c0++) {
        if (!land[c0] || seen[c0]) continue;
        let qn = 0, km2 = 0, seeded = false;
        seen[c0] = 1; queue[qn++] = c0;
        for (let qi = 0; qi < qn; qi++) {
            const c = queue[qi], y = (c / w) | 0, x = c - y * w;
            km2 += area[y];
            const f = d => { if (!land[d]) return; if (seen[d] === 2) seeded = true; else if (!seen[d]) { seen[d] = 1; queue[qn++] = d; } };
            f(y * w + (x + 1) % w); f(y * w + (x + w - 1) % w); if (y > 0) f(c - w); if (y < h - 1) f(c + w);
        }
        if (seeded || km2 < ISLAND_KM2) continue;
        const cells = Array.from(queue.subarray(0, qn)), most = new Map();
        for (const c of cells) if (level[c] >= 0) most.set(level[c], (most.get(level[c]) ?? 0) + area[(c / w) | 0]);
        const g = [...most].sort((p, q) => q[1] - p[1])[0]?.[0];
        add.push({ c: cells[0], cells, nat: g >= 0 ? nodes[g] : null, level: g >= 0 ? l : -1, part: km2 });
    }
    for (const k of add.sort((p, q) => q.part - p.part)) seeds.push(k);
}
/** Which regions are islands, per region: 'Isle' (its land nearly all, ISLE_ALL or more, on landmasses under ISLE_KM2,
 *  most of it on one of them), 'Isles' (spread over several), or null. */
function islesOf(S, own, R) {
    const { w, h, n, land, area } = S, comp = new Int32Array(n).fill(-1), queue = new Int32Array(n), compKm = [];
    for (let c0 = 0; c0 < n; c0++) {
        if (!land[c0] || comp[c0] >= 0) continue;
        const id = compKm.length;
        let qn = 0, km2 = 0;
        comp[c0] = id; queue[qn++] = c0;
        for (let qi = 0; qi < qn; qi++) {
            const c = queue[qi], y = (c / w) | 0, x = c - y * w;
            km2 += area[y];
            const f = d => { if (land[d] && comp[d] < 0) { comp[d] = id; queue[qn++] = d; } };
            f(y * w + (x + 1) % w); f(y * w + (x + w - 1) % w); if (y > 0) f(c - w); if (y < h - 1) f(c + w);
        }
        compKm.push(km2);
    }
    const on = Array.from({ length: R }, () => new Map()), all = new Float64Array(R);
    for (let c = 0; c < n; c++) {
        const r = own[c];
        if (r < 0 || !land[c]) continue;
        const a = area[(c / w) | 0];
        all[r] += a;
        on[r].set(comp[c], (on[r].get(comp[c]) ?? 0) + a);
    }
    return on.map((m, r) => {
        let isle = 0, most = 0;
        for (const [k, a] of m) if (compKm[k] < ISLE_KM2) { isle += a; most = Math.max(most, a); }
        if (!(all[r] > 0) || isle < ISLE_ALL * all[r]) return null;
        return most >= ISLE_ONE * all[r] ? 'Isle' : 'Isles';
    });
}
/** The shared border (in grid steps) of each pair of owners on the land cells: Map of `a * N + b` (a < b) → steps. */
function bordersOf(S, own, N) {
    const { w, h, n, land } = S, out = new Map();
    const add = (a, b) => { if (a < 0 || b < 0 || a === b) return; const k = a < b ? a * N + b : b * N + a; out.set(k, (out.get(k) ?? 0) + 1); };
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        const y = (c / w) | 0, x = c - y * w, r = y * w + (x + 1) % w;
        if (land[r]) add(own[c], own[r]);
        if (y < h - 1 && land[c + w]) add(own[c], own[c + w]);
    }
    return out;
}
function regionsOf(S, cost, caps, states, towns, places, own0, own1, L, o, lay, warp) {
    const { w, n, land, area, pop } = S, { levels, nodes } = S.nature, all = caps.concat(towns, places);
    natureNames(S, all, o);
    let total = 0;
    for (let c = 0; c < n; c++) if (land[c]) total += area[(c / w) | 0];
    // (the natural level whose big-enough pieces come nearest one to about PROVINCE_KM2 of the land)
    const want = Math.max(1, Math.round(total / PROVINCE_KM2));
    let pick = null;
    for (let l = 0; l < levels.length; l++) {
        const sig = nodes[l].filter(g => g.km2 >= PROVINCE_LEAST * PROVINCE_KM2);
        if (!sig.length) continue;
        if (!pick || Math.abs(Math.log(sig.length / want)) < Math.abs(Math.log(pick.sig.length / want))) pick = { l, sig };
    }
    const seeds = [];
    if (pick) {
        const cells = new Map(pick.sig.map(g => [g.i, []]));
        for (let c = 0; c < n; c++) { const g = levels[pick.l][c]; if (g >= 0) cells.get(g)?.push(c); }
        for (const g of pick.sig.sort((p, q) => q.km2 - p.km2)) {
            const cs = cells.get(g.i);
            if (cs.length) seeds.push({ c: cs[0], cells: cs, nat: g, level: pick.l, part: g.km2 });
        }
    }
    if (pick) islandSeeds(S, seeds, levels[pick.l], nodes[pick.l], pick.l);
    if (!seeds.length) for (const s of states) seeds.push({ c: s.cap.c, nat: null, part: 0 });
    seeds.length = Math.min(seeds.length, 1024);
    coresOf(S, seeds);
    // (a crest is a toll as a big river is: coming onto its sharpest costs CREST_KM on its own ground (a mountain's cost, so
    // the toll outweighs the climb a range already is), leaving it nothing, so two regions meet on it rather than one
    // climbing over and taking the far slope; S.crest, dividesOf's; calmOf keeps the warp off it)
    const X = Float32Array.from(lay.X);
    if (S.crest) for (let c = 0; c < n; c++) X[c] = Math.max(X[c], CREST_KM * Math.max(1, cost[c]) * S.crest[c]);
    const reg0 = grow(S, cost, seeds, seeds.map(() => 1), L, { ow: 1024, lay: { X, A: lay.A } });
    const reg = warpField(S, reg0, L, warp.du, warp.dv);
    const regions = seeds.map((k, i) => ({ i, state: -1, states: [], seat: null, name: '', nat: k.nat, level: k.level ?? -1, part: k.part, km2: 0, people: 0, places: 0 }));
    // (the states holding each: their land in it, read through the warp as the map reads it)
    const held = regions.map(() => new Map());
    for (let c = 0; c < n; c++) {
        const r = reg.own1[c];
        if (r < 0 || !land[c]) continue;
        const g = regions[r], a = area[(c / w) | 0];
        g.km2 += a; g.people += pop[c];
        if (own1[c] >= 0) held[r].set(own1[c], (held[r].get(own1[c]) ?? 0) + a);
    }
    regions.forEach((g, i) => { g.states = [...held[i]].sort((p, q) => q[1] - p[1]); g.state = g.states[0]?.[0] ?? -1; });
    for (const p of all) {
        const r = reg.own1[p.c];
        p.region = r >= 0 ? r : regions.findIndex(q => q.state === p.state);
        if (p.region < 0) continue;
        const g = regions[p.region], rank = q => (q === states[q.state]?.cap ? 1e12 : 0) + (q.people ?? 0);   // (a capital first)
        g.places++;
        if (!g.seat || rank(p) > rank(g.seat)) g.seat = p;
    }
    for (const g of regions) {
        const at = g.seat ?? states[g.state]?.cap ?? caps[0], N = g.nat;
        g.proper = !N ? '' : g.part >= PROVINCE_NAMED * N.km2 ? N.proper : nameOf(Math.round(at.lat * 10), Math.round(at.lon * 10), o.roll + 11);
        g.seat ??= at;
    }
    // (the words: its natural region's where it holds that, else its own; a neighbour of the same lay already named with
    // the word takes the next — so thirty vales on a map read as vales, valleys, straths and bottoms, not thirty "Vale"s)
    const R = regions.length, near = regions.map(() => []), isles = islesOf(S, reg.own1, R);
    for (const [k] of bordersOf(S, reg.own1, R)) { const a = Math.floor(k / R), b = k % R; near[a].push(b); near[b].push(a); }
    for (const g of [...regions].sort((p, q) => q.km2 - p.km2)) {
        const N = g.nat, isle = isles[g.i];
        if (!N && !isle) { g.name = states[g.state]?.name ?? ''; continue; }
        if (!N) g.proper = nameOf(Math.round(g.seat.lat * 10), Math.round(g.seat.lon * 10), o.roll + 11);
        const land = g.land = isle ?? N.land;
        const ws = landWords(land), used = new Set(near[g.i].map(j => regions[j]).filter(q => q.word && q.land === land).map(q => q.word));
        const own = !isle && g.proper === N.proper ? N.word : wordAt(land, g.seat.lat, g.seat.lon, o.roll);
        let w = own;
        for (let k = 0; k < ws.length && used.has(w); k++) w = ws[(ws.indexOf(own) + k + 1) % ws.length];
        g.word = w;
        g.name = isle ? w.replace('%', g.proper) : naturalName(N, g.proper, w);
    }
    for (const s of states) s.regions = regions.filter(g => g.state === s.i || g.states.some(([k, km2]) => k === s.i && km2 >= REGION_HELD * g.km2)).map(g => g.i);
    labelPoints(S, regions, reg.own1, reg.key1, L);
    return { reg, regions };
}

/** The natural region at a place, at each level (finest first), or null at sea. */
export function natureAt(T, lat, lon) {
    const S = T.S, c = Math.min(S.h - 1, Math.max(0, Math.floor((90 - lat) / 180 * S.h))) * S.w + ((Math.floor((lon + 180) / 360 * S.w) % S.w) + S.w) % S.w;
    const g = S.nature.levels[0][c];
    return g < 0 ? null : S.nature.levels.map((lev, l) => S.nature.nodes[l][lev[c]]);
}

/** The owner at (u, v) of the map, read smoothly between the cells: the capital whose cost there, interpolated off the
 *  four cells round it, is least; and the next. Into r: { a, ka, b, kb }. G: the field read (the states', or T.reg the
 *  regions'). */
export function ownerAt(T, u, v, r, G = T, warped = false) {
    // (the fine warp: the place read a little way off, as far as the calm there lets it; r.u, r.v the place read)
    if (!warped && T.wiggle > 0 && T.calm) {
        const s = T.wiggle * sample(T.calm, T.S.w, T.S.h, u, v), k = r.k ??= [0, 0];
        if (s > 0) { warpKm(90 - v * 180, u * 360 - 180, FINE_KM, FINE_SWAY, T.roll, k); moveUV(u, v, s * k[0], s * k[1], k); u = k[0]; v = k[1]; }
    }
    r.u = u; r.v = v;
    return ownerCore(T.S, T.L, G, u, v, r);
}
/** ownerAt's reading, unwarped: the grid S, the most a cost may be L, the field G. */
function ownerCore(S, L, G, u, v, r) {
    const { w, h } = S, gx = u * w - 0.5, gy = Math.min(h - 1, Math.max(0, v * h - 0.5)), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const xa = (x0 % w + w) % w, xb = (x0 + 1) % w, ya = y0, yb = Math.min(h - 1, y0 + 1);
    const cs = [ya * w + xa, ya * w + xb, yb * w + xa, yb * w + xb], ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    r.a = -1; r.ka = Infinity; r.b = -1; r.kb = Infinity;
    const seen = r.seen ??= new Int16Array(8), { own1, own2, key1, key2 } = G;
    let ns = 0;
    for (const c of cs) for (const o of [own1[c], own2[c]]) if (o >= 0 && !seen.subarray(0, ns).includes(o)) seen[ns++] = o;
    for (let j = 0; j < ns; j++) {
        const o = seen[j];
        let k = 0;
        for (let q = 0; q < 4; q++) { const c = cs[q]; k += ws[q] * (own1[c] === o ? key1[c] : own2[c] === o ? key2[c] : 1.6 * L); }
        if (k < r.ka) { r.b = r.a; r.kb = r.ka; r.a = o; r.ka = k; } else if (k < r.kb) { r.b = o; r.kb = k; }
    }
    return r;
}

/** The States view's colour (into c) at a picture `W` wide's land pixel (x, y): each state its colour, the land none
 *  holds paper, the contested frontier striped with its rival's, the borders ink; the capitals' pins, the bottlenecks'
 *  diamonds and the flashpoints' open pins. */
export function statesColorAt(fin, W) {
    const T = statesOf(fin);
    if (!T) return (x, y, c) => { c[0] = PAPER[0]; c[1] = PAPER[1]; c[2] = PAPER[2]; return c; };   // (none yet: the worker is on them)
    const H = W >> 1, pxKm = 2 * Math.PI * R / W, r = {}, q = {};
    const mark = (lat, lon, km, px, kind) => {
        const rr = Math.max(px, km / pxKm), cx = (lon + 180) / 360 * W, cy = (90 - lat) / 180 * H;
        return { cx, cy, r: rr, sq: Math.max(0.05, Math.cos(lat * D)), y0: cy - rr - 1, y1: cy + rr + 1, kind };
    };
    const marks = [...T.caps.map(k => mark(k.lat, k.lon, PIN_KM, PIN_PX, 'cap')), ...T.bottlenecks.map(k => mark(k.lat, k.lon, MARK_KM, MARK_PX, 'choke')),
        ...T.flash.map(k => mark(k.lat, k.lon, MARK_KM, MARK_PX, 'flash'))];
    // (a border's width: ~1.4 pixels of the picture, in cost — the local cost of a km over the owner's power)
    const P = Math.max(4, Math.round(W / 256));
    return (x, y, c) => {
        for (const m of marks) {
            if (y < m.y0 || y > m.y1) continue;
            let dx = Math.abs(x + 0.5 - m.cx); dx = Math.min(dx, W - dx); dx *= m.sq;
            const dy = y + 0.5 - m.cy, d = m.kind === 'choke' ? Math.abs(dx) + Math.abs(dy) : Math.hypot(dx, dy);
            if (d <= m.r) {
                const ring = d > (m.kind === 'cap' ? 0.62 : 0.55) * m.r, k = m.kind === 'flash' ? (ring ? PIN_FILL : PIN_INK) : (ring ? PIN_INK : PIN_FILL);
                c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; return c;
            }
        }
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        ownerAt(T, u, v, r);
        if (r.a < 0 || r.ka > T.L) { c[0] = PAPER[0]; c[1] = PAPER[1]; c[2] = PAPER[2]; return c; }
        const S = T.states[r.a], unit = sample(T.cost, T.S.w, T.S.h, u, v), local = unit / T.power[r.a], edge = 1.4 * pxKm * local;
        if ((r.b >= 0 && r.kb - r.ka < edge) || T.L - r.ka < edge) { c[0] = PIN_INK[0]; c[1] = PIN_INK[1]; c[2] = PIN_INK[2]; return c; }
        let k = CAT[S.colour];
        // (a region's border, through the states as the land runs: as wide as a state's, ~1.4 pixels of the picture — any
        // thinner and the globe, which shows the picture several times smaller, averages it away — but the colour of the
        // state it crosses toward ink, not ink; where it meets a state's border, the state's line is the one drawn)
        if (regionsShown.on) {
            ownerAt(T, r.u, r.v, q, T.reg, true);
            if (q.a >= 0 && q.b >= 0 && q.kb - q.ka < 1.4 * pxKm * unit) return regionEdge(k, c);
        }
        // (the frontier: where the rival is nearly as near, striped with its colour)
        if (r.b >= 0 && r.kb <= T.L && r.kb < 1.12 * r.ka + 25 && (x + y) % P < Math.max(1, P >> 2)) k = CAT[T.states[r.b].colour];
        c[0] = k[0]; c[1] = k[1]; c[2] = k[2];
        return c;
    };
}

// ── the readout and the legend ──
const people = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)} million` : v >= 1e4 ? `${Math.round(v / 1e3)} thousand` : v >= 1e3 ? `${(Math.round(v / 100) * 100).toLocaleString()}` : `${Math.max(10, Math.round(v / 10) * 10)}`);
const where = (lat, lon) => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
const css = k => `rgb(${k.join(',')})`;
/** A state's metals in words: the moderate or richer it holds, the needs it lacks. */
function holds(s) {
    const [, p1, p2] = GEOLOGY.deposits.grades, has = [], lacks = [];
    WANT_IDS.forEach((id, m) => { if (WANT_I[m] < 0) return; const v = s.ores[m], nm = METALS[WANT_I[m]].name.toLowerCase(); if (v >= p2) has.push(`rich ${nm}`); else if (v >= p1) has.push(nm); else if (NEED.includes(id)) lacks.push(nm); });
    return { has, lacks };
}
/** The readout's line at (u, v) of the map (0…1). */
export function statesLine(fin, u, v) {
    const T = statesOf(fin);
    if (!T) return 'the states are being worked out…';
    const r = ownerAt(T, u, v, {}), lat = 90 - v * 180, lon = u * 360 - 180;
    if (r.a < 0 || r.ka > T.L) return 'no state holds it — too far, too dear to hold';
    const s = T.states[r.a], near = (list, km) => list.find(k => arcKm(k.lat, k.lon, lat, lon) <= km);
    const cap = near(T.caps, PIN_KM * 1.5), choke = near(T.bottlenecks, MARK_KM * 2), fl = near(T.flash, MARK_KM * 2);
    const rival = r.b >= 0 && r.kb <= T.L && r.kb < 1.12 * r.ka + 25 ? ` · contested with <b>${T.states[r.b].name}</b>` : '';
    const town = !cap && (near(T.towns, PIN_KM * 1.5) || near(T.places, PIN_KM));
    const extra = cap ? ` · <b>its capital</b>${cap.hand ? ' (placed by hand)' : ''}, ~${people(cap.people)}: ${whyWords(T, cap)}` : town ? ` · <b>${town.name}</b>, ${RANK[town.rank]} of ~${people(town.people)}: ${whyWords(T, town)}` : choke ? ` · <b>a ${choke.kind}</b> between ${T.states[choke.a].name} and ${T.states[choke.b].name}`
        : fl ? ` · <b>a flashpoint</b>${fl.metal ? ` over ${fl.metal}` : ''}` : '';
    return `<b>${s.name}</b> — could feed ~${people(s.people)}${rival}${extra}`;
}
/** A place's rank in words. */
const RANK = { cap: 'capital', city: 'a city', town: 'a town', village: 'a village', fort: 'a fort' };
const btn = (attr, label, title, on = null, dis = false) => `<button type="button" class="evo-farm-chip${on ? ' on' : ''}" ${attr} title="${title}"${on !== null ? ` aria-pressed="${on}"` : ''}${dis ? ' disabled' : ''}>${label}</button>`;
/** The legend, with the Food legend's parts: head, note. */
export function statesLegendHTML(fin, { head, note }) {
    const T = statesOf(fin);
    if (!T) return head('States') + note('Working out the states: the capitals, the borders, the towns and the roads…');
    const o = statesOptions, ri = o.reach ? REACHES.indexOf(o.reach) : REACHES.length / 2;
    const stepper = `<span class="empire-count">States ${btn('data-states-count="-1" aria-label="One state fewer"', '−', 'One state fewer', null, o.count <= STATES_COUNT.min)}<em>${T.caps.length}</em>${btn('data-states-count="1" aria-label="One state more"', '+', 'One state more', null, o.count >= STATES_COUNT.max)}</span>`;
    const reach = `<span class="empire-count">Reach ${btn('data-states-reach="-1" aria-label="Shorter reach"', '−', 'Power reaches less far: smaller states, and more of them', null, ri <= 0)}<em>${o.reach ? '' : 'auto · '}${T.reach.toLocaleString()} km</em>${btn('data-states-reach="1" aria-label="Longer reach"', '+', 'Power reaches further: bigger states, and fewer', null, ri >= REACHES.length - 1)}</span>`;
    const wi = o.wiggle ?? 2;
    const wiggle = `<span class="empire-count">Borders ${btn('data-states-wiggle="-1" aria-label="Straighter borders"', '−', 'Straighter borders: at the least, the bare line where two capitals cost the same', null, wi <= 0)}<em>${WIGGLE_WORDS[wi]}</em>${btn('data-states-wiggle="1" aria-label="More winding borders"', '+', 'More winding borders: bent by the chances of history, less so on rivers and crests', null, wi >= WIGGLES.length - 1)}</span>`;
    const bi = o.bend ?? 2;
    const bendStep = `<span class="empire-count">Roads ${btn('data-states-bend="-1" aria-label="Straighter roads"', '−', 'Straighter roads: at the least, the cheapest way smoothed', null, bi <= 0)}<em>${BEND_WORDS[bi]}</em>${btn('data-states-bend="1" aria-label="More winding roads"', '+', 'More winding roads: bent off the cheapest way, less so in the mountains and along big rivers', null, bi >= BENDS.length - 1)}</span>`;
    const chips = btn('data-states="rivers"', 'River borders', 'Big rivers are dear to cross, so borders settle on them; without, a river only joins its banks', o.rivers) +
        btn('data-states="seas"', 'Sea lanes', 'Coastal seas join the land around them; without, every sea divides', o.seas) +
        btn('data-states="ores"', 'Metals', 'Capitals weigh the metals near them (tin, gold, silver, copper, salt, iron)', o.ores) +
        btn('data-states-roll', 'Reroll', 'Roll other capitals and borders: the same land, another draw') +
        (o.pins.length || o.drops.length || o.reach ? btn('data-states-reset', 'Reset', 'Forget the capitals placed and dropped by hand, and let Reach follow the spacing again') : '');
    const list = T.states.slice().sort((p, q) => q.people - p.people).map(s => {
        const { lacks } = holds(s);
        return `<li><i class="states-sw" style="background:${css(CAT[s.colour])}"></i><b>${s.name}</b> · ~${people(s.people)}` +
            `${s.regions.length > 1 ? ` · ${s.regions.length} regions` : ''}${lacks.length ? ` · lacks ${lacks.join(', ')}` : ''}</li>`;
    }).join('');
    const nm = i => T.states[i].name;
    const necks = T.bottlenecks.slice(0, 6).map(k => `<li>${k.kind.charAt(0).toUpperCase() + k.kind.slice(1)} between <b>${nm(k.a)}</b> and <b>${nm(k.b)}</b> · ${where(k.lat, k.lon)}</li>`).join('');
    const flashes = T.flash.slice(0, 6).map(f => `<li><b>${nm(f.a)}</b> and <b>${nm(f.b)}</b>: ${f.metal ? `${f.metal}` : f.site >= 0.6 ? 'a fine city site' : 'rich farmland'} · ${where(f.lat, f.lon)}</li>`).join('');
    const icon = whyIcon;
    const key = Object.entries(WHY).map(([k, [label, words]]) => `<span title="${words}">${icon(k)} ${label}</span>`).join(' · ');
    const hubs = T.towns.filter(t => t.hub).map(t => `<li>${t.why.map(k => icon(k, t)).join('')} <b>${t.name}</b> (${nm(t.state)}) · ${whyWords(T, t)} · ${where(t.lat, t.lon)}</li>`).join('');
    return head(`States — ${T.caps.length} for the whole planet, as it is now`) +
        `<div class="evo-farm-chips">${stepper}${reach}${wiggle}${bendStep}</div><div class="evo-farm-chips">${chips}</div>` +
        `<ol class="empire-spots states-list">${list}</ol>` +
        `<div class="evo-legend-note states-why-key"><b>Why places stand</b> (the icons before their names): ${key}</div>` +
        `<div class="evo-legend-note"><b>Places</b>, tier under tier (Christaller's central places): a capital, cities ~${TIERS.cityKm} km apart, market towns ~${TIERS.townKm} km, villages ~${TIERS.villageKm} km where the land could feed them, mining towns and villages by the deposits worth working (gold, silver, gems, tin, copper, salt, jade: in the hills and the dry country farming alone would leave empty, their miners fed by the food they buy), and forts at the crossings worth guarding and on the hills over the narrows the roads run through (a valley or a river’s pass between high ground). Names go to the most important first (people, tier, why it stands) as the screen has room: zoom in to see the smaller ones. Every resource shows at every zoom: zoomed out, at the most important place holding it in each state; zoomed in, at the most important in each natural region (its badge alone where the name has no room). <b>Regions</b>: the land's own parts, cut from the natural regions and blind to the borders, so one may run across two states — land of one character (mountains, a plateau, marsh, desert, farmland, pasture, forest), named for its metal or gem where the places living by one hold much of its people</div>` +
        (hubs ? `<div class="evo-legend-note"><b>Trade hubs</b>: where the goods of different lands first meet on the roads (Ullman's complementarity, Cooley's break-of-bulk) — grain and livestock where farmers and herders meet, metals and gems coming down from the hills, the sea's trade at a harbour — the more and the dearer the goods the better, then the busiest junctions; one or two a state, none where nothing meets. Each place joins its near neighbours; each village leads to its nearest town, each town to its nearest city, each city to its capital, and neighbouring capitals to each other, round the hills rather than over them; three places that would chain meet at a fork between them instead. The villages most tracks run through, or where goods meet, grow into market towns</div><ol class="empire-spots">${hubs}</ol>` : '') +
        (necks ? `<div class="evo-legend-note"><b>Bottlenecks</b> (diamonds)</div><ol class="empire-spots">${necks}</ol>` : '') +
        (flashes ? `<div class="evo-legend-note"><b>Flashpoints</b> (open pins): contested and worth it</div><ol class="empire-spots">${flashes}</ol>` : '') +
        note('Click a state or a place to read about it; found or drop capitals from there. Each state is the land cheapest to hold from its capital — open, fed lowland and navigable rivers cheap; ' +
            'mountains, marsh, desert and open sea dear, climbing and crossing a big river dearer — the stronger a capital (the more its land could feed) the further it reaches, so borders settle on crests and rivers. Striped: a frontier its rival could as well hold. ' +
            'A base to rework: who could rule where, not who did');
}

/** A click on the legend's chips; true if it was one. */
export function statesChipClicked(target) {
    const o = statesOptions, t = target.closest?.('[data-states-count],[data-states-reach],[data-states-wiggle],[data-states-bend],[data-states],[data-states-roll],[data-states-reset]');
    if (!t) return false;
    if (t.dataset.statesBend) { o.bend = Math.max(0, Math.min(BENDS.length - 1, (o.bend ?? 2) + Number(t.dataset.statesBend))); return true; }
    if (t.dataset.statesWiggle) { o.wiggle = Math.max(0, Math.min(WIGGLES.length - 1, (o.wiggle ?? 2) + Number(t.dataset.statesWiggle))); return true; }
    if (t.dataset.statesCount) o.count = Math.max(STATES_COUNT.min, Math.min(STATES_COUNT.max, Math.max(o.count, o.pins.length) + Number(t.dataset.statesCount)));
    else if (t.dataset.statesReach) {
        // (from auto: the step nearest the reach it had)
        const now = o.reach || statesOf.last?.reach || 900, i = REACHES.reduce((b, r, j) => (Math.abs(r - now) < Math.abs(REACHES[b] - now) ? j : b), 0);
        o.reach = REACHES[Math.max(0, Math.min(REACHES.length - 1, i + Number(t.dataset.statesReach)))];
    }
    else if (t.dataset.states) o[t.dataset.states] = !o[t.dataset.states];
    else if (t.hasAttribute('data-states-roll')) o.roll++;
    else if (t.hasAttribute('data-states-reset')) { o.pins = []; o.drops = []; o.reach = 0; o.version++; }
    return true;
}
/** What a click picked, found again in the states as they are now: a capital, a city (or trade hub), or a smaller place
 *  (town, village, fort) at { lat, lon }, else the land there. { kind: 'cap' | 'town' | 'place' | 'land', place, state,
 *  lat, lon } — state -1 for unclaimed land, null at sea. */
export function statesPicked(fin, pick) {
    const T = statesOf(fin), same = p => arcKm(p.lat, p.lon, pick.lat, pick.lon) < 1;
    if (!T) return null;
    if (pick.kind === 'cap') { const k = T.caps.find(same); if (k) return { kind: 'cap', place: k, state: T.caps.indexOf(k), lat: k.lat, lon: k.lon }; }
    if (pick.kind === 'town') { const t = T.towns.find(same); if (t) return { kind: 'town', place: t, state: t.state, lat: t.lat, lon: t.lon }; }
    if (pick.kind === 'place') { const t = T.places.find(same); if (t) return { kind: 'place', place: t, state: t.state, lat: t.lat, lon: t.lon }; }
    const S = T.S, u = (pick.lon + 180) / 360, v = (90 - pick.lat) / 180, c = Math.min(S.h - 1, Math.floor(v * S.h)) * S.w + Math.min(S.w - 1, Math.floor(u * S.w));
    if (!S.land[c]) return null;
    const r = ownerAt(T, u, v, {});
    return { kind: 'land', state: r.a >= 0 && r.ka <= T.L ? r.a : -1, rival: r.b >= 0 && r.kb <= T.L && r.kb < 1.12 * r.ka + 25 ? r.b : -1, lat: pick.lat, lon: pick.lon };
}
const ICON = whyIcon;
const list = a => a.join(', ').replace(/, ([^,]*)$/, ' and $1');
/** An area in words: millions of km² to one decimal, else thousands. */
const areaWords = km2 => (km2 >= 1e6 ? `${(km2 / 1e6).toFixed(1)} million km²` : `${Math.round(km2 / 1e3).toLocaleString()} thousand km²`);
const row = (label, html) => `<div class="states-card__row"><b>${label}</b><span>${html}</span></div>`;
const act = (name, label) => `<button type="button" class="evo-farm-chip" data-states-act="${name}">${label}</button>`;
/** One reason in full, for the card. */
function whyLine(p, k) {
    const words = k === 'trade' ? `${p.meets?.length ? `${goodsWords(p)} could meet here` : 'on a busy road'}${p.joins?.length ? `, on the roads from ${list(p.joins.slice(0, 6))}${p.joins.length > 6 ? ' and more' : ''}` : ''}`
        : k === 'port' ? 'on the sea coast' : k === 'farm' ? 'amid land that could feed many'
        : k === 'mine' ? (p.metal ? `by a deposit of ${p.metal}` : 'by a metal deposit')
        : k === 'precious' ? `by a deposit of ${p.precious ?? 'gold'}` : k === 'mineral' ? `by a deposit of ${p.mineral ?? 'salt'}`
        : k === 'gem' ? `by a deposit of ${p.gem ?? 'gems'}` : k === 'stone' ? `by a deposit of ${p.stone ?? 'fine stone'}` : `guards ${guardWords(p)}`;
    return `<li>${ICON(k, p)} <b>${WHY[k][0]}</b>: ${words}</li>`;
}
/** What a state lives by, from its places' reasons weighed by their people: a few words, the most first. The places with
 *  no reason of their own farm. */
const FOCUS = { farm: 'farming', port: 'sea trade', trade: 'overland trade', mine: 'mining', precious: 'gold and silver',
    mineral: 'salt', gem: 'gems', stone: 'fine stone', hold: 'holding its passes' };
function focusOf(T, i) {
    const w = {}, all = [T.caps[i], ...T.towns.filter(t => t.state === i), ...T.places.filter(p => p.state === i)];
    for (const p of all) {
        const why = p.why?.length ? p.why : ['farm'];
        for (const k of why) w[k] = (w[k] ?? 0) + (p.people ?? 0) / why.length;
    }
    const top = Object.entries(w).sort((a, b) => b[1] - a[1]), most = top[0]?.[1] ?? 0;
    return top.filter(([, v]) => v >= 0.2 * most).slice(0, 3).map(([k]) => k);
}
/** What a state's land yields beyond food: its metals (holds), the gold, salt, gems and fine stones its places stand by. */
function yieldsOf(T, i, has) {
    const out = new Set(has);
    for (const p of [T.caps[i], ...T.towns, ...T.places]) {
        if (p.state !== i) continue;
        for (const k of ['precious', 'mineral', 'gem', 'stone']) if (p[k]) out.add(p[k]);
    }
    return [...out];
}
/** The region a place lies in, in words. */
const regionWords = (T, p) => { const g = T.regions[p.region]; return g?.name ? `${g.name}, ` : ''; };
/** A region's seat in words: a capital is named for its state ("the capital, Arn"), any other place by its own name. */
const seatWords = (T, p) => (p === T.states[p.state]?.cap ? `the capital, ${T.states[p.state].name}` : p.name);
/** The other states a region runs into, in words ("shared with Arn and Tesk"), or ''. */
const sharedWords = (T, g, s) => { const o = g.states.filter(([k, km2]) => k !== s && km2 >= REGION_HELD * g.km2).map(([k]) => T.states[k].name); return o.length ? `; shared with ${list(o)}` : ''; };
/** The natural regions at a place, for the card: the smallest holding it, and the largest where that is another. */
function landRow(T, lat, lon) {
    const chain = natureAt(T, lat, lon);
    if (!chain) return '';
    const g = chain[0], top = chain[chain.length - 1], words = k => `<b>${k.name}</b> (${k.what}${k.ore ? `, rich in ${k.ore}` : ''})`;
    return row('Land', `${words(g)}${top.name !== g.name ? `, in ${words(top)}` : ''}`);
}
/** The infobox for a pick (statesPicked): what the state or the place is about. { title, why, html } or null. */
export function statesInfo(fin, pick) {
    const P = statesPicked(fin, pick);
    if (!P) return null;
    const T = statesOf(fin), nm = i => T.states[i].name, here = where(P.lat, P.lon);
    if (P.kind !== 'land') {
        const p = P.place, s = T.states[P.state], isCap = P.kind === 'cap';
        const what = isCap ? `Capital of ${s.name}` : p.market ? 'Market town' : p.hub ? 'Trade hub' : { city: 'City', town: 'Town', village: 'Village', fort: 'Fort' }[p.rank];
        let html = `<div class="states-card__sub">${what}${isCap && p.hand ? ' · placed by hand' : ''} · ${here}</div>` +
            (p.why.length ? `<ul class="states-card__why">${p.why.map(k => whyLine(p, k)).join('')}</ul>` : `<p class="states-card__text">A farming place: no reason beyond the land round it.</p>`) +
            (p.market && p.meets?.length && !p.hub ? row('Market', `${goodsWords(p)} could change hands here`) : '') +
            row('People', `~${people(p.people)}${p.miners >= 0.5 * p.people ? `, most of them at the ${p.res?.name ?? 'deposit'} workings` : p.miners > 0 ? `, ~${people(p.miners)} of them at the ${p.res?.name ?? 'deposit'} workings` : ''}`) +
            row('Food from', `out to ~${(Math.round(feedKm(p) / 5) * 5).toLocaleString()} km (outlined)`) +
            (isCap ? '' : row('In', `${regionWords(T, p)}<b>${s.name}</b>`)) + landRow(T, p.lat, p.lon);
        html += `<div class="states-card__acts">${isCap ? act('drop', 'Drop this capital') : act('promote', 'Make it a capital')}</div>`;
        return { title: isCap ? s.name : p.name, why: p.why, place: p, html };
    }
    if (P.state < 0)
        return { title: 'Unclaimed land', why: [], html: `<div class="states-card__sub">${here}</div><p class="states-card__text">No state holds this land. A capital of its own would claim it.</p><div class="states-card__acts">${act('found', 'Found a capital here')}</div>` };
    const s = T.states[P.state], { has, lacks } = holds(s), focus = focusOf(T, P.state), yields = yieldsOf(T, P.state, has);
    const regs = s.regions.map(r => T.regions[r]), mineR = T.regions[ownerAt(T, (P.lon + 180) / 360, (90 - P.lat) / 180, {}, T.reg).a];
    const html = `<div class="states-card__sub"><i class="states-sw" style="background:${css(CAT[s.colour])}"></i>A state · ~${people(s.people)} people · ${areaWords(s.km2)}</div>` +
        row('Capital', `${s.cap.why.map(k => ICON(k, s.cap)).join('')} <b>${s.name}</b>`) +
        row('Lives by', `${focus.map(ICON).join('')} ${list(focus.map(k => FOCUS[k]))}`) +
        row('Produces', yields.length ? list(yields) : 'food, little else of note') +
        row('Lacks', lacks.length ? list(lacks) : 'none of the basics: it has iron, copper, tin and salt') +
        (mineR ? row('Region', `<b>${mineR.name}</b>${mineR.nat ? ` — ${mineR.nat.what}, its people ${mineR.nat.living}` : ''}; seat ${seatWords(T, mineR.seat)}${sharedWords(T, mineR, s.i)}`) : '') +
        landRow(T, P.lat, P.lon) +
        (regs.length > 1 ? row('Regions', regs.map(g => g === mineR ? `<b>${g.name}</b>` : g.name).join(', ')) : '') +
        (P.rival >= 0 ? row('Here', `a frontier ${nm(P.rival)} could as well hold`) : '') +
        `<div class="states-card__acts">${act('found', 'Found a capital here')}</div>`;
    return { title: s.name, why: [], html };
}
/** A button in the infobox: a capital dropped, or one founded at the pick (a town made a capital, or new land claimed).
 *  The new pick to show (the land there), or null when nothing changed. */
export function statesAct(fin, name, pick) {
    const T = statesOf(fin), o = statesOptions, P = statesPicked(fin, pick);
    if (!P) return null;
    if (name === 'drop' && P.kind === 'cap') {
        const k = P.place;
        if (k.hand) o.pins = o.pins.filter(([a, b]) => a !== k.lat || b !== k.lon);
        else o.drops.push([k.lat, k.lon]);
        o.count = Math.max(STATES_COUNT.min, T.caps.length - 1);
    } else if (name === 'promote' || name === 'found') {
        o.pins.push([P.lat, P.lon]);
        o.count = Math.min(STATES_COUNT.max, T.caps.length + 1);
    } else return null;
    o.version++;
    return { kind: 'land', lat: P.lat, lon: P.lon };
}
/** A new planet: the hand edits forgotten. */
export function statesForget() {
    const o = statesOptions;
    if (!o.pins.length && !o.drops.length) return;   // (nothing to forget: the states already built for the new planet stand)
    o.pins = []; o.drops = []; o.version++;
}
