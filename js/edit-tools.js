// Edit tools (fork addition): the terrain brushes and the region split, on Generate's planet.
//   Raise / Lower / Smooth / Flatten: drag on the planet; the stroke shows at once, the worker then lays it on the ground
//   (and again after every Rebuild, Reapply or plate edit); a ring shows the brush's size at the pointer.
//   Split: Ctrl-click the pieces, then drag a line across them; each selected piece the line divides becomes two,
//   each flooded or raised on its own. Undo (Ctrl+Z) takes back the last stroke or split.
//   While a tool is on, the left button belongs to it; Shift-drag or the right button still turns the globe.
import { applyStroke, pointAt, arcKm } from './terrain-brush.js';
import { mountMarks } from './edit-marks.js';

const TOOLS = [['look', 'Look'], ['raise', 'Raise'], ['lower', 'Lower'], ['smooth', 'Smooth'], ['flatten', 'Flatten'], ['split', 'Split']];

/**
 * The toolbar and its pointer work. Hooks from the page: world() the world shown, busy() the worker at work,
 * preview() the newest stroke drawn into world().heightKm, strokes(list) the strokes to the worker,
 * selected() the Ctrl-clicked pieces (a Set of ids), recut(parents) the world built again with the cuts (parents: the
 * pieces just cut, in order, so the new ones keep their parent's edit).
 */
export function mountEditTools(pv, hooks) {
    const ed = { strokes: [], cuts: [], ops: [], tool: 'look' };
    const bar = document.createElement('div');
    bar.className = 'terrain-tools';
    bar.innerHTML = TOOLS.map(([id, name]) => `<button data-tool="${id}" aria-pressed="${id === 'look'}">${name}</button>`).join('')
        + '<label>Size <input type="range" data-k="size" min="20" max="1500" step="10" value="300"><output>300 km</output></label>'
        + '<label>Strength <input type="range" data-k="str" min="1" max="100" value="20"><output>20</output></label>'
        + '<button data-undo disabled title="Ctrl+Z">Undo</button>';
    document.body.append(bar);
    const size = bar.querySelector('[data-k="size"]'), str = bar.querySelector('[data-k="str"]'), undoBtn = bar.querySelector('[data-undo]');
    size.addEventListener('input', () => { size.nextElementSibling.textContent = `${size.value} km`; });
    str.addEventListener('input', () => { str.nextElementSibling.textContent = str.value; });
    const controls = pv.globe?.controls, rightWas = controls?.mouseButtons?.RIGHT, leftWas = controls?.mouseButtons?.LEFT;
    function pick(tool) {
        ed.tool = tool;
        for (const b of bar.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
        // (0: rotate. Left set to 2, pan, which OrbitControls turns into a rotate under Shift; a plain left press never
        // reaches it while a tool is on, and the globe's pan is off anyway)
        if (controls) { controls.mouseButtons.RIGHT = tool === 'look' ? rightWas : 0; controls.mouseButtons.LEFT = tool === 'look' ? leftWas : 2; }
        document.body.classList.toggle('terrain-tool-on', tool !== 'look');
        if (tool === 'look' || tool === 'split') marks?.clear();
    }
    bar.addEventListener('click', (e) => { const t = e.target.closest('[data-tool]'); if (t) pick(t.dataset.tool); });
    undoBtn.addEventListener('click', undo);
    addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea')) { e.preventDefault(); undo(); } });

    const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === controls?.domElement;
    const marks = mountMarks(pv);    let drag = null;
    addEventListener('pointerout', (e) => { if (!drag && !e.relatedTarget) marks.clear(); }, true);
    const stampAt = (pt) => {
        const s = drag.stroke, w = hooks.world();
        s.stamps.push(pt);
        applyStroke({ ...s, stamps: [pt] }, w.tMesh, w.heightKm);
        hooks.preview();
    };
    addEventListener('pointerdown', (e) => {
        // (Ctrl-click still selects pieces, Shift-drag still turns the globe or pans the map)
        if (ed.tool === 'look' || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || !onPlanet(e.target)) return;
        e.stopPropagation(); e.preventDefault();
        const w = hooks.world(), p = w && !hooks.busy() ? pv.placeUnder(e) : null;
        if (!p) return;
        const pt = pointAt(p), r = pv.cellUnder(w.tMesh, p);
        if (ed.tool === 'split') {
            // (only the pieces Ctrl-clicked are cut)
            if (!hooks.selected().size) { pv.hover(['<b>Split</b> · Ctrl-click the pieces to split first, then drag a line across them']); return; }
            e.target.setPointerCapture?.(e.pointerId);
            drag = { a: pt };
            pv.hover([`<b>Split</b> · release to cut the ${hooks.selected().size} selected piece(s) along the line`]);
            return;
        }
        e.target.setPointerCapture?.(e.pointerId);
        const k = +str.value / 100, push = ed.tool === 'raise' || ed.tool === 'lower';
        drag = { stroke: { mode: ed.tool, rKm: +size.value, km: push ? k : Math.min(1, 1.5 * k), target: w.heightKm[r], stamps: [] } };
        stampAt(pt);
    }, true);
    addEventListener('pointermove', (e) => {
        if (ed.tool === 'look') return;
        const p = (drag || onPlanet(e.target)) && hooks.world() ? pv.placeUnder(e) : null;
        // (the marks: the brush's ring at the pointer, the split's line while dragged)
        if (!p) { if (!drag) marks.clear(); }
        else if (ed.tool === 'split') { if (drag) marks.cut(drag.a, pointAt(p)); else marks.clear(); }
        else marks.ring(pointAt(p), +size.value);
        if (!drag) return;
        e.stopPropagation();
        if (!drag.stroke || !p) return;
        // (stamps every quarter radius along the way, however far the pointer jumped)
        const pt = pointAt(p), s = drag.stroke, last = s.stamps[s.stamps.length - 1], steps = Math.floor(arcKm(last, pt) / (s.rKm / 4));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps, q = [0, 1, 2].map((c) => last[c] + (pt[c] - last[c]) * t), len = Math.hypot(...q);
            stampAt(q.map((c) => c / len));
        }
    }, true);
    addEventListener('pointerup', (e) => {
        if (!drag) return;
        e.stopPropagation();
        const d = drag;
        drag = null;
        if (d.stroke) { ed.strokes.push(d.stroke); ed.ops.push('stroke'); undoBtn.disabled = false; hooks.strokes(ed.strokes); return; }
        marks.clear();
        const p = pv.placeUnder(e), b = p && pointAt(p);
        if (!b || arcKm(d.a, b) < 20) { pv.hover(null); return; }
        // (the great circle through both ends, in the terrain frame; each selected piece it divides is cut)
        const a = d.a, n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = Math.hypot(...n);
        const w = hooks.world(), xyz = w.tMesh.xyz, sides = new Map();
        for (const id of hooks.selected()) sides.set(id, [0, 0]);
        for (let r = 0; r < w.n; r++) {
            const s = sides.get(w.r_plate[r]);
            if (s) s[n[0] * xyz[3 * r] + n[1] * xyz[3 * r + 1] + n[2] * xyz[3 * r + 2] >= 0 ? 0 : 1]++;
        }
        const pieces = [...sides].filter(([, s]) => s[0] >= 3 && s[1] >= 3).map(([id]) => id);
        if (!pieces.length) { pv.hover(['<b>Split</b> · the line doesn’t cross a selected piece']); return; }
        // (Generate's frame: the terrain frame's (y, z, x))
        for (const piece of pieces) ed.cuts.push({ piece, n: [n[1] / len, n[2] / len, n[0] / len] });
        ed.ops.push(pieces.length); undoBtn.disabled = false;
        hooks.recut(pieces);
    }, true);

    function undo() {
        if (!ed.ops.length || hooks.busy()) return;
        const op = ed.ops.pop();
        if (op === 'stroke') { ed.strokes.pop(); hooks.strokes(ed.strokes); } else { ed.cuts.splice(-op); hooks.recut([]); }
        undoBtn.disabled = !ed.ops.length;
    }
    return {
        get strokes() { return ed.strokes; },
        get cuts() { return ed.cuts; },
        /** A new world: no strokes, no cuts. */
        reset() { ed.strokes = []; ed.cuts = []; ed.ops = []; undoBtn.disabled = true; },
    };
}
