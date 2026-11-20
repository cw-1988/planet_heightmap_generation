# The view strip's options, remembered

Asked for by the owner, 2026-11-20: Clouds turned off came back on at every reload. Code: `v2/js/view/view-memory.js`,
called from `PlanetView.wire()` (`v2/js/view/planet-view.js`). Back to [shared.md](shared.md).

## What is kept

One set in `localStorage` `orogen.view`, the same on Generate, Import and Evolution (the strip is theirs alike): Globe or
Map, the map's centre, Auto-rotate, Grid lines and the grid spacing, Hillshade, Clouds, Rivers & lakes, By regime and
the rivers' density. Saved on each change; restored before the page wires the strip, onto the controls and the view
both, so the first picture already shows them. A remembered Map is shown once the strip is wired.

Kept under their own keys, from before: the palette (per page, `paletteKey`), the projection (`orogen.projection`),
Stars (`js/stage.js`), the strip's fold (`orogen.view-strip-open`).

## A new control

It goes in `OPTIONS` (its id, the view's field it drives, its kind), or it is forgotten on reload. A stored value that no
longer fits (an option gone, a range changed) is skipped, so the control keeps its default.
