import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { divisions, seasonCoaches, transactions, pokemon, rosters } from "@/lib/schema";
import { eq, desc, or, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TransactionsFilter } from "./transactions-filter";
import { getSession } from "@/lib/session";
import { getPublicVisibilityState, isDivisionPubliclyVisible, isPublicSeasonVisible } from "@/lib/public-visibility";

interface PageProps {
  params: Promise<{ id: string; divId: string }>;
  searchParams: Promise<{ week?: string }>;
}

export default async function DivisionTransactionsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const seasonId = parseInt(resolvedParams.id);
  const divisionId = parseInt(resolvedParams.divId);
  const weekFilter = resolvedSearchParams.week ? parseInt(resolvedSearchParams.week) : null;

  // Fetch all data in parallel
  const [division, divisionCoaches, allTxs, allPokemon, allRosters, session, visibility] = await Promise.all([
    db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
      with: { season: true },
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, divisionId),
      with: { coach: true },
    }),
    db.query.transactions.findMany({
      orderBy: [desc(transactions.week), desc(transactions.id)],
    }),
    db.query.pokemon.findMany(),
    db.query.rosters.findMany({
      columns: { seasonCoachId: true, pokemonId: true, isTeraCaptain: true },
    }),
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

  // Build lookups for in-memory processing
  const coachIds = new Set(divisionCoaches.map((sc) => sc.id));
  const pokemonById = new Map(allPokemon.map((p) => [p.id, p]));
  const coachById = new Map(divisionCoaches.map((c) => [c.id, c]));

  // Build roster TC lookup: "seasonCoachId-pokemonId" → isTeraCaptain
  const rosterTCMap = new Map<string, boolean>();
  for (const r of allRosters) {
    rosterTCMap.set(`${r.seasonCoachId}-${r.pokemonId}`, !!r.isTeraCaptain);
  }

  // Filter and enhance transactions for this division
  const allTransactions = allTxs
    .filter(
      (tx) =>
        coachIds.has(tx.seasonCoachId) ||
        (tx.tradingPartnerSeasonCoachId && coachIds.has(tx.tradingPartnerSeasonCoachId))
    )
    .map((tx) => {
      const pokemonInIds = (tx.pokemonIn as number[]) || [];
      const pokemonOutIds = (tx.pokemonOut as number[]) || [];

      return {
        ...tx,
        pokemonInDetails: pokemonInIds.map((id) => {
          const p = pokemonById.get(id);
          if (!p) return null;
          const isTeraCaptain = tx.type === "P2P_TRADE"
            ? rosterTCMap.get(`${tx.seasonCoachId}-${id}`) || false
            : undefined;
          return { ...p, isTeraCaptain };
        }).filter((p): p is NonNullable<typeof p> => p !== null),
        pokemonOutDetails: pokemonOutIds.map((id) => {
          const p = pokemonById.get(id);
          if (!p) return null;
          const isTeraCaptain = tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId
            ? rosterTCMap.get(`${tx.tradingPartnerSeasonCoachId}-${id}`) || false
            : undefined;
          return { ...p, isTeraCaptain };
        }).filter((p): p is NonNullable<typeof p> => p !== null),
        newTeraCaptainDetails: tx.newTeraCaptainId ? pokemonById.get(tx.newTeraCaptainId) || null : null,
        oldTeraCaptainDetails: tx.oldTeraCaptainId ? pokemonById.get(tx.oldTeraCaptainId) || null : null,
        seasonCoach: coachById.get(tx.seasonCoachId),
        tradingPartner: tx.tradingPartnerSeasonCoachId ? coachById.get(tx.tradingPartnerSeasonCoachId) : null,
      };
    });

  // Get unique weeks for filter
  const weeks = Array.from(new Set(allTransactions.map((tx) => tx.week))).sort(
    (a, b) => b - a
  );

  // Apply week filter
  const filteredTransactions = weekFilter
    ? allTransactions.filter((tx) => tx.week === weekFilter)
    : allTransactions;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
          <div>
            {/* Breadcrumb - simplified on mobile */}
            <div className="hidden sm:flex items-center gap-2 mb-3 text-sm">
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
              <span className="text-[var(--foreground-subtle)]">Transactions</span>
            </div>
            {/* Mobile breadcrumb */}
            <div className="flex sm:hidden items-center gap-2 mb-2 text-xs">
              <Link
                href={`/seasons/${seasonId}/divisions/${divisionId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {division.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Transactions</span>
            </div>

            {/* Title */}
            <h1 className="font-pixel text-lg sm:text-xl md:text-2xl text-white leading-relaxed">
              <span className="sm:hidden">Transactions</span>
              <span className="hidden sm:inline">{division.name} Transactions</span>
            </h1>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href={`/seasons/${seasonId}/divisions/${divisionId}`}>
              <button className="btn-retro-secondary py-2 px-2 sm:px-4 text-[10px] flex items-center gap-2" title="Back to Division">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="hidden sm:inline">Back to Division</span>
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="poke-card p-4 sm:p-6">
        <TransactionsFilter
          weeks={weeks}
          currentWeek={weekFilter}
        />
      </div>

      {/* Transactions List */}
      <div className="poke-card p-0 overflow-hidden">
        <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
          <div className="section-title !mb-0">
            <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #7c3aed' }}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3>
              {filteredTransactions.length} Transaction{filteredTransactions.length !== 1 ? "s" : ""}
            </h3>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {filteredTransactions.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">
              No transactions {weekFilter ? `in Week ${weekFilter}` : "yet"}
            </p>
          ) : (
            <>
              {/* Header Row */}
              <div className="hidden sm:flex items-center gap-3 px-2 pb-2 text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide border-b border-[var(--background-tertiary)] mb-2">
                <div className="w-10 text-center">Week</div>
                <div className="w-24">Type</div>
                <div className="w-40">Team</div>
                <div className="flex-1">Pokemon</div>
                <div className="w-16 text-right">Pts</div>
              </div>
              {/* Table Rows */}
              <div className="space-y-1.5 sm:space-y-1">
                {filteredTransactions.map((tx) => {
                  const typeLabel = tx.type === "FA_PICKUP" ? "Pickup"
                    : tx.type === "FA_DROP" ? "Drop"
                    : tx.type === "FA_SWAP" ? "Swap"
                    : tx.type === "P2P_TRADE" ? "Trade"
                    : tx.type === "TERA_SWAP" ? "Tera"
                    : tx.type;
                  const typeColor = tx.type === "FA_PICKUP" ? "text-[var(--success)]"
                    : tx.type === "FA_DROP" ? "text-[var(--error)]"
                    : tx.type === "FA_SWAP" ? "text-[var(--accent)]"
                    : tx.type === "P2P_TRADE" ? "text-[var(--primary)]"
                    : "text-[var(--accent)]";

                  const team = tx.seasonCoach;

                  return (
                    <div key={tx.id} className="trainer-card flex-col sm:flex-row gap-1.5 sm:gap-3">
                      {/* Mobile: Top row with Team, Week, Type, Points */}
                      <div className="flex sm:hidden items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          {team && (
                            <Link
                              href={`/coaches/${team.coach?.id}`}
                              className="flex items-center gap-1 hover:opacity-80"
                            >
                              {team.teamLogoUrl && (
                                <Image
                                  src={team.teamLogoUrl}
                                  alt={team.teamName}
                                  width={16}
                                  height={16}
                                  className="object-contain"
                                />
                              )}
                              <span className="text-[10px] text-[var(--foreground-muted)]">
                                {team.teamAbbreviation || team.teamName.substring(0, 3).toUpperCase()}
                              </span>
                            </Link>
                          )}
                          <span className="text-[10px] text-[var(--foreground-muted)]">W{tx.week}</span>
                          <span className={`text-xs font-bold ${typeColor}`}>{typeLabel}</span>
                          {!tx.countsAgainstLimit && (
                            <span className="text-[8px] text-[var(--foreground-muted)] italic">(grace)</span>
                          )}
                        </div>
                        {tx.budgetChange != null && tx.budgetChange !== 0 && (
                          tx.type === "P2P_TRADE" ? (
                            <span className="text-xs font-bold">
                              <span className={tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>
                                {tx.budgetChange > 0 ? "+" : ""}{tx.budgetChange}
                              </span>
                              <span className="text-[var(--foreground-muted)]">/</span>
                              <span className={-tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>
                                {-tx.budgetChange > 0 ? "+" : ""}{-tx.budgetChange}
                              </span>
                              <span className="text-[var(--foreground-muted)]"> pts</span>
                            </span>
                          ) : (
                            <span className={`text-xs font-bold ${
                              tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                            }`}>
                              {tx.budgetChange > 0 ? "+" : ""}{tx.budgetChange} pts
                            </span>
                          )
                        )}
                      </div>
                      {/* Desktop: Week */}
                      <div className="hidden sm:block w-10 text-center text-sm font-bold text-[var(--foreground-muted)]">
                        {tx.week}
                      </div>
                      {/* Desktop: Type */}
                      <div className="hidden sm:flex sm:items-center sm:gap-1 w-24">
                        <span className={`text-sm font-bold ${typeColor}`}>{typeLabel}</span>
                        {!tx.countsAgainstLimit && (
                          <span className="text-[9px] text-[var(--foreground-muted)] italic">(grace)</span>
                        )}
                      </div>
                      {/* Desktop: Team */}
                      <div className="hidden sm:flex w-40">
                        {team && (
                          <Link
                            href={`/coaches/${team.coach?.id}`}
                            className="flex items-center gap-2 hover:opacity-80 min-w-0"
                          >
                            {team.teamLogoUrl && (
                              <div className="w-5 h-5 flex-shrink-0">
                                <Image
                                  src={team.teamLogoUrl}
                                  alt={team.teamName}
                                  width={20}
                                  height={20}
                                  className="object-contain"
                                />
                              </div>
                            )}
                            <span className="text-xs text-[var(--foreground-muted)] truncate">
                              {team.teamName}
                            </span>
                          </Link>
                        )}
                      </div>
                      {/* Pokemon In/Out */}
                      <div className="flex-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {/* Show out first, then arrow, then in (for swaps) */}
                        {tx.pokemonOutDetails?.map((p) => {
                          const wasTC = tx.type === "P2P_TRADE" ? !!p.isTeraCaptain : tx.oldTeraCaptainId === p.id;
                          return (
                            <div key={p.id} className="flex items-center gap-0.5 sm:gap-1">
                              {p.spriteUrl && <img src={p.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />}
                              <span className="text-xs sm:text-sm text-[var(--error)] font-bold">
                                -{p.displayName || p.name}{wasTC ? " [TC]" : ""}
                              </span>
                            </div>
                          );
                        })}
                        {tx.pokemonOutDetails && tx.pokemonOutDetails.length > 0 && tx.pokemonInDetails && tx.pokemonInDetails.length > 0 && (
                          <span className="text-xs sm:text-sm text-[var(--foreground-muted)]">→</span>
                        )}
                        {tx.pokemonInDetails?.map((p) => {
                          const isTC = tx.type === "P2P_TRADE" ? !!p.isTeraCaptain : tx.newTeraCaptainId === p.id;
                          return (
                            <div key={p.id} className="flex items-center gap-0.5 sm:gap-1">
                              {p.spriteUrl && <img src={p.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />}
                              <span className="text-xs sm:text-sm text-[var(--success)] font-bold">
                                +{p.displayName || p.name}{isTC ? " [TC]" : ""}
                              </span>
                            </div>
                          );
                        })}
                        {tx.type === "TERA_SWAP" && (
                          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                            {tx.oldTeraCaptainDetails && (
                              <div className="flex items-center gap-0.5 sm:gap-1">
                                {tx.oldTeraCaptainDetails.spriteUrl && (
                                  <img src={tx.oldTeraCaptainDetails.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />
                                )}
                                <span className="text-xs sm:text-sm text-[var(--error)] font-bold">
                                  -{tx.oldTeraCaptainDetails.displayName || tx.oldTeraCaptainDetails.name} [TC]
                                </span>
                              </div>
                            )}
                            {tx.oldTeraCaptainDetails && tx.newTeraCaptainDetails && (
                              <span className="text-xs sm:text-sm text-[var(--foreground-muted)]">→</span>
                            )}
                            {tx.newTeraCaptainDetails && (
                              <div className="flex items-center gap-0.5 sm:gap-1">
                                {tx.newTeraCaptainDetails.spriteUrl && (
                                  <img src={tx.newTeraCaptainDetails.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />
                                )}
                                <span className="text-xs sm:text-sm text-[var(--success)] font-bold">
                                  +{tx.newTeraCaptainDetails.displayName || tx.newTeraCaptainDetails.name} [TC]
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {tx.tradingPartner && (
                          <Link
                            href={`/coaches/${tx.tradingPartner.coach?.id}`}
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] transition-colors"
                          >
                            {tx.tradingPartner.teamLogoUrl && (
                              <img
                                src={tx.tradingPartner.teamLogoUrl}
                                alt={tx.tradingPartner.teamName}
                                className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                              />
                            )}
                            <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                              w/ {tx.tradingPartner.teamAbbreviation || tx.tradingPartner.teamName.substring(0, 3).toUpperCase()}
                            </span>
                          </Link>
                        )}
                      </div>
                      {/* Desktop: Budget Change */}
                      <div className="hidden sm:block w-16 text-right">
                        {tx.budgetChange != null && tx.budgetChange !== 0 && (
                          tx.type === "P2P_TRADE" ? (
                            <span className="text-sm font-bold">
                              <span className={tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>
                                {tx.budgetChange > 0 ? "+" : ""}{tx.budgetChange}
                              </span>
                              <span className="text-[var(--foreground-muted)]">/</span>
                              <span className={-tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>
                                {-tx.budgetChange > 0 ? "+" : ""}{-tx.budgetChange}
                              </span>
                            </span>
                          ) : (
                            <span className={`text-sm font-bold ${
                              tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                            }`}>
                              {tx.budgetChange > 0 ? "+" : ""}{tx.budgetChange}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
