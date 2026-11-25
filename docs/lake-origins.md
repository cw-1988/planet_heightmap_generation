# Lake origins: which hollows hold a lake, and lakes at every detail

Which of the finish's hollows may hold a lake, and the checks that lakes do not hang on the detail or the zoom. Changed
2026-11-20, after the owner's report on seed `kw90o25briyrb5smb3i9rb` at Detail 2,560,000: lakes "mostly in the
mountains, not on land", a step's water sometimes reverting the picture to a coarser step, and most lakes gone after the
last pass. Code: `v2/js/finish/finish-hydro.js` (the hollows' origins), `v2/js/finish/lake-dams.js`,
`v2/js/finish/lake-fates.js`, `v2/js/finish/fine-detail.js` (lake beds), `js/rung-view.js`. Back to the
[v2 README](../v2/README.md) (the finish's hydrology); the silt and the outlets are [basin-lakes.md](basin-lakes.md).

## The origins

A hollow the priority flood finds is a lake only where something made the hollow. Any other is cut through by its
river (old basins overflow and wear their rims down).

- **Sea**: a remnant of the sea trapped behind a rim ([basin-lakes.md](basin-lakes.md)).
- **Glacial**: at least half its cells under the last ice age's ice: scoured hollows, a lake district.
- **Tectonic**: at least `lakeTectonicShare` of its cells in the tectonic surface's own hollows (rifts, sags).
- **Blocked valley** (new, `lake-dams.js`): a tributary's lower valley dammed by its trunk river. A big river carries
  far more sediment than its tributaries and, where its gradient is low, builds up its floodplain and levees faster
  than they can keep pace; their mouths are blocked and their valleys flood. Poyang and Dongting (Yangtze), Tonle Sap
  (Mekong), the Amazon's ria lakes. The test walks down the hollow's spill to the first trunk draining at least
  `damRatio` (4) × the hollow's own area and `damTrunkKm2` (30,000 km²), within `damReachKm` (60 km). The hollow is a
  lake if that trunk falls at most `damSlope` (0.4 m/km, an aggrading lowland river) there. The sea ends the walk (a
  drowned valley is the sea's). Such a lake gets no breach cut (its dam rises with the trunk) and silts like a young
  lake. The Lakes slider scales `damSlope` and `damRatio` ([lakes-slider.md](lakes-slider.md)).

## Not under today's ice

A hollow with at least half its cells under a present ice cap (an EF climate) holds ice, not water: fate `iced`.
Before, the ice age's scoured hollows under today's caps counted as lakes, and those sat high.

## At every detail

- **The steps' water** ([progressive-water.md](progressive-water.md)): a step's water is never shown over a finer
  step already on screen. Before, a coarse step's water that landed after a finer bare step reverted the picture to
  the coarser terrain.
- **Lake beds up close**: lake mud settles flat, so the zoomed tiles' added relief fades out under a lake as its water
  deepens (`FINE.lakeFlatKm`, 10 m). Before, the waves stood up through a shallow lake's bed and dried pixels of it.
  The fade goes by the lake test's own margin (`lakeMarginKm`, lake-water.js), so it stops at the shore. It once
  flattened every pixel with a lake pixel among its four nearest picture pixels: a flat band of land round each lake,
  cut off on the picture's square grid (the owner, 2026-11-20: "wtf is this lake to terrain edge?"). The small lakes
  likewise skip only pixels that pass the test.

## Measured

`node --max-old-space-size=16000 v2/tools/probe-lakes.mjs` (seed 799224, its cached frame; terrain only), fresh water
as a share of land:

| Cells | No blocked valleys | With them | Below 500 m |
|---|---|---|---|
| 160,000 | 0.16 % | 0.19 % | 87 % |
| 640,000 | 0.37 % | 0.42 % | 86 % |
| 2,500,000 | 0.68 % | 0.75 % | 84 % |

On this world the lakes do not shrink with detail, and blocked valleys add about a tenth (0.06 % of land at 2.5M).

`v2/tools/probe-lake-fine.mjs` opens 60 windows on the 2.5M world's lakes at zooms 6, 8 and 9, with and without the
fine detail. Before the flat beds the detail kept 95–97 % of the lowland lakes' pixels and 98–100 % of the higher ones.
So the zoom was a small loss, not the cause of the vanishing lakes.

The owner's seed `kw90o25briyrb5smb3i9rb` at Detail 2,560,000 in the browser, after these changes (each step's
terrain, then the world's; the picture's lake pixels as a share of land, and their ground by height):

| Step | Lakes | Ground <0.5 / 0.5–1.5 / 1.5–3 / >3 km |
|---|---|---|
| 40,000 | 0.16 % | 87 / 9 / 4 / 0 % |
| 160,000 | 0.25 % | 83 / 17 / 0 / 0 % |
| 320,000 | 0.57 % | 80 / 19 / 1 / 0 % |
| 640,000 | 1.77 % | 95 / 5 / 0 / 0 % |
| 1,280,000 | 0.63 % | 76 / 22 / 2 / 0 % |
| World 2,560,000, terrain | 1.08 % | 84 / 14 / 2 / 0 % |
| World 2,560,000, final | 1.08 % | 84 / 14 / 2 / 0 % |

The land itself is 59 / 30 / 7 / 4 %, so the lakes sit lower than the land. The final pass keeps every lake, and the
world's 1,252 fresh lakes are glacial 0.81 %, tectonic 0.14 % and blocked valleys 0.12 % of land. The steps still
swing: at 640,000 one big lowland basin holds water that is cut through at 1,280,000. A step's hollows differ from the
next one's, and one large basin's fate shifts the share by a percent of land.
