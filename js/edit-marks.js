// The edit tools' marks over the planet (fork addition): the brush's ring at the pointer (dashed while it erases; faint
// outside the plates the paint is kept to, where a stroke lays nothing). Drawn
// in an SVG over the globe or the map, each point of the sphere placed by GlobeView.screenAt. (The paint strokes waiting
// for Apply are the shader's, clipped to their pieces: piece-overlay.js.)
const NS = 'http://www.w3.org/2000/svg', R_KM = 6371;

/** Texture place [u, v] of a unit point (z-up) — terrain-brush.js's pointAt the other way. */
export const uvOf = ([x, y, z]) => [(Math.atan2(y, x) + Math.PI) / (2 * Math.PI), (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, z)))) / Math.PI];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((c) => c / l); };

/** Where the view stands (globe or map, the camera, the map's zoom and pan): the marks are drawn again when it changes. */
export const viewKey = (pv) => { const c = pv.globe.camera.position, m = pv.globe.mapView; return `${pv.view.mode} ${c.x} ${c.y} ${c.z} ${m?.zoom} ${m?.panX} ${m?.panY}`; };

export function mountMarks(pv) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'terrain-marks');
    const line = document.createElementNS(NS, 'path'), out = document.createElementNS(NS, 'path');
    line.setAttribute('class', 'line');
    out.setAttribute('class', 'line out');                  // (the ring's part outside the plates paint is kept to)
    svg.append(out, line);
    document.body.append(svg);
    /** An SVG path through the points, broken where a point can't be seen or the drawing jumps (the map's seam). */
    // (`keep(i)`: whether the step from point i − 1 to point i is drawn; a step left out breaks the path too)
    const pathOf = (pts, keep = null) => {
        const map = pv.view.mode === 'map';
        let d = '', prev = null;
        for (let i = 0; i < pts.length; i++) {
            const s = pv.globe.screenAt(uvOf(pts[i]), map);
            if (!s || (prev && Math.hypot(s[0] - prev[0], s[1] - prev[1]) > 300)) { prev = null; continue; }
            if (prev && keep && !keep(i)) prev = null;
            d += `${prev ? 'L' : 'M'}${s[0].toFixed(1)} ${s[1].toFixed(1)}`;
            prev = s;
        }
        return d;
    };
    /** The small circle `rKm` about the unit point `c`, `steps` points: c cos α + (e1 cos t + e2 sin t) sin α, e1 and e2
     *  across the sphere at c. */
    const circle = (c, rKm, steps) => {
        const a = rKm / R_KM, e1 = unit(cross(c, Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(c, e1), pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps * 2 * Math.PI, x = Math.cos(t) * Math.sin(a), y = Math.sin(t) * Math.sin(a);
            pts.push([0, 1, 2].map((k) => c[k] * Math.cos(a) + e1[k] * x + e2[k] * y));
        }
        return pts;
    };
    return {
        /** The brush's ring: `rKm` about the unit point `c`; dashed for the eraser. `inside(q)` (optional): whether the
         *  unit point q is where the brush may paint (the plates it is kept to); the ring is drawn full there and faint
         *  beyond, so it shows the stroke stopping at their outline. */
        ring(c, rKm, erase = false, inside = null) {
            const pts = circle(c, rKm, 72);
            if (!inside) { line.setAttribute('d', pathOf(pts)); out.setAttribute('d', ''); }
            else {
                // (each step by its middle: in or out of the plates)
                const mid = pts.map((q, i) => i && inside(unit(q.map((v, k) => v + pts[i - 1][k]))));
                line.setAttribute('d', pathOf(pts, (i) => mid[i]));
                out.setAttribute('d', pathOf(pts, (i) => !mid[i]));
            }
            line.classList.toggle('erase', erase); out.classList.toggle('erase', erase);
        },
        clear() { for (const l of [line, out]) { l.setAttribute('d', ''); l.classList.remove('erase'); } },
    };
}
