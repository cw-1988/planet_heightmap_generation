// The builds every World Orogen tab runs share one memory budget (docs/build-gate.md): a build starts once the builds
// under way in all the tabs, its own peak added, fit this machine's budget (detail-stops.js) — else it waits for one of
// them to end. And a build the browser closed its tab under (out of memory) lowers that page's Detail slider after.
//
// Each build under way holds a Web Lock named for its tab and its modelled peak; the browser lets a lock go when its tab
// ends, closed or crashed, so the locks held are the builds truly running. A build also writes a marker to localStorage
// while it runs: a marker whose tab holds no lock any more is a build that tab died under.
import { DETAIL_STOPS, peakGb, budgetGb } from './detail-stops.js';

const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* not remembered where the browser forbids it */ } },
    drop(k) { try { localStorage.removeItem(k); } catch { /* likewise */ } },
    keys() { try { return Object.keys(localStorage); } catch { return []; } },
};
const TAB = Math.random().toString(36).slice(2, 10);
const PREFIX = 'detail-build:';                          // (the lock: detail-build:<page>:<tab>:<GB>)
const marker = page => `detailBuilding:${page}:${TAB}`;  // (the marker: the cells being built)

/** Lowers `page`'s cap to the stop below `n` cells: its slider ends there from now on (detail-stops.js's maxStop). */
function lowerCap(page, n) {
    const cap = Math.max(...DETAIL_STOPS.filter(c => c < n), DETAIL_STOPS[0]);
    if (cap < (Number(store.get(`detailCap:${page}`)) || Infinity)) store.set(`detailCap:${page}`, String(cap));
    globalThis.dispatchEvent?.(new Event('detail-cap'));  // (the sliders on this page refit: detail-stops.js's fitSlider)
}
// (the markers left by a tab that died mid-build: its lock gone with it. Without Web Locks a marker can't be told from a
// build running in another tab, so only one at least a day old is taken for a crash)
async function sweep() {
    const live = locks ? new Set((await locks.query()).held.map(l => l.name?.split(':')[2])) : null;
    for (const k of store.keys()) {
        const m = /^detailBuilding:(\w+):(\w+)$/.exec(k);
        if (!m || m[2] === TAB || live?.has(m[2])) continue;
        const [n, at] = (store.get(k) ?? '').split('@').map(Number);
        if (!live && Date.now() - at < 864e5) continue;
        store.drop(k);
        if (n) lowerCap(m[1], n);
    }
    for (const k of store.keys()) if (/^detailBuilding:\w+$/.test(k)) store.drop(k);   // (the old one-marker-a-page form)
}
sweep().catch(err => console.warn('[build-gate] could not check for builds a closed tab left:', err));

/** What a page shows while its build waits. */
export const WAIT_WORDS = 'Waiting for another tab’s build — both at once wouldn’t fit in memory…';
const slots = new Map();   // page → { stop() }: the build this tab has under way or waiting there
/** The memory the builds under way in all the tabs take at their peaks, in GB, and how many there are. */
async function running() {
    const held = (await locks.query()).held.filter(l => l.name?.startsWith(PREFIX));
    return { gb: held.reduce((s, l) => s + Number(l.name.split(':')[3]), 0), names: held.map(l => l.name) };
}
/** A build of `n` cells on `page` asks to start: resolves true once the budget holds it with the builds under way in every
 *  tab (`onWait()` called first if it has to wait for one to end), false if this tab's next build there, buildEnded or
 *  stopWaiting dropped it first. A build already under way on the page is ended. */
export async function buildStarted(page, n, onWait) {
    slots.get(page)?.stop();
    let release, stopped = false;
    const ac = new AbortController(), hold = new Promise(r => { release = r; });
    const slot = { waiting: true, stop() { stopped = true; ac.abort(); release(); if (slots.get(page) === slot) slots.delete(page); store.drop(marker(page)); } };
    slots.set(page, slot);
    if (locks) {
        const gb = Math.round(peakGb(page, n) * 10) / 10, mine = `${PREFIX}${page}:${TAB}:${gb}`;
        try {
            for (let told = false; ;) {
                // (one tab at a time weighs the builds and takes its place: two can't both see room for one)
                const go = await locks.request('detail-gate', { signal: ac.signal }, async () => {
                    const now = await running();
                    if (now.names.length && now.gb + gb > budgetGb()) return now.names;   // (alone, any build goes: ?maxdetail's too)
                    await new Promise(granted => { locks.request(mine, () => { granted(); return hold; }); });
                    return null;
                });
                if (!go) break;
                if (!told) { told = true; onWait?.(); }
                // (waits for one of the builds under way to end, then weighs again — the other waits let go)
                const one = new AbortController(), drop = () => one.abort();
                ac.signal.addEventListener('abort', drop);
                await Promise.race(go.map(name => locks.request(name, { signal: one.signal }, () => {}).catch(() => {})));
                one.abort(); ac.signal.removeEventListener('abort', drop);
            }
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('[build-gate] could not weigh the other tabs\' builds; building anyway:', err);
        }
    }
    if (stopped) return false;
    slot.waiting = false;
    store.set(marker(page), `${n}@${Date.now()}`);
    return true;
}
/** The build on `page` ended — done, failed or dropped, not a closed tab: its place let go. Done above a crash's cap
 *  (`ok`), the cap goes. */
export function buildEnded(page, ok = false) {
    const n = Number((store.get(marker(page)) ?? '').split('@')[0]);
    slots.get(page)?.stop();
    if (ok && n > (Number(store.get(`detailCap:${page}`)) || Infinity)) store.drop(`detailCap:${page}`);
}
/** A build on `page` still waiting for its place is dropped (its buildStarted resolves false); one running goes on. */
export function stopWaiting(page) { if (slots.get(page)?.waiting) slots.get(page).stop(); }
if (typeof addEventListener === 'function') addEventListener('pagehide', () => { for (const s of [...slots.values()]) s.stop(); });
