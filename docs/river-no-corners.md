# Rivers turn in curves, never at a corner

Asked by the owner on 2026-11-20, from a screenshot of a river turning about 90° at a point. Back to
[river-shape-laws.md](river-shape-laws.md).

## The law

- **The total turn has no limit.** A meander bend often turns more than 180°: its neck closes, the river cuts through it,
  and the old loop is left as an oxbow lake.
- **The tightness has a limit.** A bend's radius of curvature is rarely under about 2 channel widths. It is most often
  2–3 widths. At that radius the bank erodes fastest, so tighter bends widen.
  - Sources: Leopold & Wolman 1960; Hickin & Nanson 1984.
- **So a river never turns at a point.** Any turn, even 90° or more, is spread over a few channel widths. The meander
  waves already follow this law: the shortest wave is 10.9 widths long, so its tightest radius is about 2.2 widths.

## What was flawed

The corners came from two causes in how a river's line was built, not from the meander waves.

1. **Each reach was smoothed on its own, with its ends pinned.** Chaikin smoothing ran on each reach between
   confluences. It rounded every interior point, but it kept each reach's first and last point. Where the main stem
   passed a confluence, the turn between the planet's cells (90° in the screenshot) stayed as a corner.
2. **Each segment was drawn as a straight chord.** Up close, even the smoothed line's small turns, about 22°, showed as
   kinks.

## The fix

- **Confluences are smoothed like any other point** (`river-valleys.js`, `riverParts` and `joinAt`).
  - The river running on through a confluence is the reach carrying the most water into it, plus the reach out.
  - Each of those two reaches takes the other's next point as a ghost point, so the confluence is smoothed like an
    interior point.
  - Each reach is then cut at the one point both share: `joinAt`, which is 0.75 × the confluence + 0.125 × each neighbour.
  - A smaller tributary ends at that same point, at its own angle, so the confluences stay joined.
- **Each segment is a cubic curve, not a chord** (`river-meander.js`, `curveAt`).
  - The curve leaves each end of the segment along that end's direction (its normal), so the line has no corner at any
    joint.
  - The page's drawn line (`bendSegment`) and the valley cut under it (`carveValleys`) add the same curve.
  - On coarse windows, a segment is drawn in enough steps that the line stays within half a pixel of the curve. Where the
    steps span at least 2 pixels, no step turns more than 6°.

## Checked

`v2/tools/check-river-joins.mjs` builds a main stem that turns 90° on the planet's points at a confluence. On a window of
0.25 km pixels and on one of 0.05 km pixels, it checks that no two drawn steps the pixels show turn more than 15° from
each other. It also checks that the confluences still join, with a gap of 0 px.
