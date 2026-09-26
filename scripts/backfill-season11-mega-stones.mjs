// Compatibility entry point for the Season 11 Mega Stone repair.
// The shared maintenance backfill repairs stale inferred labels, removes
// stale Mega review notes, and preserves genuine explicit replay conflicts.
const forwardedArgs = process.argv.slice(2).filter((argument) => !argument.startsWith("--season="));
process.argv = [process.argv[0], process.argv[1], "--season=11", ...forwardedArgs];
await import("./backfill-mega-items.mjs");
