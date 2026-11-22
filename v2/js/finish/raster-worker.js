// The finished picture's worker (raster-workers.js runs a few, for one picture): it holds the mesh and the cells'
// fields, sent once, and draws each band of rows it is handed — finish-raster.js rasterBand, the same pixels as on the
// finish's own thread; then the terrain look's bands (terrain-look.js lookRows). Runs as a browser module worker or a
// Node worker thread.

import { rasterBand, shareToState, bandBuffers } from './raster-workers.js';
import { lookRows } from './terrain-look.js';
import { FastNoise } from '../core/fast-noise.js';

let S = null, L = null, noise = null, post;
if (typeof self === 'undefined') {                         // Node worker thread
    const { parentPort } = await import('node:worker_threads');
    post = (msg, transfer) => parentPort.postMessage(msg, transfer);
    parentPort.on('message', handle);
} else {
    post = (msg, transfer) => self.postMessage(msg, transfer);
    self.onmessage = e => handle(e.data);
}
post({ type: 'ready' });                                   // (loaded: terrain-pool.js spawn waits for this)

function handle(msg) {
    try {
        if (msg.type === 'share') S = shareToState(msg.share);
        else if (msg.type === 'band') {
            const B = rasterBand(S, msg.w, msg.py0, msg.py1);
            post({ type: 'done', i: msg.i, B }, bandBuffers(B));
        }
        // (then the terrain on the satellite picture, terrain-look.js: what it reads whole once — the mesh's copy let go —
        // and each band of its rows, its sat views sent back)
        else if (msg.type === 'lookShare') { S = null; L = msg.L; noise = new FastNoise(msg.seed); }
        else if (msg.type === 'look') {
            lookRows(L, msg.B, msg.y0, msg.y1, noise);
            post({ type: 'lookDone', i: msg.i, sat: msg.B.sat }, msg.B.sat.map(a => a.buffer));
        }
    } catch (err) {
        post({ type: 'error', i: msg.i, message: err.stack ?? String(err) });
    }
}
