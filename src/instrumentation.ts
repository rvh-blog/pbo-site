export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureChangelogEntriesTable } = await import("@/lib/changelog");
  await ensureChangelogEntriesTable();
  console.log("[Changelog] Bundled release entries synchronized.");
}
