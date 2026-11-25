// The layer shown, remembered by the browser (docs/view-memory.md): the layer, each group's view last shown (Climate,
// Geology, Food, Civilizations), the season, the deposits', the age's and its resource's picks — one set for the three pages, as the
// bar is theirs alike. The owner, 2026-11-20: "i also want selection like the satellite view etc to survive a reload".
// A layer a page does not have (its tab left out) is not restored there.

import { validDepositPick } from './layer-bar.js';

const KEY = 'orogen.layer';
const $ = id => document.getElementById(id);

/** Whether the page offers a layer: a tab, a More… map or the phone's list holds it. */
const offered = layer => typeof layer === 'string' && /^\w+$/.test(layer) &&
    !!document.querySelector(`#layerBar [data-layer="${layer}"], #layerBar option[value="${layer}"], #mobileViewSwitch option[value="${layer}"]`);
const hasOption = (id, v) => !!$(id) && [...$(id).options].some(o => o.value === String(v));

/** The bar's layer and picks saved (LayerBar's, on each change). */
export function saveLayer(bar) {
    const v = bar.view;
    try { localStorage.setItem(KEY, JSON.stringify({ layer: v.layer, last: bar.last, season: v.season, deposit: v.deposit, age: v.age, ageRes: v.ageRes })); }
    catch { /* (remembered only where the browser allows) */ }
}

/** What was saved: read when the bar is made, before the page's own start can set a layer (and save it over this). */
export function loadLayer() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch { return null; }
}

/** Once the page is wired: the picks `s` (loadLayer's) set on the view and their menus, then the layer shown as its tab
 *  would show it. */
export function restoreLayer(bar, s) {
    if (!s) return;
    const v = bar.view;
    // (a group's pick only if it is still that group's: City size, saved as Food's before it got its own tab, is not)
    for (const g of Object.keys(bar.last)) if (offered(s.last?.[g]) && bar.groupOf(s.last[g]) === g) bar.last[g] = s.last[g];
    if (hasOption('season', s.season)) $('season').value = v.season = s.season;
    if (validDepositPick(s.deposit)) bar.setDeposit(s.deposit, false);
    if (hasOption('agePick', s.age)) { $('agePick').value = v.age = s.age; v.ageRes = 'all'; bar.fillAgeRes(); }
    if (hasOption('ageRes', s.ageRes)) $('ageRes').value = v.ageRes = s.ageRes;
    if (offered(s.layer) && s.layer !== v.layer) bar.setLayer(s.layer);
}
