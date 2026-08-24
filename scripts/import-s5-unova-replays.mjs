import Database from "better-sqlite3";

const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const apply = process.argv.includes("--apply");
const ALLOWED_FORMATS = new Set(["[Gen 9] Draft", "[Gen 9] Paldea Dex Draft"]);

const games = [
  // Regular season
  [1, "Sunnyside Suicunes", "Abbotsford Aggrons", "https://replay.pokemonshowdown.com/gen9draft-2046421964"],
  [1, "Worcester Woopers", "Alabama Alakazams", "https://replay.pokemonshowdown.com/gen9draft-2051015832"],
  [1, "Vancouver Valiants", "Pittsburgh Scizors", "https://replay.pokemonshowdown.com/gen9draft-2048921451"],
  [1, "Luscious Lopunnies", "Kingston Shadows", "https://replay.pokemonshowdown.com/gen9draft-2046494856"],
  [1, "Virginia Zekroms", "New York Malamars", "https://replay.pokemonshowdown.com/gen9draft-2050485735"],
  [1, "Sin City Sableye", "New Jersey Dracos", "https://replay.pokemonshowdown.com/gen9draft-2050506868"],
  [1, "Frederick Klefkis", "Charleston Chesnaughts", "https://replay.pokemonshowdown.com/gen9draft-2050410357"],

  [2, "New York Malamars", "Charleston Chesnaughts", "https://replay.pokemonshowdown.com/gen9draft-2057118452"],
  [2, "New Jersey Dracos", "Frederick Klefkis", "https://replay.pokemonshowdown.com/gen9draft-2056617180-m21bkoshn6xlws0apomkrm3jpu1p7jzpw"],
  [2, "Luscious Lopunnies", "Abbotsford Aggrons", "https://replay.pokemonshowdown.com/gen9draft-2055038211"],
  [2, "Worcester Woopers", "Pittsburgh Scizors", "https://replay.pokemonshowdown.com/gen9draft-2055114169"],
  [2, "Alabama Alakazams", "Sin City Sableye", "https://replay.pokemonshowdown.com/gen9draft-2057273120"],
  [2, "Kingston Shadows", "Vancouver Valiants", "https://replay.pokemonshowdown.com/gen9draft-2052652582"],
  [2, "Sunnyside Suicunes", "Virginia Zekroms", "https://replay.pokemonshowdown.com/gen9draft-2057131823"],

  [3, "New York Malamars", "New Jersey Dracos", "https://replay.pokemonshowdown.com/gen9draft-2062511937-btnddlnnk68qom44es43djs9j6a10brpw"],
  [3, "Virginia Zekroms", "Charleston Chesnaughts", "https://replay.pokemonshowdown.com/gen9draft-2063997918"],
  [3, "Frederick Klefkis", "Alabama Alakazams", "https://replay.pokemonshowdown.com/gen9draft-2063189360"],
  [3, "Worcester Woopers", "Kingston Shadows", "https://replay.pokemonshowdown.com/gen9draft-2058037872"],
  [3, "Sunnyside Suicunes", "Pittsburgh Scizors", "https://replay.pokemonshowdown.com/gen9draft-2060403025"],
  [3, "Vancouver Valiants", "Abbotsford Aggrons", "https://replay.pokemonshowdown.com/gen9draft-2061809641"],
  [3, "Sin City Sableye", "Luscious Lopunnies", "https://replay.pokemonshowdown.com/gen9draft-2061468190"],

  [4, "Luscious Lopunnies", "Frederick Klefkis", "https://replay.pokemonshowdown.com/gen9draft-2067589168-q30av3ctsh34ernbzufam9zs9fy4w3wpw"],
  [4, "Alabama Alakazams", "New York Malamars", "https://replay.pokemonshowdown.com/gen9draft-2067603521"],
  [4, "Abbotsford Aggrons", "Worcester Woopers", "https://replay.pokemonshowdown.com/gen9draft-2065564926"],
  [4, "New Jersey Dracos", "Charleston Chesnaughts", "https://replay.pokemonshowdown.com/gen9draft-2067042250"],
  [4, "Kingston Shadows", "Sunnyside Suicunes", "https://replay.pokemonshowdown.com/gen9draft-2062285283"],
  [4, "Pittsburgh Scizors", "Virginia Zekroms", "https://replay.pokemonshowdown.com/gen9draft-2066931771"],
  [4, "Vancouver Valiants", "Sin City Sableye", "https://replay.pokemonshowdown.com/gen9draft-2066334757"],

  [5, "Abbotsford Aggrons", "Alabama Alakazams", "https://replay.pokemonshowdown.com/gen9draft-2073586563"],
  [5, "Sin City Sableye", "Worcester Woopers", "https://replay.pokemonshowdown.com/gen9draft-2072023618"],
  [5, "Virginia Zekroms", "New Jersey Dracos", "https://replay.pokemonshowdown.com/gen9draft-2074301794"],
  [5, "Charleston Chesnaughts", "Sunnyside Suicunes", "https://replay.pokemonshowdown.com/gen9draft-2071410795"],
  [5, "Pittsburgh Scizors", "Kingston Shadows", "https://replay.pokemonshowdown.com/gen9draft-2067661763"],
  [5, "Frederick Klefkis", "Vancouver Valiants", "https://replay.pokemonshowdown.com/gen9draft-2072843696"],
  [5, "New York Malamars", "Luscious Lopunnies", "https://replay.pokemonshowdown.com/gen9draft-2071760024"],

  [6, "Sunnyside Suicunes", "Sin City Sableye", "https://replay.pokemonshowdown.com/gen9draft-2076055188"],
  [6, "Vancouver Valiants", "New York Malamars", "https://replay.pokemonshowdown.com/gen9draft-2078164361"],
  [6, "Charleston Chesnaughts", "Luscious Lopunnies", "https://replay.pokemonshowdown.com/gen9draft-2077473788"],
  [6, "Alabama Alakazams", "New Jersey Dracos", null],
  [6, "Pittsburgh Scizors", "Abbotsford Aggrons", "https://replay.pokemonshowdown.com/gen9draft-2077462864"],
  [6, "Kingston Shadows", "Virginia Zekroms", "https://replay.pokemonshowdown.com/gen9draft-2076047327"],
  [6, "Worcester Woopers", "Frederick Klefkis", "https://replay.pokemonshowdown.com/gen9draft-2076852508"],

  [7, "Frederick Klefkis", "Sunnyside Suicunes", "https://replay.pokemonshowdown.com/gen9draft-2082611893"],
  [7, "Charleston Chesnaughts", "Vancouver Valiants", "https://replay.pokemonshowdown.com/gen9draft-2082617895"],
  [7, "New Jersey Dracos", "Luscious Lopunnies", "https://replay.pokemonshowdown.com/gen9draft-2082625230"],
  [7, "Virginia Zekroms", "Alabama Alakazams", null],
  [7, "New York Malamars", "Worcester Woopers", "https://replay.pokemonshowdown.com/gen9draft-2083273901"],
  [7, "Abbotsford Aggrons", "Kingston Shadows", "https://replay.pokemonshowdown.com/gen9draft-2082599538"],
  [7, "Sin City Sableye", "Pittsburgh Scizors", "https://replay.pokemonshowdown.com/gen9draft-2080959177"],

  [8, "Sunnyside Suicunes", "New York Malamars", "https://replay.pokemonshowdown.com/gen9draft-2089651554"],
  [8, "Pittsburgh Scizors", "Frederick Klefkis", "https://replay.pokemonshowdown.com/gen9draft-2088410913"],
  [8, "Charleston Chesnaughts", "Worcester Woopers", "https://replay.pokemonshowdown.com/gen9draft-2088428759"],
  [8, "New Jersey Dracos", "Vancouver Valiants", "https://replay.pokemonshowdown.com/gen9draft-2088400699"],
  [8, "Abbotsford Aggrons", "Virginia Zekroms", null],
  [8, "Luscious Lopunnies", "Alabama Alakazams", "https://replay.pokemonshowdown.com/gen9draft-2087766616"],
  [8, "Kingston Shadows", "Sin City Sableye", "https://replay.pokemonshowdown.com/gen9draft-2087664771"],

  // Playoffs
  [101, "Abbotsford Aggrons", "Sunnyside Suicunes", "https://replay.pokemonshowdown.com/gen9draft-2098350406"],
  [101, "New York Malamars", "Pittsburgh Scizors", "https://replay.pokemonshowdown.com/gen9draft-2098332964"],
  [101, "Luscious Lopunnies", "Kingston Shadows", "https://replay.pokemonshowdown.com/gen9draft-2090751496"],
  [101, "Alabama Alakazams", "Vancouver Valiants", "https://replay.pokemonshowdown.com/gen9draft-2097094971"],

  [102, "New York Malamars", "Kingston Shadows", "https://replay.pokemonshowdown.com/gen9draft-2106571421"],
  [102, "Abbotsford Aggrons", "Alabama Alakazams", "https://replay.pokemonshowdown.com/gen9draft-2108694596"],

  [103, "Abbotsford Aggrons", "New York Malamars", "https://replay.pokemonshowdown.com/gen9draft-2115141834"],
].map(([week, team1, team2, replayUrl, reviewNote]) => ({ week, team1, team2, replayUrl, reviewNote }));

function nameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/incarnate$/, "")
    .replace(/^palafinhero$/, "palafin")
    .replace(/^mimikyu(?:disguised|busted)$/, "mimikyu")
    .replace(/^urshifu(?:rapidstrike|singlestrike)$/, "urshifu")
    .replace(/^darmanitanstandard$/, "darmanitan")
    .replace(/^darmanitangalarstandard$/, "darmanitangalar")
    .replace(/^basculin(?:red|blue)striped$/, "basculin")
    .replace(/^gourgeist(?:average|small|large|super)$/, "gourgeist")
    .replace(/mega(?:x|y|z)?$/, "");
}

function acceptedKeys(row, acceptedNamesByPokemonId) {
  return new Set([
    row.pokemon_name,
    row.pokemon_display_name,
    ...(acceptedNamesByPokemonId.get(row.pokemon_id) || []),
  ].map(nameKey).filter(Boolean));
}

function findRow(replayPokemon, rows, acceptedNamesByPokemonId) {
  const replayKey = nameKey(replayPokemon.name);
  return rows.find((row) => acceptedKeys(row, acceptedNamesByPokemonId).has(replayKey)) || null;
}

function teamScore(replayTeam, rows, acceptedNamesByPokemonId) {
  return replayTeam.reduce(
    (score, pokemon) => score + (findRow(pokemon, rows, acceptedNamesByPokemonId) ? 1 : 0),
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
  if (!response.ok) throw new Error(payload?.error || `Replay scrape failed with ${response.status}`);
  return payload;
}

const db = new Database(DATABASE_PATH);
db.pragma("busy_timeout = 30000");

for (const column of ["needs_review", "review_notes"]) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('matches') WHERE name = ?").get(column)) {
    db.close();
    throw new Error(`matches.${column} is missing; run startup migrations first`);
  }
}

const season = db.prepare("SELECT id FROM seasons WHERE season_number = 5 LIMIT 1").get();
if (!season) throw new Error("Season 5 was not found");
const division = db.prepare("SELECT id FROM divisions WHERE season_id = ? AND name = 'Unova' LIMIT 1").get(season.id);
if (!division) throw new Error("Season 5 Unova was not found");

const teams = db.prepare("SELECT id, team_name FROM season_coaches WHERE division_id = ?").all(division.id);
const teamIdByName = new Map(teams.map((team) => [team.team_name, team.id]));
const acceptedNamesByPokemonId = new Map();
function addAcceptedName(pokemonId, name) {
  acceptedNamesByPokemonId.set(pokemonId, [...(acceptedNamesByPokemonId.get(pokemonId) || []), name]);
}
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pokemon_name_aliases'").get()) {
  for (const row of db.prepare("SELECT pokemon_id, alias FROM pokemon_name_aliases").all()) addAcceptedName(row.pokemon_id, row.alias);
}
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pokemon_name_collapses'").get()) {
  for (const row of db.prepare("SELECT target_pokemon_id AS pokemon_id, source_name AS alias FROM pokemon_name_collapses").all()) addAcceptedName(row.pokemon_id, row.alias);
}

const findMatch = db.prepare(`
  SELECT * FROM matches
  WHERE season_id = ? AND division_id = ? AND week = ?
    AND ((coach1_season_id = ? AND coach2_season_id = ?)
      OR (coach1_season_id = ? AND coach2_season_id = ?))
  LIMIT 1
`);
const pokemonRowsForMatch = db.prepare(`
  SELECT mp.*, p.name AS pokemon_name, p.display_name AS pokemon_display_name
  FROM match_pokemon mp JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`);
const replayAlreadyUsed = db.prepare("SELECT id FROM matches WHERE replay_url = ? AND id != ? LIMIT 1");
const updateMatch = db.prepare(`
  UPDATE matches SET replay_url = ?, needs_review = ?, review_notes = ?,
    played_at = COALESCE(?, played_at), started_at = COALESCE(?, started_at),
    ended_at = COALESCE(?, ended_at), turn_snapshots = COALESCE(?, turn_snapshots),
    key_events = COALESCE(?, key_events), zoroark_involved = COALESCE(?, zoroark_involved)
  WHERE id = ?
`);
const updatePokemonDetails = db.prepare(`
  UPDATE match_pokemon SET damage_dealt = ?, damage_dealt_indirect = ?, damage_taken = ?,
    damage_taken_indirect = ?, turns_active = ?, hazard_damage_taken = ?, setup_moves_used = ?,
    favorable_crits = ?, favorable_misses = ?, favorable_flinches = ?, favorable_paralysis = ?,
    favorable_freezes = ?, favorable_burns = ?, favorable_sleep = ?, hp_restored = ?,
    moves_used = ?, revealed_items = ? WHERE id = ?
`);

let clean = 0;
let review = 0;
let failed = 0;
const seenMatchIds = new Set();

for (const game of games) {
  const team1Id = teamIdByName.get(game.team1);
  const team2Id = teamIdByName.get(game.team2);
  if (!team1Id || !team2Id) throw new Error(`Unknown team in manifest: ${game.team1} vs ${game.team2}`);
  const match = findMatch.get(season.id, division.id, game.week, team1Id, team2Id, team2Id, team1Id);
  if (!match) throw new Error(`Scheduled match not found: W${game.week} ${game.team1} vs ${game.team2}`);
  if (seenMatchIds.has(match.id)) throw new Error(`Duplicate manifest match: ${match.id}`);
  seenMatchIds.add(match.id);

  const reasons = game.reviewNote ? [game.reviewNote] : [];
  let replay = null;
  let mappedUpdates = [];

  if (!game.replayUrl) {
    if (!match.is_forfeit) reasons.push("Missing replay link for a non-forfeit game");
  } else {
    const duplicate = replayAlreadyUsed.get(game.replayUrl, match.id);
    if (duplicate) reasons.push(`Replay is already attached to match ${duplicate.id}`);
    try {
      replay = await scrapeReplay(game.replayUrl);
      if (!ALLOWED_FORMATS.has(replay.tier)) reasons.push(`Unexpected historical format: ${replay.tier || "unknown"}`);
      if (replay.zoroarkInvolved) reasons.push("Zoroark or Illusion detected; attribution requires manual review");

      const rows = pokemonRowsForMatch.all(match.id);
      const team1Rows = rows.filter((row) => row.season_coach_id === team1Id);
      const team2Rows = rows.filter((row) => row.season_coach_id === team2Id);
      const directScore = teamScore(replay.p1Team, team1Rows, acceptedNamesByPokemonId)
        + teamScore(replay.p2Team, team2Rows, acceptedNamesByPokemonId);
      const swappedScore = teamScore(replay.p1Team, team2Rows, acceptedNamesByPokemonId)
        + teamScore(replay.p2Team, team1Rows, acceptedNamesByPokemonId);
      if (directScore === swappedScore) reasons.push(`Ambiguous team mapping (${directScore}-${swappedScore})`);
      const p1IsTeam1 = directScore >= swappedScore;
      const mappingScore = Math.max(directScore, swappedScore);
      if (mappingScore < 10) reasons.push(`Low roster/Pokemon mapping confidence (${mappingScore}/12)`);

      const replayTeam1 = p1IsTeam1 ? replay.p1Team : replay.p2Team;
      const replayTeam2 = p1IsTeam1 ? replay.p2Team : replay.p1Team;
      const p1TeamId = p1IsTeam1 ? team1Id : team2Id;
      const replayWinnerId = replay.winner === "p1"
        ? p1TeamId
        : replay.winner === "p2"
          ? (p1TeamId === team1Id ? team2Id : team1Id)
          : null;
      if (replayWinnerId !== match.winner_id) reasons.push("Replay winner conflicts with the official PBO result");

      const team1Remaining = p1IsTeam1 ? replay.p1Remaining : replay.p2Remaining;
      const team2Remaining = p1IsTeam1 ? replay.p2Remaining : replay.p1Remaining;
      const replayTeam1Diff = replayWinnerId === team1Id ? team1Remaining : -team2Remaining;
      const replayTeam2Diff = replayWinnerId === team2Id ? team2Remaining : -team1Remaining;
      if (replayTeam1Diff !== match.coach1_differential || replayTeam2Diff !== match.coach2_differential) {
        reasons.push(`Replay differential ${replayTeam1Diff}/${replayTeam2Diff} conflicts with official ${match.coach1_differential}/${match.coach2_differential}`);
      }

      const kdMismatches = [];
      for (const [replayTeam, officialRows] of [[replayTeam1, team1Rows], [replayTeam2, team2Rows]]) {
        for (const replayPokemon of replayTeam) {
          const row = findRow(replayPokemon, officialRows, acceptedNamesByPokemonId);
          if (!row) {
            kdMismatches.push(`${replayPokemon.name} was not found in official match stats`);
            continue;
          }
          if (replayPokemon.kills !== row.kills || replayPokemon.deaths !== row.deaths) {
            kdMismatches.push(`${row.pokemon_display_name || row.pokemon_name}: replay ${replayPokemon.kills}-${replayPokemon.deaths}, official ${row.kills}-${row.deaths}`);
          }
          mappedUpdates.push({ row, replayPokemon });
        }
      }
      if (kdMismatches.length) reasons.push(`PBO kill/death review: ${kdMismatches.join(", ")}`);
    } catch (error) {
      reasons.push(`Replay parse failed: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const needsReview = uniqueReasons.length > 0;
  const note = needsReview ? uniqueReasons.join("; ") : null;

  if (apply) {
    db.transaction(() => {
      updateMatch.run(
        game.replayUrl,
        needsReview ? 1 : 0,
        note,
        replay && !needsReview ? replay.startedAt : null,
        replay && !needsReview ? replay.startedAt : null,
        replay && !needsReview ? replay.endedAt : null,
        replay && !needsReview ? JSON.stringify(replay.turnSnapshots || []) : null,
        replay && !needsReview ? JSON.stringify(replay.keyEvents || []) : null,
        replay && !needsReview ? (replay.zoroarkInvolved ? 1 : 0) : null,
        match.id
      );
      if (replay && !needsReview) {
        for (const { row, replayPokemon } of mappedUpdates) {
          updatePokemonDetails.run(
            replayPokemon.damageDealt ?? null,
            replayPokemon.damageDealtIndirect ?? null,
            replayPokemon.damageTaken ?? null,
            replayPokemon.damageTakenIndirect ?? null,
            replayPokemon.turnsActive ?? null,
            replayPokemon.hazardDamageTaken ?? null,
            replayPokemon.setupMovesUsed ?? null,
            replayPokemon.favorableCrits ?? null,
            replayPokemon.favorableMisses ?? null,
            replayPokemon.favorableFlinches ?? null,
            replayPokemon.favorableParalysis ?? null,
            replayPokemon.favorableFreezes ?? null,
            replayPokemon.favorableBurns ?? null,
            replayPokemon.favorableSleep ?? null,
            replayPokemon.hpRestored ?? null,
            JSON.stringify(replayPokemon.movesUsed || {}),
            JSON.stringify(replayPokemon.revealedItems || []),
            row.id
          );
        }
      }
    })();
  }

  if (needsReview) {
    review++;
    console.log(`REVIEW W${game.week} ${game.team1} vs ${game.team2}: ${note}`);
  } else {
    clean++;
    console.log(`${apply ? "IMPORTED" : "VALID"} W${game.week} ${game.team1} vs ${game.team2}`);
  }
}

const expectedMatchCount = db.prepare("SELECT COUNT(*) AS count FROM matches WHERE season_id = ? AND division_id = ?").get(season.id, division.id).count;
db.close();

if (seenMatchIds.size !== games.length || games.length !== expectedMatchCount) {
  throw new Error(`Manifest coverage mismatch: ${seenMatchIds.size}/${games.length} manifest rows, ${expectedMatchCount} database matches`);
}

console.log(`${apply ? "Applied" : "Audited"} ${games.length} Season 5 Unova games: ${clean} clean, ${review} held for review, ${failed} replay failures.`);
