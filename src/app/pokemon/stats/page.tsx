import Link from "next/link";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { matchPokemon, killEvents } from "@/lib/schema";
import { isNotNull } from "drizzle-orm";
import { PokemonStatsClient } from "./pokemon-stats-client";

// The production image does not contain the local SQLite database used during
// development, so keep the route runtime-rendered and cache the data queries
// instead of attempting to query SQLite during the Docker build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pokemon Battle Stats",
};

async function getPokemonBattleStatsUncached() {
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    where: isNotNull(matchPokemon.damageDealt),
    columns: {
      pokemonId: true,
      damageDealt: true,
      damageDealtIndirect: true,
      damageTaken: true,
      damageTakenIndirect: true,
      hpRestored: true,
    },
    with: {
      pokemon: {
        columns: { id: true, name: true, displayName: true, spriteUrl: true },
      },
      match: { columns: { seasonId: true, divisionId: true } },
    },
  });

  // Bucket per (pokemon, season, division) so the client can filter & re-aggregate
  const groupMap = new Map<
    string,
    {
      id: number;
      name: string;
      displayName: string | null;
      spriteUrl: string | null;
      seasonId: number;
      divisionId: number | null;
      totalDamageDealt: number;
      totalDamageDealtIndirect: number;
      totalDamageTaken: number;
      totalDamageTakenIndirect: number;
      totalHpRestored: number;
      gamesPlayed: number;
    }
  >();

  for (const mp of allMatchPokemon) {
    if (!mp.pokemon || !mp.match) continue;
    const seasonId = mp.match.seasonId;
    const divisionId = mp.match.divisionId ?? null;
    const key = `${mp.pokemon.id}-${seasonId}-${divisionId ?? "x"}`;

    const existing = groupMap.get(key) || {
      id: mp.pokemon.id,
      name: mp.pokemon.name,
      displayName: mp.pokemon.displayName,
      spriteUrl: mp.pokemon.spriteUrl,
      seasonId,
      divisionId,
      totalDamageDealt: 0,
      totalDamageDealtIndirect: 0,
      totalDamageTaken: 0,
      totalDamageTakenIndirect: 0,
      totalHpRestored: 0,
      gamesPlayed: 0,
    };

    existing.totalDamageDealt += mp.damageDealt ?? 0;
    existing.totalDamageDealtIndirect += mp.damageDealtIndirect ?? 0;
    existing.totalDamageTaken += mp.damageTaken ?? 0;
    existing.totalDamageTakenIndirect += mp.damageTakenIndirect ?? 0;
    existing.totalHpRestored += mp.hpRestored ?? 0;
    existing.gamesPlayed += 1;

    groupMap.set(key, existing);
  }

  return Array.from(groupMap.values());
}

async function getSeasonsAndDivisionsUncached() {
  const [allSeasons, allDivisions] = await Promise.all([
    db.query.seasons.findMany({
      columns: { id: true, name: true, seasonNumber: true },
    }),
    db.query.divisions.findMany({
      columns: { id: true, name: true, seasonId: true, displayOrder: true },
    }),
  ]);
  return {
    seasons: allSeasons
      .map((s) => ({ id: s.id, name: s.name, seasonNumber: s.seasonNumber }))
      .sort((a, b) => b.seasonNumber - a.seasonNumber),
    divisions: allDivisions.map((d) => ({
      id: d.id,
      name: d.name,
      seasonId: d.seasonId,
      displayOrder: d.displayOrder ?? 0,
    })),
  };
}

const getPokemonBattleStats = unstable_cache(
  getPokemonBattleStatsUncached,
  ["pokemon-stats-battle"],
  { revalidate: 300 }
);

const getSeasonsAndDivisions = unstable_cache(
  getSeasonsAndDivisionsUncached,
  ["pokemon-stats-seasons-divisions"],
  { revalidate: 300 }
);

export interface MiscStatEntry {
  label: string;
  value: string;
  description: string;
  pokemon1?: { name: string; spriteUrl: string | null };
  pokemon2?: { name: string; spriteUrl: string | null };
  contributors?: { coachId: number; name: string; count: number }[];
  extra?: string;
}

type Contributor = NonNullable<MiscStatEntry["contributors"]>[number];

function getContributorList(
  seasonCoaches: Array<{ coachId: number; coach?: { name: string } | null }>
): Contributor[] {
  const contributors = new Map<number, Contributor>();

  for (const seasonCoach of seasonCoaches) {
    const existing = contributors.get(seasonCoach.coachId);
    if (existing) {
      existing.count += 1;
    } else {
      contributors.set(seasonCoach.coachId, {
        coachId: seasonCoach.coachId,
        name: seasonCoach.coach?.name || "Unknown",
        count: 1,
      });
    }
  }

  return Array.from(contributors.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

async function getPokemonFunFactsUncached(): Promise<MiscStatEntry[]> {
  const entries: MiscStatEntry[] = [];

  // Get Season 10 IDs first (needed to filter everything else)
  const allSeasons = await db.query.seasons.findMany({
    columns: { id: true, seasonNumber: true },
  });
  const season10Ids = new Set(allSeasons.filter((s) => s.seasonNumber === 10).map((s) => s.id));

  // Run all data queries in parallel
  const [rawKills, rawRosters, rawMP] = await Promise.all([
    db.query.killEvents.findMany({
      where: isNotNull(killEvents.killerPokemonId),
      columns: {
        matchId: true,
        turn: true,
        killerPokemonId: true,
        killerSeasonCoachId: true,
        victimPokemonId: true,
        victimSeasonCoachId: true,
        cause: true,
      },
      with: {
        killerPokemon: {
          columns: { id: true, name: true, displayName: true, spriteUrl: true },
        },
        victimPokemon: {
          columns: { id: true, name: true, displayName: true, spriteUrl: true },
        },
        killerSeasonCoach: {
          columns: { coachId: true },
          with: { coach: { columns: { name: true } } },
        },
        victimSeasonCoach: {
          columns: { coachId: true },
          with: { coach: { columns: { name: true } } },
        },
        match: { columns: { seasonId: true } },
      },
    }),
    db.query.rosters.findMany({
      columns: { seasonCoachId: true, pokemonId: true, price: true },
    }),
    db.query.matchPokemon.findMany({
      columns: {
        pokemonId: true,
        seasonCoachId: true,
        kills: true,
        deaths: true,
        damageTaken: true,
        damageTakenIndirect: true,
        damageDealtIndirect: true,
        hpRestored: true,
      },
      with: {
        pokemon: {
          columns: { id: true, name: true, displayName: true, spriteUrl: true },
        },
        match: { columns: { seasonId: true } },
        seasonCoach: {
          columns: { coachId: true },
          with: { coach: { columns: { name: true } } },
        },
      },
    }),
  ]);

  const allKills = rawKills.filter((k) => k.match && season10Ids.has(k.match.seasonId));
  const allMP = rawMP.filter((mp) => mp.match && season10Ids.has(mp.match.seasonId));
  // Map: `${seasonCoachId}-${pokemonId}` -> price
  const rosterPriceMap = new Map<string, number>();
  for (const r of rawRosters) {
    rosterPriceMap.set(`${r.seasonCoachId}-${r.pokemonId}`, r.price);
  }

  // 1. Biggest point difference kill (cheap mon beats expensive mon)
  // Use the actual roster price from the killer's and victim's season coach
  let biggestUpset: { killer: typeof allKills[0]; diff: number; killerPrice: number; victimPrice: number } | null = null;
  for (const kill of allKills) {
    if (!kill.killerPokemonId || !kill.victimPokemonId || !kill.killerSeasonCoachId || !kill.victimSeasonCoachId) continue;
    const killerPrice = rosterPriceMap.get(`${kill.killerSeasonCoachId}-${kill.killerPokemonId}`) ?? 0;
    const victimPrice = rosterPriceMap.get(`${kill.victimSeasonCoachId}-${kill.victimPokemonId}`) ?? 0;
    if (killerPrice === 0 || victimPrice === 0) continue; // skip if no price data
    const diff = victimPrice - killerPrice;
    if (!biggestUpset || diff > biggestUpset.diff) {
      biggestUpset = { killer: kill, diff, killerPrice, victimPrice };
    }
  }
  if (biggestUpset && biggestUpset.killer.killerPokemon && biggestUpset.killer.victimPokemon) {
    entries.push({
      label: "Biggest Upset Kill",
      value: `${biggestUpset.diff} pt difference`,
      description: `${biggestUpset.killer.killerPokemon.displayName || biggestUpset.killer.killerPokemon.name} (${biggestUpset.killerPrice}pts) KO'd ${biggestUpset.killer.victimPokemon.displayName || biggestUpset.killer.victimPokemon.name} (${biggestUpset.victimPrice}pts)`,
      pokemon1: { name: biggestUpset.killer.killerPokemon.displayName || biggestUpset.killer.killerPokemon.name, spriteUrl: biggestUpset.killer.killerPokemon.spriteUrl },
      pokemon2: { name: biggestUpset.killer.victimPokemon.displayName || biggestUpset.killer.victimPokemon.name, spriteUrl: biggestUpset.killer.victimPokemon.spriteUrl },
      contributors: biggestUpset.killer.killerSeasonCoach
        ? getContributorList([biggestUpset.killer.killerSeasonCoach])
        : undefined,
    });
  }

  // 2. Hazard Victim — Pokemon that has died the most to indirect damage
  const indirectDeaths = allKills.filter(k => k.cause !== 'move' && k.victimPokemon);
  const indirectDeathsByPokemon = new Map<number, { count: number; pokemon: typeof allKills[0]['victimPokemon'] }>();
  for (const k of indirectDeaths) {
    if (!k.victimPokemon) continue;
    const existing = indirectDeathsByPokemon.get(k.victimPokemonId);
    indirectDeathsByPokemon.set(k.victimPokemonId, {
      count: (existing?.count || 0) + 1,
      pokemon: k.victimPokemon,
    });
  }
  const topHazardVictim = [...indirectDeathsByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topHazardVictim && topHazardVictim[1].pokemon) {
    entries.push({
      label: "Hazard Victim",
      value: `${topHazardVictim[1].count} indirect deaths`,
      description: `${topHazardVictim[1].pokemon.displayName || topHazardVictim[1].pokemon.name} keeps getting chipped out by hazards, weather & status`,
      pokemon1: { name: topHazardVictim[1].pokemon.displayName || topHazardVictim[1].pokemon.name, spriteUrl: topHazardVictim[1].pokemon.spriteUrl },
      contributors: getContributorList(
        indirectDeaths
          .filter((k) => k.victimPokemonId === topHazardVictim[0] && k.victimSeasonCoach)
          .map((k) => k.victimSeasonCoach!)
      ),
    });
  }

  // 3. Pokemon with most kills on turn 1
  const turn1Kills = allKills.filter(k => k.turn === 1 && k.killerPokemonId);
  const turn1ByPokemon = new Map<number, { count: number; pokemon: typeof allKills[0]['killerPokemon'] }>();
  for (const k of turn1Kills) {
    if (!k.killerPokemonId || !k.killerPokemon) continue;
    const existing = turn1ByPokemon.get(k.killerPokemonId);
    if (!existing || k.killerPokemonId) {
      turn1ByPokemon.set(k.killerPokemonId, {
        count: (existing?.count || 0) + 1,
        pokemon: k.killerPokemon,
      });
    }
  }
  const topTurn1 = [...turn1ByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topTurn1 && topTurn1[1].pokemon) {
    entries.push({
      label: "Turn 1 Assassin",
      value: `${topTurn1[1].count} turn-1 kills`,
      description: `${topTurn1[1].pokemon.displayName || topTurn1[1].pokemon.name} gets it done early`,
      pokemon1: { name: topTurn1[1].pokemon.displayName || topTurn1[1].pokemon.name, spriteUrl: topTurn1[1].pokemon.spriteUrl },
      contributors: getContributorList(
        turn1Kills
          .filter((k) => k.killerPokemonId === topTurn1[0] && k.killerSeasonCoach)
          .map((k) => k.killerSeasonCoach!)
      ),
    });
  }

  // 4. Chain Killer — cumulative "chain bonus" kills across all games
  // A chain of 3 consecutive kills = 2 chain points (first kill starts the chain, extras count)
  // A chain of 2 = 1 chain point. These accumulate across all matches.
  const killsByMatch = new Map<number, typeof allKills>();
  for (const k of allKills) {
    if (!k.killerPokemonId || !k.match) continue;
    const list = killsByMatch.get(k.matchId) || [];
    list.push(k);
    killsByMatch.set(k.matchId, list);
  }

  const chainScores = new Map<number, { score: number; pokemon: typeof allKills[0]['killerPokemon'] }>();
  for (const [, kills] of killsByMatch) {
    const sorted = kills.sort((a, b) => a.turn - b.turn);
    let currentChain = 1;
    let currentPokemonId = sorted[0]?.killerPokemonId;

    const flushChain = (pokemonId: number | null, chain: number, lastKill: typeof allKills[0]) => {
      if (chain >= 2 && pokemonId) {
        const bonus = chain - 1; // first kill doesn't count
        const existing = chainScores.get(pokemonId) || { score: 0, pokemon: lastKill.killerPokemon };
        existing.score += bonus;
        chainScores.set(pokemonId, existing);
      }
    };

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].killerPokemonId === currentPokemonId && currentPokemonId) {
        currentChain++;
      } else {
        flushChain(currentPokemonId, currentChain, sorted[i - 1]);
        currentPokemonId = sorted[i].killerPokemonId;
        currentChain = 1;
      }
    }
    flushChain(currentPokemonId, currentChain, sorted[sorted.length - 1]);
  }

  const topChain = [...chainScores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  if (topChain && topChain[1].pokemon) {
    entries.push({
      label: "Chain Killer",
      value: `${topChain[1].score} chain kills`,
      description: `${topChain[1].pokemon.displayName || topChain[1].pokemon.name} racks up consecutive KOs like no other`,
      pokemon1: { name: topChain[1].pokemon.displayName || topChain[1].pokemon.name, spriteUrl: topChain[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allKills
          .filter((k) => k.killerPokemonId === topChain[0] && k.killerSeasonCoach)
          .map((k) => k.killerSeasonCoach!)
      ),
    });
  }

  // 5. Late Game Clutch — most kills on the final turn of a match
  // Group kills by match, find the max turn per match, then count kills on that turn
  const maxTurnByMatch = new Map<number, number>();
  for (const k of allKills) {
    const current = maxTurnByMatch.get(k.matchId) || 0;
    if (k.turn > current) maxTurnByMatch.set(k.matchId, k.turn);
  }
  const finalTurnKills = allKills.filter(k => k.killerPokemonId && k.turn === maxTurnByMatch.get(k.matchId));
  const clutchByPokemon = new Map<number, { count: number; pokemon: typeof allKills[0]['killerPokemon'] }>();
  for (const k of finalTurnKills) {
    if (!k.killerPokemonId || !k.killerPokemon) continue;
    const existing = clutchByPokemon.get(k.killerPokemonId);
    clutchByPokemon.set(k.killerPokemonId, {
      count: (existing?.count || 0) + 1,
      pokemon: k.killerPokemon,
    });
  }
  const topClutch = [...clutchByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topClutch && topClutch[1].pokemon) {
    entries.push({
      label: "Late Game Clutch",
      value: `${topClutch[1].count} game-ending KOs`,
      description: `${topClutch[1].pokemon.displayName || topClutch[1].pokemon.name} delivers the final blow`,
      pokemon1: { name: topClutch[1].pokemon.displayName || topClutch[1].pokemon.name, spriteUrl: topClutch[1].pokemon.spriteUrl },
      contributors: getContributorList(
        finalTurnKills
          .filter((k) => k.killerPokemonId === topClutch[0] && k.killerSeasonCoach)
          .map((k) => k.killerSeasonCoach!)
      ),
    });
  }

  // 6. Giant Slayer — most kills against Pokemon that cost more than itself
  const giantSlayerMap = new Map<number, { count: number; pokemon: typeof allKills[0]['killerPokemon'] }>();
  for (const kill of allKills) {
    if (!kill.killerPokemonId || !kill.victimPokemonId || !kill.killerSeasonCoachId || !kill.victimSeasonCoachId || !kill.killerPokemon) continue;
    const killerPrice = rosterPriceMap.get(`${kill.killerSeasonCoachId}-${kill.killerPokemonId}`) ?? 0;
    const victimPrice = rosterPriceMap.get(`${kill.victimSeasonCoachId}-${kill.victimPokemonId}`) ?? 0;
    if (killerPrice === 0 || victimPrice === 0) continue;
    if (victimPrice > killerPrice) {
      const existing = giantSlayerMap.get(kill.killerPokemonId);
      giantSlayerMap.set(kill.killerPokemonId, {
        count: (existing?.count || 0) + 1,
        pokemon: kill.killerPokemon,
      });
    }
  }
  const topGiantSlayer = [...giantSlayerMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topGiantSlayer && topGiantSlayer[1].pokemon) {
    entries.push({
      label: "Giant Slayer",
      value: `${topGiantSlayer[1].count} upward KOs`,
      description: `Most KOs on mons drafted above its own price`,
      pokemon1: { name: topGiantSlayer[1].pokemon.displayName || topGiantSlayer[1].pokemon.name, spriteUrl: topGiantSlayer[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allKills
          .filter((k) => {
            if (k.killerPokemonId !== topGiantSlayer[0] || !k.killerSeasonCoachId || !k.victimSeasonCoachId || !k.victimPokemonId || !k.killerSeasonCoach) return false;
            const killerPrice = rosterPriceMap.get(`${k.killerSeasonCoachId}-${k.killerPokemonId}`) ?? 0;
            const victimPrice = rosterPriceMap.get(`${k.victimSeasonCoachId}-${k.victimPokemonId}`) ?? 0;
            return killerPrice > 0 && victimPrice > killerPrice;
          })
          .map((k) => k.killerSeasonCoach!)
      ),
    });
  }

  // Bargain killer uses allMP from the parallel query above

  // 7. Cheapest pokemon with most kills
  const killsByPokemon = new Map<number, { kills: number; pokemon: typeof allMP[0]['pokemon']; price: number }>();
  for (const mp of allMP) {
    if (!mp.pokemon) continue;
    const price = rosterPriceMap.get(`${mp.seasonCoachId}-${mp.pokemonId}`) ?? 0;
    const existing = killsByPokemon.get(mp.pokemonId);
    if (!existing) {
      killsByPokemon.set(mp.pokemonId, { kills: mp.kills || 0, pokemon: mp.pokemon, price });
    } else {
      existing.kills += mp.kills || 0;
      // Keep the lowest non-zero price for "cheapest"
      if (price > 0 && (existing.price === 0 || price < existing.price)) existing.price = price;
    }
  }
  const bestBargain = [...killsByPokemon.entries()]
    .filter(([, v]) => v.price > 0 && v.price <= 5)
    .sort((a, b) => b[1].kills - a[1].kills)[0];
  if (bestBargain && bestBargain[1].pokemon) {
    entries.push({
      label: "Best Bargain Killer",
      value: `${bestBargain[1].kills} kills at ${bestBargain[1].price}pts`,
      description: `${bestBargain[1].pokemon.displayName || bestBargain[1].pokemon.name} proves you don't need to be expensive`,
      pokemon1: { name: bestBargain[1].pokemon.displayName || bestBargain[1].pokemon.name, spriteUrl: bestBargain[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === bestBargain[0] && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 8. Most recoil/self-inflicted deaths
  const recoilDeaths = allKills.filter(k => k.cause === 'recoil');
  const recoilByPokemon = new Map<number, { count: number; pokemon: typeof allKills[0]['victimPokemon'] }>();
  for (const k of recoilDeaths) {
    if (!k.victimPokemon) continue;
    const existing = recoilByPokemon.get(k.victimPokemonId);
    recoilByPokemon.set(k.victimPokemonId, {
      count: (existing?.count || 0) + 1,
      pokemon: k.victimPokemon,
    });
  }
  const topRecoil = [...recoilByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topRecoil && topRecoil[1].pokemon) {
    entries.push({
      label: "Self-Destructor",
      value: `${topRecoil[1].count} recoil deaths`,
      description: `${topRecoil[1].pokemon.displayName || topRecoil[1].pokemon.name} keeps taking itself out`,
      pokemon1: { name: topRecoil[1].pokemon.displayName || topRecoil[1].pokemon.name, spriteUrl: topRecoil[1].pokemon.spriteUrl },
      contributors: getContributorList(
        recoilDeaths
          .filter((k) => k.victimPokemonId === topRecoil[0] && k.victimSeasonCoach)
          .map((k) => k.victimSeasonCoach!)
      ),
    });
  }

  // 9. Wall - most damage taken per death, minimum 3 games and at least 1 death
  const durabilityByPokemon = new Map<number, {
    damageTaken: number;
    deaths: number;
    games: number;
    pokemon: typeof allMP[0]['pokemon'];
  }>();
  for (const mp of allMP) {
    if (!mp.pokemon) continue;
    const existing = durabilityByPokemon.get(mp.pokemonId) || {
      damageTaken: 0,
      deaths: 0,
      games: 0,
      pokemon: mp.pokemon,
    };
    existing.damageTaken += (mp.damageTaken ?? 0) + (mp.damageTakenIndirect ?? 0);
    existing.deaths += mp.deaths ?? 0;
    existing.games += 1;
    durabilityByPokemon.set(mp.pokemonId, existing);
  }
  const topWall = [...durabilityByPokemon.entries()]
    .filter(([, v]) => v.games >= 3 && v.deaths > 0)
    .sort((a, b) => (b[1].damageTaken / b[1].deaths) - (a[1].damageTaken / a[1].deaths))[0];
  if (topWall && topWall[1].pokemon) {
    const damagePerDeath = Math.round(topWall[1].damageTaken / topWall[1].deaths);
    entries.push({
      label: "Wall",
      value: `${damagePerDeath} dmg/death`,
      description: `${topWall[1].pokemon.displayName || topWall[1].pokemon.name} absorbs the most damage before going down`,
      pokemon1: { name: topWall[1].pokemon.displayName || topWall[1].pokemon.name, spriteUrl: topWall[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topWall[0] && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 10. Survivor - most games with 0 deaths
  const survivorByPokemon = new Map<number, { count: number; pokemon: typeof allMP[0]['pokemon'] }>();
  for (const mp of allMP) {
    if (!mp.pokemon || (mp.deaths ?? 0) > 0) continue;
    const existing = survivorByPokemon.get(mp.pokemonId);
    survivorByPokemon.set(mp.pokemonId, {
      count: (existing?.count || 0) + 1,
      pokemon: mp.pokemon,
    });
  }
  const topSurvivor = [...survivorByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topSurvivor && topSurvivor[1].pokemon) {
    entries.push({
      label: "Survivor",
      value: `${topSurvivor[1].count} deathless games`,
      description: `${topSurvivor[1].pokemon.displayName || topSurvivor[1].pokemon.name} stays alive more often than anyone`,
      pokemon1: { name: topSurvivor[1].pokemon.displayName || topSurvivor[1].pokemon.name, spriteUrl: topSurvivor[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topSurvivor[0] && (mp.deaths ?? 0) === 0 && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 11. Clean Game - most games with 1+ kills and 0 deaths
  const cleanGamesByPokemon = new Map<number, { count: number; pokemon: typeof allMP[0]['pokemon'] }>();
  for (const mp of allMP) {
    if (!mp.pokemon || (mp.kills ?? 0) < 1 || (mp.deaths ?? 0) > 0) continue;
    const existing = cleanGamesByPokemon.get(mp.pokemonId);
    cleanGamesByPokemon.set(mp.pokemonId, {
      count: (existing?.count || 0) + 1,
      pokemon: mp.pokemon,
    });
  }
  const topCleanGame = [...cleanGamesByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topCleanGame && topCleanGame[1].pokemon) {
    entries.push({
      label: "Clean Game",
      value: `${topCleanGame[1].count} clean games`,
      description: `${topCleanGame[1].pokemon.displayName || topCleanGame[1].pokemon.name} gets KOs without fainting`,
      pokemon1: { name: topCleanGame[1].pokemon.displayName || topCleanGame[1].pokemon.name, spriteUrl: topCleanGame[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topCleanGame[0] && (mp.kills ?? 0) >= 1 && (mp.deaths ?? 0) === 0 && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 12. Favorite Target - most common killer/victim Pokemon pairing
  const targetPairs = new Map<string, {
    count: number;
    killer: typeof allKills[0]['killerPokemon'];
    victim: typeof allKills[0]['victimPokemon'];
  }>();
  for (const kill of allKills) {
    if (!kill.killerPokemonId || !kill.victimPokemonId || !kill.killerPokemon || !kill.victimPokemon) continue;
    const key = `${kill.killerPokemonId}-${kill.victimPokemonId}`;
    const existing = targetPairs.get(key);
    targetPairs.set(key, {
      count: (existing?.count || 0) + 1,
      killer: kill.killerPokemon,
      victim: kill.victimPokemon,
    });
  }
  const topTargetPair = [...targetPairs.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topTargetPair && topTargetPair[1].killer && topTargetPair[1].victim) {
    entries.push({
      label: "Favorite Target",
      value: `${topTargetPair[1].count} KOs`,
      description: `${topTargetPair[1].killer.displayName || topTargetPair[1].killer.name} has KO'd ${topTargetPair[1].victim.displayName || topTargetPair[1].victim.name} the most`,
      pokemon1: { name: topTargetPair[1].killer.displayName || topTargetPair[1].killer.name, spriteUrl: topTargetPair[1].killer.spriteUrl },
      pokemon2: { name: topTargetPair[1].victim.displayName || topTargetPair[1].victim.name, spriteUrl: topTargetPair[1].victim.spriteUrl },
      contributors: getContributorList(
        allKills
          .filter((k) => `${k.killerPokemonId}-${k.victimPokemonId}` === topTargetPair[0] && k.killerSeasonCoach)
          .map((k) => k.killerSeasonCoach!)
      ),
    });
  }

  // 13. Sweep Threat - most games with 3+ kills
  const sweepThreatByPokemon = new Map<number, { count: number; pokemon: typeof allMP[0]['pokemon'] }>();
  for (const mp of allMP) {
    if (!mp.pokemon || (mp.kills ?? 0) < 3) continue;
    const existing = sweepThreatByPokemon.get(mp.pokemonId);
    sweepThreatByPokemon.set(mp.pokemonId, {
      count: (existing?.count || 0) + 1,
      pokemon: mp.pokemon,
    });
  }
  const topSweepThreat = [...sweepThreatByPokemon.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topSweepThreat && topSweepThreat[1].pokemon) {
    entries.push({
      label: "Sweep Threat",
      value: `${topSweepThreat[1].count} sweep games`,
      description: `${topSweepThreat[1].pokemon.displayName || topSweepThreat[1].pokemon.name} has the most games with 3+ KOs`,
      pokemon1: { name: topSweepThreat[1].pokemon.displayName || topSweepThreat[1].pokemon.name, spriteUrl: topSweepThreat[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topSweepThreat[0] && (mp.kills ?? 0) >= 3 && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 14. Punching Bag - most total damage taken
  const damageTakenByPokemon = new Map<number, { damage: number; pokemon: typeof allMP[0]['pokemon'] }>();
  for (const mp of allMP) {
    if (!mp.pokemon) continue;
    const existing = damageTakenByPokemon.get(mp.pokemonId);
    damageTakenByPokemon.set(mp.pokemonId, {
      damage: (existing?.damage || 0) + (mp.damageTaken ?? 0) + (mp.damageTakenIndirect ?? 0),
      pokemon: mp.pokemon,
    });
  }
  const topPunchingBag = [...damageTakenByPokemon.entries()].sort((a, b) => b[1].damage - a[1].damage)[0];
  if (topPunchingBag && topPunchingBag[1].pokemon) {
    entries.push({
      label: "Punching Bag",
      value: `${Math.round(topPunchingBag[1].damage)} damage taken`,
      description: `${topPunchingBag[1].pokemon.displayName || topPunchingBag[1].pokemon.name} has soaked up the most damage`,
      pokemon1: { name: topPunchingBag[1].pokemon.displayName || topPunchingBag[1].pokemon.name, spriteUrl: topPunchingBag[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topPunchingBag[0] && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 15. Chip Monster - most indirect damage dealt
  const chipDamageByPokemon = new Map<number, { damage: number; pokemon: typeof allMP[0]['pokemon'] }>();
  for (const mp of allMP) {
    if (!mp.pokemon) continue;
    const existing = chipDamageByPokemon.get(mp.pokemonId);
    chipDamageByPokemon.set(mp.pokemonId, {
      damage: (existing?.damage || 0) + (mp.damageDealtIndirect ?? 0),
      pokemon: mp.pokemon,
    });
  }
  const topChipMonster = [...chipDamageByPokemon.entries()].sort((a, b) => b[1].damage - a[1].damage)[0];
  if (topChipMonster && topChipMonster[1].pokemon && topChipMonster[1].damage > 0) {
    entries.push({
      label: "Chip Monster",
      value: `${Math.round(topChipMonster[1].damage)} indirect damage`,
      description: `${topChipMonster[1].pokemon.displayName || topChipMonster[1].pokemon.name} leads the league in indirect damage`,
      pokemon1: { name: topChipMonster[1].pokemon.displayName || topChipMonster[1].pokemon.name, spriteUrl: topChipMonster[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topChipMonster[0] && (mp.damageDealtIndirect ?? 0) > 0 && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  // 16. Medic - most HP restored per game, minimum 3 games
  const healingByPokemon = new Map<number, {
    healing: number;
    games: number;
    pokemon: typeof allMP[0]['pokemon'];
  }>();
  for (const mp of allMP) {
    if (!mp.pokemon) continue;
    const existing = healingByPokemon.get(mp.pokemonId) || {
      healing: 0,
      games: 0,
      pokemon: mp.pokemon,
    };
    existing.healing += mp.hpRestored ?? 0;
    existing.games += 1;
    healingByPokemon.set(mp.pokemonId, existing);
  }
  const topMedic = [...healingByPokemon.entries()]
    .filter(([, v]) => v.games >= 3 && v.healing > 0)
    .sort((a, b) => (b[1].healing / b[1].games) - (a[1].healing / a[1].games))[0];
  if (topMedic && topMedic[1].pokemon) {
    const healingPerGame = Math.round(topMedic[1].healing / topMedic[1].games);
    entries.push({
      label: "Medic",
      value: `${healingPerGame} HP/game`,
      description: `${topMedic[1].pokemon.displayName || topMedic[1].pokemon.name} restores the most HP per game`,
      pokemon1: { name: topMedic[1].pokemon.displayName || topMedic[1].pokemon.name, spriteUrl: topMedic[1].pokemon.spriteUrl },
      contributors: getContributorList(
        allMP
          .filter((mp) => mp.pokemonId === topMedic[0] && (mp.hpRestored ?? 0) > 0 && mp.seasonCoach)
          .map((mp) => mp.seasonCoach!)
      ),
    });
  }

  return entries;
}

export const getPokemonFunFacts = unstable_cache(
  getPokemonFunFactsUncached,
  ["pokemon-stats-fun-facts"],
  { revalidate: 300 }
);

export default async function PokemonStatsPage() {
  const [stats, filterOptions] = await Promise.all([
    getPokemonBattleStats(),
    getSeasonsAndDivisions(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="poke-card p-6">
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Link
            href="/leaderboards"
            className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
          >
            Leaderboards
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white">
              Pokemon Battle Stats
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              All-time damage dealt, damage taken, and HP recovered
            </p>
          </div>
          <Link href="/pokemon/combinations" className="btn-retro-secondary inline-flex w-fit px-3 py-2 text-[10px]">
            View Combinations
          </Link>
        </div>
      </div>

      <PokemonStatsClient
        stats={stats}
        seasons={filterOptions.seasons}
        divisions={filterOptions.divisions}
      />
    </div>
  );
}
