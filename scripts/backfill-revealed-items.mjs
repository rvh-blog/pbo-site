import Database from "better-sqlite3";

const MIN_SEASON = Number(process.env.REVEALED_ITEMS_MIN_SEASON || "5");
const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL =
  process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const dryRun = process.argv.includes("--dry-run");
const verbose = process.argv.includes("--verbose");

function nameKey(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  let canonical = normalized
    .replace(/incarnate$/, "")
    .replace(/^palafinhero$/, "palafin")
    .replace(/^mimikyu(?:disguised|busted)$/, "mimikyu")
    .replace(/^urshifu(?:rapidstrike|singlestrike)$/, "urshifu")
    .replace(/^darmanitanstandard$/, "darmanitan")
    .replace(/^darmanitangalarstandard$/, "darmanitangalar")
    .replace(/^basculin(?:red|blue)striped$/, "basculin")
    .replace(/^gourgeist(?:average|small|large|super)$/, "gourgeist");

  if (canonical.startsWith("mega")) {
    canonical = canonical.slice(4).replace(/[xy]$/, "");
  }
  return canonical.replace(/mega(?:x|y)?$/, "");
}

function rowKeys(row) {
  return [row.pokemon_name, row.pokemon_display_name].map(nameKey).filter(Boolean);
}

function findTeamMatch(team, row) {
  const keys = new Set(rowKeys(row));
  return team.find((pokemon) => keys.has(nameKey(pokemon.name))) || null;
}

function teamScore(team, rows) {
  return rows.reduce(
    (score, row) => score + (findTeamMatch(team, row) ? 1 : 0),
    0
  );
}

async function scrapeReplay(replayUrl) {
  const response = await fetch(SCRAPE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replayUrl }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Replay scrape failed with ${response.status}`);
  }
  return payload;
}

const db = new Database(DATABASE_PATH);
db.pragma("busy_timeout = 30000");

const hasColumn = db
  .prepare("SELECT 1 FROM pragma_table_info('match_pokemon') WHERE name = 'revealed_items'")
  .get();
if (!hasColumn) {
  db.close();
  throw new Error("match_pokemon.revealed_items is missing; run the held-item migration first");
}

const matches = db
  .prepare(`
    SELECT
      m.id,
      m.replay_url,
      m.coach1_season_id,
      m.coach2_season_id,
      s.season_number
    FROM matches m
    JOIN seasons s ON s.id = m.season_id
    WHERE m.is_forfeit = 0
      AND m.replay_url IS NOT NULL
      AND TRIM(m.replay_url) != ''
      AND s.season_number >= ?
    ORDER BY s.season_number, m.id
  `)
  .all(MIN_SEASON);

const rowsByMatch = db.prepare(`
  SELECT
    mp.id,
    mp.season_coach_id,
    mp.revealed_items,
    p.name AS pokemon_name,
    p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`);

const updateRevealedItems = db.prepare(
  "UPDATE match_pokemon SET revealed_items = ? WHERE id = ?"
);

let processed = 0;
let matchesUpdated = 0;
let rowsUpdated = 0;
let itemReveals = 0;
let unmatchedRows = 0;
let matchesWithoutRows = 0;
let failed = 0;
let ambiguousMappings = 0;
let lowConfidenceMappings = 0;
let minimumMappingMargin = Number.POSITIVE_INFINITY;
let storedDifferences = 0;
const unmatchedNames = new Map();

for (const match of matches) {
  try {
    const matchRows = rowsByMatch.all(match.id);
    if (matchRows.length === 0) {
      matchesWithoutRows++;
      continue;
    }

    const replay = await scrapeReplay(match.replay_url);
    const p1Team = Array.isArray(replay.p1Team) ? replay.p1Team : [];
    const p2Team = Array.isArray(replay.p2Team) ? replay.p2Team : [];
    const coach1Rows = matchRows.filter(
      (row) => row.season_coach_id === match.coach1_season_id
    );
    const coach2Rows = matchRows.filter(
      (row) => row.season_coach_id === match.coach2_season_id
    );
    const p1IsCoach1Score =
      teamScore(p1Team, coach1Rows) + teamScore(p2Team, coach2Rows);
    const p1IsCoach2Score =
      teamScore(p1Team, coach2Rows) + teamScore(p2Team, coach1Rows);
    const mappingMargin = Math.abs(p1IsCoach1Score - p1IsCoach2Score);
    minimumMappingMargin = Math.min(minimumMappingMargin, mappingMargin);
    if (mappingMargin === 0) {
      ambiguousMappings++;
      if (verbose) {
        console.warn(
          `AMBIGUOUS S${match.season_number} match ${match.id}: ${p1IsCoach1Score}-${p1IsCoach2Score}`
        );
      }
    } else if (mappingMargin < 4) {
      lowConfidenceMappings++;
      if (verbose) {
        console.warn(
          `LOW MARGIN S${match.season_number} match ${match.id}: ${p1IsCoach1Score}-${p1IsCoach2Score}`
        );
      }
    }
    const p1IsCoach1 = p1IsCoach1Score >= p1IsCoach2Score;
    const teamBySeasonCoach = new Map([
      [match.coach1_season_id, p1IsCoach1 ? p1Team : p2Team],
      [match.coach2_season_id, p1IsCoach1 ? p2Team : p1Team],
    ]);

    const updates = [];
    for (const row of matchRows) {
      const replayPokemon = findTeamMatch(
        teamBySeasonCoach.get(row.season_coach_id) || [],
        row
      );
      if (!replayPokemon) {
        unmatchedRows++;
        const unmatchedName = row.pokemon_display_name || row.pokemon_name;
        unmatchedNames.set(unmatchedName, (unmatchedNames.get(unmatchedName) || 0) + 1);
        if (verbose) {
          console.warn(
            `UNMATCHED S${match.season_number} match ${match.id}: ${row.pokemon_display_name || row.pokemon_name}`
          );
        }
        continue;
      }

      const revealedItems = Array.isArray(replayPokemon.revealedItems)
        ? replayPokemon.revealedItems
        : [];
      const storedItems = row.revealed_items ? JSON.parse(row.revealed_items) : null;
      if (JSON.stringify(storedItems) !== JSON.stringify(revealedItems)) {
        storedDifferences++;
        if (verbose) {
          console.warn(
            `DRIFT S${match.season_number} match ${match.id}: ${row.pokemon_display_name || row.pokemon_name}`
          );
        }
      }
      updates.push({ rowId: row.id, revealedItems });
      itemReveals += revealedItems.length;
    }

    if (!dryRun && updates.length > 0) {
      db.transaction((pendingUpdates) => {
        for (const update of pendingUpdates) {
          updateRevealedItems.run(
            JSON.stringify(update.revealedItems),
            update.rowId
          );
        }
      })(updates);
    }

    processed++;
    if (updates.length > 0) matchesUpdated++;
    rowsUpdated += updates.length;
    if (verbose || processed % 25 === 0) {
      console.log(
        `${dryRun ? "PLAN" : "DONE"} ${processed}/${matches.length}: Season ${match.season_number}, match ${match.id}`
      );
    }
  } catch (error) {
    failed++;
    console.error(
      `FAIL S${match.season_number} match ${match.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

db.close();
console.log(
  [
    `${dryRun ? "Planned" : "Completed"} ${processed}/${matches.length} replay matches`,
    `${matchesUpdated} matches and ${rowsUpdated} Pokemon rows mapped`,
    `${itemReveals} revealed item records found`,
    `${unmatchedRows} Pokemon rows unmatched`,
    `${matchesWithoutRows} matches had no Pokemon rows`,
    `${ambiguousMappings} ambiguous coach mappings`,
    `${lowConfidenceMappings} low-margin coach mappings`,
    `${storedDifferences} stored rows differ from fresh parsing`,
    `minimum mapping margin ${
      Number.isFinite(minimumMappingMargin) ? minimumMappingMargin : "n/a"
    }`,
    `${failed} replay failures`,
  ].join("; ")
);
if (unmatchedNames.size > 0) {
  console.log(
    "Most common unmatched Pokemon: " +
      Array.from(unmatchedNames.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 20)
        .map(([name, count]) => `${name} (${count})`)
        .join(", ")
  );
}
if (failed > 0) process.exitCode = 1;
