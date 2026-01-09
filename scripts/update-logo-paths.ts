import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, like } from "drizzle-orm";
import * as schema from "../src/lib/schema";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

// Convert team name to filename (same logic as bash script)
function toFilename(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
}

async function updateLogoPaths() {
  const teamsDir = "./public/images/teams";

  // Get all local logo files
  const localFiles = fs.readdirSync(teamsDir);
  console.log(`Found ${localFiles.length} local logo files\n`);

  // Get all season_coaches with Discord CDN URLs
  const seasonCoachesWithDiscordLogos = await db.query.seasonCoaches.findMany();

  let updated = 0;
  let skipped = 0;

  for (const sc of seasonCoachesWithDiscordLogos) {
    if (!sc.teamLogoUrl || !sc.teamLogoUrl.includes("cdn.discordapp.com")) {
      continue;
    }

    const filename = toFilename(sc.teamName);

    // Find matching local file (could be .png, .jpg, .jpeg)
    const matchingFile = localFiles.find(f =>
      f.startsWith(filename + ".") &&
      (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg"))
    );

    if (matchingFile) {
      const localPath = `/images/teams/${matchingFile}`;

      await db.update(schema.seasonCoaches)
        .set({ teamLogoUrl: localPath })
        .where(eq(schema.seasonCoaches.id, sc.id));

      console.log(`✓ ${sc.teamName} -> ${localPath}`);
      updated++;
    } else {
      console.log(`✗ ${sc.teamName} - no local file found (${filename}.*)`);
      skipped++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no local file): ${skipped}`);
  console.log(`========================================`);

  process.exit(0);
}

updateLogoPaths().catch(console.error);
