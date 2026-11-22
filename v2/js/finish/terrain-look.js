// The terrain on the satellite picture (S2), drawn over the finished picture's climate colours (finish-raster.js
// rasterFinish): what reads the picture whole first, on the finish's thread (lookSetup: the heights at the climate's
// pixels, the land's surroundings, the rivers' ribbons as segments), then each band of rows its own (lookRows: the
// riverside and every pixel's tints) — raster-workers.js hands the bands to its workers, terrainLook here draws them
// all at once. The same pixels either way: a pixel reads only its own band's colours, and the riverside is the most of
// what covers it, in any order.

import { COVER } from './finish-config.js';
import { toLin, toSrgb } from './finish-cover.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The terrain on the satellite picture (S2): per land pixel of the climate's picture (finish-raster.js: C — its
 * sat views, cover, tAnnual, pAnnual, flow (log10 km² drained, per pixel), noise — and the finished heights, `heightM`
 * w wide), from the heights there: rock and scree where the ground is rugged or steep (most where it is dry or cold;
 * less in a snowy month); in dry country the slopes facing the pole greener and those facing the equator barer, the
 * valleys greener and the ridges barer; and over everything the flow texture, by the area drained. In place.
 */
export function terrainLook(C, heightM, w, K = COVER) {
    const { L, mean, std } = lookSetup(C, heightM, w, K);
    lookRows(L, { ...lookBand(C, 0, C.h), mean, std }, 0, C.h, C.noise, K);
}

/** What the bands read whole: L {cw, ch, pxKm, hC (heights at the climate's pixels, km), land, tAnnual, pAnnual, segs
 *  (the rivers' ribbons, riverSegments), lakePx (the lakes' pixels)} — and the land's surroundings' mean and spread
 *  over K.valleyKm, read per pixel (a band's slice of them is its own). */
export function lookSetup(C, heightM, w, K = COVER) {
    const { w: cw, h: ch, koppen, water, tAnnual, pAnnual, noise } = C, f = w / cw, pxKm = 2 * Math.PI * 6371 / cw;
    const hC = new Float32Array(cw * ch), land = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; hC[i] = heightM[y * f * w + x * f] / 1000; land[i] = koppen[i] ? 1 : 0; }
    const { mean, std } = boxStats(hC, land, cw, ch, pxKm, K.valleyKm);
    // (the riverside only where it is dry enough for the green to show — most rivers run through green country)
    const dryAt = i => { const T = tAnnual[i] / 100; return 1 - smooth(0.25, 1, pAnnual[i] / Math.max(60, 300 + 55 * T)); };
    const ripOn = !!C.ripSat, segs = ripOn && C.rivers ? riverSegments(C.rivers, hC, land, cw, ch, pxKm, K, noise, dryAt) : null;
    let lakePx = null;
    if (ripOn && water) {
        lakePx = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = water[y * f * w + x * f]; if (v === 1 || v === 2) lakePx[y * cw + x] = 1; }
    }
    return { L: { cw, ch, pxKm, hC, land, tAnnual, pAnnual, segs, lakePx }, mean, std };
}

/** The arrays of C a band of rows y0…y1−1 reads and writes, from its first row: the whole ones themselves for the whole
 *  picture, copies otherwise (copy: true). mean and std are the caller's to add. */
export function lookBand(C, y0, y1, copy = false) {
    const cw = C.w, cut = (a, k = 1) => a && (copy ? a.slice(k * y0 * cw, k * y1 * cw) : a);
    return { sat: [C.sat.year, C.sat.jan, C.sat.jul].map(a => cut(a, 3)), ripSat: C.ripSat ? [C.ripSat.year, C.ripSat.jan, C.ripSat.jul].map(a => cut(a, 3)) : null,
        cover: cut(C.cover), flow: cut(C.flow), young: cut(C.young) };
}

/** Rows y0…y1−1 of the terrain on the satellite picture: B's arrays (lookBand, with mean and std) from row y0, L's whole;
 *  B.sat in place. */
export function lookRows(L, B, y0, y1, noise, K = COVER) {
    const { cw, ch, pxKm, hC, land, tAnnual, pAnnual, segs, lakePx } = L, { sat: views, ripSat: ripViews, cover, flow, young, mean, std } = B, off = y0 * cw;
    const lnTone = K.mtnToneTint.map(Math.log);
    // (the rivers' green ribbons and the lakes' fringes: how much of each pixel is riverside, 0…1)
    const rip = ripViews && (segs || lakePx) ? riparian(segs, lakePx, land, cw, ch, pxKm, K, y0, y1) : null;
    const rg = 6371 / K.ripGrainKm;
    const LUT = Float64Array.from({ length: 256 }, (_, v) => toLin(v)), rW = K.rockWarm.map(toLin), rC = K.rockCold.map(toLin);
    const lnG = K.greenerTint.map(Math.log), lnB = K.barerTint.map(Math.log), lnF = K.flowTint.map(Math.log);
    const fLo = Math.log10(K.flowAreaKm2[0]), fHi = Math.log10(K.flowAreaKm2[1]), fg = 6371 / K.flowGrainKm, mul = [0, 0, 0], mulR = [0, 0, 0], rk = [0, 0, 0];
    // (the mountain texture: its octaves down to two pixels; the light as the page's — from the north-west, 45° up)
    let mOct = 0;
    for (let lam = K.mtnTextureKm; lam >= 2 * pxKm && mOct < 4; lam /= 2) mOct++;
    mOct = Math.max(1, mOct);
    const mf = 6371 / K.mtnTextureKm, dU = 0.25 * (K.mtnTextureKm / 2 ** (mOct - 1)) / 6371, Le = -0.5, Ln = 0.5, Lu = Math.SQRT1_2;
    const ridged = (x, y, z) => { let s = 0, a = 1, t = 0, f = mf; for (let o = 0; o < mOct; o++, a *= 0.5, f *= 2) { const v = 1 - Math.abs(noise.noise3D(f * x + 11.3, f * y - 7.1, f * z + 3.9)); s += a * v * v; t += a; } return s / t; };
    // (each column's longitude's cosine and sine, once; and per pixel the mountains' tone and the flow texture on snow
    // worked out once for the three views, as they need them)
    const cosL = new Float64Array(cw), sinL = new Float64Array(cw), toneE = [0, 0, 0], toneS = [0, 0, 0], flowS = [0, 0, 0];
    for (let x = 0; x < cw; x++) { const lon = ((x + 0.5) / cw - 0.5) * 2 * Math.PI; cosL[x] = Math.cos(lon); sinL[x] = Math.sin(lon); }
    for (let y = y0; y < y1; y++) {
        const lat = (0.5 - (y + 0.5) / ch) * Math.PI, cl = Math.max(0.05, Math.cos(lat)), sl = Math.sin(lat), pole = lat >= 0 ? 1 : -1;
        const up = Math.max(0, y - 1) * cw, dn = Math.min(ch - 1, y + 1) * cw, row = y * cw;
        for (let x = 0; x < cw; x++) {
            const i = row + x, b = i - off;                      // (i: the whole picture's pixel; b: the band's)
            if (!land[i]) continue;
            // the slope (m per km) and the way it faces
            const ge = (hC[row + (x + 1 === cw ? 0 : x + 1)] - hC[row + (x === 0 ? cw - 1 : x - 1)]) / (2 * pxKm * cl), gn = (hC[up + x] - hC[dn + x]) / (2 * pxKm);
            const slope = 1000 * Math.sqrt(ge * ge + gn * gn);
            // the place's dryness and cold (its year: rain against the potential evaporation the rivers use)
            const T = tAnnual[i] / 100, wet = pAnnual[i] / Math.max(60, 300 + 55 * T);
            const dry = 1 - smooth(0.25, 1, wet), cold = smooth(3, -6, T);
            const rugged = Math.max(smooth(K.rockRelief[0], K.rockRelief[1], std[b]), smooth(K.rockSlope[0], K.rockSlope[1], slope));
            const rock = K.rockMax * rugged * (K.rockExposure + (1 - K.rockExposure) * Math.max(dry, cold));
            // facing the pole (+1) or the equator (−1), on a slope; below (+) or above (−) the surroundings
            const facing = slope > 1e-3 ? (-gn * pole * 1000 / slope) * smooth(K.aspectSlope[0], K.aspectSlope[1], slope) : 0;
            const valley = Math.max(-1, Math.min(1, (mean[b] - hC[i]) / K.valleyKmPerFull));
            const lean = dry * (K.aspectShare * facing + K.valleyShare * valley), tint = lean >= 0 ? lnG : lnB, a = Math.abs(lean);
            // the flow texture: its opacity by the area drained, grained
            let fo = 0;
            if (flow) {
                fo = K.flowOpacity * smooth(fLo, fHi, flow[b]);
                if (fo > 0 && noise) fo *= Math.max(0, 1 + K.flowGrain * noise.fbm(fg * cl * cosL[x] - 4.1, fg * cl * sinL[x] + 6.3, fg * sl + 2.2, 2, 0.5) / 0.3);
            }
            // the mountains' texture: how mountainous (rugged, or high), a ridged micro-relief there lit as the page's relief,
            // its crests barer
            const M = Math.max(smooth(K.mtnRelief[0], K.mtnRelief[1], std[b]), K.mtnHigh * smooth(K.mtnHeightKm[0], K.mtnHeightKm[1], hC[i]));
            let dShade = 1, crest = 0;
            if (M > 0.01 && noise) {
                const px = cl * cosL[x], py = cl * sinL[x], pz = sl;
                // (east and north at this place, on the unit sphere)
                const ex = -sinL[x], ey = cosL[x], nx = -sl * cosL[x], ny = -sl * sinL[x], nz = cl;
                const r0 = ridged(px, py, pz), rE = ridged(px + dU * ex, py + dU * ey, pz), rN = ridged(px + dU * nx, py + dU * ny, pz + dU * nz);
                const amp = K.mtnReliefKm * M, gE = amp * (rE - r0) / (dU * 6371), gN = amp * (rN - r0) / (dU * 6371);
                const sx = -K.mtnExaggeration * gE, sy = -K.mtnExaggeration * gN, len = Math.sqrt(sx * sx + sy * sy + 1);
                dShade = Math.max(0.55, Math.min(1.35, (sx * Le + sy * Ln + Lu) / len / Lu));
                crest = K.mtnCrestRock * M * smooth(0.45, 0.85, r0);
            }
            // the mountains' tone: young and high ranges dark brown, old worn ones a little
            const yg = young ? young[b] / 255 : 1;
            const tone = K.mtnTone * M * (K.mtnToneOld + (1 - K.mtnToneOld) * yg) * (0.5 + 0.5 * smooth(K.mtnToneHeightKm[0], K.mtnToneHeightKm[1], hC[i]));
            // (the ground's own tints first — slopes, valleys, the flow texture; then the river green over them; then the
            // mountains' light, tone and rock over all: "mountain texture should probably layer on top of rivers")
            for (let c = 0; c < 3; c++) { mul[c] = Math.exp(a * tint[c] + fo * lnF[c]); mulR[c] = Math.exp(a * tint[c]); rk[c] = rC[c] + (rW[c] - rC[c]) * smooth(-2, 12, T); }
            // (the riverside's opacity, grained)
            let rp = rip ? rip[b] * dry * K.ripMax : 0;
            if (rp > 0 && noise) rp *= Math.max(0, 1 + K.ripGrain * noise.fbm(rg * cl * cosL[x] + 8.8, rg * cl * sinL[x] - 3.3, rg * sl + 6.1, 2, 0.5) / 0.3);
            const cv = cover[b], ice = (cv & 31) === 1;
            let snowDone = false;
            for (let c = 0; c < 3; c++) toneE[c] = Math.exp(tone * lnTone[c]);
            for (let v = 0; v < 3; v++) {
                const S = views[v], o = 3 * b, snowy = ice || (v === 1 && cv & 32) || (v === 2 && cv & 64);
                // (the riverside: the climate's own cover, well watered — its season and warmth its own)
                const g = snowy ? 0 : Math.min(1, rp), RV = ripViews ? ripViews[v] : null;
                const r = Math.min(0.95, (rock + crest * (1 - rock)) * (snowy ? K.rockUnderSnow : 1));
                if (snowy && !snowDone) { for (let c = 0; c < 3; c++) { flowS[c] = Math.exp(-0.5 * fo * lnF[c]); toneS[c] = Math.exp(tone / 3 * lnTone[c]); } snowDone = true; }
                for (let c = 0; c < 3; c++) {
                    // (the flow texture half as strong on snow, the mountains' tone a third)
                    let L = LUT[S[o + c]] * (snowy ? mul[c] * flowS[c] : mul[c]);
                    // (the riverside over the flow texture: its green not darkened by it)
                    if (g > 0) L += (LUT[RV[o + c]] * mulR[c] - L) * g;
                    L *= dShade * (snowy ? toneS[c] : toneE[c]);
                    L += (rk[c] * dShade - L) * r;
                    S[o + c] = toSrgb(L);
                }
            }
        }
    }
}

/** The mean and standard deviation of `v` over the land around each pixel (two box passes, each radius `km`; rows by
 *  their own width), in one go. */
function boxStats(v, land, w, h, pxKm, km) {
    const s1 = new Float64Array(w * h), s2 = new Float64Array(w * h), n = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) if (land[i]) { const x = Math.max(0, v[i]); s1[i] = x; s2[i] = x * x; n[i] = 1; }
    const ry = Math.max(1, Math.round(km / pxKm)), L = Math.max(w, h), t1 = new Float64Array(L), t2 = new Float64Array(L), tn = new Float64Array(L);
    const R = ry + 1, r1 = new Float64Array(R * w), r2 = new Float64Array(R * w), rn = new Float64Array(R * w), A = new Float64Array(w), B = new Float64Array(w), C = new Float64Array(w);
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) {
            const cl = Math.max(0.05, Math.cos((0.5 - (y + 0.5) / h) * Math.PI)), r = Math.min(w >> 2, Math.max(1, Math.round(km / (pxKm * cl)))), o = y * w;
            let a = 0, b = 0, c = 0;
            for (let d = -r; d <= r; d++) { const j = o + (d < 0 ? d + w : d); a += s1[j]; b += s2[j]; c += n[j]; }
            for (let x = 0; x < w; x++) {
                t1[x] = a; t2[x] = b; tn[x] = c;
                let out = x - r; if (out < 0) out += w;
                let inn = x + r + 1; if (inn >= w) inn -= w;
                a += s1[o + inn] - s1[o + out]; b += s2[o + inn] - s2[o + out]; c += n[o + inn] - n[o + out];
            }
            for (let x = 0; x < w; x++) { s1[o + x] = t1[x]; s2[o + x] = t2[x]; n[o + x] = tn[x]; }
        }
        // (the columns' running sums side by side, a row at a time — memory in order — each row's values as they were kept
        // in a ring until the window leaves them: the same sums, in the same order, as column by column)
        A.fill(0); B.fill(0); C.fill(0);
        for (let d = 0; d <= ry && d < h; d++) { const o = d * w; for (let x = 0; x < w; x++) { A[x] += s1[o + x]; B[x] += s2[o + x]; C[x] += n[o + x]; } }
        for (let y = 0; y < h; y++) {
            const o = y * w, add = y + ry + 1, drop = y - ry, ra = add * w, rd = (drop % R) * w, rs = (y % R) * w;
            for (let x = 0; x < w; x++) {
                const a = A[x], b = B[x], c = C[x];
                if (add < h) { A[x] += s1[ra + x]; B[x] += s2[ra + x]; C[x] += n[ra + x]; }
                if (drop >= 0) { A[x] -= r1[rd + x]; B[x] -= r2[rd + x]; C[x] -= rn[rd + x]; }
                r1[rs + x] = s1[o + x]; r2[rs + x] = s2[o + x]; rn[rs + x] = n[o + x];
                s1[o + x] = a; s2[o + x] = b; n[o + x] = c;
            }
        }
    }
    const mean = new Float32Array(w * h), std = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (n[i] > 0) { const m = s1[i] / n[i]; mean[i] = m; std[i] = Math.sqrt(Math.max(0, s2[i] / n[i] - m * m)); }
    return { mean, std };
}

/**
 * The rivers' ribbons on the climate's picture (cw × ch, pxKm at the equator), as segments for riparian (S3): each river
 * (finish-hydro.js rivers: reaches of points with discharge q) carrying K.ripMinM3s or more, smoothed (Chaikin, twice),
 * its original course (fainter) and a meandering copy; a ribbon K.ripWidthKm × √(q / 1000) wide (within
 * K.ripWidthMaxKm), wider on low ground (K.ripLowKm: floodplains, deltas). Six numbers a segment: ax, ay, bx, by (pixels),
 * width (km), weight.
 */
function riverSegments(R, hC, land, cw, ch, pxKm, K, noise, dryAt) {
    const out = [];
    // (a point displaced by the meander noise: up to about K.ripWarpKm, in waves K.ripWarpWaveKm long — pixels)
    const wf = 6371 / K.ripWarpWaveKm;
    const warp = p => {
        if (!noise) return p;
        const lat = (0.5 - (p[1] + 0.5) / ch) * Math.PI, lon = ((p[0] + 0.5) / cw - 0.5) * 2 * Math.PI, cl = Math.max(0.05, Math.cos(lat));
        const x = wf * cl * Math.cos(lon), y = wf * cl * Math.sin(lon), z = wf * Math.sin(lat);
        const de = K.ripWarpKm * noise.fbm(x + 13.1, y - 5.2, z + 2.4, 2, 0.5) / 0.3, dn = K.ripWarpKm * noise.fbm(x - 6.9, y + 11.7, z - 4.8, 2, 0.5) / 0.3;
        return [p[0] + de / (pxKm * cl), p[1] - dn / pxKm, p[2]];
    };
    const starts = [...R.start, R.lat.length];
    for (let r = 0; r < starts.length - 1; r++) {
        // (a reach as runs carrying enough water, split at the map's edge; smoothed)
        const runs = [[]];
        for (let i = starts[r]; i < starts[r + 1]; i++) {
            if (!(R.q[i] >= K.ripMinM3s)) { if (runs[runs.length - 1].length) runs.push([]); continue; }
            const p = [(R.lon[i] + 180) / 360 * cw - 0.5, (90 - R.lat[i]) / 180 * ch - 0.5, R.q[i]], cur = runs[runs.length - 1];
            if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > cw / 2) runs.push([]);
            runs[runs.length - 1].push(p);
        }
        for (let pts of runs) {
            if (pts.length < 2) continue;
            for (let it = 0; it < 2; it++) {
                const nx = [pts[0]];
                for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; nx.push(a.map((v, k) => 0.75 * v + 0.25 * b[k]), a.map((v, k) => 0.25 * v + 0.75 * b[k])); }
                nx.push(pts[pts.length - 1]); pts = nx;
            }
            const wavy = pts.map(warp);
            for (const [line, weight] of [[pts, K.ripOriginal], [wavy, 1]]) for (let i = 0; i < line.length - 1; i++) {
                const a = line[i], b = line[i + 1], q = 0.5 * (a[2] + b[2]);
                if (Math.abs(a[0] - b[0]) > cw / 2) continue;
                const mx = ((Math.round(0.5 * (a[0] + b[0])) % cw) + cw) % cw, my = Math.max(0, Math.min(ch - 1, Math.round(0.5 * (a[1] + b[1]))));
                if (dryAt && land[my * cw + mx] && dryAt(my * cw + mx) < 0.02) continue;
                const low = 1 + K.ripWiden * smooth(K.ripLowKm[0], K.ripLowKm[1], hC[my * cw + mx]);
                const strength = 0.33 + 0.67 * smooth(Math.log(K.ripStrengthM3s[0]), Math.log(K.ripStrengthM3s[1]), Math.log(q));
                out.push(a[0], a[1], b[0], b[1], Math.min(K.ripWidthMaxKm, Math.max(K.ripWidthMinKm, K.ripWidthKm * Math.sqrt(q / 1000))) * low, weight * strength);
            }
        }
    }
    return Float64Array.from(out);
}

/**
 * How much of each pixel of rows yLo…yHi−1 is riverside (S3), from the band's first row: the rivers' segments
 * (riverSegments) stamped as ribbons, their edge soft over a pixel — a ribbon narrower than a pixel stamped fainter; and
 * a fringe K.ripLakeKm wide around the lakes (lakePx). The most of what covers a pixel.
 */
function riparian(segs, lakePx, land, cw, ch, pxKm, K, yLo, yHi) {
    const out = new Float32Array((yHi - yLo) * cw), off = yLo * cw;
    const stamp = (ax, ay, bx, by, widthKm, weight) => {
        // (pixels: x east, y south; distances in km — east-west shrunk by the latitude; a bell: all at the middle, none
        // K.ripSpread half-widths out)
        const yMid = 0.5 * (ay + by), cl = Math.max(0.05, Math.cos((0.5 - (yMid + 0.5) / ch) * Math.PI)), kx = pxKm * cl, ky = pxKm;
        const hw = 0.5 * widthKm, reach = K.ripSpread * hw + 0.75 * pxKm, cover = weight * Math.min(1, (widthKm + 0.3 * pxKm) / pxKm);
        const y0 = Math.max(yLo, Math.floor(Math.min(ay, by) - reach / ky)), y1 = Math.min(yHi - 1, ch - 1, Math.ceil(Math.max(ay, by) + reach / ky));
        if (y1 < y0) return;
        const x0 = Math.floor(Math.min(ax, bx) - reach / kx), x1 = Math.ceil(Math.max(ax, bx) + reach / kx);
        const dx = (bx - ax) * kx, dy = (by - ay) * ky, L2 = dx * dx + dy * dy;
        for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
            const x = ((xx % cw) + cw) % cw, i = y * cw + x;
            if (!land[i]) continue;
            const px = (xx + 0.5 - ax) * kx, py = (y + 0.5 - ay) * ky, t = L2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / L2)) : 0;
            const d = Math.hypot(px - t * dx, py - t * dy), v = cover * smooth(reach, 0, d);
            if (v > out[i - off]) out[i - off] = v;
        }
    };
    if (segs) for (let s = 0; s < segs.length; s += 6) stamp(segs[s], segs[s + 1], segs[s + 2], segs[s + 3], segs[s + 4], segs[s + 5]);
    // (the lakes' fringes: land pixels within K.ripLakeKm of a lake's)
    if (lakePx) {
        const r = Math.max(1, Math.round(K.ripLakeKm / pxKm));
        for (let y = Math.max(0, yLo - r); y < Math.min(ch, yHi + r); y++) for (let x = 0; x < cw; x++) {
            if (!lakePx[y * cw + x]) continue;
            for (let dy = -r; dy <= r; dy++) {
                const yy = y + dy;
                if (yy < yLo || yy >= yHi) continue;
                for (let dx = -r; dx <= r; dx++) {
                    const i = yy * cw + ((x + dx) % cw + cw) % cw;
                    if (!land[i] || lakePx[i]) continue;
                    const v = 0.7 * (1 - Math.hypot(dx, dy) / (r + 1));
                    if (v > out[i - off]) out[i - off] = v;
                }
            }
        }
    }
    return out;
}
