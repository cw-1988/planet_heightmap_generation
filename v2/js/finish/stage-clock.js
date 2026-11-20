// How far along a finish is (finish.js finishPlanet, through finish-worker.js): the whole of it, and the stage under way.
// The worker says when each stage begins and how far the stage is, as it reports from inside (core/progress.js); between
// two reports, the time fills in. Each finish's laps
// (finish.js `ms`, per stage) are kept in this browser, per page and detail, and the next finish at that detail reads
// each stage's share off them — and a stage's own progress, until it reports, as its time so far against its time before. With none kept:
// the nearest detail's, scaled by the cells; with none at all, the stages' weights (finish.js STAGES), timed by this
// finish's pace so far. A stage's share stops at 99 % until the next one begins (it is a guess until then).
// Evolution's Add detail (evolution-main.js), Generate's and Import's build card (js/build-progress.js) read it.

import { STAGES } from './finish.js';

const KEY = 'orogen.finishLaps', TICK_MS = 250, KEEP = 12;

const readLaps = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };

/** The laps (stage → ms) kept nearest `cells` on page `page`, scaled to `cells` (a stage that did not run then: absent);
 *  null with none kept. */
function lapsFor(page, cells) {
    let best = null, gap = Infinity;
    for (const [k, ms] of Object.entries(readLaps())) {
        const [p, c] = k.split(':'), n = Number(c), d = Math.abs(Math.log(n / cells));
        if (p === page && d < gap) { gap = d; best = { n, ms }; }
    }
    if (!best) return null;
    const out = {};
    for (const [s] of STAGES) if (best.ms[s] !== undefined) out[s] = best.ms[s] * cells / best.n;
    return out;
}

/**
 * A finish's clock. `page`: whose laps (they differ: Generate draws its own surface); `cells`: its detail; `onTick`: called
 * while a stage runs, a few times a second, to show the guess moving. Tell it each stage as it begins (`begin`), the picture's own
 * progress (`progress`), and its laps when it is done (`done`); `stop` when the finish ends either way.
 */
export function stageClock({ page, cells, onTick = () => {} }) {
    // (a stage the laps never saw: no time in the whole, and no guess at its own share)
    const laps = lapsFor(page, cells), weight = new Map(STAGES.map(([s, w]) => [s, laps ? laps[s] ?? 0 : w]));
    const known = s => !laps || laps[s] !== undefined;
    const whole = [...weight.values()].reduce((s, v) => s + v, 0) || 1;
    let stage = 'starting', since = performance.now(), before = 0, own = null, timer = 0;
    const t0 = since;
    // (ms per unit of weight: 1 with laps kept; else this finish's pace over the stages done — none yet: no guess)
    const pace = () => (laps ? 1 : before > 0 ? (since - t0) / before : null);
    const c = {
        get stage() { return stage; },
        /** The stage under way's share of itself (0 … 0.99 until it is over), or null with nothing to go by. */
        get task() {
            if (own !== null) return own;
            const w = weight.get(stage), p = pace();
            if (w === undefined || p === null || !known(stage)) return null;
            return w > 0 && p > 0 ? Math.min(0.99, (performance.now() - since) / (w * p)) : 0.99;
        },
        /** The finish's share of itself (0 … 1). */
        get total() { return Math.min(1, (before + (weight.get(stage) ?? 0) * (c.task ?? 0)) / whole); },
        /** Stage `s` begins (finish.js STAGES' names). */
        begin(s) {
            const now = performance.now();
            before = 0;
            for (const [k] of STAGES) { if (k === s) break; before += weight.get(k); }
            stage = s; since = now; own = null;
            clearInterval(timer);
            timer = setInterval(onTick, TICK_MS);
            onTick();
        },
        /** The stage's own progress, where the worker reports it (the picture). */
        progress(p) { own = Math.max(0, Math.min(1, p)); onTick(); },
        /** The finish done: its laps kept for the next (the most recent KEEP details of every page). */
        done(ms) {
            c.stop();
            if (!ms) return;
            try {
                const all = readLaps(), k = `${page}:${cells}`;
                delete all[k]; all[k] = Object.fromEntries(Object.entries(ms).map(([s, v]) => [s, Math.round(v)]));
                const keys = Object.keys(all);
                for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete all[old];
                localStorage.setItem(KEY, JSON.stringify(all));
            } catch { /* (kept only where the browser allows) */ }
        },
        stop() { clearInterval(timer); timer = 0; },
    };
    return c;
}

/** "42 %", or '' for null. */
export const pctWords = f => (f === null || f === undefined || !(f === f) ? '' : `${Math.round(100 * Math.max(0, Math.min(1, f)))} %`);
