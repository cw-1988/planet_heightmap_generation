// Region pick (fork addition): choose pieces on the planet and open them as a region. Region on: a click on the planet
// (not a drag) takes a piece in or out; the chosen ones are tinted. The region's box is the pieces' extent with the
// Border round it (the land around them, simulated too, for what lies at their edges: passes, rivers coming in, the
// neighbours); what lies in the box beyond the border shows greyed. Open builds it in a worker
// (v2/js/region/region-worker.js) and shows it flat (region-view.js).
import { regionFrame, placeAt, xyOf, cropPlanet, cropBuffers } from '../v2/js/region/region-frame.js';
import { regionWindow } from '../v2/js/region/region-view.js';

/** The pieces chosen (ids), for the planet's tint (generate-plates.js drawPlateLines). */
export const chosenPieces = new Set();
const D = Math.PI / 180, KM_MIN = 200, KM_MAX = 6000;

/** The bar and its clicks. Hooks: world() the world shown, changed() the planet drawn again. */
export function mountRegionPick(pv, hooks) {
    const bar = document.createElement('div');
    bar.className = 'terrain-tools region-pick';
    bar.innerHTML = '<button data-on aria-pressed="false" title="Choose pieces on the planet and open them as a region">Region</button>'
        + '<span class="region-more" hidden><span data-n></span>'
        + '<label>Border <input type="range" data-k="border" min="50" max="400" step="10" value="150"><output>150 km</output></label>'
        + '<label>Detail <select data-k="n"><option value="1024" selected>1024</option><option value="2048">2048</option></select></label>'
        + '<button data-open disabled>Open</button><button data-clear disabled>Clear</button></span>';
    document.body.append(bar);
    const $ = (s) => bar.querySelector(s), onBtn = $('[data-on]'), more = $('.region-more'), border = $('[data-k="border"]'), detail = $('[data-k="n"]');
    const openBtn = $('[data-open]'), clearBtn = $('[data-clear]');
    let on = false, open = null;

    function refresh() {
        const w = hooks.world(), n = chosenPieces.size;
        $('[data-n]').textContent = n ? `${n} piece${n > 1 ? 's' : ''}` : 'Click pieces on the planet';
        border.nextElementSibling.textContent = `${border.value} km`;
        const F = n && w ? frameOf(w) : null;
        openBtn.disabled = !F || !w.fin || !!open;
        openBtn.textContent = F ? `Open ${Math.round(F.km)} km · ${Math.round(F.cellKm * 1000)} m` : 'Open';
        openBtn.title = w && !w.fin ? 'Wait for the planet to finish' : '';
        clearBtn.disabled = !n;
        hooks.changed();
    }
    function setOn(v) {
        on = v; onBtn.setAttribute('aria-pressed', String(on)); more.hidden = !on;
        // (the terrain brushes would take the click: back to Look)
        if (on) document.querySelector('.terrain-tools:not(.region-pick) [data-tool="look"]')?.click();
        refresh();
    }
    onBtn.addEventListener('click', () => setOn(!on));
    document.addEventListener('click', (e) => { if (on && e.target.closest('.terrain-tools:not(.region-pick) [data-tool]:not([data-tool="look"])')) setOn(false); });
    border.addEventListener('input', refresh);
    detail.addEventListener('change', refresh);
    clearBtn.addEventListener('click', () => { chosenPieces.clear(); refresh(); });
    openBtn.addEventListener('click', () => build(hooks.world()));
    bar.addEventListener('pointerenter', () => { if (on) refresh(); });       // (the planet may have finished since)

    // a click on the planet (a drag still turns it): the piece under it in or out
    const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === pv.globe?.controls?.domElement;
    let down = null;
    addEventListener('pointerdown', (e) => { down = on && e.button === 0 && !e.ctrlKey && !e.metaKey && onPlanet(e.target) ? { x: e.clientX, y: e.clientY } : null; }, true);
    addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6, w = hooks.world();
        down = null;
        const p = !moved && w ? pv.placeUnder(e) : null;
        if (!p) return;
        const id = w.r_plate[pv.cellUnder(w.tMesh, p)];
        // (a region is land: a sea piece is raised first — Ctrl-click and Rebuild — then chosen)
        if (w.plateIsOcean.has(id) && !chosenPieces.has(id)) { $('[data-n]').textContent = 'That piece is sea: choose land'; return; }
        if (chosenPieces.has(id)) chosenPieces.delete(id); else chosenPieces.add(id);
        refresh();
    }, true);

    /** The box: centred on the chosen pieces, as wide as they reach from there plus the border each side. */
    function frameOf(w) {
        for (const id of chosenPieces) if (w.plateIsOcean.has(id)) chosenPieces.delete(id);     // (sunk since it was chosen)
        const { xyz } = w.tMesh, rp = w.r_plate, cells = [];
        let sx = 0, sy = 0, sz = 0;
        for (let r = 0; r < rp.length; r++) if (chosenPieces.has(rp[r])) { cells.push(r); sx += xyz[3 * r]; sy += xyz[3 * r + 1]; sz += xyz[3 * r + 2]; }
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
        const F = w?.fin && frameOf(w);
        if (!F || open) return;
        const mask = maskOf(w, F, +border.value), crop = cropPlanet(w.fin, F);
        const seed = [...String(w.seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) ^ 0x52e6;
        const worker = new Worker(new URL('../v2/js/region/region-worker.js', import.meta.url), { type: 'module' });
        const win = regionWindow(`Region · ${Math.round(F.km)} km across · ${Math.round(F.cellKm * 1000)} m a cell`, () => { worker.terminate(); open = null; refresh(); });
        open = win; refresh();
        win.stage('Cutting the region from the planet');
        worker.onmessage = ({ data }) => {
            if (data.done) { worker.terminate(); console.info(`[region] built ${F.n}² in ${data.done.ms} ms`); win.show(data.done, mask); }
            else win.stage(data.stage, data.f);
        };
        worker.onerror = (e) => { win.stage(`The region failed: ${e.message}`); console.error(e); };
        worker.postMessage({ frame: F, crop, seed }, cropBuffers(crop));
    }
    refresh();
}

/**
 * Which part of the box each place is in, on a grid a quarter of the region's: 2 in a chosen piece, 1 within the border
 * of one, 0 beyond. { m, on, at(i, j) } with (i, j) the region's cells.
 */
function maskOf(w, F, borderKm) {
    const m = F.n >> 2, on = new Uint8Array(m * m), dist = new Float32Array(m * m), ll = [0, 0], { index } = w.tMesh, cell = F.km / m;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        placeAt(F, (i + 0.5) * cell - F.km / 2, F.km / 2 - (j + 0.5) * cell, ll);
        const la = ll[0] * D, lo = ll[1] * D, cl = Math.cos(la);
        const inside = chosenPieces.has(w.r_plate[index.nearest(cl * Math.cos(lo), cl * Math.sin(lo), Math.sin(la))]);
        dist[j * m + i] = inside ? 0 : Infinity;
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
