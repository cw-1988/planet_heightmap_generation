# The world cache

Evolution keeps the worlds it builds in this browser, so a reload or the next session opens the same world in seconds
instead of simulating its history and detailing its moment again. Generate keeps its finished worlds too ([Generate](#generate)). The history and the detail are built again only when
the world's settings or the code that makes them change; after a code change the old world still opens, and the build button offers
**Build new version**. Back to [evolution.md](evolution.md).

## What is kept, and when

- **What:** the world's planet file (the same `.orogen` that Save planet writes, `v2/js/save/planet-file.js`), as a
  Blob in IndexedDB (`orogen-worlds`, store `worlds`), with the history and the one detailed moment if there is one.
- **When:** in the background, once the history is done (or an Extend history has stopped), and again after Add
  detail's last pass. Only worlds built on this page, or opened from the cache, are kept. A planet file the user opens is
  not kept.
- **How many:** the three most recently used worlds. When the browser runs short of room, the oldest goes first. The
  page asks for persistent storage (`navigator.storage.persist()`), so the browser does not clear the store on its own.

## How a world is found

- **The key:** seed, continent, length, ending, plate cells and how far the history was kept going (`more`). These are
  the settings the history is made from. Temperature, Precipitation, Lakes, Small lakes and Terrain detail are not in
  the key: they only change the detail or the drawing.
- **Build** (page load, Build this world, New world) looks the key up first. On a hit it opens the kept world with the
  page's own settings as they stand. A detail made with other climate settings is marked stale on the card ("Add
  detail again with the new climate"), as with any detailed moment.

## When it is built again (code fingerprints)

`v2/js/save/world-cache.js` reads the code a world depends on and fingerprints it, once per page:

- **History:** every module reachable from `app/history-runner.js` (which starts the history worker),
  `terrain-scenes.js`, `ending.js`, `sim-mesh.js`, `seed.js` and `planet-file.js`. About 84 files.
- **Finish:** every module reachable from `finish/finish-worker.js` and `planet-file.js`. About 129 files.

The walk follows every quoted relative `.js`/`.json` path in each file. That covers imports and the workers and data
loaded by `new URL('./x.js', import.meta.url)`; bare specifiers such as `delaunator` are skipped. Each file is fetched
with `cache: 'no-cache'`, so an edited file counts at once.

- **The history fingerprint differs:** the kept world still opens, and is not kept again (it keeps its old stamp). Each
  record stores the code it was made by (both fingerprints, the fast mode and when it was kept), so the page knows it is
  an earlier version: **Build this world** reads **Build new version** (its tooltip gives the date it was kept), and the
  card says the world was built by an earlier version of the code. That button builds it with today's code, skipping
  the cache, and the new build takes the old one's place. Change a setting that is in the key and the button reads
  Build this world again.
- **Only the finish fingerprint differs, or the fast mode (`?fast=`):** the detailed moment opens too, as an earlier
  history does. The card says when and that an earlier finish made it, and **Add detail again with today's finish**
  makes it again; that detail is kept. Kept again with its history (after Extend history), the old moment keeps its own
  stamp (`keepWorld`'s `finishCode`), so it is never passed off as today's.
  - Until 2026-11-22 the moment was left out. The owner: "why doesnt the 10m world not get its generation from
    indexeddb?". The finish fingerprint covers ~129 files, and 17 finish commits landed that day alone, most of them
    speed-ups with the same output hashes. Every one threw a 10M moment (about 3 minutes to build) away.
  - A moment the file format cannot read any more is still left out by the planet file's own versions
    (`save/migrations.js` `FINISH_VERSION`), with its note.

A fingerprint is on the code's text, so a change to a comment also counts as a new version. That costs one offer of
a rebuild, never a wrong world passed off as today's.

- **A store gone missing:** a database `orogen-worlds` without its `worlds` store (opened bare, say from the console,
  which makes an empty version 1) is opened a version up and the store made, instead of every lookup failing.

## Switches and limits

- `?cache=0` turns the cache off for that page load: no lookups, nothing kept.
- A kept world that will not open (a damaged record, a file the page refuses) is built instead.
- Opened from the cache, the world counts as opened: Extend history runs the history again out of sight first, as for
  a planet file.
- Size: the planet file compressed. That is tens of MB for a history, plus the detail: about 0.1 GB at 2.5M and a few
  hundred MB at 10M. Keeping it means writing the whole file again after each Add detail (a few seconds at 10M, in the
  background).
- **Opening without stalls.** A big kept world (10M cells: hundreds of MB) is read and drawn without holding up the
  page. The ZIP's checksums are read 8 bytes at a time and the read pauses every 8 ms. The work the first picture needs
  on the page's own thread (the raster with its lakes, the shore and beach distances, the rivers' valley lines and
  segments) is done a slice at a time between frames. It runs as generators in `v2/js/core/steps.js`: run straight
  through, the same generator is the plain function, so the result is the same either way. The picture without its
  rivers shows first, and the zoomed-in tiles wait for the rivers' lines; every tile shares one making of them. Opening
  the kept 10M test world now blocks the page for about 0.8 s in all, in pieces of at most ~0.15 s. Before, it was about
  8 s, with single freezes of up to 2 s.
- Data fetched at run time from a path built in code (not a quoted relative path) is outside the fingerprint. The
  history and finish workers load none today.

## Generate

Generate keeps its finished worlds the same way, in its own database (`orogen-generate-worlds`), so its worlds and
Evolution's never push each other out. `js/world-keep.js`; the store itself (`keptStore`: the newest three, the oldest
let go when the browser runs short) and the fingerprint walk (`codePrint`) are `world-cache.js`'s.

- **What:** the present-day world (its mesh, heights, shading, plates, the past's story, the Inspect layers and the
  finish's job) and its finished layers (the picture, rivers, drainage, climate, stats), as one ZIP of the planet file's
  codec (`tree-codec.js`, `zip-io.js`), not a `.orogen`. The screen's own caches (drawn paths, grids) are left out.
  About 40 MB at 180K regions.
- **When:** once a world's finish ends without a problem and its states are worked out (never beside them: the two at
  once on a world of a million cells or more held the page's memory high enough to take a tab down), for a world built
  from its planet code (New world, Load, a link, a reload) whose ground and sculpting sliders are still as it was built. A world edited since
  (Ctrl-click → Rebuild, the brush, Reapply) is not kept; its planet code is, and a reload builds it once and keeps it.
- **Saved by a worker** (`js/world-keep-worker.js`): the page encodes the trees (the arrays referenced, not copied) and
  hands the worker their bytes 8 MB at a time, a copy of each slice handed over, so the world is never copied whole; the
  worker deflates them, checks their CRC and puts the ZIP in IndexedDB. One world at a time. Deflate and CRC are most of
  a save (about 6 s for a 1.4M-cell world, 149 MB kept), and the page stays free meanwhile.
- **What is saved, not worked out again:** everything kept opens faster than it is made (about 5 ms per raw MB to read
  back, against seconds to paint). The rasters are all needed at open anyway: the states read the farming rasters (the
  crops too, for the people) and the deposits, and the Satellite picture is painted ahead from its rasters as soon as the
  world shows. Only the mesh's neighbours could be rebuilt, and rebuilding them costs far more than reading them.
- **The key:** the planet code (every slider, the climate's too, and the edits and paint), the fast mode, and whether
  this is a phone (whose finish draws a narrower picture). A climate slider changed and finished is kept under its new
  code.
- **Found:** every build from a planet code looks it up first; on a hit the world opens finished, the build and its
  finish skipped (about 0.8 s at 180K instead of ~18 s).
- **Code fingerprint:** every module reachable from `planet-worker.js`, `finish-landing.js`, `finish/finish-worker.js`,
  `evolution/finish-view.js` and `evolution/detail-view.js` (about 160 files). A world kept by other code is built again, and the new one takes
  its place: no "earlier version" offer, as a build takes seconds here. The states, cities and roads are not kept (they
  are worked out again on each open, in a few seconds) and none of their code is in the fingerprint, so a change to them
  never throws a kept world away.
- **Opened from the cache, no worker holds it** (as after a cancelled build): whatever needs the worker (Reapply, the
  brush, Ctrl-click → Rebuild, a climate slider) builds the world again first, then does it.
- **Its zoomed-in tiles are kept with it:** a kept world is given an id (`fin.keptId`), and the tiles drawn for it go to
  a shared database under that id, so a reload shows the zoomed view without drawing it again
  ([tile-disk.md](tile-disk.md#kept-worlds)). The fingerprint therefore covers `evolution/detail-view.js` too.
- `?cache=0` turns it off here too (no world kept, so no id: the tiles are per page again).
