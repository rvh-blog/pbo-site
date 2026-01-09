import { db } from "./db";
import { pokemon } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Convert a PokeAPI-style name to a Showdown-style display name
 * Examples:
 *   "pikachu" -> "Pikachu"
 *   "tornadus-therian" -> "Tornadus-Therian"
 *   "ogerpon-hearthflame-mask" -> "Ogerpon-Hearthflame"
 *   "greninja-ash" -> "Greninja-Ash"
 *   "mr-mime" -> "Mr. Mime"
 *   "ho-oh" -> "Ho-Oh"
 *   "porygon-z" -> "Porygon-Z"
 *   "flutter-mane" -> "Flutter Mane"
 *   "iron-hands" -> "Iron Hands"
 */
function pokeApiNameToShowdownName(apiName: string): string {
  // Special cases mapping - PokeAPI name to Showdown name
  const specialCases: Record<string, string> = {
    // Punctuation fixes
    "mr-mime": "Mr. Mime",
    "mr-mime-galar": "Mr. Mime-Galar",
    "mr-rime": "Mr. Rime",
    "mime-jr": "Mime Jr.",
    "type-null": "Type: Null",
    "ho-oh": "Ho-Oh",
    "porygon-z": "Porygon-Z",
    "jangmo-o": "Jangmo-o",
    "hakamo-o": "Hakamo-o",
    "kommo-o": "Kommo-o",
    "tapu-koko": "Tapu Koko",
    "tapu-lele": "Tapu Lele",
    "tapu-bulu": "Tapu Bulu",
    "tapu-fini": "Tapu Fini",
    "nidoran-f": "Nidoran-F",
    "nidoran-m": "Nidoran-M",
    "farfetchd": "Farfetch'd",
    "farfetchd-galar": "Farfetch'd-Galar",
    "sirfetchd": "Sirfetch'd",
    "flabebe": "Flabébé",

    // Paradox Pokemon (space instead of hyphen)
    "great-tusk": "Great Tusk",
    "scream-tail": "Scream Tail",
    "brute-bonnet": "Brute Bonnet",
    "flutter-mane": "Flutter Mane",
    "slither-wing": "Slither Wing",
    "sandy-shocks": "Sandy Shocks",
    "iron-treads": "Iron Treads",
    "iron-bundle": "Iron Bundle",
    "iron-hands": "Iron Hands",
    "iron-jugulis": "Iron Jugulis",
    "iron-moth": "Iron Moth",
    "iron-thorns": "Iron Thorns",
    "roaring-moon": "Roaring Moon",
    "iron-valiant": "Iron Valiant",
    "walking-wake": "Walking Wake",
    "iron-leaves": "Iron Leaves",
    "gouging-fire": "Gouging Fire",
    "raging-bolt": "Raging Bolt",
    "iron-boulder": "Iron Boulder",
    "iron-crown": "Iron Crown",

    // Special forms
    "meowstic-male": "Meowstic",
    "meowstic-female": "Meowstic-F",
    "indeedee-male": "Indeedee",
    "indeedee-female": "Indeedee-F",
    "basculegion-male": "Basculegion",
    "basculegion-female": "Basculegion-F",
    "oinkologne-male": "Oinkologne",
    "oinkologne-female": "Oinkologne-F",

    // Urshifu
    "urshifu-single-strike": "Urshifu",
    "urshifu-rapid-strike": "Urshifu-Rapid-Strike",

    // Toxtricity
    "toxtricity-amped": "Toxtricity",
    "toxtricity-low-key": "Toxtricity-Low-Key",

    // Lycanroc
    "lycanroc-midday": "Lycanroc",
    "lycanroc-midnight": "Lycanroc-Midnight",
    "lycanroc-dusk": "Lycanroc-Dusk",

    // Zygarde
    "zygarde-10": "Zygarde-10%",
    "zygarde-50": "Zygarde",
    "zygarde-complete": "Zygarde-Complete",

    // Wishiwashi
    "wishiwashi-solo": "Wishiwashi",
    "wishiwashi-school": "Wishiwashi-School",

    // Minior
    "minior-red-meteor": "Minior",

    // Aegislash
    "aegislash-shield": "Aegislash",
    "aegislash-blade": "Aegislash-Blade",

    // Morpeko
    "morpeko-full-belly": "Morpeko",
    "morpeko-hangry": "Morpeko-Hangry",

    // Eiscue
    "eiscue-ice": "Eiscue",
    "eiscue-noice": "Eiscue-Noice",

    // Palafin
    "palafin-zero": "Palafin",
    "palafin-hero": "Palafin-Hero",

    // Maushold
    "maushold-family-of-four": "Maushold",
    "maushold-family-of-three": "Maushold-Three",

    // Squawkabilly
    "squawkabilly-green-plumage": "Squawkabilly",
    "squawkabilly-blue-plumage": "Squawkabilly-Blue",
    "squawkabilly-yellow-plumage": "Squawkabilly-Yellow",
    "squawkabilly-white-plumage": "Squawkabilly-White",

    // Tatsugiri
    "tatsugiri-curly": "Tatsugiri",
    "tatsugiri-droopy": "Tatsugiri-Droopy",
    "tatsugiri-stretchy": "Tatsugiri-Stretchy",

    // Dudunsparce
    "dudunsparce-two-segment": "Dudunsparce",
    "dudunsparce-three-segment": "Dudunsparce-Three",

    // Poltchageist/Sinistcha
    "poltchageist-counterfeit": "Poltchageist",
    "poltchageist-artisan": "Poltchageist-Artisan",
    "sinistcha-unremarkable": "Sinistcha",
    "sinistcha-masterpiece": "Sinistcha-Masterpiece",
  };

  // Normalize to lowercase for matching
  const lowerName = apiName.toLowerCase();

  // Check special cases first
  if (specialCases[lowerName]) {
    return specialCases[lowerName];
  }

  // Handle Ogerpon forms - remove "-mask" suffix
  if (lowerName.startsWith("ogerpon-") && lowerName.endsWith("-mask")) {
    const form = lowerName.replace("ogerpon-", "").replace("-mask", "");
    return `Ogerpon-${capitalize(form)}`;
  }
  if (lowerName === "ogerpon") {
    return "Ogerpon";
  }

  // Handle Terapagos forms
  if (lowerName.startsWith("terapagos-")) {
    const form = lowerName.replace("terapagos-", "");
    return `Terapagos-${capitalize(form)}`;
  }

  // Handle standard forme names (Therian, Incarnate, Mega, etc.)
  const parts = lowerName.split("-");

  // Capitalize each part
  return parts.map((part, index) => {
    // Handle regional forms
    if (["alola", "alolan", "galar", "galarian", "hisui", "hisuian", "paldea", "paldean"].includes(part)) {
      return capitalize(part.replace("an", ""));
    }
    return capitalize(part);
  }).join("-");
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export async function populateDisplayNames() {
  console.log("Fetching all Pokemon...");
  const allPokemon = await db.select().from(pokemon);

  console.log(`Found ${allPokemon.length} Pokemon to process`);

  let updated = 0;
  let skipped = 0;

  for (const poke of allPokemon) {
    const displayName = pokeApiNameToShowdownName(poke.name);

    // Only update if displayName is different from current or not set
    if (poke.displayName !== displayName) {
      await db.update(pokemon)
        .set({ displayName })
        .where(eq(pokemon.id, poke.id));

      console.log(`${poke.name} -> ${displayName}`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

// Run if executed directly
if (require.main === module) {
  populateDisplayNames()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
