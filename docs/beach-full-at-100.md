# The beach in full at 100%: ocean → sand → land

Asked for by the owner, 2026-11-21, with a close-up of a Satellite coast (dark sea, green-teal water, olive land and only
a faint pale thread between): "enable the beach when beach opacity is also 100% and not +100% solid… a simple double
transition... from ocean to sand to land". Code: `v2/js/finish/littoral.js` (`beachFloorPx`, `beachProfile`,
`BEACH_FULL`), `v2/js/view/beach-controls.js`. Back to [beach-look.md](beach-look.md).

## Why 100% showed only a thread (two causes)

1. **No width on screen at ×1.** The least width on screen (`beachFloor`) grew with ½·log2(×), so it was 0 at ×1. The
   true beach, 60–240 m, is under a pixel at every zoom out to about 100 m a pixel, and the profile averages it over the
   pixel: a 2–10% tint. Opacity could not fix that; only the width slider above ×1 did.
2. **Opacity scaled by the coast's sand share.** At 100% the sand was `shareMax` 0.8 × the coast's beach share, often
   15–40%, so even a wide beach was a faint wash. Only the "+100% solid" range made it opaque.

## The fix

- The floor counts from ×1: (1 + log2(×))/3 × (farPx + px × (0.1 km / the screen pixel's km)^0.7). At ×1 that is about
  8 px at 100 m a screen pixel, 3 px at 580 m, 2 px at 2.7 km and 1.5 px from the whole planet; ×4 keeps its 24 · 9 · 5.
  Below ×1 there is none (the true width).
- At 100% a coast's beach is drawn in full once its beach share reaches `BEACH_FULL` 0.3 (smoothstep from 0), so only
  coasts with barely any sand fade out. Opacity is 0 … 100% and scales that; the "+% solid" range is gone. A stored value
  above 100% no longer fits the slider and falls back to 100% (view-memory.js).

## Measured (seed kw90o1bhzofloqo0b0z59b, Generate, rendered canvas across the shore)

- Satellite, 9 km a pixel: sea (4, 12, 36) → (112, 111, 97) → sand (208, 195, 158) → (137, 137, 100) → land (72, 88, 59).
- Satellite, 2.4 km a pixel: sea → (145, 146, 120) → sand (230, 217, 177) → (178, 172, 125) → (133, 133, 80) → land
  (89, 94, 43): about 4 screen pixels of beach.
- Terrain (Relief): a sand line along every coast between the shelf's blue and the green land.
