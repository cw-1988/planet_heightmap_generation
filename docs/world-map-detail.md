# World map detail (fork addition)

The world map (the globe and the flat map on Generate) now zooms as deep as an opened region and draws the same kind of
ground: rolling hills on the plains, ridges in the mountains, fractal coasts with coves, spits and islets.

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
- Each octave is weighted by how much of it the tile's pixels can hold (fine-detail.js's `fade`). A coarse tile and a
  fine tile of the same place therefore agree, and zooming in keeps finding more.
- The waves are read on the sphere, so neighbouring tiles match.
- Near the coast, the waves may push land below the sea and raise the shallow sea floor above it.
- Inland, a lowering is held above the sea by a soft cap, so plains get no pits of new sea.
- The deep sea floor gets none.

`detailOf` (region-relief.js) eases the sea floor's detail into the land's over the first 60 m of height. Before this,
it jumped at height 0, which a region hides because its coast lies there. Once the ladder moved the coast, the jump
showed out at sea as a 2.8 m step along a straight line. This change also applies to regions.

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

## Limits

- No erosion on world tiles: each 256-pixel tile would erode on its own and show at the seams. Valleys are the
  waves' only.
- When the camera is below the cloud shells (1.0015 and 1.004 radii) and the air (1.03), they are culled.
- The globe is a 128 × 64 sphere: its facets sag up to about 1.9 km below the true surface. The lowest camera height
  (6.4 km) is measured from the true surface, so over a facet's middle the camera is that much higher.
