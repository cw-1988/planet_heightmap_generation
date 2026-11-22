// Every Detail stop (js/detail-stops.js) through the planet code and back (js/planet-code.js: above 2.56M a "." suffix),
// with and without toggles and Lakes. Run: node tuning/check-detail-code.mjs
import { DETAIL_STOPS } from '../js/detail-stops.js';
import { encodePlanetCode, decodePlanetCode } from '../js/planet-code.js';

let bad = 0;
for (const N of DETAIL_STOPS) for (const [toggles, lakes] of [[[], 0], [[3, 7], 0], [[], 0.5]]) {
    const code = encodePlanetCode(12345, N, 0.75, 20, 4, 0.2, 0.5, 0.3, 0, 0.5, 0.1, 0.35, 0.05, 0, 0, 0, 0.3, toggles, lakes);
    const back = decodePlanetCode(code);
    if (!back || back.N !== N || back.seed !== 12345 || back.toggledIndices.join() !== toggles.join() || back.lakes !== lakes) { bad++; console.log('FAIL', N, code, back); }
}
console.log(bad ? `${bad} failed` : `all ${DETAIL_STOPS.length * 3} round trips ok`);
process.exit(bad ? 1 : 0);
