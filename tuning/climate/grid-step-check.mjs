/**
 * The climate grid's step against real Earth: the closed loop (every stage new, as rain-check.mjs runs it) at each
 * step, scored against Beck's 0.1° Köppen map (exact and main-group agreement, by land cell), with its stages' times.
 * The finish's fast-mode trials (docs/fast-mode-trials.md) ask whether a coarser grid is a worse climate or just another.
 *
 *   node tuning/climate/grid-step-check.mjs                 steps 1 and 2
 *   node tuning/climate/grid-step-check.mjs --steps 1,1.5,2 --cells 640000
 *   node tuning/climate/grid-step-check.mjs --options '{"couplings":1,"couplingsWithOcean":1}'
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { compareClasses } from './lib/compare.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { computeClimate, cellLatLon } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { windDrivenOcean } from '../../v2/js/climate/ocean.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const STEPS = arg('--steps', '1,2').split(',').map(Number), N = Number(arg('--cells', 160000));
const EXTRA = JSON.parse(arg('--options', '{}'));

// (without the references — fetch-references.mjs downloads them — only the stages' times are printed)
let koppen01 = null;
try { ({ koppen01 } = loadReferences()); } catch (e) { console.log(`(no Köppen score: ${e.message})`); }
const { gray, width, height } = loadEarthGrayscale();
const earth = buildEarthMesh(gray, width, height, { N });
const nR = earth.mesh.numRegions, elevKm = new Float32Array(nR);
for (let r = 0; r < nR; r++) elevKm[r] = elevToHeightKm(earth.r_elevation[r]);
const lat = new Float32Array(nR), lon = new Float32Array(nR);
cellLatLon(earth.r_xyz, 'y-up', lat, lon);
const truth = new Uint8Array(nR);
if (koppen01) for (let r = 0; r < nR; r++) truth[r] = truthAt01(koppen01, lat[r], lon[r]);
const input = { xyz: earth.r_xyz, elevKm, axes: 'y-up' };

console.log(`Earth, ${nR} cells; options ${JSON.stringify(EXTRA)}`);
for (const step of STEPS) {
    const t0 = performance.now();
    const res = computeClimate(input, { ...EXTRA, gridStepDeg: step,
        stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() } });
    const ms = performance.now() - t0, cmp = koppen01 ? compareClasses(truth, res.cell.koppen) : null;
    const score = cmp ? `Köppen vs Beck ${(100 * cmp.exact).toFixed(1)} % exact, ${(100 * cmp.major).toFixed(1)} % main group · ` : '';
    console.log(`${step}°: ${score}${(ms / 1000).toFixed(2)} s`);
    console.log(`    ${res.timing.map(t => `${t.stage} ${(t.ms / 1000).toFixed(2)}`).join(' · ')}`);
}
