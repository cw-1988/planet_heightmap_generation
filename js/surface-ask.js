// The finish's uncarved surface ({heightKm, recCell, cues, carveIn}), asked of the planet worker that keeps it
// (js/planet-worker.js, 'surface'): the page holds none between finishes — ~150 MB at 2.56M cells (docs/page-memory.md).

let asked = 0;
/** Copies of the surface of the world the worker holds now, with the buffers to hand on to the finish as transfers. */
export function askSurface(worker) {
    const id = ++asked;
    return new Promise((resolve) => {
        const heard = ({ data }) => {
            if (data.type !== 'surface' || data.id !== id) return;
            worker.removeEventListener('message', heard);
            const s = data.surface;
            resolve({ surface: s, transfer: [s.heightKm, s.recCell, s.cues, ...Object.values(s.carveIn)].filter(Boolean).map(a => a.buffer) });
        };
        worker.addEventListener('message', heard);
        worker.postMessage({ cmd: 'surface', id });
    });
}
