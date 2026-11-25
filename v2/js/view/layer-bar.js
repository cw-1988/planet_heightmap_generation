// The layer bar over the planet — one for every page that shows a finished planet (plans/SHARED_CORE_PLAN.md U2; its
// design: plans/VIEW_UI_PLAN.md): the view strip (globe or map, projection, grid, colours, hillshade, clouds, rivers and
// lakes), the layer tabs (Terrain · Satellite · Climate · Geology · Food · Civilizations · Heightmap · Plates), each group's
// own row (the climate's maps and More…, the season; the geology's views and their pickers — the deposits, the age and its
// resource; the food's views; the civilizations' views and City size's reach), the chip over the planet, the phone's one list, and the legend's card. Its markup is made here, once,
// for each page; the deposits' and the ages' menus from their lists (geology/deposits.js, geology/ages.js), so a new kind
// shows on every page. The page says what differs: how its detailed layers come, and the Plates tab's title.

import { DEPOSITS, METALS } from '../geology/deposits.js';
import { AGES } from '../geology/ages.js';
import { CLIMATE_LAYERS, SEASONAL_LAYERS, FINISHED_ONLY_LAYERS } from '../evolution/climate-view.js';
import { GEOLOGY_LAYERS } from '../evolution/geology-view.js';
import { FARMING_LAYERS, farmOptions } from '../evolution/farming-view.js';
import { CITY_REACH, reachText } from '../evolution/city-view.js';
import { saveLayer, loadLayer, restoreLayer } from './layer-memory.js';
import { REGIME_STYLE } from '../evolution/river-draw.js';
// (the By regime tip: one line per colour, its name in that colour — js/tip-text.js)
const REGIME_TIP = ['permanent', "permanent with a yearly flood season (the Nile's, from rains far upstream; a snowmelt flood)",
    'seasonal, dry some months', 'dry most of the year'];

/** Every climate layer but Satellite, which comes with detail: the main five as tabs, the rest under More. */
export const CLIMATE_SUB = new Set([...CLIMATE_LAYERS].filter(l => !FINISHED_ONLY_LAYERS.has(l)));
/** The Civilizations tab's views (the owner, 2026-11-20: City size moved there from Food) — drawn from the food's
 *  pictures, so still farming layers to the painter; the Food tab's are the rest. */
export const CIV_LAYERS = new Set(['farmCity', 'farmEmpire', 'farmStates']);
const FOOD_TAB = new Set([...FARMING_LAYERS].filter(l => !CIV_LAYERS.has(l)));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const opt = (value, label, selected = false) => `<option value="${value}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const CLIMATE_MORE = [['Atmosphere', [['pressure', 'Pressure']]], ['Ocean', [['upwelling', 'Upwelling'], ['ice', 'Ice']]],
    ['Land', [['tempRange', 'Temperature range'], ['rainShadow', 'Rain shadow'], ['aridity', 'Aridity'], ['growing', 'Growing season'], ['rainSeason', 'Rain seasonality']]]];
const DEPOSIT_KINDS = [['metal', 'From the history'], ['mineral', 'Climate and rivers'], ['fuel', 'Fuel'], ['stone', 'Stone'], ['gem', 'Gems'], ['building', 'Building stone, sand and gravel']];

/** The Deposits view's checklist, in groups — each metal or fuel, each kind of deposit by how it formed — from their
 *  lists: [key, name, [[value, name]…]]. Its picks: "all" (the metals and minerals), or the values ticked joined by
 *  commas (one alone as the old menu had it). */
const DEPOSIT_GROUPS = [
    ['metals', 'Metals and minerals', METALS.filter(m => m.group === 'metal').map(m => [`m.${m.id}`, m.name])],
    ['fuels', 'Fuel', METALS.filter(m => m.group === 'fuel').map(m => [`m.${m.id}`, m.name])],
    ...DEPOSIT_KINDS.map(([g, words]) => [`kind.${g}`, words, DEPOSITS.filter(d => d.group === g).map(d => [d.id, d.name])])];
const DEPOSIT_VALUES = DEPOSIT_GROUPS.flatMap(([, , list]) => list.map(([v]) => v));
const DEPOSIT_NAME = new Map(DEPOSIT_GROUPS.flatMap(([, , list]) => list));
const ALL_METAL_VALUES = DEPOSIT_GROUPS[0][2].map(([v]) => v);
/** A Deposits pick as the values it ticks. */
const depositTicks = pick => (pick === 'all' ? ALL_METAL_VALUES : String(pick ?? '').split(',').filter(v => DEPOSIT_NAME.has(v)));
/** Whether a saved pick still names deposits this page offers ("all", nothing, or known values). */
export const validDepositPick = pick => pick === 'all' || pick === '' || (typeof pick === 'string' && pick.split(',').every(v => DEPOSIT_NAME.has(v)));
/** The checklist's button's words for a pick: All, nothing, one by name, whole groups by theirs, else how many. */
function depositSummary(pick) {
    if (pick === 'all') return 'All metals and minerals';
    const t = new Set(depositTicks(pick));
    if (!t.size) return 'Nothing picked';
    if (t.size === 1) return DEPOSIT_NAME.get([...t][0]);
    const whole = DEPOSIT_GROUPS.filter(([, , list]) => list.every(([v]) => t.has(v)));
    if (whole.reduce((n, [, , list]) => n + list.length, 0) === t.size && whole.length <= 2) return whole.map(([, name]) => name).join(' + ');
    return `${t.size} picked`;
}

/** The Deposits view's checklist: a button with what is picked, and under it the groups, each with a box for all of it. */
function depositChecklist() {
    const box = (v, name, on) => `<label class="dep-pick-item"><input type="checkbox" value="${esc(v)}"${on ? ' checked' : ''}><span>${esc(name)}</span></label>`;
    const group = ([key, name, list], k) => `${k === 2 ? '<div class="dep-pick-sub">By kind of deposit, by how it formed</div>' : ''}<fieldset class="dep-pick-group" data-dep-group="${key}">
        <legend><label class="dep-pick-item dep-pick-head"><input type="checkbox" data-dep-all-of="${key}"${k === 0 ? ' checked' : ''}><span>${esc(name)}</span></label></legend>
        <div class="dep-pick-list">${list.map(([v, n]) => box(v, n, k === 0)).join('')}</div></fieldset>`;
    return `<button type="button" id="depositPickBtn" class="dep-pick-btn" aria-haspopup="true" aria-expanded="false" aria-controls="depositMenu" title="Which deposits: all the metals and minerals together (each place its richest), or tick any metals, fuels and kinds of deposit (by how they formed): one alone, or several together, each place its richest">
            <span class="dep-pick-label">Deposits</span> <span id="depositPickText">All metals and minerals</span>
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div id="depositMenu" class="dep-pick-menu" role="group" aria-label="Which deposits" hidden>
            <div class="dep-pick-quick"><button type="button" data-dep-set="all">All metals and minerals</button><button type="button" data-dep-set="">Clear</button></div>
            ${DEPOSIT_GROUPS.map(group).join('')}
        </div>`;
}

/**
 * The bar's markup into the page: #layerBar (the view strip, the tabs, the rows, the chip), #mobileViewSwitch and
 * #legendCard. `o.comes`: how the detailed layers come (Evolution: "Comes with Add detail"); `o.platesTip`: the Plates tab's
 * title.
 */
export function mountLayerBar({ comes = 'Comes with Add detail', platesTip = '', without = [], empire = false } = {}) {
    const $ = id => document.getElementById(id);
    $('layerBar').innerHTML = `
        <div id="viewStrip" class="view-strip" role="toolbar" aria-label="View">
            <div class="vs-seg" role="group" aria-label="Globe or map"><button type="button" data-mode="globe">Globe</button><button type="button" data-mode="map">Map</button></div>
            <select id="viewMode" hidden aria-hidden="true" tabindex="-1">
                <option value="globe">Globe</option>
                <option value="map">Map</option>
            </select>
            <span class="vs-item" id="mapProjectionGroup" data-view="map" title="The map's shape: equirectangular (the plain 2 : 1 map), Mercator, Robinson, Equal Earth, Mollweide, Hammer, Winkel Tripel, the globe as two hemispheres, an azimuthal (polar) map, or Van der Grinten's world in a circle. Each has its own options; the export offers the same"><label for="mapProjection">Projection</label> <select id="mapProjection"></select><span id="mapProjOpts" class="xp-proj-opts" hidden></span></span>
            <label class="vs-item" id="mapCenterLonGroup" data-view="map">Centre <input type="range" id="sMapCenterLon" min="-180" max="180" value="0" step="5" aria-label="Centre longitude"><span class="v" id="vMapCenterLon">0&deg;</span></label>
            <label class="toggle-label" data-view="globe"><input type="checkbox" id="chkRotate"><span class="toggle-track"><span class="toggle-thumb"></span></span>Auto-rotate</label>
            <label class="toggle-label" data-view="globe" title="The globe in space, with stars, instead of on the page"><input type="checkbox" id="chkSpace"><span class="toggle-track"><span class="toggle-thumb"></span></span>Stars</label>
            <label class="toggle-label"><input type="checkbox" id="chkGrid" checked><span class="toggle-track"><span class="toggle-thumb"></span></span>Grid lines</label>
            <span class="vs-item" id="gridSpacingGroup"><select id="gridSpacing" aria-label="Grid spacing">
                <option value="30">30&deg;</option>
                <option value="15" selected>15&deg;</option>
                <option value="10">10&deg;</option>
                <option value="5">5&deg;</option>
                <option value="2.5">2.5&deg;</option>
            </select></span>
            <label class="toggle-label" id="statesOverlayRow" title="The States view's map over this one: each state's border in its colour and its regions' finer, the state's and its regions' names across their land, its capital's and towns' names beside them (the States view's knobs set them)"><input type="checkbox" id="chkStates"><span class="toggle-track"><span class="toggle-thumb"></span></span>States</label>
            <label class="toggle-label" id="statesRegionsRow" title="The states' regions: their finer borders, their names across their land, and the one under the pointer lit. Off, only the states show"><input type="checkbox" id="chkRegions"><span class="toggle-track"><span class="toggle-thumb"></span></span>Regions</label>
            <label class="vs-item" id="statesNamesGroup" title="How strongly the states' and regions' names painted on the land show, from none to full"><span>Names</span> <input type="range" id="sStatesNames" min="0" max="1" value="1" step="0.05" aria-label="Names opacity"><span class="v" id="vStatesNames">100%</span></label>
            <span class="vs-item" id="paletteGroup" title="How heights are coloured on the Terrain view"><label for="palette">Colours</label> <select id="palette">
            <optgroup label="Maps">
            <option value="relief" selected>Relief</option>
            <option value="topographic">Topographic</option>
            <option value="natural">Natural</option>
            <option value="swiss">Swiss</option>
            <option value="school">School atlas</option>
            <option value="etopo">ETOPO</option>
            <option value="dem">DEM</option>
            <option value="scientific">Scientific</option>
            <option value="satellite">Blue Marble (by height)</option>
            <option value="grey">Grey</option>
            <option value="antique">Antique</option>
            </optgroup>
            <optgroup label="Other worlds">
            <option value="arid">Arid</option>
            <option value="frozen">Frozen</option>
            <option value="lush">Lush</option>
            <option value="alien">Alien</option>
            <option value="volcanic">Volcanic</option>
            </optgroup>
            </select></span>
            <label class="toggle-label" title="Shade the planet by its relief, lit from the north-west. Off, every view is flat colour, the mountains shown by their colours alone and no sun glinting on the sea (a texture to light in a 3D program; the export has its own Hillshade switch)"><input type="checkbox" id="chkShade" checked><span class="toggle-track"><span class="toggle-thumb"></span></span>Hillshade</label>
            <label class="toggle-label" title="Clouds over the planet, from its climate — more where it rains, fewer under the dry highs — drifting slowly with the winds. On the Satellite view; the export has a Clouds layer and Satellite with clouds"><input type="checkbox" id="chkClouds" checked><span class="toggle-track"><span class="toggle-thumb"></span></span>Clouds</label>
            <span class="vs-item" id="waterGroup">
                <label class="toggle-label"><input type="checkbox" id="chkWater" checked><span class="toggle-track"><span class="toggle-thumb"></span></span>Rivers &amp; lakes</label>
                <span class="vs-item" id="riverDensityGroup" title="Which rivers are drawn, by how much water they carry: Few — 150 m³/s and more; Normal — 40 m³/s; Many — 8 m³/s. The bigger a river, the stronger its line; seasonal rivers are dashed, and those dry most of the year dotted"><select id="riverDensity">
                <option value="150">Few</option>
                <option value="40" selected>Normal</option>
                <option value="8">Many</option>
                </select></span>
                <label class="toggle-label" id="regimeRow"><input type="checkbox" id="chkRegime"><span class="toggle-track"><span class="toggle-thumb"></span></span>By regime <span class="tip" data-tip="Colour the rivers by their year — each month's rain and snowmelt, run down the rivers:
${REGIME_STYLE.map((s, k) => `{${s.rgb}}${['Blue', 'Violet', 'Cyan', 'Brown'][k]}: ${REGIME_TIP[k]}`).join('\n')}
Hover a river for its flood months">?</span></label>
            </span>
        </div>
        <div class="layer-row">
            <button type="button" id="viewFold" class="vs-fold" aria-controls="viewStrip" aria-expanded="false" aria-label="View options" title="View options: globe or map, projection, grid lines, colours, hillshade, rivers"><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="map-tabs" id="mapTabs">
                <button class="map-tab active" data-layer="terrain">Terrain</button>
                <button class="map-tab" data-layer="satellite" title="The planet as from space: each climate's colours climbing with the land to rock and snow, rivers and fresh lakes greening dry country, snow and ice from its climate, its clouds from its climate too (the Clouds toggle hides them), for the year, January or July. ${esc(comes)}">Satellite</button>
                <button class="map-tab" data-layer="climate" title="The moment's climate: Köppen zones, temperature, rain, winds and currents — and under More, pressure, upwelling, ice, aridity and more">Climate</button>
                <button class="map-tab" data-layer="geology" title="What the history left in the rock: its rocks, its ore, fuel and mineral deposits and what each technological age could reach. ${esc(comes)}">Geology</button>
                <button class="map-tab" data-layer="farming" title="What the land could feed, and how its people would live: farmland — soil × ground × growing season, by rain alone or with water brought by flood farming and canals, terraces and raised fields — each place's staple food, whether its people would farm, herd or gather, and how many it could feed. ${esc(comes)}. In beta">Food</button>
                <button class="map-tab" data-layer="civ" title="Where people could settle and how big their cities could grow: City size — the people the land within a reach could feed. ${esc(comes)}. In beta">Civilizations</button>
                <button class="map-tab" data-layer="heightmap">Heightmap</button>
                <button class="map-tab" data-layer="plates"${platesTip ? ` title="${esc(platesTip)}"` : ''}>Plates</button>
            </div>
        </div>
        <div id="subBar" class="layer-subbar" hidden>
            <div class="map-tabs" id="climateTabs">
                <button class="map-tab" data-layer="koppen">Köppen</button>
                <button class="map-tab" data-layer="temperature">Temperature</button>
                <button class="map-tab" data-layer="rain">Rain</button>
                <button class="map-tab" data-layer="wind">Wind</button>
                <button class="map-tab" data-layer="currents">Currents</button>
            </div>
            <select id="climateMore" aria-label="More climate layers" title="More climate layers: pressure, the sea, and what the land's twelve months say">
                <option value="">More…</option>
                ${CLIMATE_MORE.map(([g, list]) => `<optgroup label="${g}">${list.map(([v, l]) => opt(v, l)).join('')}</optgroup>`).join('')}
            </select>
            <div class="map-tabs" id="geologyTabs" hidden>
                <button class="map-tab" data-layer="geoRocks" title="What the land is made of at the surface: sediment and sedimentary rock, volcanic rock, granite, metamorphic rock and the ancient shields — from the history's rock record">Rocks</button>
                <button class="map-tab" data-layer="geoDeposits" title="Where the ores, fuels and minerals lie — each system from the history's arcs, belts, basins, plumes and cratons, and from the climate and the rivers: poor, moderate or rich">Deposits</button>
                <button class="map-tab" data-layer="geoAges" title="What a people of each technological age could reach — Stone, Copper, Bronze, Iron, Industrial — and fuel, gems and building stone: each one's resources, poor to rich, and where bronze or iron could be made">Ages</button>
            </div>
            <div id="depositPick" class="dep-pick" hidden>${depositChecklist()}</div>
            <select id="agePick" aria-label="Age" title="The technological age: what its people could reach — deeper and poorer ore as technology grows" hidden>${AGES.map(a => opt(a.id, a.name, a.id === 'bronze')).join('')}</select>
            <select id="ageRes" aria-label="Which resource" title="All of the age's resources (each place its richest), one alone, or where its metal could be made" hidden></select>
            <div class="map-tabs" id="farmingTabs" hidden>
                <button class="map-tab" data-layer="farmLand" title="What the land could grow: green by rain alone, teal where only water brought makes it farmable. The legend's chips switch the farming techniques on and off">Farmland</button>
                <button class="map-tab" data-layer="farmStaple" title="What each place would live on most — paddy grains, cool-season grains, warm-season grains, roots and tubers, livestock, fish or wild foods — paler where it feeds less well, striped where a second does nearly as well. The legend's chips show one alone">Staple food</button>
                <button class="map-tab" data-layer="farmLife" title="How each place's people would live — farming, herding or gathering (hunting, fishing and gathering: gatherers keep to their way unless farming or herding would feed ten times as many) — striped where a second does nearly as well. The legend's chips show how many each could feed, alone">Lifestyle</button>
                <button class="map-tab" data-layer="farmPeople" title="How many people the land could feed, pre-industrial, with the farming techniques chosen, each place by its way of life — a tenth to a few a km² where gatherers live, a few on herders' pasture and in the rainforests (their poor ground farmed in long fallows), over a hundred a km² on the richest river plains">People</button>
                <button class="map-tab" data-layer="farmSoil" title="How fertile the ground is: river silt and loess richest, then volcanic ash; black earth under grassland, leached red earth in the wet tropics, acid podzol under boreal forest">Soil</button>
                <button class="map-tab" data-layer="farmSeason" title="The months crops grow: warm enough and wet enough — by rain alone, or watered">Growing season</button>
                <span class="evo-beta">Beta</span>
            </div>
            <div class="map-tabs" id="civTabs" hidden>
                <button class="map-tab" data-layer="farmCity" title="How big a city each place could feed: the people the land within the reach could feed, summed — set the reach with its slider or Shift+scroll over the planet">City size</button>
                <button class="map-tab" data-layer="farmEmpire" title="Where to found cities: a heat map of the sites, weighing the food within reach, fresh water, trade and the ground, and the best spots ranked — click valleys on the planet to focus on a region">Empire</button>
                <button class="map-tab" data-layer="farmStates" title="States drawn for the whole planet as it is now: capitals at the best-fed sites, each holding the land cheapest to hold from it — mountains, marsh, desert and open sea dear — with the bottlenecks and contested riches between them; click to place or drop a capital">States</button>
                <span class="evo-beta">Beta</span>
            </div>
            <label id="cityReach" class="city-reach" title="The City size view's reach: how many days by cart its food may cost to bring — far further by river, lake or sea, as cheaper; Shift+scroll over the planet sets it too" hidden>Reach
                <input type="range" min="${CITY_REACH.min}" max="${CITY_REACH.max}" step="${CITY_REACH.step}" value="${farmOptions.reach}"><output>${reachText()}</output></label>
            <select id="season" aria-label="Season">
                <option value="year" selected>Year</option>
                <option value="jan">January</option>
                <option value="jul">July</option>
            </select>
        </div>
        <div id="climateChip" class="evo-chip" hidden><span id="climateChipText"></span><button id="climateChipBtn">Calculate</button></div>`;
    $('mobileViewSwitch').innerHTML = `
        <option value="terrain">Terrain</option>
        <option value="satellite">Satellite</option>
        <option value="heightmap">Heightmap</option>
        <option value="plates">Plates</option>
        <optgroup label="Climate">${[['koppen', 'Köppen'], ['temperature', 'Temperature'], ['rain', 'Rain'], ['wind', 'Wind'], ['currents', 'Currents']].map(([v, l]) => opt(v, l)).join('')}</optgroup>
        <optgroup id="mobileGeology" label="Geology">${[['geoRocks', 'Rocks'], ['geoDeposits', 'Deposits'], ['geoAges', 'Ages']].map(([v, l]) => opt(v, l)).join('')}</optgroup>
        <optgroup id="mobileFarming" label="Food">${[['farmLand', 'Farmland'], ['farmStaple', 'Staple food'], ['farmLife', 'Lifestyle'], ['farmPeople', 'People'], ['farmSoil', 'Soil'], ['farmSeason', 'Growing season']].map(([v, l]) => opt(v, l)).join('')}</optgroup>
        <optgroup id="mobileCiv" label="Civilizations">${opt('farmCity', 'City size')}${opt('farmEmpire', 'Empire')}${opt('farmStates', 'States')}</optgroup>
        <optgroup label="Climate: more">${CLIMATE_MORE.flatMap(([, list]) => list).map(([v, l]) => opt(v, l)).join('')}</optgroup>`;
    $('legendCard').innerHTML = '<div id="climateLegend" class="viz-legend"></div><div id="regimeLegend" class="evo-koppen evo-regime-legend" hidden></div>';
    // (the tabs say which is shown: aria-pressed, kept by LayerBar.setLayer)
    for (const b of document.querySelectorAll('#layerBar .map-tab')) { b.type = 'button'; b.setAttribute('aria-pressed', String(b.classList.contains('active'))); }
    // (the layers a page has nothing for — an imported heightmap has no plates and no history for its rocks: `without`)
    // (Empire focuses on valleys chosen with the Region pick, which only Generate has: `empire`)
    if (!empire) { $('statesOverlayRow')?.remove(); $('statesRegionsRow')?.remove(); $('statesNamesGroup')?.remove(); }
    if (!empire) for (const id of ['farmEmpire', 'farmStates']) { document.querySelector(`#civTabs [data-layer="${id}"]`)?.remove(); $('mobileViewSwitch').querySelector(`option[value="${id}"]`)?.remove(); }
    for (const id of without) {
        document.querySelector(`#mapTabs [data-layer="${id}"]`)?.remove();
        $('mobileViewSwitch').querySelector(`option[value="${id}"]`)?.remove();
        if (id === 'geology') $('mobileGeology')?.remove();
        // (the Civilizations views stand on the food's: a page without Food has none of them)
        if (id === 'farming') { $('mobileFarming')?.remove(); $('mobileCiv')?.remove(); document.querySelector('#mapTabs [data-layer="civ"]')?.remove(); }
    }
}

/**
 * The bar's wiring: a tab, a row's tab, a More… map or the phone's list sets the layer (each group opening on its view
 * last shown); the deposits', the age's and the resource's pickers (the legend's resource entries too) and the season set
 * the view's. `view`: the page's view state (layer, season, deposit, age, ageRes); `onLayer(layer)` after the layer is
 * set; `onPick()` after a picker changed what is drawn.
 */
export class LayerBar {
    constructor(view, { onLayer = () => {}, onPick = () => {} } = {}) {
        const $ = this.$ = id => document.getElementById(id);
        // (every pick remembered for the next load: view/layer-memory.js)
        const picked = onPick; this.stored = loadLayer();
        onPick = () => { saveLayer(this); picked(); };
        this.view = view; this.onLayer = onLayer; this.onPick = onPick;
        this.last = { climate: 'koppen', geology: 'geoRocks', farming: 'farmLand', civ: 'farmCity' };
        for (const b of document.querySelectorAll('#mapTabs .map-tab, #climateTabs .map-tab, #geologyTabs .map-tab, #farmingTabs .map-tab, #civTabs .map-tab')) b.addEventListener('click', () => this.setLayer(b.dataset.layer));
        $('mobileViewSwitch').addEventListener('change', e => this.setLayer(e.target.value));
        $('climateMore').addEventListener('change', e => { if (e.target.value) this.setLayer(e.target.value); });
        $('season').addEventListener('change', e => { view.season = e.target.value; onPick(); });
        // the Deposits view's checklist: open and shut by its button (outside it or Escape shuts it); each tick redraws
        const menu = $('depositMenu'), btn = $('depositPickBtn');
        const openMenu = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
        btn.addEventListener('click', () => openMenu(menu.hidden));
        document.addEventListener('pointerdown', e => { if (!menu.hidden && !$('depositPick').contains(e.target)) openMenu(false); });
        $('depositPick').addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { openMenu(false); btn.focus(); } });
        menu.addEventListener('change', e => {
            const all = e.target.dataset.depAllOf;
            if (all) for (const b of menu.querySelectorAll(`[data-dep-group="${all}"] .dep-pick-list input`)) b.checked = e.target.checked;
            const on = [...menu.querySelectorAll('.dep-pick-list input:checked')].map(b => b.value);
            // (exactly the metals and minerals: "All", drawn by family as ever)
            this.setDeposit(on.length === ALL_METAL_VALUES.length && ALL_METAL_VALUES.every(v => on.includes(v)) ? 'all' : on.join(','));
        });
        menu.addEventListener('click', e => { const b = e.target.closest('[data-dep-set]'); if (b) this.setDeposit(b.dataset.depSet); });
        // the Ages view: the age, then its resources (all, one alone, or its potential) — the legend's entries switch them too
        $('agePick').addEventListener('change', e => { view.age = e.target.value; view.ageRes = 'all'; this.fillAgeRes(); onPick(); });
        $('ageRes').addEventListener('change', e => { view.ageRes = e.target.value; onPick(); });
        // the City size view's reach: its number at once, the map a moment after the slider or the wheel stops
        const reach = $('cityReach').querySelector('input');
        let redraw = 0;
        reach.addEventListener('input', () => {
            farmOptions.reach = +reach.value; reach.nextElementSibling.textContent = reachText();
            clearTimeout(redraw); redraw = setTimeout(onPick, 120);
        });
        this.reach = reach;
        const pickAgeRes = el => { if (view.layer !== 'geoAges') return; view.ageRes = view.ageRes === el.dataset.ageRes ? 'all' : el.dataset.ageRes; $('ageRes').value = view.ageRes; onPick(); };
        $('climateLegend').addEventListener('click', e => { const el = e.target.closest('[data-age-res]'); if (el) pickAgeRes(el); });
        $('climateLegend').addEventListener('keydown', e => { const el = e.target.closest('[data-age-res]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickAgeRes(el); } });
        this.fillAgeRes();
        this.showDeposit();
    }

    /** The Deposits view's pick set — the checklist's boxes and button kept to it — and drawn (`draw` false: only shown). */
    setDeposit(pick, draw = true) {
        this.view.deposit = pick;
        this.showDeposit();
        if (draw) this.onPick();
    }

    /** The checklist's boxes, its groups' boxes (part-ticked where some are) and its button's words, from the view's pick. */
    showDeposit() {
        const $ = this.$, t = new Set(depositTicks(this.view.deposit));
        for (const b of $('depositMenu').querySelectorAll('.dep-pick-list input')) b.checked = t.has(b.value);
        for (const f of $('depositMenu').querySelectorAll('[data-dep-group]')) {
            const boxes = [...f.querySelectorAll('.dep-pick-list input')], n = boxes.filter(b => b.checked).length, head = f.querySelector('[data-dep-all-of]');
            head.checked = n === boxes.length; head.indeterminate = n > 0 && n < boxes.length;
        }
        $('depositPickText').textContent = depositSummary(this.view.deposit);
    }

    /** The resource menu for the age picked. */
    fillAgeRes() {
        const age = AGES.find(a => a.id === this.view.age), sel = this.$('ageRes');
        sel.innerHTML = '<option value="all">All its resources</option>' + age.resources.map(r => `<option value="${r.id}">${r.name}</option>`).join('') +
            (age.potential ? `<option value="potential">${age.potential.name} potential</option>` : '');
        sel.value = this.view.ageRes;
    }

    /** Which group's tab (a key of `last`) a view belongs to, or null. */
    groupOf(layer) {
        return CLIMATE_SUB.has(layer) ? 'climate' : GEOLOGY_LAYERS.has(layer) ? 'geology' : FOOD_TAB.has(layer) ? 'farming' : CIV_LAYERS.has(layer) ? 'civ' : null;
    }

    /** Show a layer ('climate', 'geology', 'farming' and 'civ': the group's view last shown): the tabs lit, the rows and
     *  pickers. */
    setLayer(layer) {
        const $ = this.$, last = this.last;
        if (Object.hasOwn(last, layer)) layer = last[layer];
        if (CLIMATE_SUB.has(layer)) last.climate = layer;
        const geo = GEOLOGY_LAYERS.has(layer), farm = FOOD_TAB.has(layer), civ = CIV_LAYERS.has(layer);
        if (geo) last.geology = layer;
        if (farm) last.farming = layer;
        if (civ) last.civ = layer;
        this.view.layer = layer;
        const press = (b, on) => { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); };
        for (const b of document.querySelectorAll('#mapTabs .map-tab')) press(b, b.dataset.layer === layer || (b.dataset.layer === 'climate' && CLIMATE_SUB.has(layer)) || (b.dataset.layer === 'geology' && geo) || (b.dataset.layer === 'farming' && farm) || (b.dataset.layer === 'civ' && civ));
        for (const b of document.querySelectorAll('#climateTabs .map-tab, #geologyTabs .map-tab, #farmingTabs .map-tab, #civTabs .map-tab')) press(b, b.dataset.layer === layer);
        const more = $('climateMore'), inMore = !!more.querySelector(`option[value="${layer}"]`);
        more.value = inMore ? layer : ''; more.classList.toggle('active', inMore);
        $('mobileViewSwitch').value = layer;
        this.showRows(layer);
        saveLayer(this);
        this.onLayer(layer);
    }

    /** The layer and picks last left (view/layer-memory.js), shown as their tab would: called once the page is wired. */
    restore() { const s = this.stored; this.stored = null; restoreLayer(this, s); }

    /** The rows under the tabs for a layer (setLayer's; again when a page adds its own row after the layer was set). */
    showRows(layer) {
        const $ = this.$, geo = GEOLOGY_LAYERS.has(layer), farm = FOOD_TAB.has(layer), civ = CIV_LAYERS.has(layer);
        // (a page's own row for a layer — Generate's edit tools under Terrain: an element in #subBar with data-for-layer)
        const own = [...document.querySelectorAll('#subBar [data-for-layer]')];
        for (const r of own) r.hidden = r.dataset.forLayer !== layer;
        $('subBar').hidden = !CLIMATE_SUB.has(layer) && !SEASONAL_LAYERS.has(layer) && !geo && !farm && !civ && own.every(r => r.hidden);
        $('climateTabs').hidden = $('climateMore').hidden = !CLIMATE_SUB.has(layer);
        $('geologyTabs').hidden = !geo;
        $('farmingTabs').hidden = !farm;
        $('civTabs').hidden = !civ;
        $('season').hidden = !SEASONAL_LAYERS.has(layer);
        $('depositPick').hidden = layer !== 'geoDeposits';
        if ($('depositPick').hidden) { $('depositMenu').hidden = true; $('depositPickBtn').setAttribute('aria-expanded', 'false'); }
        $('agePick').hidden = $('ageRes').hidden = layer !== 'geoAges';
        $('cityReach').hidden = layer !== 'farmCity' && layer !== 'farmEmpire';
    }
}
