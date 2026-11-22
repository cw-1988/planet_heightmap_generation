# The terrain look on the picture's workers

The terrain look (rock where steep, greener and barer slopes and valleys in dry country, the flow texture, the mountains'
texture and the riverside green) is drawn over the finished picture's climate colours. It used to run whole on the
finish's thread after the picture's bands were joined: 4.4 s of the 7.1 s picture at 2.5M cells.

It now lives in `v2/js/finish/terrain-look.js`, split where the picture is read whole and where it is not:

- `lookSetup` (the finish's thread): the heights at the climate's pixels, the land mask, the land's surroundings' mean
  and spread (`boxStats`, a box filter over the whole picture), the rivers' ribbons as segments (`riverSegments`: the
  smoothing and the meander noise, done once) and the lakes' pixels.
- `lookRows` (per band of rows): the riverside (`riparian`: the segments stamped and the lake fringes, clipped to the
  band's rows) and every pixel's tints. A pixel reads only its own band's colours and the whole-picture arrays from the
  setup; the riverside is the most of what covers a pixel, so the order of stamping does not matter.
- `terrainLook` is setup plus all rows at once: the path below 1024 px, with the same pixels.

`v2/js/finish/raster-workers.js` runs the rows as a second round on the same workers that drew the picture's bands,
before they stop (`lookOnWorkers`): each worker gets the setup's arrays once (`lookShare`, and lets go of its mesh copy),
then bands of rows with their own slices handed over; the sat views come back and are written into place.
`finish-raster.js` `rasterFinish` takes the look as a function, so the picture is a promise only on that path.

The small lakes (`pondRaster`) still run on the finish's thread before the look (0.7 s).

## Measured

2.5M cells, seed of `v2/out/hash-finish.mjs`: picture 7.1 s → 5.0 s. All 126 hashed arrays are the same (2.5M on
workers; 250K on the finish's thread).
