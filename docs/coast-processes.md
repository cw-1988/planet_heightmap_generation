# The sea's work on the coast: waves, tides, sand

Asked for by the owner, 2026-11-20: "the shoreline is entirely missing. is that scientific or an oversight?", then "there
is no ocean wave erosion etc..." and "no tidal erosion as well". Code: `v2/js/finish/finish-coast.js` (the drivers, on
the mesh) and `v2/js/finish/littoral.js` (the forms and colours, per pixel). Back to
[world-map-detail.md](world-map-detail.md).

## The cause

- An oversight, not science. The finish had rivers, ice and wind, but nothing the sea does to land.
- Every coast was the 0 m contour of eroded land, with the same tan or green at the waterline whatever its exposure.
- No cliffs or wave-cut platforms, no beaches or dunes, no tidal flats or marsh, no surf.
- The old `paintBeach` in shore-ramp.js was a flat sand tint by height. It is gone.

## The drivers (finish-coast.js, a 'coast' stage after 'sea')

- **Waves.** Each coast's open water upwind, along 16 bearings in steps of 12 km out to 3,000 km (the fetch), on a ¼° grid.
  - A storm's wind is 9 m/s plus 1.3 × the season's mean wind, at most 26 m/s.
  - Each bearing gets 30% storm wind from any side; the rest follows the prevailing wind's onshore share.
  - Height is fetch-limited (a JONSWAP-like law), plus up to 1.6 m of ocean swell from an open fetch of 300–3,000 km.
  - Sea ice damps it: none below −14 °C mean, all above −2 °C.
  - Stored as exposure, 0–1, for a storm height of 0.5–4 m.
- **Tide.**
  - 0.6 m on a narrow shelf, plus 3.2 m on a wide one (shelf out to 200 m depth, measured 40–400 km wide).
  - A bay funnels it: up to ×1.6 by the share of bearings closed within 200 km.
  - The tide's own pattern (amphidromes): a seeded factor of 0.55–1.35 varying over ~2,500 km.
  - An enclosed sea (no bearing open past 300–2,000 km) keeps 15%.
  - The range is capped at 12 m.
- **Sand.**
  - Soft rock gives 0.45 of its share (the hardness the erosion used).
  - Each river mouth's load the delta did not keep is spread 150 km along the shore.
- **Winter, mud and wave direction.**
  - `winter`: the coldest month at sea level.
  - `muddy`: the rivers' mud in the water.
  - `waveE` and `waveN`: the waves' mean travel direction.
  - The first two feed the warm coasts, the last the drift.
- The fields reach 3 cells each side of the coast and go into the drivers' picture as `wave`, `tide`, `sand`, `winter`,
  `muddy`, `waveE` and `waveN` (finish-drivers.js).
- **On the mesh.**
  - A sandy coast's shoreface is eased (60%) toward Dean's equilibrium, depth = 0.1·x^⅔ m, within 24 km.
  - A macrotidal, calm coast's land is held just above the sea as flats and marsh, each by the share of the cell its band
    covers (flats 0.35 km a metre of tide out, marsh 0.12 km in: `flatShare`). Raising whole cells up to a hop out made
    50–100 km of water a few metres deep on a coarse mesh: [satellite-sea.md](satellite-sea.md).
  - The sign of every height is kept, so the sea stays the sea.

## The forms (littoral.js `shapeLittoral`, in each fine window)

- Each coast pixel's kind, from waves, tide, sand, slope, ruggedness and rock hardness (`coastClasses`):
  - **mud**: a tide of 2–5 m in calm water;
  - **cliff**: exposed and steep or rugged, on hard rock with little sand;
  - **beach**: the rest that has sand, more on an exposed coast.
- **Cliff.** The land is cut back up to 0.45 km. The cut ground becomes a wave-cut platform just below the sea, about
  0.35 km wide, with a 50 m face.
- **Beach.** A berm 60–240 m wide by exposure, eased smoothly into the land (no dune ridge: it shaded as a line), and the
  shoreface on Dean's profile within 3 km.
- **Mud.** Tidal flats out to 0.35 km per metre of tide, and salt marsh in, 0.12 km per metre.
  - Fixed 2026-11-20: `LITTORAL.tideMaxM` had slipped into a comment, so every tide read NaN and no coast was mud.
- The forms show in the heights once a pixel is smaller than them. The window re-chamfers its coast after the cut.

## More forms, each in its own file

- [coral-reefs-mangroves.md](coral-reefs-mangroves.md): warm coasts, with fringing reefs in clear water and mangroves on
  calm, muddy shores.
- [raised-shorelines.md](raised-shorelines.md): sea-level history, with rias up drowned valleys and marine terraces where
  the land rises.
- [spits-barriers.md](spits-barriers.md): the longshore drift's direction, with spits off headlands and barrier islands
  off low sandy coasts.

## The colours (`paintLittoral`, finish-view.js and climate-view.js)

- Six bytes per pixel (`LIT_N`): sand, mud or marsh, rock, surf, reef, mangrove.
- **True size, no drawn line.** Each band is the share of the pixel it really covers (`band`: a trapezoid integrated over
  the pixel), its inner edge eased over 45% of its width. No surf or foam is drawn
  ([beach-transition.md](beach-transition.md)).
- **The shore to a fraction of a pixel** (`shoreDistance`): within two pixels of the coast, the distance is the heights'
  0 m contour by their slope, |h| / |∇h|, held inside the chamfer's own error. The bands follow the coast's curve, not
  the pixel staircase.
- The world picture reads the drivers bilinearly, so a coast's kind does not change in blocks.
- The colours come from the palette shown: [shore-colours.md](shore-colours.md).
- **Round 1 was ugly** (the owner, 2026-11-20: "the yellow line is ABYSMAL"):
  - every band was held at least 1.2 pixels wide, so from far out each coast got an opaque beige-white stroke;
  - the marsh's and the cliff's bands drew a dark rim inside that stroke.
- Drawn on the world picture (`worldLittoral`, from the drivers) and on every tile.
- Shown on Terrain (blue-sea palettes only; Grey and Heightmap stay data) and on Satellite (`paint.shoreline`).
- Land is tinted under a luma gate, so snow and ice keep their colour. In the water, the flats and sandy bed show through.
- The shallow sea bed is sand-coloured, not the land's green; rivers are clipped to the tile's own land
  (river-draw.js `drawOnLand`). Round 2 (the owner, 2026-11-20: "wtf is this?") showed a green halo out to sea and
  rivers running on into it.
- The fine detail's waves may move the coast by at most 0.3 km × the slope (fine-ladder.js `COAST_GIVE_KM`), so the
  coastline's shape comes from the headlands and coves alone.
  - `v2/tools/probe-coast-fine.mjs`, rerun 2026-11-20 with today's working tree:

    | Pixel | Land → sea | Sea → land | Net |
    |---|---|---|---|
    | 305 m | 0.3% | 43.4% | −20.6% of the area |
    | 76 m | 3.3% | 25.0% | −14.1% |
    | 19 m | 20.3% | 15.5% | −11.9% |

    - The earlier 0.0% net no longer holds. Switching the sea-level history off barely changes these numbers, so the
      trade comes from elsewhere, and its cause is not yet found.

- The beach's width, opacity and side of the shore are sliders, and cold beaches are gravel:
  [beach-look.md](beach-look.md).

## Limits and what is not in yet

- The sand's supply is still spread along the shore, not moved by the drift. The drift's direction only shapes the forms
  (spits, barriers).
- No tombolos, barrier reefs or atolls (the topic files list their own limits).
- The fetch ignores islands smaller than the ¼° grid.
- Moments saved before this have no `wave` driver and draw no littoral (`worldLittoral` returns null).
