const Database = require("better-sqlite3");
const { Dex } = require("@pkmn/dex");

const dbPath = process.argv.includes("--db")
  ? process.argv[process.argv.indexOf("--db") + 1]
  : "pbo.db";
const seasonNumber = process.argv.includes("--season")
  ? Number(process.argv[process.argv.indexOf("--season") + 1])
  : 11;
const apply = process.argv.includes("--apply");

// Forms that can legally move between forms while retaining moves.
// Permanent form choices and forms that lose form-specific moves are intentionally excluded.
const FORM_SHARING_POKEMON = {
  deoxys: ["Deoxys", "Deoxys-Attack", "Deoxys-Defense", "Deoxys-Speed"],
  shaymin: ["Shaymin", "Shaymin-Sky"],
  giratina: ["Giratina", "Giratina-Origin"],
  tornadus: ["Tornadus", "Tornadus-Therian"],
  thundurus: ["Thundurus", "Thundurus-Therian"],
  landorus: ["Landorus", "Landorus-Therian"],
  enamorus: ["Enamorus", "Enamorus-Therian"],
  hoopa: ["Hoopa", "Hoopa-Unbound"],
  zacian: ["Zacian", "Zacian-Crowned"],
  zamazenta: ["Zamazenta", "Zamazenta-Crowned"],
  ogerpon: ["Ogerpon", "Ogerpon-Wellspring", "Ogerpon-Hearthflame", "Ogerpon-Cornerstone"],
};

function localToDexName(name, displayName) {
  if ((displayName || name).toLowerCase() === "darmanitan-galar-standard") {
    return "Darmanitan-Galar";
  }

  return (displayName || name)
    .replace(/-mask$/i, "")
    .replace(/^Palafin-Hero$/i, "Palafin-Hero");
}

function formSharingGroupFor(dex, species) {
  for (const forms of Object.values(FORM_SHARING_POKEMON)) {
    if (forms.some((name) => dex.species.get(name).id === species.id)) {
      return forms;
    }
  }
  return [];
}

async function getDirectLearnsetMoveIds(dex, species) {
  const learnset = await dex.learnsets.get(species.id);
  return Object.keys(learnset?.learnset || {});
}

async function addSpeciesAndPrevoMoves(dex, species, moves, sources) {
  let current = species;

  while (current?.exists) {
    const currentMoves = await getDirectLearnsetMoveIds(dex, current);
    if (currentMoves.length > 0) {
      const before = moves.size;
      for (const move of currentMoves) moves.add(move);
      sources.push(`${current.name}${current.id === species.id ? "" : " pre-evo"} +${moves.size - before}`);
    }

    if (!current.prevo) break;
    current = dex.species.get(current.prevo);
  }
}

async function getLearnsetMoves(dex, name, includeFormSharing = true) {
  const species = dex.species.get(name);
  if (!species.exists) return { moves: [], source: "missing" };

  const moves = new Set();
  const sources = [];

  await addSpeciesAndPrevoMoves(dex, species, moves, sources);

  if (moves.size === 0 && species.changesFrom) {
    const changedFrom = dex.species.get(species.changesFrom);
    if (changedFrom.exists) {
      await addSpeciesAndPrevoMoves(dex, changedFrom, moves, sources);
    }
    if (species.baseSpecies && species.baseSpecies !== species.name && species.baseSpecies !== species.changesFrom) {
      const baseSpecies = dex.species.get(species.baseSpecies);
      if (baseSpecies.exists) {
        await addSpeciesAndPrevoMoves(dex, baseSpecies, moves, sources);
      }
    }
  } else if (moves.size === 0 && species.baseSpecies && species.baseSpecies !== species.name) {
    const baseSpecies = dex.species.get(species.baseSpecies);
    if (baseSpecies.exists) {
      await addSpeciesAndPrevoMoves(dex, baseSpecies, moves, sources);
    }
  }

  if (includeFormSharing) {
    for (const formName of formSharingGroupFor(dex, species)) {
      const formSpecies = dex.species.get(formName);
      if (!formSpecies.exists || formSpecies.id === species.id) continue;
      const { moves: formMoves } = await getLearnsetMoves(dex, formName, false);
      const before = moves.size;
      for (const move of formMoves) moves.add(move);
      if (moves.size > before) sources.push(`${formSpecies.name} shared form +${moves.size - before}`);
    }
  }

  return {
    moves: Array.from(moves).sort(),
    source: sources.length > 0 ? sources.join("; ") : species.name,
  };
}

async function main() {
  const db = new Database(dbPath);
  const dex = Dex.forGen(9);
  const moveNameById = new Map(
    db
      .prepare("select name from moves")
      .all()
      .map((move) => [move.name.replace(/[^a-z0-9]/gi, "").toLowerCase(), move.name])
  );

  function normalizeMoveNames(moves) {
    return moves.map((move) => moveNameById.get(move) || move).sort();
  }

  const season = db
    .prepare("select id, name, season_number from seasons where season_number = ?")
    .get(seasonNumber);
  if (!season) throw new Error(`Season ${seasonNumber} not found`);

  const rows = db
    .prepare(
      `select p.id, p.name, p.display_name as displayName, spm.moves as seasonMoves
       from season_pokemon_prices spp
       join pokemon p on p.id = spp.pokemon_id
       left join season_pokemon_moves spm
         on spm.season_id = spp.season_id
        and spm.pokemon_id = spp.pokemon_id
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
  const updateSeasonFormat = db.prepare("update seasons set moveset_format = 'national-dex' where id = ?");

  let withMoves = 0;
  const missing = [];
  const changed = [];
  const now = new Date().toISOString();
  const planned = [];

  for (const row of rows) {
    const dexName = localToDexName(row.name, row.displayName);
    const { moves: rawMoves, source } = await getLearnsetMoves(dex, dexName);
    const moves = normalizeMoveNames(rawMoves);
    if (moves.length > 0) withMoves++;
    else missing.push(row.displayName || row.name);

    const existingMoves = row.seasonMoves ? JSON.parse(row.seasonMoves) : [];
    const addedMoves = moves.filter((move) => !existingMoves.includes(move));
    const removedMoves = existingMoves.filter((move) => !moves.includes(move));
    if (addedMoves.length > 0 || removedMoves.length > 0) {
      changed.push({
        name: row.displayName || row.name,
        before: existingMoves.length,
        after: moves.length,
        added: addedMoves.length,
        removed: removedMoves.length,
        sampleAdded: addedMoves.slice(0, 8),
        sampleRemoved: removedMoves.slice(0, 8),
      });
    }

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
      updateSeasonFormat.run(season.id);
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
        changedRows: changed.length,
        changed: changed.slice(0, 25),
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
