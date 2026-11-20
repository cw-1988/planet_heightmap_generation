// The ground calmed under the rivers' lines on the zoomed-in tiles (owner: on rough grey mountains the river lines
// "vanish"). A line is seen where it differs from the ground beside it more than that ground differs from itself: on
// smooth lowland the thin blue line does, on a rough hillshade the relief's own light and dark from pixel to pixel is as
// strong as the line, and drowns it. So in a narrow band along each line the picture is softened to its own local
// average — the ground's own colour, no casing: on smooth ground nothing changes, on rough ground the line gets a quiet
// bed to lie in (as a real river lies on its floodplain). The lines are then drawn on it as they always were.

/** The band's reach past the line each side, and the softening's radius, in the canvas's pixels. */
export const CALM_PX = 1.5;
const BLUR_PX = 2;

const pool = new Map();
/** A scratch canvas's context, kept per use and size. */
function scratch(key, w, h) {
    let g = pool.get(key);
    if (!g || g.canvas.width !== w || g.canvas.height !== h) {
        const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
        pool.set(key, g = c.getContext('2d'));
    }
    return g;
}

/**
 * Soften the picture on `ctx` (its own pixels, as painted so far) where `stroke(g)` strokes: g a canvas the size of
 * ctx's, with an identity transform, on which stroke() sets its own transforms and strokes the bands in any colour.
 * The result is laid on ctx with ctx's own compositing (a tile's 'source-atop' keeps its sea).
 */
export function calmUnder(ctx, stroke) {
    const cv = ctx.canvas, w = cv.width, h = cv.height, p = 2 * BLUR_PX + 1;
    // (the picture with its edge pixels carried out past the canvas: softened, a tile's edge stays its own colour, not
    // faded into the nothing beyond — or the tiles' seams would show along every river crossing one)
    const pad = scratch('pad', w + 2 * p, h + 2 * p);
    pad.setTransform(1, 0, 0, 1, 0, 0); pad.filter = 'none'; pad.globalAlpha = 1;
    pad.globalCompositeOperation = 'copy'; pad.drawImage(cv, 0, 0, w + 2 * p, h + 2 * p);
    pad.globalCompositeOperation = 'source-over'; pad.drawImage(cv, p, p);
    const soft = scratch('soft', w, h);
    soft.setTransform(1, 0, 0, 1, 0, 0); soft.globalAlpha = 1; soft.globalCompositeOperation = 'copy';
    soft.filter = `blur(${BLUR_PX}px)`; soft.drawImage(pad.canvas, -p, -p); soft.filter = 'none';
    // (the bands, then the softened picture kept in them alone)
    const band = scratch('band', w, h);
    band.setTransform(1, 0, 0, 1, 0, 0); band.globalAlpha = 1; band.globalCompositeOperation = 'source-over'; band.setLineDash([]);
    band.clearRect(0, 0, w, h);
    band.save(); stroke(band); band.restore();
    band.setTransform(1, 0, 0, 1, 0, 0); band.globalAlpha = 1; band.globalCompositeOperation = 'source-in';
    band.drawImage(soft.canvas, 0, 0);
    band.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(band.canvas, 0, 0); ctx.restore();
}
