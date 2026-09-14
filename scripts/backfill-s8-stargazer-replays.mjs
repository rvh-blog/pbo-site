// Stargazer S8 uses the shared guarded replay backfill engine with its own
// manifest, aliases, and force-win annotations.
process.env.BACKFILL_DIVISION = "stargazer";
process.env.BACKFILL_SEASON = "8";
await import("./backfill-s7-neon-replays.mjs");
