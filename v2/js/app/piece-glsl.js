// (fork addition) Generate's plate edits over the picture (js/piece-overlay.js, GlobeView.setPieceGrid): the piece
// under the pointer while editing lightened, each piece whose edit waits for Rebuild tinted by what it will become.
// uPieceId: the piece + 1 under each texel of a 2048 × 1024 grid (RG, the first row the south; B the paint layer's
// character there, js/terrain-brush.js — 0 none, + 128 while it waits for Apply — tinted by uPaintCols, linear, the
// applied paint only while uPaintOn); uPieceState: a texel per
// piece, RGB its tint (sRGB), A its share (0: no edit pending); uPieceHover: the piece under the pointer (−2: none);
// uPieceSize: the grid's width and height, the states' width and rows. Drawn by the shader, so a hover is one number
// and a Ctrl-click a few hundred bytes: painted into the picture, each hover redrew it, sent it to the GPU again and
// painted every zoomed tile in view again, one batch a frame — the tint crept over the plate (owner, 2026-11-20:
// "painfully slow"). No loops: the four texels round the place, their shares bilinear, the edge where a piece's
// share passes ½ — smooth at any zoom, a screen pixel soft.
export const PIECE_GLSL = `uniform sampler2D uPieceId, uPieceState; uniform vec4 uPieceSize; uniform float uPieceHover, uPieceOn, uPaintOn; uniform vec3 uPaintCols[16];
vec2 pieceTexel(vec2 i) {
    i.x = mod(i.x, uPieceSize.x); i.y = clamp(i.y, 0.0, uPieceSize.y - 1.0);
    vec4 k = floor(textureLod(uPieceId, (i + 0.5) / uPieceSize.xy, 0.0) * 255.0 + 0.5);
    return vec2(k.r + 256.0 * k.g - 1.0, k.b);
}
vec4 pieceState(float id) {
    vec2 i = vec2(mod(id, uPieceSize.z), floor(id / uPieceSize.z));
    return textureLod(uPieceState, (i + 0.5) / uPieceSize.zw, 0.0);
}
// (a texel's paint: its colour and how strongly it shows — waiting paint more than applied, the applied only while shown)
vec4 paintOf(float b) {
    float waiting = step(127.5, b), c = b - 128.0 * waiting;
    if (c < 0.5) return vec4(0.0);
    return vec4(uPaintCols[int(c + 0.5)], waiting > 0.5 ? 0.5 : 0.38 * uPaintOn);
}
float pieceEdge(float share) { return clamp((share - 0.5) / max(fwidth(share), 1e-4) + 0.5, 0.0, 1.0); }
vec3 withPieces(vec3 base, vec2 tc) {
    if (uPieceOn < 0.5) return base;
    vec2 p = vec2(fract(tc.x), tc.y) * uPieceSize.xy - 0.5, i = floor(p), f = p - i;
    vec2 A = pieceTexel(i), B = pieceTexel(i + vec2(1.0, 0.0)), C = pieceTexel(i + vec2(0.0, 1.0)), D = pieceTexel(i + vec2(1.0, 1.0));
    float a = A.x, b = B.x, c = C.x, d = D.x;
    vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
    vec4 sa = pieceState(a), sb = pieceState(b), sc = pieceState(c), sd = pieceState(d);
    vec4 on = w * step(0.002, vec4(sa.a, sb.a, sc.a, sd.a));
    float cov = on.x + on.y + on.z + on.w, k = 1.0 / max(cov, 1e-6);
    vec3 tint = (on.x * sa.rgb + on.y * sb.rgb + on.z * sc.rgb + on.w * sd.rgb) * k;
    float share = dot(on, vec4(sa.a, sb.a, sc.a, sd.a)) * k;
    float hov = dot(w, vec4(a == uPieceHover ? 1.0 : 0.0, b == uPieceHover ? 1.0 : 0.0, c == uPieceHover ? 1.0 : 0.0, d == uPieceHover ? 1.0 : 0.0));
    vec3 col = mix(base, pow(tint, vec3(2.2)), share * pieceEdge(cov));   // (linear light: the tints are sRGB)
    vec4 pa = paintOf(A.y), pb = paintOf(B.y), pc = paintOf(C.y), pd = paintOf(D.y);
    vec4 pw = w * vec4(step(0.001, pa.a), step(0.001, pb.a), step(0.001, pc.a), step(0.001, pd.a));
    float pcov = pw.x + pw.y + pw.z + pw.w, pk = 1.0 / max(pcov, 1e-6);
    vec3 pcol = (pw.x * pa.rgb + pw.y * pb.rgb + pw.z * pc.rgb + pw.w * pd.rgb) * pk;
    col = mix(col, pcol, dot(pw, vec4(pa.a, pb.a, pc.a, pd.a)) * pk * pieceEdge(pcov));
    return mix(col, vec3(1.0), 0.22 * pieceEdge(hov));
}`;

/** The uniforms PIECE_GLSL reads, before any grid is sent. */
export function pieceUniforms(THREE) {
    return { uPieceId: { value: null }, uPieceState: { value: null }, uPieceSize: { value: new THREE.Vector4(1, 1, 1, 1) }, uPieceHover: { value: -2 }, uPieceOn: { value: 0 }, uPaintOn: { value: 1 }, uPaintCols: { value: Array.from({ length: 16 }, () => new THREE.Color(1, 0.6, 0.2)) } };
}
