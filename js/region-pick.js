// Region pick (fork addition): choose valleys on the planet and open them as a region. The land is cut along its natural
// borders, divides, rivers and coasts (region-basin.js), at a chosen valley size. Region on: the valley under the
// pointer is lightened, and a click (not a drag) takes it in or out; the chosen ones are tinted. The region's box is
// their extent with the Border round it (the land around them, simulated too, for what lies at their edges: passes,
// rivers coming in, the neighbours); what lies in the box beyond the border shows greyed. Open builds it in a worker
// (v2/js/region/region-worker.js) and shows it flat (region-view.js).
import { regionFrame, placeAt, xyOf, cropPlanet, cropBuffers } from '../v2/js/region/region-frame.js';
import { regionWindow } from '../v2/js/region/region-view.js';
import { valleysOf } from './region-basin.js';

/** The valleys chosen, for the planet's tint (region-overlay.js, drawn by the globe's shader): ids, the partition (unit
 *  per cell, cells per unit), the valley under the pointer (hover). */
export const regionChosen = { ids: new Set(), unit: null, cells: null, hover: -1, world: null, size: 0, riverQ: 0, wallQ: 0 };
const D = Math.PI / 180, KM_MIN = 200, KM_MAX = 6000;
// (km²; region-basin.js keeps a valley at least a dozen of the planet's cells, so its shape follows the land at any detail)
const SIZES = [['small', 30000], ['medium', 150000], ['large', 600000]];

/** The bar and its clicks. Hooks: world() the world shown. (The tint is region-overlay.js's, read off `regionChosen`.) */
export function mountRegionPick(pv, hooks) {
    const bar = document.createElement('div');
    bar.className = 'terrain-tools region-pick';
    bar.innerHTML = '<button data-on aria-pressed="false" title="Choose valleys on the planet and open them as a region">Region</button>'
        + '<span class="region-more" hidden><span data-n></span>'
        + `<label>Valleys <select data-k="size">${SIZES.map(([k, v], i) => `<option value="${v}"${i === 1 ? ' selected' : ''}>${k}</option>`).join('')}</select></label>`
        + '<label title="The rivers that bound a valley: from this much water (m³/s) up; thinner ones lie inside one. Double-click: the planet\'s own measure for the valley size">Rivers <input type="range" data-k="river" min="0" max="100" step="1" value="35"><output></output></label>'
        + '<label>Border <input type="range" data-k="border" min="50" max="400" step="10" value="150"><output>150 km</output></label>'
        + '<label>Detail <select data-k="n"><option value="1024" selected>1024</option><option value="2048">2048</option></select></label>'
        + '<button data-open disabled>Open</button><button data-clear disabled>Clear</button></span>';
    document.body.append(bar);
    const $ = (s) => bar.querySelector(s), onBtn = $('[data-on]'), more = $('.region-more'), border = $('[data-k="border"]'), detail = $('[data-k="n"]'), size = $('[data-k="size"]');
    const openBtn = $('[data-open]'), clearBtn = $('[data-clear]'), river = $('[data-k="river"]'), C = regionChosen;
    let on = false, open = null, note = '', riverQ = 0;                    // (riverQ 0: the planet's own measure)
    // (the slider's 0…100 on a log scale of water: 40 m³/s, the thinnest river drawn, to 40,000, only the greatest)
    const qOf = (t) => 40 * 1000 ** (t / 100), tOf = (q) => Math.round(100 * Math.log(q / 40) / Math.log(1000));

    /** The partition for this world, size and wall (a new planet, size or wall: the choice starts again). */
    function valleys(w) {
        if (!w?.fin?.drain) return null;
        if (C.world !== w || C.size !== +size.value || C.riverQ !== riverQ) {
            const V = valleysOf(w, +size.value, riverQ);
            Object.assign(C, { unit: V.unit, cells: V.cells, hover: -1, world: w, size: +size.value, riverQ, wallQ: V.riverQ });
            C.ids.clear();
        }
        return C;
    }
    function refresh() {
        const w = hooks.world(), V = valleys(w), n = C.ids.size;
        $('[data-n]').textContent = note || (!w?.fin ? 'Wait for the planet to finish' : n ? `${n} valle${n > 1 ? 'ys' : 'y'}` : 'Click valleys on the planet');
        note = '';
        border.nextElementSibling.textContent = `${border.value} km`;
        if (V) {
            if (!riverQ) river.value = String(tOf(V.wallQ));
            river.nextElementSibling.textContent = `${Math.round(V.wallQ).toLocaleString('en')} m³/s${riverQ ? '' : ' (auto)'}`;
        }
        const F = n && V ? frameOf(w) : null;
        openBtn.disabled = !F || !!open;
        openBtn.textContent = F ? `Open ${Math.round(F.km)} km · ${Math.round(F.cellKm * 1000)} m` : 'Open';
        clearBtn.disabled = !n;
    }
    function setOn(v) {
        on = v; onBtn.setAttribute('aria-pressed', String(on)); more.hidden = !on;
        if (!on && C.hover >= 0) C.hover = -1;
        // (the terrain brushes would take the click: back to Look)
        if (on) document.querySelector('.terrain-tools:not(.region-pick) [data-tool="look"]')?.click();
        refresh();
    }
    onBtn.addEventListener('click', () => setOn(!on));
    document.addEventListener('click', (e) => { if (on && e.target.closest('.terrain-tools:not(.region-pick) [data-tool]:not([data-tool="look"])')) setOn(false); });
    border.addEventListener('input', refresh);
    detail.addEventListener('change', refresh);
    size.addEventListener('change', refresh);
    // (the label follows the drag; the valleys are cut again, ~0.1 s, once it is let go)
    river.addEventListener('input', () => { river.nextElementSibling.textContent = `${Math.round(qOf(+river.value)).toLocaleString('en')} m³/s`; });
    river.addEventListener('change', () => { riverQ = Math.round(qOf(+river.value)); refresh(); });
    river.addEventListener('dblclick', () => { riverQ = 0; refresh(); });
    clearBtn.addEventListener('click', () => { C.ids.clear(); refresh(); });
    openBtn.addEventListener('click', () => build(hooks.world()));
    bar.addEventListener('pointerenter', () => { if (on) refresh(); });       // (the planet may have finished since)

    // the valley under the pointer; a click on the planet (a drag still turns it) takes it in or out
    const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === pv.globe?.controls?.domElement;
    const unitUnder = (e, w) => { const p = pv.placeUnder(e); return p ? C.unit[pv.cellUnder(w.tMesh, p)] : -2; };
    let down = null;
    addEventListener('pointermove', (e) => {
        const w = hooks.world();
        if (!on || down || !valleys(w)) return;
        const u = onPlanet(e.target) ? unitUnder(e, w) : -1;
        C.hover = Math.max(-1, u);                                          // (region-overlay.js sends it on)
    }, true);
    addEventListener('pointerdown', (e) => { down = on && e.button === 0 && !e.ctrlKey && !e.metaKey && onPlanet(e.target) ? { x: e.clientX, y: e.clientY } : null; }, true);
    addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6, w = hooks.world();
        down = null;
        if (moved) return;
        if (!valleys(w)) { refresh(); return; }
        const u = unitUnder(e, w);
        if (u === -2) return;
        if (u === -1) note = 'That is sea: choose land';
        else if (C.ids.has(u)) C.ids.delete(u); else C.ids.add(u);
        refresh();
    }, true);

    /** The box: centred on the chosen valleys, as wide as they reach from there plus the border each side. */
    function frameOf(w) {
        const { xyz } = w.tMesh, cells = [];
        let sx = 0, sy = 0, sz = 0;
        for (const id of C.ids) for (const r of C.cells.get(id) ?? []) { cells.push(r); sx += xyz[3 * r]; sy += xyz[3 * r + 1]; sz += xyz[3 * r + 2]; }
        const len = Math.hypot(sx, sy, sz);
        if (!cells.length || len < 1e-9) return null;
        const F0 = regionFrame(Math.asin(sz / len) / D, Math.atan2(sy, sx) / D, 1, 1), q = [0, 0];
        let reach = 0;
        for (const r of cells) {
            const z = Math.max(-1, Math.min(1, xyz[3 * r + 2]));
            xyOf(F0, Math.asin(z) / D, Math.atan2(xyz[3 * r + 1], xyz[3 * r]) / D, q);
            reach = Math.max(reach, Math.abs(q[0]), Math.abs(q[1]));
        }
        const km = Math.min(KM_MAX, Math.max(KM_MIN, 2 * (reach + +border.value)));
        return regionFrame(F0.lat, F0.lon, km, +detail.value);
    }

    function build(w) {
        const F = w?.fin && valleys(w) && frameOf(w);
        if (!F || open) return;
        const mask = maskOf(w, F, +border.value), crop = cropPlanet(w.fin, F);
        const seed = [...String(w.seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) ^ 0x52e6;
        const worker = new Worker(new URL('../v2/js/region/region-worker.js', import.meta.url), { type: 'module' });
        const win = regionWindow(`Region · ${Math.round(F.km)} km across · ${Math.round(F.cellKm * 1000)} m a cell`, () => { worker.terminate(); open = null; refresh(); });
        open = win; refresh();
        win.stage('Cutting the region from the planet');
        worker.onmessage = ({ data }) => {
            if (data.done) { worker.terminate(); console.info(`[region] built ${F.n}² in ${data.done.ms} ms (the planet drawn again: ${data.done.msGen} ms)`); win.show(data.done, mask); }
            else win.stage(data.stage, data.f);
        };
        worker.onerror = (e) => { win.stage(`The region failed: ${e.message}`); console.error(e); };
        // (the planet's generator, drawn again at the region's detail: region-synth.js)
        const J = w.finishJob, synth = J?.frame ? { job: { frame: J.frame, simMesh: J.simMesh, seed: J.seed, terrain: J.terrain, relief: J.relief, frontKm: J.frontKm }, planetEdgeKm: w.tMesh.edgeKm } : null;
        worker.postMessage({ frame: F, crop, seed, synth }, cropBuffers(crop));
    }
    refresh();
}

/**
 * Which part of the box each place is in, on a grid a quarter of the region's: 2 in a chosen valley, 1 within the
 * border of one, 0 beyond. { m, on, at(i, j), beyond(i, j) } with (i, j) the region's cells.
 */
function maskOf(w, F, borderKm) {
    const m = F.n >> 2, on = new Uint8Array(m * m), dist = new Float32Array(m * m), ll = [0, 0], { index } = w.tMesh, cell = F.km / m;
    const { unit, ids } = regionChosen;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        placeAt(F, (i + 0.5) * cell - F.km / 2, F.km / 2 - (j + 0.5) * cell, ll);
        const la = ll[0] * D, lo = ll[1] * D, cl = Math.cos(la);
        dist[j * m + i] = ids.has(unit[index.nearest(cl * Math.cos(lo), cl * Math.sin(lo), Math.sin(la))]) ? 0 : Infinity;
    }
    // (the distance to the nearest chosen place: a chamfer pass down and one back up, in cells)
    const S = Math.SQRT2;
    for (let pass = 0; pass < 2; pass++) {
        const down = pass === 0;
        for (let jj = 0; jj < m; jj++) for (let ii = 0; ii < m; ii++) {
            const j = down ? jj : m - 1 - jj, i = down ? ii : m - 1 - ii, c = j * m + i, s = down ? -1 : 1;
            let d = dist[c];
            const y = j + s;
            if (i + s >= 0 && i + s < m) d = Math.min(d, dist[c + s] + 1);
            if (y >= 0 && y < m) {
                d = Math.min(d, dist[y * m + i] + 1);
                if (i - 1 >= 0) d = Math.min(d, dist[y * m + i - 1] + S);
                if (i + 1 < m) d = Math.min(d, dist[y * m + i + 1] + S);
            }
            dist[c] = d;
        }
    }
    for (let c = 0; c < m * m; c++) on[c] = dist[c] === 0 ? 2 : dist[c] * cell <= borderKm ? 1 : 0;
    const k = m / F.n, ramp = 2 * F.cellKm;
    return {
        m, on,
        at: (i, j) => on[Math.min(m - 1, Math.floor(j * k)) * m + Math.min(m - 1, Math.floor(i * k))],
        /** How far past the border a cell is, eased over two cells (0 inside it, 1 beyond): the distance read smoothly. */
        beyond(i, j) {
            const x = Math.min(m - 1.001, Math.max(0, (i + 0.5) * k - 0.5)), y = Math.min(m - 1.001, Math.max(0, (j + 0.5) * k - 0.5)), a = Math.floor(x), b = Math.floor(y), tx = x - a, ty = y - b;
            const c = b * m + a, d = (dist[c] * (1 - tx) + dist[c + 1] * tx) * (1 - ty) + (dist[c + m] * (1 - tx) + dist[c + m + 1] * tx) * ty;
            return Math.min(1, Math.max(0, (d * cell - borderKm) / ramp));
        },
    };
}
