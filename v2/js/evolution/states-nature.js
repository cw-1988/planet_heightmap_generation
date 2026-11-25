// States (fork addition): the natural regions under the states — land of one character, nested five deep, from a
// stretch of hills or a marsh (~20 thousand km²) up to a whole plateau, desert or plain (~3 million km²). The owner,
// 2026-11-24: "empire regions right now are just arbitrary lines, they would now make sense, as an opal, or iron or
// copper, or farmland or herder region, or a geographic region like a plateau, swamp, desert etc."
//
// How they are drawn: every land cell of the States grid starts as its own region, described by its height, how rugged
// and how wet it is, its climate (the Köppen groups' shares), how its people would live (farming, herding, gathering)
// and how many the land could feed. Neighbouring regions alike in all that merge, the most alike and the longest-bordered
// first (an agglomerative clustering, as in the segmentation of satellite images), up to each level's size; what is left
// too small joins its likeliest neighbour, an islet the nearest land. Each level's regions are the level above's pieces,
// so the tree nests. The provinces are cut from it (states-view.js), and the map's icons roll up it as you zoom out
// (states-overlay.js). In km and km², so it reads the same at every Detail.
import { KOPPEN_ID } from '../climate/koppen.js';

const R = 6371, D = Math.PI / 180;
/** Each level's largest region (km²), finest first. */
export const NATURE_KM2 = [20e3, 70e3, 250e3, 900e3, 3.2e6];
/** The climate groups a cell's land is shared among: their Köppen classes (indices into KOPPEN_CLASSES). */
const GROUPS = [['Af', 'Am'], ['Aw'], ['BWh', 'BWk'], ['BSh', 'BSk'], ['Cfa', 'Cfb', 'Cfc', 'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc'],
    ['Dfa', 'Dfb', 'Dsa', 'Dsb', 'Dwa', 'Dwb'], ['Dfc', 'Dfd', 'Dsc', 'Dsd', 'Dwc', 'Dwd'], ['ET', 'EF']];
export const NK = GROUPS.length, NL = 3;   // (the climate groups; the ways of life: farming, herding, gathering)
const KGROUP = new Int8Array(64).fill(-1);
GROUPS.forEach((g, j) => { for (const code of g) if (KOPPEN_ID[code] >= 0) KGROUP[KOPPEN_ID[code]] = j; });
// (a region's description, and how much each part weighs in telling two apart: height per km, ruggedness, wetland,
// each climate group's share, each way of life's, and the people the land could feed, on a log scale)
const NF = 4 + NK + NL, W_ALT = 0.9, W_RUG = 1.2, W_WET = 2, W_LIFE = 0.8, W_DENS = 0.6;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Each States-grid cell's land shared among the climate groups and the ways of life (0…255 each): NK + NL a cell.
 *  K: the Köppen picture; life: the way of life a pixel (living.js's Lifestyle), on the same pixels. */
export function natureShares(S, K, life) {
    const { w, h, n } = S, out = new Uint8Array(n * (NK + NL));
    if (!K?.koppen) return out;
    const sum = new Float32Array(n * (NK + NL)), cnt = new Float32Array(n), same = life && life.length === K.koppen.length;
    for (let y = 0; y < K.h; y++) {
        const row = Math.min(h - 1, Math.floor(y * h / K.h)) * w;
        for (let x = 0, i = y * K.w; x < K.w; x++, i++) {
            const k = K.koppen[i];
            if (!k) continue;
            const c = row + Math.min(w - 1, Math.floor(x * w / K.w)), g = KGROUP[k];
            cnt[c]++;
            if (g >= 0) sum[c * (NK + NL) + g]++;
            if (same && life[i] > 0) sum[c * (NK + NL) + NK + life[i] - 1]++;
        }
    }
    for (let c = 0; c < n; c++) if (cnt[c]) for (let j = 0; j < NK + NL; j++) out[c * (NK + NL) + j] = Math.round(255 * sum[c * (NK + NL) + j] / cnt[c]);
    return out;
}

/** A small heap of (key, value), the cheapest first. */
class Heap {
    constructor() { this.k = new Float64Array(1024); this.v = new Int32Array(1024); this.n = 0; }
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

/** The natural regions, nested: { levels: [Int32Array(n): each land cell's region at that level, −1 off land], nodes:
 *  [[{ i, km2, people, alt, rug, wet, kop, life, coast, river, lat, lon, up }]] } — `up` the region a level above
 *  holding it. S: the States grid (land, shore, nav, slope, alt, wet, pop, area); shares: natureShares'; divide: the
 *  land's dividing lines per cell, 0…1 (crests and big rivers, states-view.js's dividesOf), along which two regions
 *  touch less: border across them counts DIVIDE_OPEN of its length, so the land splits on crests and rivers. */
const DIVIDE_OPEN = 0.08;
export function naturalTree(S, shares, divide) {
    const { w, h, n, land, area, pop } = S, ns = Math.PI * R / h, NS = NK + NL;
    const ewAt = y => Math.max(1, 2 * Math.PI * R / w * Math.cos(Math.PI / 2 - y * Math.PI / h));   // (the row edge at y, 0 … h)
    // each land cell's description
    const f = new Float32Array(n * NF);
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        const y = (c / w) | 0, o = c * NF;
        f[o] = W_ALT * Math.min(3, Math.max(0, S.alt[c]) / 1000);
        f[o + 1] = W_RUG * smooth(5, 30, S.slope[c]);
        f[o + 2] = W_WET * Math.min(1, S.wet[c]);
        f[o + 3] = W_DENS * Math.log10(1 + pop[c] / area[y]) / 2;
        for (let j = 0; j < NK; j++) f[o + 4 + j] = shares[c * NS + j] / 255;
        for (let j = 0; j < NL; j++) f[o + 4 + NK + j] = W_LIFE * shares[c * NS + NK + j] / 255;
    }
    // the regions as they merge: a union-find over the cells, each root its area, its description's area-weighted sum,
    // its perimeter (km), its neighbours (root → the km of border they share) and a stamp that changes when it does
    const up = new Int32Array(n), A = new Float64Array(n), FS = new Float64Array(n * NF), P = new Float64Array(n), ver = new Int32Array(n);
    const adj = new Array(n).fill(null);
    const find = c => { while (up[c] !== c) { up[c] = up[up[c]]; c = up[c]; } return c; };
    const link = (a, b, len) => { adj[a].set(b, (adj[a].get(b) ?? 0) + len); adj[b].set(a, (adj[b].get(a) ?? 0) + len); };
    for (let c = 0; c < n; c++) {
        up[c] = c;
        if (!land[c]) continue;
        const y = (c / w) | 0, a = area[y];
        A[c] = a; P[c] = 2 * ns + ewAt(y) + ewAt(y + 1);
        for (let j = 0; j < NF; j++) FS[c * NF + j] = f[c * NF + j] * a;
        adj[c] = new Map();
    }
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        const y = (c / w) | 0, x = c - y * w, e = y * w + (x + 1) % w;
        // (a border is open but where it lies on a crest or a big river: the more dividing of its two cells)
        const open = d => (divide ? 1 - (1 - DIVIDE_OPEN) * Math.max(divide[c], divide[d]) : 1);
        // (the perimeter stays the plain length: a cell on a river touches its banks little, not a lot of a little; a
        // merge across a divide then takes off only the open part, so a region astride one keeps counting it as edge)
        if (e !== c && land[e]) link(c, e, ns * open(e));
        if (y < h - 1 && land[c + w]) link(c, c + w, ewAt(y + 1) * open(c + w));
    }
    // (how unlike two regions are, and what joining them costs: unlike, big, and touching along little of their edge dear)
    const dist = (a, b) => {
        let s = 0;
        for (let j = 0; j < NF; j++) { const d = FS[a * NF + j] / A[a] - FS[b * NF + j] / A[b]; s += d * d; }
        return Math.sqrt(s);
    };
    const price = (a, b, len, cap) => (0.03 + dist(a, b)) * Math.sqrt((A[a] + A[b]) / cap) / (0.1 + len / Math.min(P[a], P[b]));
    const merge = (a, b) => {
        const len = adj[a].get(b) ?? 0;
        let r = a, s = b;
        if (adj[s].size > adj[r].size) { r = b; s = a; }
        up[s] = r; A[r] += A[s]; P[r] += P[s] - 2 * len;
        for (let j = 0; j < NF; j++) FS[r * NF + j] += FS[s * NF + j];
        adj[r].delete(s);
        for (const [k, l] of adj[s]) {
            if (k === r) continue;
            adj[k].delete(s);
            adj[r].set(k, (adj[r].get(k) ?? 0) + l); adj[k].set(r, (adj[k].get(r) ?? 0) + l);
        }
        adj[s] = null; ver[r]++; ver[s]++;
        return r;
    };
    const levels = [];
    let ea = new Int32Array(1024), eb = new Int32Array(1024), va = new Int32Array(1024), vb = new Int32Array(1024), ne = 0;
    const edge = (a, b) => {
        if (ne === ea.length) { const g = T => { const x = new Int32Array(ne * 2); x.set(T); return x; }; ea = g(ea); eb = g(eb); va = g(va); vb = g(vb); }
        ea[ne] = a; eb[ne] = b; va[ne] = ver[a]; vb[ne] = ver[b];
        return ne++;
    };
    for (const cap of NATURE_KM2) {
        // 1. the most alike neighbours merge, while they fit the level
        const H = new Heap();
        ne = 0;
        const offer = (a, b, len) => { if (A[a] + A[b] <= cap) H.push(price(a, b, len, cap), edge(a, b)); };
        for (let c = 0; c < n; c++) if (adj[c] && up[c] === c) for (const [b, len] of adj[c]) if (c < b) offer(c, b, len);
        while (H.n) {
            const e = H.pop(), a = ea[e], b = eb[e];
            if (up[a] !== a || up[b] !== b || ver[a] !== va[e] || ver[b] !== vb[e]) continue;
            const r = merge(a, b);
            for (const [k, len] of adj[r]) offer(r, k, len);
        }
        // 2. what is too small joins its likeliest neighbour, the smallest first
        const small = [];
        for (let c = 0; c < n; c++) if (adj[c] && up[c] === c && A[c] < cap / 8) small.push(c);
        small.sort((p, q) => A[p] - A[q]);
        const alone = [];
        for (const c of small) {
            if (up[c] !== c || A[c] >= cap / 8) continue;
            let best = -1, bp = Infinity;
            for (const [k, len] of adj[c]) { const p = price(c, k, len, cap); if (p < bp) { bp = p; best = k; } }
            if (best >= 0) merge(c, best); else alone.push(c);
        }
        // 3. an islet too small joins the nearest land across the water (a search out to half the level's breadth)
        if (alone.length) {
            const tiny = new Uint8Array(n), near = new Int32Array(n).fill(-1), hop = new Int32Array(n), q = new Int32Array(n);
            for (const c of alone) tiny[c] = 1;
            let qa = 0, qb = 0;
            for (let c = 0; c < n; c++) if (land[c] && !tiny[find(c)]) { near[c] = find(c); q[qb++] = c; }
            const most = Math.max(1, Math.round(0.5 * Math.sqrt(cap) / ns)), goes = new Map();
            while (qa < qb) {
                const c = q[qa++], y = (c / w) | 0, x = c - y * w;
                if (hop[c] >= most) continue;
                for (const d of [y * w + (x + 1) % w, y * w + (x + w - 1) % w, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
                    if (d < 0 || near[d] >= 0) continue;
                    near[d] = near[c]; hop[d] = hop[c] + 1; q[qb++] = d;
                    if (land[d]) { const r = find(d); if (tiny[r] && !goes.has(r)) goes.set(r, near[c]); }
                }
            }
            for (const [s, r] of goes) {
                const a = find(r);
                up[s] = a; A[a] += A[s];
                for (let j = 0; j < NF; j++) FS[a * NF + j] += FS[s * NF + j];
                adj[s] = null; ver[a]++;
            }
        }
        // the level: each root a region
        const lev = new Int32Array(n).fill(-1), id = new Int32Array(n).fill(-1);
        let k = 0;
        for (let c = 0; c < n; c++) if (land[c]) { const r = find(c); if (id[r] < 0) id[r] = k++; lev[c] = id[r]; }
        lev.count = k;
        levels.push(lev);
    }
    // each region's description in plain numbers, and the region a level above holding it
    const nodes = [];
    levels.forEach((lev, l) => {
        const m = lev.count, sum = new Float64Array(m * (8 + NS)), sx = new Float64Array(m * 3), cells = new Int32Array(m);
        const out = [];
        for (let c = 0; c < n; c++) {
            const g = lev[c];
            if (g < 0) continue;
            const y = (c / w) | 0, x = c - y * w, a = area[y], o = g * (8 + NS), lat = (90 - (y + 0.5) / h * 180) * D, lon = ((x + 0.5) / w * 360 - 180) * D;
            cells[g]++;
            sum[o] += a; sum[o + 1] += pop[c]; sum[o + 2] += a * S.alt[c]; sum[o + 3] += a * smooth(5, 30, S.slope[c]); sum[o + 4] += a * Math.min(1, S.wet[c]);
            sum[o + 5] += S.shore[c]; sum[o + 6] += S.nav[c];
            for (let j = 0; j < NS; j++) sum[o + 8 + j] += a * shares[c * NS + j] / 255;
            sx[g * 3] += a * Math.cos(lat) * Math.cos(lon); sx[g * 3 + 1] += a * Math.cos(lat) * Math.sin(lon); sx[g * 3 + 2] += a * Math.sin(lat);
        }
        for (let g = 0; g < m; g++) {
            const o = g * (8 + NS), a = sum[o] || 1, X = sx[g * 3], Y = sx[g * 3 + 1], Z = sx[g * 3 + 2];
            out.push({ i: g, km2: sum[o], people: sum[o + 1], alt: sum[o + 2] / a, rug: sum[o + 3] / a, wet: sum[o + 4] / a,
                kop: Array.from({ length: NK }, (_, j) => sum[o + 8 + j] / a), life: Array.from({ length: NL }, (_, j) => sum[o + 8 + NK + j] / a),
                coast: sum[o + 5] / cells[g], river: sum[o + 6] / cells[g], cells: cells[g],
                lat: Math.atan2(Z, Math.hypot(X, Y)) / D, lon: Math.atan2(Y, X) / D, up: -1 });
        }
        if (l > 0) for (let c = 0; c < n; c++) if (lev[c] >= 0) nodes[l - 1][levels[l - 1][c]].up = lev[c];
        nodes.push(out);
    });
    return { levels, nodes };
}

/** The words a region of each lay of the land may be named with (% its proper name), the first its plain word; picked per
 *  region, neighbours of one lay told apart by them (the owner, 2026-11-25: thirty "Vale"s on a map: "maybe we just need
 *  different names for vale, steppe etc"). Each word belongs to one lay only, so a word still says what the land is;
 *  most are the geographer's own (a strath, Scotland's broad river valley; a carse, its river flats; an erg, a sea of
 *  dunes; veld, southern Africa's open grassland; llanos, the Orinoco's savanna; a weald, old English for forest). */
export const LAND_WORDS = {
    Tundra: ['% Tundra', '% Barrens', '% Frostlands', '% Icefields', '% Snowfields', '% Wastes', '% Coldlands', '% Permafrost'],
    Swamps: ['% Swamps', '% Mangroves', '% Bayous', '% Morass', '% Quagmire', '% Sloughs', '% Backwaters'],
    Marshes: ['% Marshes', '% Fens', '% Mires', '% Wetlands', '% Bogs', '% Moss', '% Levels', '% Carrs', '% Reedlands'],
    Mountains: ['% Mountains', '% Range', '% Peaks', '% Spires', '% Massif', '% Crags', 'Sierra %', 'Cordillera %', '% Alps', '% Teeth', '% Ridges'],
    Plateau: ['% Plateau', '% Tablelands', '% Table', '% Shelf', '% Highveld', '% Mesas', '% Altiplano'],
    Highlands: ['% Highlands', '% Heights', '% Moors', '% Tops', '% Braes', '% Fastness'],
    Hills: ['% Hills', '% Fells', '% Knolls', '% Downs', '% Foothills', '% Wolds', '% Tors'],
    Desert: ['% Desert', '% Sands', '% Erg', '% Dunes', '% Badlands', '% Flats', '% Saltpans', '% Dustlands', '% Hamada'],
    Steppe: ['% Steppe', '% Prairie', '% Pampas', '% Scrublands', '% Drylands', '% Sagelands', '% Heath', '% Outback'],
    Jungle: ['% Jungle', '% Rainforest', '% Wilds', 'Selva %', '% Cloudforest', '% Tangle', '% Deepwood', '% Canopy', '% Vinelands'],
    Savanna: ['% Savanna', '% Bushland', '% Veld', '% Llanos', '% Parklands', '% Thornlands'],
    Taiga: ['% Taiga', '% Pinewoods', '% Northwoods', '% Timberlands', '% Boreal Forest'],
    Vale: ['% Vale', '% Valley', '% Basin', '% Bottoms', '% Dales', '% Riverlands', 'Strath %', '% Floodplain', '% Delta'],
    Plains: ['% Plains', '% Fields', '% Champaign', '% Farmlands', '% Ploughlands', '% Granary'],
    Grasslands: ['% Grasslands', '% Meadows', '% Pastures', '% Leas', '% Rangelands', '% Grazings', '% Commons', '% Greensward'],
    Forest: ['% Forest', '% Woods', '% Weald', '% Greenwood', '% Holt', '% Chase', '% Wildwood'],
    Coast: ['% Coast', '% Shore', '% Strand', '% Seaboard', '% Littoral', '% Riviera'],
    Lowlands: ['% Lowlands', '% Carse', '% Hollows', '% Polders', 'Vega %', '% Terai', '% Holms'],
    Uplands: ['% Uplands', '% Rises', '% Hinterland', '% Piedmont', '% Scarps', '% Edge', '% Benches'],
    // (a region whose land is islands, whatever their lay: one island, or many — the owner, 2026-11-25: "special names for
    //  archipelagos and islands, because they really are special geographical regions"; a cay a low sandy islet, a
    //  skerry a small rocky one)
    Isle: ['Isle of %', '% Island', '% Isle'],
    Isles: ['% Islands', '% Isles', '% Archipelago', '% Cays', '% Skerries'],
};
/** The words of a lay of the land: LAND_WORDS', or its own plain word. */
export const landWords = (land) => LAND_WORDS[land] ?? [`% ${land}`];
/** A region's lay of the land in a word (a plural or a mass noun), and what it is in a few words: { land, what }. */
export function landformOf(g) {
    const [arain, asav, bw, bs, , dwarm, dcold, e] = g.kop, [farm, herd, gather] = g.life, trop = arain + asav;
    if (e >= 0.5) return { land: 'Tundra', what: 'tundra and ice' };
    if (g.wet >= 0.3) return trop >= 0.4 ? { land: 'Swamps', what: 'swamp' } : { land: 'Marshes', what: 'marsh and fen' };
    if (g.rug >= 0.55) return { land: 'Mountains', what: 'mountains' };
    if (g.alt >= 1200 && g.rug < 0.35) return { land: 'Plateau', what: bw + bs >= 0.5 ? 'a dry plateau' : 'a plateau' };
    if (g.rug >= 0.3) return g.alt >= 800 ? { land: 'Highlands', what: 'highlands' } : { land: 'Hills', what: 'hill country' };
    if (bw >= 0.5) return { land: 'Desert', what: 'desert' };
    if (bw + bs >= 0.5) return { land: 'Steppe', what: 'dry steppe' };
    if (arain >= 0.5) return { land: 'Jungle', what: 'rainforest' };
    if (asav >= 0.5) return { land: 'Savanna', what: 'savanna' };
    if (dcold >= 0.5) return { land: 'Taiga', what: 'boreal forest' };
    if (farm >= 0.5) return g.river >= 0.15 ? { land: 'Vale', what: 'river farmland' } : { land: 'Plains', what: 'farmland' };
    if (herd >= 0.4) return { land: 'Grasslands', what: 'pasture' };
    if (gather >= 0.5) return { land: 'Forest', what: dwarm >= 0.4 ? 'mixed forest' : 'woodland' };
    if (g.coast >= 0.5) return { land: 'Coast', what: 'coastland' };
    return g.alt < 300 ? { land: 'Lowlands', what: 'lowland' } : { land: 'Uplands', what: 'upland' };
}
/** How the people of a region would live, in a word: the way of life most of its land allows. */
export function livelihoodOf(g) {
    const [farm, herd, gather] = g.life, top = Math.max(farm, herd, gather);
    if (top < 0.15) return 'hardly peopled';
    return top === farm ? 'farmers' : top === herd ? 'herders' : 'gatherers and hunters';
}
