import Database from "better-sqlite3";

const db = new Database("./pbo.db");

interface AbilityListResponse {
  count: number;
  results: { name: string; url: string }[];
}

interface AbilityDetail {
  id: number;
  name: string;
  names: { name: string; language: { name: string } }[];
  effect_entries: {
    effect: string;
    short_effect: string;
    language: { name: string }
  }[];
  generation: { name: string } | null;
}

function extractGenNumber(genName: string): number {
  const romanMap: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9,
  };
  const roman = genName.replace("generation-", "");
  return romanMap[roman] || 0;
}

function formatDisplayName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429) {
        console.log(`Rate limited, waiting 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Max retries exceeded");
}

async function downloadAbilities() {
  console.log("Fetching ability list...");

  // Get all ability URLs
  const listRes = await fetchWithRetry("https://pokeapi.co/api/v2/ability?limit=400");
  const listData: AbilityListResponse = await listRes.json();
  console.log(`Found ${listData.count} abilities`);

  // Prepare insert statement
  const insert = db.prepare(`
    INSERT OR REPLACE INTO abilities (
      pokeapi_id, name, display_name, short_effect, full_effect, generation
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const batchSize = 20;
  let processed = 0;

  for (let i = 0; i < listData.results.length; i += batchSize) {
    const batch = listData.results.slice(i, i + batchSize);

    // Fetch abilities in parallel
    const abilityDetails = await Promise.all(
      batch.map(async (a) => {
        const res = await fetchWithRetry(a.url);
        return res.json() as Promise<AbilityDetail>;
      })
    );

    // Insert into database
    for (const ability of abilityDetails) {
      const englishEffect = ability.effect_entries.find((e) => e.language.name === "en");
      const englishName = ability.names.find((n) => n.language.name === "en");

      insert.run(
        ability.id,
        ability.name,
        englishName?.name || formatDisplayName(ability.name),
        englishEffect?.short_effect || null,
        englishEffect?.effect || null,
        ability.generation ? extractGenNumber(ability.generation.name) : null
      );
    }

    processed += batch.length;
    console.log(`Progress: ${processed}/${listData.results.length}`);

    // Small delay between batches
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("Done! Verifying...");
  const count = db.prepare("SELECT COUNT(*) as count FROM abilities").get() as { count: number };
  console.log(`Total abilities in database: ${count.count}`);

  // Show some examples
  const examples = db.prepare("SELECT name, display_name, short_effect FROM abilities LIMIT 5").all();
  console.log("Examples:", examples);
}

downloadAbilities().catch(console.error);
