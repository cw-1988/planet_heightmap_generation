// The view's scale and a place to quote (owner: "add a zoom level / km bar … and a keybind that copies the mouse
// pointer's location, so I can paste it here"): a scale bar at the open area's lower left — a round number of km, and
// what one screen pixel spans at the view's centre — and the C key, which copies the place under the pointer, the scale
// and the page's address, to paste into a report of what is seen where.

import { openLeft } from '../../../js/open-area.js';

const R_KM = 6371;
const NICE = [1, 2, 5];

/** The great-circle distance between two places [lat, lon] in degrees, in km. */
function kmBetween([la1, lo1], [la2, lo2]) {
    const r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The longest round length (1, 2 or 5 × 10ⁿ km) no wider than `maxKm`. */
function niceKm(maxKm) {
    const p = 10 ** Math.floor(Math.log10(maxKm));
    let best = p;
    for (const n of NICE) if (n * p <= maxKm) best = n * p;
    return best;
}

const fmtKm = km => km >= 10 ? `${Math.round(km).toLocaleString()} km` : km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
const fmtPlace = ([lat, lon]) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

/**
 * Show the scale bar and wire the C key on a planet view `pv` (view/planet-view.js: its placeUnder(e) → [u, v] or null,
 * its view's mode, its globe canvas and map).
 */
export function installViewScale(pv) {
    const box = document.createElement('div'), bar = document.createElement('div'), text = document.createElement('div');
    box.id = 'viewScale';
    box.style.cssText = 'position:fixed; bottom:16px; left:calc(var(--open-left, 0px) + 16px); z-index:20; pointer-events:none;'
        + 'padding:6px 10px; border-radius:var(--radius-lg); background:var(--surface); border:var(--line-hair) solid var(--rule);'
        + 'box-shadow:var(--shadow-card); font:500 12px/1.3 var(--font-ui); color:var(--body);';
    bar.style.cssText = 'height:6px; border:2px solid var(--body); border-top:none; margin-bottom:4px; width:100px;';
    box.append(bar, text);
    document.body.append(box);

    const placeAt = (x, y) => { const p = pv.placeUnder({ clientX: x, clientY: y }); return p ? [90 - p[1] * 180, p[0] * 360 - 180] : null; };
    /** km a CSS pixel spans at a point of the view, or null off the planet. */
    const kmPerPx = (x, y) => { const a = placeAt(x - 10, y), b = placeAt(x + 10, y); return a && b ? kmBetween(a, b) / 20 : null; };
    const viewEl = () => pv.view.mode === 'map' ? pv.ui.map : pv.ui.canvas;
    let last = '', pointer = null;

    const tick = () => {
        requestAnimationFrame(tick);
        const r = viewEl().getBoundingClientRect();
        const left = openLeft(), k = r.width ? kmPerPx((Math.max(r.left, left) + r.right) / 2, r.top + r.height / 2) : null;
        const key = k ? k.toPrecision(3) : '';
        if (key === last) return;
        last = key; box.style.display = k ? 'block' : 'none';
        if (!k) return;
        const km = niceKm(140 * k);
        bar.style.width = `${Math.round(km / k)}px`;
        text.textContent = `${fmtKm(km)} · 1 px ≈ ${fmtKm(k)}`;
    };
    requestAnimationFrame(tick);

    for (const el of [pv.ui.canvas, pv.ui.map]) {
        el.addEventListener('pointermove', e => { pointer = [e.clientX, e.clientY]; });
        el.addEventListener('pointerleave', () => { pointer = null; });
    }
    addEventListener('keydown', e => {
        if (e.key !== 'c' && e.key !== 'C' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
        const at = pointer && placeAt(...pointer);
        if (!at) return;
        const k = kmPerPx(...pointer);
        const line = `${fmtPlace(at)} · 1 px ≈ ${k ? fmtKm(k) : '?'} · ${pv.view.mode} · ${pv.view.layer} · ${location.href}`;
        navigator.clipboard?.writeText(line).then(() => {
            const was = text.textContent;
            text.textContent = 'Copied place';
            setTimeout(() => { if (text.textContent === 'Copied place') { text.textContent = was; last = ''; } }, 1200);
        }, () => {});
    });
}
