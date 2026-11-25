# Warm coasts: coral reefs and mangroves

Asked for by the owner, 2026-11-20 ("now do those", on the missing list in [coast-processes.md](coast-processes.md)).
Code: `v2/js/finish/littoral.js` (`coastClasses`, `litAt`, `shapeLittoral`, `paintLittoral`); the drivers
`winter` and `muddy` come from `finish-coast.js`.

## The drivers

- **winter**: the coldest month's temperature at sea level, from the climate's months (finish.js `coldG`, read at each
  cell). Stored −10 … 35 °C in a byte (`COAST.winterC`, `LITTORAL.winterC`). It stands in for the winter sea's warmth.
- **muddy**: how much river mud reaches the coast's water, 1 − e^(−supply / mean load) from the river mouths' load
  spread along the shore.

## Where each grows

- **Coral reefs**:
  - the winter sea at 17.5–20.5 °C or warmer (none … all), since reef corals stop near an 18 °C winter;
  - clear water: none where the river mud is 0.1–0.4 (a river mouth's plume kills them);
  - not on tidal mud (×(1 − 0.8 mud)), and half as much where mangroves take the shore.
- **Mangroves**:
  - frost-free, a winter of 16–20 °C at sea level or warmer;
  - sheltered water: none where the waves' exposure is 0.3–0.6;
  - on tidal mud or in muddy water (at least half anyway: fringe mangroves grow on calm sand too);
  - thinner where dry (×0.35 at under ~200 mm of rain a year, full above ~500 mm), none on a cliff.
  - They take the salt marsh's place and most of the beach's (×(1 − 0.8 mangrove)).

## The forms (heights, in each fine window)

- **Reef.** A fringing reef out from the shore, 0.25 km on a calm coast to 0.9 km on an exposed one. Its flat sits about
  2 m down; the outer quarter rises to a crest at about 0.6 m down. Raised only: a reef grows up, never deepens the bed.
  Past the crest the bed falls back to its own depth (the fore-reef).
- **Mangroves.** A forest 0.15 km wide plus 0.25 km per metre of tide, its mud held near the high tide (0.3 m plus
  0.4 × the tide), like the marsh.

## The colours (two more bytes a pixel: `LIT_N` = 6)

- Reef: only its pale flat, the bed's sand (0.6 of the sand share) fading out over the reef's width, the lagoon's
  turquoise from far out. The crest's brown and its surf are no longer drawn: they read as a jagged dark line (the
  owner, 2026-11-20, [beach-transition.md](beach-transition.md)).
- Mangroves: dark green 46·70·40, inland across their width and a fringe standing in the water (0.3 of the width). In
  the water their canopy is drawn over it, not dimmed by it.
- Every reader of the colours moved from 4 to `LIT_N` bytes: fine-detail.js, detail-view.js, worldLittoral.
- **Drawn at least the beach's floor** (`coverKm` in littoral.js: the true width, or `beachFloorPx(pxKm, 1)` pixels if
  wider, about 2–8 screen pixels). At their true 0.3–1 km the mangroves and the reef's flat covered a few per cent of a
  pixel at almost every zoom, so they were not seen anywhere (the owner, 2026-11-22), though a third of the warm coasts
  have them. The heights keep the true width. `node v2/tools/probe-mangroves.mjs` counts the warm coasts, what cuts
  their mangroves, and the pixels that show them on the world picture.
- **Named on hover** (coast-readout.js `coastCoverAt`, a "Coast" line in planet-view.js's readout on Terrain and
  Satellite): their colours sit close to the land's and the sea's (Satellite's rainforest is 25·40·13, a palette's
  mangrove is its own lowland darkened), so the readout says "Mangroves" or "Coral reef" on a shore pixel whose coast
  has at least 0.25 of the kind. The probe counts where it says so.

## Limits

- Only fringing reefs. Barrier reefs out on a shelf's edge and atolls on sunken volcanoes are not built.
- The winter driver is the air at sea level, not the sea's own temperature: a cold current's coast (Peru, Namibia) is
  read a little too warm.
- Moments finished before these drivers have no `winter` and draw no reefs or mangroves.
