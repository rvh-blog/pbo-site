import { readSheetRange } from "../src/lib/sheets-sync";

const TEST_SHEET_ID = "1mNAJ3BwV-4AKveLJVT_T4eYQZU3wkLMEtP8wV-If600";

async function main() {
  console.log("Looking for specific Pokemon forms in Pokedex...\n");

  try {
    // Read the full Pokedex
    const pokedexData = await readSheetRange(TEST_SHEET_ID, "Pokédex!A1:Z1500");

    if (!pokedexData || pokedexData.length === 0) {
      console.log("No data found in Pokédex sheet");
      return;
    }

    // Search for specific Pokemon forms
    const searchTerms = [
      "ogerpon", "thundurus", "slowking", "exeggutor", "articuno",
      "samurott", "great tusk", "gouging fire", "iron"
    ];

    console.log("=== Pokemon forms found ===\n");

    for (const term of searchTerms) {
      console.log(`--- Searching for "${term}" ---`);
      for (let i = 1; i < pokedexData.length; i++) {
        const row = pokedexData[i];
        if (!row) continue;

        const smogonName = String(row[9] || "").toLowerCase();
        const displayName = String(row[18] || ""); // Column S

        if (smogonName.includes(term) || displayName.toLowerCase().includes(term)) {
          console.log(`  Smogon: "${row[9]}" -> Display: "${displayName}"`);
        }
      }
      console.log("");
    }

    // Export all Pokemon display names that have a tier value > 0 (draftable)
    console.log("\n=== All draftable Pokemon (tier > 0) ===\n");
    const draftable: { smogon: string; display: string; tier: number }[] = [];

    for (let i = 1; i < pokedexData.length; i++) {
      const row = pokedexData[i];
      if (!row) continue;

      const tier = parseInt(row[12]) || 0; // Column M (Old tier)
      const newTier = parseInt(row[4]) || 0; // Column E (New Points)
      const smogonName = String(row[9] || "");
      const displayName = String(row[18] || "");

      if ((tier > 0 || newTier > 0) && displayName && displayName !== "-") {
        draftable.push({ smogon: smogonName, display: displayName, tier: newTier || tier });
      }
    }

    console.log(`Found ${draftable.length} draftable Pokemon\n`);

    // Show some examples
    draftable.slice(0, 30).forEach(p => {
      console.log(`  "${p.smogon}" -> "${p.display}" (${p.tier})`);
    });

    console.log("\n✅ Done!");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
