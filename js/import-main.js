// Import, on the shared core (plans/SHARED_CORE_PLAN.md U4): the image's
// heights on Generate's mesh (js/planet-worker.js importShared) shown at once, then finished in the background by
// Evolution's finish — the climate, its rivers (carved as deep as the erosion sliders ask: none at their defaults, the
// heightmap kept as drawn), lakes, the ice age, dunes and loess, the Satellite view and Food — on Evolution's planet view,
// layer bar and export (v2/js/view/planet-view.js, layer-bar.js). No plates and no history, so no Plates or Geology tab.

import Delaunator from 'delaunator';
import { setDelaunator } from './sphere-mesh.js';
import { meshFromArrays } from '../v2/js/core/sim-mesh.js';
import { PlanetView } from '../v2/js/view/planet-view.js';
import { mountLayerBar } from '../v2/js/view/layer-bar.js';
import { FinishService } from '../v2/js/evolution/finish-view.js';
import { terrainFin, finishedFin } from './finish-landing.js';
import { stageClock } from '../v2/js/finish/stage-clock.js';
import { initEvolutionExport } from '../v2/js/evolution/export.js';
import { heightLutOf } from '../v2/js/evolution/looks.js';
import { CLIMATE_LAYERS } from '../v2/js/evolution/climate-view.js';
import { FARMING_LAYERS } from '../v2/js/evolution/farming-view.js';
import { DETAIL_STOPS, fitSlider, stopWords } from './detail-stops.js';
import { buildStarted, buildEnded, WAIT_WORDS } from './build-gate.js';
import { showBuildError, describeFailure, holdControls } from './build-error.js';
import { state } from './state.js';
import { sliderTooltip, detailWarning, progressiveSwitch, redrawFoldedSliders, sidePanel, buildOverlay } from './page-chrome.js';
import { rungView } from './rung-view.js';
import { buildProgress } from './build-progress.js';
import { lakesLabel } from '../v2/js/finish/lake-amount.js';

setDelaunator(Delaunator);

const $ = (id) => document.getElementById(id);
const IS_TOUCH = state.isTouchDevice;

// ── the page: the map's frame, the canvas the window's, the bar (no Plates, no Geology) over it ──
if (!$('mapCanvas')) { const m = document.createElement('canvas'); m.id = 'mapCanvas'; m.hidden = true; $('canvas').after(m); }
Object.assign($('canvas').style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh' });
mountLayerBar({ comes: 'Comes a few seconds after the heightmap', without: ['plates', 'geology'] });

const pv = new PlanetView({ isTouch: IS_TOUCH, gpu: new URLSearchParams(location.search).get('gpu') !== '0', paletteKey: 'orogen.import.palette',
    onChange: () => { dirty = true; updateChip(); }, alive: (fin) => fin === world?.fin });
const view = pv.view;

let world = null, dirty = true, version = 0, building = null;
const finisher = new FinishService();
const overlay = buildOverlay(), panel = sidePanel();
const rungs = rungView(pv, overlay, { width: n => finishWidth(n), climate: () => climateOptions() });   // (the Detail ladder's steps: js/rung-view.js)
const progressive = progressiveSwitch();                               // (off: the chosen Detail alone, no ladder)
const bar = buildProgress();                                           // (the build's progress, bottom right)

// ── the worker ──
let worker = null;
function startWorker() {
    worker = new Worker(new URL('./planet-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: msg }) => {
        if (msg.type === 'progress') { overlay.progress(msg.pct, msg.label); if (building) bar.build(msg.pct, msg.label); return; }
        if (msg.type === 'error') { failed(msg.message); return; }
        if (msg.type === 'rung') { if (building === 'import') rungs.show(msg); return; }
        if (msg.type === 'done' || msg.type === 'reapplyDone') received(msg);
    };
    worker.onerror = (e) => { failed(e.message || 'Worker crashed'); worker.terminate(); startWorker(); };
}
startWorker();
const v = (id) => +($(id)?.value ?? 0);
const sculpt = () => ({ terrainWarp: v('sTw'), smoothing: v('sS'), glacialErosion: v('sGl'), hydraulicErosion: v('sHEr'), thermalErosion: v('sTEr'), ridgeSharpening: v('sRs') });
const climateOptions = () => ({ greenhouseWm2: v('sTmp'), precipScale: Math.max(0, 1 + 0.5 * v('sPrc')), lakes: v('sLk') });   // (lakes: the Lakes slider, lake-amount.js)

function failed(message) {
    console.error('[import] failed:', message);
    buildEnded('import');
    building = null; overlay.active = false; holdControls(false); rungs.clear(); dirty = true;
    importBtn.disabled = !gray; importBtn.textContent = 'Import';
    showBuildError(describeFailure(message, 'import this heightmap'), message); bar.failed();
}
function received(msg) {
    const sh = msg.shared;
    world = { version: ++version, seed: msg.seed, tMesh: meshFromArrays(sh.mesh), meshArrays: sh.mesh, heightKm: sh.heightKm, shade: sh.shade, finishJob: sh.finish, fin: null, finishing: null, problem: null, n: sh.mesh.numCells };
    building = null; dirty = true; rungs.land();                     // (a step's water shown until the world's own lands)
    pv.forget();                                        // (the old world's finished moment let go)
    importBtn.disabled = false; importBtn.textContent = 'Import';
    reapplyBtn.classList.remove('spinning');
    overlay.hide();
    $('stats').innerHTML = `Regions: ${world.n.toLocaleString()}` + (msg._workerTotal ? `<br>First picture in ${(msg._workerTotal / 1000).toFixed(1)} s` : '');
    importBtn.dispatchEvent(new CustomEvent('generate-done'));
    finish(world);
}

// ── the finish (Evolution's) in the background ──
const finishWidth = (n) => (IS_TOUCH ? 2048 : Math.min(8192, Math.max(2048, 2 ** Math.round(Math.log2(4 * Math.sqrt(n))))));
async function finish(w) {
    finisher.cancel();
    const started = performance.now();
    w.fin = null; w.problem = null; w.finishing = { stage: 'starting', share: 0 }; updateChip(); bar.finishing('starting', 0);
    let quiet = false;
    // (how far along: the whole, and the stage under way, timed by the finishes before — finish/stage-clock.js)
    const clock = stageClock({ page: 'import', cells: w.n, onTick: () => { if (world !== w || !w.finishing) return; w.finishing.share = clock.total; updateChip(); bar.finishing(clock.stage, clock.total, clock.task); } });
    const onStage = (s) => { if (world !== w) return; w.finishing = { stage: s, share: w.finishing?.share ?? 0 }; clock.begin(s); };
    const onProgress = (p) => { if (world === w) clock.progress(p); };
    try {
        // (the terrain lands first, the other layers after it: finish-landing.js)
        const onTerrain = (d) => { if (world !== w) return; w.fin = terrainFin(w.n, d); rungs.clear(); dirty = true; updateChip(); console.info(`[import] terrain finished in ${((performance.now() - started) / 1000).toFixed(1)} s`); };
        const res = await finisher.finish({ ...w.finishJob, mesh: w.meshArrays, cells: w.n, width: finishWidth(w.n), climateOptions: climateOptions(), valleyQ: view.riverQ }, { onStage, onProgress, onTerrain, onDrivers: () => { if (world === w) bar.zoomReady(); }, keep: false });
        clock.done(res.ms);
        if (world !== w) return;
        quiet = !!pv.shows(w.fin);                                   // (the terrain shown already: the rest changes nothing on it)
        w.fin = finishedFin(w.n, res, w.fin);
        console.info(`[import] finished in ${((performance.now() - started) / 1000).toFixed(1)} s`);
    } catch (err) {
        if (err.name === 'AbortError' || world !== w) return;
        w.problem = /allocation failed|out of memory/i.test(String(err.message)) ? 'Not enough memory to finish this heightmap — try a lower Detail' : `Could not finish this heightmap: ${String(err.message).split('\n')[0]}`;
        console.error(err);
    } finally {
        clock.stop();
        if (world === w) { w.finishing = null; if (!quiet || rungs.live) dirty = true; if (!building) rungs.clear(); updateChip(); if (!building) bar.done(w.problem); }
        if (world === w && !building) buildEnded('import', !w.problem);
    }
}
function updateChip() {
    const chip = $('climateChip'), w = world, needs = CLIMATE_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer);
    let text = null, act = null;
    if (w?.finishing && needs) text = `Working out the climate, rivers and food… ${Math.round(100 * Math.min(1, w.finishing.share))} %`;
    else if (w?.problem && needs) { text = w.problem; act = 'Try again'; }
    chip.hidden = !text;
    if (text) { $('climateChipText').textContent = text; $('climateChipBtn').hidden = !act; $('climateChipBtn').textContent = act ?? ''; }
    for (const id of ['satellite', 'farming']) document.querySelector(`#mapTabs [data-layer="${id}"]`)?.classList.toggle('locked', !w?.fin || w.fin.partial);
}
$('climateChipBtn').addEventListener('click', () => { if (world?.problem) finish(world); });

// ── drawing, and the hover ──
function tick(now) {
    requestAnimationFrame(tick);
    if (world && dirty && rungs.live) { dirty = false; rungs.repaint(); }    // (a world being built: its step shown)
    if (world && dirty) {
        dirty = false;
        const fin = pv.shows(world.fin);
        pv.syncClouds(fin, world.seed);
        if (fin) pv.paintFinished(fin, false, world.version); else pv.paintLive({ T: { heightKm: world.heightKm, shade: world.shade }, tMesh: world.tMesh });
        pv.syncLegendCard(!!fin);
    }
    pv.updatePatch(now, world && !rungs.live ? pv.shows(world.fin) : null, world?.fin, world?.seed);
    pv.render(now);
}
requestAnimationFrame(tick);
pv.onPointer((e) => {
    const p = world ? pv.placeUnder(e) : null;
    if (!p) { pv.hover(null); return; }
    const r = pv.cellUnder(world.tMesh, p);
    pv.hover(pv.readoutLines({ p, fin: pv.shows(world.fin), heightKm: world.heightKm[r] }));
});

// ── the heightmap: the file, its preview, Import (Earth's at first) ──
const fileInput = $('heightmapFile'), previewCanvas = $('importPreview'), importBtn = $('importBtn');
let gray = null, grayW = 0, grayH = 0;
function loadImage(img, name) {
    grayW = img.width; grayH = img.height;
    const off = document.createElement('canvas'); off.width = grayW; off.height = grayH;
    const octx = off.getContext('2d'); octx.drawImage(img, 0, 0);
    const pw = Math.min(grayW, 400), ph = Math.round(pw * grayH / grayW);
    previewCanvas.width = pw; previewCanvas.height = ph; previewCanvas.getContext('2d').drawImage(img, 0, 0, pw, ph); previewCanvas.style.display = 'block';
    $('importDims').textContent = `${grayW} × ${grayH}`; $('importDims').style.display = 'block';
    if ($('importExpect')) $('importExpect').style.display = 'block';
    const d = octx.getImageData(0, 0, grayW, grayH).data;
    gray = new Uint8Array(grayW * grayH);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]);
    $('importFileName').textContent = name;
    importBtn.disabled = false;
}
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const img = new Image(); img.onload = () => loadImage(img, file.name); img.src = ev.target.result; };
    reader.readAsDataURL(file);
});
importBtn.addEventListener('click', () => {
    if (!gray || building) return;
    building = 'import'; finisher.cancel();
    importBtn.disabled = true; importBtn.textContent = 'Importing…';
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready');
    overlay.show(); bar.start(); panel.collapse();
    const g = new Uint8Array(gray);                                 // (a copy: the worker is handed it)
    const job = { cmd: 'importHeightmap', shared: true, N: DETAIL_STOPS[v('sN')], ...progressive(), jitter: +($('sJ')?.value ?? 0.75), grayscale: g, imageWidth: grayW, imageHeight: grayH, ...sculpt() };
    // (it starts once every tab's builds fit the machine's memory, its place let go when its finish ends: build-gate.js)
    buildStarted('import', job.N, () => overlay.progress(0, WAIT_WORDS)).then(go => { if (go && building === 'import') worker.postMessage(job, [g.buffer]); });
});
{ const img = new Image(); img.onload = () => { loadImage(img, 'Earth (default)'); importBtn.click(); }; img.src = 'assets/earth.png'; }

// ── the sliders: Detail, the sculpting (Reapply), the climate (the finish again) ──
fitSlider($('sN'), 'import');                                        // (Detail ends at this machine's finest stop: detail-stops.js)
const reapplyBtn = $('reapplyBtn'), SCULPT = ['sTw', 'sS', 'sGl', 'sHEr', 'sTEr', 'sRs'];
for (const s of ['sN', ...SCULPT, 'sTmp', 'sPrc', 'sLk']) {
    const slider = $(s);
    if (!slider) continue;
    sliderTooltip(slider);
    slider.addEventListener('input', (e) => {
        const val = +e.target.value, out = $(s.replace('s', 'v'));
        if (s === 'sN') { const d = DETAIL_STOPS[val]; out.textContent = stopWords(d); detailWarning(d, 'import'); }
        else if (s === 'sTmp') out.textContent = `${val > 0 ? '+' : val === 0 ? '±' : '−'}${Math.abs(val)} W/m²`;
        else if (s === 'sPrc') { const pct = Math.round(val * 50); out.textContent = `${pct > 0 ? '+' : pct === 0 ? '±' : ''}${pct}%`; }
        else if (s === 'sLk') out.textContent = lakesLabel(val);
        else out.textContent = e.target.value;
        if (SCULPT.includes(s) && world) { reapplyBtn.disabled = false; reapplyBtn.classList.add('ready'); }
    });
    if (s === 'sTmp' || s === 'sPrc' || s === 'sLk') slider.addEventListener('change', () => { if (world) finish(world); });
}
redrawFoldedSliders();
reapplyBtn.addEventListener('click', () => {
    if (reapplyBtn.disabled || !world || building) return;
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready'); reapplyBtn.classList.add('spinning');
    building = 'reapply'; finisher.cancel();
    worker.postMessage({ cmd: 'reapply', ...sculpt() });
});

// ── the export: Evolution's panel and maps, from the finished heightmap ──
const exportPanel = initEvolutionExport({
    moment: () => (world?.fin && !world.fin.partial ? { frame: { time: 0 }, fin: world.fin, seed: 'import', cloudSeed: world.seed } : null),
    look: () => ({ lut: heightLutOf(view.palette), exaggeration: pv.SHADING.exaggeration, water: view.water, riverQ: view.riverQ, byRegime: view.byRegime, deposit: view.deposit }),
    centerLon: () => view.centerLon, projection: () => (view.mode === 'map' ? { id: view.projection, opts: view.projOpts } : null), isTouch: IS_TOUCH,
    fine: (fin, _seed, W, onProgress, win = { W, x0: 0, y0: 0, w: W, h: W >> 1 }) => pv.detail.window(fin, world.seed, win, null, onProgress),
    page: 'import', titleNote: () => '',
    names: (ctx, opts) => { const c = Math.round(opts.centerLon || 0); return { start: ['orogen', 'import'], end: [c ? `c${Math.abs(c)}${c > 0 ? 'E' : 'W'}` : null] }; },
    about: () => ({ page: 'Import', planet: 'an imported heightmap', link: null }) });
$('exportBtn').addEventListener('click', () => {
    if (world?.fin && !world.fin.partial) { exportPanel.open(); return; }
    pv.hover([world?.finishing ? `The maps are ready once the heightmap is finished — ${Math.round(100 * world.finishing.share)} %` : 'The maps are ready once the heightmap is finished']);
    setTimeout(() => pv.hover(null), 2500);
});
