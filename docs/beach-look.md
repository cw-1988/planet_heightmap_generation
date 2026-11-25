# The beach's look: sliders and cold beaches

Asked for by the owner, 2026-11-20: "give me a slider that broadens the beach and another one that changes its
transparency, and a third that tells if it eats into the land or ocean", and "there probably isn't a beach in colder
regions… how do we adjust for that?". Code: `v2/js/view/beach-controls.js` (the sliders), `v2/js/finish/littoral.js`
(`BEACH_LOOK`, `litAt`, `paintLittoral`).

## Now fixed (2026-11-24)

The owner tuned the sliders by eye and asked for them out of the view strip ("so we dont have those slider because the
clutter up the ui"): the look is fixed in `v2/js/view/look-config.js` at **width ×1, opacity 60 %, side land**
(`beachWidth`, `beachAlpha`, `beachShift`). What each value does is as the sliders below describe.

## The sliders (view strip, beside Hillshade and Clouds; removed 2026-11-24)

- **They act only where a coast has a beach** (its sand and waves). They make that beach more pronounced; they don't
  decide where beaches are. A single "where beaches appear" slider in their place was a misreading, and was undone the
  same day (the owner, 2026-11-20: "I want to make beaches more pronounced so that they eat further into the land").

- **Beach width** ×0.1 … ×5 in steps of 0.1 (the owner, 2026-11-20; it was ×0.25 … ×4 in quarters) (×1 as made: 60 m on a calm coast, up to 240 m on an exposed one): how far the beach eats
  into the land. From ×1 the beach also has a least width that grows as you zoom in (`LITTORAL.beachFloor`):
  (1 + log2(×))/3 × (3 + 21 × (0.1 km / the screen pixel's km)^0.7) screen pixels, so each doubling adds the same step.
  At ×1 about 8 px at 100 m a screen pixel, 3 px at 580 m, 2 px at 2.7 km; at ×4 24, 9 and 5. It is turned into the
  tile's own pixels by the tiles' mean fineness (detail-view.js picks tiles 0.84–1.68 device pixels a pixel, the mean
  1.19, × the device's up to 1.5) and held under 85 tile pixels. The shore's bytes are kept out to the widest beach's
  fade (`beachReachKm`, at the finest tiles, at least 22 pixels: `worldLittoral`, fine-detail.js `lim` and
  `marginPx`). The distance is kept in pixels as its signed square root, so it is fine near the shore and reaches about
  160 px. Close up, the ×4 beach of an exposed coast (960 m) is wider than 22 pixels, and the old cut-off made a hard
  edge in its fade.
- **Round 4, "that ×4 doesn't feel like ×4… it feels like ×1"** (the owner, 2026-11-20):
  - the floor was counted in the tile's own pixels, and the tiles are 1–2.1 of them a screen pixel (at 1.25 dpr), so
    on screen it was a half to a third of its number; only its inner 40% is solid, so at 580 m a screen pixel the ×4
    beach read as 2–3 px against ×1's hairline;
  - it grew with (× − 1), so ×2 had a third of ×4's floor and looked like ×1.
  - Checked on a Relief coast at 506 m: ×1 a hairline, ×2 about 4 px, ×4 about 8 px; at 278 m ×4 about 13 px.
- **Round 5, "the beach too present on the outest zoom"** (the owner, 2026-11-20): not the beach. At ×1 it is a true
  0.02-pixel share there. The sand came from the sea's shore ramp, whose bare sand bed was 2 pixels wide at every zoom:
  [shore-transition.md](shore-transition.md) round 3.
- **Round 3, a fixed pixel floor** (the owner, 2026-11-20: "the further out the less multiplier please… and its actually
  too small in closer zooms"): ×4 was held at 12 px at every zoom, a fat yellow rim around every coast from far out and
  thin close up. The floor now follows the zoom.
- **Round 2, "it appears, then is overwritten"** (the owner, 2026-11-20): nothing overwrote it. A slider move empties
  the zoomed tiles, so the coarse world picture shows for a moment, and there the 1.5-pixel floor was a fat band of
  world pixels. Then the tiles came back with the same 4.5 pixels, a hairline at that zoom. The floor went to 4 px a
  step, and the reach and the tiles' margin with it.
- **Beach opacity** 0 … 100%. At 100% every beach is drawn in full, fading out only where a coast has barely any sand;
  it also covers the sand of a reef's flat and of a barrier island.
- **Round 6, "enable the beach when beach opacity is also 100%"** (the owner, 2026-11-21): the floor now starts at ×1
  and 100% is solid, so the default shows ocean → sand → land: [beach-full-at-100.md](beach-full-at-100.md).
- **Round 1 did nothing** (the owner, 2026-11-20: "why do the sliders … do nothing?"):
  - the width only multiplied the true 60–240 m, a tenth of a pixel on the world picture and of most tiles, so ×4
    stayed invisible;
  - the opacity could only lower an already faint strength;
  - the beach's bytes were kept only within 3 pixels of the shore, so a wider band would have been cut off. Now they are
    kept within 5 pixels (`worldLittoral` and fine-detail.js `lim`).
- **Beach side** sea … land. "land" is as made, the dry beach above the waterline. Towards "sea" the whole profile moves
  out over the water, by half its width at the middle and all of it at "sea".
- The colour only: the heights' berm keeps the width the waves give it.
- [beach-transition.md](beach-transition.md): the beach drawn as one sea → sand → land profile (rounds 3–4),
  with no band, no foam line and no reef crest.
- Remembered with the view strip's other options (view-memory.js).

## How a slider repaints without building tiles again

- The shore colours (`lit`, 10 bytes a pixel) keep the beach's strength, its width (log2 of its pixels) and each
  pixel's distance from the shore (in the larger of the beach's width and a pixel). They no longer keep a finished
  band.
- `paintLittoral` bands the beach as it paints, by `BEACH_LOOK`, at least its zoom's floor wide from ×1 on (below ×1
  the true share of the pixel it covers).
- The sliders go into the look keys of the tiles (planet-view.js `patchLookOf`) and of the world picture
  (finished-painter.js `paintSpec`). So a move repaints them; the fine windows are not rebuilt.

## Cold coasts

- **The science:**
  - Cold coasts do have beaches. The Arctic's sea ice breaks up for 2–4 months a year, and in that time the waves move
    the shore's sediment (Alaska's Beaufort coast has beaches and barrier islands).
  - The ice shortens the season, so the beaches are narrow.
  - They are mostly gravel, not sand: glacial and frost-shattered debris, and little sand ground by long wave action.
  - Ice pushed ashore also piles ridges on them.
- **Already in:**
  - the sea ice takes the waves away (finish-coast.js `iceC`: none where the year's mean is below −14 °C, all above −2 °C);
  - a coast without waves gets only a dim, narrow beach (`coastClasses`: sand × 0.35, width 60 m);
  - the land's tint is gated by brightness, so snow and ice keep their colour.
- **Added:** the beach turns from sand to grey gravel as the winter's sea cools from +2 to −8 °C (`gravelC`, the winter
  driver). The gravel is the palette's own: [shore-colours.md](shore-colours.md).
- **Not in:** ice-push ridges; permafrost bluffs thawed and cut back by the sea (the Laptev and Beaufort coasts retreat
  metres a year); shore-fast ice drawn over the sea in winter.
