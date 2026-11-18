// The edit tools' marks over the planet (fork addition): the brush's ring at the pointer, the split's line as it is
// dragged. Drawn in an SVG over the globe or the map, each point of the sphere placed by GlobeView.screenAt.
const NS = 'http://www.w3.org/2000/svg', R_KM = 6371;

/** Texture place [u, v] of a unit point (z-up) — terrain-brush.js's pointAt the other way. */
export const uvOf = ([x, y, z]) => [(Math.atan2(y, x) + Math.PI) / (2 * Math.PI), (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, z)))) / Math.PI];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((c) => c / l); };
/** Points along the great circle about the pole `n` through `a` (unit, at right angles to n), from angle 0 to `to`. */
const arc = (n, a, to, steps) => {
    const e = unit(cross(n, a)), out = [];
    for (let i = 0; i <= steps; i++) { const t = to * i / steps, c = Math.cos(t), s = Math.sin(t); out.push([a[0] * c + e[0] * s, a[1] * c + e[1] * s, a[2] * c + e[2] * s]); }
    return out;
};

export function mountMarks(pv) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'terrain-marks');
    const guide = document.createElementNS(NS, 'path'), line = document.createElementNS(NS, 'path');
    guide.setAttribute('class', 'guide'); line.setAttribute('class', 'line');
    svg.append(guide, line);
    document.body.append(svg);
    /** An SVG path through the points, broken where a point can't be seen or the drawing jumps (the map's seam). */
    const pathOf = (pts) => {
        const map = pv.view.mode === 'map';
        let d = '', prev = null;
        for (const q of pts) {
            const s = pv.globe.screenAt(uvOf(q), map);
            if (!s || (prev && Math.hypot(s[0] - prev[0], s[1] - prev[1]) > 300)) { prev = null; continue; }
            d += `${prev ? 'L' : 'M'}${s[0].toFixed(1)} ${s[1].toFixed(1)}`;
            prev = s;
        }
        return d;
    };
    return {
        /** The brush's ring: `rKm` about the unit point `c`. */
        ring(c, rKm) {
            // (the small circle: c cos α + (e1 cos t + e2 sin t) sin α, e1 and e2 across the sphere at c)
            const a = rKm / R_KM, e1 = unit(cross(c, Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(c, e1), pts = [];
            for (let i = 0; i <= 72; i++) {
                const t = i / 36 * Math.PI, x = Math.cos(t) * Math.sin(a), y = Math.sin(t) * Math.sin(a);
                pts.push([0, 1, 2].map((k) => c[k] * Math.cos(a) + e1[k] * x + e2[k] * y));
            }
            line.setAttribute('d', pathOf(pts));
            guide.setAttribute('d', '');
        },
        /** The split's line from `a` to `b` (unit points), and the whole great circle it cuts along. */
        cut(a, b) {
            const n = unit(cross(a, b)), to = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
            guide.setAttribute('d', pathOf(arc(n, a, 2 * Math.PI, 240)));
            line.setAttribute('d', pathOf(arc(n, a, to, Math.max(2, Math.ceil(to * 120)))));
        },
        clear() { guide.setAttribute('d', ''); line.setAttribute('d', ''); },
    };
}
