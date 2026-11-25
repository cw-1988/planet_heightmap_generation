// The States overlay (fork addition): the States view's map laid over every other view — Terrain, Satellite, the
// climate, Food — as each state's border in its own colour (the land itself left as the view paints it), its regions'
// borders finer and darker, the state's name across its land, its regions' names across theirs, and its capital's and
// towns' names beside their pins. The owner, 2026-11-24: "an empires overlay for other tabs, like terrain, satellite
// etc? i mean transparent color overlay, colored borders, name of the empire as a text within empire border, name of
// cities/capitals hovering next to them"; then, the same day: "the states overlay for satellites and other tabs is a
// bit much, remove that and just use border colors" — the tint went, the borders stayed; then the tint came back as the
// view strip's Tint slider, none by default, for a middle ground between the view and the States view's colours.
//
// Two halves:
// - The borders, drawn into the planet's own picture through PlanetView's `extraLines` (drawStatesTint):
//   the whole planet from one cached picture (2,048 px wide on a desktop, the land alone), a zoomed-in tile worked out
//   pixel by pixel at its own size, so the borders stay a pixel or two wide on the screen at every zoom.
// - The names, in client pixels on one layer over the canvas (statesLabels), placed each frame from the globe's or the
//   map's view (globe.frameView), never on top of each other: the capitals first, then the
//   cities, towns, forts and villages by importance (their people, tier and reasons), each name keeping GAP_PX from the
//   names already shown — so the screen's room, not a fixed tier, decides how many show at each zoom. The states' and
//   regions' names are not among them: they are painted on the land itself with the borders (drawSurfaceNames), laid
//   once per set of states and sized in km, so they turn and zoom with the land.
//
// The states themselves are the States view's (states-view.js statesOf), with all its knobs; on the States view itself
// only the names are laid over it.
import { bankRoads } from './road-banks.js';
import { statesOf, statesStamp, statesKey, ownerAt, feedKm, CAT, regionEdge, regionsShown, WHY_ICON, WHY_BOX, whyBadge, whyIs, TIERS } from './states-view.js';
import { farmOptionsKey } from './farming-view.js';
import { P } from '../view/projections.js';
import { NATURE_KM2 } from './states-nature.js';
import { sample } from './empire-view.js';
import { LOOK } from '../view/look-config.js';

// (a region's border: its state's colour toward ink (REGION_INK), at this strength — a pixel wide on a tile, two of the
// whole planet's picture (about one on the screen); the owner, 2026-11-25: "region border are kinda awful. can you make
// them more subtle?" — it was 0.9 and two pixels everywhere)
const REGION_EDGE = 0.5;
const PREF = 'orogen.generate.statesOverlay';
let saved = false;
try { saved = localStorage.getItem(PREF) === '1'; } catch { /* (no storage: off) */ }
/** Whether the overlay shows (the view strip's States switch). */
export const statesOverlay = { on: saved, sel: null, hover: -1 };   // (sel: the place the infobox shows, ringed: [lat, lon]; hover: the region under the pointer, lit)
export function setStatesOverlay(on) {
    statesOverlay.on = on;
    try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { /* (kept for this visit only) */ }
}
// (the owner, the same day: "can you give me slider for the color transparency that overlay an empires regions in terrain,
// satellite view etc" - the tint back; then "can you do a fresnel like? that fades out from the borders inland but only
// for empire borders?" - full on a border between states, fading inland; then, tuned by eye, fixed in view/look-config.js)
statesOverlay.tint = LOOK.statesTint; statesOverlay.fade = LOOK.statesFadeKm;
// (then "the empire borders with tint transitions doesnt really work, can you bring back the tint and range sliders" - back
// for a while, the fade measured in plain km from the drawn border; then "20km and 100% tint it is you can remove the
// sliders now", 2026-11-25 - fixed again in look-config.js)
// (the states' and regions' names painted on the land: their opacity, the view strip's Names slider, kept between visits)
const NAMES_PREF = 'orogen.generate.statesNames';
statesOverlay.names = 1;
try { const v = parseFloat(localStorage.getItem(NAMES_PREF)); if (v >= 0 && v <= 1) statesOverlay.names = v; } catch { /* (no storage: full) */ }
export function setStatesNames(v) {
    statesOverlay.names = v;
    try { localStorage.setItem(NAMES_PREF, String(v)); } catch { /* (kept for this visit only) */ }
}
/** The tint's strength d km from a border between states: like a fresnel rim, full on the border, falling off fast, none at F. */
const fadeAt = (d, F) => F <= 0 ? 1 : d >= F ? 0 : (1 - d / F) ** 2;
/** Whether the overlay can show on this moment: a finished planet with its food worked out (the States view's input) and
 *  states worked out for it (statesOf asks the worker for them, and shows the last ones while new ones come). */
export const statesOverlayCan = (fin) => !!fin?.raster?.farming && !!statesOf(fin);
/** The key its borders are redrawn by (PlanetView's extraLinesKey): off, or the states' options and the states that came. */
export const statesOverlayKey = (fin, layer) => {
    const kind = layer === 'farmStates' ? 'sr' : statesOverlay.on ? 'st' : null;
    return kind && statesOverlayCan(fin) ? `${kind}|${statesKey()}|${farmOptionsKey()}|${statesStamp()}|${kind === 'st' ? `${statesOverlay.tint}|${statesOverlay.fade}` : 0}|${statesOverlay.names}|${+regionsShown.on}` : 'st-off';
};

// ── the borders ──
const owners = new WeakMap();
/** A pixel's owner as one code: its state and its region (−1: land of no state). */
const RB = 11;
const stateOf = v => v >> RB;
function ownerCode(T, u, v, q, g) {
    ownerAt(T, u, v, q);
    if (q.a < 0 || q.ka > T.L) return -1;
    ownerAt(T, q.u, q.v, g, T.reg, true);
    // (the regions are the land's, blind to the states: one may run across a state's border, and its code then differs only
    // in its state)
    return (q.a << RB) | (g.a + 1);
}
/** Each pixel's km from the nearest border between states (or with land of no state) in an owner picture W × W/2:
 *  measured on the picture itself, from the pixels the borders are drawn on, so the tint's band is as wide everywhere
 *  (the owner, 2026-11-24: the fade "gives us inconsistent widths", with gaps where three states meet). It was the
 *  states' cost of travel read per state-grid cell: where a cell had no rival within reach it read as no border at all,
 *  and read between the cells that cut the tint away in squares along the borders. A two-pass chamfer, each row's
 *  pixels as wide as its latitude makes them, run twice so it carries across the date line; through the sea too, so a
 *  rival across a strait counts. 1e6: no border anywhere. */
function borderDist(own, W) {
    const H = W >> 1, pxKm = 2 * Math.PI * 6371 / W, d = new Float32Array(W * H).fill(1e6);
    const ex = new Float32Array(H), dg = new Float32Array(H);
    for (let y = 0; y < H; y++) { ex[y] = pxKm * Math.max(0.02, Math.cos((90 - (y + 0.5) / H * 180) * Math.PI / 180)); dg[y] = Math.hypot(ex[y], pxKm); }
    const differs = (a, b) => b !== -2 && (b < 0 || stateOf(b) !== stateOf(a));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, a = own[i];
        if (a < 0) continue;
        if (differs(a, own[y * W + (x + 1) % W]) || differs(a, own[y * W + (x - 1 + W) % W])
            || (y > 0 && differs(a, own[i - W])) || (y < H - 1 && differs(a, own[i + W]))) d[i] = 0;
    }
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, l = y * W + (x - 1 + W) % W, r = y * W + (x + 1) % W;
            let v = Math.min(d[i], d[l] + ex[y]);
            if (y > 0) v = Math.min(v, d[i - W] + pxKm, d[l - W] + dg[y], d[r - W] + dg[y]);
            d[i] = v;
        }
        for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
            const i = y * W + x, l = y * W + (x - 1 + W) % W, r = y * W + (x + 1) % W;
            let v = Math.min(d[i], d[r] + ex[y]);
            if (y < H - 1) v = Math.min(v, d[i + W] + pxKm, d[l + W] + dg[y], d[r + W] + dg[y]);
            d[i] = v;
        }
    }
    return d;
}
/** Whether two owner codes of one state are told apart by a region's border (a pixel of no known region draws none). */
const RM = (1 << RB) - 1;
const regionSplit = (a, b) => regionsShown.on && a !== b && (a & RM) !== 0 && (b & RM) !== 0;   // (none with the Regions switch off)
/** Each pixel's owner code in a picture W px wide (−1: land of no state, −2: the sea): the sea from the finished land;
 *  and its km from another state's border (dist, borderDist). */
function ownerPicture(T, fin, W) {
    const H = W >> 1, r = fin.raster, k = r.w / W, own = new Int32Array(W * H).fill(-1), q = {}, g = {};
    for (let y = 0; y < H; y++) {
        const ry = Math.min(r.h - 1, Math.floor((y + 0.5) * k));
        for (let x = 0; x < W; x++) {
            if (r.ocean[ry * r.w + Math.min(r.w - 1, Math.floor((x + 0.5) * k))]) { own[y * W + x] = -2; continue; }
            own[y * W + x] = ownerCode(T, (x + 0.5) / W, (y + 0.5) / H, q, g);
        }
    }
    return { own, dist: borderDist(own, W) };
}
/** The whole planet's tint picture for a fade: each state's land in its colour, its alpha the fade (kept for the last fade). */
function planetFill(T, kept, F) {
    if (kept.fillF === F) return kept.fill;
    const { W, own, dist } = kept, H = W >> 1, fill = kept.fill ??= document.createElement('canvas');
    fill.width = W; fill.height = H;
    const fctx = fill.getContext('2d'), fimg = fctx.createImageData(W, H), fpx = fimg.data;
    for (let i = 0; i < W * H; i++) {
        const v = own[i];
        if (v < 0) continue;
        const c = CAT[T.states[stateOf(v)].colour];
        fpx[4 * i] = c[0]; fpx[4 * i + 1] = c[1]; fpx[4 * i + 2] = c[2]; fpx[4 * i + 3] = Math.round(255 * fadeAt(dist[i], F));
    }
    fctx.putImageData(fimg, 0, 0);
    kept.fillF = F;
    return fill;
}
/** The borders over the whole planet, W px wide: each state's in its colour in full, its regions' toward ink; the
 *  land between them left clear. */
function planetTint(T, fin, W) {
    let kept = owners.get(T);
    if (kept?.fin === fin && kept.W === W && kept.regions === regionsShown.on) return kept;
    const H = W >> 1, { own, dist } = ownerPicture(T, fin, W), canvas = document.createElement('canvas'), dark = [0, 0, 0];
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, v = own[i];
        if (v < 0) continue;
        // (only the borders: a border four pixels wide — two on the screen with the whole planet in view: land of another state, or of
        // none, within two pixels; the coast left as it is. A region's border, within its state: another region within a
        // pixel, so two pixels wide, toward ink but not ink)
        const a = stateOf(v);
        let edge = false, inner = false;
        for (let dy = -2; dy <= 2 && !edge; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) continue;
            for (let dx = -2; dx <= 2; dx++) {
                const b = own[yy * W + (x + dx + W) % W];
                if (b === -2) continue;
                if (b < 0 || stateOf(b) !== a) { edge = true; break; }
                if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1 && regionSplit(b, v)) inner = true;
            }
        }
        if (!edge && !inner) continue;
        const c = edge ? CAT[T.states[a].colour] : regionEdge(CAT[T.states[a].colour], dark);
        px[4 * i] = c[0]; px[4 * i + 1] = c[1]; px[4 * i + 2] = c[2]; px[4 * i + 3] = edge ? 255 : REGION_EDGE * 255 | 0;
    }
    ctx.putImageData(img, 0, 0);
    owners.set(T, kept = { fin, W, canvas, own, dist, fill: null, fillF: null, regions: regionsShown.on });
    return kept;
}
/** A zoomed-in tile's borders, worked out at its own pixels: the land is where the tile is opaque (its sea half see-through).
 *  The owner is read on a lattice LATTICE px apart; a block whose four corners agree takes their state, and only the
 *  blocks a border crosses are read pixel by pixel (the states rest on cells far coarser than a tile's pixels). */
const LATTICE = 4;
function tileTint(T, ctx, W, m, tint, F, pic) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height, H = W >> 1, q = {}, g = {};
    const img = ctx.getImageData(0, 0, cw, ch), px = img.data, own = new Int32Array(cw * ch).fill(-1), dark = [0, 0, 0];
    const at = (x, y) => {
        const X = (x + 0.5 - m.e) / m.a, Y = (y + 0.5 - m.f) / m.d;
        return ownerCode(T, ((X / W) % 1 + 1) % 1, Math.min(1, Math.max(0, Y / H)), q, g);
    };
    const B = LATTICE, gw = Math.ceil((cw - 1) / B) + 1, gh = Math.ceil((ch - 1) / B) + 1, grid = new Int32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) grid[gy * gw + gx] = at(Math.min(cw - 1, gx * B), Math.min(ch - 1, gy * B));
    // (the km from the border: the whole planet's (borderDist), read smoothly between its pixels — the tile's own
    // border is within a pixel of that picture's, and the band hundreds of km wide)
    const distAt = (x, y) => {
        const X = (x + 0.5 - m.e) / m.a, Y = (y + 0.5 - m.f) / m.d;
        return sample(pic.dist, pic.W, pic.W >> 1, ((X / W) % 1 + 1) % 1, Math.min(1, Math.max(0, Y / H)));
    };
    for (let by = 0; by < gh - 1; by++) for (let bx = 0; bx < gw - 1; bx++) {
        const k = by * gw + bx, a = grid[k], same = a === grid[k + 1] && a === grid[k + gw] && a === grid[k + gw + 1];
        const y1 = Math.min(ch, by * B + B + (by === gh - 2 ? 1 : 0)), x1 = Math.min(cw, bx * B + B + (bx === gw - 2 ? 1 : 0));
        for (let y = by * B; y < y1; y++) for (let x = bx * B; x < x1; x++) {
            if (px[4 * (y * cw + x) + 3] < 255) continue;
            own[y * cw + x] = same ? a : at(x, y);
        }
    }
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = y * cw + x, v = own[i];
        if (v < 0) continue;
        // (a border two pixels wide: land of another state, or of none, within a pixel; the coast left as it is. A
        // region's border, within its state, one pixel wide, toward ink but not ink, half see-through)
        const a = stateOf(v);
        if (tint > 0) {
            const t = tint * fadeAt(distAt(x, y), F), c = CAT[T.states[a].colour];
            if (t > 0) for (let j = 0; j < 3; j++) px[4 * i + j] = Math.round(px[4 * i + j] * (1 - t) + c[j] * t);
        }
        let edge = false, inner = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= ch) continue;
            for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, j = yy * cw + xx;
                if (xx < 0 || xx >= cw || px[4 * j + 3] !== 255) continue;
                const b = own[j];
                if (b < 0 || stateOf(b) !== a) { edge = true; break; }
                if (dx >= 0 && dy >= 0 && regionSplit(b, v)) inner = true;   // (one side only: a pixel wide)
            }
        }
        if (!edge && !inner) continue;
        const c = edge ? CAT[T.states[a].colour] : regionEdge(CAT[T.states[a].colour], dark), t = edge ? 1 : REGION_EDGE;
        for (let j = 0; j < 3; j++) px[4 * i + j] = Math.round(px[4 * i + j] * (1 - t) + c[j] * t);
    }
    ctx.putImageData(img, 0, 0);
}
/** PlanetView's extraLines: ctx in the planet's coordinates, W wide — the whole planet's picture (the textures, the GPU's
 *  overlay), or a tile (a small canvas, the planet scaled up and moved under it). */
export function drawStatesTint(ctx, W, fin, layer) {
    const key = statesOverlayKey(fin, layer);
    if (key === 'st-off') return;
    const T = statesOf(fin), m = ctx.getTransform(), whole = Math.abs(m.a * W - ctx.canvas.width) < 2 && Math.abs(m.e) < 1 && Math.abs(m.f) < 1;
    // (on the States view itself its own picture has the borders: only the roads go over it)
    if (whole && key[1] === 't') {
        ctx.save(); ctx.imageSmoothingEnabled = true;
        const pic = planetTint(T, fin, Math.min(2048, ctx.canvas.width));
        if (statesOverlay.tint > 0) { ctx.globalAlpha = statesOverlay.tint; ctx.drawImage(planetFill(T, pic, statesOverlay.fade), 0, 0, W, W >> 1); ctx.globalAlpha = 1; }
        ctx.drawImage(pic.canvas, 0, 0, W, W >> 1);
        ctx.restore();
    } else if (key[1] === 't') {
        // (a tile reads its fade off the whole planet's picture: the one already made, else one 2,048 px wide)
        const kept = owners.get(T), pic = kept?.fin === fin ? kept : planetTint(T, fin, 2048);
        ctx.save(); tileTint(T, ctx, W, m, statesOverlay.tint, statesOverlay.fade, pic); ctx.restore();
    }
    ctx.save(); drawRoads(T, ctx, W, m, whole, fin); ctx.restore();
    ctx.save(); drawSurfaceNames(T, ctx, W, m, whole); ctx.restore();
}

// ── the states' and regions' names, painted on the land ──
/** The states' and regions' names painted into the planet's own picture as the borders are, along their land's spine
 *  (states-view.js spines), letter-spaced to fill it as an atlas letters a country: fixed on the land and sized in km,
 *  so they turn and zoom with it. Which names show, how big and where is worked out once per set of states, on the
 *  planet, never from the view (the owner, 2026-11-24: "bind/burn them onto the surface", "make it zoom independent").
 *  state: breadth: the letters' height, a share of the land's half-breadth at its label (label.km); maxKm: the tallest
 *  they may be. region: km: every region's letters this tall, on one line or two (the owner: "keep the region names in a
 *  consistent size"). style: the font's style and weight; alpha: how strongly they show at full opacity. Every letter must
 *  lie on its own state's or region's land, clear of the names already laid; a name that fits nowhere is left out. fill:
 *  the share of the spine a name fills; lineH: a two-line name's line height (em); twoLines: how much bigger two lines
 *  must let a state's name stand to be split; spaceMin / spaceMax: the letters' least and most spacing (em); shrink: how
 *  small a state's name may get (of its first size) to fit; shifts: where else it is tried, off the spine (em, along its
 *  normal); regionShift: how far off it a region's name may also go (em, within its land's half-breadth), its letters
 *  closer, slid along it by slides (a share of the spine's length) either way; gap: the room each letter keeps (em); minPx: on a zoomed-in tile, a name smaller than this is not drawn (no
 *  letter that small can be read). carve: the letters engraved into the land rather than printed on it (the owner,
 *  2026-11-24: "truly edge into the surface"; a flipped dark letter with a light copy behind it read as "cheap", a dark
 *  letter with a light rim "isn't really readable"): the land shows through each letter, the fresh cut paler, as a letter
 *  cut in slate (floor: how much, screened with map-label), and inside its edges the cut's walls, lit from the north-west
 *  as the hillshade is: the north-west wall in shadow (shade, map-halo; 0: none, the owner: its black "makes it less
 *  readable"), the south-east wall catching the light (lit,
 *  map-label; 0: none, it blurs the letter); wall: how wide (em, kept within wallPx). The view strip's Names slider
 *  (statesOverlay.names) sets their opacity. */
export const SURFACE_NAMES = {
    state: { breadth: 0.8, maxKm: 220, style: '600', alpha: 0.95 },
    region: { km: 40, style: 'italic 600', alpha: 0.9 },
    fill: 0.92, lineH: 1.1, twoLines: 1.25, spaceMin: 0.12, spaceMax: 0.6, shrink: 0.3, shifts: [0, 0.6, -0.6, 1.2, -1.2], gap: 0.1, minPx: 7,
    regionShift: 6, slides: [0, 0.15, 0.3],
    carve: { floor: 1, shade: 0, lit: 0, wall: 0.06, wallPx: [1.2, 3] },
};
/** A name split in two lines at the space nearest its middle ("Copper Hills | of Breinul"), or null. */
const twoLines = (t) => {
    let best = -1;
    for (let i = t.indexOf(' '); i >= 0; i = t.indexOf(' ', i + 1)) if (best < 0 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2)) best = i;
    return best < 0 ? null : [t.slice(0, best), t.slice(best + 1)];
};
const KM_DEG = Math.PI * 6371 / 180;
const nameFamily = () => token('--font-text');
try { for (const st of [SURFACE_NAMES.state.style, SURFACE_NAMES.region.style]) document.fonts?.load(`${st} 20px ${nameFamily()}`); } catch { /* (no fonts API: the fallback face) */ }
const nameCache = new WeakMap();
/** The names' letters, laid once per set of states: [{ style, alpha, reg (a region's: its index; a state's −1), fs (km), u0, u1, v0, v1, glyphs: [{ ch, u, v, cl, ang }] }]
 *  — u, v the letter's middle on the map (0…1, u unwrapped), cl the cosine of its latitude, ang its turn (radians, east
 *  toward south, in true km). */
function surfaceNames(T) {
    let out = nameCache.get(T);
    if (out) return out;
    out = [];
    const F = SURFACE_NAMES, mc = document.createElement('canvas').getContext('2d'), fam = nameFamily(), q = {}, qg = {};
    // (the letters laid so far, as circles in km, bucketed by 2° of latitude and longitude)
    const grid = new Map(), B = 2;
    const cells = (lat, lon, rKm, f) => {
        const dLa = rKm / KM_DEG, dLo = rKm / (KM_DEG * Math.max(0.05, Math.cos(lat * D)));
        for (let a = Math.floor((lat - dLa) / B); a <= Math.floor((lat + dLa) / B); a++)
            for (let o = Math.floor((lon - dLo) / B); o <= Math.floor((lon + dLo) / B); o++) if (f(`${a}|${(((o % 180) + 180) % 180)}`)) return true;
        return false;
    };
    const km = (a, b) => { const dl = wrap((b[1] - a[1]) * D) / D; return Math.hypot(dl * KM_DEG * Math.cos((a[0] + b[0]) / 2 * D), (b[0] - a[0]) * KM_DEG); };
    const hits = (c) => cells(c[0], c[1], c[2] + 400, k => grid.get(k)?.some(o => km(o, c) < o[2] + c[2]));
    const keep = (c) => cells(c[0], c[1], 0, k => { let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(c); });
    const lay = (lab, text, look, own, reg = -1) => {
        if (!lab || !text) return;
        // (the spine, its longitudes unwrapped, read west to east; a land with none: a line across it at its label)
        let sp = lab.spine?.length > 1 ? lab.spine.map(p => p.slice())
            : [[lab.lat, lab.lon - lab.km / (KM_DEG * Math.max(0.05, Math.cos(lab.lat * D)))], [lab.lat, lab.lon + lab.km / (KM_DEG * Math.max(0.05, Math.cos(lab.lat * D)))]];
        for (let i = 1; i < sp.length; i++) sp[i][1] = sp[i - 1][1] + wrap((sp[i][1] - sp[i - 1][1]) * D) / D;
        if (sp[sp.length - 1][1] < sp[0][1]) sp.reverse();
        const cum = [0];
        for (let i = 1; i < sp.length; i++) cum.push(cum[i - 1] + km(sp[i - 1], sp[i]));
        const L = cum[cum.length - 1];
        if (!(L > 0)) return;
        // (a point s km along it, beyond its ends along its end segments)
        const at = (s) => {
            let i = 1;
            while (i < cum.length - 1 && cum[i] < s) i++;
            const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), a = sp[i - 1], b = sp[i];
            return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        };
        mc.font = `${look.style} 100px ${fam}`;
        // (its forms: on one line, or on two split at the space nearest its middle where that lets it stand bigger)
        const forms = [[text]], two = twoLines(text);
        if (two) forms.push(two);
        let best = null;
        const cands = [];
        for (const lines of forms) {
            const ls = lines.map(t => { const chars = [...t], ems = chars.map(ch => mc.measureText(ch).width / 100); return { chars, ems, sumEm: ems.reduce((x, y) => x + y, 0) }; });
            const fit = Math.min(...ls.map(l => F.fill * L / (l.sumEm + F.spaceMin * Math.max(0, l.chars.length - 1))));
            const fs0 = Math.min(look.maxKm, look.breadth * lab.km / (1 + (lines.length - 1) * F.lineH), fit);
            cands.push({ ls, fs0: look.km });
            if (!best || fs0 > best.fs0 * (lines.length > best.ls.length ? F.twoLines : 1 / F.twoLines)) best = { ls, fs0 };
        }
        // (a region's name: one size for all, on one line or two, whichever fits; a state's: as big as its land allows)
        const tries = look.km ? cands : [best];
        // (its letters at size fs, the whole name moved n·fs off the spine along its normal: each line along the spine,
        //  the lines either side of it; the letters' circles, and circles every half em along each line's span, gaps too,
        //  so no other name runs between the letters)
        const place = (ls, fs, n, sl = 0, tight = false) => {
            const glyphs = [], letters = [], circles = [];
            const off = (s, o) => {
                const p0 = at(s), a = at(s - fs / 2), b = at(s + fs / 2);
                const cl = Math.max(0.05, Math.cos(p0[0] * D)), e = (b[1] - a[1]) * KM_DEG * cl, so = (a[0] - b[0]) * KM_DEG, el = Math.hypot(e, so) || 1;
                // (moved off along its normal, south of it toward +o)
                return { p: [p0[0] - o * (e / el) / KM_DEG, p0[1] - o * (so / el) / (KM_DEG * cl)], cl, ang: Math.atan2(so, e) };
            };
            ls.forEach((l, k) => {
                const nc = l.chars.length, o = (n + (k - (ls.length - 1) / 2) * F.lineH) * fs;
                const gap = nc > 1 ? (tight ? F.spaceMin * fs : Math.min(F.spaceMax * fs, Math.max(F.spaceMin * fs, (F.fill * L - l.sumEm * fs) / (nc - 1)))) : 0;
                const x0 = (L - l.sumEm * fs - gap * (nc - 1)) / 2 + sl;
                let x = x0;
                for (let j = 0; j < nc; j++) {
                    const { p, cl, ang } = off(x + l.ems[j] * fs / 2, o);
                    glyphs.push({ ch: l.chars[j], u: (p[1] + 180) / 360, v: (90 - p[0]) / 180, cl, ang });
                    letters.push([p[0], p[1], fs * 0.5]);
                    x += l.ems[j] * fs + gap;
                }
                for (let s = x0; s <= x; s += fs / 2) { const { p } = off(s, o); circles.push([p[0], p[1], fs * (0.5 + F.gap)]); }
            });
            return { glyphs, letters, circles };
        };
        // (every letter on its own land: its middle and the four points half an em out, north, south, east and west)
        const inside = (letters) => letters.every(([la, lo, r]) => {
            const dLa = 0.9 * r / KM_DEG, dLo = 0.9 * r / (KM_DEG * Math.max(0.05, Math.cos(la * D)));
            return [[la, lo], [la + dLa, lo], [la - dLa, lo], [la, lo + dLo], [la, lo - dLo]].every(([a, o]) => own(ownerCode(T, (o + 180) / 360 - Math.floor((o + 180) / 360), (90 - a) / 180, q, qg)));
        });
        const put = (fs, { glyphs, circles }) => {
            circles.forEach(keep);
            const us = glyphs.map(g => g.u), vs = glyphs.map(g => g.v), pu = fs / 40030 * 2, pv = fs / 20015, cmin = Math.min(...glyphs.map(g => g.cl));
            out.push({ style: look.style, alpha: look.alpha, reg, fs, glyphs, u0: Math.min(...us) - pu / cmin, u1: Math.max(...us) + pu / cmin, v0: Math.min(...vs) - pv, v1: Math.max(...vs) + pv });
        };
        // (the biggest size, and the nearest place to the spine, where it lies on its own land clear of the names already
        //  laid; none: it is left out — a name over another, or over its neighbour's land, reads worse than none)
        const ok = (g) => !g.circles.some(hits) && inside(g.letters);
        if (!look.km) {
            for (const { ls, fs0 } of tries)
                for (let fs = fs0; fs >= fs0 * F.shrink && fs > 0; fs *= 0.88)
                    for (const n of F.shifts) { const g = place(ls, fs, n); if (ok(g)) { put(fs, g); return; } }
            return;
        }
        // (a region's name, at its one size: spread along its spine, else, letters closer, slid along it and moved off it
        //  up to its land's half-breadth — round a state's name laid across the same land, the owner, 2026-11-25: regions
        //  "still not showing their names")
        const fs = look.km, far = Math.max(1.2, Math.min(F.regionShift, lab.km / fs));
        for (const { ls } of tries) for (const n of F.shifts) { const g = place(ls, fs, n); if (ok(g)) { put(fs, g); return; } }
        const offs = [0];
        for (let k = 0.6; k <= far + 1e-9; k += 0.6) offs.push(k, -k);
        for (const { ls } of tries)
            for (const n of offs)
                for (const f of F.slides) for (const sg of f ? [1, -1] : [1]) {
                    const g = place(ls, fs, n, sg * f * L, true);
                    if (ok(g)) { put(fs, g); return; }
                }
    };
    for (const s of T.states) lay(s.label, s.name.toUpperCase(), F.state, c => c >= 0 && stateOf(c) === s.i);
    // (a region's name may run across a state's border, as the region does)
    for (const g of T.regions) if (g.name) lay(g.label, g.name, F.region, c => c >= 0 && (c & RM) === g.i + 1, g.i);
    nameCache.set(T, out);
    return out;
}
/** The names over the picture (the whole planet's or a tile's), each letter where it was laid, stretched east–west as
 *  the map stretches the land there, so it stands true on the globe. */
function drawSurfaceNames(T, ctx, W, m, whole) {
    const H = W >> 1, cw = ctx.canvas.width, ch = ctx.canvas.height, F = SURFACE_NAMES, C = F.carve, kmPx = W / 40030;
    const ua = -m.e / m.a / W, ub = (cw - m.e) / m.a / W, va = -m.f / m.d / H, vb = (ch - m.f) / m.d / H;
    const halo = token('--map-halo'), ink = token('--map-label'), fam = nameFamily(), op = statesOverlay.names;
    if (!(op > 0)) return;
    const E = engraver(), x = E.getContext('2d');
    for (const nm of surfaceNames(T)) {
        if (nm.v1 < va || nm.v0 > vb || (nm.reg >= 0 && !regionsShown.on)) continue;   // (a region's name: only with the Regions switch on)
        const fpx = nm.fs * kmPx;
        if (!whole && fpx * m.a < F.minPx) continue;
        const font = `${nm.style} ${fpx.toFixed(2)}px ${fam}`, wall = Math.min(C.wallPx[1], Math.max(C.wallPx[0], C.wall * fpx * m.a)), a = op * nm.alpha;
        for (const k of [-1, 0, 1]) {
            if (nm.u1 + k < ua || nm.u0 + k > ub) continue;
            // (the name's box on the canvas, a few pixels wider for the walls, cut to the canvas)
            const x0 = Math.max(0, Math.floor((nm.u0 + k) * W * m.a + m.e) - 2), x1 = Math.min(cw, Math.ceil((nm.u1 + k) * W * m.a + m.e) + 2);
            const y0 = Math.max(0, Math.floor(nm.v0 * H * m.d + m.f) - 2), y1 = Math.min(ch, Math.ceil(nm.v1 * H * m.d + m.f) + 2);
            if (x1 <= x0 || y1 <= y0) continue;
            const bw = x1 - x0, bh = y1 - y0;
            if (E.width < bw) E.width = bw;
            if (E.height < bh) E.height = bh;
            // (the letters on the engraver, moved sx, sy pixels; then what of them a copy moved the other way leaves:
            //  a sliver along the edge facing that way)
            const letters = (col, sx, sy, op2) => {
                x.globalCompositeOperation = op2; x.fillStyle = col;
                x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font;
                for (const g of nm.glyphs) {
                    x.setTransform(m.a, 0, 0, m.d, m.e - x0 + sx, m.f - y0 + sy);
                    x.translate((g.u + k) * W, g.v * H); x.scale(1 / g.cl, 1); x.rotate(g.ang);
                    x.fillText(g.ch, 0, 0);
                }
                x.setTransform(1, 0, 0, 1, 0, 0);
            };
            const lay = (alpha, mode) => {
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = mode;
                ctx.drawImage(E, 0, 0, bw, bh, x0, y0, bw, bh); ctx.restore();
            };
            // (the floor: the land itself, the fresh cut paler, as a letter cut in slate)
            x.clearRect(0, 0, bw, bh); letters(ink, 0, 0, 'source-over'); lay(C.floor * a, 'screen');
            // (the north-west wall, in shadow: the letter less a copy moved south-east)
            if (C.shade > 0) { x.clearRect(0, 0, bw, bh); letters(halo, 0, 0, 'source-over'); letters(halo, wall, wall, 'destination-out'); lay(C.shade * a, 'source-over'); }
            // (the south-east wall, in the light: the letter less a copy moved north-west)
            if (C.lit > 0) { x.clearRect(0, 0, bw, bh); letters(ink, 0, 0, 'source-over'); letters(ink, -wall, -wall, 'destination-out'); lay(C.lit * a, 'source-over'); }
        }
    }
    ctx.setTransform(m);
}
/** How far below a letter's middle (the canvas's textBaseline 'middle', where the engraved letters are centred) its
 *  alphabetic baseline lies, in ems, measured on a canvas in the names' own font: the hovered name's letters stand on
 *  their alphabetic baseline that far down, so each lies on its engraved twin (SVG's own 'central' is reckoned from other
 *  font metrics and stood them a sixth of an em too high). Kept once the fonts have loaded. */
const dropKept = new Map();
function middleDrop(style) {
    const font = `${style} 100px ${nameFamily()}`;
    let d = dropKept.get(font);
    if (d !== undefined) return d;
    const x = (middleDrop.ctx ??= document.createElement('canvas').getContext('2d'));
    x.font = font;
    x.textBaseline = 'alphabetic'; const a = x.measureText('H').actualBoundingBoxAscent;
    x.textBaseline = 'middle'; const m = x.measureText('H').actualBoundingBoxAscent;
    d = (a - m) / 100;
    if (document.fonts?.status === 'loaded') dropKept.set(font, d);
    return d;
}
let engraverCanvas = null;
/** The scratch canvas a name is engraved on before it goes onto the picture (one, reused, grown as needed). */
const engraver = () => (engraverCanvas ??= document.createElement('canvas'));

// ── the hovered region: its border and its name lit (the owner, 2026-11-25: "it would be great to make the border and
// name shine a bit when hovering over it") ──
/** The region at (u, v) of the map (0…1), as the borders read it: its index, or −1 (the sea, land of no state). */
export function regionUnder(fin, u, v) {
    if (!regionsShown.on || !statesOverlayCan(fin)) return -1;   // (the regions hidden: none to light)
    const T = statesOf(fin), r = fin.raster;
    if (r.ocean[Math.min(r.h - 1, Math.floor(v * r.h)) * r.w + Math.min(r.w - 1, Math.floor(u * r.w))]) return -1;
    const c = ownerCode(T, u, v, {}, {});
    return c >= 0 && (c & RM) ? (c & RM) - 1 : -1;
}
/** The loops round the cells inn(x, y) holds in [xa, xb] × [ya, yb] (marching squares): each loop's points on a doubled
 *  grid (the middles of the cells' sides; a cell's middle is 2x + 1), rounded `rounds` times (Chaikin) so it reads as a
 *  line, not as cells. */
function traceLoops(inn, xa, xb, ya, yb, rounds = 2) {
    const next = new Map(), key = (x, y) => x + ',' + y, link = (a, b) => {
        const ka = key(...a), kb = key(...b);
        if (!next.has(ka)) next.set(ka, { at: a, to: [] });
        if (!next.has(kb)) next.set(kb, { at: b, to: [] });
        next.get(ka).to.push(kb); next.get(kb).to.push(ka);
    };
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const cs = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], ins = cs.map(([a, b]) => inn(a, b));
        if (!ins.some(Boolean) || ins.every(Boolean)) continue;
        const ring = [];
        for (let k = 0; k < 4; k++) {
            const a = cs[k], b = cs[(k + 1) % 4];
            if (ins[k]) ring.push(null);
            if (ins[k] !== ins[(k + 1) % 4]) ring.push([a[0] + b[0], a[1] + b[1]]);
        }
        for (let k = 0; k < ring.length; k++) { const u = ring[k], v = ring[(k + 1) % ring.length]; if (u && v) link(u, v); }
    }
    const seen = new Set(), loops = [];
    for (const [k0] of next) {
        if (seen.has(k0)) continue;
        let loop = [], prev = null, k = k0;
        while (k && !seen.has(k)) {
            seen.add(k); const n = next.get(k); loop.push(n.at);
            const go = n.to.find(t => t !== prev && !seen.has(t)); prev = k; k = go;
        }
        for (let round = 0; round < rounds && loop.length > 2; round++) {
            const sm = [];
            loop.forEach((a, j) => { const b = loop[(j + 1) % loop.length];
                sm.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); });
            loop = sm;
        }
        if (loop.length > 2) loops.push(loop);
    }
    return loops;
}
/** At most this many places are read for a hovered region's outline (finer than the borders' grid, through their warp,
 *  so the light lies on the line drawn), never closer than HOVER_MIN_DEG. */
const HOVER_SAMPLES = 60000, HOVER_MIN_DEG = 0.02;
const hoverCache = new WeakMap();
/** A region's lit outline: { runs: [{ pts: [[lat, lon]…], closed }], names } — its border with other land and its
 *  coast, and its names (surfaceNames). Worked out once a region, on first hover. */
function hoverShape(T, fin, gi) {
    let kept = hoverCache.get(T);
    if (!kept) hoverCache.set(T, kept = new Map());
    let out = kept.get(gi);
    if (out) return out;
    out = { runs: [], names: surfaceNames(T).filter(n => n.reg === gi) };
    kept.set(gi, out);
    // (its extent, off the borders' grid: its rows, and its columns as the shortest span round the world that holds them)
    const { w, h, land } = T.S, own = T.reg.own1, cols = new Uint8Array(w);
    let y0 = h, y1 = -1;
    for (let c = 0; c < w * h; c++) if (own[c] === gi && land[c]) { const y = (c / w) | 0; cols[c - y * w] = 1; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (y1 < 0) return out;
    let run = 0, gap = 0, gapEnd = -1;
    for (let k = 0; k < 2 * w; k++) { if (cols[k % w]) run = 0; else if (++run > gap && run < w) { gap = run; gapEnd = k; } }
    const xs = gap ? gapEnd + 1 : 0, span = w - gap, M = 2;
    const u0 = (xs - M) / w, du = (span + 2 * M) / w, v0 = Math.max(0, (y0 - M) / h), dv = Math.min(1, (y1 + 1 + M) / h) - v0;
    const step = Math.max(HOVER_MIN_DEG, Math.sqrt(du * 360 * dv * 180 / HOVER_SAMPLES));
    const nx = Math.ceil(du * 360 / step), ny = Math.ceil(dv * 180 / step), r = fin.raster, q = {}, g = {};
    const inside = new Uint8Array(nx * ny);
    for (let y = 0; y < ny; y++) {
        const v = v0 + (y + 0.5) / ny * dv, ry = Math.min(r.h - 1, Math.floor(v * r.h));
        for (let x = 0; x < nx; x++) {
            const u = ((u0 + (x + 0.5) / nx * du) % 1 + 1) % 1, i = y * nx + x;
            if (r.ocean[ry * r.w + Math.min(r.w - 1, Math.floor(u * r.w))]) continue;
            const c = ownerCode(T, u, v, q, g);
            if (c >= 0 && (c & RM) === gi + 1) inside[i] = 1;
        }
    }
    const inn = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && inside[y * nx + x] === 1;
    const pt = ([x, y]) => [90 - (v0 + (y / 2 + 0.5) / ny * dv) * 180, (u0 + (x / 2 + 0.5) / nx * du) * 360 - 180];
    // (the whole outline, its coast too: the owner, 2026-11-25, "highlight the coast, because that is missing")
    for (const loop of traceLoops(inn, -1, nx, -1, ny)) out.runs.push({ pts: loop.map(pt), closed: true });
    return out;
}

// ── the roads ──
const roadCache = new WeakMap();
/** The roads' lines in the map's own units (u: 0…1 west to east, unwrapped; v: 0…1 north to south), each with its box;
 *  a road along a big river on one bank of it (road-banks.js). */
function roadShapes(T, fin) {
    let kept = roadCache.get(T);
    if (kept) return kept;
    kept = [];
    for (const { pts: l, tier } of bankRoads(T.roads, fin)) {
        const pts = new Float32Array(2 * l.length);
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        l.forEach(([lon, lat], i) => {
            const u = (lon + 180) / 360, v = (90 - lat) / 180;
            pts[2 * i] = u; pts[2 * i + 1] = v;
            u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        });
        kept.push({ pts, tier, u0, u1, v0, v1 });
    }
    roadCache.set(T, kept);
    return kept;
}
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** The roads over the picture, three tiers, each in map-road (a dusty tan, quieter than the names) over a map-road-casing; a road shared by
 *  many is drawn once: the main roads (the cities' to their capitals, between the capitals) a firm line, the roads (the
 *  towns' to their cities) a finer dashed one, the tracks (the villages' and between near neighbours) a dotted hairline,
 *  only once the villages show (their spacing SHOW_PX on the screen; never on the whole planet's picture). Widths in
 *  screen pixels at every zoom (the whole planet's picture: in its own pixels, two of them a screen pixel or so). */
const ROAD_LOOK = [
    { halo: 2.8, line: 1.2, alpha: 0.9, dash: null },
    { halo: 1.9, line: 0.7, alpha: 0.75, dash: [3, 2] },
    { halo: 1.4, line: 0.5, alpha: 0.6, dash: [1, 1.8] },
];
function drawRoads(T, ctx, W, m, whole, fin) {
    const H = W >> 1, cw = ctx.canvas.width, ch = ctx.canvas.height, px = whole ? Math.max(1, cw / 2048) / m.a : 1 / m.a;
    // (the stretch of the planet the canvas shows, in u and v)
    const ua = -m.e / m.a / W, ub = (cw - m.e) / m.a / W, va = -m.f / m.d / H, vb = (ch - m.f) / m.d / H;
    const shapes = roadShapes(T, fin), halo = token('--map-road-casing'), ink = token('--map-road');
    const tracks = !whole && TIERS.villageKm * m.a * W / 40030 >= SHOW_PX;
    for (let tier = 0; tier < 3; tier++) {
        if (tier === 2 && !tracks) continue;
        const path = new Path2D(), L = ROAD_LOOK[tier];
        let any = false;
        for (const s of shapes) {
            if (s.tier !== tier || s.v1 < va || s.v0 > vb) continue;
            for (const k of [-1, 0, 1]) {
                if (s.u1 + k < ua || s.u0 + k > ub) continue;
                path.moveTo((s.pts[0] + k) * W, s.pts[1] * H);
                for (let i = 2; i < s.pts.length; i += 2) path.lineTo((s.pts[i] + k) * W, s.pts[i + 1] * H);
                any = true;
            }
        }
        if (!any) continue;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.45; ctx.strokeStyle = halo; ctx.lineWidth = L.halo * px; ctx.stroke(path);
        ctx.globalAlpha = L.alpha; ctx.strokeStyle = ink; ctx.lineWidth = L.line * px;
        if (L.dash) ctx.setLineDash(L.dash.map(d => d * px));
        ctx.stroke(path);
    }
}

// ── the names ──
const NS = 'http://www.w3.org/2000/svg', D = Math.PI / 180, R = 6371;
const wrap = (l) => ((l + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// (why a place stands: its icons, drawn once as symbols, each placed before the name — a halo under the ink)
const DEFS = `<defs>${Object.keys(WHY_ICON).map(k => `<symbol id="sl-why-${k}" viewBox="${WHY_BOX}">${whyBadge(k)}</symbol>`).join('')}</defs>`;
const IG = 1;
const SHOW_PX = 40;   // (the villages' tracks show once the villages' spacing is this many px on the screen)
const GAP_PX = 110;   // (each place's name keeps this many px from every place name shown before it: about one name to
                      //  GAP_PX² of screen, however many km² that is at the zoom)
const FLOOR_PX = 10;  // (a town, fort or village is not named before its tier's spacing is this many px on the screen)
const PAD = 6;         // (and each smaller place's name keeps this much room round it)
/** How important a place is, for which names show first: the people in it (log10, so a city of 50,000 is not worth
 *  fifty villages), its tier, and a little for each reason it stands. */
const NAME_RANK = { cap: 3, city: 1, town: 0.45, fort: 0.35, village: 0 };
const NAME_WHY = { trade: 0.35, port: 0.25, farm: 0.05, mine: 0.2, precious: 0.35, mineral: 0.15, gem: 0.3, stone: 0.15, hold: 0.3 };
const nameScore = (p) => Math.log10(1 + (p.people ?? 0)) + NAME_RANK[p.rank] + (p.hub ? 0.15 : 0)
    + (p.why ?? []).reduce((a, k) => a + (NAME_WHY[k] ?? 0), 0);
const rankCache = new WeakMap();
/** Which of a place's fields names the member of each resource kind (iron, gold, salt, jade …). */
const RES_MEMBER = { mine: 'metal', precious: 'precious', mineral: 'mineral', gem: 'gem', stone: 'stone' };
/** The places of these states, most important first: { caps: [{ p, st, s }], places: [{ p, s }], keepers } —
 *  keepers: for each state and each resource it holds (by member: its iron, its tin, its jade), the most important place holding it, as
 *  [{ p, s, ks }] (ks the resources it keeps), most important first: shown at every zoom, however small the place.
 *  keepers(l) groups by state (l -1) or, zoomed in, by the natural region of tree level l each place stands in: so a
 *  resource rolls up to the biggest place of the state from afar and shows where it belongs close up. */
function rankedPlaces(T) {
    let r = rankCache.get(T);
    if (r) return r;
    const by = (a, b) => b.s - a.s;
    const caps = T.states.map(st => ({ p: st.cap, st, s: nameScore(st.cap) })).sort(by);
    const places = T.towns.concat(T.places).map(p => ({ p, s: nameScore(p) })).sort(by);
    const all = [...caps, ...places], cache = new Map();
    // (level -1: by state; level l: by the natural region of tree level l the place stands in (states-nature.js))
    const keepers = (l) => {
        let ks = cache.get(l);
        if (ks) return ks;
        const lev = l < 0 ? null : T.S.nature.levels[l], best = new Map();
        for (const { p, s } of all) for (const k of p.why ?? []) {
            if (!RES_MEMBER[k]) continue;
            const key = `${p.state}|${lev ? lev[p.c] : ''}|${k}|${p[RES_MEMBER[k]] ?? k}`, o = best.get(key);
            if (!o || s > o.s) best.set(key, { p, s, k });
        }
        const by1 = new Map();
        for (const { p, s, k } of best.values()) { const o = by1.get(p); if (o) o.ks.push(k); else by1.set(p, { p, s, ks: [k] }); }
        for (const o of by1.values()) o.ks = (o.p.why ?? []).filter(k => o.ks.includes(k));   // (in the place's own order)
        cache.set(l, ks = [...by1.values()].sort(by));
        return ks;
    };
    rankCache.set(T, r = { caps, places, keepers });
    return r;
}
const ROLL_PX = 160;   // (the resources roll up to the finest natural regions at least this many px across on the screen)
const HORIZON_MARGIN = 0.12;   // (names hidden this share of the way in from the globe's horizon: 0.08 in facing from afar)
const RELAY_MS = 220;  // (while the view moves, the names are laid out again this often; in between they only move)
const SETTLE_MS = 90;  // (and once more when it has rested this long)
/** Each tier's mark: its dot (r, cls), its icons' size, its name's class and how wide a letter runs. */
const TIER = {
    city: { r: 3.3, cls: 'sl-city', ic: 14, name: 'sl-city-name', em: 8.5 },
    town: { r: 2.5, cls: 'sl-town', ic: 13, name: 'sl-town-name', em: 7.8 },
    village: { r: 1.7, cls: 'sl-village', ic: 12, name: 'sl-village-name', em: 7.1 },
    fort: { r: 0, cls: '', ic: 13, name: 'sl-town-name', em: 7.8 },
};
/** The icons at (x, y) (their top left), each ic px square. */
const icons = (why, x, y, ic = 12, p = null) => {
    let out = '';
    why.forEach((k, j) => {
        const X = (x + j * (ic + IG)).toFixed(1), Y = y.toFixed(1);
        out += `<use class="sl-why why-${k}${whyIs(k, p)}" href="#sl-why-${k}" x="${X}" y="${Y}" width="${ic}" height="${ic}"/>`;
    });
    return out;
};
const iconsW = (why, ic = 12) => (why.length ? why.length * (ic + IG) + 2 : 0);
/** The boxes kept on the screen, in buckets CELL px square: does a box touch one, is a point near one's centre. */
const CELL = 64;
function boxes() {
    const m = new Map();
    const each = (x0, y0, x1, y1, f) => {
        for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++)
            for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) if (f(gy * 4096 + gx)) return true;
        return false;
    };
    return {
        add(b) { each(b[0], b[1], b[2], b[3], (k) => { let l = m.get(k); if (!l) m.set(k, l = []); l.push(b); }); },
        hits: (b) => each(b[0], b[1], b[2], b[3], (k) => m.get(k)?.some(o => overlaps(o, b))),
        near: (at, px) => px > 0 && each(at[0] - px, at[1] - px, at[0] + px, at[1] + px,
            (k) => m.get(k)?.some(o => Math.hypot((o[0] + o[2]) / 2 - at[0], (o[1] + o[3]) / 2 - at[1]) < px)),
    };
}

/** The layer of names over the canvas: show(fin, frameView, on) each frame. Which names show (never on top of each
 *  other) is worked out only when the states or the screen change, a few times a second while the view moves and once
 *  when it rests; in between, each label is only moved to where its place now stands. */
export function statesLabels(after) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'states-labels'); svg.setAttribute('aria-hidden', 'true');
    after.after(svg);
    let size = '', live = [], laidT = null, laidAt = 0, viewKey = '', movedAt = 0, ring = null, ringOf = null, shown = false, reachG = null, shape = null, hoverG = null, hoverOf, lit = null;
    // (the places named so far, each with the scale (px per km where it stands) it was first named at: while the view is
    //  no farther out than that there, it keeps its name before any other is weighed — so zooming in only adds names)
    let won = new Map(), wonT = null;
    const STICK = 0.97;
    /** A place on the screen, or null where it is out of sight (the globe's far side, off the map; within `margin` of the
     *  globe's horizon). */
    const screen = (fv, lat, lon, margin = HORIZON_MARGIN) => {
        if (fv.kind === 'globe') {
            const p = fv.local(lon * D, lat * D), c = fv.cam, n = Math.hypot(c[0], c[1], c[2]);
            const facing = (p[0] * c[0] + p[1] * c[1] + p[2] * c[2]) / n;
            // (past the horizon, or too close to it to read: the margin a share of the way from the horizon to the point
            //  under the camera, so a close view, whose horizon is near, still shows what lies before it)
            const hz = 1 / fv.d;
            if (facing < hz + margin * (1 - hz)) return null;
            return fv.toScreen(p);
        }
        const q = P[fv.id].fwd(wrap(lon * D - fv.centre), lat * D, fv.opts);
        if (!q) return null;
        let X = q[0];
        if (fv.xRange) { const pw = fv.xRange[1] - fv.xRange[0]; while (X < fv.xRange[0]) X += pw; while (X > fv.xRange[1]) X -= pw; }
        return fv.toClient(X, q[1]);
    };
    /** Pixels per km about a place on the screen (read over a short step: a close globe's horizon is only a few degrees
     *  off, so a step of a degree would fall past it). */
    const pxPerKm = (fv, lat, lon, at) => {
        const step = 0.05, la = lat + (lat > 0 ? -step : step);
        const b = fv.kind === 'globe' ? fv.toScreen(fv.local(lon * D, la * D)) : screen(fv, la, lon);
        return b ? Math.hypot(b[0] - at[0], b[1] - at[1]) / (step * Math.PI * R / 180) : 0;
    };
    /** What the view is: the map's own key, or where the globe's centre and axes fall on the screen. */
    const keyOf = (fv) => fv.kind === 'map' ? String(fv.key)
        : [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map(p => fv.toScreen(p).map(v => v.toFixed(1)).join(',')).join(';');
    function clear() { if (shown) { svg.replaceChildren(); live = []; ring = null; hoverG = null; shown = false; } laidT = null; }

    /** Which names show and where: each label a group placed at its place, its parts drawn about it. */
    function layout(T, fv) {
        const w = innerWidth, h = innerHeight, kept = boxes(), items = [];
        // (on the screen, and on a map within its frame: a zoomed map's names never spill onto the mat round it)
        const [l0, t0, r0, b0] = fv.clip ?? [0, 0, w, h], L0 = Math.max(0, l0) + 2, T0 = Math.max(0, t0) + 2, R0 = Math.min(w, r0) - 2, B0 = Math.min(h, b0) - 2;
        const inside = (b) => b[0] > L0 && b[1] > T0 && b[2] < R0 && b[3] < B0;
        const boxAt = (at, rel, pad = 0) => [at[0] + rel[0] - pad, at[1] + rel[1] - pad, at[0] + rel[2] + pad, at[1] + rel[3] + pad];
        const pins = boxes();   // (the places' own boxes, without the states' and regions' names)
        const put = (at, rel, lat, lon, html, kind, box) => { kept.add(box); if (kind) pins.add(box); items.push({ at, rel, lat, lon, html, kind }); };
        const RP = rankedPlaces(T), anchors = boxes(), named = new Set();
        if (wonT !== T) { won = new Map(); wonT = T; }
        // (every place's name keeps GAP_PX from every place name already shown, the most important first: so the screen,
        // not a tier, decides how many show — zoomed out a few, zoomed in more, a crowded valley thinner than the steppe)
        const spaced = (at) => !anchors.near(at, GAP_PX);
        const claim = (at) => anchors.add([at[0], at[1], at[0], at[1]]);
        // (the capitals: a pin, every reason as an icon, the name — those named before first (as the places below), so a
        // capital that gains room as the view zooms in never takes the name of a place already shown)
        const capital = (cap, s, at) => {
            const why = cap.why ?? [], iw = iconsW(why, 15), tw = s.name.length * 9.7 + 4, rel = [-6, -11, 10 + iw + tw, 11], box = boxAt(at, rel);
            if (!inside(box) || kept.hits(box)) return;
            put(at, rel, cap.lat, cap.lon, `<circle class="sl-cap" r="4.5"/>${icons(why, 9, -7.5, 15, cap)}<text class="sl-cap-name" x="${(9 + iw).toFixed(1)}" y="6">${esc(s.name)}</text>`, 'cap', box);
            claim(at); named.add(cap);
            if (!won.has(cap)) won.set(cap, pxPerKm(fv, cap.lat, cap.lon, at));
        };
        // (where a place stands on the screen, if it was named before and the view there is no farther out than then)
        const stuck = (p) => {
            const k0 = won.get(p);
            if (k0 === undefined) return null;
            const at = screen(fv, p.lat, p.lon);
            if (!at || at[0] < 0 || at[1] < 0 || at[0] > w || at[1] > h) return null;
            if (pxPerKm(fv, p.lat, p.lon, at) < STICK * k0) { won.delete(p); return null; }
            return at;
        };
        for (const { p: cap, st: s } of RP.caps) { const at = stuck(cap); if (at) capital(cap, s, at); }   // (no GAP_PX: zooming in only spreads them)
        // (a place: its mark — a dot sized by its tier, a fort its tower — every other reason it stands as an icon, its name)
        const place = (p, rank, kind, at, pad) => {
            const t = TIER[rank], fort = rank === 'fort', ic = t.ic, why = (p.why ?? []).filter(k => !fort || k !== 'hold');
            const x0 = fort ? ic / 2 + 2 : t.r + 3, iw = iconsW(why, ic), tw = p.name.length * t.em + 4;
            const rel = [fort ? -ic / 2 - 1 : -t.r - 2, -10, x0 + iw + tw, 10], box = boxAt(at, rel, pad);
            if (!inside(box) || kept.hits(box)) return false;
            const mark = fort ? icons(['hold'], -ic / 2, -ic / 2, ic) : `<circle class="sl-mark ${t.cls}${p.hub ? ' sl-hub' : ''}" r="${t.r}"/>`;
            put(at, rel, p.lat, p.lon, `${mark}${icons(why, x0, -ic / 2, ic, p)}<text class="${t.name}${p.hub ? ' sl-hub-name' : ''}" x="${(x0 + iw).toFixed(1)}" y="5">${esc(p.name)}</text>`, kind, box);
            claim(at); named.add(p);
            if (!won.has(p)) won.set(p, pxPerKm(fv, p.lat, p.lon, at));
            return true;
        };
        // (the places named before, most important first, while the view there is no farther out than when each was first
        // named: they keep their names, so a zoom in only adds names and never swaps one for another)
        for (const { p } of RP.places) {
            const at = stuck(p);
            if (at) place(p, p.rank, p.rank === 'city' ? 'town' : 'place', at, 0);   // (no PAD nor GAP_PX: a keeper is named with neither)
        }
        for (const { p: cap, st: s } of RP.caps) {
            if (named.has(cap)) continue;
            const at = screen(fv, cap.lat, cap.lon);
            if (at && spaced(at)) capital(cap, s, at);
        }
        // (each state's resource keepers (rankedPlaces): every resource a state holds shows at every zoom, however small
        // the place that holds it — named where there is room (no GAP_PX, no FLOOR_PX), else only its mark and the
        // badges of what it keeps, beside the mark or above, below or before it, over a state's name if it must be)
        const kindOf = (p) => p.rank === 'cap' ? 'cap' : p.rank === 'city' ? 'town' : 'place';
        // (which level of the natural regions the resources roll up to: the finest whose regions are ROLL_PX across at
        // the view's scale (the median of the capitals on the screen), else the states — the scale in km, so any Detail)
        const scales = [];
        for (const { p } of RP.caps) {
            const at = screen(fv, p.lat, p.lon);
            if (at && at[0] >= 0 && at[1] >= 0 && at[0] <= w && at[1] <= h) scales.push(pxPerKm(fv, p.lat, p.lon, at));
        }
        scales.sort((a, b) => a - b);
        const scale = scales.length ? scales[scales.length >> 1] : 0;
        let roll = -1;
        if (T.S.nature) for (let l = Math.min(NATURE_KM2.length, T.S.nature.levels.length) - 1; l >= 0; l--) if (Math.sqrt(NATURE_KM2[l]) * scale >= ROLL_PX) roll = l;
        for (const { p, ks } of RP.keepers(roll)) {
            if (named.has(p)) continue;
            const at = screen(fv, p.lat, p.lon);
            if (!at || at[0] < 0 || at[1] < 0 || at[0] > w || at[1] > h) continue;
            if (p.rank !== 'cap' && place(p, p.rank, kindOf(p), at, 0)) continue;
            const cap = p.rank === 'cap', fort = p.rank === 'fort', t = TIER[cap ? 'city' : p.rank], ic = t.ic, r = cap ? 4.5 : fort ? ic / 2 : t.r;
            const mark = cap ? '<circle class="sl-cap" r="4.5"/>' : fort ? icons(['hold'], -ic / 2, -ic / 2, ic)
                : `<circle class="sl-mark ${t.cls}${p.hub ? ' sl-hub' : ''}" r="${t.r}"/>`;
            const bw = ks.length * (ic + IG) - IG;
            // (where the badges go round the mark: [their left, their top], from the place)
            const spots = [[r + 2, -ic / 2], [-r - 2 - bw, -ic / 2], [-bw / 2, -r - 2 - ic], [-bw / 2, r + 2]];
            let done = false;
            for (const pass of [0, 1, 2]) {   // (clear of everything; of the places only; and at last beside the mark whatever is there)
                for (const [x, y] of spots) {
                    const rel = [Math.min(-r - 1, x), Math.min(-r - 1, y), Math.max(r + 1, x + bw), Math.max(r + 1, y + ic)], box = boxAt(at, rel, 1);
                    if (!inside(box) || (pass < 2 && (pass ? pins : kept).hits(box))) continue;
                    put(at, rel, p.lat, p.lon, `${mark}${icons(ks, x, y, ic, p)}`, kindOf(p), box);
                    named.add(p); done = true;
                    break;
                }
                if (done) break;
            }
        }
        // (the cities, towns, forts and villages, by their importance (rankedPlaces), each kept GAP_PX from the names
        // already shown; a town, fort or village not before its tier's spacing is FLOOR_PX on the screen, so the whole
        // planet never shows a lone village in an empty land — the scale read where each stands, so the near side of a
        // tilted globe shows more than its rim)
        const tierKm = { fort: TIERS.townKm, town: TIERS.townKm, village: TIERS.villageKm };
        for (const { p, s } of RP.places) {
            const at = screen(fv, p.lat, p.lon);
            if (named.has(p) || !at || at[0] < 0 || at[1] < 0 || at[0] > w || at[1] > h || !spaced(at)) continue;
            const city = p.rank === 'city';
            if (!city && tierKm[p.rank] * pxPerKm(fv, p.lat, p.lon, at) < FLOOR_PX) continue;
            place(p, p.rank, city ? 'town' : 'place', at, city ? 0 : PAD);
        }
        svg.innerHTML = DEFS + '<g class="sl-reach"><path class="sl-reach-fill"/><path class="sl-reach-halo"/><path class="sl-reach-edge"/></g>'
            + `<g class="sl-hover${statesOverlay.hover >= 0 ? ' on' : ''}"><path class="sl-hover-glow"/><path class="sl-hover-edge"/><g class="sl-hover-names"></g></g>` + items.map(it => `<g transform="translate(${it.at[0].toFixed(1)} ${it.at[1].toFixed(1)})">${it.html}</g>`).join('')
            + '<circle class="sl-sel" r="9" style="display:none"/>';
        const gs = svg.children;   // (the defs first, then the picked place's reach, the hovered region, the ring last)
        live = items.map((it, j) => ({ g: gs[j + 3], lat: it.lat, lon: it.lon, rel: it.rel, kind: it.kind, at: it.at, off: false }));
        reachG = gs[1]; hoverG = gs[2]; hoverOf = undefined; ring = gs[gs.length - 1]; ringOf = undefined; shape = null; shown = true;
    }
    /** Every label moved to where its place now stands (hidden where it is out of sight). */
    function move(fv) {
        for (const l of live) {
            const at = screen(fv, l.lat, l.lon);
            l.at = at;
            if (!at) { if (!l.off) { l.g.style.display = 'none'; l.off = true; } continue; }
            if (l.off) { l.g.style.display = ''; l.off = false; }
            l.g.setAttribute('transform', `translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`);
        }
    }
    function show(fin, fv, on) {
        if (!on || !statesOverlayCan(fin)) { clear(); return; }
        const T = statesOf(fin), w = innerWidth, h = innerHeight, now = performance.now(), vk = keyOf(fv);
        let moved = false;
        if (size !== `${w}x${h}`) { size = `${w}x${h}`; svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.style.width = `${w}px`; svg.style.height = `${h}px`; laidT = null; }
        if (T !== laidT) { layout(T, fv); laidT = T; laidAt = now; viewKey = vk; moved = true; }
        else if (vk !== viewKey) {
            viewKey = vk; movedAt = now; moved = true;
            if (now - laidAt > RELAY_MS) { layout(T, fv); laidAt = now; } else move(fv);
        } else if (laidAt < movedAt && now - movedAt > SETTLE_MS) { layout(T, fv); laidAt = now; moved = true; }
        // (the picked place, ringed)
        const sel = statesOverlay.sel;
        if (ring && (moved || sel !== ringOf)) {
            ringOf = sel;
            const at = sel && screen(fv, sel[0], sel[1]);
            if (at) { ring.setAttribute('transform', `translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`); ring.style.display = ''; }
            else ring.style.display = 'none';
            if (shape?.sel !== sel) shape = reachShape(T, sel);
            drawReach(fv);
        }
        // (the hovered region: its border and its name lit, fading in and out; the last one kept while it fades out)
        const hv = statesOverlay.hover ?? -1;
        if (hoverG && (moved || hv !== hoverOf)) {
            hoverOf = hv;
            if (hv >= 0 && lit?.gi !== hv) lit = { gi: hv, ...hoverShape(T, fin, hv) };
            hoverG.classList.toggle('on', hv >= 0);
            drawHover(fv);
        }
    }
    /** The lit region (lit) drawn where it now stands: its border's runs, pen up where one goes out of sight or is torn
     *  across the map's edge; each letter of its name over its engraved one, at the size and turn it has on the screen. */
    function drawHover(fv) {
        if (!hoverG) return;
        let d = '', t = '';
        if (lit) {
            const wide = innerWidth / 4;
            for (const { pts, closed } of lit.runs) {
                let pen = false, prev = null, whole = true;
                for (const [lat, lon] of pts) {
                    const q = screen(fv, lat, lon, 0);
                    if (!q) { pen = false; whole = false; continue; }
                    if (prev && Math.abs(q[0] - prev[0]) > wide) { pen = false; whole = false; }
                    d += `${pen ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
                    pen = true; prev = q;
                }
                if (closed && whole && pen) d += 'Z';
            }
            if (statesOverlay.names > 0) for (const nm of lit.names) for (const g of nm.glyphs) {
                const lat = 90 - g.v * 180, lon = g.u * 360 - 180, at = screen(fv, lat, lon);
                if (!at) continue;
                // (the letter's own frame as engraved, projected: half an em along its baseline and half down its upright, so
                //  it turns and foreshortens with the land exactly as the engraved letter under it; font-size 1 is one em)
                const k = nm.fs / 2, sn = Math.sin(g.ang), cs = Math.cos(g.ang);
                const bx = screen(fv, lat - sn * k / KM_DEG, lon + cs * k / (KM_DEG * g.cl), 0), by = screen(fv, lat - cs * k / KM_DEG, lon - sn * k / (KM_DEG * g.cl), 0);
                if (!bx || !by) continue;
                const xa = 2 * (bx[0] - at[0]), xb = 2 * (bx[1] - at[1]), ya = 2 * (by[0] - at[0]), yb = 2 * (by[1] - at[1]);
                if (Math.min(Math.hypot(xa, xb), Math.hypot(ya, yb)) < SURFACE_NAMES.minPx) continue;
                const f2 = v => v.toFixed(2);
                t += `<text transform="matrix(${f2(xa)} ${f2(xb)} ${f2(ya)} ${f2(yb)} ${f2(at[0])} ${f2(at[1])})" y="${middleDrop(nm.style).toFixed(4)}" font-size="1">${esc(g.ch)}</text>`;
            }
        }
        hoverG.children[0].setAttribute('d', d); hoverG.children[1].setAttribute('d', d);
        hoverG.children[2].innerHTML = t;
    }
    /** A picked place's food reach (states-view.js peopleOf): the land that would sell its food to it before any other,
     *  traced round the cells' middles (marching squares), the outline's loops chained and rounded (Chaikin) so it
     *  reads as a reach, not as cells. { sel, loops: [[lat, lon]…][] } */
    function reachShape(T, sel) {
        const out = { sel, loops: [] }, F = T.feeds;
        const p = sel && F?.all.find(q => q.lat === sel[0] && q.lon === sel[1]);
        if (!p) return out;
        const { w, h, rowKm } = T.S, f = F.feeder, i = p.i, r = feedKm(p);
        const y0 = (p.c / w) | 0, x0 = p.c - y0 * w, ry = Math.ceil(r / rowKm) + 1;
        const lat0 = Math.max(Math.abs(90 - (y0 - ry) / h * 180), Math.abs(90 - (y0 + ry + 1) / h * 180));
        const rx = Math.min(w >> 1, Math.ceil(r / (2 * Math.PI * R / w * Math.max(0.05, Math.cos(Math.min(89, lat0) * D)))) + 1);
        const inn = (x, y) => y >= 0 && y < h && f[y * w + ((x % w) + w) % w] === i;
        const pt = ([x, y]) => [90 - (y / 2 + 0.5) / h * 180, (x / 2 + 0.5) / w * 360 - 180];
        out.loops = traceLoops(inn, x0 - rx - 1, x0 + rx, y0 - ry - 1, y0 + ry).map(l => l.map(pt));
        return out;
    }
    /** The reach drawn where it now stands (nothing on the far side, nor a loop torn across the map's edge). */
    function drawReach(fv) {
        if (!reachG) return;
        const at = ([lat, lon]) => screen(fv, lat, lon), wide = innerWidth / 4, line = (pts) => {
            const q = pts.map(at);
            if (q.some(v => !v)) return '';
            if (q.some((v, j) => Math.abs(v[0] - q[(j + 1) % q.length][0]) > wide)) return '';
            return 'M' + q.map(v => `${v[0].toFixed(1)} ${v[1].toFixed(1)}`).join('L') + 'Z';
        };
        const d = shape ? shape.loops.map(line).join('') : '';
        for (const el of reachG.children) el.setAttribute('d', d);
    }
    /** The place at (x, y) on the screen: a name or mark drawn there, else a capital or city within 14 px (where the
     *  names are not drawn; the smaller places only where drawn). { kind, lat, lon } or null. */
    function pick(fin, fv, x, y) {
        const pad = 4, hit = shown && live.find(l => l.kind && l.at && x >= l.at[0] + l.rel[0] - pad && x <= l.at[0] + l.rel[2] + pad
            && y >= l.at[1] + l.rel[1] - pad && y <= l.at[1] + l.rel[3] + pad);
        if (hit) return { kind: hit.kind, lat: hit.lat, lon: hit.lon };
        if (!statesOverlayCan(fin)) return null;
        const T = statesOf(fin);
        let best = null, bd = 14;
        for (const [kind, list] of [['cap', T.caps], ['town', T.towns]]) for (const p of list) {
            const at = screen(fv, p.lat, p.lon), d = at ? Math.hypot(at[0] - x, at[1] - y) : Infinity;
            if (d < bd) { bd = d; best = { kind, lat: p.lat, lon: p.lon }; }
        }
        return best;
    }
    return { show, pick };
}
