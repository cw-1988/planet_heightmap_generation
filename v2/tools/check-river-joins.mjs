// Checks the rivers' shapes at the finest zoom (docs/world-map-detail.md, docs/river-shape-laws.md):
//   · joined: at every confluence the bent end of each tributary lies on the bent start of the trunk, for the page's line
//     (bendSegment) and the valley's (meanderAt) — river-meander.js pinAt — while the waves are still there mid-reach;
//   · by the laws (river-hydraulics.js): the channel as wide and deep as hydraulic geometry gives, the shortest bend 10.9
//     widths, and a river steeper than Leopold & Wolman's threshold without bends of its own.
//   · no corners: the main stem turns 90° at the confluence on its points, its drawn line no more than CORNER_DEG between
//     any two of its steps (river-valleys.js joinAt, river-meander.js curveAt).
// Two tributaries meet and run on to the sea. Usage: node v2/tools/check-river-joins.mjs

import { riverParts, pushSegments, LINE, carveValleys } from '../js/finish/river-valleys.js';
import { bendSegment, meanderAt } from '../js/finish/river-meander.js';
import { channelKm, channelDepthKm, braidSlope, meanderShare } from '../js/finish/river-hydraulics.js';

// (three reaches, [lon, lat]: A — the main stem — and B meet at (10, 20); C runs on from there to the sea, turning 90°
// off A's line on the planet's points, all gentle)
const CORNER_DEG = 15, KM_PX = 2 * Math.PI * 6371 / 2048;
const pts = (from, to, n) => Array.from({ length: n + 1 }, (_, k) => [from[0] + (to[0] - from[0]) * k / n, from[1] + (to[1] - from[1]) * k / n]);
const reaches = [pts([9, 21], [10, 20], 30), pts([9.2, 18.8], [10, 20], 30), pts([10, 20], [12, 22], 60)];
const tops = [[0.12, 0.1], [0.115, 0.1], [0.1, 0]], flows = [900, 800, 2000];
const R = { start: [], lat: [], lon: [], q: [], z: [] };
for (const [k, r] of reaches.entries()) {
    R.start.push(R.lat.length);
    for (const [j, [lon, lat]] of r.entries()) { R.lat.push(lat); R.lon.push(lon); R.q.push(flows[k]); R.z.push(tops[k][0] + (tops[k][1] - tops[k][0]) * j / (r.length - 1)); }
}
const starts = [...R.start, R.lat.length], fade = () => 1, pxKm = 0.05;
let worst = 0, fails = 0;
const fail = m => { fails++; console.log(m); };
const ends = [];
for (let k = 0; k < reaches.length; k++) {
    const g = [];
    for (const p of riverParts(R, starts[k], starts[k + 1], 1)) pushSegments(g, p);
    const n = g.length / LINE, first = [], last = [];
    bendSegment(g, 0, 0, 0, pxKm, fade, (x, y) => first.push(x, y), true);
    bendSegment(g, (n - 1) * LINE, 0, 1, pxKm, fade, (x, y) => last.splice(0, 2, x, y));
    const mo = [0, 0], o = (n - 1) * LINE;
    meanderAt(0, g[17], g[4], g[18], g[12], fade, mo); const v0 = Math.abs(mo[0]);
    meanderAt(g[o + 7], g[o + 17], g[o + 5], g[o + 19], g[o + 12], fade, mo); const v1 = Math.abs(mo[0]);
    // (and the waves still there between: a pin that flattened the whole river would pass the joins)
    meanderAt(g[o + 17] / 2, g[o + 17], g[o + 5], g[o + 19], g[o + 12], fade, mo);
    if (!(Math.abs(mo[0]) > 1e-3)) fail(`reach ${k}: no meander left mid-river`);
    if (v0 > 1e-9 || v1 > 1e-9) fail(`reach ${k}: valley meander at its ends ${v0}, ${v1} km`);
    if (!(g[18] >= 0 && g[18] < braidSlope(g[4]))) fail(`reach ${k}: its slope ${g[18]} not read as gentle`);
    ends.push({ first, last });
}
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
for (const [a, b] of [[ends[0].last, ends[2].first], [ends[1].last, ends[2].first]]) worst = Math.max(worst, gap(a, b));
if (worst > 1e-6) fail(`a confluence's drawn lines ${worst.toFixed(4)} px apart`);

// (the main stem A then C, drawn without meanders at a mid window and the finest: its sharpest turn between steps the
// pixels show, 2 px long or more — finer ones are drawn as pixels, not lines)
let corner = 0;
for (const px of [0.25, 0.05]) {
    const line = [];
    for (const k of [0, 2]) {
        const g = [];
        for (const p of riverParts(R, starts[k], starts[k + 1], 1)) pushSegments(g, p);
        for (let o = 0; o < g.length; o += LINE) bendSegment(g, o, 0, 1, px, () => 0, (x, y) => line.push([x, y]), !line.length);
    }
    for (let i = 1; i + 1 < line.length; i++) {
        const cl = Math.cos((0.5 - line[i][1] / 1024) * Math.PI), a = [(line[i][0] - line[i - 1][0]) * cl, line[i][1] - line[i - 1][1]], b = [(line[i + 1][0] - line[i][0]) * cl, line[i + 1][1] - line[i][1]];
        if (Math.min(Math.hypot(...a), Math.hypot(...b)) * KM_PX < 2 * px) continue;
        corner = Math.max(corner, Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * 180 / Math.PI);
    }
}
if (corner > CORNER_DEG) fail(`the main stem turns ${corner.toFixed(1)}° between two drawn steps (a corner)`);

// (no drawn segment across the map: a main stem crossing the date line at its last point — the confluence — then running
// on, and a tributary crossing mid-reach. One wrapped segment is a line ~2,048 px long, and drawRiversWindow's margin, half
// the longest segment, then draws every river into each tile: the zoomed view's lag)
{
    const lon = (a, b, n) => Array.from({ length: n + 1 }, (_, k) => [a + (b - a) * k / n, 10]);
    const W = { start: [], lat: [], lon: [], q: [], z: [] }, rs = [lon(179, 179.95, 19).concat([[-179.95, 10]]), lon(-179.95, -178, 30), lon(179.5, 180.4, 18).map(([x, y]) => [x > 180 ? x - 360 : x, 9.5]).concat([[-179.95, 10]])];
    rs[2][rs[2].length - 2][1] = 9.9;
    for (const [k, r] of rs.entries()) {
        W.start.push(W.lat.length);
        for (const [j, [x, y]] of r.entries()) { W.lat.push(y); W.lon.push(x); W.q.push([900, 2000, 500][k]); W.z.push(0.1 * (1 - j / r.length)); }
    }
    const ws = [...W.start, W.lat.length];
    let longest = 0;
    for (let k = 0; k < rs.length; k++) {
        const g = [];
        for (const p of riverParts(W, ws[k], ws[k + 1], 1)) pushSegments(g, p);
        for (let o = 0; o < g.length; o += LINE) longest = Math.max(longest, Math.hypot(g[o + 2] - g[o], g[o + 3] - g[o + 1]));
    }
    if (!(longest < 2)) fail(`a river crossing the map's edge drawn with a segment ${longest.toFixed(1)} px long`);
}

// (the laws: Moody & Troutman's 1,000 m³/s ~228 m wide, ~3.9 m deep; a bend's waves on a gentle river, none on a steep one)
const w = channelKm(1000), d = channelDepthKm(1000);
if (Math.abs(w - 0.228) > 0.002 || Math.abs(d - 0.0039) > 0.0003) fail(`channel of 1,000 m³/s ${(w * 1000).toFixed(0)} m wide, ${(d * 1000).toFixed(1)} m deep`);
// (a bend's waves show as the line's turning — its second difference over a tenth of a bend; the valley's long waves
// barely turn it. A steep river keeps those, loses its own: far less turning, the same reach still swinging)
const mo = [0, 0], h = 0.1 * 10.9 * channelKm(800), at = (s, S) => meanderAt(s, 100, 800, S, 7, () => 1, mo)[0];
let flat = 0, steep = 0, swing = 0;
for (let s = 20; s < 80; s += h) {
    flat += Math.abs(at(s - h, 1e-5) - 2 * at(s, 1e-5) + at(s + h, 1e-5));
    steep += Math.abs(at(s - h, 0.02) - 2 * at(s, 0.02) + at(s + h, 0.02)); swing = Math.max(swing, Math.abs(at(s, 0.02)));
}
if (!(flat > 0) || !(steep < 0.5 * flat) || !(swing > 0.1)) fail(`a bend's turning: ${flat.toFixed(3)} gentle, ${steep.toFixed(3)} steep (its swing ${swing.toFixed(2)} km)`);
if (!(meanderShare(800, 0) === 1 && meanderShare(800, 1) === 0)) fail('meanderShare not 1 when flat, 0 when steep');

// (a valley cut by carveValleys: the picture 1 km up, the river's own ground 0.5 km — the floor 0.5 km down plus the
// channel's depth, the wall at most the threshold hillslope, the land untouched past its reach. A fade holding nothing
// of 16 km keeps the line straight: the meanders stop at the first wave the pixels don't hold)
const zoom = 256, pk = 2 * Math.PI * 6371 / (2048 * zoom), ew = 200, eh = 200, row0 = 100, q = 800, N = ew * eh;
const line = Float64Array.from([10, 512 + 0.5 / zoom, 10.5, 512 + 0.5 / zoom, q, q, 0, 0.5 * zoom * pk, 0, 1, 0, 1, 3, 1, 1, -1e9, 1e9, 1e3, 1e-5, 1e-5, 0.5, 0.5]);
const D = new Float32Array(N), cut = { hb: new Float32Array(N).fill(1), seaB: new Uint8Array(N), W: 2048 * zoom, X0: 10 * zoom - 20, Y0: 512 * zoom - row0, ew, eh, pxKm: pk, cosLa: new Float32Array(eh).fill(1), fade: lam => (lam < 16 ? 1 : 0) };
carveValleys(D, line, cut);
const col = 84, at2 = j => D[j * ew + col], floor = -(0.5 + channelDepthKm(q)), rim = Math.ceil((channelKm(q) / 2 + 0.5 / 0.35) / pk) + 2;
let steepest = 0;
for (let j = row0 + Math.ceil(channelKm(q) / pk) + 1; j < row0 + rim; j++) steepest = Math.max(steepest, Math.abs(at2(j + 1) - at2(j)) / pk);
if (Math.abs(at2(row0) - floor) > 0.01) fail(`valley floor ${at2(row0).toFixed(3)} km, by the river's ground ${floor.toFixed(3)}`);
if (steepest > 0.7 * 1.1) fail(`valley wall ${steepest.toFixed(2)} steep, above the threshold hillslope 0.7`);
if (Math.abs(at2(row0 + rim)) > 1e-4 || Math.abs(at2(row0 - rim)) > 1e-4) fail(`land past the valley cut: ${at2(row0 + rim)}, ${at2(row0 - rim)} km`);
console.log(fails ? `FAIL (${fails})` : `PASS: confluences joined (gap ${worst.toExponential(1)} px), no corner (${corner.toFixed(1)}° a step at most); channel, bends, braiding and valley by the laws`);
process.exit(fails ? 1 : 0);
