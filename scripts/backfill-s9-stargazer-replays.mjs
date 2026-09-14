// Stargazer S9 uses the shared guarded replay backfill engine with its own
// manifest, aliases, and source-review annotations.
process.env.BACKFILL_DIVISION = "stargazer";
process.env.BACKFILL_SEASON = "9";
await import("./backfill-s7-neon-replays.mjs");
