import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../src/lib/schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

// Complex bans with their actual prices from the CSV
const COMPLEX_BANS: { name: string; ability: string; price: number; teraCost: number | null }[] = [
  { name: "Dugtrio", ability: "Arena Trap", price: 0, teraCost: null },
  { name: "Sceptile", ability: "Shed Tail", price: 2, teraCost: null },
  { name: "Gothitelle", ability: "Shadow Tag", price: 0, teraCost: null },
  { name: "Basculegion", ability: "Last Respects", price: 2, teraCost: null },
  { name: "Cyclizar", ability: "Shed Tail", price: 1, teraCost: null },
  { name: "Orthworm", ability: "Shed Tail", price: 0, teraCost: null },
  { name: "Houndstone", ability: "Last Respects", price: 0, teraCost: null },
];

async function fixComplexBans() {
  console.log("Fixing complex ban Pokemon prices...\n");

  // Get Season 10
  const season10 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 10),
  });

  if (!season10) {
    console.error("Season 10 not found!");
    process.exit(1);
  }

  console.log(`Found Season 10: ID=${season10.id}\n`);

  // Get all Pokemon for matching
  const allPokemon = await db.query.pokemon.findMany();

  for (const ban of COMPLEX_BANS) {
    // Find the Pokemon
    const pokemon = allPokemon.find(p =>
      p.name.toLowerCase() === ban.name.toLowerCase() ||
      p.name.toLowerCase() === ban.name.toLowerCase().replace(/\s+/g, "-")
    );

    if (!pokemon) {
      console.log(`  ✗ ${ban.name} - Pokemon not found`);
      continue;
    }

    // Check if there's a -1 price entry (wrong) and a correct entry
    const entries = await db.query.seasonPokemonPrices.findMany({
      where: and(
        eq(schema.seasonPokemonPrices.seasonId, season10.id),
        eq(schema.seasonPokemonPrices.pokemonId, pokemon.id)
      ),
    });

    console.log(`${ban.name} (ID: ${pokemon.id}):`);
    console.log(`  Found ${entries.length} entries`);

    if (entries.length === 0) {
      // No entry - insert correct one
      await db.insert(schema.seasonPokemonPrices).values({
        seasonId: season10.id,
        pokemonId: pokemon.id,
        price: ban.price,
        teraBanned: false,
        teraCaptainCost: ban.teraCost,
        complexBanReason: ban.ability,
      });
      console.log(`  ✓ Created new entry: ${ban.price} pts, ban: ${ban.ability}`);
    } else if (entries.length === 1) {
      // One entry - update it
      const entry = entries[0];
      await db.update(schema.seasonPokemonPrices)
        .set({
          price: ban.price,
          complexBanReason: ban.ability,
        })
        .where(eq(schema.seasonPokemonPrices.id, entry.id));
      console.log(`  ✓ Updated: ${entry.price} -> ${ban.price} pts, added ban: ${ban.ability}`);
    } else {
      // Multiple entries - delete wrong ones, keep/update correct one
      const correctEntry = entries.find(e => e.price !== -1);
      const wrongEntries = entries.filter(e => e.price === -1);

      // Delete wrong entries
      for (const wrong of wrongEntries) {
        await db.delete(schema.seasonPokemonPrices)
          .where(eq(schema.seasonPokemonPrices.id, wrong.id));
        console.log(`  ✓ Deleted wrong entry (price: ${wrong.price})`);
      }

      // Update correct entry with ban reason
      if (correctEntry) {
        await db.update(schema.seasonPokemonPrices)
          .set({ complexBanReason: ban.ability })
          .where(eq(schema.seasonPokemonPrices.id, correctEntry.id));
        console.log(`  ✓ Updated correct entry: ${correctEntry.price} pts, added ban: ${ban.ability}`);
      }
    }
  }

  // Verify results
  console.log("\n========================================");
  console.log("Verification:");
  console.log("========================================\n");

  for (const ban of COMPLEX_BANS) {
    const pokemon = allPokemon.find(p =>
      p.name.toLowerCase() === ban.name.toLowerCase() ||
      p.name.toLowerCase() === ban.name.toLowerCase().replace(/\s+/g, "-")
    );

    if (pokemon) {
      const entry = await db.query.seasonPokemonPrices.findFirst({
        where: and(
          eq(schema.seasonPokemonPrices.seasonId, season10.id),
          eq(schema.seasonPokemonPrices.pokemonId, pokemon.id)
        ),
      });

      if (entry) {
        console.log(`${ban.name}: ${entry.price} pts, TC: ${entry.teraCaptainCost ?? 'none'}, Ban: ${entry.complexBanReason}`);
      }
    }
  }

  console.log("\n✅ Done!");
  process.exit(0);
}

fixComplexBans().catch(console.error);
