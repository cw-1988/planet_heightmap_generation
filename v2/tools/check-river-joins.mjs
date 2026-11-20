// Checks that rivers drawn with their meanders stay joined (river-meander.js pinAt): at every confluence and mouth the
// bent end of one reach lies on the bent start of the next, for the page's line (bendSegment) and the valley's
// (meanderAt). Two tributaries meet and run on to the sea. Usage: node v2/tools/check-river-joins.mjs

import { riverParts, pushSegments, LINE } from '../js/finish/river-valleys.js';
import { bendSegment, meanderAt } from '../js/finish/river-meander.js';

// (three reaches on a 2048-wide texture's degrees: A and B meet at (10, 20); C runs on from there)
const pts = (from, to, n) => Array.from({ length: n + 1 }, (_, k) => [from[0] + (to[0] - from[0]) * k / n, from[1] + (to[1] - from[1]) * k / n]);
const reaches = [pts([9, 21], [10, 20], 30), pts([11.2, 21.3], [10, 20], 30), pts([10, 20], [12, 18], 60)];
const R = { start: [], lat: [], lon: [], q: [] };
for (const [k, r] of reaches.entries()) {
    R.start.push(R.lat.length);
    for (const [lon, lat] of r) { R.lat.push(lat); R.lon.push(lon); R.q.push(k === 2 ? 2000 : 800); }
}
const starts = [...R.start, R.lat.length], fade = () => 1, pxKm = 0.05;
let worst = 0, fails = 0;
const ends = [];
for (let k = 0; k < reaches.length; k++) {
    const g = [];
    for (const p of riverParts(R, starts[k], starts[k + 1], 1)) pushSegments(g, p);
    const n = g.length / LINE, first = [], last = [];
    bendSegment(g, 0, 0, 0, pxKm, fade, (x, y) => first.push(x, y), true);
    bendSegment(g, (n - 1) * LINE, 0, 1, pxKm, fade, (x, y) => last.splice(0, 2, x, y));
    const mo = [0, 0], o = (n - 1) * LINE;
    meanderAt(0, g[17], g[4], g[12], fade, mo); const v0 = Math.abs(mo[0]);
    meanderAt(g[o + 7], g[o + 17], g[o + 5], g[o + 12], fade, mo); const v1 = Math.abs(mo[0]);
    // (and the waves still there between: a pin that flattened the whole river would pass the joins)
    meanderAt(g[o + 17] / 2, g[o + 17], g[o + 5], g[o + 12], fade, mo);
    if (!(Math.abs(mo[0]) > 1e-3)) { fails++; console.log(`reach ${k}: no meander left mid-river`); }
    if (v0 > 1e-9 || v1 > 1e-9) { fails++; console.log(`reach ${k}: valley meander at its ends ${v0}, ${v1} km`); }
    ends.push({ first, last });
}
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
for (const [a, b] of [[ends[0].last, ends[2].first], [ends[1].last, ends[2].first]]) worst = Math.max(worst, gap(a, b));
if (worst > 1e-6) { fails++; console.log(`a confluence's drawn lines ${worst.toFixed(4)} px apart`); }
console.log(fails ? `FAIL (${fails})` : `PASS: confluences joined (gap ${worst.toExponential(1)} px)`);
process.exit(fails ? 1 : 0);
