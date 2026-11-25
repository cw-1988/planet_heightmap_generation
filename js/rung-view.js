// The Detail ladder's steps on the page (js/detail-ladder.js; docs/progressive-detail.md): each coarser step of a world
// being built shown in place of the last — over the old world too, on a Rebuild — until the world itself arrives.
// Generate (js/main.js) and Import (js/import-main.js) share it.
// With Progressive generation, a step comes with its finish's job: run here to its terrain only (its rivers, lakes
// and the valleys they cut: finish-worker.js terrainOnly) on a finishing worker of its own, beside the build — the newest
// step waiting while one runs, those passed over dropped, and a step's water never shown over a finer step. Once a step's water is shown, only steps with their water
// follow (a bare finer step would take the water away); the last stays shown until the world's own terrain lands.

import { meshFromArrays } from '../v2/js/core/sim-mesh.js';
import { FinishService } from '../v2/js/evolution/finish-view.js';
import { terrainFin } from './finish-landing.js';

/** `pv`: the planet view; `overlay`: the build overlay (page-chrome.js), drawn back to its bar over the picture;
 *  `width(cells)`: the finish's picture width for a mesh that fine; `climate()`: the finish's climate options. */
export function rungView(pv, overlay, { width, climate }) {
    let live = null, waiting = null, running = false, finisher = null, token = {};
    const paint = () => {
        const fin = live.fin && pv.shows(live.fin);
        pv.syncClouds(null);
        if (fin) pv.paintFinished(fin, false, `rung${live.detail}`); else pv.paintLive(live);
        pv.syncLegendCard(!!fin);
    };
    const shown = (step) => { live = step; paint(); overlay.sketch(); };
    /** The steps' water one at a time, the newest waiting: each shown when it lands, if its build still runs. */
    async function water() {
        running = true;
        const t = token;
        while (waiting && t === token) {
            const { msg, step } = waiting, at = performance.now(), cells = msg.mesh.numCells;
            waiting = null;
            try {
                let fin = null;
                await (finisher ??= new FinishService()).finish({ ...msg.finish, mesh: msg.mesh, cells, width: width(cells), climateOptions: climate(), valleyQ: pv.view.riverQ, terrainOnly: true },
                    { onTerrain: (d) => { fin = terrainFin(cells, d); }, keep: true });
                if (t !== token || !fin) break;
                // (never over a finer step: its terrain would revert to this coarser one's — the finer's own water follows)
                if (!live || live.detail <= step.detail) shown({ ...step, fin });
                console.info(`[build] Detail ${msg.detail.toLocaleString('en-US')}: its rivers and lakes in ${((performance.now() - at) / 1000).toFixed(1)} s`);
            } catch (err) {
                if (err.name !== 'AbortError') console.warn('[build] a step\'s rivers and lakes failed:', err);
                break;
            }
        }
        if (t === token) running = false;
    }
    return {
        /** The step shown now (or null): the page's own paint draws it instead of the old world. */
        get live() { return live; },
        /** A step from the worker: shown at once — or, with its water asked for and a watered step shown, once its own
         *  water lands. */
        show(msg) {
            const step = { T: { heightKm: msg.heightKm, shade: msg.shade }, tMesh: meshFromArrays(msg.mesh), detail: msg.detail, fin: null };
            if (!msg.finish || !live?.fin) shown(step);
            console.info(`[build] Detail ${msg.detail.toLocaleString('en-US')} of ${msg.of.toLocaleString('en-US')} shown at ${(msg.at / 1000).toFixed(1)} s` + (msg.ms ? ` (mesh ${(msg.ms.mesh / 1000).toFixed(2)} s, ground ${(msg.ms.ground / 1000).toFixed(2)} s)` : ''));
            if (msg.finish) { waiting = { msg, step }; if (!running) water(); }
        },
        /** The step drawn again (a layer or view changed while it shows). */
        repaint() { if (live) paint(); },
        /** The world arrived: the steps' water stopped; a watered step stays shown (call clear once the world's own
         *  terrain is), a bare one goes. */
        land() { stop(); if (!live?.fin) live = null; },
        /** The world's terrain landed, or the build failed: the steps let go. */
        clear() { stop(); live = null; },
    };
    function stop() { token = {}; waiting = null; running = false; finisher?.cancel(); }
}
