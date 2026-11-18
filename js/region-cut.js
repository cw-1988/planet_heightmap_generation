// Region cuts (fork addition): a piece (a Generate plate, the thing Ctrl-click floods or raises) split in two along a
// great circle, on the coarse layout before it is projected — so the new piece has its own outline at every Detail, its
// own Ctrl-click, and rides the plate physics like any other. Cuts replay in order on a Rebuild of the same seed; each
// adds its new piece at the end of the layout's list, so the planet code's toggle indices of earlier pieces hold.
//
// Cut: { piece: the piece's id (its seed region), n: [x, y, z] the cutting plane's normal, in Generate's frame }

/** Each cut onto generateCoarsePlates' output (mutated: r_plate, seeds, motion, ocean). */
export function applyCuts(cuts, c) {
    const { coarseMesh, coarse_xyz: X, coarse_r_plate: rp, coarsePlateSeeds: seeds, coarsePlateVec: vec, coarsePlateIsOcean: ocean } = c;
    for (const { piece, n } of cuts ?? []) {
        if (!seeds.has(piece)) continue;
        const side = (r) => n[0] * X[3 * r] + n[1] * X[3 * r + 1] + n[2] * X[3 * r + 2];
        const keep = side(piece) >= 0;                               // (the half holding the piece's seed keeps its id)
        const moving = [];
        for (let r = 0; r < coarseMesh.numRegions; r++) if (rp[r] === piece && (side(r) >= 0) !== keep) moving.push(r);
        if (!moving.length) continue;
        // the new piece's seed: its cell nearest the half's middle
        let mx = 0, my = 0, mz = 0;
        for (const r of moving) { mx += X[3 * r]; my += X[3 * r + 1]; mz += X[3 * r + 2]; }
        let id = moving[0], best = -Infinity;
        for (const r of moving) { const d = mx * X[3 * r] + my * X[3 * r + 1] + mz * X[3 * r + 2]; if (d > best) { best = d; id = r; } }
        for (const r of moving) rp[r] = id;
        seeds.add(id);
        const v = vec[piece];
        vec[id] = { pole: [...v.pole], omega: v.omega };
        if (ocean.has(piece)) ocean.add(id);
    }
}
