# Rebuild mid-build

On Generate, the side panel stays live while a world is built. Asked for by the owner, 2026-11-20: change Progressive
generation, Rivers and lakes in each step, or any slider while the build runs, then Rebuild to start over with them.
Code: `js/main.js` (`generate`, `asked`, the panel's input listener). Back to [generate.md](generate.md).

## How it works

- **The panel live:** the build overlay holds the layer bar and the edit buttons (inert), but not `#ui`
  (`buildOverlay({ keep: ['ui'] })`, `holdControls(on, keep)` in `js/build-error.js`). Import keeps the whole page held.
- **The button:** while building it reads Building… and does nothing. Any change in the panel (not the planet code
  field) makes it Rebuild (class `restart`).
- **Rebuild:** the planet worker is terminated and a fresh one started. That also stops the worker's own mesh workers.
  The steps' water (`rung-view.js`) stops, and the same build is asked for again: the same seed and edits, the panel's
  settings as they are now. The page picks a new world's seed itself (`SEED_MAX`), so a restart builds the same world.
- **Load a planet code mid-build:** it cancels the build under way in the same way and builds the code's world.
- **Climate sliders mid-build** (Temperature, Precipitation, Lakes): they don't re-finish the old world. The world on
  its way reads them when its finish starts.

## What it costs

A restart throws away the meshes the worker had already built, so the new build makes them again. Reapply, the
Ctrl-click Rebuild and brush strokes run only when no build is under way, as before.
