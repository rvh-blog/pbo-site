"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { BulkTransactionEditor } from "@/components/admin/bulk-transaction-editor";

interface Coach {
  id: number;
  name: string;
}

interface Division {
  id: number;
  name: string;
  seasonId: number;
}

interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
  divisions: Division[];
}

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  types: string[];
  spriteUrl: string;
  price?: number;
  teraCaptainCost?: number | null;
  teraBanned?: boolean;
}

interface RosterEntry {
  id: number;
  pokemonId: number;
  price: number;
  isTeraCaptain: boolean;
  acquiredWeek?: number | null;
  acquiredVia?: string | null;
  pokemon: Pokemon;
}

interface SeasonCoach {
  id: number;
  coachId: number;
  divisionId: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  remainingBudget: number;
  isActive: boolean;
  coach: Coach;
  division: Division;
  rosters: RosterEntry[];
}

interface TransactionCounts {
  faUsed: number;
  faRemaining: number;
  p2pUsed: number;
  p2pRemaining: number;
}

interface Transaction {
  id: number;
  seasonId: number;
  type: string;
  week: number;
  seasonCoachId: number;
  teamAbbreviation: string | null;
  tradingPartnerSeasonCoachId: number | null;
  tradingPartnerAbbreviation: string | null;
  pokemonIn: number[] | null;
  pokemonOut: number[] | null;
  newTeraCaptainId: number | null;
  oldTeraCaptainId: number | null;
  budgetChange: number;
  countsAgainstLimit: boolean;
  notes: string | null;
  createdAt: string;
  seasonCoach?: { coach: Coach; teamName: string };
  tradingPartner?: { coach: Coach; teamName: string } | null;
  pokemonInDetails?: Pokemon[];
  pokemonOutDetails?: Pokemon[];
  newTeraCaptainDetails?: Pokemon | null;
  oldTeraCaptainDetails?: Pokemon | null;
}

// Season-specific Pokemon pricing (for TC costs)
interface SeasonPokemonPrice {
  pokemonId: number;
  price: number;
  teraCaptainCost: number | null;
  teraBanned: boolean;
}

export default function AdminTransactionsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [seasonCoaches, setSeasonCoaches] = useState<SeasonCoach[]>([]);
  const [freeAgents, setFreeAgents] = useState<Pokemon[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [seasonPrices, setSeasonPrices] = useState<Map<number, SeasonPokemonPrice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [transactionSearch, setTransactionSearch] = useState("");

  // Transaction counts per team
  const [teamCounts, setTeamCounts] = useState<Record<number, TransactionCounts>>({});

  // Bulk editor state
  const [showBulkEditor, setShowBulkEditor] = useState(false);

  // Team selector for bulk editor
  const [selectedTeamId, setSelectedTeamId] = useState("");

  // P2P Trade form
  const [p2pForm, setP2pForm] = useState({
    team1SeasonCoachId: "",
    team1RosterIds: [] as number[],
    team2SeasonCoachId: "",
    team2RosterIds: [] as number[],
    team1IncomingTC: {} as Record<number, boolean>,  // TC for Pokemon arriving at Team 1 (keyed by team2 rosterId)
    team2IncomingTC: {} as Record<number, boolean>,  // TC for Pokemon arriving at Team 2 (keyed by team1 rosterId)
    week: "1",
    countsAgainstLimit: true,
    notes: "",
  });

  async function fetchSeasons() {
    const res = await fetch("/api/seasons");
    const data = await res.json();
    setSeasons(data);
    const current = data.find((s: Season) => s.isCurrent);
    if (current) {
      setSelectedSeason(current);
    }
    setLoading(false);
  }

  async function fetchFreeAgents(seasonId: number, divisionId?: number) {
    const url = divisionId
      ? `/api/transactions?action=freeAgents&seasonId=${seasonId}&divisionId=${divisionId}`
      : `/api/transactions?action=freeAgents&seasonId=${seasonId}`;
    const res = await fetch(url);
    const data = await res.json();
    setFreeAgents(data);
  }

  async function fetchSeasonData(seasonId: number) {
    // Fetch season coaches, transactions, and season prices in parallel
    // Free agents will be fetched separately based on division selection
    const [coachesRes, txRes, pricesRes] = await Promise.all([
      fetch(`/api/rosters?seasonId=${seasonId}`),
      fetch(`/api/transactions?seasonId=${seasonId}`),
      fetch(`/api/transactions?action=seasonPrices&seasonId=${seasonId}`),
    ]);

    const coachesData = await coachesRes.json();
    const txData = await txRes.json();
    const pricesData = await pricesRes.json();

    // Build a map of pokemonId -> season price data for quick lookups
    const priceMap = new Map<number, SeasonPokemonPrice>();
    for (const p of pricesData) {
      priceMap.set(p.pokemonId, {
        pokemonId: p.pokemonId,
        price: p.price,
        teraCaptainCost: p.teraCaptainCost,
        teraBanned: p.teraBanned,
      });
    }
    setSeasonPrices(priceMap);

    // Filter active coaches only
    const activeCoaches = Array.isArray(coachesData)
      ? coachesData.filter((sc: SeasonCoach) => sc.isActive)
      : [];
    setSeasonCoaches(activeCoaches);
    setTransactions(txData);

    // Fetch transaction counts for each team in parallel.
    const countEntries = await Promise.all(
      activeCoaches.map(async (coach: SeasonCoach) => {
        const countRes = await fetch(`/api/transactions?action=counts&seasonCoachId=${coach.id}`);
        return [coach.id, await countRes.json()] as const;
      })
    );
    const counts = Object.fromEntries(countEntries);
    setTeamCounts(counts);
  }

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonData(selectedSeason.id);
    }
  }, [selectedSeason]);

  // Refetch free agents when division changes (FA pool is division-specific)
  useEffect(() => {
    if (selectedSeason && selectedDivision) {
      fetchFreeAgents(selectedSeason.id, selectedDivision.id);
    } else if (selectedSeason) {
      // No division selected - fetch all (for display purposes, but require division for transactions)
      fetchFreeAgents(selectedSeason.id);
    }
  }, [selectedDivision, selectedSeason]);


  // Get teams for P2P (sorted alphabetically)
  const team1Roster = useMemo(() => {
    if (!p2pForm.team1SeasonCoachId) return [];
    const team = seasonCoaches.find((sc) => sc.id === parseInt(p2pForm.team1SeasonCoachId));
    return [...(team?.rosters || [])].sort((a, b) => {
      const nameA = a.pokemon?.displayName || a.pokemon?.name || "";
      const nameB = b.pokemon?.displayName || b.pokemon?.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [p2pForm.team1SeasonCoachId, seasonCoaches]);

  const team2Roster = useMemo(() => {
    if (!p2pForm.team2SeasonCoachId) return [];
    const team = seasonCoaches.find((sc) => sc.id === parseInt(p2pForm.team2SeasonCoachId));
    return [...(team?.rosters || [])].sort((a, b) => {
      const nameA = a.pokemon?.displayName || a.pokemon?.name || "";
      const nameB = b.pokemon?.displayName || b.pokemon?.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [p2pForm.team2SeasonCoachId, seasonCoaches]);

  // Budget preview for P2P trades
  const p2pBudgetPreview = useMemo(() => {
    const team1SC = seasonCoaches.find((sc) => sc.id === parseInt(p2pForm.team1SeasonCoachId));
    const team2SC = seasonCoaches.find((sc) => sc.id === parseInt(p2pForm.team2SeasonCoachId));
    if (!team1SC || !team2SC) return null;

    const team1OutValue = team1Roster.filter((r) => p2pForm.team1RosterIds.includes(r.id)).reduce((sum, r) => sum + r.price, 0);
    const team2OutValue = team2Roster.filter((r) => p2pForm.team2RosterIds.includes(r.id)).reduce((sum, r) => sum + r.price, 0);

    // TC adjustments for team 1 (receiving team2's Pokemon)
    const team1TCAdj = p2pForm.team2RosterIds.reduce((sum, rid) => {
      const roster = team2Roster.find((r) => r.id === rid);
      if (!roster) return sum;
      const newTC = p2pForm.team1IncomingTC[rid] ?? roster.isTeraCaptain;
      if (newTC === roster.isTeraCaptain) return sum;
      const priceInfo = seasonPrices.get(roster.pokemonId);
      const tcCost = priceInfo?.teraCaptainCost ?? 0;
      return sum + (newTC ? -tcCost : tcCost);
    }, 0);

    // TC adjustments for team 2 (receiving team1's Pokemon)
    const team2TCAdj = p2pForm.team1RosterIds.reduce((sum, rid) => {
      const roster = team1Roster.find((r) => r.id === rid);
      if (!roster) return sum;
      const newTC = p2pForm.team2IncomingTC[rid] ?? roster.isTeraCaptain;
      if (newTC === roster.isTeraCaptain) return sum;
      const priceInfo = seasonPrices.get(roster.pokemonId);
      const tcCost = priceInfo?.teraCaptainCost ?? 0;
      return sum + (newTC ? -tcCost : tcCost);
    }, 0);

    const team1Net = team1OutValue - team2OutValue + team1TCAdj;
    const team2Net = team2OutValue - team1OutValue + team2TCAdj;

    const team1Current = team1SC.remainingBudget;
    const team2Current = team2SC.remainingBudget;
    const team1After = team1Current + team1Net;
    const team2After = team2Current + team2Net;

    return {
      team1: { current: team1Current, net: team1Net, after: team1After },
      team2: { current: team2Current, net: team2Net, after: team2After },
    };
  }, [p2pForm, team1Roster, team2Roster, seasonCoaches, seasonPrices]);

  // Filter coaches by selected division
  const filteredCoaches = useMemo(() => {
    if (!selectedDivision) return seasonCoaches;
    return seasonCoaches.filter((sc) => sc.divisionId === selectedDivision.id);
  }, [seasonCoaches, selectedDivision]);

  // Filter and sort transactions (descending by id, filtered by division)
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    if (selectedDivision) {
      // Get season coach IDs in the selected division
      const divisionCoachIds = new Set(
        seasonCoaches
          .filter((sc) => sc.divisionId === selectedDivision.id)
          .map((sc) => sc.id)
      );
      filtered = transactions.filter((tx) => divisionCoachIds.has(tx.seasonCoachId));
    }
    const query = transactionSearch.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((tx) =>
        tx.type.toLowerCase().includes(query) ||
        tx.week.toString().includes(query) ||
        tx.seasonCoach?.teamName.toLowerCase().includes(query) ||
        tx.seasonCoach?.coach?.name.toLowerCase().includes(query) ||
        tx.tradingPartner?.teamName.toLowerCase().includes(query) ||
        tx.tradingPartner?.coach?.name.toLowerCase().includes(query) ||
        tx.notes?.toLowerCase().includes(query) ||
        tx.pokemonInDetails?.some((pokemon) => (pokemon.displayName || pokemon.name).toLowerCase().includes(query)) ||
        tx.pokemonOutDetails?.some((pokemon) => (pokemon.displayName || pokemon.name).toLowerCase().includes(query))
      );
    }
    // Sort by id descending (latest first)
    return [...filtered].sort((a, b) => b.id - a.id);
  }, [transactions, selectedDivision, seasonCoaches, transactionSearch]);

  // Handle P2P Trade
  async function handleP2PTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeason) return;

    if (p2pForm.team1RosterIds.length === 0 || p2pForm.team2RosterIds.length === 0) {
      alert("Both teams must trade at least one Pokemon");
      return;
    }

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "p2pTrade",
          seasonId: selectedSeason.id,
          team1SeasonCoachId: parseInt(p2pForm.team1SeasonCoachId),
          team1RosterIds: p2pForm.team1RosterIds,
          team2SeasonCoachId: parseInt(p2pForm.team2SeasonCoachId),
          team2RosterIds: p2pForm.team2RosterIds,
          team1IncomingTC: p2pForm.team1IncomingTC,
          team2IncomingTC: p2pForm.team2IncomingTC,
          week: parseInt(p2pForm.week),
          countsAgainstLimit: p2pForm.countsAgainstLimit,
          notes: p2pForm.notes || undefined,
        }),
      });

      const result = await res.json();
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }

      // Reset form and refresh
      setP2pForm({
        ...p2pForm,
        team1RosterIds: [],
        team2RosterIds: [],
        team1IncomingTC: {},
        team2IncomingTC: {},
        notes: "",
      });
      fetchSeasonData(selectedSeason.id);
    } catch (error) {
      alert("Trade failed");
    }
  }


  // Handle undo transaction
  async function handleUndo(txId: number) {
    if (!confirm("Are you sure you want to undo this transaction? This will reverse all changes.")) {
      return;
    }

    try {
      const res = await fetch(`/api/transactions?id=${txId}`, {
        method: "DELETE",
      });

      const result = await res.json();
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }

      if (selectedSeason) {
        fetchSeasonData(selectedSeason.id);
      }
    } catch (error) {
      alert("Undo failed");
    }
  }

  // Toggle Pokemon selection for P2P
  function toggleP2pPokemon(team: 1 | 2, rosterId: number) {
    if (team === 1) {
      setP2pForm((prev) => {
        const isDeselecting = prev.team1RosterIds.includes(rosterId);
        const newRosterIds = isDeselecting
          ? prev.team1RosterIds.filter((id) => id !== rosterId)
          : prev.team1RosterIds.length < 3
          ? [...prev.team1RosterIds, rosterId]
          : prev.team1RosterIds;
        // Update team2IncomingTC: team1 Pokemon go to team2
        const newTeam2IncomingTC = { ...prev.team2IncomingTC };
        if (isDeselecting) {
          delete newTeam2IncomingTC[rosterId];
        } else if (newRosterIds.includes(rosterId)) {
          const roster = team1Roster.find((r) => r.id === rosterId);
          if (roster) newTeam2IncomingTC[rosterId] = roster.isTeraCaptain;
        }
        return { ...prev, team1RosterIds: newRosterIds, team2IncomingTC: newTeam2IncomingTC };
      });
    } else {
      setP2pForm((prev) => {
        const isDeselecting = prev.team2RosterIds.includes(rosterId);
        const newRosterIds = isDeselecting
          ? prev.team2RosterIds.filter((id) => id !== rosterId)
          : prev.team2RosterIds.length < 3
          ? [...prev.team2RosterIds, rosterId]
          : prev.team2RosterIds;
        // Update team1IncomingTC: team2 Pokemon go to team1
        const newTeam1IncomingTC = { ...prev.team1IncomingTC };
        if (isDeselecting) {
          delete newTeam1IncomingTC[rosterId];
        } else if (newRosterIds.includes(rosterId)) {
          const roster = team2Roster.find((r) => r.id === rosterId);
          if (roster) newTeam1IncomingTC[rosterId] = roster.isTeraCaptain;
        }
        return { ...prev, team2RosterIds: newRosterIds, team1IncomingTC: newTeam1IncomingTC };
      });
    }
  }

  // Toggle TC status for incoming Pokemon in a P2P trade
  function toggleP2pIncomingTC(receivingTeam: 1 | 2, rosterId: number) {
    setP2pForm((prev) => {
      if (receivingTeam === 1) {
        return {
          ...prev,
          team1IncomingTC: {
            ...prev.team1IncomingTC,
            [rosterId]: !prev.team1IncomingTC[rosterId],
          },
        };
      } else {
        return {
          ...prev,
          team2IncomingTC: {
            ...prev.team2IncomingTC,
            [rosterId]: !prev.team2IncomingTC[rosterId],
          },
        };
      }
    });
  }

  // Format team name with counts
  function formatTeamWithCounts(sc: SeasonCoach) {
    const counts = teamCounts[sc.id];
    if (!counts) return `${sc.teamName} (${sc.coach?.name})`;
    return `${sc.teamName} (${sc.coach?.name}) - FA: ${counts.faRemaining}/6 | P2P: ${counts.p2pRemaining}/6`;
  }

  // Get transaction type label
  function getTypeLabel(type: string) {
    switch (type) {
      case "FA_PICKUP":
        return "FA Pickup";
      case "FA_DROP":
        return "FA Drop";
      case "FA_SWAP":
        return "FA Swap";
      case "P2P_TRADE":
        return "P2P Trade";
      case "TERA_SWAP":
        return "Tera Swap";
      default:
        return type;
    }
  }

  // Get type color
  function getTypeColor(type: string) {
    switch (type) {
      case "FA_PICKUP":
        return "text-[var(--success)]";
      case "FA_DROP":
        return "text-[var(--error)]";
      case "FA_SWAP":
        return "text-[var(--accent)]";
      case "P2P_TRADE":
        return "text-[var(--accent)]";
      case "TERA_SWAP":
        return "text-[var(--primary)]";
      default:
        return "";
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-[var(--foreground-muted)]">
          Manage mid-season roster changes: FA pickups, P2P trades, and tera swaps
        </p>
      </div>

      {/* Season & Division Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Season:</Label>
              <Select
                value={selectedSeason?.id || ""}
                onChange={(e) => {
                  const season = seasons.find((s) => s.id === parseInt(e.target.value));
                  setSelectedSeason(season || null);
                  setSelectedDivision(null); // Reset division when season changes
                }}
                className="w-48"
              >
                <option value="">Select a season</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                    {season.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            {selectedSeason && selectedSeason.divisions?.length > 0 && (
              <div className="flex items-center gap-2">
                <Label>Division:</Label>
                <Select
                  value={selectedDivision?.id || ""}
                  onChange={(e) => {
                    const div = selectedSeason.divisions.find(
                      (d) => d.id === parseInt(e.target.value)
                    );
                    setSelectedDivision(div || null);
                  }}
                  className="w-48"
                >
                  <option value="">All Divisions</option>
                  <optgroup label={selectedSeason.name}>
                    {selectedSeason.divisions.map((div) => (
                      <option key={div.id} value={div.id}>
                        {div.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </div>
            )}
            {selectedDivision && (
              <span className="text-sm text-[var(--foreground-muted)]">
                Showing {filteredCoaches.length} teams
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSeason && (
        <>
          {/* Free Agent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Free Agent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Label>Team</Label>
                  <Select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                  >
                    <option value="">Select team</option>
                    {filteredCoaches.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {formatTeamWithCounts(sc)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  onClick={() => setShowBulkEditor(true)}
                  disabled={!selectedTeamId || !selectedDivision}
                >
                  Add Transactions
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* P2P Trade */}
          <Card>
            <CardHeader>
              <CardTitle>Player-to-Player Trade</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleP2PTrade} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Team 1 */}
                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Team 1</Label>
                    <Select
                      value={p2pForm.team1SeasonCoachId}
                      onChange={(e) =>
                        setP2pForm({ ...p2pForm, team1SeasonCoachId: e.target.value, team1RosterIds: [], team2IncomingTC: {} })
                      }
                    >
                      <option value="">Select team</option>
                      {filteredCoaches
                        .filter((sc) => sc.id !== parseInt(p2pForm.team2SeasonCoachId))
                        .map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {formatTeamWithCounts(sc)}
                          </option>
                        ))}
                    </Select>
                    {p2pForm.team1SeasonCoachId && (
                      <div className="space-y-1">
                        <Label className="text-sm">Select Pokemon (max 3):</Label>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-[var(--background-secondary)] rounded">
                          {team1Roster.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => toggleP2pPokemon(1, r.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${
                                p2pForm.team1RosterIds.includes(r.id)
                                  ? "bg-[var(--primary)] text-white"
                                  : "bg-[var(--card)] hover:bg-[var(--card-hover)]"
                              }`}
                            >
                              {r.pokemon?.spriteUrl && (
                                <img src={r.pokemon.spriteUrl} alt="" className="w-5 h-5" />
                              )}
                              {r.pokemon?.displayName || r.pokemon?.name}
                              {r.isTeraCaptain && <span className="text-[var(--accent)] text-xs">TC</span>}
                              <span className="text-xs opacity-70">({r.price})</span>
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Selected: {p2pForm.team1RosterIds.length}/3 |{" "}
                          Value: {team1Roster.filter((r) => p2pForm.team1RosterIds.includes(r.id)).reduce((sum, r) => sum + r.price, 0)} pts
                          {(() => {
                            const tcAdj = p2pForm.team2RosterIds.reduce((sum, rid) => {
                              const roster = team2Roster.find((r) => r.id === rid);
                              if (!roster) return sum;
                              const newTC = p2pForm.team1IncomingTC[rid] ?? roster.isTeraCaptain;
                              if (newTC === roster.isTeraCaptain) return sum;
                              const priceInfo = seasonPrices.get(roster.pokemonId);
                              const tcCost = priceInfo?.teraCaptainCost ?? 0;
                              return sum + (newTC ? -tcCost : tcCost);
                            }, 0);
                            return tcAdj !== 0 ? ` | TC adj: ${tcAdj > 0 ? "+" : ""}${tcAdj} pts` : "";
                          })()}
                        </p>
                      </div>
                    )}
                    {/* Incoming Pokemon (from Team 2) with TC toggles */}
                    {p2pForm.team2RosterIds.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <Label className="text-sm text-[var(--accent)]">Incoming from Team 2:</Label>
                        <div className="flex flex-wrap gap-2 p-2 bg-[var(--background-secondary)] rounded">
                          {p2pForm.team2RosterIds.map((rid) => {
                            const roster = team2Roster.find((r) => r.id === rid);
                            if (!roster) return null;
                            const currentTC = p2pForm.team1IncomingTC[rid] ?? roster.isTeraCaptain;
                            const tcChanged = currentTC !== roster.isTeraCaptain;
                            const priceInfo = seasonPrices.get(roster.pokemonId);
                            const canToggleTC = priceInfo && !priceInfo.teraBanned && priceInfo.teraCaptainCost != null;
                            const tcCost = priceInfo?.teraCaptainCost ?? 0;
                            const adjustedPrice = currentTC
                              ? (roster.isTeraCaptain ? roster.price : roster.price + tcCost)
                              : (roster.isTeraCaptain ? roster.price - tcCost : roster.price);
                            return (
                              <div key={rid} className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-[var(--card)]">
                                {roster.pokemon?.spriteUrl && (
                                  <img src={roster.pokemon.spriteUrl} alt="" className="w-5 h-5" />
                                )}
                                <span>{roster.pokemon?.displayName || roster.pokemon?.name}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleP2pIncomingTC(1, rid)}
                                  disabled={!canToggleTC}
                                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                    currentTC
                                      ? "bg-[var(--accent)] text-black"
                                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                                  title={currentTC ? "Remove TC" : "Make TC"}
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L2 12l10 10 10-10L12 2z" />
                                  </svg>
                                </button>
                                <span className={`text-xs ${tcChanged ? "text-[var(--warning)] font-bold" : "opacity-70"}`}>
                                  ({adjustedPrice})
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Budget preview for Team 1 */}
                    {p2pBudgetPreview && (p2pForm.team1RosterIds.length > 0 || p2pForm.team2RosterIds.length > 0) && (
                      <div className={`mt-2 p-2 rounded text-sm border ${
                        p2pBudgetPreview.team1.after < 0
                          ? "border-[var(--error)] bg-[var(--error)]/10"
                          : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--foreground-muted)]">Budget:</span>
                          <span>
                            {p2pBudgetPreview.team1.current}
                            {p2pBudgetPreview.team1.net !== 0 && (
                              <>
                                <span className={`mx-1 ${p2pBudgetPreview.team1.net > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                                  {p2pBudgetPreview.team1.net > 0 ? "+" : ""}{p2pBudgetPreview.team1.net}
                                </span>
                                <span className="mx-1">=</span>
                                <span className={`font-bold ${p2pBudgetPreview.team1.after < 0 ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
                                  {p2pBudgetPreview.team1.after}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Team 2 */}
                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Team 2</Label>
                    <Select
                      value={p2pForm.team2SeasonCoachId}
                      onChange={(e) =>
                        setP2pForm({ ...p2pForm, team2SeasonCoachId: e.target.value, team2RosterIds: [], team1IncomingTC: {} })
                      }
                    >
                      <option value="">Select team</option>
                      {filteredCoaches
                        .filter((sc) => sc.id !== parseInt(p2pForm.team1SeasonCoachId))
                        .map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {formatTeamWithCounts(sc)}
                          </option>
                        ))}
                    </Select>
                    {p2pForm.team2SeasonCoachId && (
                      <div className="space-y-1">
                        <Label className="text-sm">Select Pokemon (max 3):</Label>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-[var(--background-secondary)] rounded">
                          {team2Roster.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => toggleP2pPokemon(2, r.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${
                                p2pForm.team2RosterIds.includes(r.id)
                                  ? "bg-[var(--primary)] text-white"
                                  : "bg-[var(--card)] hover:bg-[var(--card-hover)]"
                              }`}
                            >
                              {r.pokemon?.spriteUrl && (
                                <img src={r.pokemon.spriteUrl} alt="" className="w-5 h-5" />
                              )}
                              {r.pokemon?.displayName || r.pokemon?.name}
                              {r.isTeraCaptain && <span className="text-[var(--accent)] text-xs">TC</span>}
                              <span className="text-xs opacity-70">({r.price})</span>
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Selected: {p2pForm.team2RosterIds.length}/3 |{" "}
                          Value: {team2Roster.filter((r) => p2pForm.team2RosterIds.includes(r.id)).reduce((sum, r) => sum + r.price, 0)} pts
                          {(() => {
                            const tcAdj = p2pForm.team1RosterIds.reduce((sum, rid) => {
                              const roster = team1Roster.find((r) => r.id === rid);
                              if (!roster) return sum;
                              const newTC = p2pForm.team2IncomingTC[rid] ?? roster.isTeraCaptain;
                              if (newTC === roster.isTeraCaptain) return sum;
                              const priceInfo = seasonPrices.get(roster.pokemonId);
                              const tcCost = priceInfo?.teraCaptainCost ?? 0;
                              return sum + (newTC ? -tcCost : tcCost);
                            }, 0);
                            return tcAdj !== 0 ? ` | TC adj: ${tcAdj > 0 ? "+" : ""}${tcAdj} pts` : "";
                          })()}
                        </p>
                      </div>
                    )}
                    {/* Incoming Pokemon (from Team 1) with TC toggles */}
                    {p2pForm.team1RosterIds.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <Label className="text-sm text-[var(--accent)]">Incoming from Team 1:</Label>
                        <div className="flex flex-wrap gap-2 p-2 bg-[var(--background-secondary)] rounded">
                          {p2pForm.team1RosterIds.map((rid) => {
                            const roster = team1Roster.find((r) => r.id === rid);
                            if (!roster) return null;
                            const currentTC = p2pForm.team2IncomingTC[rid] ?? roster.isTeraCaptain;
                            const tcChanged = currentTC !== roster.isTeraCaptain;
                            const priceInfo = seasonPrices.get(roster.pokemonId);
                            const canToggleTC = priceInfo && !priceInfo.teraBanned && priceInfo.teraCaptainCost != null;
                            const tcCost = priceInfo?.teraCaptainCost ?? 0;
                            const adjustedPrice = currentTC
                              ? (roster.isTeraCaptain ? roster.price : roster.price + tcCost)
                              : (roster.isTeraCaptain ? roster.price - tcCost : roster.price);
                            return (
                              <div key={rid} className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-[var(--card)]">
                                {roster.pokemon?.spriteUrl && (
                                  <img src={roster.pokemon.spriteUrl} alt="" className="w-5 h-5" />
                                )}
                                <span>{roster.pokemon?.displayName || roster.pokemon?.name}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleP2pIncomingTC(2, rid)}
                                  disabled={!canToggleTC}
                                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                    currentTC
                                      ? "bg-[var(--accent)] text-black"
                                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                                  title={currentTC ? "Remove TC" : "Make TC"}
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L2 12l10 10 10-10L12 2z" />
                                  </svg>
                                </button>
                                <span className={`text-xs ${tcChanged ? "text-[var(--warning)] font-bold" : "opacity-70"}`}>
                                  ({adjustedPrice})
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Budget preview for Team 2 */}
                    {p2pBudgetPreview && (p2pForm.team1RosterIds.length > 0 || p2pForm.team2RosterIds.length > 0) && (
                      <div className={`mt-2 p-2 rounded text-sm border ${
                        p2pBudgetPreview.team2.after < 0
                          ? "border-[var(--error)] bg-[var(--error)]/10"
                          : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--foreground-muted)]">Budget:</span>
                          <span>
                            {p2pBudgetPreview.team2.current}
                            {p2pBudgetPreview.team2.net !== 0 && (
                              <>
                                <span className={`mx-1 ${p2pBudgetPreview.team2.net > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                                  {p2pBudgetPreview.team2.net > 0 ? "+" : ""}{p2pBudgetPreview.team2.net}
                                </span>
                                <span className="mx-1">=</span>
                                <span className={`font-bold ${p2pBudgetPreview.team2.after < 0 ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
                                  {p2pBudgetPreview.team2.after}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Week</Label>
                    <Select
                      value={p2pForm.week}
                      onChange={(e) => setP2pForm({ ...p2pForm, week: e.target.value })}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                        <option key={w} value={w}>
                          Week {w}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label className="flex items-center gap-2 mt-6">
                      <input
                        type="checkbox"
                        checked={p2pForm.countsAgainstLimit}
                        onChange={(e) => setP2pForm({ ...p2pForm, countsAgainstLimit: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span>Counts Against Limit</span>
                    </Label>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Input
                      value={p2pForm.notes}
                      onChange={(e) => setP2pForm({ ...p2pForm, notes: e.target.value })}
                      placeholder="Trade notes"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={
                    !p2pForm.team1SeasonCoachId ||
                    !p2pForm.team2SeasonCoachId ||
                    p2pForm.team1RosterIds.length === 0 ||
                    p2pForm.team2RosterIds.length === 0
                  }
                >
                  Execute Trade
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History ({filteredTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Label>Search Transactions</Label>
                <Input
                  value={transactionSearch}
                  onChange={(event) => setTransactionSearch(event.target.value)}
                  placeholder="Search team, coach, Pokemon, type, week, or notes"
                />
              </div>
              {filteredTransactions.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-4">
                  No transactions recorded yet.
                </p>
              ) : (
                <div className="mobile-card-table overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--card-hover)]">
                        <th className="text-left p-2 text-sm">Week</th>
                        <th className="text-left p-2 text-sm">Type</th>
                        <th className="text-left p-2 text-sm">Team(s)</th>
                        <th className="text-left p-2 text-sm">Pokemon</th>
                        <th className="text-left p-2 text-sm">Points</th>
                        <th className="text-left p-2 text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-[var(--card-hover)]/50 hover:bg-[var(--card-hover)]/30">
                          <td className="p-2" data-label="Week">
                            <span className="font-mono">{tx.week}</span>
                          </td>
                          <td className="p-2" data-label="Type">
                            <span className={`font-medium ${getTypeColor(tx.type)}`}>
                              {getTypeLabel(tx.type)}
                            </span>
                            {!tx.countsAgainstLimit && (
                              <span className="ml-1 text-xs text-[var(--foreground-muted)]">(free)</span>
                            )}
                          </td>
                          <td className="p-2" data-label="Teams">
                            <div className="text-sm">
                              <span className="font-medium">{tx.teamAbbreviation || tx.seasonCoach?.teamName}</span>
                              {tx.tradingPartnerAbbreviation && (
                                <>
                                  <span className="mx-1 text-[var(--foreground-muted)]">↔</span>
                                  <span className="font-medium">{tx.tradingPartnerAbbreviation}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-2" data-label="Pokemon">
                            <div className="flex flex-wrap gap-1">
                              {tx.pokemonInDetails?.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--success)]/20 text-[var(--success)] text-xs"
                                >
                                  +{p.displayName || p.name}
                                </span>
                              ))}
                              {tx.pokemonOutDetails?.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--error)]/20 text-[var(--error)] text-xs"
                                >
                                  -{p.displayName || p.name}
                                </span>
                              ))}
                              {tx.type === "TERA_SWAP" && (
                                <>
                                  {tx.oldTeraCaptainDetails && (
                                    <span className="text-xs text-[var(--foreground-muted)]">
                                      TC: {tx.oldTeraCaptainDetails.displayName || tx.oldTeraCaptainDetails.name}
                                    </span>
                                  )}
                                  <span className="text-xs">→</span>
                                  {tx.newTeraCaptainDetails && (
                                    <span className="text-xs text-[var(--primary)]">
                                      {tx.newTeraCaptainDetails.displayName || tx.newTeraCaptainDetails.name}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-2" data-label="Points">
                            <span
                              className={`font-mono ${
                                tx.budgetChange > 0
                                  ? "text-[var(--success)]"
                                  : tx.budgetChange < 0
                                  ? "text-[var(--error)]"
                                  : ""
                              }`}
                            >
                              {tx.budgetChange > 0 ? "+" : ""}
                              {tx.budgetChange}
                            </span>
                          </td>
                          <td className="p-2" data-label="Actions">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleUndo(tx.id)}
                            >
                              Undo
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Bulk Transaction Editor Modal */}
      {showBulkEditor && selectedTeamId && selectedSeason && selectedDivision && (() => {
        const selectedTeam = seasonCoaches.find(sc => sc.id === parseInt(selectedTeamId));
        if (!selectedTeam) return null;

        return (
          <BulkTransactionEditor
            isOpen={showBulkEditor}
            onClose={() => setShowBulkEditor(false)}
            seasonId={selectedSeason.id}
            divisionId={selectedDivision.id}
            seasonCoachId={selectedTeam.id}
            teamName={selectedTeam.teamName}
            remainingBudget={selectedTeam.remainingBudget}
            faRemaining={teamCounts[selectedTeam.id]?.faRemaining ?? 6}
            currentRoster={selectedTeam.rosters || []}
            freeAgents={freeAgents.map(fa => ({
              ...fa,
              price: fa.price || 0,
              teraCaptainCost: fa.teraCaptainCost || null,
              teraBanned: fa.teraBanned || false,
            }))}
            seasonPrices={seasonPrices}
            onSave={() => {
              fetchSeasonData(selectedSeason.id);
              if (selectedDivision) {
                fetchFreeAgents(selectedSeason.id, selectedDivision.id);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
