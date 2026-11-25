# The build card: what the page is doing, bottom right

A card at the bottom right shows each new world's build from Generate (or an import) to its last layer. Asked for by
the owner, 2026-11-20, after zooming did nothing for a long time once the waterways were drawn. Code:
`js/build-progress.js`, wired in `js/main.js` and `js/import-main.js`. Back to [generate-load.md](generate-load.md).

## What it shows

Generate counts three steps, Import two (it has no states).

- **Step 1 of 3 · Building the planet**: the planet worker's own progress and words (plates, the history, the Detail
  ladder).
- **Step 2 of 3 · Finishing the world**: the finish's stages, one bar for all of them, each named in plain words
  (`v2/js/finish/stage-words.js`, shared with Evolution): the surface, the climate, the rivers, the ice age, the fine
  detail, the rocks, the farming, the picture; and under the bar a thin one for the stage under way, its % after its
  words ([finish-progress.md](finish-progress.md)).
- **Step 3 of 3 · Founding the states** (Generate): the states and empires of the Civilizations tab
  (`v2/js/evolution/states-view.js`), worked out once the world is finished, also when it opens from the world cache.
  `statesBuild` hands the work to a worker (`v2/js/evolution/states-worker.js`), which reports each step (reading the
  land, founding the capitals, drawing the borders, placing the cities, towns and villages, laying the roads, raising
  the forts, counting the people, dividing the regions), so the bar moves and the page stays live (5–10 s in all on a
  1.4M-Detail world at 4,096 px, reading the land the longest). The worker gets a copy of the rasters the states read
  (about 200 MB at 4,096 px, sent in 8 MB slices with a turn for the page between each, taken by a message rather than a timer, since a hidden
  tab's timers wake only once a second, then once a minute; the console splits the time into sending and working out) and is ended once the states
  are back, so the copy lasts only as long as the build. Until the first states come, the States view shows plain
  paper and the overlay waits.
- **Zoom in for detail**: "waiting" until the fine detail is drawn, then "ready".
- **Done**: shown, then the card hides after 2.5 s. A finish that failed keeps the card up with its problem.

The legend card moves up while it shows; on a phone it spans the bottom.

## Why zooming stalled

Zoomed tiles are drawn from the fine detail's drivers (`DetailService.can` needs `raster.drivers`). The finish drew
them at its `detail` stage, ~70 % through, but sent them only with its final `done`, after the rocks, the second climate,
the deposits, the farming and the picture: ~5–8 s on a 204,000-Detail world with zooming dead. Now `finish.js` hands
them over right after `detail` (`onDrivers`); the finish worker posts them as `drivers` and `finish-view.js` adds them
to the terrain already shown. `done` then comes without them.

## Why the stages show with Progressive generation off

That toggle skips the Detail ladder (step 1's coarse-to-fine terrain). The finish's stages are not a ladder: each needs
the last (rivers need the surface and climate, the fine detail needs the rivers), so they run with it on or off. The
card names them, so the wait is readable.

## The bar's shares

Each finish stage has a share of the bar (`finish.js` STAGES), from its measured time. They summed to 1.17, so the bar
reached 100 % three stages early; they now sum to 1.

## Checked (browser pane, 2026-11-20)

Generate at 204,000: the card went through every build and finish stage. "Ready" came at "Drawing the fine detail",
~4 s before Done, and zoomed tiles drew while the finish was still weighing the land for farming. Then Done, then
hidden.
