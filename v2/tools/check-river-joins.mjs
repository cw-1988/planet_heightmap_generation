// Checks the rivers' shapes at the finest zoom (docs/world-map-detail.md, docs/river-shape-laws.md):
//   · joined: at every confluence the bent end of each tributary lies on the bent start of the trunk, for the page's line
//     (bendSegment) and the valley's (meanderAt) — river-meander.js pinAt — while the waves are still there mid-reach;
//   · by the laws (river-hydraulics.js): the channel as wide and deep as hydraulic geometry gives, the shortest bend 10.9
//     widths, and a river steeper than Leopold & Wolman's threshold without bends of its own.
// Two tributaries meet and run on to the sea. Usage: node v2/tools/check-river-joins.mjs

import { riverParts, pushSegments, LINE } from '../js/finish/river-valleys.js';
import { bendSegment, meanderAt } from '../js/finish/river-meander.js';
import { channelKm, channelDepthKm, braidSlope, meanderShare } from '../js/finish/river-hydraulics.js';

// (three reaches on a 2048-wide texture's degrees: A and B meet at (10, 20); C runs on from there to the sea, all gentle)
const pts = (from, to, n) => Array.from({ length: n + 1 }, (_, k) => [from[0] + (to[0] - from[0]) * k / n, from[1] + (to[1] - from[1]) * k / n]);
const reaches = [pts([9, 21], [10, 20], 30), pts([11.2, 21.3], [10, 20], 30), pts([10, 20], [12, 18], 60)];
const tops = [[0.12, 0.1], [0.115, 0.1], [0.1, 0]];
const R = { start: [], lat: [], lon: [], q: [], z: [] };
for (const [k, r] of reaches.entries()) {
    R.start.push(R.lat.length);
    for (const [j, [lon, lat]] of r.entries()) { R.lat.push(lat); R.lon.push(lon); R.q.push(k === 2 ? 2000 : 800); R.z.push(tops[k][0] + (tops[k][1] - tops[k][0]) * j / (r.length - 1)); }
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
console.log(fails ? `FAIL (${fails})` : `PASS: confluences joined (gap ${worst.toExponential(1)} px); channel, bends and braiding by the laws`);
process.exit(fails ? 1 : 0);
