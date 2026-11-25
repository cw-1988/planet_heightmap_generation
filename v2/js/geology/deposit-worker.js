// The deposits' worker (deposits.js depositFieldsOnWorkers runs a few, for one finish): it holds the record's fields and
// the ground's on their grids, sent once, and works out each range of cells it is handed — depositCells, the same values
// as on the finish's own thread. Runs as a browser module worker or a Node worker thread.

import { depositCells, rangeBuffers } from './deposits.js';

let grids = null, G, post;
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
        if (msg.type === 'grids') ({ grids, G } = msg);
        else if (msg.type === 'range') {
            const part = depositCells({ ...grids, ...msg.I }, G);
            post({ type: 'done', i: msg.i, part }, rangeBuffers(part));
        }
    } catch (err) {
        post({ type: 'error', i: msg.i, message: err.stack ?? String(err) });
    }
}
