// Planet code encode/decode — packs seed + slider values into a compact base36 string.
// Pure functions, no DOM access.

// Slider quantization tables
const SLIDERS = [
    { min: 5000,  step: 1000, count: 2556 }, // Detail (N)
    { min: 0,     step: 0.05, count: 21  }, // Irregularity (jitter)
    { min: 4,     step: 1,    count: 117 }, // Plates (P)
    { min: 1,     step: 1,    count: 10  }, // Continents
    { min: 0,     step: 0.01, count: 51  }, // Roughness
    { min: 0,     step: 0.05, count: 21  }, // Smoothing
    { min: 0,     step: 0.05, count: 21  }, // Glacial Erosion
    { min: 0,     step: 0.05, count: 21  }, // Hydraulic Erosion
    { min: 0,     step: 0.05, count: 21  }, // Thermal Erosion
    { min: 0,     step: 0.05, count: 21  }, // Ridge Sharpening
    { min: 0,     step: 0.05, count: 21  }, // Soil Creep
    { min: 0,     step: 0.05, count: 21  }, // Terrain Warp
    { min: 0,     step: 0.05, count: 21  }, // 12: Continent Size Variety
    { min: -30,   step: 2,    count: 31  }, // 13: Temperature (a forcing in W/m²; before 2026-10 −15…15 °C — same positions)
    { min: -1,    step: 0.1,  count: 21  }, // 14: Precipitation
    { min: 0,     step: 0.01, count: 101 }, // 15: Land Coverage
    { min: -1,    step: 0.1,  count: 21  }, // 16: Lakes (2026-11; only in LAKES_LEN and PONDS_LEN codes)
    { min: -1,    step: 0.1,  count: 21  }, // 17: Small lakes (2026-11; only in PONDS_LEN codes)
];

// Mixed-radix bases (right-to-left): lcIdx, prcIdx, tmpIdx, csvIdx, twIdx, scIdx, rsIdx, teIdx, heIdx, glIdx, smIdx, nsIdx, cnIdx, pIdx, jIdx, nIdx, seed
const RADICES = [101, 21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];
// Seeds 0 … 2,147,483,645: js/rng.js starts in a state of its own for each (plans/SEED_RANGE_PLAN.md; before 2026-10,
// 0 … 2^24 − 1). The seed is the code's top digit, so the codes of those seeds are as they were, and a seed this large
// still fits in BASE_LEN characters.
export const SEED_MAX = 2147483646;
const PONDS_LEN = 24; // a code with Small lakes set (its lowest digit, Lakes the next; ±0 keeps the shorter codes)
const LAKES_LEN = 23; // a code with Lakes set (its lowest digit; Lakes ±0 keeps the 22-char code, so codes stay as they were)
const BASE_LEN = 22; // base code length (no toggles)
const PREV5_LEN = 21; // previous 21-char codes (before land coverage)
const PREV4_LEN = 18; // previous 18-char codes (before continent variety/temp/precip)
const PREV3_LEN = 17; // previous 17-char codes (before terrain warp)
const PREV2_LEN = 16; // previous 16-char codes (before glacial erosion)
const PREV_LEN = 14; // previous 14-char codes (before ridge/creep)
const LEGACY_LEN = 13; // legacy 13-char codes (single erosion slider)
const IDX_CHARS = 2; // base36 chars per plate index (max index 119 = "3b")

// Legacy radices for decoding old 13-char codes (single erosion slider)
const LEGACY_RADICES = [21, 21, 51, 10, 117, 21, 2559];

// Previous-gen radices for decoding 14-char codes (two erosion sliders, no ridge/creep)
const PREV_RADICES = [21, 21, 21, 51, 10, 117, 21, 2559];

// Previous2-gen radices for decoding 16-char codes (no glacial erosion)
const PREV2_RADICES = [21, 21, 21, 21, 21, 51, 10, 117, 21, 2559];

// Previous3-gen radices for decoding 17-char codes (no terrain warp)
const PREV3_RADICES = [21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2559];

// Previous5-gen radices for decoding 21-char codes (before land coverage)
const PREV5_RADICES = [21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];

// Previous4-gen radices for decoding 18-char codes (before continent variety/temp/precip)
const PREV4_RADICES = [21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];

function toIndex(value, slider) {
    return Math.round((value - slider.min) / slider.step);
}

function fromIndex(idx, slider) {
    // Round to step precision to avoid floating-point drift
    const raw = slider.min + idx * slider.step;
    const decimals = slider.step < 1 ? String(slider.step).split('.')[1].length : 0;
    return decimals > 0 ? parseFloat(raw.toFixed(decimals)) : raw;
}

/** Parse a base36 string into a BigInt (char-by-char for full precision). */
function parseBase36(str) {
    return [...str].reduce((acc, ch) => {
        const d = parseInt(ch, 36);
        if (isNaN(d)) throw new Error('bad char');
        return acc * 36n + BigInt(d);
    }, 0n);
}

// Decode format configs: one entry per code length.
// fields: [fieldName, SLIDERS_index] in LSB-first extraction order.
// defaults: field values not encoded in this format.
const DECODE_FORMATS = {
    [LEGACY_LEN]: {
        radices: LEGACY_RADICES,
        fields: [
            ['hydraulicErosion', 7], ['smoothing', 5], ['roughness', 4],
            ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, glacialErosion: 0, thermalErosion: 0.1,
                    ridgeSharpening: 0.35, soilCreep: 0.05, continentSizeVariety: 0,
                    greenhouse: 0, precipitationOffset: 0, landCoverage: 0.3 }
    },
    [PREV_LEN]: {
        radices: PREV_RADICES,
        fields: [
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['smoothing', 5], ['roughness', 4],
            ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, glacialErosion: 0, ridgeSharpening: 0.35,
                    soilCreep: 0.05, continentSizeVariety: 0,
                    greenhouse: 0, precipitationOffset: 0, landCoverage: 0.3 }
    },
    [PREV2_LEN]: {
        radices: PREV2_RADICES,
        fields: [
            ['soilCreep', 10], ['ridgeSharpening', 9], ['thermalErosion', 8], ['hydraulicErosion', 7],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, glacialErosion: 0, continentSizeVariety: 0,
                    greenhouse: 0, precipitationOffset: 0, landCoverage: 0.3 }
    },
    [PREV3_LEN]: {
        radices: PREV3_RADICES,
        fields: [
            ['soilCreep', 10], ['ridgeSharpening', 9], ['thermalErosion', 8], ['hydraulicErosion', 7],
            ['glacialErosion', 6], ['smoothing', 5], ['roughness', 4],
            ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, continentSizeVariety: 0,
                    greenhouse: 0, precipitationOffset: 0, landCoverage: 0.3 }
    },
    [PREV4_LEN]: {
        radices: PREV4_RADICES,
        fields: [
            ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { continentSizeVariety: 0, greenhouse: 0, precipitationOffset: 0, landCoverage: 0.3 }
    },
    [PREV5_LEN]: {
        radices: PREV5_RADICES,
        fields: [
            ['precipitationOffset', 14], ['greenhouse', 13], ['continentSizeVariety', 12],
            ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { landCoverage: 0.3 }
    },
    [PONDS_LEN]: {
        radices: [21, 21, ...RADICES],
        fields: [['ponds', 17], ['lakes', 16], ['landCoverage', 15], ['precipitationOffset', 14], ['greenhouse', 13],
            ['continentSizeVariety', 12], ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0]],
        defaults: {}
    },
    [LAKES_LEN]: {
        radices: [21, ...RADICES],
        fields: [['lakes', 16], ['landCoverage', 15], ['precipitationOffset', 14], ['greenhouse', 13],
            ['continentSizeVariety', 12], ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0]],
        defaults: {}
    },
    [BASE_LEN]: {
        radices: RADICES,
        fields: [
            ['landCoverage', 15], ['precipitationOffset', 14], ['greenhouse', 13],
            ['continentSizeVariety', 12], ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: {}
    },
};

/** Generic mixed-radix decode: extract fields LSB-first, validate, convert, apply defaults. */
function decodeFormat(packed, config, toggleStr) {
    const { radices, fields, defaults } = config;
    const result = {};
    for (let i = 0; i < radices.length; i++) {
        const [name, si] = fields[i];
        const idx = Number(packed % BigInt(radices[i]));
        packed = packed / BigInt(radices[i]);
        if (idx >= SLIDERS[si].count) return null;
        result[name] = fromIndex(idx, SLIDERS[si]);
    }
    result.seed = Number(packed);
    if (result.seed < 0 || result.seed >= SEED_MAX) return null;
    Object.assign(result, defaults);
    result.lakes ??= 0;                                  // (before LAKES_LEN codes: the finish as tuned)
    result.ponds ??= 0;                                  // (before PONDS_LEN codes: likewise)

    const toggledIndices = [];
    if (toggleStr) {
        for (let i = 0; i < toggleStr.length; i += IDX_CHARS) {
            const idx = parseInt(toggleStr.slice(i, i + IDX_CHARS), 36);
            if (isNaN(idx) || idx >= result.P) return null;
            toggledIndices.push(idx);
        }
    }
    result.toggledIndices = toggledIndices;
    return result;
}

/**
 * Encode planet parameters into a base36 planet code.
 * @param {number} seed - Integer seed 0–2147483645
 * @param {number} N - Detail (5000–2560000, step 1000; above, in 1000s after a ".")
 * @param {number} jitter - Irregularity (0–1, step 0.05)
 * @param {number} P - Plates (4–120, step 1)
 * @param {number} numContinents - Continents (1–10, step 1)
 * @param {number} roughness - Roughness (0–0.5, step 0.01)
 * @param {number} terrainWarp - Terrain Warp (0–1, step 0.05)
 * @param {number} smoothing - Smoothing (0–1, step 0.05)
 * @param {number} glacialErosion - Glacial Erosion (0–1, step 0.05)
 * @param {number} hydraulicErosion - Hydraulic Erosion (0–1, step 0.05)
 * @param {number} thermalErosion - Thermal Erosion (0–1, step 0.05)
 * @param {number} ridgeSharpening - Ridge Sharpening (0–1, step 0.05)
 * @param {number} soilCreep - Soil Creep (0–1, step 0.05)
 * @param {number} continentSizeVariety - Continent Size Variety (0–1, step 0.05)
 * @param {number} greenhouse - the Temperature slider: a forcing in W/m² (-30–30, step 2)
 * @param {number} precipitationOffset - Precipitation offset (-1–1, step 0.1)
 * @param {number} landCoverage - Land Coverage (0–1, step 0.05)
 * @param {number[]} [toggledIndices=[]] - Sorted array of toggled plate indices
 * @param {number} [lakes=0] - Lakes (-1–1, step 0.1); set, the code is 23 chars
 * @param {number} [ponds=0] - Small lakes (-1–1, step 0.1); set, the code is 24 chars
 * @param {{i: number, c: number, lv: number}[]} [shapes=[]] - the pieces' characters (js/piece-shapes.js): the piece's
 *   index, the character's index (0 none … 11), the level nudge in km (−1.5 … +1.5, step 0.1)
 * @param {{c: number, rKm: number, pts: number[][]}[]} [strokes=[]] - the paint layer (js/terrain-brush.js), in order
 * @returns {string} base36 code (22 chars without edits, 22 + '-' + 2*k with k edits, + '~' + 4*m with m characters,
 *   + '_' and the paint layer)
 */
export function encodePlanetCode(seed, N, jitter, P, numContinents, roughness, terrainWarp, smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, soilCreep, continentSizeVariety, greenhouse, precipitationOffset, landCoverage, toggledIndices = [], lakes = 0, ponds = 0, shapes = [], strokes = []) {
    // (a Detail above the field's top, 2.56M — docs/detail-stops.md: the field at its top, the Detail in 1000s after a ".")
    const nIdx  = Math.min(toIndex(N, SLIDERS[0]), SLIDERS[0].count - 1);
    const jIdx  = toIndex(jitter, SLIDERS[1]);
    const pIdx  = toIndex(P, SLIDERS[2]);
    const cnIdx = toIndex(numContinents, SLIDERS[3]);
    const nsIdx = toIndex(roughness, SLIDERS[4]);
    const smIdx = toIndex(smoothing, SLIDERS[5]);
    const glIdx = toIndex(glacialErosion, SLIDERS[6]);
    const heIdx = toIndex(hydraulicErosion, SLIDERS[7]);
    const teIdx = toIndex(thermalErosion, SLIDERS[8]);
    const rsIdx = toIndex(ridgeSharpening, SLIDERS[9]);
    const scIdx = toIndex(soilCreep, SLIDERS[10]);
    const twIdx = toIndex(terrainWarp, SLIDERS[11]);
    const csvIdx = toIndex(continentSizeVariety, SLIDERS[12]);
    const tmpIdx = toIndex(greenhouse, SLIDERS[13]);
    const prcIdx = toIndex(precipitationOffset, SLIDERS[14]);
    const lcIdx  = toIndex(landCoverage, SLIDERS[15]);

    // Mixed-radix packing (least-significant first: lcIdx, prcIdx, tmpIdx, csvIdx, twIdx, ...)
    let packed = BigInt(seed);
    packed = packed * BigInt(RADICES[15]) + BigInt(nIdx);    // * 2556
    packed = packed * BigInt(RADICES[14]) + BigInt(jIdx);    // * 21
    packed = packed * BigInt(RADICES[13]) + BigInt(pIdx);    // * 117
    packed = packed * BigInt(RADICES[12]) + BigInt(cnIdx);   // * 10
    packed = packed * BigInt(RADICES[11]) + BigInt(nsIdx);   // * 51
    packed = packed * BigInt(RADICES[10]) + BigInt(smIdx);   // * 21
    packed = packed * BigInt(RADICES[9])  + BigInt(glIdx);   // * 21
    packed = packed * BigInt(RADICES[8])  + BigInt(heIdx);   // * 21
    packed = packed * BigInt(RADICES[7])  + BigInt(teIdx);   // * 21
    packed = packed * BigInt(RADICES[6])  + BigInt(rsIdx);   // * 21
    packed = packed * BigInt(RADICES[5])  + BigInt(scIdx);   // * 21
    packed = packed * BigInt(RADICES[4])  + BigInt(twIdx);   // * 21
    packed = packed * BigInt(RADICES[3])  + BigInt(csvIdx);  // * 21
    packed = packed * BigInt(RADICES[2])  + BigInt(tmpIdx);  // * 31
    packed = packed * BigInt(RADICES[1])  + BigInt(prcIdx);  // * 21
    packed = packed * BigInt(RADICES[0])  + BigInt(lcIdx);   // * 21

    const lkIdx = toIndex(lakes, SLIDERS[16]), pdIdx = toIndex(ponds, SLIDERS[17]);
    if (lkIdx !== 10 || pdIdx !== 10) packed = packed * 21n + BigInt(lkIdx);  // * 21 (Lakes ±0: index 10)
    if (pdIdx !== 10) packed = packed * 21n + BigInt(pdIdx);                  // * 21 (Small lakes ±0: index 10)
    let code = packed.toString(36).padStart(pdIdx !== 10 ? PONDS_LEN : lkIdx !== 10 ? LAKES_LEN : BASE_LEN, '0');
    if (N > fromIndex(SLIDERS[0].count - 1, SLIDERS[0])) code += '.' + Math.round(N / 1000).toString(36);

    // Append toggled plate indices: "-" + 2-char base36 per index
    if (toggledIndices.length > 0) {
        code += '-' + toggledIndices
            .map(i => i.toString(36).padStart(IDX_CHARS, '0'))
            .join('');
    }
    // the pieces' characters: "~" + per piece its index (2 base36), the character (1), the level + 1.5 in 0.1 km (1: 0…30)
    const shaped = shapes.filter(s => s.c || Math.round(s.lv * 10)).sort((a, b) => a.i - b.i);
    if (shaped.length > 0) {
        code += SHAPE_MARK + shaped
            .map(s => s.i.toString(36).padStart(IDX_CHARS, '0') + s.c.toString(36) + (Math.round(s.lv * 10) + LEVEL_OFFSET).toString(36))
            .join('');
    }
    if (strokes.length > 0) code += PAINT_MARK + encodePaint(strokes);

    return code;
}

// ── the paint layer (2026-11): "_", a version digit, then each stroke in the order painted ──
// A stroke: its character (1 base36: 0 the eraser … 11), its radius ((rKm − 20) / 10, 2 base36: 20 … 1500 km), how
// many points (a number), the first point's row and column on the paint grid (3 base36 each), then each next point as
// its step from the one before (two numbers: rows, then columns the short way round). A number: zigzag (0, −1, 1, −2 …
// as 0, 1, 2, 3 …), written in base 18 lowest digit first, each digit but the last lifted by 18 (so 0…h ends it, i…z goes
// on). Points sit on a grid of about 5 km (js/terrain-brush.js snaps them as they are painted), so a stroke laid from a
// link is the stroke as painted. A long stroke is a few hundred characters; Undo, the eraser or fewer, longer strokes
// keep the link short. A stroke kept to chosen pieces writes its character + 12 (c … n), then, after its points, how
// many pieces (a number) and their indices in the layout's list, smallest first, each as its step from the one before.
const PAINT_MARK = '_', PAINT_VERSION = '1';
/** The paint grid: rows from the south pole to the north (PAINT_LAT_N + 1 of them), columns round from 180° W. */
export const PAINT_LAT_N = 4000, PAINT_LON_N = 8000;
const SIZE_MIN = 20, SIZE_STEP = 10, SIZE_COUNT = 149;
const zig = (d) => (d >= 0 ? 2 * d : -2 * d - 1), unzig = (z) => (z % 2 ? -(z + 1) / 2 : z / 2);
function writeNum(d) {
    let z = zig(d), out = '';
    do { const k = z % 18; z = Math.floor(z / 18); out += (z ? k + 18 : k).toString(36); } while (z);
    return out;
}
function encodePaint(strokes) {
    let out = PAINT_VERSION;
    for (const st of strokes) {
        const size = Math.max(0, Math.min(SIZE_COUNT - 1, Math.round((st.rKm - SIZE_MIN) / SIZE_STEP)));
        const inside = st.in?.length ? [...new Set(st.in)].sort((a, b) => a - b) : null;
        out += (st.c + (inside ? CHARACTER_COUNT : 0)).toString(36) + size.toString(36).padStart(2, '0') + writeNum(st.pts.length);
        st.pts.forEach(([la, lo], k) => {
            if (!k) { out += la.toString(36).padStart(3, '0') + lo.toString(36).padStart(3, '0'); return; }
            const [pa, po] = st.pts[k - 1];
            let dl = lo - po;
            if (dl > PAINT_LON_N / 2) dl -= PAINT_LON_N; else if (dl < -PAINT_LON_N / 2) dl += PAINT_LON_N;
            out += writeNum(la - pa) + writeNum(dl);
        });
        if (inside) { out += writeNum(inside.length); inside.forEach((v, k) => { out += writeNum(v - (k ? inside[k - 1] : 0)); }); }
    }
    return out;
}
/** The paint section read: [{ c, rKm, pts, in? }], or null if it isn't one. */
function decodePaint(str) {
    if (!str) return [];
    if (str[0] !== PAINT_VERSION || !/^[0-9a-z]+$/.test(str)) return null;
    let i = 1;
    const fixed = (k) => { if (i + k > str.length) throw 0; const v = parseInt(str.slice(i, i + k), 36); i += k; return v; };
    const num = () => {
        let z = 0, mul = 1;
        for (;;) {
            if (i >= str.length) throw 0;
            const k = parseInt(str[i++], 36);
            z += (k % 18) * mul; mul *= 18;
            if (k < 18) return unzig(z);
            if (mul > 1e12) throw 0;
        }
    };
    const out = [];
    try {
        while (i < str.length) {
            const c0 = fixed(1), size = fixed(2), n = num(), kept = c0 >= CHARACTER_COUNT, c = c0 % CHARACTER_COUNT;
            if (c0 >= 2 * CHARACTER_COUNT || size >= SIZE_COUNT || n < 1 || n > 100000) return null;
            let la = fixed(3), lo = fixed(3);
            if (la > PAINT_LAT_N || lo >= PAINT_LON_N) return null;
            const pts = [[la, lo]];
            for (let k = 1; k < n; k++) {
                la += num(); lo = (((lo + num()) % PAINT_LON_N) + PAINT_LON_N) % PAINT_LON_N;
                if (la < 0 || la > PAINT_LAT_N) return null;
                pts.push([la, lo]);
            }
            const st = { c, rKm: SIZE_MIN + SIZE_STEP * size, pts };
            if (kept) {
                const m = num();
                if (m < 1 || m > 4096) return null;
                st.in = [];
                for (let k = 0, v = 0; k < m; k++) { v += num(); if (v < 0 || v > 65535) return null; st.in.push(v); }
            }
            out.push(st);
        }
    } catch { return null; }
    return out;
}
const SHAPE_MARK = '~', SHAPE_CHARS = IDX_CHARS + 2, CHARACTER_COUNT = 12, LEVEL_OFFSET = 15;
/** The characters' suffix read: [{ i, c, lv }], or null if it isn't one. */
function decodeShapes(str) {
    if (!/^[0-9a-z]*$/.test(str) || str.length % SHAPE_CHARS !== 0) return null;
    const out = [];
    for (let k = 0; k < str.length; k += SHAPE_CHARS) {
        const i = parseInt(str.slice(k, k + IDX_CHARS), 36), c = parseInt(str[k + IDX_CHARS], 36), l = parseInt(str[k + IDX_CHARS + 1], 36);
        if (c >= CHARACTER_COUNT || l > 2 * LEVEL_OFFSET) return null;      // (an index past the layout's pieces is passed over, as toggles are)
        out.push({ i, c, lv: (l - LEVEL_OFFSET) / 10 });
    }
    return out;
}

/**
 * Decode a base36 planet code back into planet parameters.
 * Supports 24-char (Small lakes set), 23-char (Lakes set), 22-char (current), 21-char (prev5), 18-char (prev4), 17-char (prev3), 16-char (prev2), 14-char (previous-gen), and 13-char (legacy) codes.
 * @param {string} code - base36 code (13, 14, 16, 17, 18, 21, or 22 chars, optionally followed by "-" + toggle indices)
 * @returns {{ seed: number, N: number, jitter: number, P: number, numContinents: number, roughness: number, terrainWarp: number, smoothing: number, glacialErosion: number, hydraulicErosion: number, thermalErosion: number, ridgeSharpening: number, soilCreep: number, continentSizeVariety: number, greenhouse: number, precipitationOffset: number, landCoverage: number, lakes: number, ponds: number, toggledIndices: number[] } | null}
 */
export function decodePlanetCode(code) {
    if (typeof code !== 'string') return null;
    code = code.trim().toLowerCase();
    // (the paint layer, last of all: after a "_")
    const paintIdx = code.indexOf(PAINT_MARK), paintStr = paintIdx === -1 ? '' : code.slice(paintIdx + 1);
    if (paintIdx !== -1) code = code.slice(0, paintIdx);
    // (the pieces' characters: after a "~")
    const tildeIdx = code.indexOf(SHAPE_MARK), shapeStr = tildeIdx === -1 ? '' : code.slice(tildeIdx + 1);
    if (tildeIdx !== -1) code = code.slice(0, tildeIdx);

    // Split base code from optional toggle suffix
    const dashIdx = code.indexOf('-');
    let base = dashIdx === -1 ? code : code.slice(0, dashIdx);
    const toggleStr = dashIdx === -1 ? '' : code.slice(dashIdx + 1);
    // (a Detail above 2.56M: after a ".", in 1000s)
    const dotIdx = base.indexOf('.'), fineN = dotIdx === -1 ? 0 : 1000 * parseInt(base.slice(dotIdx + 1), 36);
    if (dotIdx !== -1) { if (!/^[0-9a-z]+$/.test(base.slice(dotIdx + 1)) || !(fineN > 2560000)) return null; base = base.slice(0, dotIdx); }

    const config = DECODE_FORMATS[base.length];
    if (!config) return null;
    if (!/^[0-9a-z]+$/.test(base)) return null;
    if (toggleStr && !/^[0-9a-z]+$/.test(toggleStr)) return null;
    if (toggleStr && toggleStr.length % IDX_CHARS !== 0) return null;

    let packed;
    try {
        packed = parseBase36(base);
    } catch {
        return null;
    }

    const out = decodeFormat(packed, config, toggleStr);
    if (out && fineN) out.N = fineN;
    if (out) { out.shapes = decodeShapes(shapeStr); if (!out.shapes) return null; }
    if (out) { out.strokes = decodePaint(paintStr); if (!out.strokes) return null; }
    return out;
}
