// The rivers' lines readable on any ground (developer: on dark, rough mountains the thin dim blue hairlines "almost
// vanish into the relief"). Each line is drawn as a core over a casing, in one of two looks, and each look is kept only
// where the ground under it calls for it — the ground read from the picture already painted, its luma averaged over a
// few pixels, so a rough hillshade's lit and shaded faces count together:
//   · light ground: the rivers' own blue over a faint pale casing — barely there on pale land, so never garish;
//   · dark ground: a bright blue core over a dark casing — a light line edged dark reads over shadow and lit slope alike.
// Between the two luma bands the looks blend, so a river running from lowland into mountains changes without a seam.
// A canvas all of one look (most tiles of a zoomed view) is drawn on straight; else both looks are drawn on layers,
// each masked by its ground, and laid on.

/** The two looks: the core's colour (null: the rivers' own blue or regime colour), the gain on every river's alpha (by
 *  its strength: a brook stays fainter than its trunk), and the casing's colour and alpha (× the core's). */
export const RIVER_LOOKS = {
    light: { core: null, gain: 1.1, casing: 'rgb(255, 255, 255)', casingAlpha: 0.45 },
    // (on grey relief a line stands out by its hue, not its brightness — the lit faces are as bright as a pale blue, the
    // shaded ones as dark as the casing: so a clear mid blue, the trunks at full strength, the brooks still faint)
    dark: { core: 'rgb(95, 175, 240)', gain: 1.25, casing: 'rgb(4, 12, 30)', casingAlpha: 0.7 },
};
/** The casing's width past the core's, in all (half each side), and the thinnest core a zoomed-in window draws (a
 *  thinner one is anti-aliased to a smear), in the canvas's own pixels — at every zoom. */
const CASING_PX = 1.6;
export const MIN_CORE_PX = 1;
/** Ground luma (0…1): the dark look in full at or below DARK, the light look at or above LIGHT. Mid-grey hillshaded
 *  mountains (luma ~0.4–0.55: the owner's case, the rivers lost in them) sit wholly in the dark look — the light look is
 *  for pale ground alone, where a dark blue line already stands out. */
const DARK = 0.56, LIGHT = 0.68;
/** The ground read at 1/SHRINK of the canvas's pixels (wide enough to take a rough slope's lit and shaded faces
 *  together); a big canvas (the sharper texture, an export) laid on in strips. */
const SHRINK = 8, STRIP = 1024;

/** A canvas pixel on a context, in its current transform's units. */
export const pxOf = g => { const m = g.getTransform(); return 1 / (Math.hypot(m.a, m.b) || 1); };
/** The casing's extra width on a context, in its current transform's units. */
export const casingWidth = g => CASING_PX * pxOf(g);
/** The whole planet's picture (seen zoomed out, its sub-pixel lines packed close): the casing only SLIM × as wide as the
 *  core past it and SLIM_ALPHA × as strong — the fixed screen-pixel casing of a zoomed-in window, three times a 0.5 px
 *  core, drowned the rivers in their own black borders (owner). */
export const SLIM = 0.6, SLIM_ALPHA = 0.6;

const pool = new Map();
/** A scratch canvas's context, kept per use and size. */
function scratch(key, w, h) {
    let g = pool.get(key);
    if (!g || g.canvas.width !== w || g.canvas.height !== h) {
        const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
        pool.set(key, g = c.getContext('2d', { willReadFrequently: key === 'read' }));
    }
    return g;
}

/** The ground of a canvas as two masks (alpha: how much of each look it calls for), or `uniform`: the one look it all calls for. */
function groundMasks(cv) {
    const W = cv.width, H = cv.height, w = Math.max(1, Math.ceil(W / SHRINK)), h = Math.max(1, Math.ceil(H / SHRINK));
    const r = scratch('read', w, h);
    r.globalCompositeOperation = 'copy'; r.imageSmoothingEnabled = true; r.imageSmoothingQuality = 'high';
    r.drawImage(cv, 0, 0, W, H, 0, 0, w, h);
    const px = r.getImageData(0, 0, w, h).data, dark = new ImageData(w, h), light = new ImageData(w, h);
    let anyDark = false, anyLight = false;
    for (let i = 3; i < px.length; i += 4) {
        const y = (0.299 * px[i - 3] + 0.587 * px[i - 2] + 0.114 * px[i - 1]) / 255;
        const d = px[i] ? Math.round(255 * Math.min(1, Math.max(0, (LIGHT - y) / (LIGHT - DARK)))) : 0;
        dark.data[i] = d; light.data[i] = 255 - d;
        if (d > 0) anyDark = true;
        if (d < 255) anyLight = true;
    }
    if (!anyDark || !anyLight) return { uniform: anyDark ? 'dark' : 'light' };
    const md = scratch('maskDark', w, h), ml = scratch('maskLight', w, h);
    md.putImageData(dark, 0, 0); ml.putImageData(light, 0, 0);
    return { dark: md.canvas, light: ml.canvas };
}

/**
 * Draw the rivers on `ctx` (its transform and compositing as the caller set them) readable on the ground already
 * painted there. `draw(g, pen)` strokes them all on a context g whose transform is the caller's, pen = { look, casing }:
 * called for the casings first, then the cores, so a tributary's casing never cuts across the river it joins.
 */
export function drawContrasted(ctx, draw) {
    const pens = look => [{ look, casing: true }, { look, casing: false }];
    const run = (g, look) => { for (const pen of pens(look)) { g.save(); draw(g, pen); g.restore(); } };
    const M = groundMasks(ctx.canvas);
    if (M.uniform) { run(ctx, M.uniform); return; }
    const W = ctx.canvas.width, H = ctx.canvas.height, m = ctx.getTransform(), sh = Math.min(H, STRIP);
    for (let sy = 0; sy < H; sy += STRIP) {
        for (const look of ['dark', 'light']) {
            const g = scratch(look, W, sh);
            g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, sh);
            g.setTransform(new DOMMatrix().translate(0, -sy).multiply(m));
            run(g, look);
            // (kept where its ground calls for it: the mask, smoothed up to the canvas's size)
            g.setTransform(1, 0, 0, 1, 0, -sy); g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true;
            g.drawImage(M[look], 0, 0, W, H);
            g.globalCompositeOperation = 'source-over';
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(g.canvas, 0, sy); ctx.restore();
        }
    }
}
