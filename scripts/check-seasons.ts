import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/lib/schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

async function check() {
  const seasons = await db.query.seasons.findMany({
    with: { divisions: true },
  });

  console.log("All seasons:");
  for (const s of seasons.sort((a, b) => a.seasonNumber - b.seasonNumber)) {
    console.log(`  ID: ${s.id} | S${s.seasonNumber} | "${s.name}" | Budget: ${s.draftBudget} | Divisions: ${s.divisions.map(d => d.name).join(", ")}`);
  }
}

check().then(() => process.exit(0));
