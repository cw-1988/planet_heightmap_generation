# Shared memory for the workers: the isolation toggle

A browser hands out `SharedArrayBuffer` only to a cross-origin isolated page, one served with two headers:
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. With it, the picture's
workers ([picture-shares.md](picture-shares.md)) read the mesh and fields the finish holds, instead of a copy each.
GitHub Pages can't send headers, so a service worker adds them. It is on unless turned off (since the fast-mode work,
[fast-mode.md](fast-mode.md); before, it was opt-in).

## Turning it on and off

- On by default on every app page (evolution, generate, import): the page registers `isolate-sw.js` (at the site's
  root, so its scope is the whole site, `/v/` included) and reloads once, the first visit; from then on it is served
  isolated.
- `?isolate=0` turns it off, and this browser remembers it (`localStorage` `orogen.isolate` = `'0'`): the service
  worker is unregistered and the page reloads plain. `?isolate=1` forgets that, on again.
- Loaded by `js/support-check.js` → `js/isolate.js`. The workers check `globalThis.crossOriginIsolated` at runtime
  (`v2/js/core/shared-memory.js`, `SHARED`), so off, nothing changes: same copies, same 4 picture workers.

## Spectre: why it's still a toggle

The headers are not a Spectre exposure; they are the mitigation. Browsers withheld `SharedArrayBuffer` (a precise timer)
after Spectre and give it back only to pages whose process holds nothing of other sites: COOP keeps other sites' windows
out, COEP lets in only what agrees to be embedded. An isolated page is *more* separated, not less.

The toggle is there for what isolation can break:

- a cross-origin resource with neither CORS nor CORP fails to load. Today the only ones are jsDelivr's modules (three,
  delaunator), which send CORS; anything added later (fonts, images, an embed) must too. The service worker marks the
  site's own responses `Cross-Origin-Resource-Policy: cross-origin` and passes opaque responses through as they are;
- a window opened from the page (or opening it) loses its `opener` link;
- a service worker stays registered until it is switched off, so a bad one would stick: `?isolate=0` removes it.

## What it gains

2.5M cells, `v2/out/hash-finish.mjs` (Node runs it with `OROGEN_SHARED=1`; Node has no isolation, so the variable stands
for it):

- picture 5.7 → 4.0 s (finish 47.2 s): no copies sent, and as many picture workers as the pool has (`MAX_WORKERS`), not
  4 — each extra worker costs no memory. The mesh's shared copy is kept from finish to finish (`shared(a, true)`); the
  fields are copied once for all workers, since some are written in place (the look's `C.sat`).
- Memory: peak RSS of the whole run 3.84 → 3.19 GB (−0.66 GB). The peak is the picture, at the finish's end, where
  each unshared worker held its own copy; sampled every 50 ms from a thread of its own (workers are threads of the same
  process). The cost: the mesh's shared copy (~0.1–0.2 GB at 2.5M) stays between finishes.
- The 126 hashed arrays are the same as without it, at 2.5M and 250K.

Checked in the page (local dev server, no headers of its own): `?isolate=1` → `crossOriginIsolated` true, the globe and
the history run, Add detail at 160K finishes with the picture painted, no console errors; `?isolate=0` → unregistered,
not isolated.

## Rivers on workers: measured, not built

With shared memory the rivers' carving could split across workers too. Only part of it can: the priority flood and every
pass in flood order (drainage, the beds' walk up each river, "rivers run downhill", the slope limit) depend on the cells
before them. The passes in cell order (receivers, the history floor, the active hold, the valley share and sides, the
land floor) took 0.21 + 0.18 s in the two 2.5M rounds (flood 0.79 + 0.76 s, flood-order passes 0.50 + 0.45 s). Split
over 8 workers that saves at most ~0.3 s of a ~50 s finish, before copying the fields into shared memory, and only with
the toggle on. Not worth the code.
