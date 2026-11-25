# Rebuild and Cancel mid-build

On Generate, the side panel stays live while a world is built. Asked for by the owner, 2026-11-20: change Progressive
generation or any slider while the build runs, then Rebuild to start over with them. Cancel asked for on 2026-11-23: the button stops the build.
Code: `js/main.js` (`generate`, `asked`, `undo`, `cancelBuild`, `rebuildShown`, the panel's input listener). Back to [generate.md](generate.md).

## How it works

- **Every control live:** the build overlay holds nothing (owner, 2026-11-23: [view-memory.md](view-memory.md)); the
  panel, the layer bar, the Terrain tab's edit row and the phone's buttons all take clicks mid-build.
- **The view strip live, on every page:** its options are only drawing, never a job: [view-memory.md](view-memory.md).
- **The button:** while building it reads Cancel build (class `cancel`, a secondary button). Any change in the panel
  (not the planet code field) makes it Rebuild (class `restart`). A Ctrl-click Rebuild still reads Building… and does
  nothing.
- **Cancel build:** the planet worker is terminated and a fresh one started, as for Rebuild. The build's place in the
  memory budget is let go (`buildEnded`), the overlay and the progress card go, and the page is as it was: the world
  shown before (or none, on the first build), its edits given back (the pieces' characters, the brush strokes and cuts,
  kept in `undo` when the build began) and its link. The panel stays as it is now: a change there waits for Build, as
  before the build.
- **A world the worker let go:** a new build empties the worker's world when it begins, so after a cancelled (or
  failed) build the world shown is `detached`. What needs the worker again (Reapply, a brush stroke, the Ctrl-click
  Rebuild, a climate slider, Try again) builds that world again instead (`rebuildShown`): the same seed and edits, the
  panel as it is now. A world cancelled before its finish was done says so on the chip, with Try again.
- **The link:** it names the world on its way from the moment its build begins, so a reload mid-build (after Load, say)
  builds that world again, not the one before. Cancel puts back the shown world's link.
- **Rebuild:** the planet worker is terminated and a fresh one started. That also stops the worker's own mesh workers.
  The steps' water (`rung-view.js`) stops, and the same build is asked for again: the same seed and edits, the panel's
  settings as they are now. The page picks a new world's seed itself (`SEED_MAX`), so a restart builds the same world.
- **Load a planet code mid-build:** it cancels the build under way in the same way and builds the code's world.
- **Climate sliders mid-build** (Temperature, Precipitation, Lakes): they don't re-finish the old world. The world on
  its way reads them when its finish starts.

## What it costs

A restart throws away the meshes the worker had already built, so the new build makes them again. Reapply, the
Ctrl-click Rebuild and brush strokes run only when no build is under way, as before. A build started while one of those
is running (Load, Build new world after Reapply) terminates the worker too, so its result never lands over the new world.
