# Spits and barrier islands

Asked for by the owner, 2026-11-20 ("now do those", on the missing list in [coast-processes.md](coast-processes.md)).
Code: `v2/js/finish/coast-drift.js` (`driftForms`), called from `littoral.js` `shapeLittoral` after the coast's kinds
and before the shore is measured again. The drivers `waveE` and `waveN` come from `finish-coast.js`.

**Switched off** (`DRIFT.on: false`), the owner, 2026-11-20: "what are those other shorter noodles? please remove them".
The hillshade drew each spit and barrier ridge as a short dark streak along the coast. The code is kept, so they can be
turned back on once they read as sand, not lines.

## The drift's direction (the drivers)

- For each coast cell, every bearing's storm energy (Hb²) and swell (3 × its height²) add to a vector along the way the
  waves travel.
- The mean direction, as a share of all the energy (0 … 1), is stored east and north in bytes centred on 128.
- Consistent waves give a long vector; waves from every side cancel to nearly none.
- Longshore drift is about the energy × sin 2θ, θ being the waves' angle to the shore. In each window this is
  2 |v·t| · max(0, v·n) · exposure, with n landward (the picture's slope uphill) and t along the shore.

## Barrier islands

- Where:
  - sand 0.5–0.8;
  - waves 0.2–0.4 or more;
  - a tide under 1.5–3 m (macrotidal coasts have none);
  - gentle ground, under 0.002–0.008 km per km;
  - no tidal mud and no reef;
  - less on an active margin (× (1 − 0.6 active)).
- Only along some stretches of such coasts: a noise over ~60 km must pass 0.1–0.4.
- 0.3–2 km offshore, the distance wandering slowly along the coast (noise over ~25 km). Near 0.3 km it joins the land
  as a barrier beach, with no lagoon.
- 0.3–0.9 km wide; a flat sandy top, its crest 2–4 m, soft shoulders over the outer 35% each side. No troughs.
- Tidal inlets where a second noise (~14 km) passes 0.55–0.65: the island is not built there, so the sea runs through.
- The lagoon behind is filled in toward 2 m deep, eased in from the island's back.
- Built only in water shallower than 8–30 m (all … none).
- Its pixels are coloured as sand (`isle`, the sand byte's floor), and a beach where they stand above the sea.
- **Round 1 was ugly** (the owner, 2026-11-20: "wtf is this?"):
  - the gates let a barrier stand off nearly every sandy coast, a second coastline 0.6 km out;
  - its parabola crest and the troughs at its edges shaded as two thin lines along it;
  - the lagoon showed the land's green (the sea bed was painted green; now sand, finish-view.js `paintSea`).

## Spits

- Where: sand 0.3–0.6, and a drift strength of 0.05–0.25 (none … all); no mud, less on a reef.
- The drift's way is averaged along the shore over 0.5 km (each pixel's way weighted by its strength). Where waves come
  from both ways along a stretch (the mean under 0.4 of the strength), there is no spit.
  - Round 1 read the way pixel by pixel. It flipped with every step of the picture's slope, and the spits came out as
    speckled hatching.
- The drift's shadow: from each sea pixel near the shore, a march straight back up-drift, up to 2.2 km × (0.4 + 0.6
  strength), finds the land that shelters it (or none).
- A pixel is on the spit when, within 0.25 km to one side, a pixel has no land up-drift (the shadow's edge: the line of
  the up-drift land run on).
- There must also be sea on the other side, at up to 1.5 × the spit's width (half the distance to the root, near it).
  So no ridge is laid along the land itself, while the root stays joined to its headland.
- Its profile is a half-sine across 0.25 km with a 2.5 m crest, sinking under water over the last 30% of its length.
- At a bay's mouth this grows a bay-mouth bar; off a headland, a spit hooked by the coast's own curve.

## When it is drawn

- Only in windows whose pixels are 0.5 km or smaller: the forms are a few hundred metres wide.
- Each form reads at most `DRIFT.reachKm` (3.4 km) from a pixel. Such windows get a margin that holds it
  (fine-detail.js `marginPx`, at most 160 px), so tiles side by side build the same forms.
  - Round 1 read past a tile's margin, and the forms stopped in a straight seam at the tile's edge.
  - Past 160 px (pixels under ~21 m), the barrier sits nearer and the spits are shorter, to stay inside the margin.
- Not on the world picture.
- Moments finished before the wave-direction drivers have none.

## Limits

- No tombolos joining an island to the land, no cuspate forelands, no recurved spit tips beyond the coast's own curve.
- The barrier does not move or roll over; it sits where the noise puts it within its band.
- The spit's direction comes from the picture's smooth slope, so in a deep, narrow bay it follows the coast's general
  line rather than the bay's walls.
