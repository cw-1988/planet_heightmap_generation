# City size: its speed

The City size view (`v2/js/evolution/city-view.js`, `city-haul.js`) froze the page for 13 s when the tab opened at the
default reach (1 day), and for over a minute at half a day. These are the causes found and fixed on 2026-11-20, measured with
`node v2/tools/bench-city.mjs` (320,000 cells, a 4096-wide texture, seed 12345).

## What was slow

- **Every sea cell was its own port.** `city-haul.js` keeps each cell's water cost in a Float32Array. It then told
  land from water with `kind[i] === HAUL.sea`, but 0.05 as a float32 never equals 0.05 as a double. No sea or lake cell
  matched, so each one ran its own Dijkstra over the waterways: 316,000 searches instead of the coast's ~30,000. The
  costs are now matched with `Math.fround`, and the comment there says why. The result for every land cell is the same.
- **Polar rows.** On the plain waterway grid, a row near a pole is a few km wide, so a polar port's reach by sea spanned
  whole rows. The waterway grid is now reduced: its cells stay about square at every latitude, as a power of two of
  columns per row. Counts are unchanged to 60°; past that they rise 3–8 %.
- **The sum by cart** divided and floored for every cell and strip. Each strip of the disc is the same width for every
  cell of a row, so its whole-cell offsets and fractions are now worked out once per strip. The output matches the
  old code to float rounding (1e-8).
- **The cart leg to water** doesn't depend on the reach. It is now kept per picture and grid size, so moving the
  slider skips it.

## Numbers

The city grid, in ms, on each reach change:

| Reach | Before | After |
|---|---|---|
| 0.5 days | 69,000 | 469 |
| 1 day | 13,500 | 340 |
| 3 days | 913 | 201 |
| 6 days | 1,128 | 264 |
| 12 days | 339 | 193 |

The first reach after a new moment or grid size also pays for the cart leg (~150 ms). Painting the 4096 texture takes another ~200–290 ms, and 1000 hover readouts take a few ms. The people grid (~1 s) is
built once per moment and per set of options, not per reach.
