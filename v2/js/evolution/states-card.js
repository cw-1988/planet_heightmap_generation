// The States infobox: a click on a state, a capital, a town or a trade hub (in the States view, or over any view with
// the States overlay on) opens a card on what it is about — why a place stands there, its roads, a state's people,
// metals, borders and crossings. Its buttons are the hand edits: found a capital, drop one, make a town a capital.
import { statesInfo, statesAct, statesKey, statesStamp, whyIcon } from './states-view.js';
import { statesOverlay } from './states-overlay.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ICON = whyIcon;
const CLOSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
const narrow = matchMedia('(max-width: 768px)');

/** hooks: fin() the finished moment the states rest on (null while there is none), changed() after a hand edit. */
export function mountStatesCard({ fin, changed }) {
    const el = document.createElement('div');
    el.className = 'states-card'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'statesCardTitle');
    document.body.append(el);
    let pick = null, at = null, last = '', key = '';

    function render() {
        const f = fin(), info = pick && f ? statesInfo(f, pick) : null;
        if (!info) { close(); return; }
        key = `${statesKey()}|${statesStamp()}`;
        const html = `<div class="states-card__head"><h2 id="statesCardTitle">${(info.why ?? []).map(k => ICON(k, info.place)).join('')}${esc(info.title)}</h2>` +
            `<button type="button" class="states-card__close" aria-label="Close">${CLOSE}</button></div>${info.html}`;
        if (html !== last) { el.innerHTML = html; last = html; }
        el.hidden = false;
        place();
    }
    /** Docked at the right on a wide screen (the stylesheet), as every infobox; on a phone pinned under the view strip, or
     *  above the sheet when the pick is in the top half, so it never hides what it is about. */
    function place() {
        el.classList.toggle('states-card--low', narrow.matches && !!at && at.y < innerHeight / 2);
    }
    function open(p, x, y) {
        pick = p; at = { x, y }; last = '';
        statesOverlay.sel = p.kind === 'land' ? null : [p.lat, p.lon];
        render();
    }
    function close() {
        if (el.hidden && !pick) return;
        pick = null; last = ''; el.hidden = true; statesOverlay.sel = null;
    }
    el.addEventListener('click', (e) => {
        if (e.target.closest('.states-card__close')) { close(); return; }
        const b = e.target.closest('[data-states-act]'), f = fin();
        if (!b || !f) return;
        const next = statesAct(f, b.dataset.statesAct, pick);
        if (!next) return;
        pick = next; statesOverlay.sel = null;
        changed();
        render();
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
    addEventListener('resize', () => { if (!el.hidden) place(); });
    return {
        open, close,
        get isOpen() { return !el.hidden; },
        /** Each frame: closed when the states are gone, written again when their options changed. */
        sync() { if (!pick) return; if (!fin()) close(); else if (`${statesKey()}|${statesStamp()}` !== key) render(); },
    };
}
