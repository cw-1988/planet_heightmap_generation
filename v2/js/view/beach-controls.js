// The beach's look, fixed in look-config.js (once the view strip's Beach sliders; docs/beach-look.md): how wide the beach is drawn — how far it eats into the land — how
// opaque, and which side of the shore it lies on (over the land as made, or out over the sea). They set littoral.js
// BEACH_LOOK, which the painter reads as it paints (the tiles' shore colours keep the beach's width and distance, so
// nothing is built again), and the view's fields, which go into the tiles' look (planet-view.js patchLookOf) so the
// tiles are painted again. Each acts only where a coast has a beach (its sand and waves): it is no outline.

import { BEACH_LOOK } from '../finish/littoral.js';
import { LOOK } from './look-config.js';

const $ = id => document.getElementById(id);
/** Each slider: its id, the view's field, BEACH_LOOK's key, and how its value reads. */
export const BEACH_SLIDERS = [
    { id: 'beachWidth', field: 'beachWidth', key: 'width', show: v => `×${v}` },
    { id: 'beachAlpha', field: 'beachAlpha', key: 'alpha', show: v => `${Math.round(100 * v)}%` },
    { id: 'beachShift', field: 'beachShift', key: 'shift', show: v => (v >= 0.99 ? 'land' : v <= -0.99 ? 'sea' : `${Math.round(50 * (1 + v))}% land`) },
];
/** The view's fields: fixed in look-config.js (the sliders went from the strip, the owner 2026-11-24: they cluttered it). */
export const BEACH_DEFAULTS = { beachWidth: LOOK.beachWidth, beachAlpha: LOOK.beachAlpha, beachShift: LOOK.beachShift };

/** BEACH_LOOK and the view's fields set from look-config.js (a value an earlier visit's sliders left is not kept). */
export function syncBeach(view) {
    for (const s of BEACH_SLIDERS) {
        view[s.field] = BEACH_DEFAULTS[s.field];
        BEACH_LOOK[s.key] = view[s.field];
        const v = $(`v${s.id[0].toUpperCase()}${s.id.slice(1)}`);
        if (v) v.textContent = s.show(view[s.field]);
    }
}

/** The view's beach fields set (no sliders to wire now: `changed` kept for the callers). */
export function wireBeach(view, changed) { // eslint-disable-line no-unused-vars
    syncBeach(view);
}

/** The beach's part of a picture's look key. */
export const beachKey = view => `${view.beachWidth}|${view.beachAlpha}|${view.beachShift}`;
