import Database from "better-sqlite3";

const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const apply = process.argv.includes("--apply");
const summaryOnly = process.argv.includes("--summary-only");

function report(...args) {
  if (!summaryOnly) console.log(...args);
}

// These are the replay URLs supplied in the Season 6 Neon and Sunset source dumps.
// The script discovers the official fixture from the season's stored rosters, then
// marks anything that cannot be mapped cleanly for review instead of guessing.
const replayUrls = [
  // Neon source dump
  "https://replay.pokemonshowdown.com/gen9draft-2141473138",
  "https://replay.pokemonshowdown.com/gen9draft-2142484910",
  "https://replay.pokemonshowdown.com/gen9draft-2143960796",
  "https://replay.pokemonshowdown.com/gen9draft-2144056811",
  "https://replay.pokemonshowdown.com/gen9draft-2144067910",
  "https://replay.pokemonshowdown.com/gen9draft-2144461704",
  "https://replay.pokemonshowdown.com/gen9draft-2147142572",
  "https://replay.pokemonshowdown.com/gen9draft-2148029975",
  "https://replay.pokemonshowdown.com/gen9draft-2148182999",
  "https://replay.pokemonshowdown.com/gen9draft-2148300871",
  "https://replay.pokemonshowdown.com/gen9draft-2148318351",
  "https://replay.pokemonshowdown.com/gen9draft-2148679315-k2ubmatvgqobglnvmgfj87c0w8wx6r5pw",
  "https://replay.pokemonshowdown.com/gen9draft-2148795865",
  "https://replay.pokemonshowdown.com/gen9draft-2150469463",
  "https://replay.pokemonshowdown.com/gen9draft-2152306742",
  "https://replay.pokemonshowdown.com/gen9draft-2152929067",
  "https://replay.pokemonshowdown.com/gen9draft-2152978893",
  "https://replay.pokemonshowdown.com/gen9draft-2153191721-zkkegxq8xf338xh6bf5sqfns08ur88xpw",
  "https://replay.pokemonshowdown.com/gen9draft-2153405411",
  "https://replay.pokemonshowdown.com/gen9draft-2154664731",
  "https://replay.pokemonshowdown.com/gen9draft-2155305079",
  "https://replay.pokemonshowdown.com/gen9draft-2155903931",
  "https://replay.pokemonshowdown.com/gen9draft-2156148474-coi9wceh41dkzqpberqk69zx6v4ezljpw",
  "https://replay.pokemonshowdown.com/gen9draft-2156781821",
  "https://replay.pokemonshowdown.com/gen9draft-2156807456",
  "https://replay.pokemonshowdown.com/gen9draft-2157514275",
  "https://replay.pokemonshowdown.com/gen9draft-2158731243",
  "https://replay.pokemonshowdown.com/gen9draft-2159368596",
  "https://replay.pokemonshowdown.com/gen9draft-2159685206",
  "https://replay.pokemonshowdown.com/gen9draft-2160998467",
  "https://replay.pokemonshowdown.com/gen9draft-2161031043",
  "https://replay.pokemonshowdown.com/gen9draft-2161070615",
  "https://replay.pokemonshowdown.com/gen9draft-2163101675-r0ixpu84gz95p5vva6eggpi9spt4bkgpw",
  "https://replay.pokemonshowdown.com/gen9draft-2163390458",
  "https://replay.pokemonshowdown.com/gen9draft-2164578917",
  "https://replay.pokemonshowdown.com/gen9draft-2164887646",
  "https://replay.pokemonshowdown.com/gen9draft-2165120339",
  "https://replay.pokemonshowdown.com/gen9draft-2165123171",
  "https://replay.pokemonshowdown.com/gen9draft-2166694045",
  "https://replay.pokemonshowdown.com/gen9draft-2168521137-6al18mv1s59o7v0s8a1rmf7xhl0919gpw",
  "https://replay.pokemonshowdown.com/gen9draft-2169008537",
  "https://replay.pokemonshowdown.com/gen9draft-2169194698-8yp8pe92ils2ckayhl187kjdob7vo90pw",
  "https://replay.pokemonshowdown.com/gen9draft-2169232696",
  "https://replay.pokemonshowdown.com/gen9draft-2169236853",
  "https://replay.pokemonshowdown.com/gen9draft-2171669126",
  "https://replay.pokemonshowdown.com/gen9draft-2172092976",
  "https://replay.pokemonshowdown.com/gen9draft-2172293804",
  "https://replay.pokemonshowdown.com/gen9draft-2172931126-700dhr2blakb5j7yqsfc5gzxdrhc64epw",
  "https://replay.pokemonshowdown.com/gen9draft-2173232489",
  "https://replay.pokemonshowdown.com/gen9draft-2178919619-luzdexe9hjel9ux9ldoo7ism8uh99vwpw",
  "https://replay.pokemonshowdown.com/gen9draft-2181034086",
  "https://replay.pokemonshowdown.com/gen9draft-2182549413",
  "https://replay.pokemonshowdown.com/gen9draft-2182933432-8lls8jehfx876kr481wfvr1vek1c3bnpw",
  "https://replay.pokemonshowdown.com/gen9draft-2186497308-9ciqhgrdhybah5ie7rkdko91v3x0ch7pw",
  "https://replay.pokemonshowdown.com/gen9draft-2192357351-muesl91eny7au2773zdif13355lpouwpw",

  // Sunset source dump
  "https://replay.pokemonshowdown.com/gen9draft-2142309553",
  "https://replay.pokemonshowdown.com/gen9draft-2142651713",
  "https://replay.pokemonshowdown.com/gen9terapreviewdraft-2142876891",
  "https://replay.pokemonshowdown.com/gen9draft-2143873245",
  "https://replay.pokemonshowdown.com/gen9draft-2143902922",
  "https://replay.pokemonshowdown.com/gen9draft-2143989716",
  "https://replay.pokemonshowdown.com/gen9draft-2144027548",
  "https://replay.pokemonshowdown.com/gen9draft-2146946469",
  "https://replay.pokemonshowdown.com/gen9draft-2148342759",
  "https://replay.pokemonshowdown.com/gen9draft-2148778097-eoyeeyvd2q4n7sqdn446u9o6zp4soglpw",
  "https://replay.pokemonshowdown.com/gen9draft-2148803466",
  "https://replay.pokemonshowdown.com/gen9draft-2148810824",
  "https://replay.pokemonshowdown.com/gen9draft-2149865108",
  "https://replay.pokemonshowdown.com/gen9draft-2150040463",
  "https://replay.pokemonshowdown.com/gen9draft-2152930792",
  "https://replay.pokemonshowdown.com/gen9draft-2152952928",
  "https://replay.pokemonshowdown.com/gen9draft-2153001065",
  "https://replay.pokemonshowdown.com/gen9draft-2153030711",
  "https://replay.pokemonshowdown.com/gen9draft-2153536907",
  "https://replay.pokemonshowdown.com/gen9draft-2154228316",
  "https://replay.pokemonshowdown.com/gen9draft-2154607706",
  "https://replay.pokemonshowdown.com/gen9draft-2156642664",
  "https://replay.pokemonshowdown.com/gen9draft-2156741379",
  "https://replay.pokemonshowdown.com/gen9draft-2156950567",
  "https://replay.pokemonshowdown.com/gen9draft-2157088940-vxb8rvepvwodjcf0kln758jytlfv9u0pw",
  "https://replay.pokemonshowdown.com/gen9draft-2157505717",
  "https://replay.pokemonshowdown.com/gen9draft-2157548710",
  "https://replay.pokemonshowdown.com/gen9draft-2159928297",
  "https://replay.pokemonshowdown.com/gen9draft-2159965980",
  "https://replay.pokemonshowdown.com/gen9draft-2160304561",
  "https://replay.pokemonshowdown.com/gen9draft-2160345228",
  "https://replay.pokemonshowdown.com/gen9draft-2161001161",
  "https://replay.pokemonshowdown.com/gen9draft-2161034430",
  "https://replay.pokemonshowdown.com/gen9draft-2161121814",
  "https://replay.pokemonshowdown.com/gen9draft-2163441887",
  "https://replay.pokemonshowdown.com/gen9draft-2164295505",
  "https://replay.pokemonshowdown.com/gen9draft-2164957715",
  "https://replay.pokemonshowdown.com/gen9draft-2165111673",
  "https://replay.pokemonshowdown.com/gen9draft-2165191868",
  "https://replay.pokemonshowdown.com/gen9draft-2165681788",
  "https://replay.pokemonshowdown.com/gen9draft-2166067443",
  "https://replay.pokemonshowdown.com/gen9draft-2166950765",
  "https://replay.pokemonshowdown.com/gen9draft-2168020484",
  "https://replay.pokemonshowdown.com/gen9draft-2168140341",
  "https://replay.pokemonshowdown.com/gen9draft-2168460991",
  "https://replay.pokemonshowdown.com/gen9draft-2168945169",
  "https://replay.pokemonshowdown.com/gen9draft-2170274211",
  "https://replay.pokemonshowdown.com/gen9draft-2172082091",
  "https://replay.pokemonshowdown.com/gen9draft-2172694629",
  "https://replay.pokemonshowdown.com/gen9draft-2173317846",
  "https://replay.pokemonshowdown.com/gen9draft-2173359347",
  "https://replay.pokemonshowdown.com/gen9draft-2174330272",
  "https://replay.pokemonshowdown.com/gen9draft-2178658728",
  "https://replay.pokemonshowdown.com/gen9draft-2181487756",
  "https://replay.pokemonshowdown.com/gen9draft-2182994273",
  "https://replay.pokemonshowdown.com/gen9draft-2184757096-t1jth6x0jrhu2iafn9oyunvgwwxg52apw",
  "https://replay.pokemonshowdown.com/gen9draft-2187942180",
  "https://replay.pokemonshowdown.com/gen9draft-2198123220-4dqt8hvsd6pvcgmf0ivbsarb2ibcb5apw",

  // Stargazer source dump
  "https://replay.pokemonshowdown.com/gen9draft-2142697457",
  "https://replay.pokemonshowdown.com/gen9draft-2142794936",
  "https://replay.pokemonshowdown.com/gen9draft-2143543624",
  "https://replay.pokemonshowdown.com/gen9draft-2143567773",
  "https://replay.pokemonshowdown.com/gen9draft-2144045590",
  "https://replay.pokemonshowdown.com/gen9draft-2144646397-x6uxkzvmy52p1d6vsb5wkvt1pt30gbwpw",
  "https://replay.pokemonshowdown.com/gen9draft-2144663584",
  "https://replay.pokemonshowdown.com/gen9draft-2147585050",
  "https://replay.pokemonshowdown.com/gen9draft-2147726403-vnpp1cmh79eq92mtsvmsf9t9n2omtufpw",
  "https://replay.pokemonshowdown.com/gen9draft-2147776738-s56wddxsc86wu9y4swu5sl8j7bvtbympw",
  "https://replay.pokemonshowdown.com/gen9draft-2148263807",
  "https://replay.pokemonshowdown.com/gen9draft-2148325256",
  "https://replay.pokemonshowdown.com/gen9draft-2148857815",
  "https://replay.pokemonshowdown.com/gen9draft-2149352767",
  "https://replay.pokemonshowdown.com/gen9draft-2151906948-pqj6yf8ln3ufcbjbcvxvfrrlno3zpntpw",
  "https://replay.pokemonshowdown.com/gen9draft-2152362406",
  "https://replay.pokemonshowdown.com/gen9draft-2152415659",
  "https://replay.pokemonshowdown.com/gen9draft-2152439048",
  "https://replay.pokemonshowdown.com/gen9draft-2152445725-q7c9x93l8v0f81o0zpul5b56hl5qcd4pw",
  "https://replay.pokemonshowdown.com/gen9draft-2152971196-6j0un4hksny8amuvbi1ezq7y7xxgs63pw",
  "https://replay.pokemonshowdown.com/gen9draft-2154225232-ximkye4twk2xs2p6gfq8hhfi9zty246pw",
  "https://replay.pokemonshowdown.com/gen9draft-2154795089",
  "https://replay.pokemonshowdown.com/gen9draft-2155300387",
  "https://replay.pokemonshowdown.com/gen9draft-2156416631",
  "https://replay.pokemonshowdown.com/gen9draft-2156991331",
  "https://replay.pokemonshowdown.com/gen9draft-2156982526",
  "https://replay.pokemonshowdown.com/gen9draft-2157527782-wabcy391k67v0jt8svrhuer2a5ferqxpw",
  "https://replay.pokemonshowdown.com/gen9draft-2159184782",
  "https://replay.pokemonshowdown.com/gen9draft-2159978261",
  "https://replay.pokemonshowdown.com/gen9draft-2160508298",
  "https://replay.pokemonshowdown.com/gen9draft-2160991192",
  "https://replay.pokemonshowdown.com/gen9draft-2161022788",
  "https://replay.pokemonshowdown.com/gen9draft-2161050171",
  "https://replay.pokemonshowdown.com/gen9draft-2161073475",
  "https://replay.pokemonshowdown.com/gen9draft-2164037018",
  "https://replay.pokemonshowdown.com/gen9draft-2164096401",
  "https://replay.pokemonshowdown.com/gen9draft-2164562556",
  "https://replay.pokemonshowdown.com/gen9draft-2165034926",
  "https://replay.pokemonshowdown.com/gen9draft-2165081049-op7ed62icu910dcavh01xfcj7zvrngmpw",
  "https://replay.pokemonshowdown.com/gen9draft-2165117276",
  "https://replay.pokemonshowdown.com/gen9draft-2168136419",
  "https://replay.pokemonshowdown.com/gen9draft-2168714979",
  "https://replay.pokemonshowdown.com/gen9draft-2169211837-lsjvt4bsi4x2ioga5n0d7g353tnofejpw",
  "https://replay.pokemonshowdown.com/gen9draft-2169223836",
  "https://replay.pokemonshowdown.com/gen9draft-2169238596",
  "https://replay.pokemonshowdown.com/gen9draft-2169262201-e2at7zleeaxye5beer01tn3ee2kra0gpw",
  "https://replay.pokemonshowdown.com/gen9draft-2169270486",
  "https://replay.pokemonshowdown.com/gen9draft-2172381200",
  "https://replay.pokemonshowdown.com/gen9draft-2173035132",
  "https://replay.pokemonshowdown.com/gen9draft-2173542262-zjray9dfon8xdk72jfsx6roq0jah3vopw",
  "https://replay.pokemonshowdown.com/gen9draft-2173637197",
  "https://replay.pokemonshowdown.com/gen9draft-2173628832",
  "https://replay.pokemonshowdown.com/gen9draft-2173650864",
  "https://replay.pokemonshowdown.com/gen9draft-2173679043",
  "https://replay.pokemonshowdown.com/gen9draft-2181015165",
  "https://replay.pokemonshowdown.com/gen9draft-2181998361",
  "https://replay.pokemonshowdown.com/gen9draft-2182843857-0b92u4zshkw7qq1nrlvz86sgx0156rnpw",
  "https://replay.pokemonshowdown.com/gen9draft-2182962097-f8u83vutodbo1zq1tbic8uih8xl4qd8pw",
  "https://replay.pokemonshowdown.com/gen9draft-2187258621",
  "https://replay.pokemonshowdown.com/gen9draft-2191691160-wii6g05vuce9rw5euwwdk70hvzfz74wpw",
];

const manualReviewHints = new Map([
  [
    "https://replay.pokemonshowdown.com/gen9terapreviewdraft-2142876891",
    "Source note labels this as a Crystal-division Gholdengo Champions vs Chicago match; verify the Season 6 Sunset fixture before publishing.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2154607706",
    "Supplied message title names different players (Drew825 vs Geotarou) than the mapped Sunset fixture; verify the replay and fixture.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2164096401",
    "Source notes explicitly correct the replay label to Garden City Grotles vs Golden State Durants; verify that corrected fixture mapping.",
  ],
]);

function nameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^mega/, "")
    .replace(/mega(?:x|y|z)?$/, "")
    .replace(/(?:incarnate|average|standard|hero|disguised|busted)$/, "")
    .replace(/^palafinhero$/, "palafin")
    .replace(/^mimikyu(?:disguised|busted)$/, "mimikyu")
    .replace(/^urshifu(?:rapidstrike|singlestrike)$/, "urshifu")
    .replace(/^gourgeist(?:average|small|large|super)$/, "gourgeist");
}

function distinctMatch(replayTeam, rows) {
  const used = new Set();
  let score = 0;
  const matches = [];
  for (const pokemon of replayTeam || []) {
    const key = nameKey(pokemon.name);
    const row = rows.find((candidate) => !used.has(candidate.id) && new Set([
      candidate.pokemon_name,
      candidate.pokemon_display_name,
    ].map(nameKey)).has(key));
    if (row) {
      used.add(row.id);
      score++;
      matches.push({ row, pokemon });
    }
  }
  return { score, matches };
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

for (const [column, definition] of [
  ["needs_review", "INTEGER NOT NULL DEFAULT 0"],
  ["review_notes", "TEXT"],
]) {
  const exists = db.prepare("SELECT 1 FROM pragma_table_info('matches') WHERE name = ?").get(column);
  if (!exists && apply) db.exec(`ALTER TABLE matches ADD COLUMN ${column} ${definition}`);
  if (!exists && !apply) console.warn(`DRY RUN: matches.${column} is absent; apply requires the startup migration columns.`);
}

const matches = db.prepare(`
  SELECT m.*, d.name AS division_name, s.season_number,
    c1.team_name AS coach1_name, c2.team_name AS coach2_name,
    w.team_name AS winner_name
  FROM matches m
  JOIN divisions d ON d.id = m.division_id
  JOIN seasons s ON s.id = m.season_id
  JOIN season_coaches c1 ON c1.id = m.coach1_season_id
  JOIN season_coaches c2 ON c2.id = m.coach2_season_id
  LEFT JOIN season_coaches w ON w.id = m.winner_id
    WHERE s.season_number = 6 AND d.name IN ('Neon', 'Sunset', 'Stargazer')
  ORDER BY d.name, m.week, m.id
`).all();

const rowsByMatch = db.prepare(`
  SELECT mp.*, p.name AS pokemon_name, p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`);

const updateMatch = db.prepare(`
  UPDATE matches SET replay_url = ?, needs_review = ?, review_notes = ?,
    played_at = COALESCE(?, played_at), started_at = COALESCE(?, started_at),
    ended_at = COALESCE(?, ended_at), turn_snapshots = COALESCE(?, turn_snapshots),
    key_events = COALESCE(?, key_events), zoroark_involved = COALESCE(?, zoroark_involved)
  WHERE id = ?
`);
const updatePokemon = db.prepare(`
  UPDATE match_pokemon SET kills = ?, deaths = ?, damage_dealt = ?,
    damage_dealt_indirect = ?, damage_taken = ?, damage_taken_indirect = ?,
    turns_active = ?, hazard_damage_taken = ?, setup_moves_used = ?,
    favorable_crits = ?, favorable_misses = ?, favorable_flinches = ?,
    favorable_paralysis = ?, favorable_freezes = ?, favorable_burns = ?,
    favorable_sleep = ?, hp_restored = ?, moves_used = ?, revealed_items = ?
  WHERE id = ?
`);
const deleteKillEvents = db.prepare("DELETE FROM kill_events WHERE match_id = ?");
const insertKillEvent = db.prepare(`
  INSERT INTO kill_events (
    match_id, turn, killer_pokemon_id, killer_season_coach_id,
    victim_pokemon_id, victim_season_coach_id, move_id, move_name, cause
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const moveIdByName = new Map(
  db.prepare("SELECT id, name, display_name FROM moves").all().flatMap((move) => [
    [String(move.name || "").toLowerCase(), move.id],
    [String(move.display_name || "").toLowerCase(), move.id],
  ]).filter(([name]) => name)
);

function reviewReasonList(reasons) {
  return [...new Set(reasons.filter(Boolean))];
}

function eventCause(event) {
  const cause = String(event.cause || "").toLowerCase();
  if (cause.includes("stealth rock") || cause.includes("spikes")) return "hazard";
  if (cause.includes("sandstorm") || cause.includes("hail")) return "weather";
  if (["psn", "tox", "brn"].includes(cause) || cause.includes("leech seed") || cause.includes("salt cure") || cause.includes("curse")) return "status";
  if (cause.includes("recoil") || cause.includes("life orb")) return "recoil";
  if (cause.includes("rocky helmet") || cause.includes("rough skin") || cause.includes("iron barbs")) return "contact";
  if (cause.includes("future sight") || cause.includes("doom desire")) return "move";
  // Keep this in lockstep with src/app/api/matches/route.ts. A faint with no
  // recognized secondary cause is a direct move KO for the site's purposes.
  return "move";
}

function insertCurrentKillEvents(match, replay, mappedRows, p1IsCoach1) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kill_events'").get()) return;
  const byCoachAndName = new Map();
  for (const { row } of mappedRows) {
    byCoachAndName.set(`${row.season_coach_id}:${nameKey(row.pokemon_name)}`, row);
    if (row.pokemon_display_name) byCoachAndName.set(`${row.season_coach_id}:${nameKey(row.pokemon_display_name)}`, row);
  }
  const p1Coach = p1IsCoach1 ? match.coach1_season_id : match.coach2_season_id;
  const p2Coach = p1IsCoach1 ? match.coach2_season_id : match.coach1_season_id;
  const coachForPlayer = (player) => player === "p1" ? p1Coach : p2Coach;
  const keyEvents = Array.isArray(replay.keyEvents) ? replay.keyEvents : [];
  deleteKillEvents.run(match.id);
  for (const event of keyEvents.filter((entry) => entry.type === "faint" && entry.pokemon)) {
    const victimCoach = coachForPlayer(event.player);
    const victim = byCoachAndName.get(`${victimCoach}:${nameKey(event.pokemon)}`);
    if (!victim) continue;
    const killerCoach = event.killerPlayer ? coachForPlayer(event.killerPlayer) : null;
    const killer = killerCoach && event.killer
      ? byCoachAndName.get(`${killerCoach}:${nameKey(event.killer)}`)
      : null;
    const moveName = event.move || null;
    const moveId = moveName
      ? moveIdByName.get(moveName.toLowerCase()) || moveIdByName.get(moveName.toLowerCase().replace(/\s+/g, "-")) || null
      : null;
    insertKillEvent.run(
      match.id,
      event.turn || 0,
      killer?.pokemon_id || null,
      killerCoach,
      victim.pokemon_id,
      victimCoach,
      moveId,
      moveName,
      eventCause(event)
    );
  }
}

const candidateMatches = matches.map((match) => ({ match, rows: rowsByMatch.all(match.id) }));
const assigned = new Map();
const seenUrls = new Map();
let clean = 0;
let reviewed = 0;
let failed = 0;
let updatedRows = 0;
let missingReplays = 0;

for (const replayUrl of [...new Set(replayUrls)]) {
  let replay;
  try {
    replay = await scrapeReplay(replayUrl);
  } catch (error) {
    failed++;
    report(`REVIEW replay ${replayUrl}: parse failed: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const scored = candidateMatches.map(({ match, rows }) => {
    const rows1 = rows.filter((row) => row.season_coach_id === match.coach1_season_id);
    const rows2 = rows.filter((row) => row.season_coach_id === match.coach2_season_id);
    const direct = distinctMatch(replay.p1Team, rows1).score + distinctMatch(replay.p2Team, rows2).score;
    const swapped = distinctMatch(replay.p1Team, rows2).score + distinctMatch(replay.p2Team, rows1).score;
    return { match, rows, rows1, rows2, direct, swapped, score: Math.max(direct, swapped) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const reasons = [];
  if (!best || best.score < 8) reasons.push(`Low roster mapping confidence (${best?.score || 0}/12)`);
  if (best && second && best.score === second.score) reasons.push(`Ambiguous fixture mapping (${best.score}/${second.score})`);
  if (best && seenUrls.has(replayUrl)) reasons.push(`Replay URL already processed for match ${seenUrls.get(replayUrl)}`);

  if (!best || reasons.some((reason) => reason.startsWith("Low roster") || reason.startsWith("Ambiguous"))) {
    reviewed++;
    report(`REVIEW replay ${replayUrl}: ${reasons.join("; ")}`);
    continue;
  }

  const match = best.match;
  const p1IsCoach1 = best.direct >= best.swapped;
  const mappedRows = [];
  const replayTeam1 = p1IsCoach1 ? replay.p1Team : replay.p2Team;
  const replayTeam2 = p1IsCoach1 ? replay.p2Team : replay.p1Team;
  const team1Map = distinctMatch(replayTeam1, best.rows1);
  const team2Map = distinctMatch(replayTeam2, best.rows2);
  mappedRows.push(...team1Map.matches, ...team2Map.matches);

  const replayWinnerId = replay.winner === "p1"
    ? (p1IsCoach1 ? match.coach1_season_id : match.coach2_season_id)
    : replay.winner === "p2"
      ? (p1IsCoach1 ? match.coach2_season_id : match.coach1_season_id)
      : null;
  if (replayWinnerId !== match.winner_id) reasons.push(`Replay winner conflicts with official result (${replayWinnerId || "none"} vs ${match.winner_id || "none"})`);
  const coach1Remaining = p1IsCoach1 ? replay.p1Remaining : replay.p2Remaining;
  const coach2Remaining = p1IsCoach1 ? replay.p2Remaining : replay.p1Remaining;
  // PBO differential is the winner's remaining Pokemon, mirrored negatively
  // for the loser. It is not calculated independently from both remaining
  // counts (the loser may have had every Pokemon faint).
  const winningRemaining = replayWinnerId === match.coach1_season_id
    ? coach1Remaining
    : replayWinnerId === match.coach2_season_id
      ? coach2Remaining
      : 0;
  const replayDiff1 = replayWinnerId === match.coach1_season_id
    ? (winningRemaining ?? 0)
    : replayWinnerId === match.coach2_season_id
      ? -(winningRemaining ?? 0)
      : 0;
  const replayDiff2 = replayWinnerId === match.coach2_season_id
    ? (winningRemaining ?? 0)
    : replayWinnerId === match.coach1_season_id
      ? -(winningRemaining ?? 0)
      : 0;
  if (replayDiff1 !== match.coach1_differential || replayDiff2 !== match.coach2_differential) {
    reasons.push(`Replay differential ${replayDiff1}/${replayDiff2} conflicts with official ${match.coach1_differential}/${match.coach2_differential}`);
  }
  if (replay.tier && !["[Gen 9] Draft", "[Gen 9] Tera Preview Draft"].includes(replay.tier)) reasons.push(`Unexpected replay format: ${replay.tier}`);
  if (replay.zoroarkInvolved) reasons.push("Zoroark/Illusion detected; KO attribution needs review");
  if (manualReviewHints.has(replayUrl)) reasons.push(manualReviewHints.get(replayUrl));

  const updates = [];
  for (const { row, pokemon } of mappedRows) {
    if (pokemon.kills !== row.kills || pokemon.deaths !== row.deaths) {
      reasons.push(`${row.pokemon_display_name || row.pokemon_name} official K/D ${row.kills}-${row.deaths}, current replay logic ${pokemon.kills}-${pokemon.deaths}`);
    }
    updates.push({ row, pokemon });
  }
  if (updates.length < 12) reasons.push(`Only ${updates.length}/12 Pokemon rows mapped`);

  const needsReview = reasons.length > 0;
  const note = reviewReasonList(reasons).join("; ") || null;
  seenUrls.set(replayUrl, match.id);
  if (assigned.has(match.id)) {
    reviewed++;
    report(`REVIEW match ${match.id} ${match.division_name} W${match.week}: multiple replay candidates (${assigned.get(match.id)} and ${replayUrl})`);
    continue;
  }
  assigned.set(match.id, replayUrl);

  if (apply) {
    db.transaction(() => {
      updateMatch.run(
        replayUrl,
        needsReview ? 1 : 0,
        note,
        replay.startedAt || null,
        replay.startedAt || null,
        replay.endedAt || null,
        JSON.stringify(replay.turnSnapshots || []),
        JSON.stringify(replay.keyEvents || []),
        replay.zoroarkInvolved ? 1 : 0,
        match.id
      );
      // Even when a historical sheet K/D differs, use the current replay parser's
      // attribution and leave the discrepancy visible through the yellow review flag.
      for (const { row, pokemon } of updates) {
        updatePokemon.run(
          pokemon.kills ?? 0,
          pokemon.deaths ?? 0,
          pokemon.damageDealt ?? null,
          pokemon.damageDealtIndirect ?? null,
          pokemon.damageTaken ?? null,
          pokemon.damageTakenIndirect ?? null,
          pokemon.turnsActive ?? null,
          pokemon.hazardDamageTaken ?? null,
          pokemon.setupMovesUsed ?? null,
          pokemon.favorableCrits ?? null,
          pokemon.favorableMisses ?? null,
          pokemon.favorableFlinches ?? null,
          pokemon.favorableParalysis ?? null,
          pokemon.favorableFreezes ?? null,
          pokemon.favorableBurns ?? null,
          pokemon.favorableSleep ?? null,
          pokemon.hpRestored ?? null,
          JSON.stringify(pokemon.movesUsed || {}),
          JSON.stringify(pokemon.revealedItems || []),
          row.id
        );
      }
      insertCurrentKillEvents(match, replay, mappedRows, p1IsCoach1);
    })();
  }
  updatedRows += updates.length;
  if (needsReview) {
    reviewed++;
    report(`REVIEW ${apply ? "APPLIED" : "PLANNED"} match ${match.id} ${match.division_name} W${match.week}: ${note}`);
  } else {
    clean++;
    report(`${apply ? "APPLIED" : "PLANNED"} match ${match.id} ${match.division_name} W${match.week}: ${match.coach1_name} vs ${match.coach2_name}`);
  }
}

if (apply) {
  const missing = matches.filter((match) => !assigned.has(match.id) && !String(match.replay_url || "").trim());
  const markMissing = db.prepare("UPDATE matches SET needs_review = 1, review_notes = ? WHERE id = ?");
  db.transaction(() => {
    for (const match of missing) {
      markMissing.run("Missing replay supplied for full Season 6 replay backfill", match.id);
    }
  })();
  missingReplays = missing.length;
} else {
  missingReplays = matches.filter((match) => !assigned.has(match.id) && !String(match.replay_url || "").trim()).length;
}

db.close();
console.log(`Summary: ${apply ? "applied" : "planned"}; ${clean} clean matches; ${reviewed} reviewed matches/replays; ${updatedRows} Pokemon rows; ${missingReplays} matches missing replay data; ${failed} replay failures; target fixtures ${matches.length}.`);
if (failed > 0) process.exitCode = 1;
