// Generate, on the shared core (plans/SHARED_CORE_PLAN.md): the present-day world
// built by the worker (js/planet-worker.js — its plates, its past, its ground on Generate's mesh), shown at once as the
// first picture, then finished in the background by Evolution's own finish (v2/js/finish/finish.js, through its worker:
// the climate, the rivers carved by its runoff, lakes, the ice age, dunes and loess, the rocks, deposits and food, the
// Satellite view) — on Evolution's planet view and layer bar (v2/js/view/planet-view.js, layer-bar.js) and its export.
// What is Generate's own: the sliders, the planet code, the plate edits (Ctrl-click, or the edit button on a phone, then
// Rebuild), the Plates view and the Inspect list's layers (js/generate-plates.js), the build overlay, the tutorial.

import Delaunator from 'delaunator';
import { setDelaunator } from './sphere-mesh.js';
import { meshFromArrays } from '../v2/js/core/sim-mesh.js';
import { PlanetView } from '../v2/js/view/planet-view.js';
import { mountLayerBar } from '../v2/js/view/layer-bar.js';
import { FinishService } from '../v2/js/evolution/finish-view.js';
import { askSurface } from './surface-ask.js';
import { terrainFin, finishedFin } from './finish-landing.js';
import { stageClock } from '../v2/js/finish/stage-clock.js';
import { initEvolutionExport, CATALOGUE, rollRows, rollShift } from '../v2/js/evolution/export.js';
import { DATA_SCALES } from '../v2/js/view/export-raster.js';
import { heightLutOf } from '../v2/js/evolution/looks.js';
import { CLIMATE_LAYERS } from '../v2/js/evolution/climate-view.js';
import { GEOLOGY_LAYERS } from '../v2/js/evolution/geology-view.js';
import { FARMING_LAYERS } from '../v2/js/evolution/farming-view.js';
import { encodePlanetCode, decodePlanetCode, SEED_MAX } from './planet-code.js';
import { CHARACTERS } from './piece-shapes.js';
import { pointAt } from './terrain-brush.js';
import { lakesLabel } from '../v2/js/finish/lake-amount.js';
import { DETAIL_STOPS, nearestStop, fitSlider, stopWords } from './detail-stops.js';
import { buildStarted, buildEnded, WAIT_WORDS } from './build-gate.js';
import { showBuildError, describeFailure } from './build-error.js';
import { presentCrustLine } from './present-crust.js';
import { plateColors, platesLegendHTML, INSPECT, inspectColors, drawPlateLines, platesMap } from './generate-plates.js';
import { state } from './state.js';
import { mountEditTools } from './edit-tools.js';
import { editHeld, isEditKey } from './edit-key.js';
import { mountRegionPick, regionChosen } from './region-pick.js';
import { regionOverlay } from './region-overlay.js';
import { valleyGrid } from './region-grid.js';
import { empireOptions } from '../v2/js/evolution/empire-view.js';
import { statesForget, statesBuild, regionsShown, setRegionsShown } from '../v2/js/evolution/states-view.js';
import { mountStatesCard } from '../v2/js/evolution/states-card.js';
import { statesOverlay, setStatesOverlay, setStatesNames, drawStatesTint, statesOverlayKey, statesLabels, statesOverlayCan, regionUnder } from '../v2/js/evolution/states-overlay.js';
import { pieceOverlay } from './piece-overlay.js';
import { store, sliderTooltip, detailWarning, progressiveSwitch, redrawFoldedSliders, sidePanel, buildOverlay, tutorial } from './page-chrome.js';
import { findWorld, keepWorld, worldKey } from './world-keep.js';
import { rungView } from './rung-view.js'; import { buildProgress } from './build-progress.js';

setDelaunator(Delaunator);

const $ = (id) => document.getElementById(id);
const IS_TOUCH = state.isTouchDevice;

// ── the page: the map's frame beside the globe's canvas, the canvas the window's, the bar over it ──
if (!$('mapCanvas')) { const m = document.createElement('canvas'); m.id = 'mapCanvas'; m.hidden = true; $('canvas').after(m); }
Object.assign($('canvas').style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh' });
mountLayerBar({ comes: 'Comes a few seconds after the planet', empire: true,
    platesTip: 'The plates in their colours, each piece a shade of its own, the boundaries by kind and the motion as arrows — Ctrl-click (⌘-click on a Mac) a piece to raise or sink it, in any view' });
// (the Inspect list: the world's past, per region)
const inspectEl = $('debugLayer');

const pv = new PlanetView({ isTouch: IS_TOUCH, gpu: new URLSearchParams(location.search).get('gpu') !== '0', paletteKey: 'orogen.generate.palette',
    onChange: viewChanged, alive: (fin) => fin === world?.fin,
    extraLines: (ctx, W, view) => { drawStatesTint(ctx, W, world?.fin, view.layer); drawPlateLines(ctx, W, view, world); },
    extraLinesKey: (view) => `${world?.version ?? 0}|${view.layer === 'plates'}|${statesOverlayKey(world?.fin, view.layer)}` });
const view = pv.view;
const regionShown = regionOverlay(pv.globe), piecesShown = pieceOverlay(pv.globe);
// (the States overlay: the States view's map over every view — its tint and borders through extraLines, its names here)
const stateNames = statesLabels(document.querySelector('.graticule-frame') ?? $('mapCanvas'));
$('chkStates').checked = statesOverlay.on;
$('chkStates').addEventListener('change', e => { setStatesOverlay(e.target.checked); viewChanged('view'); });
// (the Regions switch: the regions' borders, names and hover glow, in the overlay and on the States view; off, none of them)
$('chkRegions').checked = regionsShown.on;
$('chkRegions').addEventListener('change', e => {
    setRegionsShown(e.target.checked);
    if (!e.target.checked) statesOverlay.hover = -1;
    viewChanged('view');
});
// (the Names slider: the opacity of the states' and regions' names painted on the land, here and on the States view)
{
    const sl = $('sStatesNames'), out = $('vStatesNames');
    const show = () => { out.textContent = `${Math.round(statesOverlay.names * 100)}%`; };
    sl.value = statesOverlay.names; show();
    sl.addEventListener('input', () => { setStatesNames(parseFloat(sl.value)); show(); viewChanged('view'); });
}
// (a touch screen wider than a phone — a tablet — keeps the edit button too: styles.css body.touch)
if (IS_TOUCH) document.body.classList.add('touch');
console.info(`[generate] painting ${pv.gpu ? `on the GPU at ${pv.GPU_WIDTH} px` : 'on the CPU'}`);

let world = null;            // the planet shown: its mesh, first picture, plates and edits, and its finished moment once done
let dirty = true, version = 0;
let regionPick = null, empireTurnedOn = false, regionFin = null;   // (the Region pick's handle; whether the Empire view turned it on)
const pending = new Set();   // the pieces whose edit waits for Rebuild
const shapes = new Map();    // the pieces' characters (js/piece-shapes.js): the piece's index in the layout's list → { c, lv }
/** The characters as the worker and the planet code read them. */
const shapeList = () => [...shapes].map(([i, s]) => ({ i, c: s.c, lv: s.lv }));
let hoveredPiece = -1;
let selectionChanged = () => {};                        // (the edit tools', once mounted: paint keeps to the selection)
const finisher = new FinishService(), progressive = progressiveSwitch(), bar = buildProgress(3);   // (Progressive off: Detail N alone, no ladder; bar: the progress card)

let statesTintKey;                                       // (the States overlay's key the picture was last painted with)
function viewChanged(what) {
    dirty = true;
    // (the Empire view focuses on valleys: the Region pick on while it shows, off again after if it turned it on)
    if (what === 'layer' && regionPick) {
        if (view.layer === 'farmEmpire' && !regionPick.isOn()) { regionPick.setOn(true); empireTurnedOn = true; }
        else if (view.layer !== 'farmEmpire' && empireTurnedOn) { regionPick.setOn(false); empireTurnedOn = false; }
        // (the States view is the whole planet: no region to pick there, and on a phone the button would sit on its legend)
        document.querySelector('.region-pick')?.toggleAttribute('hidden', view.layer === 'farmStates');
    }
    if (what === 'layer' && !view.layer.startsWith('inspect:') && inspectEl) inspectEl.value = '';
    updateChip();
}

// ── the worker: the present-day world, its first picture, the finish's job ──
let worker = null, onDone = null, sketch = null;   // (sketch: the first build's first picture, drawn again when the layer changes)
function startWorker() {
    worker = new Worker(new URL('./planet-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: msg }) => {
        if (msg.type === 'progress') { onProgress(msg.pct, msg.label); return; }
        if (msg.type === 'error') { failed(msg.message); return; }
        // (the first sketch, js/world-sketch.js: shown while the page has no world yet, the overlay drawn back to its bar)
        if (msg.type === 'rung') { if (building === 'generate') rungs.show(msg); return; }         // (the Detail ladder's steps: js/rung-view.js)
        if (msg.type === 'sketch') { if (!world) { sketch = { T: msg, tMesh: meshFromArrays(msg.mesh) }; pv.paintLive(sketch); overlay.sketch(); } return; }
        if (msg.type === 'done' || msg.type === 'reapplyDone' || msg.type === 'editDone') received(msg);
    };
    worker.onerror = (e) => { failed(e.message || 'Worker crashed'); worker.terminate(); startWorker(); };
}
startWorker();

/** The sliders, as the worker reads them. */
function sliders() {
    const v = (id) => +$(id).value;
    return { N: DETAIL_STOPS[v('sN')], P: v('sP'), jitter: v('sJ'), nMag: v('sNs'), numContinents: v('sCn'), terrainWarp: v('sTw'), smoothing: v('sS'),
        hydraulicErosion: v('sHEr'), thermalErosion: v('sTEr'), ridgeSharpening: v('sRs'), glacialErosion: v('sGl'), continentSizeVariety: v('sCsv'),
        greenhouse: v('sTmp'), precipitationOffset: v('sPrc'), landCoverage: v('sLc') };
}
/** The climate's options for the finish (as Evolution's, and as Generate's climate read its sliders). */
const climateOptions = () => ({ greenhouseWm2: +$('sTmp').value, precipScale: Math.max(0, 1 + 0.5 * +$('sPrc').value), lakes: +$('sLk').value, ponds: +$('sPd').value });   // (lakes, ponds: lake-amount.js)

let building = null;         // what the worker is doing: 'generate', 'reapply', 'edit'
let asked = null;            // the build under way: its seed and edits (a restart builds the same world, as the panel says now)
let undo = null;             // the shown world's edits while a new world is built (Cancel: given back)
function generate(seed = Math.floor(Math.random() * SEED_MAX), toggledIndices = [], keepEdits = false, shapesGiven = [], strokesGiven = []) {
    // (anything the worker is doing — a build, a Reapply, a brush, an edit — dropped: its worker and its steps' water,
    // and the new build started in its place; a Reapply or brush left running would land its world over this one)
    const restart = building === 'generate';
    if (building) { worker.terminate(); startWorker(); rungs.clear(); reapplyBtn.classList.remove('spinning'); }
    building = 'generate'; finisher.cancel();
    // (the shown world's edits, kept until this build lands: Cancel gives them back)
    if (!restart) undo = keepEdits ? null : { shapes: new Map(shapes), tools: tools.save() };
    if (!keepEdits) { tools.reset(); shapes.clear(); for (const s of shapesGiven) shapes.set(s.i, { c: s.c, lv: s.lv }); tools.load(strokesGiven); }
    const mine = asked = { seed, toggledIndices, keepEdits, shapes: shapeList(), strokes: tools.strokes, ground: groundNow() };
    const code = codeOf(seed, toggledIndices, mine.shapes, mine.strokes);
    // (the link names the world on its way: a reload mid-build builds it again, not the one before)
    history.replaceState(null, '', `${location.search}#${code}`);
    showBuildOverlay();
    const b = $('generate'); b.disabled = false; b.textContent = 'Cancel build'; b.classList.remove('restart', 'stale', 'regen'); b.classList.add('generating', 'cancel');
    const job = { cmd: 'generate', ...sliders(), ...progressive(), seed, toggledIndices, next: true, shared: true, strokes: tools.strokes, shapes: shapeList() };
    // (it starts once every tab's builds fit the machine's memory, its place let go when its finish ends: build-gate.js)
    const start = () => buildStarted('generate', job.N, () => onProgress(0, WAIT_WORDS)).then(go => { if (go && building === 'generate' && asked === mine) worker.postMessage(job); });
    // (this planet code finished before, in this browser: opened from the world cache instead — js/world-keep.js; not
    // for a world the worker let go, built again for an edit: that one is needed in the worker)
    if (keepEdits) { start(); return; }
    findWorld(worldKey(code, IS_TOUCH)).then(kept => {
        if (building !== 'generate' || asked !== mine) return;
        if (!kept) { start(); return; }
        const k = kept.world;
        received({ type: 'done', seed: k.seed, shared: { mesh: k.meshArrays, heightKm: k.heightKm, shade: k.shade, story: k.story, regionCell: k.regionCell, finish: k.finishJob },
            present: k.present, debugLayers: k.inspect, r_plate: k.r_plate, plateSeeds: k.plateSeeds, plateIsOcean: k.plateIsOcean, originalPlateIsOcean: k.originalPlateIsOcean }, kept);
    });
}
/** The ground's and the sculpting's sliders as they stand (a finished world is kept only while they are as it was built). */
const groundNow = () => [...sliderIds, ...SCULPT].map(id => $(id).value).join('|');
function failed(message) {
    console.error('[generate] build failed:', message);
    buildEnded('generate');
    if (building === 'generate' && world) world.detached = true;      // (the worker let the shown world go when the build began)
    building = null; undo = null; overlay.active = false; rungs.clear(); dirty = true;
    resetBuildButton();
    showBuildError(describeFailure(message), message); bar.failed();
}
/** Cancel: the build under way dropped — its worker, its steps' water, its place in the memory budget — and the page as
 *  it was before it: the world shown (or none), its edits and its link; the panel as it is now (a change waits for Build). */
function cancelBuild() {
    worker.terminate(); startWorker();
    buildEnded('generate');
    building = null; asked = null; sketch = null; dirty = true;
    hideBuildOverlay(); rungs.clear(); bar.failed();
    if (undo) { shapes.clear(); for (const [i, s] of undo.shapes) shapes.set(i, s); tools.restore(undo.tools); undo = null; }
    // (the worker let the shown world go when the build began: whatever needs it again builds it again, rebuildShown())
    if (world) { world.detached = true; if (!world.fin || world.fin.partial) world.problem = 'Cancelled before this world was finished'; }
    history.replaceState(null, '', `${location.pathname}${location.search}${currentCode ? `#${currentCode}` : ''}`);
    resetBuildButton(); if (world) checkStale(); updateChip(); pendingChanged();
    console.info('[generate] build cancelled');
}
/** A world the worker no longer holds (a build cancelled or failed after it): built again — the same seed and edits, the
 *  panel as it is now — for whatever needed it (Reapply, a brush, Rebuild, the climate). True if it was. */
function rebuildShown() {
    if (!world?.detached) return false;
    // (a tick later: the change that asked for it reaches the panel first, so the button reads Cancel build, not Rebuild)
    const w = world;
    setTimeout(() => { if (world === w && !building) generate(w.seed, toggledIndices(), true); });
    return true;
}
function resetBuildButton() { const b = $('generate'); b.disabled = false; b.classList.remove('generating', 'cancel', 'restart', 'stale', 'regen'); b.textContent = 'Build new world'; }
// (the panel stays live while a world is built: the button cancels it, and a setting changed makes it Rebuild, which
// drops the build under way and starts it again — the same seed and edits — with the panel as it is now)
for (const type of ['input', 'change']) $('ui').addEventListener(type, (e) => {
    if (building !== 'generate' || e.target.id === 'seedCode') return;
    const b = $('generate'); b.disabled = false; b.classList.remove('cancel'); b.classList.add('restart'); b.textContent = 'Rebuild';
});

/** A world from the worker: its first picture shown, its finish started. Or one from the world cache (`kept`: its
 *  finished layers): shown finished, and held by no worker (whatever needs the worker builds it again: rebuildShown). */
function received(msg, kept = null) {
    const sh = msg.shared;
    if (!sh) { failed('the worker sent no present-day world'); return; }
    const old = world;
    const kind = msg.type, w = {
        version: ++version, seed: msg.seed ?? old?.seed, tMesh: meshFromArrays(sh.mesh), meshArrays: sh.mesh, heightKm: sh.heightKm, shade: sh.shade,
        story: sh.story, regionCell: sh.regionCell, finishJob: sh.finish, fin: null, finishing: null, problem: null,
        present: msg.present ?? old?.present, inspect: msg.debugLayers ?? old?.inspect,
        // (the pieces and their land as edited, and as first built — the planet code's toggles are the difference)
        r_plate: msg.r_plate ?? old.r_plate, plateSeeds: msg.plateSeeds ?? old.plateSeeds,
        plateIsOcean: msg.plateIsOcean ? new Set(msg.plateIsOcean) : old.plateIsOcean, originalPlateIsOcean: msg.originalPlateIsOcean ? new Set(msg.originalPlateIsOcean) : old.originalPlateIsOcean,
        n: sh.mesh.numCells,
    };
    if (kind === 'editDone' && old) { w.seed = old.seed; w.plateIsOcean = old.plateIsOcean; w.originalPlateIsOcean = old.originalPlateIsOcean; }
    if (kind === 'done') w.ground = asked?.ground ?? null;              // (what it was built with: kept once finished, while still so)
    if (kept) { w.fin = kept.fin; w.climateKey = kept.climateKey; w.detached = true; }
    world = w; building = null; undo = null; dirty = true; hoveredPiece = -1; sketch = null; rungs.land();   // (a step's water shown until the world's own lands)
    pv.forget();                                         // (the old world's finished moment let go)
    if (pv.gpu) pv.gpu.setMesh(w.tMesh);
    resetBuildButton();
    hideBuildOverlay();
    if (kind === 'done') {
        snapshotSliders();
        clearPending();
    }
    updatePlanetCode(kind === 'editDone');
    reapplyBtn.classList.remove('spinning');
    stats(msg);
    $('generate').dispatchEvent(new CustomEvent('generate-done'));
    if (kept) { updateChip(); console.info('[generate] opened from the world cache'); foundStates(w).then(() => { if (world === w) bar.done(null); }); }
    else finish(w);
}

// ── the finish (Evolution's: finish/finish-worker.js) in the background: the rest of the world's layers ──
/** The picture's width for a mesh this fine: about four pixels a cell across, 2048 … 8192 (a phone 2048). */
const finishWidth = (n) => (IS_TOUCH ? 2048 : Math.min(8192, Math.max(2048, 2 ** Math.round(Math.log2(4 * Math.sqrt(n))))));
let finishes = 0;            // (the finish asked last: one whose surface comes after a newer one was asked goes no further)
async function finish(w) {
    if (!w.finishJob) return;
    if (w.detached) { rebuildShown(); return; }                         // (its surface gone with the worker: built again)
    finisher.cancel();
    const ticket = ++finishes, { surface, transfer } = await askSurface(worker);   // (the surface the worker keeps: js/surface-ask.js)
    if (world !== w || ticket !== finishes) return;
    const started = performance.now(), job = w.finishJob;
    w.fin = null; w.problem = null; w.finishing = { stage: 'starting', share: 0 }; updateChip(); bar.finishing('starting', 0);
    let quiet = false, keep = null;
    // (how far along: the whole, and the stage under way, timed by the finishes before — finish/stage-clock.js)
    const clock = stageClock({ page: 'generate', cells: w.n, onTick: () => { if (world !== w || !w.finishing) return; w.finishing.share = clock.total; updateChip(); bar.finishing(clock.stage, clock.total, clock.task); } });
    const onStage = (s) => { if (world !== w) return; w.finishing = { stage: s, share: w.finishing?.share ?? 0 }; clock.begin(s); };
    const onProgress = (p) => { if (world === w) clock.progress(p); };
    try {
        // (the terrain lands first, the other layers after it: finish-landing.js)
        const onTerrain = (d) => { if (world !== w) return; w.fin = terrainFin(w.n, d); rungs.clear(); dirty = true; updateChip(); console.info(`[generate] terrain finished in ${((performance.now() - started) / 1000).toFixed(1)} s`); };
        const res = await finisher.finish({ ...job, surface, mesh: w.meshArrays, cells: w.n, width: finishWidth(w.n), climateOptions: climateOptions(), valleyQ: view.riverQ }, { onStage, onProgress, onTerrain, onDrivers: () => { if (world === w) bar.zoomReady(); }, keep: false, transfer });
        clock.done(res.ms);
        if (world !== w) return;
        quiet = !!pv.shows(w.fin);                                   // (the terrain shown already: the rest changes nothing on it)
        w.fin = finishedFin(w.n, res, w.fin);
        w.climateKey = `${$('sTmp').value}|${$('sPrc').value}|${$('sLk').value}|${$('sPd').value}`;
        // (a world built from its planet code, its ground's sliders as it was built: kept in this browser, in the background)
        if (w.ground && w.ground === groundNow()) {
            // (its own name, kept with it: its zoomed-in tiles kept on disk under it, found again when a reload opens it — tile-store.js)
            // (kept once the states are worked out, not beside them: saving a large world is heavy on the page's memory,
            // and the two at once can take a tab down)
            w.fin.keptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const at = worldKey(codeOf(w.seed, toggledIndices(), shapeList()), IS_TOUCH);
            keep = () => keepWorld(at, { seed: w.seed, meshArrays: w.meshArrays, heightKm: w.heightKm, shade: w.shade, story: w.story,
                regionCell: w.regionCell, finishJob: w.finishJob, present: w.present, inspect: w.inspect, r_plate: w.r_plate, plateSeeds: w.plateSeeds,
                plateIsOcean: [...w.plateIsOcean], originalPlateIsOcean: [...w.originalPlateIsOcean] }, w.fin, w.climateKey);
        }
        console.info(`[generate] finished in ${((performance.now() - started) / 1000).toFixed(1)} s; its steps (s): ${Object.entries(res.ms).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}`).join(", ")}`);
    } catch (err) {
        if (err.name === 'AbortError' || world !== w) return;
        w.problem = /allocation failed|out of memory/i.test(String(err.message)) ? 'Not enough memory to finish this planet — try a lower Detail' : `Could not finish this planet: ${String(err.message).split('\n')[0]}`;
        console.error(err);
    } finally {
        clock.stop();
        if (world === w) { w.finishing = null; if (!quiet || rungs.live) dirty = true; if (!building) rungs.clear(); updateChip(); }
        if (world === w && !building && !w.problem) await foundStates(w);
        if (world === w && !building) bar.done(w.problem);
        if (world === w && !building) buildEnded('generate');
        if (keep && world === w) keep();
    }
}

/** The build's third step: the states and empires (v2/js/evolution/states-view.js), worked out once the world is finished,
 *  in a worker (states-worker.js) that reports each step, so the card can say how far along they are while the page stays
 *  live; the overlay shows them once done. */
async function foundStates(w) {
    if (!w.fin?.raster?.farming) return;
    const t0 = performance.now();
    try { await statesBuild(w.fin, (words, share) => { if (world === w) bar.states(share, `${words}…`); }, () => world === w); }
    catch (err) { console.error('[generate] the states could not be worked out', err); }
    if (world === w) { dirty = true; console.info(`[generate] states worked out in ${((performance.now() - t0) / 1000).toFixed(1)} s`); }
}

/** The chip over the planet: the finish under way (on the layers it brings), or what went wrong. */
function updateChip() {
    const chip = $('climateChip'), w = world, needs = CLIMATE_LAYERS.has(view.layer) || GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer);
    let text = null, act = null;
    if (w?.finishing && needs) text = `Working out the climate, rivers, rocks and food… ${Math.round(100 * Math.min(1, w.finishing.share))} %`;
    else if (w?.problem && needs) { text = w.problem; act = 'Try again'; }
    chip.hidden = !text;
    if (text) { $('climateChipText').textContent = text; $('climateChipBtn').hidden = !act; $('climateChipBtn').textContent = act ?? ''; }
    // (the layers that come with the finish: locked until it is done)
    const fin = w?.fin;
    for (const id of ['satellite', 'geology', 'farming', 'civ']) document.querySelector(`#mapTabs [data-layer="${id}"]`)?.classList.toggle('locked', !fin || fin.partial);
}
$('climateChipBtn').addEventListener('click', () => { if (world?.problem && !building) finish(world); });

// ── drawing ──
/** The page's own layers per cell: the plates, an Inspect layer. */
function pageCells(layer, out, shade) {
    const w = world;
    if (layer === 'plates') {
        const rgb = plateColors(w);
        for (let r = 0; r < w.n; r++) { const k = 0.45 + 0.55 * shade[r]; for (let c = 0; c < 3; c++) out[3 * r + c] = Math.min(255, rgb[3 * r + c] * k); }
        return true;
    }
    if (layer.startsWith('inspect:')) return inspectColors(layer.slice(8), w, out, shade);
    return false;
}
function paint() {
    if (rungs.live) { rungs.repaint(); return; }                      // (a world being built: its step shown)
    if (!world) { pv.paintLive(sketch); pv.syncLegendCard(false); return; }   // (the first build: its sketch, in the layer picked)
    const w = world, fin = pv.shows(w.fin);
    pv.syncClouds(fin, w.seed);
    if (fin) pv.paintFinished(fin, false, w.version);
    else pv.paintLive({ T: { heightKm: w.heightKm, shade: w.shade }, tMesh: w.tMesh, cells: pageCells });
    // the page's own layers' legends
    const legend = $('climateLegend');
    if (view.layer === 'plates') { legend.innerHTML = platesLegendHTML(); legend.dataset.key = 'plates'; }
    else if (view.layer.startsWith('inspect:')) { const L = INSPECT[view.layer.slice(8)]; legend.innerHTML = L ? `<div class="evo-legend-head">${L.name}</div><div class="evo-koppen">${L.legend}</div>` : ''; legend.dataset.key = view.layer; }
    pv.syncLegendCard(!!fin);
}
function tick(now) {
    requestAnimationFrame(tick);
    if (dirty && (world || rungs.live || sketch)) { dirty = false; paint(); }   // (mid-build too: the tabs stay live)
    pv.updatePatch(now, world && !rungs.live ? pv.shows(world.fin) : null, world?.fin, world?.seed);
    if (empireOptions.mask && regionChosen.world !== world) empireFocus();   // (a new planet: the focus starts again)
    if (statesWorld !== world) { statesWorld = world; statesForget(); statesCard.close(); }   // (and the States view's hand-placed capitals)
    statesCard.sync();
    // (the States overlay's tint: drawn again once the food it rests on is worked out, or its options change)
    const stKey = statesOverlayKey(world && !rungs.live ? world.fin : null, view.layer);
    if (stKey !== statesTintKey) { const was = statesTintKey; statesTintKey = stKey; if (was !== undefined) viewChanged('view'); }
    if (regionPick && world?.fin !== regionFin) { regionFin = world?.fin; regionPick.refresh(); }   // (the bar's words: the planet finished)
    regionShown.sync(world, regionChosen);                               // (the region pick's valleys: the shader's)
    piecesShown.sync(world, pending, hoveredPiece, tools.choosing ? tools.area : null);   // (the plate edits' tint: the shader's too)
    pv.render(now);
    statesHover();
    stateNames.show(world && !rungs.live ? world.fin : null, pv.globe.frameView(), statesOverlay.on && pv.pictured);
}
requestAnimationFrame(tick);

// ── the hover, and the plate edits: Ctrl-click (⌘-click) a piece, or tap it in edit mode, then Rebuild ──
const regionAt = (e) => { const p = world ? pv.placeUnder(e) : null; return p ? { p, r: pv.cellUnder(world.tMesh, p) } : null; };
// (Ctrl or ⌘ held: the piece under the pointer lights up at once, before the pointer moves — as on the old page)
let editKey = false, lastPointer = null;
const editing = (e) => editHeld(e) || editKey || (IS_TOUCH && state.editMode);
function readout(e) {
    lastPointer = e;
    const at = regionAt(e);
    if (!at) { pv.hover(null); setHovered(-1); return; }
    const { p, r } = at, w = world, piece = w.r_plate[r], isOcean = w.plateIsOcean.has(piece), isPending = pending.has(piece);
    setHovered(editing(e) ? piece : -1);
    const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">●</span>`, action = IS_TOUCH ? 'Tap' : 'Ctrl-click', head = [];
    const was = isOcean ? 'Ocean' : 'Land';
    if (tools.choosing) head.push(`${dot} <b>${was}</b> plate · ${tools.area.has(piece) ? `paint kept to it · ${action} to free it` : `${action} to paint only in chosen plates`}`);
    else if (isPending) head.push(`${dot} <b>${was} → ${isOcean ? 'Land' : 'Ocean'}</b> <span style="color:var(--gold-ink)">(pending)</span> · ${action} to undo`);
    else head.push(`${dot} <b>${was}</b> plate · ${action} to ${isOcean ? 'raise land' : 'flood'}`);
    // (the paint layer here, while it shows: js/edit-tools.js)
    const paint = piecesShown.paintAt(pointAt(p));
    if (paint && CHARACTERS[paint.c]) head.push(`<span class="hi-label">Paint</span> ${CHARACTERS[paint.c].name}${paint.waiting ? ' (waiting for Apply)' : ''}`);
    const pr = w.present, pl = pr?.plates[pr.regionPlate[r]];
    if (pl) {
        // (its speed here: the plate's rotation at this place, in Generate's frame)
        const e3 = pl.euler, xyz = w.tMesh.xyz, px = xyz[3 * r + 1], py = xyz[3 * r + 2], pz = xyz[3 * r];
        const cm = Math.hypot(e3[1] * pz - e3[2] * py, e3[2] * px - e3[0] * pz, e3[0] * py - e3[1] * px) * 6371 / 10;
        head.push(`<span class="hi-label">Plate</span> ${pl.index + 1} of ${pr.plates.length} (${pl.continental ? 'carries a continent' : 'ocean'}) · ${cm.toFixed(1)} cm/yr`);
        const crust = presentCrustLine(pr, r);
        if (crust) head.push(`<span class="hi-label">Crust</span> ${crust}`);
    }
    pv.hover(pv.readoutLines({ p, fin: pv.shows(w.fin), heightKm: w.heightKm[r], head, story: w.story, rec: w.regionCell[r] }));
}
function setHovered(piece) { hoveredPiece = piece; }       // (piece-overlay.js sends it on)
pv.onPointer(readout);
for (const el of [pv.ui.canvas, pv.ui.map]) {
    let down = null;
    el.addEventListener('pointerdown', (e) => {
        // (Ctrl-click, or Cmd-click on a Mac — where Firefox reports a Ctrl-click as a right-click; issue #19)
        const edit = (editHeld(e) && (e.button === 0 || e.button === 2)) || (e.button === 0 && IS_TOUCH && state.editMode);
        const at = edit && !building ? regionAt(e) : null;
        down = at ? { x: e.clientX, y: e.clientY, piece: world.r_plate[at.r] } : null;
    });
    el.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6, piece = down.piece;
        down = null;
        if (moved) return;
        // (while Paint is on, the pieces to paint in: js/edit-tools.js; otherwise those Rebuild flips)
        if (tools.choosing) tools.toggleArea(piece);
        else { if (pending.has(piece)) pending.delete(piece); else pending.add(piece); pendingChanged(); }
        readout(e);
    });
    el.addEventListener('contextmenu', (e) => { if (editHeld(e)) e.preventDefault(); });
}
addEventListener('keydown', (e) => {
    if (isEditKey(e.key) && !e.repeat) { editKey = true; if (lastPointer && pv.ui.hover.style.display !== 'none' && !building) readout(lastPointer); }
});
addEventListener('keyup', (e) => { if (isEditKey(e.key)) { editKey = false; setHovered(-1); } });
addEventListener('blur', () => { editKey = false; setHovered(-1); });
for (const el of [pv.ui.canvas, pv.ui.map]) el.addEventListener('pointerleave', () => { lastPointer = null; if (!(IS_TOUCH && state.editMode)) setHovered(-1); });
const rebuildFab = $('rebuildFab');
function pendingChanged() {
    // (Rebuild counts the selected pieces: it applies them all in one build)
    const count = pending.size;
    rebuildFab.querySelector('span').textContent = `Rebuild (${count})`;
    rebuildFab.style.display = count ? '' : 'none';
    document.body.classList.toggle('edits-pending', count > 0);             // (the readout steps up over the button)
    if (lastPointer && pv.ui.hover.style.display !== 'none') readout(lastPointer);
    selectionChanged();
}
function clearPending() { pending.clear(); pendingChanged(); }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending.size) clearPending(); });
rebuildFab.addEventListener('click', () => {
    if (!pending.size || !world || building) return;
    // (each piece raised or sunk, the plates built again; the paint laid again over them, by the worker)
    for (const id of pending) { if (world.plateIsOcean.has(id)) world.plateIsOcean.delete(id); else world.plateIsOcean.add(id); }
    clearPending(); setHovered(-1);
    if (rebuildShown()) return;                                          // (a world the worker let go: built again, edited)
    building = 'edit'; finisher.cancel();
    $('generate').disabled = true; $('generate').textContent = 'Building…'; $('generate').classList.add('generating');
    pv.hover(['Rebuilding…']);
    worker.postMessage({ cmd: 'editRecompute', plateIsOcean: [...world.plateIsOcean], shapes: shapeList(), ...sliders() });
});
// ── the edit tools (js/edit-tools.js): the terrain brush ──
const tools = mountEditTools(pv, {
    world: () => world,
    busy: () => !!building,
    // (legacy: an old link's plate characters, piece-shapes.js — Clear paint takes them off too; nothing makes new ones)
    strokes: (list, legacy) => {
        if (legacy) { shapes.clear(); for (const s of legacy) shapes.set(s.i, { c: s.c, lv: s.lv }); }
        if (rebuildShown()) return;
        building = 'brush';
        worker.postMessage(legacy ? { cmd: 'shape', shapes: shapeList(), strokes: list } : { cmd: 'brush', strokes: list });
    },
    legacy: () => shapeList(),
    painting: (applied, waiting) => piecesShown.paint(applied, waiting),
    layerShown: (on) => piecesShown.showPaint(on),
    selecting: () => IS_TOUCH && state.editMode,
    selected: () => pending,                          // (the plates selected for Rebuild: paint keeps to them too)
});
selectionChanged = () => tools.selectionChanged();
regionPick = mountRegionPick(pv, { world: () => world, changed: empireFocus });
// The States infobox (v2/js/evolution/states-card.js): in the States view, or over any view with the States overlay on,
// a click on the planet (a drag still turns it) opens a card on the place or the state there; its buttons found and
// drop capitals. Not while Ctrl is held (the plate edits), in edit mode, painting, or picking a region.
let statesWorld = null, statesDown = null;
const statesFin = () => (world && !rungs.live && statesOverlayCan(world.fin) ? world.fin : null);
const statesCard = mountStatesCard({ fin: statesFin, changed: () => viewChanged(view.layer === 'farmStates' ? 'farm' : 'view') });
const onPlanet = (t) => pv.ui.canvas.contains(t) || pv.ui.map.contains(t) || t === pv.globe?.controls?.domElement;
const statesClickable = () => statesFin() && (view.layer === 'farmStates' || (statesOverlay.on && pv.pictured)) && !tools.choosing && !regionPick?.isOn() && !(IS_TOUCH && state.editMode);
addEventListener('pointerdown', (e) => { statesDown = e.button === 0 && !editHeld(e) && onPlanet(e.target) && statesClickable() ? { x: e.clientX, y: e.clientY } : null; }, true);
addEventListener('pointerup', (e) => {
    const d = statesDown;
    statesDown = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6 || !statesClickable()) return;
    const fin = statesFin(), hit = stateNames.pick(fin, pv.globe.frameView(), e.clientX, e.clientY), p = hit ? null : pv.placeUnder(e);
    const pick = hit ?? (p && { kind: 'land', lat: 90 - p[1] * 180, lon: p[0] * 360 - 180 });
    if (pick) statesCard.open(pick, e.clientX, e.clientY); else statesCard.close();
}, true);
// The region under the pointer, lit by the names' layer (its border and name shine): read once a frame from the last
// move, only with a mouse or pen (a touch has no hover), not mid-drag, and only where the States overlay shows.
let hoverMove = null;
addEventListener('pointermove', (e) => { hoverMove = e; }, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { hoverMove = { gone: true }; });
function statesHover() {
    const e = hoverMove;
    if (!e) return;
    hoverMove = null;
    const fin = !e.gone && e.pointerType !== 'touch' && !e.buttons && onPlanet(e.target) && statesOverlay.on && pv.pictured ? statesFin() : null;
    const p = fin && pv.placeUnder(e);
    statesOverlay.hover = p ? regionUnder(fin, p[0], p[1]) : -1;
}
/** The Empire view's focus (v2/js/evolution/empire-view.js): the valleys chosen with the Region pick, read off the
 *  valleys' map once it is built. */
function empireFocus() {
    const C = regionChosen, ids = C.ids.size && C.world === world ? new Set(C.ids) : null;
    if (ids && C.V && !C.V.grid) valleyGrid(world, C.V).then(() => { if (C.ids.size) empireFocus(); });
    empireOptions.mask = ids && C.V?.grid ? { grid: C.V.grid, ids } : null;
    empireOptions.version++;
    if (view.layer === 'farmEmpire') viewChanged('farm');
}
$('editToggle')?.addEventListener('click', () => { state.editMode = !state.editMode; $('editToggle').classList.toggle('active', state.editMode); $('editToggle').setAttribute('aria-pressed', String(state.editMode)); if (!state.editMode) setHovered(-1); });

// ── the sliders: their values, the stale build button, Reapply, the climate ──
const sliderIds = ['sN', 'sP', 'sCn', 'sJ', 'sNs', 'sCsv', 'sLc'], PLATE_SLIDERS = ['sP', 'sCn', 'sCsv', 'sLc'], SCULPT = ['sTw', 'sS', 'sGl', 'sHEr', 'sTEr', 'sRs'], FINISHED = ['sTmp', 'sPrc', 'sLk', 'sPd'];   // (FINISHED: the finish again on release)
let lastGenValues = {};
function snapshotSliders() { for (const id of sliderIds) lastGenValues[id] = $(id).value; }
function checkStale() {
    const btn = $('generate');
    if (btn.classList.contains('generating')) return;
    const plateChanged = PLATE_SLIDERS.some((id) => $(id).value !== lastGenValues[id]);
    const detailChanged = ['sN', 'sJ', 'sNs'].some((id) => $(id).value !== lastGenValues[id]);
    btn.classList.remove('stale', 'regen');
    if (plateChanged) { btn.classList.add('regen'); btn.textContent = 'Regenerate'; }
    else if (detailChanged) { btn.classList.add('stale'); btn.textContent = 'Rebuild'; }
    else btn.textContent = 'Build new world';
}
const reapplyBtn = $('reapplyBtn');
fitSlider($('sN'), 'generate');                                      // (Detail ends at this machine's finest stop: detail-stops.js)
for (const s of ['sN', 'sP', 'sCn', 'sJ', 'sNs', 'sCsv', 'sLc', ...SCULPT, ...FINISHED]) {
    const slider = $(s), v = s.replace('s', 'v');
    sliderTooltip(slider);
    slider.addEventListener('input', (e) => {
        const val = +e.target.value;
        if (s === 'sN') { const d = DETAIL_STOPS[val]; $(v).textContent = stopWords(d); detailWarning(d, 'generate'); }
        else if (s === 'sTmp') $(v).textContent = `${val > 0 ? '+' : val === 0 ? '±' : '−'}${Math.abs(val)} W/m²`;
        else if (s === 'sPrc') { const pct = Math.round(val * 50); $(v).textContent = `${pct > 0 ? '+' : pct === 0 ? '±' : ''}${pct}%`; }
        else if (s === 'sLc') $(v).textContent = `${Math.round(val * 100)}%`;
        else if (s === 'sLk' || s === 'sPd') $(v).textContent = lakesLabel(val);
        else $(v).textContent = e.target.value;
        if (SCULPT.includes(s)) { reapplyBtn.disabled = false; reapplyBtn.classList.add('ready'); }
        else if (!FINISHED.includes(s)) checkStale();
    });
    // (the climate: the finish again, with the ground it has — on release, not every step of a drag)
    // (mid-build not: the world on its way reads them when its finish starts)
    if (FINISHED.includes(s)) slider.addEventListener('change', () => { if (world && !building) { updatePlanetCode(false); finish(world); } });
}
redrawFoldedSliders();
reapplyBtn.addEventListener('click', () => {
    if (reapplyBtn.disabled || !world || building) return;
    if (rebuildShown()) return;                                          // (a world the worker let go: built again, as the sliders say)
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready'); reapplyBtn.classList.add('spinning');
    building = 'reapply'; finisher.cancel();
    worker.postMessage({ cmd: 'reapply', ...sliders() });
});

// ── the build overlay ──
const overlay = buildOverlay();                                     // (every control live mid-build: a panel change restarts it)
const rungs = rungView(pv, overlay, { width: finishWidth, climate: climateOptions });
const onProgress = (pct, label) => { overlay.progress(pct, label); if (building) bar.build(pct, label); }, showBuildOverlay = () => { overlay.show(); bar.start(); }, hideBuildOverlay = () => overlay.hide();

// ── Build New World, the planet code ──
const genBtn = $('generate'), seedInput = $('seedCode'), copyBtn = $('copyBtn'), loadBtn = $('loadBtn'), seedError = $('seedError');
let currentCode = '';
genBtn.addEventListener('click', () => {
    // (mid-build: Cancel — or Rebuild, a setting changed)
    if (building === 'generate' && !genBtn.classList.contains('restart')) { cancelBuild(); return; }
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready');
    panel.collapse();                                                // (a phone: the sheet down, the planet in view)
    if (building === 'generate') { generate(asked.seed, asked.toggledIndices, asked.keepEdits, asked.shapes, asked.strokes); return; }
    // (Rebuild: the same seed and edits, only the resolution and noise; the plate sliders: a fresh world)
    const plateChanged = PLATE_SLIDERS.some((id) => $(id).value !== lastGenValues[id]);
    const rebuild = genBtn.classList.contains('stale') && world && !plateChanged;
    generate(rebuild ? world.seed : undefined, rebuild ? toggledIndices() : [], rebuild);
});
/** The pieces edited, as indices into the layout's list (the planet code's toggles). */
function toggledIndices() {
    const w = world;
    if (!w) return [];
    const out = [];
    w.plateSeeds.forEach((r, i) => { if (w.originalPlateIsOcean.has(r) !== w.plateIsOcean.has(r)) out.push(i); });
    return out;
}
/** The planet code of a seed and its edits, with the panel's sliders as they are. */
function codeOf(seed, toggled, shapeList, strokes = tools.strokes) {
    const v = (id) => +$(id).value;
    return encodePlanetCode(seed, DETAIL_STOPS[v('sN')], v('sJ'), v('sP'), v('sCn'), v('sNs'), v('sTw'), v('sS'), v('sGl'), v('sHEr'), v('sTEr'), v('sRs'), 0.75, v('sCsv'), v('sTmp'), v('sPrc'), v('sLc'), toggled, v('sLk'), v('sPd'), shapeList, strokes);
}
function updatePlanetCode(flash) {
    if (!world) return;
    currentCode = codeOf(world.seed, toggledIndices(), shapeList());
    seedInput.value = currentCode;
    // (the paint rides in the code: a lot of it makes a long link, which some apps cut short)
    seedInput.title = currentCode.length > 2000 ? `This code is ${currentCode.length.toLocaleString()} characters long, for the paint it carries: some apps cut long links short, so copy it whole` : '';
    loadBtn.classList.toggle('ready', false);
    history.replaceState(null, '', `${location.search}#${currentCode}`);
    if (flash) { seedInput.classList.add('flash'); seedInput.addEventListener('animationend', () => seedInput.classList.remove('flash'), { once: true }); }
}
copyBtn.addEventListener('click', () => {
    if (!seedInput.value) return;
    navigator.clipboard.writeText(seedInput.value).then(() => { copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '⎘'; }, 1200); });
});
seedInput.addEventListener('input', () => { const val = seedInput.value.trim().toLowerCase(); loadBtn.classList.toggle('ready', val.length > 0 && val !== currentCode); seedError.classList.remove('visible'); });
function setSlidersFrom(params) {
    const map = { sN: Math.min(nearestStop(params.N), +$('sN').max), sJ: params.jitter, sP: params.P, sCn: params.numContinents, sNs: params.roughness, sCsv: params.continentSizeVariety, sLc: params.landCoverage,
        sTw: params.terrainWarp, sS: params.smoothing, sGl: params.glacialErosion, sHEr: params.hydraulicErosion, sTEr: params.thermalErosion, sRs: params.ridgeSharpening, sTmp: params.greenhouse, sPrc: params.precipitationOffset, sLk: params.lakes ?? 0, sPd: params.ponds ?? 0 };
    for (const [id, val] of Object.entries(map)) { const el = $(id); el.value = val; el.dispatchEvent(new Event('input')); }
}
function applyCode(code) {
    const params = decodePlanetCode(code);
    if (!params) {
        seedInput.style.borderColor = 'var(--ui-error)'; seedError.classList.add('visible');
        setTimeout(() => { seedInput.style.borderColor = ''; }, 1500);
        return;
    }
    seedError.classList.remove('visible');
    setSlidersFrom(params);
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready');
    clearPending();
    generate(params.seed, params.toggledIndices, false, params.shapes, params.strokes);
}
loadBtn.addEventListener('click', () => applyCode(seedInput.value));
seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCode(seedInput.value); });

// ── the Inspect list: the world's past, per region ──
inspectEl?.addEventListener('change', () => { if (inspectEl.value) pv.setLayer(`inspect:${inspectEl.value}`); else pv.setLayer('terrain'); });

// ── the export: Evolution's panel and maps, from the finished world ──
const code = () => currentCode || (world ? String(world.seed) : '');
// (and Generate's own row, the Plates: their colours, or each one's number — at the export's width and centre)
const PLATES_ROW = { id: 'plates', label: 'Plates', colour: true, data: [{ key: 'plateId', suffix: 'id', label: 'Plate number', scale: DATA_SCALES.plateId, bits: 8 }], tip: 'The plates in their colours, the boundaries by kind (the Plates view without its arrows); as data, each plate’s number' };
const CATALOGUE_WITH_PLATES = CATALOGUE.map((g) => (g.id === 'geology' ? { ...g, rows: [PLATES_ROW, ...g.rows] } : g));
function producePlates(rctx, job) {
    if (job.row.id !== 'plates' || !world) return null;
    const W = rctx.W, H = W >> 1, shift = rollShift(W, rctx.look.centerLon), colour = job.variant === 'colour';
    return { kind: colour ? 'rgba' : 'gray8', W, H, data: rollRows(platesMap(world, W, colour ? 'rgba' : 'id'), W, H, colour ? 4 : 1, shift) };
}
/** A band's rows of the Plates (an export wider than 16,384 px: export-bands.js). */
function producePlatesBand(rctx, job, band) {
    if (job.row.id !== 'plates' || !world) return null;
    const W = rctx.W, n = band.n, shift = rollShift(W, rctx.look.centerLon), colour = job.variant === 'colour';
    return { kind: colour ? 'rgba' : 'gray8', W, H: n, data: rollRows(platesMap(world, W, colour ? 'rgba' : 'id', band.y0, n), W, n, colour ? 4 : 1, shift) };
}
const exportPanel = initEvolutionExport({
    moment: () => (world?.fin && !world.fin.partial ? { frame: world.story, fin: world.fin, seed: code(), cloudSeed: world.seed } : null),
    look: () => ({ lut: heightLutOf(view.palette), exaggeration: pv.SHADING.exaggeration, water: view.water, riverQ: view.riverQ, byRegime: view.byRegime, deposit: view.deposit }),
    centerLon: () => view.centerLon, projection: () => (view.mode === 'map' ? { id: view.projection, opts: view.projOpts } : null), isTouch: IS_TOUCH,
    fine: (fin, _seed, W, onProgress, win = { W, x0: 0, y0: 0, w: W, h: W >> 1 }) => pv.detail.window(fin, world.seed, win, null, onProgress),
    page: 'generate', titleNote: () => '', catalogue: CATALOGUE_WITH_PLATES, produceOwn: producePlates, produceOwnBand: producePlatesBand,
    names: (ctx, opts) => { const c = Math.round(opts.centerLon || 0); return { start: ['orogen', ctx.seed], end: [c ? `c${Math.abs(c)}${c > 0 ? 'E' : 'W'}` : null] }; },
    about: (ctx) => ({ page: 'Generate', planet: `planet code ${ctx.seed}`, link: `https://orogen.studio/generate#${ctx.seed}` }) });
$('exportBtn').addEventListener('click', () => {
    if (world?.fin && !world.fin.partial) { exportPanel.open(); return; }
    // (the maps come from the finished world: a few seconds after the planet)
    pv.hover([world?.finishing ? `The maps are ready once the planet is finished — ${Math.round(100 * world.finishing.share)} %` : 'The maps are ready once the planet is finished']);
    setTimeout(() => pv.hover(null), 2500);
});

// ── stats ──
function stats(msg) {
    const w = world;
    if (msg._ms) console.info(`[generate] first picture in ${(msg._workerTotal / 1000).toFixed(1)} s; the ground's steps (s): ${Object.entries(msg._ms).map(([k, v]) => `${k.trim()} ${(v / 1000).toFixed(2)}`).join(", ")}`);
    $('stats').innerHTML = `Regions: ${w.n.toLocaleString()}<br>Plates: ${w.present?.plates.length ?? '–'} moving, ${w.plateSeeds.length} pieces` +
        (msg._workerTotal ? `<br>First picture in ${(msg._workerTotal / 1000).toFixed(1)} s` : '');
}

// ── the side panel: collapse on a desktop, a bottom sheet on a phone (as before) ──
const panel = sidePanel();
// (a phone's refresh button: two taps for a new world)
(function refreshFab() {
    const btn = $('refreshFab');
    if (!btn) return;
    let armed = false, timer = 0;
    const disarm = () => { armed = false; btn.classList.remove('armed'); clearTimeout(timer); };
    btn.addEventListener('click', () => {
        if (!armed) { armed = true; btn.classList.add('armed'); timer = setTimeout(disarm, 3000); return; }
        disarm();
        panel.collapse();
        generate(undefined, []);
    });
})();

// ── the tutorial, What's New and the survey (as before) ──
tutorial({ key: 'atlas-engine-tutorial-seen', firstDone: genBtn, isTouch: IS_TOUCH,
    touchStep2: '<strong>Drag</strong> to rotate the globe. <strong>Pinch</strong> to zoom in and out. Tap the <strong>edit button</strong> (pencil icon) then <strong>tap</strong> plates to flip them between land and ocean &mdash; select multiple, then hit <strong>Rebuild</strong> to apply all at once. Tap again to undo a pending selection. On the Terrain tab, <strong>Paint</strong> lays a character (mountains, hills, a swamp, an archipelago…) wherever you drag, as a layer you can hide or clear.' });
(function whatsNew() {
    const VERSION = '9', LS_KEY = 'wo-whatsnew-seen', overlay = $('whatsNewOverlay'), card = $('whatsNewCard');
    if (!overlay || !card) return;
    const steps = card.querySelectorAll('.whatsnew-step'), dots = card.querySelectorAll('.dot');
    let current = 0;
    const show = (i) => { current = i; steps.forEach((s, k) => s.classList.toggle('active', k === i)); dots.forEach((d, k) => d.classList.toggle('active', k === i)); $('whatsNewBack').disabled = i === 0; $('whatsNewNext').textContent = i === steps.length - 1 ? 'Got It' : 'Next'; card.scrollTop = 0; };
    const close = () => { overlay.classList.add('hidden'); store.set(LS_KEY, VERSION); };
    $('whatsNewNext').addEventListener('click', () => (current < steps.length - 1 ? show(current + 1) : close()));
    $('whatsNewBack').addEventListener('click', () => { if (current > 0) show(current - 1); });
    $('whatsNewClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
    overlay.classList.add('hidden');
    if (store.get('atlas-engine-tutorial-seen') && store.get(LS_KEY) !== VERSION) genBtn.addEventListener('generate-done', () => { show(0); setTimeout(() => overlay.classList.remove('hidden'), 600); }, { once: true });
})();
(function survey() {
    const LS = 'wo-usage', LS_DISMISSED = 'wo-survey-dismissed';
    if (store.get(LS_DISMISSED)) return;
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
    let data; try { data = JSON.parse(store.get(LS)) || {}; } catch { data = {}; }
    const now = new Date(), hourKey = hash(`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}T${now.getHours()}`), dayKey = hash(`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`);
    const hours = (data.h || 0) + (hourKey !== data.lh ? 1 : 0), days = (data.d || 0) + (dayKey !== data.ld ? 1 : 0);
    store.set(LS, JSON.stringify({ h: hours, d: days, lh: hourKey, ld: dayKey }));
    const overlay = $('surveyOverlay');
    if (hours < 3 || days < 2 || !overlay) return;
    const dismiss = () => { overlay.classList.add('hidden'); store.set(LS_DISMISSED, '1'); };
    genBtn.addEventListener('generate-done', () => setTimeout(() => overlay.classList.remove('hidden'), 1000), { once: true });
    for (const id of ['surveyClose', 'surveyDismiss', 'surveyLink']) $(id)?.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
})();

// ── go: the planet in the link, or a new one ──
const hashParams = location.hash.length > 1 ? decodePlanetCode(location.hash.slice(1).trim()) : null;
if (hashParams) { setSlidersFrom(hashParams); generate(hashParams.seed, hashParams.toggledIndices, false, hashParams.shapes, hashParams.strokes); }
else generate(undefined, []);
