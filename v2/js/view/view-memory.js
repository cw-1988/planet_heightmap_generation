// The view strip's options remembered by the browser (docs/view-memory.md): Globe or Map, the map's centre, auto-rotate,
// the grid and its spacing, hillshade, clouds, rivers and lakes, by regime and the rivers' density — one set for the three
// pages, as the strip is theirs alike. The palette, the projection, Stars and the strip's fold keep their own keys
// (planet-view.js, view-strip.js, stage.js). A control added to the strip goes in OPTIONS, or it is forgotten on reload.

const KEY = 'orogen.view';
const $ = id => document.getElementById(id);

/** Each control: its id, the view's field it drives (none: read off the control live), and its kind. */
const OPTIONS = [
    { id: 'viewMode', field: 'mode', kind: 'choice' },
    { id: 'sMapCenterLon', field: 'centerLon', kind: 'range' },
    { id: 'chkRotate', kind: 'check' },
    { id: 'chkGrid', field: 'grid', kind: 'check' },
    { id: 'gridSpacing', field: 'gridStep', kind: 'choice', num: true },
    { id: 'chkShade', field: 'shaded', kind: 'check' },
    { id: 'chkClouds', field: 'clouds', kind: 'check' },
    { id: 'chkWater', field: 'water', kind: 'check' },
    { id: 'chkRegime', field: 'byRegime', kind: 'check' },
    { id: 'riverDensity', field: 'riverQ', kind: 'choice', num: true },
];

function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

/** A stored value as the control takes it, or undefined where it no longer fits (an option gone, a range changed). */
function fit(el, o, v) {
    if (o.kind === 'check') return typeof v === 'boolean' ? v : undefined;
    if (o.kind === 'range') {
        const n = Number(v);
        return Number.isFinite(n) && n >= Number(el.min) && n <= Number(el.max) ? n : undefined;
    }
    return [...el.options].some(opt => opt.value === String(v)) ? String(v) : undefined;
}

/**
 * Before the page wires the strip: the remembered options set on the controls and on `view`, and each change saved from
 * then on. The controls' own listeners do the rest; Map is shown by `showRestoredMode` once the strip is wired.
 */
export function restoreViewOptions(view) {
    const stored = load();
    for (const o of OPTIONS) {
        const el = $(o.id);
        if (!el) continue;
        const v = fit(el, o, stored[o.id]);
        if (v !== undefined) {
            if (o.kind === 'check') el.checked = v; else el.value = String(v);
            if (o.field) view[o.field] = o.num ? Number(v) : v;
        }
        el.addEventListener(o.kind === 'range' ? 'input' : 'change', () => {
            const now = load();
            now[o.id] = o.kind === 'check' ? el.checked : el.value;
            try { localStorage.setItem(KEY, JSON.stringify(now)); } catch { /* (remembered only where the browser allows) */ }
        });
    }
    // (what the controls' listeners would have set: the centre's numeral, the grid's spacing shown only with the grid)
    if ($('vMapCenterLon')) $('vMapCenterLon').textContent = `${view.centerLon}°`;
    if ($('gridSpacingGroup')) $('gridSpacingGroup').hidden = !view.grid;
}

/** Once the strip is wired: a remembered Map shown, as its button would (the map's frame, the strip's buttons). */
export function showRestoredMode() {
    const mode = $('viewMode');
    if (mode && mode.value !== 'globe') mode.dispatchEvent(new Event('change', { bubbles: true }));
}
