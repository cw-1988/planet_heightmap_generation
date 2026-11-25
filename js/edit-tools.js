// Edit tools (fork addition): the paint layer, on Generate's planet.
//   Paint: drag on the planet to paint the character picked beside it (piece-shapes.js: a mountain range, an
//   archipelago, hills, a swamp …) wherever the brush goes, across plate edges, with no plate picked first; a ring shows
//   the brush's size at the pointer. A stroke changes nothing yet: it waits, in its character's colour (piece-overlay.js),
//   until Apply (or Enter) lays the waiting strokes at once — each character in full across its strokes' bands, easing
//   over a fixed transition to the ground around it (terrain-brush.js). Erase (or Shift-drag) paints the eraser: where
//   it passes, earlier paint comes off and the ground is as it was. While Paint is on, Ctrl-click (a tap in edit mode)
//   chooses pieces to paint in instead of marking them for Rebuild: each stroke then keeps to the pieces chosen when it
//   began (fading in from their outlines), so the ground round them is left alone; none chosen, it paints everywhere.
//   The paint is a layer over the plates, not part of them: the worker lays it again onto the unpainted ground after
//   every Rebuild, Reapply or plate edit; Layer shows or hides its colours; Clear paint takes it off whole. The planet
//   code carries it (planet-code.js), so a link opens with it.
//   Undo (Ctrl+Z) takes back the last stroke, the last Apply (all it laid) or a Clear. (It took the place of the Raise,
//   Lower, Smooth and Flatten brushes, of Split, and of the plate-wide characters.)
//   While a tool is on, the left button belongs to it; the right button still turns the globe. The tools are the
//   Terrain tab's own row under the layer tabs (#subBar, as Climate's and Geology's are: layer-bar.js data-for-layer),
//   so they stay clear of the hover readout at the bottom; on every other layer the row hides, Look takes over and the
//   paint's colours go.
import { pointAt, arcKm, snapPoint, gridPoint } from './terrain-brush.js';
import { mountMarks, viewKey, uvOf } from './edit-marks.js';
import { stepByWheel } from '../v2/js/view/wheel-step.js';
import { editHeld } from './edit-key.js';
import { CHARACTERS } from './piece-shapes.js';

const TOOLS = [['look', 'Look'], ['paint', 'Paint']];
/** Paint's characters, in the picker's order (by index into CHARACTERS: none, the eraser, is Erase). */
const PAINTS = ['mountainous', 'hilly', 'flat', 'plateau', 'swamp', 'lakeland', 'rifted', 'volcanic', 'archipelago', 'shallow', 'ocean']
    .map(id => CHARACTERS.findIndex(c => c.id === id));
/** A stroke's next point once the pointer is this far from its last, km: a third of the brush, 10 at least. */
const stepKm = (rKm) => Math.max(rKm / 3, 10);

/**
 * The toolbar and its pointer work. Hooks from the page: world() the world shown, busy() the worker at work,
 * strokes(list, legacy) the applied strokes to the worker (legacy: the old links' plate characters, when they change),
 * legacy() those plate characters as they are, painting(applied, waiting) the layer to draw (piece-overlay.js, [] [] to
 * hide it), layerShown(on) whether the applied paint's colours show, selecting(e) whether a press picks pieces (edit
 * mode on a touch screen: it isn't a stroke).
 */
export function mountEditTools(pv, hooks) {
    const ed = { strokes: [], waiting: [], ops: [], tool: 'look', shown: true, area: new Set() };
    const bar = document.createElement('div');
    bar.className = 'terrain-tools';
    bar.dataset.forLayer = 'terrain';
    bar.innerHTML = TOOLS.map(([id, name]) => `<button type="button" data-tool="${id}" aria-pressed="${id === 'look'}">${name}</button>`).join('')
        + '<button type="button" data-erase hidden aria-pressed="false" title="Or hold Shift while dragging">Erase</button>'
        + `<label data-paint hidden><span class="paint-swatch" aria-hidden="true"></span><select data-k="char" aria-label="Paint as">${PAINTS.map(c => `<option value="${c}" title="${CHARACTERS[c].tip}">${CHARACTERS[c].name}</option>`).join('')}</select></label>`
        + '<label data-size hidden>Size <input type="range" data-k="size" min="20" max="1500" step="10" value="300"><output>300 km</output></label>'
        + '<button type="button" data-apply hidden title="Enter">Apply</button>'
        + '<button type="button" data-undo disabled title="Ctrl+Z">Undo</button>'
        + '<button type="button" data-layer hidden aria-pressed="true" title="Show the paint\'s colours over the planet">Layer</button>'
        + '<button type="button" data-clear hidden title="Take all the paint off: the planet as its plates made it">Clear paint</button>';
    const onTerrainNow = pv.view.layer === 'terrain';
    document.getElementById('subBar').append(bar);
    pv.bar.showRows(pv.view.layer);                    // (the layer was shown before this row existed)
    const q = (s) => bar.querySelector(s);
    const size = q('[data-k="size"]'), undoBtn = q('[data-undo]'), charPick = q('[data-k="char"]'), paintLabel = q('[data-paint]');
    const applyBtn = q('[data-apply]'), eraseBtn = q('[data-erase]'), sizeLabel = q('[data-size]'), layerBtn = q('[data-layer]');
    const clearBtn = q('[data-clear]'), swatch = q('.paint-swatch');
    let shiftHeld = false;
    /** The plates paint keeps to: those chosen while Paint is on, else those selected for Rebuild (none: everywhere). */
    const keepSet = () => ed.area.size ? ed.area : (hooks.selected?.() ?? new Set());
    const erasing = () => eraseBtn.getAttribute('aria-pressed') === 'true' || shiftHeld;
    /** The swatch in the pick's colour, and the picker's tooltip saying what the pick does to the surface. */
    const showSwatch = () => { const c = CHARACTERS[+charPick.value]; swatch.style.background = `var(${c.tok})`; charPick.title = c.tip; };
    showSwatch();
    const hintPaint = () => {
        const what = CHARACTERS[+charPick.value].name.toLowerCase(), n = ed.waiting.length, rub = document.body.classList.contains('touch') ? 'Erase' : 'Shift-drag';
        const then = n ? ` · ${n} stroke${n > 1 ? 's' : ''} waiting: Apply to lay ${n > 1 ? 'them' : 'it'}` : ', then Apply';
        const pick = document.body.classList.contains('touch') ? 'In edit mode, tap' : 'Ctrl-click';
        const k = keepSet().size, chosen = ed.area.size > 0, pl = `plate${k > 1 ? 's' : ''}`;
        const where = !k ? '' : chosen ? ` in the ${k} chosen ${pl}` : ` in the ${k} ${pl} selected for Rebuild`;
        const keep = chosen ? `${pick} a chosen plate to free it` : `${pick} plates to paint only in them`;
        pv.hover([`<b>Paint</b> · drag to paint ${what} ground${where}${then} · ${rub} to take paint off · ${keep}`,
            `<i>${CHARACTERS[+charPick.value].name}:</i> ${CHARACTERS[+charPick.value].tip.toLowerCase()}`]);
    };
    /** The buttons as the layer is: Apply while strokes wait (with how many), Layer and Clear while there is paint. */
    const showState = () => {
        const k = ed.waiting.length, any = ed.strokes.length > 0 || (hooks.legacy?.() ?? []).length > 0;
        applyBtn.hidden = !k;
        applyBtn.textContent = k > 1 ? `Apply ${k}` : 'Apply';
        undoBtn.disabled = !ed.ops.length;
        layerBtn.hidden = !ed.strokes.length;
        clearBtn.hidden = !any && !k;
        seen = '';
    };
    /** The layer to the overlay: the applied strokes and the waiting ones (the one under way last), on the Terrain tab. */
    function sendPaint() {
        const onTerrain = pv.view.layer === 'terrain';
        const waiting = drag?.stroke ? [...ed.waiting, drag.stroke] : ed.waiting;
        hooks.painting?.(onTerrain ? ed.strokes : [], onTerrain ? waiting : []);
    }
    /** The waiting strokes laid on the ground (one undo takes them all back). */
    function apply() {
        if (!ed.waiting.length) return;
        if (hooks.busy()) { pv.hover(['<b>Paint</b> · ready once the planet is built']); return; }
        const k = ed.waiting.length;
        ed.strokes = [...ed.strokes, ...ed.waiting];
        ed.waiting = [];
        ed.ops = ed.ops.filter((o) => o !== 'wait');
        ed.ops.push({ apply: k });
        eraseBtn.setAttribute('aria-pressed', 'false');
        showState(); sendPaint();
        hooks.strokes(ed.strokes);
        pv.hover(['<b>Paint</b> · laying the strokes…']);
    }
    /** All the paint off (and the old links' plate characters): the planet as its plates made it. */
    function clear() {
        if (hooks.busy()) { pv.hover(['<b>Paint</b> · ready once the planet is built']); return; }
        const legacy = hooks.legacy?.() ?? [];
        if (!ed.strokes.length && !ed.waiting.length && !legacy.length) return;
        const laid = ed.strokes.length > 0 || legacy.length > 0;
        ed.ops.push({ clear: true, strokes: ed.strokes, waiting: ed.waiting, legacy });
        ed.strokes = []; ed.waiting = [];
        showState(); sendPaint();
        if (laid) hooks.strokes([], legacy.length ? [] : undefined);
    }
    size.addEventListener('input', () => { size.nextElementSibling.textContent = `${size.value} km`; });
    charPick.addEventListener('change', () => { showSwatch(); eraseBtn.setAttribute('aria-pressed', 'false'); if (ed.tool === 'paint') hintPaint(); });
    const controls = pv.globe?.controls, rightWas = controls?.mouseButtons?.RIGHT;
    function pick(tool) {
        ed.tool = tool;
        paintLabel.hidden = eraseBtn.hidden = sizeLabel.hidden = tool !== 'paint';
        if (tool === 'paint') hintPaint();
        for (const b of bar.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
        if (controls) controls.mouseButtons.RIGHT = tool === 'look' ? rightWas : 0;     // (0: rotate)
        document.body.classList.toggle('terrain-tool-on', tool !== 'look');
        if (tool === 'look') marks?.clear();
    }
    bar.addEventListener('click', (e) => { const t = e.target.closest('[data-tool]'); if (t) pick(t.dataset.tool); });
    undoBtn.addEventListener('click', undo);
    applyBtn.addEventListener('click', apply);
    clearBtn.addEventListener('click', clear);
    layerBtn.addEventListener('click', () => {
        ed.shown = !ed.shown;
        layerBtn.setAttribute('aria-pressed', String(ed.shown));
        hooks.layerShown?.(ed.shown);
    });
    eraseBtn.addEventListener('click', () => { eraseBtn.setAttribute('aria-pressed', String(!erasing())); seen = ''; });
    addEventListener('keyup', (e) => { if (e.key === 'Shift') { shiftHeld = false; seen = ''; } });
    addEventListener('blur', () => { shiftHeld = false; });
    addEventListener('keydown', (e) => {
        if (e.key === 'Shift') { shiftHeld = true; seen = ''; }
        if (e.target.closest?.('input, textarea')) return;
        if (e.key === 'Escape' && ed.tool === 'paint' && ed.area.size) { ed.area.clear(); hintPaint(); }
        if (editHeld(e) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        else if (e.key === 'Enter' && ed.waiting.length && pv.view.layer === 'terrain' && !e.target.closest?.('button, select')) { e.preventDefault(); apply(); }
    });

    const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === controls?.domElement;
    const marks = mountMarks(pv);
    let drag = null, at = null, shownKm = +size.value, seen = '';
    addEventListener('pointerout', (e) => { if (!drag && !e.relatedTarget) { marks.clear(); at = null; } }, true);
    /** At the pointer `at`, the brush's ring. The place under the pointer. */
    function drawMarks() {
        const p = at && hooks.world() && ed.tool !== 'look' ? pv.placeUnder(at) : null;
        if (!p) { if (!drag) marks.clear(); return null; }
        // (kept to chosen plates — the stroke under way's, or those chosen now — the ring shows where it stops)
        const w = hooks.world(), seeds = w.plateSeeds, keptTo = drag ? drag.stroke.in && new Set(drag.stroke.in.map((i) => seeds[i])) : keepSet().size && keepSet();
        const inside = keptTo && w.tMesh && w.r_plate ? (q) => keptTo.has(w.r_plate[pv.cellUnder(w.tMesh, uvOf(q))]) : null;
        marks.ring(pointAt(p), shownKm, ed.tool === 'paint' && (drag ? !drag.stroke.c : erasing()), inside);
        return p;
    }
    // (each frame the view moves — a zoom easing in, a turn gliding on — the ring follows, so it stays under the pointer
    // and grows and shrinks with the zoom; a new Size eases in the same way)
    // (the tools are the Terrain tab's: on any other layer the row hides — layer-bar.js — Look takes over and the paint's
    // colours go)
    let wasTerrain = onTerrainNow;
    (function tick() {
        requestAnimationFrame(tick);
        const onTerrain = pv.view.layer === 'terrain';
        if (onTerrain !== wasTerrain) { wasTerrain = onTerrain; if (!onTerrain) { pick('look'); drag = null; at = null; } sendPaint(); }
        if (ed.tool === 'look' || !at) return;
        const goal = +size.value, easing = Math.abs(goal - shownKm) > 0.5, key = `${viewKey(pv)} ${pv.view.layer}`;
        shownKm = easing ? shownKm + (goal - shownKm) * 0.25 : goal;
        if (easing || key !== seen) { seen = key; drawMarks(); }
    })();
    // (over the planet, instead of the zoom: Shift+wheel the brush's size, 15 % a notch, wheel down for more. Ctrl stays
    // the piece selection's. Shift+wheel can come as a sideways scroll: deltaX)
    addEventListener('wheel', (e) => {
        const input = e.shiftKey ? size : null;
        if (!input || editHeld(e) || ed.tool === 'look' || !onPlanet(e.target)) return;
        e.preventDefault(); e.stopPropagation();
        stepByWheel(input, e);      // (a stroke under way keeps its own)
    }, { capture: true, passive: false });
    /** A stroke under way, to `pt` (unit) on the paint grid: its last point follows the pointer, and stays once it is far
     *  enough on from the one before (or `last`, the pointer let go), so links keep few points; drawn at once (the ground
     *  changes only on Apply). */
    function pointTo(pt, last = false) {
        const s = drag.stroke, g = snapPoint(pt), n = s.pts.length, end = s.pts[n - 1];
        if (end && g[0] === end[0] && g[1] === end[1]) { if (last) drag.loose = false; return; }
        if (drag.loose) s.pts[n - 1] = g; else s.pts.push(g);
        const kept = s.pts[s.pts.length - 2];
        drag.loose = !last && !!kept && arcKm(gridPoint(kept), pt) < stepKm(s.rKm);
        sendPaint();
    }
    addEventListener('pointerdown', (e) => {
        // (Ctrl-click still selects pieces, for Rebuild)
        if (ed.tool === 'look' || e.button !== 0 || editHeld(e) || hooks.selecting?.(e) || !onPlanet(e.target)) return;
        e.stopPropagation(); e.preventDefault();
        // (the tools can be picked mid-build; they work on the planet once it is built)
        if (hooks.busy()) { pv.hover(['<b>Paint</b> · ready once the planet is built']); return; }
        const w = hooks.world(), p = w ? pv.placeUnder(e) : null;
        if (!p) return;
        if (e.shiftKey) shiftHeld = true;
        e.target.setPointerCapture?.(e.pointerId);
        // (Shift-drag, or Erase: the eraser, a stroke of "none")
        // (kept to the pieces chosen, as their indices in the layout's list: the planet code's)
        const stroke = { c: erasing() ? 0 : +charPick.value, rKm: +size.value, pts: [] };
        const inside = [...keepSet()].map((id) => w.plateSeeds.indexOf(id)).filter((i) => i >= 0);
        if (inside.length) stroke.in = inside.sort((a, b) => a - b);
        drag = { stroke };
        at = { clientX: e.clientX, clientY: e.clientY };
        pointTo(pointAt(p));
    }, true);
    addEventListener('pointermove', (e) => {
        if (ed.tool === 'look') return;
        at = drag || onPlanet(e.target) ? { clientX: e.clientX, clientY: e.clientY } : null;
        const p = drawMarks();
        if (!drag) return;
        e.stopPropagation();
        if (p) drag.pt = pointAt(p), pointTo(drag.pt);
    }, true);
    addEventListener('pointerup', (e) => {
        if (!drag) return;
        e.stopPropagation();
        const d = drag;
        if (d.pt) pointTo(d.pt, true);
        drag = null;
        ed.waiting.push(d.stroke); ed.ops.push('wait');
        showState(); sendPaint(); hintPaint();
    }, true);

    function undo() {
        if (!ed.ops.length || hooks.busy()) return;
        const op = ed.ops.pop();
        if (op === 'wait') { ed.waiting.pop(); }
        else if (op?.apply) { ed.strokes = ed.strokes.slice(0, -op.apply); hooks.strokes(ed.strokes); }
        else if (op?.clear) {
            const laid = op.strokes.length > 0 || op.legacy.length > 0;
            ed.strokes = op.strokes; ed.waiting = op.waiting;
            if (laid) hooks.strokes(ed.strokes, op.legacy.length ? op.legacy : undefined);
        }
        showState(); sendPaint();
        if (ed.tool === 'paint') hintPaint();
    }
    return {
        get strokes() { return ed.strokes; },
        /** Whether a Ctrl-click chooses pieces to paint in (Paint is on), not pieces for Rebuild. */
        get choosing() { return ed.tool === 'paint' && pv.view.layer === 'terrain'; },
        /** The pieces chosen to paint in (piece ids). */
        get area() { return ed.area; },
        /** A piece chosen to paint in, or let go. */
        toggleArea(id) { if (ed.area.has(id)) ed.area.delete(id); else ed.area.add(id); hintPaint(); },
        /** The plates selected for Rebuild changed: the hint and the ring follow (paint keeps to them when none are chosen). */
        selectionChanged() { if (ed.tool === 'paint') hintPaint(); seen = ''; },
        /** A new world: no paint. */
        reset() { ed.strokes = []; ed.waiting = []; ed.ops = []; ed.area.clear(); showState(); sendPaint(); },
        /** A link's paint, applied (the worker lays it with the world). */
        load(strokes) { ed.strokes = strokes ?? []; ed.waiting = []; ed.ops = []; ed.area.clear(); showState(); sendPaint(); },
        /** The edits as they are (save) and back again (restore): a new world's build cancelled keeps the old one's. */
        save() { return { strokes: ed.strokes, waiting: ed.waiting, ops: ed.ops }; },
        restore(s) { Object.assign(ed, { waiting: [], ...s }); showState(); sendPaint(); },
        /** Something outside changed what Clear has to take (the old links' plate characters). */
        refresh() { showState(); },
    };
}
