/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const XLSX = require("xlsx");

const CSV_PATH = path.join(process.cwd(), "data", "S11", "Tiers S11 Neon - Tiers.csv");
const CSV_URL = "https://docs.google.com/spreadsheets/d/1mWXw75vnq4UyBYrwN43rjYMV5cH-TGxx8_HRJJDwWcQ/gviz/tq?tqx=out:csv&sheet=Tiers";
const DB_PATH = process.env.DATABASE_PATH || "pbo.db";
const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const REQUIRED_POKEMON = ["barbaracle"];

function pokemonNameKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSheetPokemonName(name) {
  return String(name ?? "")
    .trim()
    .replace(/^\*/, "")
    .replace(/-\*$/, "")
    .replace(/-Tera$/i, "");
}

function getExternalAliases(name) {
  const cleaned = normalizeSheetPokemonName(name);
  const key = pokemonNameKey(cleaned);
  const aliases = new Set([cleaned]);

  const fixedAliases = {
    ogerpont: ["Ogerpon-Teal", "Ogerpon"],
    ogerponteal: ["Ogerpon-Teal", "Ogerpon"],
    ogerponw: ["Ogerpon-Wellspring"],
    ogerponwellspring: ["Ogerpon-Wellspring"],
    ogerponh: ["Ogerpon-Hearthflame"],
    ogerponhearthflame: ["Ogerpon-Hearthflame"],
    ogerponc: ["Ogerpon-Cornerstone"],
    ogerponcornerstone: ["Ogerpon-Cornerstone"],
    ursalunabm: ["Ursaluna-Bloodmoon"],
    ursalunabloodmoon: ["Ursaluna-Bloodmoon"],
    galarianarticuno: ["Articuno-Galar"],
    galarianzapdos: ["Zapdos-Galar"],
    galarianmoltres: ["Moltres-Galar"],
    galarianslowking: ["Slowking-Galar"],
    galarianslowbro: ["Slowbro-Galar"],
    alolanexeggutor: ["Exeggutor-Alola"],
    alolanninetales: ["Ninetales-Alola"],
    alolanmuk: ["Muk-Alola"],
    alolanraichu: ["Raichu-Alola"],
    alolansandslash: ["Sandslash-Alola"],
    alolanmarowak: ["Marowak-Alola"],
    alolanpersian: ["Persian-Alola"],
    alolandugtrio: ["Dugtrio-Alola"],
    alolandiglett: ["Diglett-Alola"],
    alolangolem: ["Golem-Alola"],
    hisuiansamurott: ["Samurott-Hisui"],
    hisuianarcanine: ["Arcanine-Hisui"],
    hisuiantyphlosion: ["Typhlosion-Hisui"],
    hisuianlilligant: ["Lilligant-Hisui"],
    hisuianzoroark: ["Zoroark-Hisui"],
    hisuianbraviary: ["Braviary-Hisui"],
    hisuiangoodra: ["Goodra-Hisui"],
    hisuiandecidueye: ["Decidueye-Hisui"],
    paldeanwooper: ["Wooper-Paldea"],
    paldeantauros: ["Tauros-Paldea-Combat"],
    paldeantaurosfire: ["Tauros-Paldea-Blaze"],
    paldeantauroswater: ["Tauros-Paldea-Aqua"],
    darmanitan: ["Darmanitan-Standard"],
    galariandarmanitan: ["Darmanitan-Galar-Standard"],
    enamorus: ["Enamorus-Incarnate"],
    landorus: ["Landorus-Incarnate"],
    thundurus: ["Thundurus-Incarnate"],
    tornadus: ["Tornadus-Incarnate"],
    mimikyu: ["Mimikyu-Disguised"],
    oricorio: ["Oricorio-Baile"],
    gourgeist: ["Gourgeist-Average"],
    pumpkaboo: ["Pumpkaboo-Average"],
    basculin: ["Basculin-Red-Striped"],
  };

  for (const alias of fixedAliases[key] || []) aliases.add(alias);

  const regionalMatch = cleaned.match(/^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i);
  if (regionalMatch) {
    const region = {
      alolan: "Alola",
      galarian: "Galar",
      hisuian: "Hisui",
      paldean: "Paldea",
    }[regionalMatch[1].toLowerCase()];
    aliases.add(`${regionalMatch[2]}-${region}`);
  }

  const megaMatch = cleaned.match(/^Mega\s+(.+)$/i);
  if (megaMatch) {
    const base = megaMatch[1].trim();
    aliases.add(`${base}-Mega`);
    aliases.add(`${base} Mega`);
  }

  return [...aliases];
}

function addPokemonLookupKeys(map, pokemon) {
  const candidates = [pokemon.name, pokemon.display_name];

  const megaMatch = pokemon.name.match(/^(.+)-mega(?:-(x|y))?$/i);
  if (megaMatch) {
    const base = megaMatch[1];
    const suffix = megaMatch[2] ? ` ${megaMatch[2].toUpperCase()}` : "";
    candidates.push(`Mega ${base}${suffix}`);
  }

  for (const candidate of candidates) {
    const key = pokemonNameKey(candidate);
    if (key && !map.has(key)) map.set(key, pokemon);
  }
}

async function readCsvContent() {
  if (fs.existsSync(CSV_PATH)) {
    return fs.readFileSync(CSV_PATH, "utf8");
  }

  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch S11 Tiers CSV: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function parseRows() {
  const workbook = XLSX.read(await readCsvContent(), { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
}

function displayName(apiName) {
  return apiName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

function statMap(pokemon) {
  const stats = new Map(pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
  const hp = stats.get("hp") || 0;
  const attack = stats.get("attack") || 0;
  const defense = stats.get("defense") || 0;
  const specialAttack = stats.get("special-attack") || 0;
  const specialDefense = stats.get("special-defense") || 0;
  const speed = stats.get("speed") || 0;
  return {
    hp,
    attack,
    defense,
    specialAttack,
    specialDefense,
    speed,
    baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
  };
}

function movesForVersionGroup(pokemon, versionGroup) {
  const moves = new Set();
  for (const moveEntry of pokemon.moves || []) {
    const hasVersionGroup = moveEntry.version_group_details?.some(
      (detail) => detail.version_group?.name === versionGroup
    );
    if (hasVersionGroup) moves.add(moveEntry.move.name);
  }
  return [...moves].sort();
}

async function fetchPokemon(apiName) {
  const response = await fetch(`${POKEAPI_BASE}/pokemon/${apiName}`);
  if (!response.ok) {
    throw new Error(`PokeAPI ${apiName} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function ensureRequiredPokemon(db, apply) {
  const existingStmt = db.prepare("select id from pokemon where lower(name) = lower(?)");
  const insertStmt = db.prepare(`
    insert into pokemon (
      pokedex_id, name, display_name, sprite_url, artwork_url, types, moves, abilities,
      hp, attack, defense, special_attack, special_defense, speed, base_stat_total
    ) values (
      @pokedexId, @name, @displayName, @spriteUrl, @artworkUrl, @types, @moves, @abilities,
      @hp, @attack, @defense, @specialAttack, @specialDefense, @speed, @baseStatTotal
    )
  `);

  for (const apiName of REQUIRED_POKEMON) {
    const dbName = displayName(apiName);
    if (existingStmt.get(dbName)) continue;

    const pokemon = await fetchPokemon(apiName);
    const stats = statMap(pokemon);
    const params = {
      pokedexId: pokemon.id,
      name: dbName,
      displayName: displayName(apiName),
      spriteUrl: pokemon.sprites.front_default || "",
      artworkUrl: pokemon.sprites.other?.["official-artwork"]?.front_default || "",
      types: JSON.stringify(pokemon.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name)),
      moves: JSON.stringify(movesForVersionGroup(pokemon, "scarlet-violet")),
      abilities: JSON.stringify((pokemon.abilities || []).map((entry) => ({
        name: entry.ability.name,
        isHidden: entry.is_hidden,
      }))),
      ...stats,
    };

    console.log(`${apply ? "INSERT" : "DRY INSERT"} missing Pokemon: ${dbName}`);
    if (apply) insertStmt.run(params);
  }
}

function parseDraftBoard(rows) {
  const headerRow = rows[0] || [];
  const tierColumns = [];

  for (let col = 0; col < headerRow.length; col++) {
    const header = String(headerRow[col] || "").trim();
    const match = header.match(/^(\d+)\s*Point/i);
    if (match) {
      const price = Number(match[1]);
      if (price <= 19) {
        tierColumns.push({ price, nameCol: col + 1 });
      }
    }
  }

  const priceRows = [];
  const complexBansByKey = new Map();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];

    const complexPokemon = normalizeSheetPokemonName(row[2]);
    const complexReason = String(row[3] || "").trim();
    if (
      complexPokemon &&
      complexReason &&
      complexPokemon !== "-" &&
      complexReason !== "-" &&
      complexPokemon.length > 1 &&
      complexReason.length > 1
    ) {
      complexBansByKey.set(pokemonNameKey(complexPokemon), {
        name: complexPokemon,
        reason: complexReason,
      });
    }

    for (const tier of tierColumns) {
      const pokemonName = normalizeSheetPokemonName(row[tier.nameCol]);
      if (!pokemonName || pokemonName === "-" || pokemonName.length <= 1) continue;

      priceRows.push({
        name: pokemonName,
        price: tier.price,
        complexBanReason: null,
      });
    }
  }

  for (const row of priceRows) {
    const complexBan = complexBansByKey.get(pokemonNameKey(row.name));
    if (complexBan) {
      row.complexBanReason = complexBan.reason;
      complexBansByKey.delete(pokemonNameKey(row.name));
    }
  }

  const complexOnlyRows = [...complexBansByKey.values()].map((ban) => ({
    name: ban.name,
    price: -1,
    complexBanReason: ban.reason,
  }));

  return {
    priceRows,
    complexOnlyRows,
    allRows: [...priceRows, ...complexOnlyRows],
  };
}

function findPokemon(name, pokemonLookup) {
  for (const alias of getExternalAliases(name)) {
    const match = pokemonLookup.get(pokemonNameKey(alias));
    if (match) return match;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const db = new Database(DB_PATH);
  await ensureRequiredPokemon(db, apply);

  const season = db.prepare("select * from seasons where season_number = 11").get();
  if (!season) throw new Error("Season 11 not found");

  const pokemonRows = db.prepare("select id, name, display_name from pokemon").all();
  const pokemonLookup = new Map();
  for (const pokemon of pokemonRows) addPokemonLookupKeys(pokemonLookup, pokemon);

  const parsed = parseDraftBoard(await parseRows());
  const resolved = [];
  const notFound = [];

  for (const entry of parsed.allRows) {
    const pokemon = findPokemon(entry.name, pokemonLookup);
    if (!pokemon) {
      notFound.push(entry);
      continue;
    }

    resolved.push({
      ...entry,
      pokemonId: pokemon.id,
      matchedName: pokemon.display_name || pokemon.name,
    });
  }

  const byPrice = new Map();
  for (const row of resolved) {
    byPrice.set(row.price, (byPrice.get(row.price) || 0) + 1);
  }

  console.log(`Season 11: ID ${season.id} (${season.name})`);
  console.log(`CSV rows: ${parsed.priceRows.length} priced, ${parsed.complexOnlyRows.length} complex-only`);
  console.log(`Resolved: ${resolved.length}`);
  console.log(`Not found: ${notFound.length}`);
  console.log("By price:");
  for (const [price, count] of [...byPrice.entries()].sort((a, b) => b[0] - a[0])) {
    console.log(`  ${price}: ${count}`);
  }

  const complexResolved = resolved.filter((row) => row.complexBanReason);
  console.log(`Complex bans resolved: ${complexResolved.length}`);
  for (const row of complexResolved.slice(0, 20)) {
    console.log(`  ${row.name} -> ${row.matchedName}: ${row.complexBanReason} (${row.price})`);
  }

  if (notFound.length > 0) {
    console.log("Not found entries:");
    for (const row of notFound.slice(0, 80)) {
      console.log(`  ${row.name} (${row.price})${row.complexBanReason ? ` - ${row.complexBanReason}` : ""}`);
    }
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to update local pbo.db.");
    return;
  }

  const replaceDraftBoard = db.transaction(() => {
    db.prepare("delete from season_pokemon_prices where season_id = ?").run(season.id);
    const insert = db.prepare(`
      insert into season_pokemon_prices
        (season_id, pokemon_id, price, tera_banned, tera_captain_cost, complex_ban_reason)
      values
        (?, ?, ?, 0, null, ?)
    `);

    for (const row of resolved) {
      insert.run(season.id, row.pokemonId, row.price, row.complexBanReason);
    }
  });

  replaceDraftBoard();
  console.log(`\nUpdated Season 11 draft board with ${resolved.length} rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
