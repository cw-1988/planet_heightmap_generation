# The floods' redundant sea tests, and a packing tried and dropped

2026-11-22, at 2.5M, with the same output hashes at 2.5M and 250K (`v2/out/hash-finish.mjs`).

## Done: one test fewer per neighbour

Three priority floods tested every neighbour twice: "not ranked yet" and "not the sea". The setup loop already marks
every sea cell as done, so the first test covers the second:

- `carve.js` `carveLevel`: `rank[nb] !== -1 || !land(nb)`. The sea holds rank −2.
- `finish-basins.js` `closedBasins`: `done[nb] || !(z[nb] > 0)`. The sea holds done = 2.
- `finish-hydro.js` `spillFlood`: `rank[nb] !== -1 || ocean[nb]`. The ocean holds rank −2.

The pops and their order are the same. The gain is small and inside run-to-run noise. In one run, rivers took 6.2 s
(the range had been 6.1–6.6) and sea took 1.5 s (it had been 1.7–1.8).

`hydrology()`'s own flood had the same redundant `ocean[nb]` test (its ocean also holds rank −2). It was left alone
at first, while another session was changing that function, and dropped later with the same hashes:
[drivers-and-blur-hoists.md](drivers-and-blur-hoists.md).

## Tried and dropped: one cache line per neighbour

`carveLevel`'s flood reads four arrays for each neighbour: rank, parent, fill and route. Packing them into one 16-byte
record per cell (an `ArrayBuffer` viewed as Int32 and Float32, then copied back out) gave the same hashes. Rivers still
took 6.2 s, so the flood isn't bound by those reads. It would also need 16 bytes a cell (160 MB at 10M), so it was
reverted.
