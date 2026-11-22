// The finished picture's worker (raster-workers.js runs a few, for one picture): it holds the mesh and the cells'
// fields, sent once, and draws each band of rows it is handed — finish-raster.js rasterBand, the same pixels as on the
// finish's own thread. Runs as a browser module worker or a Node worker thread.

import { rasterBand, shareToState, bandBuffers } from './raster-workers.js';

let S = null, post;
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
    } catch (err) {
        post({ type: 'error', i: msg.i, message: err.stack ?? String(err) });
    }
}
