import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { divisions, seasonCoaches, rosters, matches, transactions, pokemon, seasonPokemonPrices } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPublicVisibilityState, isDivisionPubliclyVisible, isPublicSeasonVisible } from "@/lib/public-visibility";

interface PageProps {
  params: Promise<{ id: string; divId: string }>;
}

async function getDivisionData(divisionId: number) {
  // Fetch all data in parallel
  const [division, coaches, allRosters, divisionMatches] = await Promise.all([
    db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
      with: { season: true },
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, divisionId),
      with: { coach: true },
    }),
    db.query.rosters.findMany({
      with: { pokemon: true },
    }),
    db.query.matches.findMany({
      where: eq(matches.divisionId, divisionId),
    }),
  ]);

  // Fetch transactions for all coaches in this division (including partner P2P trades)
  const coachIds = coaches.map(c => c.id);
  const [allTransactions, allPartnerP2PTxs] = coachIds.length > 0
    ? await Promise.all([
        db.query.transactions.findMany({
          where: inArray(transactions.seasonCoachId, coachIds),
        }),
        db.query.transactions.findMany({
          where: and(
            eq(transactions.type, "P2P_TRADE"),
            inArray(transactions.tradingPartnerSeasonCoachId, coachIds),
          ),
        }),
      ])
    : [[], []];

  // Group transactions by season coach
  const txBySeasonCoach = new Map<number, typeof allTransactions>();
  for (const tx of allTransactions) {
    if (!txBySeasonCoach.has(tx.seasonCoachId)) {
      txBySeasonCoach.set(tx.seasonCoachId, []);
    }
    txBySeasonCoach.get(tx.seasonCoachId)!.push(tx);
  }
  // Add partner P2P trades with pokemonIn/pokemonOut swapped
  for (const tx of allPartnerP2PTxs) {
    const partnerId = tx.tradingPartnerSeasonCoachId!;
    if (!txBySeasonCoach.has(partnerId)) {
      txBySeasonCoach.set(partnerId, []);
    }
    txBySeasonCoach.get(partnerId)!.push({
      ...tx,
      pokemonIn: tx.pokemonOut,
      pokemonOut: tx.pokemonIn,
    });
  }

  return { division, coaches, allRosters, divisionMatches, txBySeasonCoach };
}

export default async function DivisionRostersPage({ params }: PageProps) {
  const resolvedParams = await params;
  const seasonId = parseInt(resolvedParams.id);
  const divisionId = parseInt(resolvedParams.divId);

  const [{ division, coaches, allRosters, divisionMatches, txBySeasonCoach }, session, visibility] = await Promise.all([
    getDivisionData(divisionId),
    getSession(),
    getPublicVisibilityState(),
  ]);

  if (
    !division ||
    division.seasonId !== seasonId ||
    (!session?.isMod &&
      (!isDivisionPubliclyVisible(division, visibility) ||
        !division.season ||
        !isPublicSeasonVisible(division.season)))
  ) {
    notFound();
  }

  // Build Pokemon lookup for dropped Pokemon details and fetch season prices
  const [allPokemon, seasonPrices] = await Promise.all([
    db.query.pokemon.findMany(),
    db.query.seasonPokemonPrices.findMany({
      where: eq(seasonPokemonPrices.seasonId, seasonId),
    }),
  ]);

  // Build price lookup: pokemonId -> { basePrice, teraCost }
  const priceByPokemonId = new Map<number, { basePrice: number; teraCost: number }>();
  for (const p of seasonPrices) {
    priceByPokemonId.set(p.pokemonId, {
      basePrice: p.price,
      teraCost: p.teraCaptainCost ?? 0,
    });
  }
  const pokemonById = new Map(allPokemon.map(p => [p.id, p]));

  // Filter to active coaches only and build roster data
  const activeCoaches = coaches.filter((c) => c.isActive);

  // Build roster lookup by seasonCoachId
  const rostersByCoach = new Map<number, typeof allRosters>();
  for (const r of allRosters) {
    const list = rostersByCoach.get(r.seasonCoachId) || [];
    list.push(r);
    rostersByCoach.set(r.seasonCoachId, list);
  }

  // Build team data with rosters and budget calculations
  const teamsWithRosters = activeCoaches.map((coach) => {
    const rawRosters = rostersByCoach.get(coach.id) || [];
    const coachTransactions = txBySeasonCoach.get(coach.id) || [];

    // Compute per-coach effectiveWeek based on this coach's own completed matches
    const coachMatches = divisionMatches.filter(
      (m) => m.coach1SeasonId === coach.id || m.coach2SeasonId === coach.id
    );
    const lastCompletedWeek = coachMatches
      .filter((m) => m.week <= 100 && m.winnerId !== null)
      .reduce((max, m) => Math.max(max, m.week), 0);
    // For replacement teams, effectiveWeek must be at least their first scheduled match week
    const firstMatchWeek = coachMatches
      .filter((m) => m.week <= 100)
      .reduce((min, m) => Math.min(min, m.week), Infinity);
    const effectiveWeek = Math.max(lastCompletedWeek + 1, firstMatchWeek === Infinity ? 1 : firstMatchWeek);

    // Time-sync: Filter rosters to only show Pokemon acquired before or during effectiveWeek
    const filteredRosters = rawRosters.filter((r) => {
      if (!r.acquiredWeek) return true; // Original draft, always show
      return r.acquiredWeek <= effectiveWeek;
    });

    // Time-sync Tera Captain status based on TERA_SWAP transactions
    // Start with current TC set from roster (this is the FINAL state after all swaps)
    const teraCaptainIds = new Set<number>(
      rawRosters.filter((r) => r.isTeraCaptain).map((r) => r.pokemonId)
    );

    // Get future transactions that affected TC status (week > effectiveWeek) and reverse them
    // This includes TERA_SWAP and FA_SWAP/FA_DROP that removed a TC (oldTeraCaptainId set)
    const futureTeraChanges = coachTransactions
      .filter((tx) => tx.week > effectiveWeek && (tx.type === "TERA_SWAP" || tx.oldTeraCaptainId || tx.newTeraCaptainId))
      .sort((a, b) => b.week !== a.week ? b.week - a.week : b.id - a.id); // Sort descending

    // Reverse each future change to get the state at effectiveWeek
    for (const tx of futureTeraChanges) {
      if (tx.newTeraCaptainId) {
        teraCaptainIds.delete(tx.newTeraCaptainId);
      }
      if (tx.oldTeraCaptainId) {
        teraCaptainIds.add(tx.oldTeraCaptainId);
      }
    }

    // Update rosters with time-synced Tera Captain status and computed prices
    const teamRosters = filteredRosters.map((r) => {
      const isTeraCaptain = teraCaptainIds.has(r.pokemonId);
      const priceInfo = priceByPokemonId.get(r.pokemonId);
      const basePrice = priceInfo?.basePrice ?? r.price;
      const tcCost = isTeraCaptain ? (priceInfo?.teraCost ?? 0) : 0;
      return {
        ...r,
        isTeraCaptain,
        displayPrice: basePrice + tcCost,
      };
    });

    // Find Pokemon dropped/traded away in future weeks (should still show in roster)
    const droppedPokemonToShow: number[] = [];
    for (const tx of coachTransactions) {
      if ((tx.type === "FA_DROP" || tx.type === "FA_SWAP" || tx.type === "P2P_TRADE") && tx.week > effectiveWeek) {
        const pokemonOut = tx.pokemonOut as number[] | null;
        if (pokemonOut) {
          for (const pokemonId of pokemonOut) {
            const acquisitionTx = coachTransactions.find(t =>
              (t.type === "FA_PICKUP" || t.type === "FA_SWAP" || t.type === "P2P_TRADE") &&
              t.week < tx.week &&
              (t.pokemonIn as number[] | null)?.includes(pokemonId)
            );

            if (acquisitionTx) {
              if (acquisitionTx.week <= effectiveWeek) {
                droppedPokemonToShow.push(pokemonId);
              }
            } else {
              const priorDrop = coachTransactions.find(t =>
                (t.type === "FA_DROP" || t.type === "FA_SWAP" || t.type === "P2P_TRADE") &&
                t.week <= effectiveWeek &&
                t.id !== tx.id &&
                (t.pokemonOut as number[] | null)?.includes(pokemonId)
              );
              if (!priorDrop) {
                droppedPokemonToShow.push(pokemonId);
              }
            }
          }
        }
      }
    }

    // Get dropped Pokemon details and add them to roster display with prices and TC status
    const droppedPokemonDetails = droppedPokemonToShow
      .map(id => {
        const p = pokemonById.get(id);
        if (!p) return undefined;
        const priceInfo = priceByPokemonId.get(id);
        const isTeraCaptain = teraCaptainIds.has(id);
        const basePrice = priceInfo?.basePrice ?? 0;
        const tcCost = isTeraCaptain ? (priceInfo?.teraCost ?? 0) : 0;
        return {
          ...p,
          isTeraCaptain,
          displayPrice: basePrice + tcCost,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    // Sort: draft picks first by draft order, then transaction acquisitions by week
    teamRosters.sort((a, b) => {
      // Both have draft order - sort by draft order
      if (a.draftOrder && b.draftOrder) {
        return a.draftOrder - b.draftOrder;
      }
      // Only a has draft order - a comes first
      if (a.draftOrder && !b.draftOrder) {
        return -1;
      }
      // Only b has draft order - b comes first
      if (!a.draftOrder && b.draftOrder) {
        return 1;
      }
      // Neither has draft order - sort by acquired week
      return (a.acquiredWeek || 0) - (b.acquiredWeek || 0);
    });

    // Calculate total spent using time-synced roster with correct TC costs
    let totalSpent = 0;
    for (const r of teamRosters) {
      const priceInfo = priceByPokemonId.get(r.pokemonId);
      const basePrice = priceInfo?.basePrice ?? r.price;
      const tcCost = r.isTeraCaptain ? (priceInfo?.teraCost ?? 0) : 0;
      totalSpent += basePrice + tcCost;
    }
    // Add dropped Pokemon prices (including TC cost if they were a TC)
    for (const p of droppedPokemonDetails) {
      totalSpent += p.displayPrice;
    }

    const budgetLeft = (division.season?.draftBudget || 0) - totalSpent;

    return {
      coach,
      rosters: teamRosters,
      droppedPokemon: droppedPokemonDetails,
      totalSpent,
      budgetLeft,
    };
  });

  // Sort teams alphabetically by team name
  teamsWithRosters.sort((a, b) => a.coach.teamName.localeCompare(b.coach.teamName));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3 text-sm">
              <Link
                href="/seasons"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Seasons
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/seasons/${seasonId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {division.season?.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/seasons/${seasonId}/divisions/${divisionId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {division.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Rosters</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              {division.logoUrl && (
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center">
                  <Image
                    src={division.logoUrl}
                    alt={division.name}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
                </div>
              )}
              <div>
                <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                  {division.name} Rosters
                </h1>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {teamsWithRosters.length} active teams
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <Link href={`/seasons/${seasonId}/divisions/${divisionId}`}>
            <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Division
            </button>
          </Link>
        </div>
      </div>

      {/* Rosters Grid */}
      {teamsWithRosters.length === 0 ? (
        <div className="poke-card p-8 text-center">
          <p className="text-[var(--foreground-muted)]">No active teams in this division</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {teamsWithRosters.map(({ coach, rosters: teamRosters, droppedPokemon, totalSpent, budgetLeft }) => (
            <div key={coach.id} className="poke-card p-4 flex flex-col">
              {/* Team Header */}
              <Link href={`/coaches/${coach.coachId}`} className="group">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--background-tertiary)]">
                  {coach.teamLogoUrl ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center group-hover:border-[var(--primary)] transition-colors">
                      <Image
                        src={coach.teamLogoUrl}
                        alt={coach.teamName}
                        width={40}
                        height={40}
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {coach.teamAbbreviation || coach.teamName.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-white group-hover:text-[var(--primary)] transition-colors truncate">
                      {coach.teamName}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] truncate">
                      {coach.coach?.name}
                    </div>
                  </div>
                </div>
              </Link>

              {/* Roster Table */}
              <div className="flex-1">
                {teamRosters.length === 0 && droppedPokemon.length === 0 ? (
                  <p className="text-[var(--foreground-muted)] text-sm text-center py-4">No Pokemon drafted</p>
                ) : (
                  <div className="divide-y divide-[var(--background-tertiary)]/50">
                    {teamRosters.map((r) => (
                      <Link
                        key={r.id}
                        href={`/pokemon/${r.pokemonId}`}
                        className={`flex items-center gap-2 px-2 py-1.5 transition-colors group ${
                          r.isTeraCaptain
                            ? "bg-yellow-500/10 hover:bg-yellow-500/20"
                            : "hover:bg-[var(--background-tertiary)]/50"
                        }`}
                      >
                        {r.pokemon?.spriteUrl ? (
                          <img
                            src={r.pokemon.spriteUrl}
                            alt={r.pokemon.displayName || r.pokemon.name}
                            className="w-6 h-6 object-contain"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-[10px] text-[var(--foreground-muted)]">?</span>
                          </div>
                        )}
                        <span className="flex-1 text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                          {r.pokemon?.displayName || r.pokemon?.name}
                        </span>
                        <span className="text-sm font-mono font-bold text-[var(--secondary)]">
                          {r.displayPrice}
                        </span>
                      </Link>
                    ))}
                    {/* Dropped Pokemon (will be dropped in future week) */}
                    {droppedPokemon.map((p) => (
                      <Link
                        key={`dropped-${p.id}`}
                        href={`/pokemon/${p.id}`}
                        className={`flex items-center gap-2 px-2 py-1.5 transition-colors group ${
                          p.isTeraCaptain
                            ? "bg-yellow-500/10 hover:bg-yellow-500/20"
                            : "hover:bg-[var(--background-tertiary)]/50"
                        }`}
                      >
                        {p.spriteUrl ? (
                          <img
                            src={p.spriteUrl}
                            alt={p.displayName || p.name}
                            className="w-6 h-6 object-contain"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-[10px] text-[var(--foreground-muted)]">?</span>
                          </div>
                        )}
                        <span className="flex-1 text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                          {p.displayName || p.name}
                        </span>
                        <span className="text-sm font-mono font-bold text-[var(--secondary)]">
                          {p.displayPrice}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Budget Footer */}
              <div className="mt-4 pt-3 border-t border-[var(--background-tertiary)] flex items-center justify-between">
                <span className="text-xs text-[var(--foreground-muted)]">Budget Remaining</span>
                <span className={`font-mono font-bold ${budgetLeft >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                  {budgetLeft}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
