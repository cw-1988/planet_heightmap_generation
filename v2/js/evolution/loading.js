// Evolution's loading screen: Generate's overlay (styles.css, .build-overlay: the logo turning, a title, a bar, a line
// saying what is happening), over the planet and behind the controls, for the waits where there is nothing to watch —
// a world starting before its first moment, a planet file opening, detail being added, the terrain built again. The
// history building is never covered: watching a world form is the point; nor is a change of view (owner, 2026-11-04: a
// screen on every view change at high detail "looks bad").
//
// Each wait shows it under its own name, and the waits stack: the latest shows, and when it is over the one beneath
// comes back as it was left (its words and share kept up to date meanwhile) — Terrain Detail changed during Add detail
// hands the screen back to Add detail. A share of null runs the bar as a slow sweep (no fraction to give). A wait made of
// steps (Add detail's stages) gives the step under way's own share too (`task`): a thin bar under the whole's, and both
// as numbers. It appears at once (a wait about to freeze the page must be on screen first) and fades as the last wait goes.

import { pctWords } from '../finish/stage-clock.js';

export function createLoading(el) {
    const title = el.querySelector('.build-overlay-title'), label = el.querySelector('.progress-label');
    const bar = el.querySelector('.progress-bar-container'), fill = el.querySelector('.progress-bar-fill');
    const taskBar = el.querySelector('.progress-task'), taskFill = taskBar?.firstElementChild, pct = el.querySelector('.progress-pct');
    const waits = new Map();                                 // (id → its words, shares and opacity; the last one on top)
    let shown = null;                                        // (the wait on screen)
    const top = () => { let id = null; for (const k of waits.keys()) id = k; return id; };
    const set = ({ title: t, label: l, share, task }) => {
        title.textContent = t;
        label.textContent = l;
        bar.classList.toggle('indeterminate', share === null);
        fill.style.transform = share === null ? '' : `scaleX(${Math.max(0, Math.min(1, share))})`;
        const hasTask = share !== null && task !== null;
        if (taskBar) { taskBar.hidden = !hasTask; if (hasTask) taskFill.style.transform = `scaleX(${Math.max(0, Math.min(1, task))})`; }
        if (pct) pct.textContent = share === null ? '' : `${pctWords(share)} in all${hasTask ? ` · this step ${pctWords(task)}` : ''}`;
    };
    // (the top wait on screen: the bar jumps to a newcomer's share rather than sliding there; gone when none is left)
    const render = () => {
        const id = top();
        if (id === null) { shown = null; el.classList.add('hidden'); return; }
        const w = waits.get(id);
        if (shown !== id) {
            for (const f of [fill, taskFill]) if (f) f.style.transition = 'none';
            set(w); void fill.offsetWidth;
            for (const f of [fill, taskFill]) if (f) f.style.transition = '';
        }
        else set(w);
        shown = id;
        el.classList.toggle('initial', w.opaque);
        el.classList.add('now');
        el.classList.remove('hidden');
        void el.offsetWidth;
        el.classList.remove('now');
    };
    return {
        /** Show the screen for wait `id`, on top: { title, label, share (0…1, or null), task (the step's own share, or
         *  null), opaque (the first, over nothing yet) }. */
        show(id, { title: t = '', label: l = '', share = null, task = null, opaque = false } = {}) {
            waits.delete(id);
            waits.set(id, { title: t, label: l, share, task, opaque });
            render();
        },
        /** New words or shares for wait `id` (shown at once if it is on top, kept for when it is otherwise). */
        update(id, words) {
            const w = waits.get(id);
            if (!w) return;
            for (const k of ['title', 'label', 'share', 'task']) if (words[k] !== undefined) w[k] = words[k];
            if (shown === id) set(w);
        },
        /** Wait `id` is over: the one beneath it shows again, or the screen goes. */
        hide(id) {
            if (!waits.delete(id)) return;
            if (shown === id) render();
        },
        /** Every wait over at once (a world left: its waits go with it). */
        clear() { waits.clear(); if (shown !== null) render(); },
        /** The wait on screen, or null. */
        get showing() { return shown; },
    };
}
