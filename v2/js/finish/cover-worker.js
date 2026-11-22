// The final climate's worker (final-cover.js runs a few, for one finish): it holds the grid's climate, sent once, and
// works out each range of cells it is handed — coverRange, the same values as on the finish's own thread. Runs as a
// browser module worker or a Node worker thread.

import { coverRange, rangeBuffers } from './final-cover.js';

let shared = null, post;
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
        if (msg.type === 'shared') shared = msg.shared;
        else if (msg.type === 'range') {
            const O = coverRange({ ...shared, ...msg.I });
            post({ type: 'done', i: msg.i, from: msg.from, O }, rangeBuffers(O));
        }
    } catch (err) {
        post({ type: 'error', i: msg.i, message: err.stack ?? String(err) });
    }
}
