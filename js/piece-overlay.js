// Plate edit overlay (fork addition): Generate's plate edits drawn by the globe's own shader (v2/js/app/piece-glsl.js),
// over the picture and its zoomed-in tiles, rather than painted into them — as the region pick's valleys are
// (region-overlay.js). The piece under each pixel of the 2048 × 1024 grid goes to the GPU once per world (off the
// grid's nearest cells, region-grid.js pixelCells: built between frames, shared with the region pick); the pending
// pieces' tints as they change (a texel each); the piece under the pointer as one number. See docs/plate-edit-tint.md.

import { pixelCells, W, H } from './region-grid.js';

const SW = 256;                                                     // (the states' rows)
/** The tints (sRGB) and their shares: green a piece raised to land, blue one sunk, white the one under the pointer
 *  (the shader's, 0.22). */
const TINT = { raise: [70, 230, 110], sink: [30, 100, 255] }, SHARE = 0.38;

/** The overlay on `globe` (a GlobeView): sync(world, pending, hovered) each frame sends what changed (nothing, mostly). */
export function pieceOverlay(globe) {
    let gridOf = null, ready = null, stateKey = null, hoverShown = -2, pieces = 0;
    function grid(w) {
        gridOf = w; ready = null; stateKey = null;
        globe.setPieceGrid(null);
        if (!w) return;
        pixelCells(w).then((pc) => {
            if (gridOf !== w) return;                                   // (another world meanwhile)
            const rp = w.r_plate, data = new Uint8Array(4 * W * H);
            pieces = 0;
            for (let p = 0; p < W * H; p++) {
                const u = rp[pc[p]] + 1;
                if (u > pieces) pieces = u;
                data[4 * p] = u & 255; data[4 * p + 1] = u >> 8;
            }
            ready = w;
            globe.setPieceGrid(data, W, H);
        });
    }
    return {
        sync(world, pending, hovered) {
            // (the grid built once the world is finished or an edit wants it — not for every step of a build under way)
            if (world !== gridOf && (!world || world.fin || hovered >= 0 || pending.size)) grid(world);
            if (ready !== world || !world) return;
            const key = [...pending].join(',');
            if (key !== stateKey) {
                stateKey = key;
                const rows = Math.max(1, Math.ceil(pieces / SW)), bytes = new Uint8Array(4 * SW * rows);
                for (const id of pending) {
                    if (id < 0 || id >= pieces) continue;
                    bytes.set(world.plateIsOcean.has(id) ? TINT.raise : TINT.sink, 4 * id);
                    bytes[4 * id + 3] = Math.round(255 * SHARE);
                }
                globe.setPieceState(bytes, SW, rows);
            }
            if (hovered !== hoverShown) { hoverShown = hovered; globe.setPieceHover(hovered); }
        },
    };
}
