# The shore's colours from the palette shown

Asked for by the owner, 2026-11-20: "you should pick the beach and coast colors from the relief colour palette, right?".
Code: `v2/js/evolution/shore-colours.js` (`shoreColours`), used by `finish-view.js` (`paintFinished`, `paintWindow`,
`paintSea`) and `littoral.js` `paintLittoral`. Back to [coast-processes.md](coast-processes.md).

## The cause

- The beach, cliff, flats, marsh and the shallow sea bed had fixed colours (`LITTORAL.rgb`, sand 200·188·154).
- The Relief palette has no sand: its land starts at a dark green, 74·122·70. The fixed pale sand sat on it as a colour
  from another map. Every other palette had the same mismatch in its own way: black sand belongs on Volcanic, not cream.

## How each colour is picked (per palette, once)

- **Sand:** the palette's warmest light land colour between 0 and 2 km, nearest a tan hue (OKLab 75°, falling off as
  cos¹⁶). Relief gets its tan, 163·148·97.
  - Up to 3 km picked Volcanic's ember-lit heights instead of its basalt.
  - A looser hue picked the Relief's khaki at 1 km, which reads as dry grass.
  - A palette with no tan in its lowlands (Lush, Frozen, Grey, Scientific, Alien) gets its rock as sand; its lightest
    colour was its green.
- **Rock:** the palette's greyest colour between 1 and 5 km, near mid light.
- **Marsh:** the palette's 0 m land, 30% toward the rock, ×0.9.
- **Flats (mud):** the sand and the rock half and half, ×0.75 (wet).
- **Mangrove:** the palette's 0 m land ×0.65.
- **Gravel** (cold beaches, [beach-look.md](beach-look.md)): the sand 70% toward the rock.
- The shallow sea bed under clear water is the same sand.

## Limits

- The Satellite and the climate layers are not height palettes; they keep the fixed natural colours.
