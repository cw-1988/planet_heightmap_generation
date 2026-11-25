// Region pick (fork addition): choose valleys on the planet and open them as a region. The land is cut along its natural
// borders, divides, rivers and coasts (region-basin.js), at a chosen valley size. Region on: the valley under the
// pointer is lightened, and a click (not a drag) takes it in or out; the chosen ones are tinted. The region's box is
// their extent with the Border round it (the land around them, simulated too, for what lies at their edges: passes,
// rivers coming in, the neighbours); what lies in the box beyond the border shows greyed. Open builds it in a worker
// (v2/js/region/region-worker.js) and shows it flat (region-view.js).
import { regionFrame, xyOf, cropPlanet, cropBuffers } from '../v2/js/region/region-frame.js';
import { regionWindow } from '../v2/js/region/region-view.js';
import { regionMask } from './region-mask.js';
import { valleysOf } from './region-basin.js';
import { unitAt } from './region-bank.js';
import { valleyGrid, gridAt } from './region-grid.js';
import { editHeld } from './edit-key.js';

/** The valley at a point as the map shows it (region-grid.js); before the map is built, off the cells. */
function valleyAt(V, w, x, y, z, sea = null) {
    valleyGrid(w, V);
    return gridAt(V, x, y, z, sea) ?? unitAt(V, w.tMesh, w.tMesh.index.nearest(x, y, z), x, y, z);
}

/** The valleys chosen, for the planet's tint (region-overlay.js, drawn by the globe's shader): ids, the partition (unit
 *  per cell, cells per unit), the valley under the pointer (hover). */
export const regionChosen = { ids: new Set(), unit: null, cells: null, V: null, hover: -1, world: null, size: 0 };
const D = Math.PI / 180, KM_MIN = 200, KM_MAX = 6000;
// (km²; region-basin.js keeps a valley at least a dozen of the planet's cells, so its shape follows the land at any detail)
const SIZES = [['small', 30000], ['medium', 150000], ['large', 600000]];

/** The bar and its clicks. Hooks: world() the world shown; changed() after the valleys chosen change (the Empire view's
 *  focus). (The tint is region-overlay.js's, read off `regionChosen`.) Returns { setOn(v), isOn(), refresh() }. */
export function mountRegionPick(pv, hooks) {
    const bar = document.createElement('div');
    bar.className = 'terrain-tools region-pick';
    bar.innerHTML = '<button data-on aria-pressed="false" title="Choose valleys on the planet and open them as a region">Region</button>'
        + '<span class="region-more" hidden><span data-n></span>'
        + `<label>Valleys <select data-k="size">${SIZES.map(([k, v], i) => `<option value="${v}"${i === 1 ? ' selected' : ''}>${k}</option>`).join('')}</select></label>`
        + '<label>Border <input type="range" data-k="border" min="50" max="400" step="10" value="150"><output>150 km</output></label>'
        + '<label>Detail <select data-k="n"><option value="1024" selected>1024</option><option value="2048">2048</option></select></label>'
        + '<button data-open disabled>Open</button><button data-clear disabled>Clear</button></span>';
    document.body.append(bar);
    // (on a phone, just under the layer bar, however tall its rows wrap — the Terrain row would otherwise run under it;
    // on a desktop it keeps its place beside the tabs, styles.css)
    const layerBar = document.getElementById('layerBar');
    if (layerBar) {
        // (and the legend under it while it is open there: --region-pick-bottom, styles.css)
        const place = () => {
            const b = layerBar.getBoundingClientRect(); bar.style.top = innerWidth <= 768 && b.height ? `${Math.round(b.bottom) + 8}px` : '';
            document.documentElement.style.setProperty('--region-pick-bottom', `${Math.round(bar.getBoundingClientRect().bottom) + 8}px`);
        };
        const ro = new ResizeObserver(place);
        ro.observe(layerBar); ro.observe(bar);
        addEventListener('resize', place);
        place();
    }
    const $ =(s) => bar.querySelector(s), onBtn = $('[data-on]'), more = $('.region-more'), border = $('[data-k="border"]'), detail = $('[data-k="n"]'), size = $('[data-k="size"]');
    const openBtn = $('[data-open]'), clearBtn = $('[data-clear]'), C = regionChosen;
    let on = false, open = null, note = '';
    const changed = () => hooks.changed?.();

    /** The partition for this world and size (a new planet or size: the choice starts again). */
    function valleys(w) {
        if (!w?.fin?.drain) return null;
        if (C.world !== w || C.size !== +size.value) {
            const V = valleysOf(w, +size.value);
            Object.assign(C, { unit: V.unit, cells: V.cells, V, hover: -1, world: w, size: +size.value });
            const had = C.ids.size;
            C.ids.clear();
            if (had) changed();
        }
        return C;
    }
    function refresh() {
        const w = hooks.world(), V = valleys(w), n = C.ids.size;
        $('[data-n]').textContent = note || (!w?.fin ? 'Wait for the planet to finish' : n ? `${n} valle${n > 1 ? 'ys' : 'y'}` : 'Click valleys on the planet');
        note = '';
        border.nextElementSibling.textContent = `${border.value} km`;
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
    clearBtn.addEventListener('click', () => { C.ids.clear(); refresh(); changed(); });
    openBtn.addEventListener('click', () => build(hooks.world()));
    bar.addEventListener('pointerenter', () => { if (on) refresh(); });       // (the planet may have finished since)

    // the valley under the pointer; a click on the planet (a drag still turns it) takes it in or out
    const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === pv.globe?.controls?.domElement;
    // (the place's nearest cell and side of its river, as the tint has it: region-overlay.js)
    const unitUnder = (e, w) => {
        const p = pv.placeUnder(e);
        if (!p) return -2;
        const lon = p[0] * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - p[1] * Math.PI, x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
        const fine = pv.patchAt?.(w.fin, p[0], p[1]);                     // (the coast as the zoomed tiles draw it, where they are:
        return valleyAt(C.V, w, x, y, z, fine ? fine.seaShare ?? +!!fine.ocean : null);   // the sea's share filtered as the shader reads it)
    };
    let down = null;
    addEventListener('pointermove', (e) => {
        const w = hooks.world();
        if (!on || down || !valleys(w)) return;
        const u = onPlanet(e.target) ? unitUnder(e, w) : -1;
        C.hover = Math.max(-1, u);                                          // (region-overlay.js sends it on)
    }, true);
    addEventListener('pointerdown', (e) => { down = on && e.button === 0 && !editHeld(e) && onPlanet(e.target) ? { x: e.clientX, y: e.clientY } : null; }, true);
    addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6, w = hooks.world();
        down = null;
        if (moved) return;
        if (!valleys(w)) { refresh(); return; }
        const u = unitUnder(e, w);
        if (u === -2) return;
        if (u === -1) note = 'That is sea: choose land';
        else { if (C.ids.has(u)) C.ids.delete(u); else C.ids.add(u); changed(); }
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
        // (the terrain alone landed first — finish-landing.js: the region waits for its climate)
        if (w?.fin?.partial) { note = 'Wait for the climate to finish'; refresh(); return; }
        const F = w?.fin && valleys(w) && frameOf(w);
        if (!F || open) return;
        const crop = cropPlanet(w.fin, F), ids = new Set(C.ids), V = C.V, borderKm = +border.value;
        const seed = [...String(w.seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) ^ 0x52e6;
        const worker = new Worker(new URL('../v2/js/region/region-worker.js', import.meta.url), { type: 'module' });
        const win = regionWindow(`Region · ${Math.round(F.km)} km across · ${Math.round(F.cellKm * 1000)} m a cell`, () => { worker.terminate(); open = null; refresh(); });
        open = win; refresh();
        win.stage('Cutting the region from the planet');
        worker.onmessage = ({ data }) => {
            if (!data.done) { win.stage(data.stage, data.f); return; }
            worker.terminate(); console.info(`[region] built ${F.n}² in ${data.done.ms} ms (the planet drawn again: ${data.done.msGen} ms)`);
            win.show(data.done);
            // (the parts, read off the valleys' map against the region's own coast, once its sea is known: region-mask.js)
            const t = performance.now();
            regionMask(data.done, (x, y, z, sea) => valleyAt(V, w, x, y, z, sea), ids, borderKm).then((m) => {
                console.info(`[region] parts read in ${Math.round(performance.now() - t)} ms`); win.mask(m);
            });
        };
        worker.onerror = (e) => { win.stage(`The region failed: ${e.message}`); console.error(e); };
        // (the planet's generator, drawn again at the region's detail: region-synth.js)
        const J = w.finishJob, synth = J?.frame ? { job: { frame: J.frame, simMesh: J.simMesh, seed: J.seed, terrain: J.terrain, relief: J.relief, frontKm: J.frontKm }, planetEdgeKm: w.tMesh.edgeKm } : null;
        worker.postMessage({ frame: F, crop, seed, synth }, cropBuffers(crop));
    }
    refresh();
    return { setOn: (v) => { if (v !== on) setOn(v); }, isOn: () => on, refresh };
}
