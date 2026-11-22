// The finish's fast mode (docs/fast-mode.md): parts of the finish swapped for quicker ones whose results differ in
// detail, not in kind — checked by v2/tools/finish-similar.mjs against the exact finish, not by hash. Off unless asked
// for: `?fast=1` (all parts) or `?fast=a,b` (a comma list of FAST_PARTS: only those) on the page, `--fast` on the tools.

/** The parts that have a fast version, and what each changes (docs/fast-mode-trials.md); finishPlanet asks
 *  `FP.has(name)` where a part is swapped. */
export const FAST_PARTS = {
    climate: "the climate's temperature ↔ winds ↔ ocean rounds kept from a coarser pass of the same moment (Add detail's ladder, or a Detail raised a step): ~2.5 s, from a pass at most 4× coarser",
};

// (the climate's coupled rounds last solved in this worker, for `climate`: one moment at a time — a ladder's first pass
// solves them, its finer passes keep them)
let kept = null;
/** What the rounds depend on: the world, the moment (its time and a checksum of its crust) and the climate's settings. */
export function roundsKey(frame, seed, climateOptions) {
    let h = 0;
    const a = frame.thickKm ?? [];
    for (let i = 0; i < a.length; i += 7) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
    return `${seed}|${frame.time}|${a.length}|${h}|${JSON.stringify(climateOptions)}`;
}
/** The rounds kept for `key` from a coarser finish than `cells`, within a Detail step (×4), or null: from 160K for 2.5M
 *  the 1° grid's view of the land differs too much (docs/fast-mode-trials.md). */
export const keptRounds = (key, cells) => (kept && kept.key === key && kept.cells < cells && kept.cells * 4 >= cells ? kept.coupled : null);
export function keepRounds(key, cells, coupled) { kept = { key, cells, coupled }; }

/** The parts a spec turns on: '1', 'all' or true → all; a comma list → those (unknown names refused); else none. */
export function fastParts(spec) {
    if (spec == null || spec === false || spec === '' || spec === '0') return new Set();
    if (spec instanceof Set) return spec;
    if (spec === true || spec === '1' || spec === 'all') return new Set(Object.keys(FAST_PARTS));
    const parts = String(spec).split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) if (!(p in FAST_PARTS)) throw new Error(`fast mode: no part "${p}" (${Object.keys(FAST_PARTS).join(', ')})`);
    return new Set(parts);
}

/** The page's choice: ?fast=… (remembered in this browser), ?fast=0 to forget it. A string for the finish's worker. */
export function pageFast() {
    const KEY = 'orogen.fast';
    const asked = new URLSearchParams(location.search).get('fast');
    try {
        if (asked === '0') localStorage.removeItem(KEY);
        else if (asked) { fastParts(asked); localStorage.setItem(KEY, asked); }
        return localStorage.getItem(KEY) ?? '';
    } catch (e) { return asked && asked !== '0' ? asked : ''; }
}
