# The sea stage's flood, only as far as needed

The sea stage (`v2/js/finish/finish-hydro.js`) ran its priority flood from the ocean (`spillFlood`) over all the land
twice: once for `openStraits` and once for `fillSeaBasins`. That was 0.6 s each at 2.5M. Both read the flood only
around bodies below sea level, so it now floods only as far as they need (`reach(c)`, `upTo(level)`).

- **openStraits** reads the ranks and parents of the bodies' cells and of their ways out. The flood runs until every
  cell below sea level is reached. A cell cut below sea level on the way lies on a way out, so it is reached too.
- **fillSeaBasins** reads `fill` at a remnant's start cell and at cells on its level. For each remnant that qualifies,
  the flood runs until that cell is reached, then to its level plus 2e-6. Every cell on that level is then reached,
  and any other cell already touched holds a level above it. The flood runs on a copy of the ground as it was, since
  the stage levels `z` body by body.

The output is the same. Stopping early leaves the same pops in the same order, so every cell that is read holds the
whole flood's values. The hashes match at 2.5M and 250K.

At 2.5M the sea stage went from 2.2 s to 1.8 s. Back to [finish-profile.md](finish-profile.md).

The final climate's nine colour corrections are now blurred together with `blurMany`
(`v2/js/finish/finish-cover.js`). They have values in the same grid cells, so this gives the same values while
building the weights once instead of nine times: about 40 ms.
