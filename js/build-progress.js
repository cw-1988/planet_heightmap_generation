// The build's progress, bottom right (docs/build-progress.md): a world is built in two steps — the planet (the
// worker's: its plates, its past, its ground, and the Detail ladder's steps) and its finish in the background (the
// climate, rivers, lakes, ice, rocks and food: v2/js/finish/finish.js, its stages and their share of the time) — and
// the card says which runs, what it is doing and how far along it is, and when zooming in starts adding detail (the
// finish's fine detail drawn: its drivers, well before the finish is done). Generate (js/main.js) and Import
// (js/import-main.js) share it.

import { stageWords } from '../v2/js/finish/stage-words.js';

const HIDE_MS = 2500;                                                // (the finished card stays this long, then goes)

export function buildProgress() {
    const el = document.createElement('div');
    el.id = 'buildProgress'; el.className = 'build-progress'; el.hidden = true;
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="bp-head"><span class="bp-step"></span><span class="bp-pct"></span></div>'
        + '<div class="bp-track"><div class="bp-fill"></div></div><div class="bp-label"></div><div class="bp-zoom"></div>';
    document.body.append(el);
    const [step, pct, fill, label, zoom] = ['.bp-step', '.bp-pct', '.bp-fill', '.bp-label', '.bp-zoom'].map(s => el.querySelector(s));
    let timer = 0;
    const show = (stepText, frac, text, kind = '') => {
        clearTimeout(timer);
        el.hidden = false; el.dataset.kind = kind;
        step.textContent = stepText;
        const p = Math.max(0, Math.min(1, frac));
        pct.textContent = frac === frac ? `${Math.round(100 * p)} %` : '';
        fill.style.transform = `scaleX(${frac === frac ? p : 0})`;
        label.textContent = text;
    };
    const zoomNote = (ready) => { zoom.textContent = ready ? 'Zoom in for detail: ready' : 'Zoom in for detail: once the fine detail is drawn'; zoom.dataset.ready = ready ? '1' : ''; };
    return {
        /** A build begins: the planet's step. */
        start() { show('Step 1 of 2 · Building the planet', 0, 'Starting…'); zoomNote(false); },
        /** The planet worker's progress (0 … 100) and its words. */
        build(p, text) { show('Step 1 of 2 · Building the planet', p / 100, text ?? ''); zoomNote(false); },
        /** The finish's stage and its share of the whole finish (0 … 1). */
        finishing(stage, share) { show('Step 2 of 2 · Finishing the world', share, `${stageWords(stage)}…`); },
        /** The finish's fine detail drawn: zooming in now adds it. */
        zoomReady() { zoomNote(true); },
        /** The finish over: done (the card goes a moment later), or `problem` (it stays, saying so). */
        done(problem = null) {
            if (problem) { show('Step 2 of 2 · Finishing the world', NaN, problem, 'failed'); return; }
            show('Done', 1, 'Every layer is ready', 'done'); zoomNote(true);
            timer = setTimeout(() => { el.hidden = true; }, HIDE_MS);
        },
        /** The build failed (the overlay says why): the card goes. */
        failed() { clearTimeout(timer); el.hidden = true; },
    };
}
