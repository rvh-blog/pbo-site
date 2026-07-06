import { getPokemonAliasMaps, pokemonExactLookupKeysWithAliases } from "@/lib/pokemon-name-aliases";
import {
  pokemonExactLookupKeys,
  pokemonNameKey,
  shouldUseFriendlyMegaNamesForSeason,
} from "@/lib/pokemon-name-utils";
import { readSheetRange } from "./sheets-sync";

type PokemonNameOptions = {
  friendlyMegaNames?: boolean;
};

export const SHEET_MANUAL_POKEMON_MAPPINGS: Record<string, string> = {
  // Ogerpon forms
  "Ogerpon-Teal": "Ogerpon-T",
  "Ogerpon-Wellspring": "Ogerpon-W",
  "Ogerpon-Hearthflame": "Ogerpon-H",
  "Ogerpon-Cornerstone": "Ogerpon-C",
  // Thundurus/Tornadus/Landorus/Enamorus - base form is just the name
  "Thundurus-Incarnate": "Thundurus",
  "Tornadus-Incarnate": "Tornadus",
  "Landorus-Incarnate": "Landorus",
  "Enamorus-Incarnate": "Enamorus",
  // Ursaluna forms - sheet has same smogon name for both, so we need explicit mappings
  "Ursaluna": "Ursaluna",
  "Ursaluna-Bloodmoon": "Ursaluna-BM",
  // Mimikyu - sheet uses base name without form suffix
  "Mimikyu-Disguised": "Mimikyu",
  "Mimikyu-Busted": "Mimikyu",
  // Regional forms - our format vs sheet format
  "Slowking-Galar": "Galarian Slowking",
  "Slowbro-Galar": "Galarian Slowbro",
  "Articuno-Galar": "Galarian Articuno",
  "Zapdos-Galar": "Galarian Zapdos",
  "Moltres-Galar": "Galarian Moltres",
  "Exeggutor-Alola": "Alolan Exeggutor",
  "Ninetales-Alola": "Alolan Ninetales",
  "Muk-Alola": "Alolan Muk",
  "Raichu-Alola": "Alolan Raichu",
  "Sandslash-Alola": "Alolan Sandslash",
  "Marowak-Alola": "Alolan Marowak",
  "Samurott-Hisui": "Hisuian Samurott",
  "Arcanine-Hisui": "Hisuian Arcanine",
  "Typhlosion-Hisui": "Hisuian Typhlosion",
  "Lilligant-Hisui": "Hisuian Lilligant",
  "Zoroark-Hisui": "Hisuian Zoroark",
  "Braviary-Hisui": "Hisuian Braviary",
  "Goodra-Hisui": "Hisuian Goodra",
  "Decidueye-Hisui": "Hisuian Decidueye",
  "Electrode-Hisui": "Hisuian Electrode",
  "Voltorb-Hisui": "Hisuian Voltorb",
  "Qwilfish-Hisui": "Hisuian Qwilfish",
  "Sneasel-Hisui": "Hisuian Sneasel",
  "Avalugg-Hisui": "Hisuian Avalugg",
  "Sliggoo-Hisui": "Hisuian Sliggoo",
  "Growlithe-Hisui": "Hisuian Growlithe",
  // Paldean forms
  "Tauros-Paldea-Combat": "Paldean Tauros",
  "Tauros-Paldea-Blaze": "Paldean Tauros (Fire)",
  "Tauros-Paldea-Aqua": "Paldean Tauros (Water)",
  "Wooper-Paldea": "Paldean Wooper",
  // More Galarian forms
  "Weezing-Galar": "Galarian Weezing",
  "Mr. Mime-Galar": "Galarian Mr. Mime",
  "Rapidash-Galar": "Galarian Rapidash",
  "Ponyta-Galar": "Galarian Ponyta",
  "Corsola-Galar": "Galarian Corsola",
  "Darmanitan-Galar": "Galarian Darmanitan",
  "Darmanitan-Galar-Zen": "Galarian Darmanitan-Zen",
  "Stunfisk-Galar": "Galarian Stunfisk",
  "Yamask-Galar": "Galarian Yamask",
  "Linoone-Galar": "Galarian Linoone",
  "Zigzagoon-Galar": "Galarian Zigzagoon",
  "Meowth-Galar": "Galarian Meowth",
  "Farfetch'd-Galar": "Galarian Farfetch'd",
  // More Alolan forms
  "Rattata-Alola": "Alolan Rattata",
  "Raticate-Alola": "Alolan Raticate",
  "Vulpix-Alola": "Alolan Vulpix",
  "Sandshrew-Alola": "Alolan Sandshrew",
  "Diglett-Alola": "Alolan Diglett",
  "Dugtrio-Alola": "Alolan Dugtrio",
  "Meowth-Alola": "Alolan Meowth",
  "Persian-Alola": "Alolan Persian",
  "Geodude-Alola": "Alolan Geodude",
  "Graveler-Alola": "Alolan Graveler",
  "Golem-Alola": "Alolan Golem",
  "Grimer-Alola": "Alolan Grimer",
  // Basculin forms
  "Basculin-Red-Striped": "Basculin",
  "Basculin-Blue-Striped": "Basculin-White-Striped",
  // Lycanroc forms
  "Lycanroc-Midday": "Lycanroc-Midday",
  "Lycanroc-Midnight": "Lycanroc-Midnight",
  "Lycanroc-Dusk": "Lycanroc-Dusk",
  // Indeedee
  "Indeedee-Male": "Indeedee",
  "Indeedee-Female": "Indeedee-F",
  // Meowstic
  "Meowstic-Male": "Meowstic",
  "Meowstic-Female": "Meowstic-Female",
  // Giratina
  "Giratina-Altered": "Giratina-Altered",
  "Giratina-Origin": "Giratina-Origin",
  // Urshifu - sheet uses full form names
  "Urshifu-Single-Strike": "Urshifu-Single-Strike",
  "Urshifu-Rapid-Strike": "Urshifu-Rapid-Strike",
  // Zygarde
  "Zygarde-50%": "Zygarde-50%",
  "Zygarde-10%": "Zygarde-10%",
  "Zygarde-Complete": "Zygarde-Complete",
  // Wormadam
  "Wormadam-Plant": "Wormadam-Plant",
  "Wormadam-Sandy": "Wormadam-Sandy",
  "Wormadam-Trash": "Wormadam-Trash",
  // Rotom forms
  "Rotom-Heat": "Rotom-Heat",
  "Rotom-Wash": "Rotom-Wash",
  "Rotom-Frost": "Rotom-Frost",
  "Rotom-Fan": "Rotom-Fan",
  "Rotom-Mow": "Rotom-Mow",
  // Deoxys
  "Deoxys-Normal": "Deoxys",
  "Deoxys-Attack": "Deoxys-Attack",
  "Deoxys-Defense": "Deoxys-Defense",
  "Deoxys-Speed": "Deoxys-Speed",
  // Shaymin
  "Shaymin-Land": "Shaymin",
  "Shaymin-Sky": "Shaymin-Sky",
  // Kyurem
  "Kyurem-Black": "Kyurem-Black",
  "Kyurem-White": "Kyurem-White",
  // Necrozma
  "Necrozma-Dusk-Mane": "Necrozma-Dusk-Mane",
  "Necrozma-Dawn-Wings": "Necrozma-Dawn-Wings",
  // Calyrex
  "Calyrex-Ice-Rider": "Calyrex-Ice",
  "Calyrex-Shadow-Rider": "Calyrex-Shadow",
  // Aegislash - sheet uses base form
  "Aegislash-Shield": "Aegislash",
  "Aegislash-Blade": "Aegislash",
  // Terapagos - base form in Pokedex maps to "Pagogo" but we want "Terapagos"
  "Terapagos": "Terapagos",
  "Terapagos-Terastal": "Terapagos",
  "Terapagos-Stellar": "Terapagos",
};

function addSheetPokemonName(
  mapping: Map<string, string>,
  sourceName: string,
  sheetName: string,
  options: PokemonNameOptions,
  lookupKeys: Set<string>
) {
  const exactLowerKey = sourceName.toLowerCase();
  const exactNameKey = pokemonNameKey(sourceName);

  if (exactLowerKey) mapping.set(exactLowerKey, sheetName);
  if (exactNameKey) mapping.set(exactNameKey, sheetName);

  for (const key of lookupKeys) {
    if (!key) continue;
    if (key === exactNameKey) {
      mapping.set(key, sheetName);
    } else if (!mapping.has(key)) {
      mapping.set(key, sheetName);
    }
  }

  if (options.friendlyMegaNames) {
    for (const key of pokemonExactLookupKeys(sourceName, options)) {
      if (!key || mapping.has(key)) continue;
      mapping.set(key, sheetName);
    }
  }
}

export async function buildPokemonNameMapping(
  spreadsheetId: string,
  options: PokemonNameOptions = {}
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  const aliasMaps = await getPokemonAliasMaps();

  const pokedexData = await readSheetRange(spreadsheetId, "Pokédex!A1:T1500");
  if (pokedexData) {
    for (let i = 1; i < pokedexData.length; i++) {
      const row = pokedexData[i];
      if (!row) continue;

      const smogonName = String(row[9] || "");
      const displayName = String(row[18] || "");

      if (!smogonName || !displayName || displayName === "-") continue;

      addSheetPokemonName(
        mapping,
        smogonName,
        displayName,
        options,
        pokemonExactLookupKeysWithAliases(smogonName, aliasMaps, options)
      );
      addSheetPokemonName(
        mapping,
        displayName,
        displayName,
        options,
        pokemonExactLookupKeysWithAliases(displayName, aliasMaps, options)
      );
    }
  }

  for (const [dbName, sheetName] of Object.entries(SHEET_MANUAL_POKEMON_MAPPINGS)) {
    addSheetPokemonName(
      mapping,
      dbName,
      sheetName,
      options,
      pokemonExactLookupKeysWithAliases(dbName, aliasMaps, options)
    );
  }

  return mapping;
}

export function convertPokemonName(
  dbName: string,
  mapping: Map<string, string>,
  options: PokemonNameOptions = { friendlyMegaNames: true }
): string {
  const mapped = mapping.get(dbName.toLowerCase());
  if (mapped) return mapped;

  const rawKey = pokemonNameKey(dbName);
  const rawMapped = mapping.get(rawKey);
  if (rawMapped) return rawMapped;

  for (const key of pokemonExactLookupKeys(dbName, options)) {
    const aliasMapped = mapping.get(key);
    if (aliasMapped) return aliasMapped;
  }

  return dbName;
}

export function sheetNameMappingOptionsForSeason(seasonNumber: number | null | undefined) {
  return {
    friendlyMegaNames: shouldUseFriendlyMegaNamesForSeason(seasonNumber),
  };
}
