// Season 10 uses the shared guarded replay backfill engine. Unlike the older
// manifest-driven seasons, the S10 mode discovers the already-attached replay
// URLs from the canonical match rows and targets each match by id.
process.env.BACKFILL_SEASON ||= "10";
process.env.BACKFILL_DIVISION ||= "stargazer";
await import("./backfill-s7-neon-replays.mjs");
