# The view strip's options, remembered

Asked for by the owner, 2026-11-20: Clouds turned off came back on at every reload. Code: `v2/js/view/view-memory.js`,
called from `PlanetView.wire()` (`v2/js/view/planet-view.js`). Back to [shared.md](shared.md).

## What is kept

One set in `localStorage` `orogen.view`, the same on Generate, Import and Evolution (the strip is theirs alike): Globe or
Map, the map's centre, Auto-rotate, Grid lines and the grid spacing, Hillshade, Clouds, Rivers & lakes, By regime,
the rivers' density (their line width was too, until it was fixed in look-config.js, 2026-11-24). Saved on each change; restored before the page wires the strip, onto the controls and the view
both, so the first picture already shows them. A remembered Map is shown once the strip is wired.

The layer shown, in `localStorage` `orogen.layer` (`v2/js/view/layer-memory.js`; the owner, 2026-11-20: "i also want
selection like the satellite view etc to survive a reload"): the layer, each group's last view (Climate, Geology,
Food), the season, the deposit, the age and its resource. Read when the layer bar is made, before the page's own start
sets a layer and saves over it; restored once the page is wired. A layer or pick the page doesn't offer is skipped.

Kept under their own keys, from before: the palette (per page, `paletteKey`), the projection (`orogen.projection`),
Stars (`js/stage.js`), the strip's fold (`orogen.view-strip-open`).

## Live while a world builds

Asked for by the owner, 2026-11-20 (the strip first, then "select any other tabs like terrain satellite etc while
generating"; then, 2026-11-23, Terrain's Look, Paint and Split "and every other selectable in every ui element").
A build holds none of the page's controls: the view strip, the layer tabs and their pickers, Generate's and Import's
panels, the Terrain tab's edit row (Look, Paint, Split, the character, Size, Undo), the climate chip and the phone's
edit, refresh and Rebuild buttons all take clicks. A layer the build hasn't made yet (Satellite, Climate, Geology, Food
mid-build) shows greyed until the world's finish brings it. What would start a job waits on the page's `building`
instead of being held: a Paint or Split drag says it is ready once the planet is built, Undo, Rebuild and the chip's
Try again do nothing until then, a climate slider changed mid-build is read by the build's own finish, and on Import
a file picked mid-build can be imported once the build ends. On Generate a panel change restarts the build
([mid-build-rebuild.md](mid-build-rebuild.md)).

What is drawn mid-build follows the tab picked: the Detail ladder's step (`js/rung-view.js`), or on Generate's first
build its sketch (kept as `sketch` in `js/main.js`); Generate's and Import's frame loops repaint them with no world
yet too.

## A new control

It goes in `OPTIONS` (its id, the view's field it drives, its kind), or it is forgotten on reload. A stored value that no
longer fits (an option gone, a range changed) is skipped, so the control keeps its default.
