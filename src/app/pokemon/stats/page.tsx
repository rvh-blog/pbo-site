import Link from "next/link";
import { db } from "@/lib/db";
import { matchPokemon, killEvents, rosters, pokemon, seasonCoaches, matches } from "@/lib/schema";
import { isNotNull, eq, and, isNull } from "drizzle-orm";
import { PokemonStatsClient } from "./pokemon-stats-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pokemon Battle Stats",
};

async function getPokemonBattleStats() {
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    where: isNotNull(matchPokemon.damageDealt),
    with: {
      pokemon: true,
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

async function getSeasonsAndDivisions() {
  const [allSeasons, allDivisions] = await Promise.all([
    db.query.seasons.findMany(),
    db.query.divisions.findMany(),
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

export interface MiscStatEntry {
  label: string;
  value: string;
  description: string;
  pokemon1?: { name: string; spriteUrl: string | null };
  pokemon2?: { name: string; spriteUrl: string | null };
  extra?: string;
}

async function getMiscStats(): Promise<MiscStatEntry[]> {
  const entries: MiscStatEntry[] = [];

  // Get S10+ season IDs first (needed to filter everything else)
  const s10Seasons = await db.query.seasons.findMany();
  const s10SeasonIds = new Set(s10Seasons.filter(s => s.seasonNumber >= 10).map(s => s.id));

  // Run all data queries in parallel
  const [rawKills, rawRosters, rawMP] = await Promise.all([
    db.query.killEvents.findMany({
      where: isNotNull(killEvents.killerPokemonId),
      with: {
        killerPokemon: true,
        victimPokemon: true,
        killerSeasonCoach: true,
        victimSeasonCoach: true,
        match: true,
      },
    }),
    db.query.rosters.findMany({
      with: { seasonCoach: true },
    }),
    db.query.matchPokemon.findMany({ with: { pokemon: true, match: true } }),
  ]);

  const allKills = rawKills.filter(k => k.match && s10SeasonIds.has(k.match.seasonId));
  const allMP = rawMP.filter(mp => mp.match && s10SeasonIds.has(mp.match.seasonId));
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
    });
  }

  return entries;
}

export default async function PokemonStatsPage() {
  const [stats, miscStats, filterOptions] = await Promise.all([
    getPokemonBattleStats(),
    getMiscStats(),
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
        <h1 className="font-pixel text-xl md:text-2xl text-white">
          Pokemon Battle Stats
        </h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          All-time damage dealt, damage taken, and HP recovered
        </p>
      </div>

      <PokemonStatsClient
        stats={stats}
        miscStats={miscStats}
        seasons={filterOptions.seasons}
        divisions={filterOptions.divisions}
      />
    </div>
  );
}
