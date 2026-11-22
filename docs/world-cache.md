# The world cache

Evolution keeps the worlds it builds in this browser, so a reload or the next session opens the same world in seconds
instead of simulating its history and detailing its moment again. The history and the detail are built again only when
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
- **Only the finish fingerprint differs, or the fast mode (`?fast=`):** the history opens from the cache, and the
  detailed moment is left out. The card says the moment was detailed by an earlier finish; Add detail makes it again,
  and that detail is kept.

A fingerprint is on the code's text, so a change to a comment also counts as a new version. That costs one offer of
a rebuild, never a wrong world passed off as today's.

## Switches and limits

- `?cache=0` turns the cache off for that page load: no lookups, nothing kept.
- A kept world that will not open (a damaged record, a file the page refuses) is built instead.
- Opened from the cache, the world counts as opened: Extend history runs the history again out of sight first, as for
  a planet file.
- Size: the planet file compressed. That is tens of MB for a history, plus the detail: about 0.1 GB at 2.5M and a few
  hundred MB at 10M. Keeping it means writing the whole file again after each Add detail (a few seconds at 10M, in the
  background).
- Data fetched at run time from a path built in code (not a quoted relative path) is outside the fingerprint. The
  history and finish workers load none today.
