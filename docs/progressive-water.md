# Rivers and lakes in each step of the Detail ladder

With Progressive generation on (Generate and Import), each coarse step of the ladder
([progressive-detail.md](progressive-detail.md)) is shown with its own rivers, lakes and the valleys they cut, not as
bare ground. Asked for by the owner, 2026-11-20: the water was what was missed most while a planet built. It had its own
switch, "Rivers and lakes in each step"; the owner had it removed the same day, so the water now always comes with
Progressive (`js/page-chrome.js` `progressiveSwitch`: `progressiveWater` is Progressive itself).

## How

- **The job** (`js/detail-ladder.js` `rungJob` / `presentRungJob`): each step's `rung` message carries a finish job:
  its frame, the sim mesh, its surface (heights, carve inputs, records) and the terrain and finish configs.
- **Run on the page** (`js/rung-view.js`): on a finishing worker of its own, beside the build, with
  `terrainOnly: true`. The finish stops right after its water (`finish.js` returns once `onTerrain` returns true), so
  only the terrain comes back, and the step is painted as a finished picture (`terrainFin`).
- **The queue**: one step's water runs at a time. The newest step waits; older waiting steps are dropped. Once a step
  is shown with its water, a later bare step is not shown, since it would take the water away. When the world arrives
  the water stops, and a watered step stays on screen until the world's own terrain lands.
- **The climate** (`v2/js/finish/step-climate.js`): the climate is calculated on a lat-lon grid, so it belongs to the
  planet, not to the detail.
  - The first watered step calculates it on a grid about as fine as its cells: the grid step nearest the cells'
    spacing, 3° at 5,000 cells and 1° from about 26,000.
  - Every later step reuses that grid. It only finishes each cell's own months again, at the step's own heights
    (`core.js` `cellClimate`).
  - Only the rivers' rain comes from this climate. Their courses come from the ground's slopes. The world's own finish
    still calculates its own climate at 1°.

## What it costs

Measured in the browser pane, 2026-11-20, at 204,000 Detail. The climate of a 5,000-cell step's finish, on its own:
6.9 s at 1°, 2.4 s at 2°, 1.1 s at 3°. The rest of that finish takes about 1.8 s. Before the step climate, the first
step's water took 8.6 s, and the world landed before it was ever shown.

| Step | Shown bare at | Shown with its water at |
|---|---|---|
| 5,000 | 3.0 s | 7.8 s |
| 80,000 | 7.2 s | 11.7 s (the 10,000–40,000 steps passed over in the queue) |
| the world | | its terrain at 11.8 s |

The build itself slows a little (its own finish shares the CPU), and the water uses one more worker.
