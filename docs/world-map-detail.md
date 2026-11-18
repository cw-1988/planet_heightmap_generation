# World map detail (fork addition)

The world map (the globe and the flat map on Generate) now zooms as deep as an opened region and draws the same kind of
ground: a grain on the hills and mountains, fractal coasts with coves, spits and islets, and rivers that meander in
valleys of their own.

## How deep

| | Before | Now |
|---|---|---|
| Finest tile level (desktop / touch) | 9 / 8 | 14 / 12 |
| Finest pixel | about 300 m | 9.5 m |
| Globe camera, lowest | 1.4 radii from the centre (about 2.4 km a pixel) | 6.4 km above the ground |
| Map zoom, most | 20 | 4096 |

- `v2/js/view/planet-view.js`: `maxLevel`.
- `v2/js/app/globe-view.js`: `MAP_ZOOM_MAX` and `MIN_ALT`.
- The globe's zoom eases on the camera's height above the ground, not its distance from the centre. Near the ground,
  the near plane follows the height (`fitNear`), and the drag slows to match.
- The tile shader's precision holds at level 14: about a quarter pixel. The slot table holds columns mod 65536 and rows
  up to 32767.

## The ground

`v2/js/finish/fine-ladder.js` adds an opened region's waves (`detailWaves` in `v2/js/region/region-relief.js`) to every
world tile.

- The ladder starts at 2.5 picture pixels, as a region's does.
- Each octave is weighted by how much of it the tile's pixels can hold (`fadeFor` in `v2/js/finish/pixel-fade.js`). A
  coarse tile and a fine tile of the same place therefore agree, and zooming in keeps finding more.
- The waves are plain fractal noise: no warp, no ridged waves, no patchy roughness (`detailWaves` options
  `{fineWarp: 0, rolling: true, broadTo: 0}`). Each octave is a little gentler than the one above it (`LADDER.fall`).
- Every pixel gets the same share of the region's slope for its kind of ground (`LADDER.share`), not the picture's slope
  at that pixel. The grain is as strong on a crest as on a flank.
- The waves are read on the sphere, so neighbouring tiles match.
- Near the coast, the waves may push land below the sea and raise the shallow sea floor above it.
- Inland, a lowering is held above the sea by a soft cap, so plains get no pits of new sea.
- The deep sea floor gets none.

`detailOf` (region-relief.js) eases the sea floor's detail into the land's over the first 60 m of height. Before this,
it jumped at height 0, which a region hides because its coast lies there. Once the ladder moved the coast, the jump
showed out at sea as a 2.8 m step along a straight line. This change also applies to regions.

### What went wrong before (2026-11-18)

- **Swirls and worms**: the finer octaves sat under the broad warp, and the ladder grew steeper at finer scales, so the
  finest octaves led the shading.
- **Blurred patches**: the grain was scaled by the picture's slope at each pixel. That slope is zero on crests, summits
  and valley floors, so those went smooth beside textured flanks.
- **Zigzags**: a noise frequency that varies from place to place, multiplied by an absolute position about 6,371 km from
  the centre, turns the smallest change of that frequency into thousands of waves. Every noise here uses fixed
  frequencies; only its amount varies.

## Rivers

`v2/js/finish/river-meander.js` bends each river's smoothed line (`riverParts` in river-valleys.js) to either side.

- The bend is a sum of waves from 16 km down to what the river's width allows (`MEANDER.smallestK · √q`). Each wave
  swings by `MEANDER.share` of its length and fades in with the same `fadeFor` as the ground.
- Its phase is the distance along the river, so it runs on continuously whatever the flow does. A shared point gets the
  same normal from both segments, so the bent line has no gaps at its joints.
- The page's drawn line (`v2/js/evolution/river-draw.js`, `bendSegment`) and the valley cut under it
  (`carveValleys`, `meanderAt`) bend by the same waves, so the river stays on its valley floor.
- The valleys have gentle sides: `VALLEY.side` is 0.04 (about 2.3°). At 0.2, every river sat in a trench with a hard rim
  up close. The wall rises from the bank at once and eases into the land at its rim.
- Width: a river's channel is `channelKm(q)` = 0.006 · √q km, at most 3 km (40 m³/s ≈ 40 m, 1,000 ≈ 190 m). The valley
  floor is that channel. The page draws a constant hairline (2 screen px × the strength's width) and, where the channel
  is wider on screen, the channel itself, in ⅛-octave steps. Before, the line grew with zoom while the floor stayed
  ~2.5 km wide, so the line never matched its bed.
- Only drawn rivers are cut: `riverLines(R, riverQ, r)` takes the page's density (`PlanetView.riversDrawn`, Infinity
  with water off or on other layers). Before, every reach was carved, so valleys showed with no river in them.
- Level across: each line point carries the picture's height under it. Ground below that height is raised toward it by
  a bell 1.2 reaches wide about the line, gone by 2.5 reaches. A cut a set depth into a cross slope left the line on a
  shelf, with a wall uphill and the ground falling away below. Raised flat to the valley's edge (the first fix), it made
  a flat bed with a rim that fell about 4× the picture's slope.
- The bed: `bedKm(q)` is `BED` (2) channels wide, the floor and the foot of its banks. The finer detail is eased flat
  across it, back to half at its edge. Up close the page draws the river as wide as its bed, as solid as its
  strongest line, so water fills it. Eased across the wall, the bare smooth band was 5–7× the drawn line; drawn at the
  channel alone, a bare band still showed either side of the line.
- At a bend: the height the ground is raised to is blended over all the segments by their weights. Taken from the
  heaviest segment alone, it stepped a few metres where two tied, which drew a fan of dark streaks inside every bend.
- Head and tail: where a drawn line truly begins (a source, or where the flow rises past `riverQ`, not a confluence a
  drawn river ends at, nor the map's edge) or ends undrawn, the valley tapers in over one reach. Before, it ran on past
  the line's start as a rounded cap.
- Dashed rivers set `lineDashOffset` from the distance along the unbent line per stroke, so the dashes can shift
  slightly where two tiles meet.

## Coast distance past the tile's margin

`v2/js/finish/coast-distance.js` holds the chamfer distance to the coast, moved out of fine-detail.js.

- The coast's detail reaches 6.6 km, but a tile's own distance is only exact out to its margin. At level 14 that margin
  is about 0.6 km, so two neighbouring tiles disagreed about the sea at their seam.
- Past the margin, `coastReach` reads the distance from the picture's sea on a coarse grid fixed to the world.
- Across ½T to T (T is what the margin can tell at that latitude), the window's distance is eased into the coarse one,
  with no step.
- The result depends on the place alone.

## Checked

Checked at level 14 over an archipelago coast, on the globe and the map:

- Seams: 65 tiles, 98,800 shared seam pixels, with no sea or height mismatch.
- Sea floor: over 1.8 M sea pixels, none with a crease over 2 m (there were 1,340 before the `detailOf` fix).
- Speed: a level-14 tile takes about 0.4–0.6 s in a worker, with the ladder about 150–190 ms of it. A view of 110
  tiles fills in under 9 s.

Rivers, checked in Node on a synthetic river (2026-11-18):

- Bent line: no gap at any joint. It swings at most about 4 km at every level from 8 to 14. Its steps are 2–3 px with
  corners of at most 20°, apart from one step of 8 px at level 14.
- Valley: at levels 10 to 14 the drawn line lies at 97–100% of the floor's depth. The steepest side is 0.024–0.057,
  against about 0.3 before. A 320 × 320 window carves in at most 90 ms.
- Across a picture sloping 1.5% across the river, 1,000 m³/s (2026-11-18, second round): at levels 10–14 the ground under
  the line is at most 1.7–2.3 m above the valley's lowest, both sides 2.5 km out stand 36–44 m above the floor, and
  the floor within 1 m of its lowest is 270–310 m wide for a 190 m channel. Before: the lowest ground lay 4 km off the
  line and the floor was 0.8–2.4 km wide. At level 8 the valley is mostly faded out, so the picture's slope still wins.
- Head: no change upstream of a line's start (0 m at 1, 3 and 6 km), −14 to −16 m 1 km downstream, full depth by 3 km.
  At a confluence the trunk is not tapered. Nothing is cut with rivers off (`riverQ` Infinity). A 1,400² window at level 14
  carves in 3.8 s; a tile's ~300² in about 0.2 s.
- Bed and sides (2026-11-18, third round), at levels 10 and 14 on pictures sloping 1.5% and 5% across the river:
  - The grain-free band is 150–160 m for an 85 m channel and 460–510 m for a 270 m channel (about 1.9×). Before, it was
    0.5–1.6 km, 5–7× the line.
  - The downhill rim (11–14 m high for 200 m³/s, 48–77 m for 2,000) falls back at most 2.1% on the 1.5% slope and 7.1%
    on the 5% slope. Before, 5.9% and 19.6%.
  - The uphill wall is at most 4.8% and 11.1%. The line lies 0–4.2 m above the floor's lowest point within 1 km.
  - Fourth round: the bed is drawn and smoothed 2 channels wide. At level 14 the grain is under half across 172 m for a
    170 m drawn bed, and 534 m for a 537 m one. At level 10, which is 153 m a pixel, it is a pixel or so narrower. At a bend (a river swinging ±3 km, level 14), pixels
    whose slope kinks by over 0.5 m in one 9.5 m pixel went from 6,633 to 0 on the 1.5% slope. On the 5% slope they
    went from 8,736 to 343, and the worst kink from 27 m to 0.6 m.
  - A 1,400² window at level 14 carves in 5.5 s (3.8 s before: the levelling reaches 2.5 valley reaches, not 1.6); no
    non-finite values.

## Limits

- No erosion on world tiles: each 256-pixel tile would erode on its own and show at the seams. The only valleys are
  the rivers' own, cut along their lines.
- When the camera is below the cloud shells (1.0015 and 1.004 radii) and the air (1.03), they are culled.
- The globe is a 128 × 64 sphere: its facets sag up to about 1.9 km below the true surface. The lowest camera height
  (6.4 km) is measured from the true surface, so over a facet's middle the camera is that much higher.
