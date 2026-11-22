# The rivers' months summed side by side

`riverYears` in `v2/js/finish/finish-hydro.js` routes each river's twelve monthly flows down the network, four months
a pass. It kept the four months' sums as four arrays of the mesh's size, so every cell visited touched four cache lines
far apart, and the network's order (by height, not by place) gives the cache no help.

## Changed

The four sums are one array, a cell's months next to each other (`acc[M * c + j]`). The same additions in the same
order on the same 32-bit floats, so the same bits.

## Result

2.5M cells, meshes built ahead (`PREPARE=1`), the old and new code alternated four times; all 126 hashes identical (and
at 250K). The water stage: before 5.4 · 5.4 · 5.3 · 5.1, after 5.1 · 4.8 · 4.8 · 4.8, so about 0.4 s.
