// Every Detail slider's stops and this machine's finest one (docs/detail-stops.md): Generate's and Import's Detail,
// Evolution's Add detail and its history's Terrain detail. The stops run 5,000 to 10M cells, each about 1.5× the one
// before (×2000^(1/19), rounded to two figures, the planet code's 1000s); a page's slider ends at the finest stop whose
// modelled peak memory fits this machine, lowered further where a build at a stop once closed the tab.

/** The stops, in cells. */
export const DETAIL_STOPS = [5e3, 8e3, 11e3, 17e3, 25e3, 37e3, 55e3, 82e3, 120e3, 180e3, 270e3, 410e3, 610e3, 910e3, 1.4e6, 2e6, 3e6, 4.5e6, 6.7e6, 10e6];
/** The stop nearest `n` cells (by ratio): a planet code's or a saved history's Detail on the slider. */
export const nearestStop = n => DETAIL_STOPS.reduce((best, c, i) => (Math.abs(Math.log(c / n)) < Math.abs(Math.log(DETAIL_STOPS[best] / n)) ? i : best), 0);

const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** Each page's peak memory in GB at `n` cells, the page's own included (measured: docs/detail-stops.md). */
const PEAK_GB = {
    generate: n => 1.5 + 0.9 * n / 1e6,
    import: n => 1.5 + 0.9 * n / 1e6,   // (Import builds through the same worker and finish as Generate)
    evolution: n => 3.1 + 0.33 * n / 1e6,
};
/** A phone's or tablet's finest, whatever it reports: its browser closes a tab at well under 2 GB, every worker counted,
 *  and the pages there run lighter (fewer workers, smaller pictures) than the desktop's models above. */
const TOUCH_CELLS = { generate: 610e3, import: 610e3, evolution: 610e3 };
/** The memory a page may take, in GB: half the machine's (navigator.deviceMemory), as docs/finish-ceiling.md's "safe".
 *  A browser reports 8 at most where it hides more (Chrome's old cap): taken as 16 then, a crash lowering it after. */
function budgetGb() {
    const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
    if (!mem) return 8;
    return (mem === 8 ? 16 : mem) / 2;
}
/** The share of the page's memory budget a build of `n` cells takes at its peak (a warning near 1). */
export const memoryShare = (page, n) => PEAK_GB[page](n) / budgetGb();
const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered where the browser forbids it */ } },
    drop(k) { try { localStorage.removeItem(k); } catch { /* likewise */ } },
};
// (a build under way is written down before it starts and struck off when it ends or the page is left: still there at
// the next load, the tab was closed under it — the browser ran out of memory — and that page's slider ends below it)
for (const page of Object.keys(PEAK_GB)) {
    const n = Number(store.get(`detailBuilding:${page}`));
    if (!n) continue;
    store.drop(`detailBuilding:${page}`);
    const cap = Math.max(...DETAIL_STOPS.filter(c => c < n), DETAIL_STOPS[0]);
    if (cap < (Number(store.get(`detailCap:${page}`)) || Infinity)) store.set(`detailCap:${page}`, String(cap));
}
const building = new Set();
if (typeof addEventListener === 'function') addEventListener('pagehide', () => { for (const page of building) store.drop(`detailBuilding:${page}`); });

/** The finest stop's index on `page` ('generate', 'import', 'evolution'): what its memory fits, at most a crash's cap;
 *  ?maxdetail=<cells> — a developer's: that instead (and no cap). */
export function maxStop(page) {
    const asked = Number(new URLSearchParams(globalThis.location?.search ?? '').get('maxdetail'));
    if (asked > 0) return Math.max(0, DETAIL_STOPS.filter(c => c <= asked).length - 1);
    const cap = Math.min(Number(store.get(`detailCap:${page}`)) || Infinity, touch ? TOUCH_CELLS[page] : Infinity), budget = budgetGb();
    const fit = DETAIL_STOPS.filter(c => c <= cap && (touch || PEAK_GB[page](c) <= budget)).length;
    return Math.max(0, fit - 1);
}
/** A build of `n` cells starts on `page`: written down until buildEnded (or the page is left). */
export function buildStarted(page, n) { building.add(page); store.set(`detailBuilding:${page}`, String(n)); }
/** The build ended (done, failed or dropped — not a closed tab). Done above a crash's cap, the cap goes. */
export function buildEnded(page, ok = false) {
    const n = Number(store.get(`detailBuilding:${page}`));
    building.delete(page); store.drop(`detailBuilding:${page}`);
    if (ok && n > (Number(store.get(`detailCap:${page}`)) || Infinity)) store.drop(`detailCap:${page}`);
}
/** A slider over the stops from index `min`: its max this machine's finest stop, its value kept in range. */
export function fitSlider(slider, page, min = 0) {
    const max = Math.max(min, maxStop(page));
    slider.min = String(min); slider.max = String(max);
    if (Number(slider.value) > max) slider.value = String(max);
    return max;
}

/** The spacing of `cells` cells on an Earth-sized planet, in km (hexagons: 1.075 × the square root of a cell's area). */
export const cellKm = cells => 1.0746 * Math.sqrt(5.1e8 / cells);
/** "2M", "610K", "8K". */
export const cellsShort = cells => (cells >= 1e6 ? `${cells / 1e6}M` : `${cells / 1e3}K`);
const minutes = s => (s < 90 ? `~${Math.max(10, Math.round(s / 10) * 10)} s` : `~${Math.round(s / 60)} min`);
/** A slider's words: "2M cells · 17 km · ~1 min" (`secs`: a build's estimate there, if known). */
export const stopWords = (cells, secs) => `${cellsShort(cells)} cells · ${Math.round(cellKm(cells))} km${secs ? ` · ${minutes(secs)}` : ''}`;
