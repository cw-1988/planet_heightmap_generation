# Small lakes

The lakes too small for the mesh: glacial, thaw, oxbow and wetland lakes, sprinkled where the land makes them. A
slider in Generate's and Import's Climate section (a Lakes section of its own tried and put back, the owner, 2026-11-20: "just put the back lakes back into climate") and Evolution's World section, −1 to 1 (default 0). Asked for by the
owner, 2026-11-20 ("properly sprinkle lakes across the world, where they make scientifically the most sense"). Code:
`v2/js/finish/small-lakes.js` (the shares) and `small-lakes-draw.js` (the lakes and their basins). Back to [generate.md](generate.md) · [import.md](import.md) ·
[evolution.md](evolution.md) · the big lakes: [lakes-slider.md](lakes-slider.md).

## Why a separate model

A cell of the 2.56 M-cell mesh is ~14 km across. A hollow smaller than that is not in the mesh, yet most of Earth's
lakes are small: lakes cover ~3.7 % of the land outside the ice sheets, and their sizes follow a power law,
N(>A) ∝ A^−(τ−1) with τ ≈ 2.14, so the bigger size classes hold a little more of the area than the smaller (Cael &
Seekell 2016; Verpoorter et al. 2014; HydroLAKES, Messager et al. 2016). Where
they crowd is decided by the landscape, and few kinds of landscape hold many. Sloping, unglaciated land drains its
hollows: rivers, few lakes. So most of a world stays rivers; that is right, not a gap.

## Where they go

Each land cell gets an expected share of small-lake area (`pondShare`), the sum of these processes, all gated by water:
rain over Köppen's dry line, 20 T + 280 mm (its summer-rain form, the strictest), none below 0.8 of it, full from 1.6.
Below the line the climate is steppe or desert and its hollows are pans. (The first gate, rain ÷ an evaporation of
300 + 55 T mm, underrated evaporation in the cold and filled a 200 mm cold steppe with lakes.)

| Process | Share at full | Where | Earth |
|---|---|---|---|
| Glacial | 10 % | The last ice age's ground, on slopes below 0.004–0.012 (once 0.01–0.06: steeper than a lake holds), more under thicker ice | Finland, the Canadian Shield |
| Thermokarst | 12 % | Permafrost (−1 to −6 °C a year) on flat ground | Siberian and Alaskan tundra |
| Floodplain | 12 % of the meander belt | A river's belt, 0.06 km × √Q (m³/s) wide, on its cell and spilling to its neighbours; flat ground | Amazon várzea, the Ob, the Mississippi |
| Humid flats | 1 % | Flat ground where rain is 1.5–3× the dry line | wetland lakes |
| Base | 0.2 % | Anywhere wet | landslide dams, sinkholes |

No cell is more than 40 % water. Karst is not counted: the rocks are made after the terrain. Today's ice caps and the
mesh's own lakes get none.

## How they are drawn

Six octaves of a 3D lattice, 40 km down to 1.25 km: lakes from ~28 km to ~0.6 km across. Nothing finer: the first
version went down to 0.31 km with equal area per octave, and on the map that was a sprinkle of specks, not lakes (the
owner, 2026-11-20: "i need lakes not sprinkles").

- Each lattice cell holds at most one lake, centred in the middle half of the cell, a ball whose radius is 0.15–0.35
  of the spacing, cut by the planet's surface into a disc.
- Its shore is an ellipse of the disc's area, long by up to 1.3 along an axis of its own, over the ground warped by six
  smooth waves (two at each of three sizes, each its own way and push), so bays and points bulge sideways and are round
  at their heads. The warp's slopes sum under 1, so it folds nothing: one lake, no holes. Measured in the plane tangent
  at the disc's own centre, on the surface (the foot of the ball's centre).
- Dead ends: a shore as waves round the middle, r(θ), however many and however weak, makes every bay a V aimed at the
  lake's middle, since a dip is the same angle wide all the way in: pac-man and heart lakes (the owner, 2026-11-20:
  "lakes still have weird knicked shapes"). Three strong waves (3, 5, 7 θ) drew every lake a flower; measured in the
  ball's 3D frame, round its centre deep under the ground, they pinched the shore into clover lobes and the bowl's depth
  fell in spokes ("the small lakes have weird kinks").
- Where lakes overlap, a place takes the lake whose bed is lowest there, so two lakes merge into one bowl; on dry
  ground the nearest bank.
- A lake reaches under ¾ of a cell, so the 2 × 2 × 2 cells round a place hold every lake that can touch it: lakes cross
  the cells' faces and run into each other.
- Octave k takes a part of the share falling 4^(2 − τ) ≈ 0.82 per halving, so the biggest lakes hold the most area. A
  lake exists with probability (its octave's part) ÷ (the ball's mean volume share); what a big octave cannot hold (one
  lake a cell) carries down to the next. By Delesse's principle a ball's volume share is its disc's area share. Lakes
  overlap, so the share asked of them is −ln(1 − share), what random lakes need to cover `share` of the ground.
- A lake is there only if the land at its centre holds lakes (share above 0). Its whole shore is drawn, also where it
  runs past its flat: cutting it off where the share's pixels end left square edges and fragments.

A lake is drawn only once its disc is 5 px across in a zoomed window (`pondsInWindow`), 2.5 px on the world's picture
(`pondRaster`, seen shrunk). It is the disc that counts, not the ball: a big ball cut near its edge leaves a speck.
Smaller lakes are there and appear as you zoom in; at full zoom the drawn water is the share.

- The world's picture's small-lake pixels are marked (bit 128 of the share byte). A zoomed window skips them and draws
  the lakes its own pixels hold, so a lake is the same lake at every zoom. Its share crop is widened by one top lattice
  (40 km) so neighbouring tiles agree.

## A lake is a basin

The first version stood every lake's water 4 m over whatever ground was under it. The water followed the relief, and
the Satellite layer, which shows a lake's bed through its depth, showed the slopes' shading under a uniform tint (the
owner, 2026-11-20: "why does it looks painted on top? there is nothing carving into the surface"). Now each lake is
water in a hollow:

- One flat level per lake: the lowest of the picture's ground at eight points a pixel and a half past its shore, where
  it would spill. Every tile and zoom reads the same picture there, so the level is the same everywhere. A lake whose
  rim reaches the sea's level is dropped (it would be a lagoon).
- A bowl carved under it, (1 − q²)² of its depth, deepest in the middle: 1 m plus 7 m per km across, at most 60 m
  (ponds of a few hundred metres run 1–3 m, small glacial and thaw lakes ~10–30 m). A 5 m floor made a 150 m pond a pit
  with 10 % walls, a crater's crescent under the hillshade. Ground already lower stays lower. On 2026-11-22 a bowl flat
  out to the shore, (1 − q²)³, with the clear shallows cut to half a radius (shore-ramp.js `pondRamp`), made each pond a
  droplet on top of the ground (the owner: "the sunkenness was fine"); both went back.
- Its bank eases the ground down to the level, no steeper than `bankSlope` (0.8 %) on average, out to 1.5–3 radii: on
  the uphill side a cut bank. Where two lakes' banks overlap the ground is the lower of the two, so no seam runs down
  between lakes run together. The bowl starts 5 cm
  under the level at the shore, so ground and bed are one surface across the waterline. Until 2026-11-22 the bank ended
  1 m over the level and the bowl began 0.5 m under it. The hillshade drew that 1.5 m step as a thin dark line round
  every small lake (the owner: "this weird paste in edge"). It never
  raises the ground: it once lifted it to that metre all round, and on flat land every lake stood in a dam (the owner,
  2026-11-20: "why the f are you building dams? it should look natural"). Zoomed windows carve it into the enlarged
  picture's smooth ground, after the mesh lakes' beds are flattened (detail on top: see below). The world's picture
  carves the bowl only (its pixel is wider than a bank) and reads every level before carving any. It keeps its carved
  pixels' heights from before (`pond.at`, `pond.h0`), and each window's crop puts them back (fine-detail.js
  `cropSource`), so a window carves fresh ground. Enlarged with the picture's carve still in it, the carve's step rang
  through the Catmull–Rom, a hard dark line down a lake's west shore at 28 m/px (the owner, 2026-11-22: "fix the seam
  with a proper transition").
- So the shallows are light and the middle dark, and the bed's hillshade is flat under the water.
- In a zoomed window the detail (fine-detail.js) is split in two (`pondsInWindow`). Its broad swells, the detail
  blurred over 0.5 km (at most a quarter of the window's margin, so tiles agree; `low-pass.js`), lift or sink the
  whole basin, its level included. Its fine relief eases in across max(1.5, bank) radii: none at the shore or under
  the water, all of it beyond the bank. Dead ends, all 2026-11-22: the full detail over the carve stood walls and dry
  ground under the level ("fix the seam with a proper transition"); fading the dips only left raised rings; fading the
  whole detail to the picture's level dug a moat where a swell stood over it and a crater where a swell sank under it
  (the owner: "one is inset too deep the other is too much on top").
- The hillshade under any water (sea, lakes) softens as the water shows over the bed (finish-view.js `underWater`),
  not at the waterline. Before 2026-11-22 the ground's grain stopped dead at every shore, and a small lake looked
  pasted in.

## Only where the ground holds a lake

The share is judged per mesh cell, on its slope over ~14 km, and a lake's footprint used to be placed with no look at
the ground under it. So lakes stood on mountains, held by the 1 m lip on their downhill side over a 300 m drop (the
owner, 2026-11-20: "you just painted a lake on top of a fkn mountain"). Now each lake is tested on the picture's ground
(the same at every zoom) before it exists:

- Round its shore, 16 points a pixel and a half out, the ground lies level within 0.5 m + 6 m per km across (a 0.6 %
  slope, 1 % for a 150 m pond: a 5 km lake's shore within 30 m). A 3 m floor let a 150 m pond sit on a 2.6 % slope,
  its bank a 4 m cut into the uphill side.
- Its middle is no more than a third of that over its shore's mean: a hollow or a flat, never a top.
- Out to three radii, nothing falls away more than that below its level: no lake perched over a drop.

A lake that fails is not there, and nothing replaces it. Slopes and summits get none, whatever their cell's share.

## The slider

The share is multiplied by 4^x: −1 means none, −0.5 half, 1 four times. The share is capped at 40 % of a cell. It
changes the finish only, so it re-finishes on release; on Evolution it changes a detailed moment, not the history or the
previews (`detailKey` "greenhouse|rain|lakes|ponds", link `&ponds=`, planet-file setting `ponds`; a moment saved
before it reads as none). In the planet code, Small lakes ±0 keeps the code as it was; any other value makes it 24
characters (`js/planet-code.js`, `PONDS_LEN`).

## Measured

Seed `kw90o25briyrb5smb3i9rb`, Detail 2.56 M, Small lakes 0, 400 000 area-weighted samples at full resolution:

- [small-lakes-measured.md](small-lakes-measured.md): the first version (equal area per octave down to 0.31 km).
- [small-lakes-measured-2.md](small-lakes-measured-2.md): lakes, not specks (40 km … 1.25 km, τ weights, Köppen gate).
