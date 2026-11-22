// The finish's fast mode (docs/fast-mode.md): parts of the finish swapped for quicker ones whose results differ in
// detail, not in kind — checked by v2/tools/finish-similar.mjs against the exact finish, not by hash. Off unless asked
// for: `?fast=1` (all parts) or `?fast=a,b` (a comma list of FAST_PARTS: only those) on the page, `--fast` on the tools.

/** The parts that have a fast version, and what each changes: none yet — the ones tried changed the planet's kind for
 *  a few per cent of the time (docs/fast-mode-trials.md); finishPlanet asks `FP.has(name)` where a part is swapped. */
export const FAST_PARTS = {};

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
