// Edit tools (fork addition): the terrain brushes and the region split, on Generate's planet.
//   Raise / Lower / Smooth / Flatten: drag on the planet; the stroke shows at once, the worker then lays it on the ground
//   (and again after every Rebuild, Reapply or plate edit). Split: drag a line across a piece; it becomes two pieces,
//   each Ctrl-click flooded or raised on its own. Undo (Ctrl+Z) takes back the last stroke or split.
//   While a tool is on, the left button belongs to it; the right button still turns the globe.
import { applyStroke, pointAt, arcKm } from './terrain-brush.js';

const TOOLS = [['look', 'Look'], ['raise', 'Raise'], ['lower', 'Lower'], ['smooth', 'Smooth'], ['flatten', 'Flatten'], ['split', 'Split']];

/**
 * The toolbar and its pointer work. Hooks from the page: world() the world shown, busy() the worker at work,
 * preview() the newest stroke drawn into world().heightKm, strokes(list) the strokes to the worker,
 * recut(toggleAlso) the world built again with the cuts (toggleAlso: the new piece's index, to keep its parent's edit).
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
    const controls = pv.globe?.controls, rightWas = controls?.mouseButtons?.RIGHT;
    function pick(tool) {
        ed.tool = tool;
        for (const b of bar.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
        if (controls) controls.mouseButtons.RIGHT = tool === 'look' ? rightWas : 0;     // (0: rotate)
        document.body.classList.toggle('terrain-tool-on', tool !== 'look');
    }
    bar.addEventListener('click', (e) => { const t = e.target.closest('[data-tool]'); if (t) pick(t.dataset.tool); });
    undoBtn.addEventListener('click', undo);
    addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea')) { e.preventDefault(); undo(); } });

    const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === controls?.domElement;
    let drag = null;
    const stampAt = (pt) => {
        const s = drag.stroke, w = hooks.world();
        s.stamps.push(pt);
        applyStroke({ ...s, stamps: [pt] }, w.tMesh, w.heightKm);
        hooks.preview();
    };
    addEventListener('pointerdown', (e) => {
        if (ed.tool === 'look' || e.button !== 0 || e.ctrlKey || e.metaKey || !onPlanet(e.target)) return;
        e.stopPropagation(); e.preventDefault();
        const w = hooks.world(), p = w && !hooks.busy() ? pv.placeUnder(e) : null;
        if (!p) return;
        const pt = pointAt(p), r = pv.cellUnder(w.tMesh, p);
        e.target.setPointerCapture?.(e.pointerId);
        if (ed.tool === 'split') { drag = { a: pt, piece: w.r_plate[r] }; pv.hover(['<b>Split</b> · release to cut this piece along the line']); return; }
        const k = +str.value / 100, push = ed.tool === 'raise' || ed.tool === 'lower';
        drag = { stroke: { mode: ed.tool, rKm: +size.value, km: push ? k : Math.min(1, 1.5 * k), target: w.heightKm[r], stamps: [] } };
        stampAt(pt);
    }, true);
    addEventListener('pointermove', (e) => {
        if (!drag) return;
        e.stopPropagation();
        if (!drag.stroke) return;
        const p = pv.placeUnder(e);
        if (!p) return;
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
        const p = pv.placeUnder(e), b = p && pointAt(p);
        if (!b || arcKm(d.a, b) < 20) { pv.hover(null); return; }
        // (the great circle through both ends: its plane's normal, from the terrain frame to Generate's)
        const a = d.a, n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = Math.hypot(...n);
        ed.cuts.push({ piece: d.piece, n: [n[1] / len, n[2] / len, n[0] / len] });
        ed.ops.push('cut'); undoBtn.disabled = false;
        hooks.recut(d.piece);
    }, true);

    function undo() {
        if (!ed.ops.length || hooks.busy()) return;
        const op = ed.ops.pop();
        if (op === 'stroke') { ed.strokes.pop(); hooks.strokes(ed.strokes); } else { ed.cuts.pop(); hooks.recut(null); }
        undoBtn.disabled = !ed.ops.length;
    }
    return {
        get strokes() { return ed.strokes; },
        get cuts() { return ed.cuts; },
        /** A new world: no strokes, no cuts. */
        reset() { ed.strokes = []; ed.cuts = []; ed.ops = []; undoBtn.disabled = true; },
    };
}
