// The build's progress, bottom right (docs/build-progress.md): a world is built in two steps — the planet (the
// worker's: its plates, its past, its ground, and the Detail ladder's steps) and its finish in the background (the
// climate, rivers, lakes, ice, rocks and food: v2/js/finish/finish.js, its stages and their share of the time) — and
// the card says which runs, what it is doing and how far along it is, and when zooming in starts adding detail (the
// finish's fine detail drawn: its drivers, well before the finish is done). Generate (js/main.js) and Import
// (js/import-main.js) share it; Generate has a third step, its states and empires (v2/js/evolution/states-view.js).

import { stageWords } from '../v2/js/finish/stage-words.js';
import { pctWords } from '../v2/js/finish/stage-clock.js';

const HIDE_MS = 2500;                                                // (the finished card stays this long, then goes)

export function buildProgress(steps = 2) {
    const el = document.createElement('div');
    el.id = 'buildProgress'; el.className = 'build-progress'; el.hidden = true;
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="bp-head"><span class="bp-step"></span><span class="bp-pct"></span></div>'
        + '<div class="bp-track"><div class="bp-fill"></div></div><div class="bp-task" hidden><div class="bp-task-fill"></div></div>'
        + '<div class="bp-label"></div><div class="bp-zoom"></div>';
    document.body.append(el);
    const [step, pct, fill, task, taskFill, label, zoom] = ['.bp-step', '.bp-pct', '.bp-fill', '.bp-task', '.bp-task-fill', '.bp-label', '.bp-zoom'].map(s => el.querySelector(s));
    let timer = 0;
    // (`own`: the step under way's own share — the finish's stage, finish/stage-clock.js — a thin bar and its number; null: none)
    const show = (stepText, frac, text, kind = '', own = null) => {
        clearTimeout(timer);
        el.hidden = false; el.dataset.kind = kind;
        step.textContent = stepText;
        const p = Math.max(0, Math.min(1, frac));
        pct.textContent = frac === frac ? `${Math.round(100 * p)} %` : '';
        fill.style.transform = `scaleX(${frac === frac ? p : 0})`;
        task.hidden = own === null;
        if (own !== null) taskFill.style.transform = `scaleX(${Math.max(0, Math.min(1, own))})`;
        label.textContent = own === null ? text : `${text} ${pctWords(own)}`;
    };
    const zoomNote = (ready) => { zoom.textContent = ready ? 'Zoom in for detail: ready' : 'Zoom in for detail: once the fine detail is drawn'; zoom.dataset.ready = ready ? '1' : ''; };
    return {
        /** A build begins: the planet's step. */
        start() { show(`Step 1 of ${steps} · Building the planet`, 0, 'Starting…'); zoomNote(false); },
        /** The planet worker's progress (0 … 100) and its words. */
        build(p, text) { show(`Step 1 of ${steps} · Building the planet`, p / 100, text ?? ''); zoomNote(false); },
        /** The finish's stage, its share of the whole finish (0 … 1) and the stage's own (0 … 1, or null: not known). */
        finishing(stage, share, own = null) { show(`Step 2 of ${steps} · Finishing the world`, share, `${stageWords(stage)}…`, '', own); },
        /** The states and empires (Generate's third step): how far along (0 … 1) and what it is doing. */
        states(share, text) { show(`Step 3 of ${steps} · Founding the states`, share, text); },
        /** The finish's fine detail drawn: zooming in now adds it. */
        zoomReady() { zoomNote(true); },
        /** The finish over: done (the card goes a moment later), or `problem` (it stays, saying so). */
        done(problem = null) {
            if (problem) { show(`Step 2 of ${steps} · Finishing the world`, NaN, problem, 'failed'); return; }
            show('Done', 1, 'Every layer is ready', 'done'); zoomNote(true);
            timer = setTimeout(() => { el.hidden = true; }, HIDE_MS);
        },
        /** The build failed (the overlay says why): the card goes. */
        failed() { clearTimeout(timer); el.hidden = true; },
    };
}
