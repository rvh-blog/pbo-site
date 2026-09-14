// Sunset S9 uses the shared guarded replay backfill engine with its own
// manifest, source aliases, and review annotations.
process.env.BACKFILL_DIVISION = "sunset";
process.env.BACKFILL_SEASON = "9";
await import("./backfill-s7-neon-replays.mjs");
