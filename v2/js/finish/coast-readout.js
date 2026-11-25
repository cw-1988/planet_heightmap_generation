// The hover's words for a warm coast's cover (docs/coral-reefs-mangroves.md): mangroves and coral reefs are drawn in
// colours close to the land and sea beside them (the Satellite's natural colour, a palette's own lowland), so the readout
// names them — colour is never alone (docs/style-guide/README.md, Access). The coast's kinds as littoral.js draws them:
// coastClasses, from the detail's drivers at the place, only on the picture's shore (a pixel beside the other side).

import { coastClasses, winterOf, LITTORAL } from './littoral.js';

const SHOW = 0.25;   // (a kind named from this share of the coast: its colour reads from about here)
const cls = [0, 0, 0, 0, 0];

/** The warm coast's covers at [u, v] of a finished picture (fin.raster: w, h, ocean, drivers) — [] off the shore or on
 *  a moment finished before the warm coasts' drivers. Each { kind: 'mangrove' | 'reef', share 0 … 1 }. */
export function coastCoverAt(R, u, v) {
    const d = R?.drivers;
    if (!d?.winter || !R.ocean) return [];
    const W = R.w, H = R.h, x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H));
    const here = R.ocean[y * W + x];
    let shore = false;
    for (let dy = -1; dy <= 1 && !shore; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        if (R.ocean[yy * W + (x + dx + W) % W] !== here) { shore = true; break; }
    }
    if (!shore) return [];
    const p = Math.min(d.h - 1, Math.floor(v * d.h)) * d.w + Math.min(d.w - 1, Math.floor(u * d.w));
    const wave = d.wave[p] / 255, tideM = d.tide[p] / 255 * LITTORAL.tideMaxM, sand = d.sand[p] / 255;
    if (!(wave + tideM + sand > 0)) return [];
    coastClasses(wave, tideM, sand, 0, 2 * d.rugged[p] / 255, 0.5, cls, winterOf(d.winter[p] / 255), d.muddy[p] / 255,
        d.wet ? d.wet[p] / 255 : 0.5);
    const out = [];
    if (cls[4] >= SHOW) out.push({ kind: 'mangrove', share: cls[4] });
    if (here && cls[3] >= SHOW) out.push({ kind: 'reef', share: cls[3] });
    return out;
}

/** The readout's words for a cover. */
export const COVER_WORDS = { mangrove: 'Mangroves', reef: 'Coral reef' };
