// The Detail ladder's steps on the page (js/detail-ladder.js; docs/progressive-detail.md): each coarser step of a world
// being built shown in place of the last — over the old world too, on a Rebuild — until the world itself arrives.
// Generate (js/main.js) and Import (js/import-main.js) share it.

import { meshFromArrays } from '../v2/js/core/sim-mesh.js';

/** `pv`: the planet view; `overlay`: the build overlay (page-chrome.js), drawn back to its bar over the picture. */
export function rungView(pv, overlay) {
    let live = null;
    const paint = () => { pv.syncClouds(null); pv.paintLive(live); pv.syncLegendCard(false); };
    return {
        /** The step shown now (or null): the page's own paint draws it instead of the old world. */
        get live() { return live; },
        /** A step from the worker: shown at once. */
        show(msg) {
            live = { T: { heightKm: msg.heightKm, shade: msg.shade }, tMesh: meshFromArrays(msg.mesh) };
            paint(); overlay.sketch();
            console.info(`[build] Detail ${msg.detail.toLocaleString('en-US')} of ${msg.of.toLocaleString('en-US')} shown at ${(msg.at / 1000).toFixed(1)} s` + (msg.ms ? ` (mesh ${(msg.ms.mesh / 1000).toFixed(2)} s, ground ${(msg.ms.ground / 1000).toFixed(2)} s)` : ''));
        },
        /** The step drawn again (a layer or view changed while it shows). */
        repaint() { if (live) paint(); },
        /** The world arrived, or the build failed: the steps let go. */
        clear() { live = null; },
    };
}
