// How far the work under way is, reported from inside it: one sink per thread (a finish's worker sets it for its run,
// finish.js finishPlanet's `onProgress`). A stage gives its parts their ranges (`part`), nested as deep as it likes; a
// loop reports how far it is through the range it is in (`report`, 0 … 1). With no sink (Node, the page's thread, the
// pool's workers) each call is a no-op. Read by stage-clock.js through the worker's 'progress' messages.

let sink = null, lo = 0, hi = 1;

/** Reports go to `fn(share of the whole run, 0 … 1)` from now on (null: nowhere). */
export function reportTo(fn) { sink = fn; lo = 0; hi = 1; }

/** The work from here on is the share a … b of the range now in force; returns what puts that range back. */
export function part(a, b) {
    const L = lo, H = hi;
    lo = L + (H - L) * a; hi = L + (H - L) * b;
    const end = hi;
    if (sink) sink(lo);
    return () => { lo = L; hi = H; if (sink) sink(end); };      // (the part done: its own end, in the range put back)
}

/** The work in the range now in force is `f` (0 … 1) done. */
export function report(f) { if (sink) sink(lo + (hi - lo) * Math.max(0, Math.min(1, f))); }

/** Whether anyone listens (a loop may skip working out its share). */
export const reporting = () => sink !== null;
