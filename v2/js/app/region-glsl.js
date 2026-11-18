// (fork addition) The region pick's valleys over the picture (js/region-overlay.js, GlobeView.setRegionCells):
// uRegionId the valley + 1 under each texel (RGB, the first row the south), uRegionState a byte per valley (chosen),
// uRegionHover the one under the pointer; uRegionSize: the grid's width and height, the bytes' width and rows. Away from
// the edge rivers a valley's outline is where its share of the four texels round the place passes the others' — a
// smooth line at any zoom, not the texels' steps. Along an edge river it is the river's drawn line itself
// (js/region-lines.js): each texel near one keeps its nearest segment (uRegionGeo: the ends from the texel's centre, in
// 1/32 px) and the valley + 1 on its left (uRegionLeft RGB; A the flags: 1 a line, 2 and 4 its start and end a real end)
// and right (uRegionRight), and a place within 2 px of a line takes its side's valley (js/region-lines.js lineAt does
// the same for the pick). A valley's rim: the pixels 1.5 px from another valley.
export const REGION_GLSL = `uniform sampler2D uRegionId, uRegionState, uRegionGeo, uRegionLeft, uRegionRight; uniform vec4 uRegionSize; uniform float uRegionHover, uRegionOn;
vec4 regionBytes(sampler2D t, vec2 i) {
    i.x = mod(i.x, uRegionSize.x);
    return floor(texture2D(t, (i + 0.5) / uRegionSize.xy) * 255.0 + 0.5);
}
float regionTexel(vec2 i) {
    i.y = clamp(i.y, 0.0, uRegionSize.y - 1.0);
    vec4 k = regionBytes(uRegionId, i);
    return k.r + 256.0 * k.g + 65536.0 * k.b;
}
float regionLine(vec2 p) {
    vec2 c = floor(p);
    if (c.y < 0.0 || c.y >= uRegionSize.y || regionBytes(uRegionLeft, c).a < 0.5) return -2.0;
    float best = 1e9, id = -2.0;
    for (int dj = -1; dj <= 1; dj++) for (int di = -1; di <= 1; di++) {
        vec2 i = c + vec2(float(di), float(dj));
        if (i.y < 0.0 || i.y >= uRegionSize.y) continue;
        vec4 L = regionBytes(uRegionLeft, i);
        if (L.a < 0.5) continue;
        vec4 g = regionBytes(uRegionGeo, i) / 32.0 - 4.0;
        vec2 a = i + 0.5 + g.xy, ab = g.zw - g.xy;
        float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0), d = length(p - a - t * ab);
        if (d >= best) continue;
        best = d;
        if ((t <= 0.0 && mod(floor(L.a / 2.0), 2.0) > 0.5) || (t >= 1.0 && L.a >= 4.0)) { id = -2.0; continue; }
        vec4 k = ab.x * (p.y - a.y) - ab.y * (p.x - a.x) > 0.0 ? L : regionBytes(uRegionRight, i);
        id = k.r + 256.0 * k.g + 65536.0 * k.b - 1.0;
    }
    return best < 2.0 ? id : -2.0;
}
float regionAt(vec2 tc) {
    vec2 p = vec2(fract(tc.x), tc.y) * uRegionSize.xy - 0.5, i = floor(p), f = p - i;
    float a = regionTexel(i), b = regionTexel(i + vec2(1.0, 0.0)), c = regionTexel(i + vec2(0.0, 1.0)), d = regionTexel(i + vec2(1.0, 1.0));
    float wa = (1.0 - f.x) * (1.0 - f.y), wb = f.x * (1.0 - f.y), wc = (1.0 - f.x) * f.y, wd = f.x * f.y;
    float sa = wa + (b == a ? wb : 0.0) + (c == a ? wc : 0.0) + (d == a ? wd : 0.0);
    float sb = wb + (a == b ? wa : 0.0) + (c == b ? wc : 0.0) + (d == b ? wd : 0.0);
    float sc = wc + (a == c ? wa : 0.0) + (b == c ? wb : 0.0) + (d == c ? wd : 0.0);
    float sd = wd + (a == d ? wa : 0.0) + (b == d ? wb : 0.0) + (c == d ? wc : 0.0);
    float id = a, s = sa;
    if (sb > s) { id = b; s = sb; }
    if (sc > s) { id = c; s = sc; }
    if (sd > s) id = d;
    if (id < 0.5) return -1.0;                                        // (the sea: the map's coast)
    float l = regionLine(p + 0.5);
    return l >= 0.0 ? l : id - 1.0;
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
    return { uRegionId: { value: null }, uRegionState: { value: null }, uRegionGeo: { value: null }, uRegionLeft: { value: null }, uRegionRight: { value: null },
        uRegionSize: { value: new THREE.Vector4(1, 1, 1, 1) }, uRegionHover: { value: -2 }, uRegionOn: { value: 0 } };
}

/** A byte texture of W × H texels, read texel by texel (or null for no data). */
export function regionTexture(THREE, data, W, H) {
    return data ? Object.assign(new THREE.DataTexture(data, W, H), { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, needsUpdate: true }) : null;
}
