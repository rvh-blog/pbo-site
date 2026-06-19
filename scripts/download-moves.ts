import Database from "better-sqlite3";

const db = new Database("./pbo.db");

interface MoveListResponse {
  count: number;
  results: { name: string; url: string }[];
}

interface MoveDetail {
  id: number;
  name: string;
  type: { name: string } | null;
  damage_class: { name: string } | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  effect_chance: number | null;
  effect_entries: { short_effect: string; language: { name: string } }[];
  target: { name: string } | null;
  generation: { name: string } | null;
  names: { name: string; language: { name: string } }[];
}

function extractGenNumber(genName: string): number {
  // "generation-i" -> 1, "generation-iv" -> 4, etc.
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

async function downloadMoves() {
  console.log("Fetching move list...");

  // Get all move URLs
  const listRes = await fetchWithRetry("https://pokeapi.co/api/v2/move?limit=1000");
  const listData: MoveListResponse = await listRes.json();
  console.log(`Found ${listData.count} moves`);

  // Prepare insert statement
  const insert = db.prepare(`
    INSERT OR REPLACE INTO moves (
      pokeapi_id, name, display_name, type, damage_class,
      power, accuracy, pp, priority, effect_chance,
      effect_description, target, generation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batchSize = 20;
  let processed = 0;

  for (let i = 0; i < listData.results.length; i += batchSize) {
    const batch = listData.results.slice(i, i + batchSize);

    // Fetch moves in parallel (small batches to avoid rate limits)
    const moveDetails = await Promise.all(
      batch.map(async (m) => {
        const res = await fetchWithRetry(m.url);
        return res.json() as Promise<MoveDetail>;
      })
    );

    // Insert into database
    for (const move of moveDetails) {
      const englishEffect = move.effect_entries.find((e) => e.language.name === "en");
      const englishName = move.names.find((n) => n.language.name === "en");

      insert.run(
        move.id,
        move.name,
        englishName?.name || formatDisplayName(move.name),
        move.type?.name || null,
        move.damage_class?.name || null,
        move.power,
        move.accuracy,
        move.pp,
        move.priority,
        move.effect_chance,
        englishEffect?.short_effect || null,
        move.target?.name || null,
        move.generation ? extractGenNumber(move.generation.name) : null
      );
    }

    processed += batch.length;
    console.log(`Progress: ${processed}/${listData.results.length}`);

    // Small delay between batches
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("Done! Verifying...");
  const count = db.prepare("SELECT COUNT(*) as count FROM moves").get() as { count: number };
  console.log(`Total moves in database: ${count.count}`);

  // Show some examples
  const examples = db.prepare("SELECT name, display_name, type, power, accuracy FROM moves LIMIT 5").all();
  console.log("Examples:", examples);
}

downloadMoves().catch(console.error);
