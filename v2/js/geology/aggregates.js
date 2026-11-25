// Aggregates (docs/aggregates.md): sand and gravel, crushed rock and glass sand — the bulk stone of mortar, concrete,
// roads and glass. Worth only near where it is used (hauled far it costs more than it is worth), so the map shows only the
// notable: a source under GEOLOGY.deposits.aggregates.floor shows nothing, and the districts take a modest share.
//   sand and gravel  a river's plain and terraces (coarser upstream, none in gorges), the outwash and moraines beyond the
//                    old ice, eskers and kames on the ground it left, and beaches and shingle where the coast is given sand
//   desert sand      a sand sea's: never better than poor — wind-rounded grains bind badly in concrete
//   crushed rock     hard rock quarried where no sand or gravel lies near
//   silica sand      glass sand: quartz sandstone, clean wave-sorted beach sand (not the shell sand of reef coasts, not
//                    shingle), a little from the dunes
// Distances are km (riverBandKm, beachBandKm, nearKm): the same at every detail.

import { Rock, ROCK_COUNT } from './rocks.js';
import { LITTORAL, winterOf } from '../finish/littoral.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// (how good each rock is crushed: granite, gneiss, basalt and greenstone best; limestone well; tuff, slate and sandstone
// less; shale, salt and young sediment not at all)
const HARD = new Float32Array(ROCK_COUNT);
HARD[Rock.GRANITE] = 1; HARD[Rock.GNEISS] = 1; HARD[Rock.SHIELD] = 1; HARD[Rock.GREENSTONE] = 1; HARD[Rock.BASALT] = 1;
HARD[Rock.OPHIOLITE] = 0.8; HARD[Rock.LIMESTONE] = 0.8; HARD[Rock.VOLCANIC] = 0.5; HARD[Rock.SLATE] = 0.4; HARD[Rock.SANDSTONE] = 0.3;

/**
 * The aggregates' sources, made once per detailed moment; returns the per-cell writer the deposits' loop calls (or null:
 * no kinds to write).
 * @param {Object} o  { mesh, ocean, lat, lon, coarse (the deposits' 0.5° LatLonGrid), rough (its ground roughness, km),
 *   ids ({gravel, desertSand, crushedRock, silicaSand}: their rows), q (m³/s), till (0…255: beyond the old ice),
 *   glaciated (0/1), ice (under ice now, 0/1), erg (0…1), coastSand, coastWave, coastWinter (0…255 near the coast) }
 * @param {Object} G  GEOLOGY
 * @returns {null | function(c, rs, J4, access, ci, cw, wd)}  rs, J4: the grid cell's rock shares; access: how easily its
 *   rock is got at (0…1); ci, cw: the cell's corners on `coarse`; wd(row, v): the deposits' district writer
 */
export function aggregates(o, G) {
    const src = aggregateSources(o, G);
    return src && aggregateWriter({ ...src, ids: o.ids, coarse: o.coarse, erg: o.erg ?? null, coastWave: o.coastWave ?? null, coastWinter: o.coastWinter ?? null }, G);
}

/** aggregates()' sources, per cell (worth: sand and gravel worth working; shoreSand) and on `coarse` (near: the share of
 *  the ground worth working, over ~nearKm) — or null: no kinds to write. */
export function aggregateSources(o, G) {
    const { mesh, ocean, lat, lon, coarse, rough, ids, q = null, till = null, glaciated = null, ice = null, coastSand = null } = o;
    if (!ids || ids.gravel === undefined) return null;
    const A = G.deposits.aggregates, n = mesh.numCells, { adjOffset, adjList, edgeKm } = mesh;
    const notable = v => (v > A.floor ? (v - A.floor) / (1 - A.floor) : 0);
    // ── sand and gravel's sources at each land cell ──
    const riverBand = Math.min(1, 2 * A.riverBandKm / edgeKm), beachBand = Math.min(1, A.beachBandKm / edgeKm);
    const shoreSand = new Float32Array(n), worth = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (ocean[c] || (ice && ice[c])) continue;
        let v = 0;
        // (a river's: gravel on the piedmonts and up the valleys, sand on the lowland plains, none in its gorges)
        if (q && q[c] > A.riverQ[0]) {
            const r = coarse.at(rough, lat[c], lon[c]) || 0;
            v = smooth(A.riverQ[0], A.riverQ[1], q[c]) * riverBand * (A.riverSand + (1 - A.riverSand) * smooth(A.riverRough[0], A.riverRough[1], r)) * (1 - smooth(A.gorgeRough[0], A.gorgeRough[1], r));
        }
        // (the old ice's: outwash and moraines beyond its edge, strongest at it; eskers and kames on the ground it left)
        if (till && till[c]) v = Math.max(v, A.outwash * till[c] / 255);
        if (glaciated && glaciated[c]) v = Math.max(v, A.esker);
        // (the coast's: beaches, spits and dunes along a sandy shore — or shingle where the winter sea is cold)
        if (coastSand && coastSand[c] && adjOffset) {
            let shore = false;
            for (let k = adjOffset[c]; k < adjOffset[c + 1] && !shore; k++) shore = !!ocean[adjList[k]];
            if (shore) { shoreSand[c] = beachBand * coastSand[c] / 255; v = Math.max(v, A.beach * shoreSand[c]); }
        }
        worth[c] = notable(v);
    }
    // ── where sand or gravel lies near: the share of the ground worth working, over ~nearKm ──
    const near = coarse.blur(coarse.average(lat, lon, worth, c => !ocean[c]), A.nearKm);
    return { worth, shoreSand, near };
}

/** The per-cell writer from aggregateSources()' `worth`, `shoreSand`, `near` — with ids, coarse, and per cell erg,
 *  coastWave, coastWinter (each indexed as worth is: a range of cells' own slices will do). */
export function aggregateWriter({ worth, shoreSand, near, ids, coarse, erg = null, coastWave = null, coastWinter = null }, G) {
    const A = G.deposits.aggregates, notable = v => (v > A.floor ? (v - A.floor) / (1 - A.floor) : 0);
    const Lt = LITTORAL, show = G.ergShow;
    return (c, rs, J4, access, ci, cw, wd) => {
        if (worth[c] > 0) wd(ids.gravel, worth[c]);
        const dune = erg ? smooth(show[0], show[1], erg[c]) : 0;
        if (dune > 0) wd(ids.desertSand, A.ergCap * dune);
        // (crushed rock: hard rock got at, where no sand or gravel lies near)
        let hard = 0;
        for (let r = 1; r < ROCK_COUNT; r++) hard += rs[J4 + r] * HARD[r];
        if (hard > 0.05) {
            const nv = coarse.atCorners(near, ci, cw);
            wd(ids.crushedRock, notable(A.crushed * Math.min(1, hard) * access * (1 - smooth(A.near[0], A.near[1], nv === nv ? nv : 0))));
        }
        // (glass sand: quartz sandstone; clean beach sand the waves have sorted — not a reef coast's shell sand, not shingle;
        // a little from the dunes)
        let beach = 0;
        if (shoreSand[c] > 0) {
            const w = winterOf(coastWinter ? coastWinter[c] / 255 : 0.5);
            beach = A.silicaBeach * shoreSand[c] * smooth(A.waveSorted[0], A.waveSorted[1], coastWave ? coastWave[c] / 255 : 0.5) *
                (1 - smooth(Lt.reefC[0], Lt.reefC[1], w)) * (1 - smooth(Lt.gravelC[0], Lt.gravelC[1], w));
        }
        wd(ids.silicaSand, notable(Math.max(A.silicaSandstone * rs[J4 + Rock.SANDSTONE] * access, beach, A.silicaErg * dune)));
    };
}
