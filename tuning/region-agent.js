// Dev tool (not shipped): the page's half of the shot relay (tuning/shot-relay.mjs), so an image-checking agent can pick
// its own valleys and get pictures of them with curl, no browser of its own. Start in the generate page, planet finished:
// (await import('/tuning/region-agent.js')).serve(). The agent asks, each answer JSON:
//   curl -s "http://localhost:8010/__job?cmd=random&size=150000"        a valley under a random land point
//   curl -s "http://localhost:8010/__job?cmd=at&size=150000&lat=12.5&lon=-40"   the valley at a point (degrees)
//   curl -s "http://localhost:8010/__job?cmd=valley&size=150000&id=1234"        a valley by id (from neighbours)
//   curl -s "http://localhost:8010/__job?cmd=atlas&size=150000&w=4096"          the whole map, every edge, none chosen
// size: 30000 | 150000 | 600000 (km²). Shots take px (900), pad (0.8: the valley's extent added each side) and mark
// (1: chosen valley white-edged and tinted; 0: edges only). An answer gives the PNG's path, the valley's id, centre,
// area and neighbours' ids, and km a pixel.

import * as P from '../js/region-pick.js';
import { valleyGrid, W, H } from '../js/region-grid.js';
import { shot, atlas } from './region-shots.js';

const DIR = 'C:\\Users\\Chris\\Projects\\World-Orogen\\tuning\\screenshots\\';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let count = 0;

/** Polls the relay for jobs until the page closes. */
export async function serve() {
    if (window.__regionAgent) return 'already serving';
    window.__regionAgent = true;
    (async () => {
        for (;;) {
            try {
                const r = await fetch('/__job/next', { cache: 'no-store' });
                if (r.status !== 200) continue;
                const job = await r.json();
                let out;
                try { out = await run(job.params); } catch (e) { out = { error: String(e?.stack ?? e) }; }
                await fetch(`/__job/done?id=${job.id}`, { method: 'POST', body: JSON.stringify(out) });
            } catch { await sleep(1000); }
        }
    })();
    return 'serving';
}

async function run(p) {
    const C = await valleys(p.size ?? '150000'), { world, V } = C, xyz = world.tMesh.xyz;
    const opt = { px: +(p.px ?? 900), pad: +(p.pad ?? 0.8), mark: p.mark !== '0' };
    const name = `agent-${++count}-${p.cmd}`;
    if (p.cmd === 'atlas') return { file: DIR + name + '.png', ...(await atlas(C, name + '.png', +(p.w ?? 4096))) };
    const G = await valleyGrid(world, V), at = (lat, lon) => {
        const i = Math.floor((lon + 180) / 360 * W) % W, j = Math.min(H - 1, Math.floor((lat + 90) / 180 * H));   // (rows from the south)
        return G[j * W + i];
    };
    let u;
    if (p.cmd === 'random') {
        for (let t = 0; t < 1000 && !(u >= 0); t++) {
            const c = Math.floor(Math.random() * V.unit.length);
            if (V.unit[c] < 0) continue;
            u = at(Math.asin(xyz[3 * c + 2]) * 180 / Math.PI, Math.atan2(xyz[3 * c + 1], xyz[3 * c]) * 180 / Math.PI);
        }
    } else if (p.cmd === 'at') u = at(+p.lat, +p.lon);
    else if (p.cmd === 'valley') u = +p.id;
    else return { error: `unknown cmd ${p.cmd}: random | at | valley | atlas` };
    if (!(u >= 0) || !V.cells.get(u)?.length) return { error: `no valley there (${u}): sea, or an unknown id` };
    const s = await shot(C, [u], name + '.png', opt);
    return { file: DIR + name + '.png', valley: u, ...facts(C, G, u), kmPx: +s.kmPx.toFixed(2), w: s.w, h: s.h };
}

/** The pick switched on at `size`, its valleys cut. */
async function valleys(size) {
    const bar = document.querySelector('.region-pick'), on = bar.querySelector('[data-on]'), sel = bar.querySelector('[data-k="size"]');
    if (on.getAttribute('aria-pressed') !== 'true') on.click();
    if (sel.value !== String(size)) { sel.value = String(size); sel.dispatchEvent(new Event('change')); }
    for (let i = 0; i < 240 && !P.regionChosen.V; i++) { bar.dispatchEvent(new Event('pointerenter')); await sleep(250); }
    if (!P.regionChosen.V) throw new Error('the valleys were not cut in 60 s: is the planet finished?');
    return P.regionChosen;
}

/** A valley's centre (degrees), area and the ids of the valleys it borders on the map. */
function facts(C, G, u) {
    const xyz = C.world.tMesh.xyz, cells = C.V.cells.get(u);
    let x = 0, y = 0, z = 0;
    for (const c of cells) { x += xyz[3 * c]; y += xyz[3 * c + 1]; z += xyz[3 * c + 2]; }
    const l = Math.hypot(x, y, z), nb = new Set();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        if (G[j * W + i] !== u) continue;
        for (const q of [j * W + (i + 1) % W, j * W + (i + W - 1) % W, j > 0 ? (j - 1) * W + i : -1, j < H - 1 ? (j + 1) * W + i : -1]) if (q >= 0 && G[q] !== u && G[q] >= 0) nb.add(G[q]);
    }
    return {
        lat: +(Math.asin(z / l) * 180 / Math.PI).toFixed(2), lon: +(Math.atan2(y, x) * 180 / Math.PI).toFixed(2),
        areaKm2: Math.round(cells.length * (C.world.tMesh.cellAreaKm2 ?? 2500)), neighbours: [...nb],
    };
}
