// (fork addition) The region pick's valleys over the picture (js/region-overlay.js, GlobeView.setRegionCells):
// uRegionId the valley + 1 under each texel (RGB, the first row the south), uRegionState a byte per valley (chosen),
// uRegionHover the one under the pointer; uRegionSize: the grid's width and height, the bytes' width and rows. Away from
// the edge rivers a valley's outline is where its cubic B-spline weight over the 4 × 4 land texels round the place passes
// the others' — a smooth curve at any zoom: the four texels' bilinear shares drew each texel's straight sides and square
// corners, a valley's edge a staircase of boxes (owner, 2026-11-18: "weird rectangular shapes"). (No line is within the
// 4 × 4: a texel 3.5 px from one is flagged, and the texel nearest the place is not.) Along an edge river it is the river's drawn line itself
// (js/region-lines.js): each texel near one keeps its nearest piece of it (uRegionGeo: the ends from the texel's centre,
// in 1/32 px; uRegionLine R: 1 a line), and only the texels a place reaches without crossing one of the lines round it
// count (js/region-lines.js readAt does the same for the pick). The coast is the one drawn: the zoomed tiles' (patchSea,
// globe-view.js) where they are, else the picture's sea share of the four ≥ ½, as the map is painted (finish-view.js
// rasterAt); land drawn past the grid's takes the nearest land texel's valley. A valley's rim: 1.5 px from another valley.
export const REGION_GLSL = `uniform sampler2D uRegionId, uRegionState, uRegionGeo, uRegionLine; uniform vec4 uRegionSize; uniform float uRegionHover, uRegionOn;
vec4 regionBytes(sampler2D t, vec2 i) {
    i.x = mod(i.x, uRegionSize.x);
    return floor(textureLod(t, (i + 0.5) / uRegionSize.xy, 0.0) * 255.0 + 0.5);   // (level 0: no mips, and read in loops)
}
float regionTexel(vec2 i) {
    i.y = clamp(i.y, 0.0, uRegionSize.y - 1.0);
    vec4 k = regionBytes(uRegionId, i);
    return k.r + 256.0 * k.g + 65536.0 * k.b;
}
float regionSide(vec2 o, vec2 a, vec2 b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
bool regionCut(vec2 p, vec2 q, vec4 s) {                              // (the step p → q crosses the segment s)
    return regionSide(s.xy, s.zw, p) * regionSide(s.xy, s.zw, q) < 0.0 && regionSide(p, q, s.xy) * regionSide(p, q, s.zw) < 0.0;
}
float regionMost(float a, float b, float c, float d, vec4 w) {          // (the id with the most weight; w 0: not counted)
    float sa = w.x > 0.0 ? w.x + (b == a ? w.y : 0.0) + (c == a ? w.z : 0.0) + (d == a ? w.w : 0.0) : -1.0;
    float sb = w.y > 0.0 ? w.y + (a == b ? w.x : 0.0) + (c == b ? w.z : 0.0) + (d == b ? w.w : 0.0) : -1.0;
    float sc = w.z > 0.0 ? w.z + (a == c ? w.x : 0.0) + (b == c ? w.y : 0.0) + (d == c ? w.w : 0.0) : -1.0;
    float sd = w.w > 0.0 ? w.w + (a == d ? w.x : 0.0) + (b == d ? w.y : 0.0) + (c == d ? w.z : 0.0) : -1.0;
    float id = a, s = sa;
    if (sb > s) { id = b; s = sb; }
    if (sc > s) { id = c; s = sc; }
    if (sd > s) id = d;
    return id;
}
vec4 regionSpline(float t) {                                          // (the cubic B-spline's weights of the 4 texels along an axis)
    float s = 1.0 - t;
    return vec4(s * s * s, 3.0 * t * t * t - 6.0 * t * t + 4.0, 3.0 * s * s * s - 6.0 * s * s + 4.0, t * t * t) / 6.0;
}
float regionSmooth(vec2 i, vec2 f) {                                  // (the land valley with the most spline weight of the 4 × 4)
    vec4 wx = regionSpline(f.x), wy = regionSpline(f.y);
    float id[16], wt[16];
    for (int k = 0; k < 16; k++) {
        int kx = k - 4 * (k / 4), ky = k / 4;
        id[k] = regionTexel(i + vec2(float(kx - 1), float(ky - 1)));
        wt[k] = id[k] > 0.5 ? wx[kx] * wy[ky] : 0.0;
    }
    float best = 0.0, top = -1.0;
    for (int a = 0; a < 16; a++) {
        if (wt[a] <= 0.0) continue;
        float s = 0.0;
        for (int b = 0; b < 16; b++) if (id[b] == id[a]) s += wt[b];
        if (s > top) { top = s; best = id[a]; }
    }
    return best;
}
float regionAt(vec2 tc) {
    vec2 p = vec2(fract(tc.x), tc.y) * uRegionSize.xy - 0.5, i = floor(p), f = p - i;
    float a = regionTexel(i), b = regionTexel(i + vec2(1.0, 0.0)), c = regionTexel(i + vec2(0.0, 1.0)), d = regionTexel(i + vec2(1.0, 1.0));
    vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) + 1e-9;
    vec4 land = vec4(a > 0.5 ? 1.0 : 0.0, b > 0.5 ? 1.0 : 0.0, c > 0.5 ? 1.0 : 0.0, d > 0.5 ? 1.0 : 0.0);
    vec2 ps = patchSea(tc);                                           // (the sea where the map draws it: the tiles' coast where
    if (mix(dot(w, 1.0 - land), ps.x, ps.y) >= 0.5) return -1.0;      // they are, else the picture's sea share ≥ ½ as it is painted)
    vec2 n = floor(p + 0.5);
    bool lines = n.y >= 0.0 && n.y < uRegionSize.y && regionBytes(uRegionLine, n).r > 0.5;
    if (!lines && dot(land, land) > 0.0) return regionSmooth(i, f) - 1.0;
    vec4 S[9];                                                        // (the lines the 3 × 3 texels round the place keep)
    for (int k = 0; k < 9; k++) {
        vec2 t = n + vec2(float(k - 3 * (k / 3) - 1), float(k / 3 - 1));
        vec4 g = regionBytes(uRegionGeo, t);
        bool on = lines && t.y >= 0.0 && t.y < uRegionSize.y && regionBytes(uRegionLine, t).r > 0.5;
        S[k] = on ? t.xyxy + g / 32.0 - 4.0 : vec4(-1e4);
    }
    vec2 q0 = i, q1 = i + vec2(1.0, 0.0), q2 = i + vec2(0.0, 1.0), q3 = i + vec2(1.0, 1.0);
    vec4 ok = land;
    for (int k = 0; k < 9; k++) {
        if (regionCut(p, q0, S[k])) ok.x = 0.0;
        if (regionCut(p, q1, S[k])) ok.y = 0.0;
        if (regionCut(p, q2, S[k])) ok.z = 0.0;
        if (regionCut(p, q3, S[k])) ok.w = 0.0;
    }
    if (dot(ok, ok) > 0.0) return regionMost(a, b, c, d, ok * w) - 1.0;
    float near = 1e9, u = 0.0;                                        // (none of the four on its side, or land the tiles draw past
                                                                      // the grid's coast, up to ~2 texels: the nearest land of the 7 × 7)
    for (int m = 0; m < 49; m++) {
        vec2 t = n + vec2(float(m - 7 * (m / 7) - 3), float(m / 7 - 3));
        float v = regionTexel(t), e = dot(t - p, t - p);
        bool clear = v > 0.5 && e < near;
        for (int k = 0; k < 9; k++) if (regionCut(p, t, S[k])) clear = false;
        if (clear) { near = e; u = v; }
    }
    return u - 1.0;
}
bool regionChosenAt(float u) {
    if (u < 0.0) return false;
    vec2 i = vec2(mod(u, uRegionSize.z), floor(u / uRegionSize.z));
    return texture2D(uRegionState, (i + 0.5) / uRegionSize.zw).r > 0.5;
}
vec3 withRegion(vec3 base, vec2 tc, vec2 gx, vec2 gy) {
    if (uRegionOn < 0.5) return base;
    float u = regionAt(tc);
    bool hov = u >= 0.0 && u == uRegionHover, cho = regionChosenAt(u);
    if (!hov && !cho) return base;
    bool rim = regionAt(tc + 1.5 * gx) != u || regionAt(tc - 1.5 * gx) != u || regionAt(tc + 1.5 * gy) != u || regionAt(tc - 1.5 * gy) != u;
    vec3 c = base;                                                    // (linear light: the old sRGB tints' values)
    if (cho) { c = mix(c, vec3(0.83, 0.045, 0.64), 0.38); if (rim) c = mix(c, vec3(0.19, 0.003, 0.155), 0.9); }
    if (hov) { c = mix(c, vec3(1.0), 0.22); if (rim) c = mix(c, vec3(1.0), 0.9); }
    return c;
}`;

/** The uniforms REGION_GLSL reads, before any valleys are sent. */
export function regionUniforms(THREE) {
    return { uRegionId: { value: null }, uRegionState: { value: null }, uRegionGeo: { value: null }, uRegionLine: { value: null },
        uRegionSize: { value: new THREE.Vector4(1, 1, 1, 1) }, uRegionHover: { value: -2 }, uRegionOn: { value: 0 } };
}

/** A byte texture of W × H texels, read texel by texel (or null for no data). */
export function regionTexture(THREE, data, W, H) {
    return data ? Object.assign(new THREE.DataTexture(data, W, H), { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, needsUpdate: true }) : null;
}
