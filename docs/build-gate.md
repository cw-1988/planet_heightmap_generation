# One memory budget for every tab

Builds in all open World Orogen tabs share one memory budget. A build waits until it fits with the builds already
running. This covers Generate's and Import's builds (the world and its finish) and Evolution's Add detail. The code is
`js/build-gate.js`. Back to [shared.md](shared.md); the budget and each build's peak are in
[detail-stops.md](detail-stops.md).

The owner asked on 2026-11-22: "maybe only allow one instance with max details, or what happens when we hit max ram
utilization?"

## What happens when memory runs out

Each Detail slider ends at the finest stop that fits the budget (half the machine's memory) on its own. Before this,
two tabs could each start a build that size, together using the machine's whole memory. Then, in order:

1. **Windows pages to disk.** It has no hard limit at physical RAM, only at RAM plus the page file. The whole machine
   slows down, the builds with it.
2. **An allocation fails.** A worker's `new Float32Array` or WebAssembly memory growth throws "Array buffer allocation
   failed". The pages catch it. Generate and Import show "Not enough memory to finish this planet — try a lower
   Detail". Evolution lets go of the moment it kept in detail, retries once in a fresh worker, then says the same.
3. **The browser closes the tab** ("Aw, Snap!", Out of Memory). A tab's workers live in its renderer process, so they
   all go with it. Nothing on the page can catch this.

The browser gives a page no reading of free memory. `navigator.deviceMemory` is the total, rounded. So memory that
other programs use is not counted: the budget's other half is their room.

## The gate

- A build's peak is the page's model at its Detail ([detail-stops.md](detail-stops.md)): for example 10.5 GB for a
  10M Generate build and 6.4 GB for a 10M Add detail.
- A build starts when no other build is running, or when the peaks of every running build plus its own fit the
  budget. Otherwise it waits, and the page says "Waiting for another tab's build — both at once wouldn't fit in
  memory…".
  - With a 16 GB budget, a 10M Generate build runs alone. Two 3M builds (4.2 GB each) run together.
  - A build alone always goes, even above the budget (`?maxdetail`).
- Waiting is cancelled by the page's next build (Generate's Rebuild) or by Evolution's Cancel.
- Edit and Reapply builds and the Detail ladder's step views are not gated: they rebuild a world already held, at its
  Detail.
- A world held after its build is not counted. The measured 10M run fell back below its starting memory once done.

### How it works

- Each running build holds a [Web Lock](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) named
  `detail-build:<page>:<tab>:<GB>`. A build is weighed and takes its lock inside one exclusive `detail-gate` lock, so
  two tabs can't both see room for one.
- A waiting build asks for the locks of the running ones and weighs again when one of them is let go. The browser lets
  a lock go when its build ends, and also when its tab is closed or crashes. So the locks held are always the builds
  truly running.
- Where Web Locks are missing, builds are not gated.

## No crash cap

Until 2026-11-24, a tab the browser closed mid-build lowered that page's slider by one stop, kept in localStorage
(`detailCap:<page>`) until a build above it succeeded or the build code changed. The owner removed it: the cap rarely let
go in practice, so one bad build took the top stops away for good. The page now drops the keys it left
(`detailCap:*`, `detailBuilding:*`) on load.

Tested on 2026-11-22 with two tabs:
- One tab held 15.1 GB of build locks. A 180K Generate build in the other tab waited and showed the line above.
- When the first tab's 10.5 GB build ended, the waiting build started at once, and no lock request was left queued.
