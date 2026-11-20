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

The finish worker says only when a stage begins, and how far the picture is (its rows). No other stage reports its own
progress, and threading a report through each (the carve's rounds, the hydrology, the climate) would reach into every
stage's module. So the stages are timed:

- Each finish's laps (`finish.js` `ms`, per stage) are kept in this browser (`localStorage` `orogen.finishLaps`, per
  page and detail, the latest 12). The next finish reads each stage's share of the whole off them, and the stage's own
  progress as its time so far against its time before.
- No laps at this detail: the nearest detail's, scaled by the cells.
- No laps at all (a first finish): the stages' weights (`finish.js` STAGES), timed by this finish's pace over the stages
  done. The first stage then has no step %.
- The picture's reported rows win over the clock. A stage the laps never saw (the rocks, on a history without its
  record before) shows no step %.
- A guess stops at 99 % until the next stage begins; the whole never steps back.

With laps kept, the whole's bar moves by time too, not in steps at each stage's start.

## Checked

Node, with fake laps (2026-11-20): a first finish gave no step % for the mesh, then 50 % for a surface half its paced
time; a second at twice the cells read the first's laps doubled (rivers 5 s of 10 s: 50 %, the whole 65 %), stopped at
99 % on an overrun, and took the picture's 80 % as reported. Not yet looked at in a browser.
