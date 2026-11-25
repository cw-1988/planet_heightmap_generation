// The states' worker (fork addition): works the states out off the page (states-view.js's statesBuild and statesOf
// start it and end it). What it is sent, in order:
// - { frame, specs }: the finished moment's parts the build reads, each big array left as { big: i }, with its type and
//   length in specs[i] (made here, then filled);
// - { i, at, part }: a slice of big array i, from index `at`;
// - { run: { farm, states, key }, given? }: the page's options, and (given) the grid and the metrics a build before
//   worked out, when only the states' own options changed.
// It posts { step: [words, share] } as it goes, then { out, apart, M, G } (M and G: the metrics and City size's grid,
// for the page to keep; null when given), or { error }.
import { farmOptions } from './farming-view.js';
import { statesOptions, statesWork, dressFin } from './states-view.js';

let frame = null, arrays = [];
self.onmessage = ({ data: m }) => {
    try {
        if (m.frame) { frame = m.frame; arrays = m.specs.map(([type, n]) => new self[type](n)); return; }
        if (m.part) { arrays[m.i].set(m.part, m.at); return; }
        if (!m.run) return;
        Object.assign(farmOptions, m.run.farm);
        Object.assign(statesOptions, m.run.states);
        const fin = m.given ? { raster: { farming: {} }, climate: { raster: {} } } : dressFin(frame, arrays);
        frame = null; arrays = [];
        const r = statesWork(fin, m.given, (words, share) => self.postMessage({ step: [words, share] }));
        self.postMessage(r, buffersOf(r));
    } catch (err) {
        self.postMessage({ error: String(err?.stack || err) });
    }
};
/** Every ArrayBuffer under `v`, once each: handed over rather than copied. */
function buffersOf(v) {
    const seen = new Set(), out = new Set(), walk = (x) => {
        if (!x || typeof x !== 'object' || seen.has(x)) return;
        seen.add(x);
        if (ArrayBuffer.isView(x)) { if (x.buffer instanceof ArrayBuffer) out.add(x.buffer); return; }
        if (x instanceof ArrayBuffer) { out.add(x); return; }
        const each = x instanceof Map ? [...x.keys(), ...x.values()] : x instanceof Set ? [...x] : Object.values(x);
        for (const y of each) walk(y);
    };
    walk(v);
    return [...out];
}
