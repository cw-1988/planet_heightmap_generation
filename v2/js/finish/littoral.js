// The shore's own forms (docs/coast-processes.md), from what the sea does to each coast (finish-coast.js: its waves, its
// tide, its sand — the drivers wave, tide, sand): where the waves are strong and the rock stands steep, a cliff, cut back
// over a wave-cut platform; where sand is given and the waves bring it in, a beach, its berm, its dunes, its shoreface
// eased to equilibrium (Dean); where a big tide meets calm water, mud — tidal flats out to the low-tide line, salt marsh
// above them. The heights get the forms (fine-detail.js, by a window's pixels: they show once a pixel is smaller than
// them); the colours (finish-view.js, climate-view.js) get them at their true size — each band the share of a pixel it
// covers, measured from the shore found to a fraction of a pixel, its inner edge feathered: from far out a coast is no
// drawn line, and close up a beach fades into what lies behind it. On warm coasts (the winter's sea warm enough), coral
// reefs fringe the shore where the water is clear, and mangroves take the calm, muddy shore (docs/coral-reefs-mangroves.md);
// spits and barrier islands are built where the waves carry sand along it (coast-drift.js).

import { chamfer, chamferSteps } from './coast-distance.js';
import { drain } from '../core/steps.js';
import { LOOK } from '../view/look-config.js';
import { rowCos } from './shore-ramp.js';
import { driftForms } from './coast-drift.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = x => (x < 0 ? 0 : x > 1 ? 1 : x);

export const LITTORAL = {
    mudTideM: [2, 5], mudCalm: [0.25, 0.55],   // mud: a tide of this range (m, none … all), in water this calm (waves 0 … 1, all … none)
    cliffSlope: [0.03, 0.15], cliffRugged: [0.08, 0.6],   // a cliff: ground this steep at the coast (km per km), or this rugged (km)
    beachKm: 0.06, beachWaveKm: 0.18,          // a beach this wide, plus this much more on an exposed coast
    flatKmPerM: 0.35, marshKmPerM: 0.12,       // tidal flats out, marsh in, this wide per metre of tide
    cliffFaceKm: 0.05, platformKm: 0.35, retreatKm: 0.45,   // a cliff's face; the platform at its foot; how far it is cut back
    feather: 0.45,                             // each band's inner edge eased over this share of its width
    deanA: 0.1, deanKm: 3, shareMax: 0.8,
    // the beach's colour across the shore (x: from the shoreline in its widths, + land): sand from the swash out at sea
    // (sea[0] … sea[1]) to the dry beach, fading into the land (land[0] … land[1]). One sand colour throughout: a darker
    // wet strip read as a brown-grey line along the shore ("brown to mud to land", the owner, 2026-11-20). Full at the
    // waterline: the shallows' bed shows sand up to it, so a ramp ending inland let the land through as a dark thread
    profile: { sea: [-0.8, 0], land: [0.4, 1.7] },
    // from ×1 the beach is at least (1 + log2(×))/3 × (farPx + px × (refKm / a screen pixel's km)^pow) screen pixels wide
    // (×1: about 8 at 100 m a pixel, 3 at 580 m, 2 at 2.7 km; ×4: 24, 9, 5; below ×1 none, the true width). At ×1 the
    // true 60–240 m was under a pixel at every zoom, so the beach was a faint line whatever its opacity (the owner,
    // 2026-11-21: "a simple double transition... from ocean to sand to land", docs/beach-look.md)
    beachFloor: { px: 21, farPx: 3, refKm: 0.1, pow: 0.7, tilePerDev: 2 ** 0.25, tileMaxPerDev: 2 ** 0.75, maxPx: 85 },
    // the beach's bytes kept at least this many pixels from the shore (and out to beachReachKm); the distance in pixels as
    // its signed square root × beachDistK (fine near the shore, out to (127/beachDistK)² ≈ 161 px)
    beachReachPx: 22, beachDistK: 10,
    beachWidthMax: 5,                         // (the Beach width slider's widest, beach-controls.js: the reach in km holds it too)
    tideMaxM: 12,                             // (the tide driver's 255: finish-coast.js COAST.tideMaxM)
    winterC: [-10, 35],                        // (the winter driver's 0 … 255: finish-coast.js COAST.winterC)
    reefC: [17.5, 20.5], reefKm: [0.25, 0.9], reefCrest: 0.25,   // reefs: a winter sea this warm (°C, none … all); this wide (calm … exposed); its crest the outer share
    reefMud: [0.1, 0.4],                       // … and none in water this muddy (the rivers' mud, none lost … all)
    mangroveC: [16, 20], mangroveCalm: [0.3, 0.6], mangroveKm: 0.15, mangroveKmPerM: 0.25,   // mangroves: a winter this warm, water this calm; this wide, plus per metre of tide
    rgb: { sand: [200, 188, 154], mud: [122, 112, 92], marsh: [118, 124, 86], rock: [146, 138, 124], mangrove: [46, 70, 40],
        gravel: [128, 124, 116] },
    gravelC: [2, -8],                          // a beach of gravel, not sand, as the winter's sea is this cold (°C, none … all): docs/beach-look.md
};
const Lt = LITTORAL, F = Lt.beachFloor;
/** The beach's least width in pixels pxKm wide, k of them a screen pixel (detail-view.js: tiles 0.84–1.68× the device's). */
export const beachFloorPx = (pxKm, kw, k = F.tilePerDev * Math.min(globalThis.devicePixelRatio || 1, 1.5)) =>
    Math.max(0, Math.min(F.maxPx, k * (1 + Math.log2(kw)) / 3 * (F.farPx + F.px * (F.refKm / (pxKm * k)) ** F.pow)));
/** How far (km) the beach's bytes are kept: the widest beach (any screen, its floor) and its fade (cut sooner, a hard edge). */
export const beachReachKm = pxKm => Lt.profile.land[1] * 1.05 * Math.max(Lt.beachWidthMax * (Lt.beachKm + Lt.beachWaveKm),
    beachFloorPx(pxKm, Lt.beachWidthMax, F.tileMaxPerDev * 1.5) * pxKm) + 2 * pxKm;
// (two bytes, 8 high and 4 low: one byte stepped ~1.4 px at 50 px out, faint contours across a close-up beach's fade)
const DIST_MAX_PX = (126 / Lt.beachDistK) ** 2;
function putDist(lit, o, dPx) {
    const v = Math.max(0, Math.min(65535, Math.round(256 * (128 + Math.sign(dPx) * Lt.beachDistK * Math.sqrt(Math.abs(dPx))))));
    lit[o + 8] = v >> 8; lit[o + 4] = v & 255;
}
const getDist = (lit, l) => { const e = (lit[l + 8] + lit[l + 4] / 256 - 128) / Lt.beachDistK; return Math.sign(e) * e * e; };
/** How the beach is drawn where a coast has one (fixed in view/look-config.js, once the view strip's Beach sliders, docs/beach-look.md) — applied as it is
 *  painted, so a change repaints without building the tiles again: its width × (how far it eats into the land), its
 *  opacity (0 … 1, 1 every beach in full), and which side of the shore it lies on (−1 out over the sea … +1 on the land,
 *  as made). The heights' berm keeps its own width. */
export const BEACH_LOOK = { width: LOOK.beachWidth, alpha: LOOK.beachAlpha, shift: LOOK.beachShift };
/** Bytes a pixel of the shore's colours: sand (the surf's, a reef's flat, a barrier's), mud (marsh on land, flats at sea),
 *  rock, foam, reef, mangrove; then the beach's own — its strength, its width (log2 of its pixels, ×10 + 128), the
 *  pixel's distance from the shore (in pixels: its signed square root × beachDistK + 128, its fraction in byte 4) — and
 *  the cold (gravel). */
export const LIT_N = 10;
const KN = 9;   // (shapeLittoral's per-pixel store: beach, mud, cliff, wave, tide, reef, mangrove, sand, winter °C)
const byte = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** How much of a coast is mud (tidal flats, marsh): a big tide in calm water. */
export const mudShare = (wave, tideM) => smooth(Lt.mudTideM[0], Lt.mudTideM[1], tideM) * (1 - smooth(Lt.mudCalm[0], Lt.mudCalm[1], wave));

/** A coast's kinds (into cls: beach, mud, cliff, reef, mangrove — 0 … 1 each) from its waves (0 … 1), tide (m), sand
 *  (0 … 1), the ground's slope (km per km), how rugged (km), the rock's hardness (0 … 1), the winter's sea (°C), the
 *  rivers' mud in the water (0 … 1) and the year's rain (the wet driver, 0 … 1). Mangroves: frost-free (a winter of
 *  16 … 20 °C at sea level), sheltered water, on mud or in muddy water, thinner where dry; they take the place of the salt
 *  marsh and most of the beach. Reefs: a winter sea of 17.5 … 20.5 °C or warmer, clear water (no river's mud), not on mud. */
export function coastClasses(wave, tideM, sand, slope, rugKm, hard, cls, winterC = -99, muddy = 0, wet = 0.5) {
    const mud = mudShare(wave, tideM);
    const cliff = wave * Math.max(smooth(Lt.cliffSlope[0], Lt.cliffSlope[1], slope), smooth(Lt.cliffRugged[0], Lt.cliffRugged[1], rugKm)) * (0.5 + 0.5 * hard) * (1 - 0.6 * sand) * (1 - mud);
    const mg = smooth(Lt.mangroveC[0], Lt.mangroveC[1], winterC) * (1 - smooth(Lt.mangroveCalm[0], Lt.mangroveCalm[1], wave))
        * Math.max(mud, smooth(0.15, 0.6, muddy), 0.5) * (0.35 + 0.65 * smooth(0.2, 0.45, wet)) * (1 - cliff);
    const reef = smooth(Lt.reefC[0], Lt.reefC[1], winterC) * (1 - smooth(Lt.reefMud[0], Lt.reefMud[1], muddy)) * (1 - 0.8 * mud) * (1 - 0.5 * mg);
    cls[0] = sand * (0.35 + 0.65 * wave) * (1 - cliff) * (1 - mud) * (1 - 0.8 * mg);
    cls[1] = mud; cls[2] = cliff; cls[3] = reef; cls[4] = mg;
    return cls;
}
/** The winter driver's byte share (0 … 1) as °C. */
export const winterOf = s => Lt.winterC[0] + s * (Lt.winterC[1] - Lt.winterC[0]);
const reefWidth = wave => Lt.reefKm[0] + (Lt.reefKm[1] - Lt.reefKm[0]) * wave;
const mangroveWidth = tideM => Lt.mangroveKm + Lt.mangroveKmPerM * tideM;
/** A warm coast's cover (mangroves, a reef's flat) as drawn: its true width, and at least the beach's floor at ×1
 *  (beachFloorPx: about 2–8 screen pixels). At their true 0.3–1 km they were a few per cent of a pixel at almost every
 *  zoom, so a third of the warm coasts had mangroves no one could see (v2/tools/probe-mangroves.mjs; the owner,
 *  2026-11-22: "i dont really see them anywhere"). Every cover band goes through this; the heights keep the true width. */
const coverKm = (wKm, pxKm) => Math.max(wKm, beachFloorPx(pxKm, 1) * pxKm);

/** How much of a pixel (its centre xKm from the shore, pxKm wide) a band covers: full from the shore to near wKm, its inner
 *  edge eased out over f × wKm (a trapezoid, integrated over the pixel — so its true share at any zoom, no floor). */
function band(wKm, xKm, pxKm, f = Lt.feather) {
    if (!(wKm > 0)) return 0;
    const F = f * wKm, w1 = wKm - 0.5 * F, w2 = wKm + 0.5 * F;
    const I = t => (t <= 0 ? 0 : t <= w1 ? t : t < w2 ? t - (t - w1) ** 2 / (2 * F) : wKm);
    return clamp((I(xKm + 0.5 * pxKm) - I(xKm - 0.5 * pxKm)) / pxKm);
}

/** One pixel's colours of the shore into lit[LIT_N·q…]: sand, mud (marsh on land, flats at sea), rock (a cliff's face,
 *  its platform), surf, reef (its crest), mangrove (0 … 255 each). dKm: from the shore, + on land, − at sea
 *  (shoreDistance). A reef: its flat behind the crest pale sand under shallow water, its crest coral, the surf breaking on
 *  the crest rather than the shore. Mangroves: a dark forest from the shore inland, and a fringe standing in the water. */
export function litAt(lit, q, cls, wave, tideM, dKm, pxKm, winterC = null) {
    const [beach, mud, cliff, reef, mg] = cls, o = LIT_N * q, S = 255 * Lt.shareMax, wM = coverKm(mangroveWidth(tideM), pxKm);
    // (the beach itself: kept as its strength, width and distance, banded as it is painted — paintLittoral, BEACH_LOOK)
    const wB = Lt.beachKm + Lt.beachWaveKm * wave, dPx = dKm / pxKm;
    // (the distance kept for every pixel in reach, a beach or not: carryBeach may give it its shore's beach)
    if (Math.abs(dPx) < DIST_MAX_PX) {
        putDist(lit, o, dPx);
        if (beach > 0) { lit[o + 6] = byte(255 * beach); lit[o + 7] = byte(128 + 10 * Math.log2(wB / pxKm)); }
    }
    lit[o + 9] = winterC === null ? 0 : byte(255 * smooth(Lt.gravelC[0], Lt.gravelC[1], winterC));
    if (dKm >= 0) {
        lit[o] = 0;
        lit[o + 1] = S * mud * (1 - mg) * band(Lt.marshKmPerM * tideM, dKm, pxKm);
        lit[o + 2] = 0.6 * S * cliff * band(Lt.cliffFaceKm, dKm, pxKm);
        lit[o + 3] = 0;
        lit[o + 5] = S * mg * band(wM, dKm, pxKm);
    } else {
        // (no drawn surf, foam or reef crest: each read as a jagged line along the coast — the owner, 2026-11-20. The beach's
        // sand under the swash is the beach's profile, paintLittoral; the sea's own bed is sand, finish-view.js paintSea. A
        // reef is its pale flat fading out under the water, its crest only in the heights.)
        const x = -dKm;
        lit[o] = 0.6 * S * reef * band(coverKm(reefWidth(wave), pxKm), x, pxKm, 1.6);
        lit[o + 1] = 0.8 * S * mud * band(Lt.flatKmPerM * tideM, x, pxKm, 1.2);
        lit[o + 2] = 0.5 * S * cliff * band(Lt.platformKm, x, pxKm, 1.2);
        lit[o + 3] = 0;
        lit[o + 5] = S * mg * band(0.3 * wM, x, pxKm);
    }
}

/**
 * The beach's strength and width (lit bytes 6, 7) carried out from the shore along the distance, in place: each pixel past
 * the first takes the mean of its neighbours nearer the shore on its own side (strength) and their strength-weighted
 * width. Read at each pixel's own slope, the beach went out where the land
 * rose behind it (coastClasses: a slope reads as a cliff) — a hard edge into the land however soft the profile's fade
 * (the owner, 2026-11-20: "WHERE IS THE TRANSPARENCY TRANSITION INTO THE LAND"). The shore decides its beach, once.
 */
export function carryBeach(lit, dist, w, h, pxKm, lim, wrap = false) { drain(carryBeachSteps(lit, dist, w, h, pxKm, lim, wrap)); }
/** carryBeach a few rows at a time (core/steps.js). Its pixels in order of their distance by a radix sort on the
 *  distance's bits (a float's bits sort as the float does, ≥ 0) — the order a comparison sort gives, up to ties, and a
 *  pixel reads only neighbours strictly nearer: the same beaches. */
export function* carryBeachSteps(lit, dist, w, h, pxKm, lim, wrap = false) {
    const N = w * h, f32 = dist instanceof Float32Array ? dist : Float32Array.from(dist), bits = new Uint32Array(f32.buffer, f32.byteOffset, N), STEP = 1 << 16;
    let m = 0;
    for (let p = 0; p < N; p++) { const a = Math.abs(dist[p]); if (a > pxKm && a < lim) m++; if ((p & (STEP - 1)) === 0) yield; }
    let ord = new Uint32Array(m), key = new Uint32Array(m), ord2 = new Uint32Array(m), key2 = new Uint32Array(m);
    for (let p = 0, k = 0; p < N; p++) {
        const a = Math.abs(dist[p]);
        if (a > pxKm && a < lim) { ord[k] = p; key[k++] = bits[p] & 0x7FFFFFFF; }
        if ((p & (STEP - 1)) === 0) yield;
    }
    // (least significant digit first, 11 bits a pass: each pass stable)
    for (const shift of [0, 11, 22]) {
        const count = new Uint32Array(2049);
        for (let k = 0; k < m; k++) count[((key[k] >>> shift) & 0x7FF) + 1]++;
        for (let b = 0; b < 2048; b++) count[b + 1] += count[b];
        yield;
        for (let k = 0; k < m; k++) {
            const at = count[(key[k] >>> shift) & 0x7FF]++;
            ord2[at] = ord[k]; key2[at] = key[k];
            if ((k & (STEP - 1)) === 0) yield;
        }
        [ord, ord2] = [ord2, ord]; [key, key2] = [key2, key];
    }
    for (let k = 0; k < m; k++) {
        if ((k & 4095) === 0) yield;
        const p = ord[k];
        const i = p % w, j = (p - i) / w, a = Math.abs(dist[p]), land = dist[p] > 0;
        let n = 0, sB = 0, sW = 0;
        for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= h) continue;
            for (let di = -1; di <= 1; di++) {
                let ii = i + di;
                if (wrap) ii = (ii + w) % w; else if (ii < 0 || ii >= w) continue;
                const q = jj * w + ii;
                if ((dist[q] > 0) !== land || !(Math.abs(dist[q]) < a)) continue;
                const B = lit[LIT_N * q + 6];
                n++; sB += B; sW += B * lit[LIT_N * q + 7];
            }
        }
        if (!n) continue;
        const o = LIT_N * p, B = sB / n;
        if (!(B >= 0.5) || !(a < DIST_MAX_PX * pxKm)) { lit[o + 6] = 0; continue; }
        lit[o + 6] = byte(B); lit[o + 7] = byte(sW / sB); putDist(lit, o, dist[p] / pxKm);
    }
}

/**
 * The signed distance to the shore (km, + land, − sea; in place over `dist`, the chamfer of the sea mask), to a fraction
 * of a pixel: within two pixels of the coast, the heights' 0 m contour by their slope (|h| / |∇h|), held inside the
 * chamfer's own error — so a band follows the coast's true curve, not the pixels' staircase. A hollow below 0 m the sea
 * does not reach (its height's sign against its mask) keeps the chamfer. wrap: the rows wrap east–west (the world).
 */
export function shoreDistance(dist, h, sea, w, hh, pxKm, cosLa, wrap = false) { return drain(shoreDistanceSteps(dist, h, sea, w, hh, pxKm, cosLa, wrap)); }
/** shoreDistance a row at a time (core/steps.js). */
export function* shoreDistanceSteps(dist, h, sea, w, hh, pxKm, cosLa, wrap = false) {
    for (let j = 0; j < hh; j++) {
        yield;
        const ax = pxKm * Math.max(0.05, cosLa[j]), j0 = Math.max(0, j - 1), j1 = Math.min(hh - 1, j + 1);
        for (let i = 0; i < w; i++) {
            const p = j * w + i, d = dist[p], ad = Math.abs(d), v = h[p];
            if (!(ad < 2 * pxKm) || (sea[p] ? v >= 0 : v <= 0)) continue;
            const i0 = wrap ? (i - 1 + w) % w : Math.max(0, i - 1), i1 = wrap ? (i + 1) % w : Math.min(w - 1, i + 1);
            const gE = (h[j * w + i1] - h[j * w + i0]) / (((i1 - i0 + w) % w || 1) * ax);
            const gN = (h[j0 * w + i] - h[j1 * w + i]) / ((j1 - j0 || 1) * pxKm);
            const g = Math.hypot(gE, gN);
            if (!(g > 1e-9)) continue;
            dist[p] = Math.sign(d) * Math.min(ad + 0.5 * pxKm, Math.max(Math.max(0, ad - 0.75 * pxKm), Math.abs(v) / g));
        }
    }
    return dist;
}

/**
 * A fine window's shore shaped (on its margin grid, in place: hf km, sea 0/1) and coloured. ctx: { ew, eh, pxKm, cosLa,
 * at, val (fine-detail.js's driver readers), d (the drivers), gE, gN (the picture's slope), lith (rock-props, or null),
 * lim (how far from the shore to look, km), place, P, seed (for the drift's forms, coast-drift.js) }.
 * @returns {Uint8Array} LIT_N bytes a pixel of the margin grid (litAt)
 */
export function shapeLittoral(hf, sea, ctx) {
    const { ew, eh, pxKm, cosLa, at, val, d, gE, gN, lith } = ctx, N = ew * eh, lim = ctx.lim;
    let dist = chamfer(sea, ew, eh, pxKm, cosLa);
    // (each pixel near the shore: its kinds, waves and tide; a moment finished before the warm coasts' drivers: none)
    const near = [], K = new Float32Array(KN * N), cls = [0, 0, 0, 0, 0], warm = !!d.winter;
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i;
        if (!(Math.abs(dist[p]) < lim)) continue;
        at(j, i);
        const wave = val(d.wave), tideM = val(d.tide) * Lt.tideMaxM, sand = val(d.sand);
        if (!(wave + tideM + sand > 0)) continue;
        const hard = lith ? 0.5 + (lith.hard[p] - 0.5) * smooth(0, 0.5, lith.land[p]) : 0.5;
        coastClasses(wave, tideM, sand, Math.hypot(gE[p], gN[p]), 2 * val(d.rugged), hard, cls,
            warm ? winterOf(val(d.winter)) : -99, warm ? val(d.muddy) : 0, d.wet ? val(d.wet) : 0.5);
        const k = KN * p;
        K[k] = cls[0]; K[k + 1] = cls[1]; K[k + 2] = cls[2]; K[k + 3] = wave; K[k + 4] = tideM; K[k + 5] = cls[3]; K[k + 6] = cls[4]; K[k + 7] = sand;
        K[k + 8] = warm ? winterOf(val(d.winter)) : NaN;
        near.push(p);
        const x = Math.abs(dist[p]), [beach, mud, cliff, reef, mg] = cls;
        let v = hf[p];
        if (dist[p] > 0) {
            // land: a cliff cut back (its foot a wave-cut platform, 2 … 8 m down, the sea's now); a beach's berm and its
            // dunes behind; marsh settled to the high tide
            const wR = Lt.retreatKm * cliff * (1.3 - hard), wb = Lt.beachKm + Lt.beachWaveKm * wave, wm = Lt.marshKmPerM * tideM * mud;
            if (x < wR) { hf[p] = -(0.002 + 0.006 * (1 - x / wR)); sea[p] = 1; continue; }
            // (the berm eased in and out smoothly, its slope rising on into the land: it ended at wb in a step, and a dune
            // ridge stood behind it — both shaded as dark lines along the coast, the owner, 2026-11-20). Only raised: sand laid
            // down, never a cut — pulled toward its few metres, a higher coast was carved into a terrace whose walls the
            // hillshade drew as hard pale and dark bands along the shore ("wtf is that ugly band", 2026-11-20)
            const tb = 0.001 + 0.003 * x / wb;
            if (beach > 0 && x < 3 * wb && v < tb) v += (tb - v) * 0.8 * beach * (1 - smooth(wb, 3 * wb, x));
            if (x < wm) v += (0.0005 * tideM - v) * 0.8 * mud * (1 - smooth(0.01, 0.03, v));
            // (the mangroves' mud, trapped among their roots: held near the high tide, as the marsh)
            if (mg > 0 && x < mangroveWidth(tideM)) v += (0.0003 + 0.0004 * tideM - v) * 0.8 * mg * (1 - smooth(0.01, 0.03, v));
            hf[p] = Math.max(0.0005, v);
        } else {
            // sea: the shoreface eased toward Dean's profile; the flats raised toward the low tide; the platform's shallows;
            // a reef's flat a couple of metres down, its crest at the low tide (raised only: a reef grows up, not down)
            const wf = Lt.flatKmPerM * tideM * mud, wp = Lt.platformKm * cliff, wR = reefWidth(wave);
            const dean = -Lt.deanA * (1000 * x) ** (2 / 3) / 1000;
            v += (dean - v) * 0.5 * sand * (0.3 + 0.7 * wave) * (1 - smooth(0.5 * Lt.deanKm, Lt.deanKm, x));
            if (x < wf) v += (-0.0005 * tideM * x / wf - v) * 0.85 * mud;
            if (x < wp) { const t = -(0.003 + 0.009 * x / wp); if (v < t) v += (t - v) * 0.7 * cliff; }
            if (reef > 0 && x < 1.1 * wR) {
                const t = -0.002 + 0.0014 * smooth((0.9 - 1.2 * Lt.reefCrest) * wR, (1 - Lt.reefCrest) * wR, x);
                if (v < t) v += (t - v) * 0.85 * reef * (1 - smooth(0.95 * wR, 1.1 * wR, x));
            }
            hf[p] = Math.min(-0.0002, v);
        }
    }
    // (the sand carried along the shore: spits off its headlands, barrier islands off its low coasts — coast-drift.js)
    const isle = driftForms(hf, sea, dist, K, KN, ctx);
    // (the shore moved where cliffs were cut back and islands built: measured again, then coloured)
    dist = shoreDistance(chamfer(sea, ew, eh, pxKm, cosLa), hf, sea, ew, eh, pxKm, cosLa);
    const lit = new Uint8Array(LIT_N * N), S = 255 * Lt.shareMax;
    for (const p of near) {
        const k = KN * p;
        cls[0] = K[k]; cls[1] = K[k + 1]; cls[2] = K[k + 2]; cls[3] = K[k + 5]; cls[4] = K[k + 6];
        litAt(lit, p, cls, K[k + 3], K[k + 4], dist[p], pxKm, K[k + 8] === K[k + 8] ? K[k + 8] : null);
        if (isle && isle[p] > 0) lit[LIT_N * p] = Math.max(lit[LIT_N * p], S * isle[p]);
    }
    carryBeach(lit, dist, ew, eh, pxKm, lim);
    return lit;
}

/**
 * The world picture's shore colours (paintFinished): r the moment's picture (its drivers), p the picture shown at width W
 * (finish-view.js rasterAt: h km, sea). Null without the coast's drivers (a moment finished before them).
 * @returns {Uint8Array|null} LIT_N bytes a pixel (litAt)
 */
export function worldLittoral(r, p, W) { return drain(worldLittoralSteps(r, p, W)); }
/** worldLittoral a row at a time (core/steps.js). */
export function* worldLittoralSteps(r, p, W) {
    const d = r.drivers;
    if (!d?.wave) return null;
    const H = W >> 1, pxKm = 2 * Math.PI * 6371 / W, cosLa = rowCos(W, 0, H), h = p.h, warm = !!d.winter;
    const dist = yield* shoreDistanceSteps(yield* chamferSteps(p.sea, W, H, pxKm, cosLa), h, p.sea, W, H, pxKm, cosLa, true);
    // (out to the widest beach's fade into the land, beachReachKm)
    const lit = new Uint8Array(LIT_N * W * H), cls = [0, 0, 0, 0, 0], lim = Math.max(beachReachKm(pxKm), Lt.beachReachPx * pxKm, 1);
    // (the drivers read bilinearly — a nearest read changed a coast's kind in blocks of the drivers' pixels)
    const bil = (f, a, b, c, e, wa, wb, wc, we) => (wa * f[a] + wb * f[b] + wc * f[c] + we * f[e]) / 255;
    for (let y = 0; y < H; y++) {
        yield;
        const cl = Math.max(0.05, cosLa[y]), up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W;
        const v = Math.min(d.h - 1, Math.max(0, (y + 0.5) * d.h / H - 0.5)), y0 = Math.floor(v), fy = v - y0;
        const r0 = y0 * d.w, r1 = Math.min(d.h - 1, y0 + 1) * d.w;
        for (let x = 0; x < W; x++) {
            const q = y * W + x;
            if (!(Math.abs(dist[q]) < lim)) continue;
            const u = (x + 0.5) * d.w / W - 0.5, x0 = Math.floor(u), fx = u - x0, c0 = (x0 + d.w) % d.w, c1 = (x0 + 1) % d.w;
            const a = r0 + c0, b = r0 + c1, c = r1 + c0, e = r1 + c1;
            const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, we = fx * fy;
            const wave = bil(d.wave, a, b, c, e, wa, wb, wc, we), tideM = bil(d.tide, a, b, c, e, wa, wb, wc, we) * Lt.tideMaxM;
            const sand = bil(d.sand, a, b, c, e, wa, wb, wc, we);
            if (!(wave + tideM + sand > 0)) continue;
            const ge = (h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W]) / (2 * pxKm * cl), gn = (h[up + x] - h[dn + x]) / (2 * pxKm);
            const wC = warm ? winterOf(bil(d.winter, a, b, c, e, wa, wb, wc, we)) : null;
            coastClasses(wave, tideM, sand, Math.hypot(ge, gn), 2 * bil(d.rugged, a, b, c, e, wa, wb, wc, we), 0.5, cls,
                warm ? wC : -99, warm ? bil(d.muddy, a, b, c, e, wa, wb, wc, we) : 0,
                d.wet ? bil(d.wet, a, b, c, e, wa, wb, wc, we) : 0.5);
            litAt(lit, q, cls, wave, tideM, dist[q], pxKm, wC);
        }
    }
    yield* carryBeachSteps(lit, dist, W, H, pxKm, lim, true);
    return lit;
}

/**
 * A pixel already painted (out[o…o+2]) given its shore's colours (lit, pixel q: litAt), in its light kk: on land sand,
 * marsh and a cliff's rock over the land's colour (none over snow and ice — the colour already near white); in the sea
 * a reef's pale flat, the flats' mud and the platform's rock showing where the water is clear (a: the water's share over
 * its bed, shore-ramp.js shoreOpacity); the beach's profile across the shore (beachProfile); the mangroves' canopy over
 * the water, not under it.
 */
export function paintLittoral(out, o, lit, q, wet, a, kk, pxKm, rgb = Lt.rgb) {   // (rgb: the palette's, shore-colours.js)
    const l = LIT_N * q, s = lit[l], m = lit[l + 1], k = lit[l + 2], mg = lit[l + 5], B = lit[l + 6];
    if (!(s | m | k | mg | B)) return;
    const { sand, mud, marsh, rock, mangrove, gravel } = rgb;
    const lum = clamp((215 - (0.3 * out[o] + 0.59 * out[o + 1] + 0.11 * out[o + 2])) / 40), g = wet ? 1 - 0.8 * a : lum;
    const cold = lit[l + 9] / 255;
    let sc = sand;
    if (cold) { for (let ch = 0; ch < 3; ch++) GRAVEL_MIX[ch] = sand[ch] + (gravel[ch] - sand[ch]) * cold; sc = GRAVEL_MIX; }
    if (k) mix(out, o, rock, kk, g * k / 255);
    if (m) mix(out, o, wet ? mud : marsh, kk, g * m / 255);
    if (s) mix(out, o, sc, kk, Math.min(1, BEACH_LOOK.alpha) * g * s / 255);
    if (B) beachProfile(out, o, lit, l, B, sc, kk, wet ? 1 : lum, pxKm);
    if (mg) mix(out, o, mangrove, kk, (wet ? 1 : lum) * mg / 255);
}

/**
 * The beach as one transition from the sea to the land (docs/beach-look.md): the sea's water thinning over the swash's wet
 * sand, the wet sand darker, drying to the pale beach, the beach fading into the land behind it. No band, no edge: each
 * step a smooth ramp across the shore, averaged over the pixel (samples enough for a beach a tenth of a pixel wide). In
 * pixels: the beach's width W (its true one × the width slider, and from ×1 at least its zoom's floor, beachFloorPx —
 * wider close up, narrower from far out); the side slider moves the whole profile out over the sea by
 * (1 − side)/2 of W. At 100% opacity the beach is solid wherever the coast's beach share reaches BEACH_FULL.
 */
function beachProfile(out, o, lit, l, B, sc, kk, gate, pxKm) {
    const r = 2 ** ((lit[l + 7] - 128) / 10), dPx = getDist(lit, l), { width: kw, shift: sh, alpha: A } = BEACH_LOOK;
    const W = Math.max(r * kw, beachFloorPx(pxKm, kw), 0.02), u0 = (dPx + (1 - sh) / 2 * W) / W, P = Lt.profile;
    const n = Math.min(32, Math.max(4, Math.ceil(6 / W))), du = 1 / (W * n);
    let p = 0;
    for (let i = 0; i < n; i++) {
        const u = u0 + (i + 0.5 - 0.5 * n) * du;
        p += smooth(P.sea[0], P.sea[1], u) * (1 - smooth(P.land[0], P.land[1], u));
    }
    if (!(p > 0)) return;
    // (at 100% a coast with a beach shows it in full, ocean → sand → land; only a coast with barely any beach fades out.
    // The sand was the coast's share × shareMax, often 15–40%, so at 100% most beaches were a faint line and only an
    // extra "+100% solid" range showed them: the owner, 2026-11-21, docs/beach-look.md)
    const t = gate * (p / n) * Math.min(1, A) * smooth(0, BEACH_FULL, B / 255);
    mix(out, o, sc, kk, t);
}
const GRAVEL_MIX = [0, 0, 0];
const BEACH_FULL = 0.3;   // (a coast's beach share from which its beach is drawn in full)
const mix = (out, o, c, kk, t) => { if (t > 0) for (let ch = 0; ch < 3; ch++) out[o + ch] += (Math.min(255, c[ch] * kk) - out[o + ch]) * t; };
