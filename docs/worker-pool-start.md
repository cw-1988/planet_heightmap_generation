# A worker pool that can't start

Generate's first build, the one the page starts on load, failed every time in the Claude app's browser pane with
"terrain worker: a worker stopped". A build started from the button worked. Found 2026-11-22. Back to
[generate-load.md](generate-load.md).

## What happened

The planet worker (`js/planet-worker.js`) makes its terrain pool (`v2/js/terrain/terrain-pool.js`) as it starts: seven
terrain workers, each a module worker that the planet worker starts. The pane's Chromium (Claude 6.28899, Chrome 156)
loads no worker that another worker starts from a script URL. A nested worker from a blob URL loads. A nested worker of a
module with no imports, from a URL, does not. A worker started by the page itself loads.

A worker that can't load its script fires a bare `error` event (an `Event`, no message). The event only arrives once the
thread that made the worker is free. The planet worker was busy for ~9 s building the ladder, so the pool looked whole
until its first job was posted. Then all seven errors arrived together, the pool marked itself broken, and the build
failed. The button's build ran after that, with the broken pool already dropped, so the ground was drawn on one thread
and the build worked.

## The fix

Each pool worker (`terrain-worker.js`, `carve-worker.js`, `shade-worker.js`) posts `{ type: 'ready' }` once its module
has loaded. `spawn` waits for it, and a load error rejects. `TerrainPool.create` rejects if any worker fails and lets go
of the others. The planet worker then logs `[terrain] no worker pool, the ground drawn on this thread` and builds
without a pool from the start. The ground is the same either way (`node v2/tools/check-present-pool.mjs`). In the pane
that costs the pool's speedup, which it never had there.

## Keep it so

- A worker that the code waits on must say it is ready. Never take a worker for started until it has spoken: its load
  failure can arrive seconds late.
- `finish-worker.js` makes a pool with no fallback when it gets no surface. In the pane, such a finish fails at once,
  with "could not start".
