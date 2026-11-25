// The small lakes drawn (docs/small-lakes.md), from the shares small-lakes.js gives the land: octave by octave of a 3D
// lattice, at most one lake a cell, elongated and wandering, the biggest holding the most area. Each lake is water in a
// basin, not a colour over the ground: one flat level, the lowest ground just past its shore (where it would spill), and
// a bowl carved under it, deeper the bigger the lake, its banks eased down to the water — and only where the ground
// holds one (level round its shore, not a top, nothing falling away past its bank). The world's picture draws the
// lakes a few of its pixels across (pondRaster), a zoomed window the smaller ones too (pondsInWindow); a lake is the
// same lake, at the same level, at every zoom.

import { hash3 } from './lattice-noise.js';
import { SMALL_LAKES } from './small-lakes.js';
import { lakeHere } from '../evolution/lake-water.js';
import { lowPass } from './low-pass.js';

const R = 6371, TAU = 2 * Math.PI, FRESH = 1;                         // (FRESH: finish-hydro.js Water.FRESH)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// (the least reach past its shore, in lake radii, over which a zoomed window's fine detail eases back in; the detail's
// broad swells, blurred over LOW_KM (at most a quarter of the window's margin, so tiles agree), a lake sits in whole:
// pondsInWindow)
const DIP_FADE = 1.5, LOW_KM = 0.5;

// (a lake's shore: an ellipse of its disc's area, long by 1 + stretch along an axis of its own, over the ground warped by
// six smooth waves — two at each of three sizes, each its own way and push: bays and points that bulge sideways, round at
// their heads. A shore in waves round the middle, r(θ), made each bay a V narrowing toward the lake's middle — a dip is
// the same angle wide all the way in (the owner, 2026-11-20: "lakes still have weird knicked shapes"; three strong ones
// drew a flower before: "weird kinks"). WARP: wavenumber per lake radius, push in lake radii; the pushes' slopes sum
// under 1, so the warp folds nothing: one lake, no holes. Its reach; the ellipse keeps the disc's area: SQ 1)
const WARP = [[2, 0.1], [3.5, 0.045], [6, 0.02]], PUSH = 2 * WARP.reduce((a, [, p]) => a + p, 0);
const REACH = 1 + SMALL_LAKES.stretch + PUSH, SQ = 1;
// (a lake's mean volume in its lattice's cells: its ball, radius rho × 0.6–1.4 — cut by the sphere, a ball's share of
// the volume is its disc's share of the surface (Delesse), the shore scaling each disc's area by SQ)
const VOL = (4 / 3) * Math.PI * SMALL_LAKES.rho ** 3 * (1.4 ** 4 - 0.6 ** 4) / 3.2 * SQ;
// (each octave's part of the share, the biggest the most: 4^(2 − tau) less a halving; summed as far as each octave)
const CUM = (() => {
    const g = 4 ** (2 - SMALL_LAKES.tau), w = Array.from({ length: SMALL_LAKES.octaves }, (_, k) => g ** k), sum = w.reduce((a, b) => a + b, 0);
    let c = 0;
    return w.map(v => (c += v / sum));
})();
// (the farthest a lake's bank reaches from its centre, km: the top octave's biggest lake, out to its rim)
const BANK_KM = SMALL_LAKES.rho * 1.4 * REACH * SMALL_LAKES.rim * SMALL_LAKES.topKm;

/** A lake's chance in octave k at this share: its part of it, and what the bigger octaves could not hold (capped at one a
 *  cell) carried down. Lakes overlap, so the share asked of them is −ln(1 − share), what covers `share` of the ground
 *  when they fall at random. */
function chance(share, k) {
    share = -Math.log(1 - Math.min(0.9, share));
    let used = 0, p = 0;
    for (let j = 0; j <= k; j++) { p = Math.min(1, Math.max(0, share * CUM[j] - used) / VOL); used += p * VOL; }
    return p;
}

/** How far out of its lake's middle the place (a, b: in lake radii, in its tangent plane) lies — 1 on its shore: the
 *  place warped by its waves (ph seeds their ways, a golden angle apart), then read on its ellipse (e its stretch along
 *  al). */
function reachOf(a, b, e, al, ph) {
    let x = a, y = b;
    for (let k = 0; k < 6; k++) {
        const [f, p] = WARP[k >> 1], t = ph + 2.39996 * (k + 1), s = p * Math.sin(f * (a * Math.cos(t) + b * Math.sin(t)) + 3 * t);
        x += s * Math.cos(1.7 * t); y += s * Math.sin(1.7 * t);
    }
    const c = Math.cos(al), n = Math.sin(al);
    return Math.hypot((x * c + y * n) / (1 + e), (y * c - x * n) * (1 + e));
}

/** The shore's radius (lake radii) along the way th out of its middle: where reachOf first passes 1. */
function shoreAt(th, e, al, ph) {
    const c = Math.cos(th), n = Math.sin(th);
    let lo = 0, hi = REACH;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (reachOf(m * c, m * n, e, al, ph) < 1) lo = m; else hi = m; }
    return lo;
}

/**
 * A grid of the picture's small-lake shares and heights read at places on the sphere (x, y, z, km): its whole (w × h,
 * rows north → south, columns from −180° east) or a crop of it (fw × fh the whole, x0, y0 where it starts) —
 * { share (0 … 1, the pixel's), height (m, bilinear), near (whether any share lies within a lake's bank), pxKm (the
 * picture's pixel), lakes (each lake met, by its lattice cell: its level and depth, or false) }.
 */
export function pondReader({ w, h, share, heightM, fw, fh, x0 = 0, y0 = 0 }) {
    const FW = fw ?? w, FH = fh ?? h, unit = SMALL_LAKES.unit, pxKm = TAU * R / FW;
    const gxOf = lon => Math.min(FW - 1, Math.floor((lon / TAU + 0.5) * FW)), gyOf = lat => Math.min(FH - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * FH)));
    const col = gx => Math.min(w - 1, ((gx - x0) % FW + FW) % FW), row = gy => Math.min(h - 1, Math.max(0, gy - y0));
    const lonLat = (x, y, z, o) => { o[0] = Math.atan2(y, x); o[1] = Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))); return o; };
    const ll = [0, 0], near = nearMask(share, w, h, FW, FH, y0, pxKm);
    return {
        pxKm, lakes: new Map(),
        share: (x, y, z) => { lonLat(x, y, z, ll); return (share[row(gyOf(ll[1])) * w + col(gxOf(ll[0]))] & 127) / unit; },
        near: (x, y, z) => { lonLat(x, y, z, ll); return near[row(gyOf(ll[1])) * w + col(gxOf(ll[0]))] === 1; },
        height: (x, y, z) => {
            lonLat(x, y, z, ll);
            const u = (ll[0] / TAU + 0.5) * FW - 0.5, v = (0.5 - ll[1] / Math.PI) * FH - 0.5, gx = Math.floor(u), gy = Math.floor(v), fx = u - gx, fy = v - gy;
            const a = col(gx), b = col(gx + 1), r0 = row(gy) * w, r1 = row(gy + 1) * w;
            return (1 - fy) * ((1 - fx) * heightM[r0 + a] + fx * heightM[r0 + b]) + fy * ((1 - fx) * heightM[r1 + a] + fx * heightM[r1 + b]);
        },
    };
}

/** Which pixels have a share above none within a lake's bank (BANK_KM): a running count down the columns, then along
 *  each row by its own reach in pixels (wider toward the poles; round the planet where the grid is its whole width). */
function nearMask(share, w, h, FW, FH, y0, pxKm) {
    const ry = Math.ceil(BANK_KM / pxKm) + 1, col = new Uint8Array(w * h), out = new Uint8Array(w * h), pre = new Int32Array(2 * w + 1);
    for (let x = 0; x < w; x++) {
        let n = 0;
        for (let y = 0; y < Math.min(h, ry); y++) if (share[y * w + x] & 127) n++;
        for (let y = 0; y < h; y++) {
            if (y + ry < h && share[(y + ry) * w + x] & 127) n++;
            if (n > 0) col[y * w + x] = 1;
            if (y - ry >= 0 && share[(y - ry) * w + x] & 127) n--;
        }
    }
    const whole = w >= FW;
    for (let y = 0; y < h; y++) {
        const lat = (0.5 - (y0 + y + 0.5) / FH) * Math.PI, rx = Math.ceil(ry / Math.max(0.02, Math.cos(lat)));
        // (prefix sums over the row twice over, so a reach round the planet's seam reads straight on)
        for (let x = 0; x < 2 * w; x++) pre[x + 1] = pre[x] + col[y * w + (x % w)];
        for (let x = 0; x < w; x++) {
            let n;
            if (whole) n = 2 * rx + 1 >= w ? pre[w] : pre[x + w + rx + 1] - pre[x + w - rx];
            else n = pre[Math.min(w, x + rx + 1)] - pre[Math.max(0, x - rx)];
            if (n > 0) out[y * w + x] = 1;
        }
    }
    return out;
}

/** The lake of lattice cell (ix, iy, iz) of octave k, once per lake (P.lakes): whether it is there (its centre's share
 *  and its chance), and if so its level (m: the lowest of the picture's ground round it, a pixel and a half past its
 *  shore — where it would spill) and its deepest (m). False: no lake, or one at the sea's level. */
function lakeOf(P, key, k, s, F, rd, e, al, ph, pick) {
    let L = P.lakes.get(key);
    if (L !== undefined) return L;
    L = false;
    const share = P.share(F.f[0] * s, F.f[1] * s, F.f[2] * s);
    if (share > 0 && pick < chance(share, k)) {
        const S = SMALL_LAKES, pad = 1.5 * P.pxKm / s, diamKm = 2 * rd * s, { f, e1, e2 } = F;
        const at = (th, rho) => {
            const a = rho * Math.cos(th), b = rho * Math.sin(th);
            return P.height((f[0] + a * e1[0] + b * e2[0]) * s, (f[1] + a * e1[1] + b * e2[1]) * s, (f[2] + a * e1[2] + b * e2[2]) * s);
        };
        // (where it would spill: the lowest ground a pixel and a half past its shore; and whether the ground holds water —
        // its shore's ground level within holdM, its middle no higher than its shore's mean (a hollow or a flat, not a
        // top), and nothing past its bank falling away below its level: a lake on a slope or a summit is none)
        let lev = Infinity, hi = -Infinity, sum = 0, out = Infinity;
        const r1s = new Float64Array(16);
        for (let j = 0; j < 16; j++) {
            const th = j * TAU / 16, r1 = r1s[j] = rd * shoreAt(th, e, al, ph), g = at(th, r1 + pad);
            lev = Math.min(lev, g); hi = Math.max(hi, g); sum += g;
        }
        // (its bank as wide as its drop needs at bankSlope: the shore's highest ground eased down to the level, in lake radii)
        const bank = Math.min(S.rim, 1 + Math.max(0.5, (hi - lev) / (S.bankSlope * 1000 * rd * s)));
        for (let j = 0; j < 16; j++) out = Math.min(out, at(j * TAU / 16, 2 * bank * r1s[j] + pad));
        const tol = S.holdM[0] + S.holdM[1] * diamKm;
        if (lev > S.lipM + 1 && hi - lev <= tol && at(0, 0) <= sum / 16 + tol / 3 && out >= lev - tol)
            L = { level: lev, depth: Math.min(S.depthM[2], S.depthM[0] + S.depthM[1] * diamKm), bank };
    }
    P.lakes.set(key, L);
    return L;
}

/**
 * The small lake at the place (x, y, z: km from the planet's centre), of the lakes at least minKm across (a smaller one is
 * a speck: skipped): how far out of its centre, its shore at 1 and its bank out to its own width (≤ SMALL_LAKES.rim) — the nearest lake's
 * (the least), its level and depth into hit; Infinity if none. A lake's centre lies in the middle half of its lattice cell
 * and reaches less than ¾ of a cell, so the 2 × 2 × 2 cells nearest the place hold every lake that can touch it; lakes
 * cross the cells' faces and run into each other.
 */
export function pondAt(x, y, z, minKm, seed, P, hit, g = NaN) {
    const S = SMALL_LAKES, lim = S.rho * 1.4 * REACH * S.rim;
    hit.cut = g; hit.qMin = Infinity;
    // (the lakes of each block of cells, read once per reader: every place in a block meets the same few — reading all 8
    // cells of each octave at every place cost a level-14 tile up to a second, 2026-11-22)
    if (P.cMin !== minKm || P.cSeed !== seed) { P.cMin = minKm; P.cSeed = seed; P.cells = new Map(); P.blocks = new Map(); P.lastKey = []; P.lastList = []; }
    // (the lake chosen: under water the one whose bed lies lowest there — overlapping lakes merge without a crease — else
    // the nearest bank)
    let best = Infinity, bed = Infinity;
    for (let k = 0; k < S.octaves; k++) {
        const s = S.topKm / 2 ** k;
        if (2 * S.rho * 1.4 * s < minKm) break;
        const fx = x / s, fy = y / s, fz = z / s, bx = Math.floor(fx - 0.5), by = Math.floor(fy - 0.5), bz = Math.floor(fz - 0.5);
        for (const c of blockLakes(P, k, s, bx, by, bz, minKm, (seed | 0) * 31 + k * 977 + 0x5a1)) {
            const dx = fx - c.cx, dy = fy - c.cy;
            if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
            const dz = fz - c.cz, d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > lim * lim || d2 > c.rMax2) continue;
            const tx = fx - c.f[0], ty = fy - c.f[1], tz = fz - c.f[2];
            if (tx * tx + ty * ty + tz * tz > c.bank2) continue;
            const { e1, e2, rd, L } = c, u = tx * e1[0] + ty * e1[1] + tz * e1[2], v = tx * e2[0] + ty * e2[1] + tz * e2[2];
            const q = reachOf(u / rd, v / rd, c.e, c.al, c.ph);
            if (q >= c.L.bank) continue;
            // (the ground: the lowest of every lake's basin here — one lake chosen, the ground jumped where the choice
            // switched, a seam down the bank between two lakes run together: the owner, 2026-11-22, docs/small-lakes.md)
            if (g === g) { const b = basin(q, g, L.level, L.depth, 0.5, L.bank); if (b < hit.cut) hit.cut = b; if (q < hit.qMin) hit.qMin = q; }
            if (bed === Infinity ? q >= best : q >= 1) continue;
            if (q < 1) {
                const b = L.level - Math.max(0.5, L.depth * bowl(q));
                if (b >= bed) continue;
                bed = b;
            }
            best = q; hit.level = L.level; hit.depth = L.depth; hit.rKm = rd * s; hit.bank = L.bank;
        }
    }
    return best;
}

/** The lakes of the 2 × 2 × 2 cells from (bx, by, bz) in octave k that are drawn (cellLake), in the cells' order. */
function blockLakes(P, k, s, bx, by, bz, minKm, sd) {
    const key = (((k * 16384 + bx + 8192) * 16384 + by + 8192) * 16384) + bz + 8192;
    // (the octave's last block first: the window's next pixel nearly always lies in it)
    if (P.lastKey[k] === key) return P.lastList[k];
    let list = P.blocks.get(key);
    if (!list) list = blockOf(P, k, s, bx, by, bz, key, minKm, sd);
    P.lastKey[k] = key; P.lastList[k] = list;
    return list;
}
function blockOf(P, k, s, bx, by, bz, key, minKm, sd) {
    const list = [];
    for (let n = 0; n < 8; n++) {
        const ix = bx + (n & 1), iy = by + (n >> 1 & 1), iz = bz + (n >> 2), ck = (((k * 16384 + ix + 8192) * 16384 + iy + 8192) * 16384) + iz + 8192;
        let c = P.cells.get(ck);
        if (c === undefined) P.cells.set(ck, c = cellLake(P, k, s, ix, iy, iz, ck, minKm, sd));
        if (c) list.push(c);
    }
    P.blocks.set(key, list);
    return list;
}

/** Lattice cell (ix, iy, iz)'s lake in octave k, if one is drawn there (minKm across or more, and lakeOf finds it), with
 *  what a place needs to measure itself against it; else null. */
function cellLake(P, k, s, ix, iy, iz, key, minKm, sd) {
    const S = SMALL_LAKES;
    const h1 = hash3(ix, iy, iz, sd + 1), cx = ix + 0.25 + 0.5 * (h1 & 0xffff) / 65536, cy = iy + 0.25 + 0.5 * (h1 >>> 16) / 65536;
    const h2 = hash3(ix, iy, iz, sd + 2), cz = iz + 0.25 + 0.5 * (h2 & 0xffff) / 65536;
    const h0 = hash3(ix, iy, iz, sd), rr = S.rho * (0.6 + 0.8 * (h0 & 0xffff) / 65536), rMax = rr * REACH * S.rim;
    // (the ball's disc on the surface: cut near its edge, a big ball leaves a speck — its size is what is drawn)
    const hc = Math.hypot(cx, cy, cz) - R / s, rd2 = rr * rr - hc * hc;
    if (rd2 <= 0 || 4 * rd2 * s * s < minKm * minKm) return null;
    // (the lake is the ball's disc on the surface: centred on the ball's foot f, radius rd, measured in the plane
    // tangent there (e1, e2) — so its middle is its deepest and its shore never pinches through it; the shore long
    // along an axis of its own, wandering in three waves of its own phase)
    const cl = Math.hypot(cx, cy, cz), nx = cx / cl, ny = cy / cl, nz = cz / cl, fl = R / s, rd = Math.sqrt(rd2);
    // (e1 east-ish: n × the pole, or n × x near the poles; e2 = n × e1)
    let ax = Math.abs(nz) < 0.9 ? ny : 0, ay = Math.abs(nz) < 0.9 ? -nx : nz, az = Math.abs(nz) < 0.9 ? 0 : -ny;
    const al1 = Math.hypot(ax, ay, az); ax /= al1; ay /= al1; az /= al1;
    const h3 = hash3(ix, iy, iz, sd + 3), ph = (h0 >>> 16) / 65536 * TAU;
    const e = S.stretch * (h3 & 0xffff) / 65536, al = (h3 >>> 16) / 65536 * Math.PI;
    const F = { f: [nx * fl, ny * fl, nz * fl], e1: [ax, ay, az], e2: [ny * az - nz * ay, nz * ax - nx * az, nx * ay - ny * ax] };
    const L = lakeOf(P, key, k, s, F, rd, e, al, ph, (h2 >>> 16) / 65536);
    return L ? { cx, cy, cz, rMax2: rMax * rMax, bank2: (rd * REACH * S.rim) ** 2, rd, e, al, ph, L, ...F } : null;
}

/** A lake's bowl, its share of its depth at q (0 its middle, 1 its shore): (1 − q²)², level at the shore. (The bowl
 *  1 − q² was steepest at the shore, where the water is clear: a crater's rim round every small lake. (1 − q²)³, flat out
 *  to the shore, with a shorter clear ramp (shore-ramp.js pondRamp 0.5), lost the sunken look: each pond a droplet sat on
 *  the ground — the owner, 2026-11-22: "the sunkenness was fine", docs/small-lakes.md.) */
const bowl = q => { const u = 1 - q * q; return u * u; };

/** The ground (m) at q of a lake (level, depth: m) — a bowl under its water, from a hair under the level at its shore
 *  (SHORE_M, so the shore's pixels still pass lakeHere) down to `depth` in its middle, the bank easing from the level at
 *  the shore back to the ground `g` across its bank; never below `floor`. One surface across the shore, flat at it: the
 *  bowl began half a metre under the level and the bank ended lipM over it, a 1.5 m step that the hillshade drew as a
 *  dark line round every small lake (the owner, 2026-11-22: "this weird paste in edge", docs/small-lakes.md). The bank
 *  only ever lowers the ground: raised to a lip it stood a dam round every lake on flat land (the owner, 2026-11-20: "why
 *  the f are you building dams?"); it ends at `bank` (lake radii, lakeOf: as wide as its drop needs). */
const SHORE_M = 0.05;
export function basin(q, g, level, depth, floor, bank = 1.5) {
    if (q < 1) return Math.max(floor, Math.min(g, level - SHORE_M - (depth - SHORE_M) * bowl(q)));
    return Math.min(g, g + (level - g) * (1 - smooth(1, bank, q)));
}

/**
 * The world's picture's small lakes (finish.js finishRaster): on land that is neither sea nor lake, the lakes
 * worldPixels across or more — water FRESH at the lake's level, the ground carved into its bowl (its bank left to the
 * windows: a picture pixel is wider than it); `share` (the picture's share bytes) marks them (+128). Every lake's level
 * is read before any is carved. Returns { at (Int32Array: the carved pixels), h0 (their heights before) } — the windows
 * carve their own lakes into the ground as it was (fine-detail.js cropSource): enlarged with the picture's carve in it,
 * its step rang through the Catmull–Rom, a dark line down a lake's shore (the owner, 2026-11-22, docs/small-lakes.md).
 */
export function pondRaster({ w, h, heightM, sea, water, waterLevel, share }, seed) {
    const S = SMALL_LAKES, minKm = S.worldPixels * TAU * R / w, P = pondReader({ w, h, share, heightM }), hit = { level: 0, depth: 0 };
    const at = [], q = [], lev = [], dep = [];
    for (let py = 0; py < h; py++) {
        const lat = (0.5 - (py + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let px = 0; px < w; px++) {
            const i = py * w + px;
            if (sea[i] || water[i]) continue;
            const lon = ((px + 0.5) / w - 0.5) * TAU, x = R * cl * Math.cos(lon), y = R * cl * Math.sin(lon), z = R * sl;
            if (!P.near(x, y, z)) continue;
            const d = pondAt(x, y, z, minKm, seed, P, hit);
            if (d < 1) { at.push(i); q.push(d); lev.push(hit.level); dep.push(hit.depth); }
        }
    }
    const h0 = new heightM.constructor(at.length);
    for (let n = 0; n < at.length; n++) {
        const i = at[n];
        const L = Math.min(32000, Math.round(lev[n]));
        water[i] = FRESH; waterLevel[i] = L; share[i] |= 128; h0[n] = heightM[i];
        heightM[i] = Math.min(L - 1, Math.round(basin(q[n], heightM[i], lev[n], dep[n], 0.5)));
    }
    return { at: Int32Array.from(at), h0 };
}

/**
 * A zoomed window's small lakes (fine-detail.js), its own octaves: on its land that is neither sea nor lake, each lake
 * at its level (levB, km) over its carved bowl, its bank eased down to it — into the detail D (km) if there is one, else
 * into the enlarged picture hb. pond: pondReader of the picture's crop. pondKm (optional): each lake pixel's lake radius
 * (km), for its shore ramp (shore-ramp.js pondRamp). M: the window's margin (px).
 */
export function pondsInWindow({ ew, eh, cosLa, sinLa, cosLo, sinLo, pxKm, seaB, watB, levB, shB, hb, D, pond, seed, pondKm = null, M = 8 }) {
    const S = SMALL_LAKES, minKm = S.pixels * pxKm, hit = { level: 0, depth: 0, rKm: 0, bank: 1.5 };
    if (minKm > 2 * S.rho * 1.4 * S.topKm) return;
    const low = D ? lowPass(D, ew, eh, Math.max(1, Math.min(M >> 2, Math.ceil(LOW_KM / pxKm)))) : null;
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i;
        // (a mesh lake's pixel only where it passes the lake test: "a lake pixel is near" stopped these on the square grid)
        if (seaB[p] || watB[p] && (!shB || lakeHere(levB[p], hb[p] + (D ? D[p] : 0), shB[p]))) continue;
        const x = R * cosLa[j] * cosLo[i], y = R * cosLa[j] * sinLo[i], z = R * sinLa[j];
        if (!pond.near(x, y, z)) continue;
        const q = pondAt(x, y, z, minKm, seed, pond, hit, 1000 * hb[p]);
        if (!(hit.qMin < S.rim)) continue;
        // (the basin is carved into the enlarged picture's smooth ground, lifted or sunk whole by the detail's broad swells
        // (`low`), its level too; the detail's fine relief fades in across the bank, none at the shore or under the water.
        // Ridden in full to the shore, the relief stood walls and dry ground under the level beside the water (the owner,
        // 2026-11-22: "fix the seam with a proper transition"); faded to nothing at the shore, the swells metres either
        // way of the picture's level left each pond in a moat or a crater ("one is inset too deep the other is too much
        // on top", docs/small-lakes.md). So the ground meets the water at the shore all round)
        const d = D ? D[p] : 0, g = hb[p] + d, lo = low ? low[p] : 0;
        const t = hit.cut / 1000 + lo + (d - lo) * smooth(1, Math.max(DIP_FADE, hit.bank), hit.qMin);
        if (D) D[p] += t - g; else hb[p] = t;
        if (q < 1) { watB[p] = FRESH; levB[p] = hit.level / 1000 + lo; shB[p] = 1; if (pondKm) pondKm[p] = hit.rKm; }
    }
}
