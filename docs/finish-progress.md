# A finish's progress: the whole, and the step under way

Asked for by the owner, 2026-11-20: the terrain's progress bar showed how far the whole finish was, but not the step
running, which could sit still for most of a minute at 10M. Code: `v2/js/finish/stage-clock.js`, read by Evolution's
Add detail (`v2/js/evolution/evolution-main.js`, its loading screen `loading.js` and the card), and Generate's and
Import's build card ([build-progress.md](build-progress.md)).

## What shows

- **Evolution's loading screen**: the bar for the whole (each ladder pass by its cost, as before), a thin bar under it
  for the stage under way, and "31 % in all · this step 42 %". The card's line and the Cancel button's tooltip say both.
- **Generate's and Import's build card**: its bar and % for the whole, a thin bar for the stage, the stage's % after its
  words.

## Where the step's share comes from

Each stage reports how far it is from inside (`v2/js/core/progress.js`): the worker sets one sink for its run, a stage
gives its parts their ranges (`part`) and its loops say how far through theirs they are (`report`); with no sink (Node,
the page, the pool's workers) the calls do nothing. The worker sends at most every 100 ms or 2 %.

- **surface**: the pool's slices as they come back. **climate**: the coupling rounds, rain, the months, then the
  runoff. **bedrock**: its rock pass, then the relief. **rivers**: each carve level's rounds, by cells × rounds, and
  inside a round its receivers, beds and the history's rivers. **ice age**, **wind**, **sea**, **sediment**: their
  phases. **water**: the flood (by its cells), receivers, hollows, cuts, the discharge (by its cells), rivers, their
  year. **detail**: its rows. **geology**, **deposits**: their cells. **final climate**: its cells (on workers: its ranges as they finish). **farming**:
  its phases. **picture**: its rows.

Between two reports, and for a stage that reports nothing, the time fills in:

- Each finish's laps (`finish.js` `ms`, per stage) are kept in this browser (`localStorage` `orogen.finishLaps`, per
  page and detail, the latest 12). The next finish reads each stage's share of the whole off them, and the stage's own
  progress as its time so far against its time before.
- No laps at this detail: the nearest detail's, scaled by the cells.
- No laps at all (a first finish): the stages' weights (`finish.js` STAGES), timed by this finish's pace over the stages
  done. The first stage then has no step %.
- A reported share wins over the clock.
- A guess stops at 99 % until the next stage begins; the whole never steps back.

With laps kept, the whole's bar moves by time too, not in steps at each stage's start.

## Checked

Node, with fake laps (2026-11-20): a first finish gave no step % for the mesh, then 50 % for a surface half its paced
time; a second at twice the cells read the first's laps doubled (rivers 5 s of 10 s: 50 %, the whole 65 %), stopped at
99 % on an overrun, and took the picture's 80 % as reported. The reports (2026-11-20): nested parts in Node rise
0 → 1 without stepping back, and do nothing with no sink. Not yet looked at in a browser.
