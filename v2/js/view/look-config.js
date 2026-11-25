// Look settings fixed in place of view-strip sliders (fork addition). The owner, 2026-11-24, after tuning them by eye:
// "50% tint and 400km fade is fine. oh and beach width of 1x, opacity of 60% and beachside land. so now we can hardcode
// that or put in a config file, so we dont have those slider because the clutter up the ui". Change them here.
export const LOOK = {
    // The beach where a coast has one (finish/littoral.js BEACH_LOOK; docs/beach-look.md):
    beachWidth: 1,        // × how far it eats into the land (×1 as the waves make it: 60 m calm … 240 m exposed)
    beachAlpha: 0.6,      // how strongly its sand shows, 0 … 1
    beachShift: 1,        // which side of the shore: −1 out over the sea … +1 on the land (as made)
    // The rivers' lines (view/planet-view.js and the exports: view.riverWidth):
    riverWidth: 0.6,      // × how thick they are drawn (×1 as made)
    // The States overlay's tint over the other views (evolution/states-overlay.js):
    statesTint: 1,        // each state's colour on a border between states, 0 … 1
    statesFadeKm: 20,     // how far inland that fades to none, km (the owner, 2026-11-25: "20km and 100% tint it is")
};
