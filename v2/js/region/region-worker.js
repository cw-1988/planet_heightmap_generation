// A region's worker (fork addition): builds a region from the planet's crop (region-frame.js cropPlanet) — the ground
// (region-relief.js), then the sea, the erosion's rounds, the drainage, lakes and the water each cell carries
// (region-wear.js); with `synth`, the planet's generator drawn again at the region's detail first (region-synth.js).
// In: { frame, crop, seed, synth, rounds }. Out: { stage, f } as it goes, then { done: region } with its arrays.

import { relief, carveRivers } from './region-relief.js';
import { wearDown, regionBuffers } from './region-wear.js';
import { generatorDetail } from './region-synth.js';
import { R } from './region-frame.js';

self.onmessage = ({ data }) => {
    const { frame: F, crop, seed, synth = null, rounds = 16 } = data;
    const t0 = performance.now(), say = (stage, f = 0) => self.postMessage({ stage, f });
    say('Drawing the planet again at this detail');
    const gen = synth ? generatorDetail(F, synth.job, synth.planetEdgeKm, (f) => say('Drawing the planet again at this detail', f)) : null;
    const tGen = performance.now() - t0;
    say('Shaping the ground');
    const g = relief(F, crop, seed, (f) => say('Shaping the ground', f), gen);
    const inflow = carveRivers(F, crop.rivers, g, 2 * Math.PI * R / crop.height.W, seed);
    const w = wearDown(g, F, inflow, rounds, (f) => say('Carving the valleys', f));
    const region = { frame: F, h: g.h, ...w, T: g.T, P: g.P, rgb: g.rgb, inflow, waves: g.waves, seed, ms: Math.round(performance.now() - t0), msGen: Math.round(tGen) };
    self.postMessage({ done: region }, regionBuffers(region));
};
