# The beach as one transition from sea to land

The owner, 2026-11-20, on the banded beach: "it is supposed to be the whole … transition from ocean to beach to land",
and on a reef's crest and the surf: "remove this … as well". Code: `v2/js/finish/littoral.js` (`beachProfile`, `litAt`,
`shapeLittoral`), `v2/js/finish/shore-ramp.js` (`shoreOpacity`).

## What was wrong (round 3)

- **A beige band out in the sea.** The water's own colour came in over the whole shore ramp (≥ 10 pixels, ≥ 4 km), so
  the bed's dry sand showed far out. Now it comes in over the first fifth of the ramp; past that, the held-low depth
  (`seenDepthM`) shows the shallows' sand as turquoise.
- **A tan strip with hard edges.** The beach was a band: full up to its width, then cut off.
- **White dots along the shore.** The surf's foam started hard at the shoreline and followed the pixel staircase.
- **Dark jagged lines.** These came from three things:
  - the reef's crest, coral brown with foam on it;
  - the berm's height, which ended in a step at its width;
  - the dune ridge behind the berm, which the hillshade drew as lines.

## Now

- **One profile across the shore** (`beachProfile`, `LITTORAL.profile`, in units of the beach's width W, + land). Sand
  rises from 0.8 W out at sea to full at the waterline, then fades into the land's colour from 0.4 W to 1.7 W. It is
  one sand colour throughout: a darker wet strip (up to 30%) read as a brown-grey line along the shore and was removed
  (round 4). Every step is a smoothstep averaged over the pixel, with up to 32 samples, so a beach a tenth of a pixel
  wide is still its true share.
- **Full at the waterline** (round 6). The sand used to reach full only 0.25 W inland. But the shallows' bed already
  shows sand up to the waterline, so the land's green showed through that strip (about 15%) as a dark thread along the
  middle of a close-up beach, framed by sand over sand on the sea side and full sand behind. It was the colour under
  the sand, not the hillshade: the thread stayed with the hillshade off.
- **The shore decides its beach, once** (round 5, `carryBeach`). Each pixel used to read its beach's strength from
  its own slope (`coastClasses`: a steep slope counts as a cliff). The land rising behind the shore cut the beach off a
  pixel or two in, a hard edge into the land however soft the profile (the owner, 2026-11-20: "WHERE IS THE
  TRANSPARENCY TRANSITION INTO THE LAND"). Now the strength and width of the pixels nearest the shore are carried out
  along the distance, inland and seaward, so only the profile fades the sand. The bytes are kept as far as the widest
  beach's fade reaches (`beachReachKm`: ×4 an exposed coast's 240 m, or its pixel floor, × 1.7), and the tiles' margin
  holds it (fine-detail.js, up to 160 px).
- **The sliders** ([beach-look.md](beach-look.md)):
  - width scales W (from ×1 it also has a least width that grows as you zoom in), so the beach eats further into the land;
  - opacity scales the sand's strength;
  - side moves the whole profile out over the sea by (1 − side)/2 of W.
- **No surf, foam or reef crest is drawn.** The sea's bed is sand already (finish-view.js `paintSea`). A reef is only its
  pale flat, fading out under the water; its crest stays in the heights.
- The flats' and the platform's bands are feathered over most of their width.
- **Heights:** the berm eases in and out over 1–3 beach widths, with no step, and there is no dune ridge. It only
  raises the ground (round 4). It used to pull the ground toward its few metres, so a higher coast was cut into a
  terrace, and the hillshade drew its walls as hard pale and dark bands parallel to the shore.
