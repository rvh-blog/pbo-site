import Database from "better-sqlite3";

const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const apply = process.argv.includes("--apply");
const ALLOWED_FORMATS = new Set(["[Gen 9] Draft", "[Gen 9] Paldea Dex Draft"]);

const games = [
  // Regular season
  [1, "Caborca Gengars", "Toronto Staraptors", "https://replay.pokemonshowdown.com/gen9draft-2049704337-0sjvf19m2p6ar42aajnh5ugajtkqypfpw"],
  [1, "Tokyo Teddiursas", "Tottenham Hoothoots", "https://replay.pokemonshowdown.com/gen9draft-2049630775-a4de9ccvrpeltsmjvr6aiobpi53n9yjpw"],
  [1, "Gros Morne Growlithes", "Philadelphia Flygons", "https://replay.pokemonshowdown.com/gen9draft-2051132743"],
  [1, "Memphis Magcargos", "St. Louis Solgaleos", "https://replay.pokemonshowdown.com/gen9draft-2051783438"],
  [1, "Boston Banettes", "Detroit Zoroarks", "https://replay.pokemonshowdown.com/gen9draft-2051895791"],
  [1, "Norwalk Noiverns", "Indianapolis Incineroars", "https://replay.pokemonshowdown.com/dl-gen9paldeadexdraft-132119-l5t2utkkn49ag4hc2tgxr3u5ruwpaqjpw"],
  [1, "Glamorgan Vale Great Tusks", "Ottawa Donphans", "https://replay.pokemonshowdown.com/gen9draft-2051146296-8472oqo4yfaq6md6k3jzsb9ssqeb9pmpw"],

  [2, "Detroit Zoroarks", "Ottawa Donphans", "https://replay.pokemonshowdown.com/gen9draft-2056603708"],
  [2, "Indianapolis Incineroars", "Glamorgan Vale Great Tusks", null, "Missing replay link"],
  [2, "Memphis Magcargos", "Toronto Staraptors", "https://replay.pokemonshowdown.com/gen9draft-2056565189"],
  [2, "Tokyo Teddiursas", "Philadelphia Flygons", "https://replay.pokemonshowdown.com/gen9draft-2056408114"],
  [2, "Tottenham Hoothoots", "Norwalk Noiverns", "https://replay.pokemonshowdown.com/gen9draft-2053561104-vyq29ng6p5h9ypcta72m7kcgevu5uy3pw"],
  [2, "St. Louis Solgaleos", "Gros Morne Growlithes", "https://replay.pokemonshowdown.com/gen9draft-2055838344-tnrkt9na0johr60iu6nruji417wx8iupw"],
  [2, "Caborca Gengars", "Boston Banettes", "https://replay.pokemonshowdown.com/gen9draft-2055935042-adg695ko6h93cd8ibqp6itw5ruzfpegpw"],

  [3, "Detroit Zoroarks", "Indianapolis Incineroars", "https://replay.pokemonshowdown.com/gen9draft-2061248146"],
  [3, "Boston Banettes", "Ottawa Donphans", "https://replay.pokemonshowdown.com/gen9draft-2061122138"],
  [3, "Glamorgan Vale Great Tusks", "Tottenham Hoothoots", "https://replay.pokemonshowdown.com/gen9draft-2061826092-sf9i1ebgcj5nrv1ubiitz5wa378oxrypw"],
  [3, "Tokyo Teddiursas", "St. Louis Solgaleos", "https://replay.pokemonshowdown.com/gen9draft-2061086658"],
  [3, "Caborca Gengars", "Philadelphia Flygons", "https://replay.pokemonshowdown.com/gen9draft-2060373069-fj2rxh9dt5z346w445mf6u89gjiihhqpw"],
  [3, "Gros Morne Growlithes", "Toronto Staraptors", "https://replay.pokemonshowdown.com/gen9draft-2061768036"],
  [3, "Norwalk Noiverns", "Memphis Magcargos", "https://replay.pokemonshowdown.com/gen9draft-2064092568"],

  [4, "Memphis Magcargos", "Glamorgan Vale Great Tusks", null, "Missing replay link"],
  [4, "Tottenham Hoothoots", "Detroit Zoroarks", "https://replay.pokemonshowdown.com/gen9draft-2066938596-vo1r7n7ylkgtvlap1yhdkluj13m6ek4pw"],
  [4, "Toronto Staraptors", "Tokyo Teddiursas", "https://replay.pokemonshowdown.com/gen9draft-2066823108"],
  [4, "Indianapolis Incineroars", "Ottawa Donphans", "https://replay.pokemonshowdown.com/gen9draft-2067560883"],
  [4, "St. Louis Solgaleos", "Caborca Gengars", "https://replay.pokemonshowdown.com/gen9draft-2066349502"],
  [4, "Philadelphia Flygons", "Boston Banettes", "https://replay.pokemonshowdown.com/gen9draft-2067630211"],
  [4, "Gros Morne Growlithes", "Norwalk Noiverns", "https://replay.pokemonshowdown.com/gen9draft-2067714235"],

  [5, "Toronto Staraptors", "Tottenham Hoothoots", "https://replay.pokemonshowdown.com/gen9draft-2071502763-to0uzt8smdcyupgis96jqyfldpk96jtpw"],
  [5, "Norwalk Noiverns", "Tokyo Teddiursas", "https://replay.pokemonshowdown.com/gen9draft-2071968140"],
  [5, "Boston Banettes", "Indianapolis Incineroars", "https://replay.pokemonshowdown.com/gen9draft-2070628435"],
  [5, "Ottawa Donphans", "Caborca Gengars", "https://replay.pokemonshowdown.com/gen9draft-2071475154"],
  [5, "Philadelphia Flygons", "St. Louis Solgaleos", "https://replay.pokemonshowdown.com/gen9draft-2072539056"],
  [5, "Glamorgan Vale Great Tusks", "Gros Morne Growlithes", "https://replay.pokemonshowdown.com/gen9draft-2071393068-lbyl1pizbuql1aqiqcppy357fekvznzpw"],
  [5, "Detroit Zoroarks", "Memphis Magcargos", "https://replay.pokemonshowdown.com/gen9draft-2073671457"],

  [6, "Caborca Gengars", "Norwalk Noiverns", "https://replay.pokemonshowdown.com/gen9draft-2077914553-z48rbabrp0gn1lhdvze3epa084egavwpw"],
  [6, "Gros Morne Growlithes", "Detroit Zoroarks", "https://replay.pokemonshowdown.com/gen9draft-2077517840"],
  [6, "Ottawa Donphans", "Memphis Magcargos", null, "Missing replay link"],
  [6, "Tottenham Hoothoots", "Indianapolis Incineroars", "https://replay.pokemonshowdown.com/gen9draft-2077252386-2qm6ht3rc3lgt650bo7xnw2b4aurlxvpw"],
  [6, "Philadelphia Flygons", "Toronto Staraptors", "https://replay.pokemonshowdown.com/gen9draft-2078101237"],
  [6, "St. Louis Solgaleos", "Boston Banettes", "https://replay.pokemonshowdown.com/gen9draft-2076659218"],
  [6, "Tokyo Teddiursas", "Glamorgan Vale Great Tusks", "https://replay.pokemonshowdown.com/gen9draft-2077417488-ev73hpruvfzq3jnusorof9lwfgmdwg0pw"],

  [7, "Glamorgan Vale Great Tusks", "Caborca Gengars", "https://replay.pokemonshowdown.com/gen9draft-2084885303-nqe6yekpyelsvbued3u7yulr4wgwp2gpw"],
  [7, "Ottawa Donphans", "Gros Morne Growlithes", "https://replay.pokemonshowdown.com/gen9draft-2082554619"],
  [7, "Indianapolis Incineroars", "Memphis Magcargos", null, "Missing replay link"],
  [7, "Boston Banettes", "Tottenham Hoothoots", "https://replay.pokemonshowdown.com/gen9draft-2082579439-n22dvsezucinr8s0qja3weo1kbeqcnvpw"],
  [7, "Detroit Zoroarks", "Tokyo Teddiursas", "https://replay.pokemonshowdown.com/gen9draft-2082420323"],
  [7, "Toronto Staraptors", "St. Louis Solgaleos", "https://replay.pokemonshowdown.com/gen9draft-2083092605"],
  [7, "Norwalk Noiverns", "Philadelphia Flygons", "https://replay.pokemonshowdown.com/gen9draft-2083117610-hy12jcwezkgmldohp24utove0sb9f0rpw"],

  [8, "Caborca Gengars", "Detroit Zoroarks", "https://replay.pokemonshowdown.com/gen9draft-2088455044-4cpfeyh2z0pnh1xhgqsgmq281jghp1upw"],
  [8, "Philadelphia Flygons", "Glamorgan Vale Great Tusks", "https://replay.pokemonshowdown.com/gen9draft-2088372443-rcma7bb4udb4r4xsv0esrcqz0ilykonpw"],
  [8, "Ottawa Donphans", "Tokyo Teddiursas", "https://replay.pokemonshowdown.com/gen9draft-2088287104"],
  [8, "Indianapolis Incineroars", "Gros Morne Growlithes", "https://replay.pokemonshowdown.com/gen9draft-2088346714"],
  [8, "Toronto Staraptors", "Boston Banettes", "https://replay.pokemonshowdown.com/gen9draft-2088205464"],
  [8, "Memphis Magcargos", "Tottenham Hoothoots", null, "Missing replay link"],
  [8, "St. Louis Solgaleos", "Norwalk Noiverns", null, "Missing replay link"],

  // Playoffs
  [101, "Tokyo Teddiursas", "Boston Banettes", "https://replay.pokemonshowdown.com/gen9draft-2096951725"],
  [101, "Glamorgan Vale Great Tusks", "Detroit Zoroarks", "https://replay.pokemonshowdown.com/gen9draft-2098287023-8d7lhqlgge4amz7ooa7hhbtlvd6wohtpw"],
  [101, "Philadelphia Flygons", "Caborca Gengars", "https://replay.pokemonshowdown.com/gen9draft-2097106315-9kz3hltps56359hum5ym3v5qhxpgizspw"],
  [101, "Indianapolis Incineroars", "Norwalk Noiverns", "https://replay.pokemonshowdown.com/gen9draft-2097726812-b0uqgl4b73ww7gg6gvcjagtgs3x9hl7pw"],
  [102, "Glamorgan Vale Great Tusks", "Philadelphia Flygons", "https://replay.pokemonshowdown.com/gen9draft-2105884161-pylfk1w10621024cs538xwr6fme6azzpw", "Official result was administratively reversed to a GVGT win because Philadelphia used an illegal slow Baton Pass"],
  [102, "Tokyo Teddiursas", "Norwalk Noiverns", "https://replay.pokemonshowdown.com/gen9draft-2108088203"],
  [103, "Norwalk Noiverns", "Glamorgan Vale Great Tusks", "https://replay.pokemonshowdown.com/gen9draft-2113035297-gtqz0doqmm28e68y6tptiwfo4uqwg40pw"],
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
const division = db.prepare("SELECT id FROM divisions WHERE season_id = ? AND name = 'Kalos' LIMIT 1").get(season.id);
if (!division) throw new Error("Season 5 Kalos was not found");

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
    reasons.push("Missing replay link");
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

console.log(`${apply ? "Applied" : "Audited"} ${games.length} Season 5 Kalos games: ${clean} clean, ${review} held for review, ${failed} replay failures.`);
