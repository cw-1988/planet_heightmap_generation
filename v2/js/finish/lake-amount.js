// The pages' Lakes slider (owner, 2026-11-20: "maybe he actually wants a swamp world or one entirely without lakes"):
// −1 … 1, 0 the finish's own lakes (finish-config.js). It scales the rules that decide which hollows hold water, as
// overrides of the finish config (finish-worker.js `finish`):
//  · fewer (< 0): a hollow is a lake only from a bigger size, a lake must be bigger for its river to stay, outlets cut
//    deeper, rivers fill their lakes with more sediment; −1: no lakes at all (every hollow drained or filled; a closed
//    basin a salt pan);
//  · more (> 0): smaller and shallower hollows hold water, small lakes stay on big rivers, outlets cut shallower, little
//    sediment — at 1 a land of lakes and ponds (Finland, the Canadian Shield, the Pantanal's wet season).
// Each rule moves geometrically, ×(its range)^|x|, so the slider's middle is the finish as tuned.

import { FINISH } from './finish-config.js';

// [the value at −1 as a factor of today's, at +1]
const RANGE = {
    lakeMinKm2: [30, 1 / 6],        // 300 km² → 9 000 … 50
    lakeMinDepthM: [4, 1 / 3],      // 15 m → 60 … 5
    lakeKeepKm2: [10, 1 / 50],      // 5 000 km² → 50 000 … 100
    lakeHugeKm2: [10, 1 / 50],
    breachKm: [2, 1 / 4],           // an outlet's cut
    seaBreachKm: [1.5, 1 / 4],
    lakeSiltKm: [5, 1 / 10],        // a lake's sediment
};

/** The slider's readout: "None" at −1, else its value signed (±0 the finish as tuned). */
export const lakesLabel = (x) => (x <= -1 ? 'None' : x === 0 ? '±0' : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`);

/** The finish config's overrides for Lakes `x` (−1 … 1); {} at 0. */
export function lakeOverrides(x) {
    x = Math.max(-1, Math.min(1, Number(x) || 0));
    if (Math.abs(x) < 1e-6) return {};
    if (x <= -1 + 1e-6) return { lakeMinKm2: Infinity };
    const out = {};
    for (const [key, [less, more]] of Object.entries(RANGE)) out[key] = FINISH[key] * (x < 0 ? less : more) ** Math.abs(x);
    return out;
}
