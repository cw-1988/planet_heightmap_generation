// The City size view's reach at the pointer (fork addition): on the Food tab's City size view, a ring of the reach
// (farmOptions.reach) under the pointer, as the edit tools' brush ring — following the view each frame, easing to a new
// reach.
import { mountMarks, viewKey } from './edit-marks.js';
import { pointAt } from './terrain-brush.js';
import { farmOptions } from '../v2/js/evolution/farming-view.js';

export function mountCityRing(pv) {
    const marks = mountMarks(pv), onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t);
    let at = null, shownKm = farmOptions.reach, seen = '', drawn = false;
    addEventListener('pointermove', (e) => { at = onPlanet(e.target) ? { clientX: e.clientX, clientY: e.clientY } : null; seen = ''; }, true);
    addEventListener('pointerout', (e) => { if (!e.relatedTarget) { at = null; seen = ''; } }, true);
    (function tick() {
        requestAnimationFrame(tick);
        if (pv.view.layer !== 'farmCity' || !at) { if (drawn) { marks.clear(); drawn = false; } return; }
        const goal = farmOptions.reach, easing = Math.abs(goal - shownKm) > 0.5, key = viewKey(pv);
        shownKm = easing ? shownKm + (goal - shownKm) * 0.25 : goal;
        if (!easing && key === seen && drawn) return;
        seen = key;
        const p = pv.placeUnder(at);
        if (p) { marks.ring(pointAt(p), shownKm); drawn = true; } else if (drawn) { marks.clear(); drawn = false; }
    })();
}
