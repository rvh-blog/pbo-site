import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/schema";

const client = createClient({ url: "file:pbo.db" });
const db = drizzle(client, { schema });

// Map team names to local file names
const teamLogoMap: Record<string, string> = {
  "Adelaide 30Scizors": "/images/teams/adelaide-30scizors.png",
  "Alabama Feraligatrs": "/images/teams/alabama-feraligatrs.png",
  "Birmingham Buizels": "/images/teams/birmingham-buizels.png",
  "Blackthorn Crashers": "/images/teams/blackthorn-crashers.png",
  "Blasphemous Blacephalons": "/images/teams/blasphemous-blacephalons.png",
  "Boston Banettes": "/images/teams/boston-banettes.png",
  "Caborca Gengars": "/images/teams/caborca-gengars.png",
  "Carolina Cetitans": "/images/teams/carolina-cetitans.png",
  "Charleston Chesnaughts": "/images/teams/charleston-chesnaughts.png",
  "Cherry Hill Bellsprouts": "/images/teams/cherry-hill-bellsprouts.png",
  "Chicago Chimchars": "/images/teams/chicago-chimchars.png",
  "Clefemboys": "/images/teams/clefemboys.png",
  "Clonbrook Kyogres": "/images/teams/clonbrook-kyogres.png",
  "Dreary Lane Darmanitans": "/images/teams/dreary-lane-darmanitans.png",
  "East Coast Krooks": "/images/teams/east-coast-krooks.png",
  "Edinburgh Enamorus": "/images/teams/edinburgh-enamorus.png",
  "Erie Oshawotts": "/images/teams/erie-oshawotts.png",
  "Frederick Klefkis": "/images/teams/frederick-klefkis.png",
  "Fredericton Froakies": "/images/teams/fredericton-froakies.png",
  "Garden City Grotles": "/images/teams/garden-city-grotles.jpg",
  "Glasgow Glowbros": "/images/teams/glasgow-glowbros.png",
  "Gotham City Golbats": "/images/teams/gotham-city-golbats.png",
  "Hawaiian High Cost": "/images/teams/hawaiian-high-cost.png",
  "Helsinki Jellicent Klub": "/images/teams/helsinki-jellicent-klub.png",
  "Icirrus City Infernapes": "/images/teams/icirrus-city-infernapes.png",
  "Jirachi All-Stars": "/images/teams/jirachi-all-stars.png",
  "Lion City Leech Life": "/images/teams/lion-city-leech-life.png",
  "London Lunalas": "/images/teams/london-lunalas.png",
  "Long Island Tyranitars": "/images/teams/long-island-tyranitars.png",
  "Luscious Lopunnies": "/images/teams/luscious-lopunnies.png",
  "Milton Keynes M'Ladies": "/images/teams/milton-keynes-m-ladies.png",
  "Monument Frostoms": "/images/teams/monument-frostoms.jpg",
  "Motor City Machamps": "/images/teams/motor-city-machamps.png",
  "Nevada County Caterpies": "/images/teams/nevada-county-caterpies.jpg",
  "New York Malamars": "/images/teams/new-york-malamars.png",
  "New York Nickits": "/images/teams/new-york-nickits.png",
  "Norwalk Noiverns": "/images/teams/norwalk-noiverns.png",
  "Ottawa Donphans": "/images/teams/ottawa-donphans.png",
  "Philadelphia Flygons": "/images/teams/philadelphia-flygons.png",
  "Philadelphia PZs": "/images/teams/philadelphia-pzs.png",
  "Prophet of the Pantheon": "/images/teams/prophet-of-the-pantheon.png",
  "Scottish Stoutlands": "/images/teams/scottish-stoutlands.png",
  "Snowpoint City Snovers": "/images/teams/snowpoint-city-snovers.png",
  "Sydney Sylveons": "/images/teams/sydney-sylveons.png",
  "Syracuse Snorlax": "/images/teams/syracuse-snorlax.png",
  "The Pokerangers": "/images/teams/the-pokerangers.png",
  "The Ting Goes Boom": "/images/teams/the-ting-goes-boom.png",
  "Tokyo Teddiursas": "/images/teams/tokyo-teddiursas.png",
  "Toronto Staraptors": "/images/teams/toronto-staraptors.png",
  "Tottenham Hoothoots": "/images/teams/tottenham-hoothoots.png",
  "Uncertain Unowns": "/images/teams/uncertain-unowns.png",
  "Worcester Woopers": "/images/teams/worcester-woopers.png",
};

async function main() {
  console.log("Fixing team logo URLs...\n");

  // Get all season coaches with Discord URLs
  const allCoaches = await db.query.seasonCoaches.findMany();

  let updated = 0;
  let notFound: string[] = [];

  for (const coach of allCoaches) {
    const localPath = teamLogoMap[coach.teamName];

    if (localPath) {
      // Only update if it's currently a Discord URL or different path
      if (coach.teamLogoUrl !== localPath) {
        await db.update(schema.seasonCoaches)
          .set({ teamLogoUrl: localPath })
          .where(eq(schema.seasonCoaches.id, coach.id));
        updated++;
        console.log(`✓ ${coach.teamName} -> ${localPath}`);
      }
    } else if (coach.teamLogoUrl?.includes("discord")) {
      // Track teams with Discord URLs but no local mapping
      if (!notFound.includes(coach.teamName)) {
        notFound.push(coach.teamName);
      }
    }
  }

  console.log(`\n✅ Updated ${updated} entries`);

  if (notFound.length > 0) {
    console.log(`\n⚠️  Teams with Discord URLs but no local file mapping:`);
    for (const name of notFound) {
      console.log(`   - ${name}`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
