// The rocks under a window of the world map's finer detail (split out of fine-detail.js): each pixel's rock properties
// and climate, read from the finish's rock picture, for the bedding, the rock's landforms and the coast's headlands.

import { GEOLOGY } from '../geology/geology-config.js';
import { rockHard } from '../geology/lithology.js';

const D2R = Math.PI / 180;

/**
 * The rocks under each pixel of a window's extended rows and columns (the finish's rock picture, `src.g`) and their
 * climate (`src.c`, the same grid): each rock's properties (geology-config.js lithology; a soluble rock's hardness by its
 * climate) read eased-bilinear over the picture's land pixels — a contact soft over one of its pixels (~10 km), never its
 * squares — at every pixel with land among its four (the sea's beside the coast too; `land`: the land's share of the four);
 * elsewhere the neutral values (dissect ½). Arrays of ew × eh.
 */
export function rockProps(src, W, X0, Y0, ew, eh, latR, G = GEOLOGY) {
    const g = src.g, c = src.c, GW = g.fw ?? g.w, GH = g.fh ?? g.h, gx0 = g.x0 ?? 0, gy0 = g.y0 ?? 0, gw = g.w, gh = g.h, N = ew * eh, L = G.lithology;
    // (the climate's picture: the same grid as the rocks' — finishRaster makes both — so the same pixels)
    const climate = c && (c.fw ?? c.w) === GW && (c.x0 ?? 0) === gx0 && (c.y0 ?? 0) === gy0 && c.w === gw && c.h === gh ? c : null;
    const out = { land: new Float32Array(N), hard: new Float32Array(N), dissect: new Float32Array(N).fill(0.5), bedded: new Float32Array(N), knobby: new Float32Array(N),
        soluble: new Float32Array(N), T: new Float32Array(N).fill(10), P: new Float32Array(N).fill(600) };
    const xA = new Int32Array(ew), xB = new Int32Array(ew), fx = new Float32Array(ew), rA = new Int32Array(eh), rB = new Int32Array(eh), fy = new Float32Array(eh);
    const colOf = a => Math.min(gw - 1, ((a - gx0) % GW + GW) % GW), rowOf = y => Math.min(gh - 1, Math.max(0, Math.max(0, Math.min(GH - 1, y)) - gy0)) * gw;
    for (let i = 0; i < ew; i++) {
        const u = ((((X0 + i + 0.5) / W) % 1 + 1) % 1) * GW - 0.5, xf = Math.floor(u), a0 = (xf + GW) % GW, t = u - xf;
        fx[i] = t * t * (3 - 2 * t); xA[i] = colOf(a0); xB[i] = colOf((a0 + 1) % GW);
    }
    for (let j = 0; j < eh; j++) {
        const v = (90 - latR[j] / D2R) / 180 * GH - 0.5, ya = Math.max(0, Math.min(GH - 1, Math.floor(v))), yb = Math.min(GH - 1, ya + 1), t = Math.max(0, Math.min(1, v - ya));
        fy[j] = t * t * (3 - 2 * t); rA[j] = rowOf(ya); rB[j] = rowOf(yb);
    }
    const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0];
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i;
        idx[0] = rA[j] + xA[i]; idx[1] = rA[j] + xB[i]; idx[2] = rB[j] + xA[i]; idx[3] = rB[j] + xB[i];
        if (!g.rock[idx[0]] && !g.rock[idx[1]] && !g.rock[idx[2]] && !g.rock[idx[3]]) continue;
        wt[0] = (1 - fx[i]) * (1 - fy[j]); wt[1] = fx[i] * (1 - fy[j]); wt[2] = (1 - fx[i]) * fy[j]; wt[3] = fx[i] * fy[j];
        // (the climate first: a soluble rock's hardness needs it)
        let ws = 0, T = 0, Pm = 0;
        if (climate) for (let q = 0; q < 4; q++) { const t = climate.tAnnual[idx[q]]; if (t === -32768) continue; ws += wt[q]; T += wt[q] * t / 100; Pm += wt[q] * climate.pAnnual[idx[q]]; }
        if (ws > 0) { T /= ws; Pm /= ws; out.T[p] = T; out.P[p] = Pm; } else { T = out.T[p]; Pm = out.P[p]; }
        let wl = 0, hard = 0, dis = 0, bed = 0, knob = 0, sol = 0;
        for (let q = 0; q < 4; q++) {
            const k = g.rock[idx[q]];
            if (!k) continue;
            const w = wt[q];
            wl += w; hard += w * rockHard(k, T, Pm, G); dis += w * L.dissect[k]; bed += w * L.bedded[k]; knob += w * L.knobby[k]; sol += w * L.soluble[k];
        }
        if (!(wl > 0)) continue;
        out.land[p] = wl; out.hard[p] = hard / wl; out.dissect[p] = dis / wl; out.bedded[p] = bed / wl; out.knobby[p] = knob / wl; out.soluble[p] = sol / wl;
    }
    return out;
}
