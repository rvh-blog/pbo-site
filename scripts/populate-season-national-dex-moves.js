const Database = require("better-sqlite3");
const { Dex } = require("@pkmn/dex");

const dbPath = process.argv.includes("--db")
  ? process.argv[process.argv.indexOf("--db") + 1]
  : "pbo.db";
const seasonNumber = process.argv.includes("--season")
  ? Number(process.argv[process.argv.indexOf("--season") + 1])
  : 11;
const apply = process.argv.includes("--apply");

function localToDexName(name, displayName) {
  if ((displayName || name).toLowerCase() === "darmanitan-galar-standard") {
    return "Darmanitan-Galar";
  }

  return (displayName || name)
    .replace(/-mask$/i, "")
    .replace(/^Palafin-Hero$/i, "Palafin-Hero");
}

async function getLearnsetMoves(dex, name) {
  const species = dex.species.get(name);
  if (!species.exists) return { moves: [], source: "missing" };

  let learnset = await dex.learnsets.get(species.id);
  let moves = Object.keys(learnset?.learnset || {}).sort();
  if (moves.length > 0) return { moves, source: species.name };

  if (species.baseSpecies && species.baseSpecies !== species.name) {
    const baseSpecies = dex.species.get(species.baseSpecies);
    learnset = await dex.learnsets.get(baseSpecies.id);
    moves = Object.keys(learnset?.learnset || {}).sort();
    if (moves.length > 0) return { moves, source: baseSpecies.name };
  }

  return { moves, source: species.name };
}

async function main() {
  const db = new Database(dbPath);
  const dex = Dex.forGen(9);

  const season = db
    .prepare("select id, name, season_number from seasons where season_number = ?")
    .get(seasonNumber);
  if (!season) throw new Error(`Season ${seasonNumber} not found`);

  db.prepare("update seasons set moveset_format = 'national-dex' where id = ?").run(season.id);

  const rows = db
    .prepare(
      `select p.id, p.name, p.display_name as displayName
       from season_pokemon_prices spp
       join pokemon p on p.id = spp.pokemon_id
       where spp.season_id = ?
       order by p.name`
    )
    .all(season.id);

  const upsert = db.prepare(
    `insert into season_pokemon_moves (season_id, pokemon_id, moves, source, updated_at)
     values (@seasonId, @pokemonId, @moves, @source, @updatedAt)
     on conflict(season_id, pokemon_id)
     do update set moves = excluded.moves, source = excluded.source, updated_at = excluded.updated_at`
  );

  let withMoves = 0;
  const missing = [];
  const now = new Date().toISOString();
  const planned = [];

  for (const row of rows) {
    const dexName = localToDexName(row.name, row.displayName);
    const { moves, source } = await getLearnsetMoves(dex, dexName);
    if (moves.length > 0) withMoves++;
    else missing.push(row.displayName || row.name);

    planned.push({
      seasonId: season.id,
      pokemonId: row.id,
      moves: JSON.stringify(moves),
      source: `@pkmn/dex gen9 ${source}`,
      updatedAt: now,
    });
  }

  if (apply) {
    const write = db.transaction((entries) => {
      for (const entry of entries) upsert.run(entry);
    });
    write(planned);
  }

  db.close();

  console.log(
    JSON.stringify(
      {
        applied: apply,
        season: season.name,
        draftBoardPokemon: rows.length,
        withMoves,
        missing,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
