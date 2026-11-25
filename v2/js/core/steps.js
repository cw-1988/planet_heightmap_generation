// Long work on the page's own thread done a step at a time, so the page never stalls behind it. A piece of work is a
// generator that yields between small steps (a row, a river) and returns its result; the same generator run straight
// through (drain) is the plain function — one body, so the stepped and the plain results are the same. The owner,
// 2026-11-24: "when starting a cached instance the browser is unresponsive for a while (on a 10m detail build)" —
// docs/world-cache.md (Opening without stalls).

/** A generator run to its end: its result. */
export function drain(gen) {
    for (;;) { const s = gen.next(); if (s.done) return s.value; }
}

/** A generator run for up to `ms`: { value } once it has ended, else null (it goes on from there next time). */
export function stepFor(gen, ms) {
    const end = performance.now() + ms;
    for (;;) {
        const s = gen.next();
        if (s.done) return { value: s.value };
        if (performance.now() >= end) return null;
    }
}

/** The next task, without a timer's clamp (a MessageChannel's message: setTimeout waits ≥ 4 ms once nested). */
const ch = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null, waiting = [];
if (ch) { ch.port1.onmessage = () => waiting.shift()?.(); ch.port1.unref?.(); }
export const nextTask = () => new Promise(r => { if (ch) { waiting.push(r); ch.port2.postMessage(0); } else setTimeout(r, 0); });

/** A generator run a slice of `ms` per task until it ends, the page free between: a promise of its result. */
export async function stepAsync(gen, ms = 8) {
    for (;;) {
        const s = stepFor(gen, ms);
        if (s) return s.value;
        await nextTask();
    }
}

/**
 * A result made once and kept (`has()`, `get()`: where its maker keeps it), made by `make()` — a generator that keeps
 * it there — a step at a time, the making shared by everyone who asks meanwhile (each step of any of them is a step of
 * the one making). `owner` and `key`: which making this is (weakly, by its owner).
 */
const making = new WeakMap();
export function* sharedSteps(owner, key, has, get, make) {
    while (!has()) {
        let m = making.get(owner);
        if (!m) making.set(owner, m = new Map());
        let g = m.get(key);
        if (!g) m.set(key, g = make());
        let done;
        try { done = g.next().done; } catch (err) { m.delete(key); throw err; }
        if (done) { m.delete(key); if (!has()) throw new Error('a shared step ended without its result'); }
        else yield;
    }
    return get();
}
