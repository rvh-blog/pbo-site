"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

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

export default function AdminTransactionsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [seasonCoaches, setSeasonCoaches] = useState<SeasonCoach[]>([]);
  const [freeAgents, setFreeAgents] = useState<Pokemon[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Transaction counts per team
  const [teamCounts, setTeamCounts] = useState<Record<number, TransactionCounts>>({});

  // FA Transaction form (combined pickup and drop)
  const [faForm, setFaForm] = useState({
    seasonCoachId: "",
    pickupPokemonId: "", // Pokemon to pick up from FA
    dropRosterId: "", // Roster entry to drop
    isTeraCaptain: false,
    week: "1",
    countsAgainstLimit: true,
    notes: "",
  });

  // P2P Trade form
  const [p2pForm, setP2pForm] = useState({
    team1SeasonCoachId: "",
    team1RosterIds: [] as number[],
    team2SeasonCoachId: "",
    team2RosterIds: [] as number[],
    week: "1",
    countsAgainstLimit: true,
    notes: "",
  });

  // Tera Swap form
  const [teraForm, setTeraForm] = useState({
    seasonCoachId: "",
    newTeraCaptainRosterId: "",
    oldTeraCaptainRosterId: "",
    week: "1",
    countsAgainstLimit: true,
    notes: "",
  });

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonData(selectedSeason.id);
    }
  }, [selectedSeason]);

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

  async function fetchSeasonData(seasonId: number) {
    // Fetch season coaches, free agents, and transactions in parallel
    const [coachesRes, faRes, txRes] = await Promise.all([
      fetch(`/api/rosters?seasonId=${seasonId}`),
      fetch(`/api/transactions?action=freeAgents&seasonId=${seasonId}`),
      fetch(`/api/transactions?seasonId=${seasonId}`),
    ]);

    const coachesData = await coachesRes.json();
    const faData = await faRes.json();
    const txData = await txRes.json();

    // Filter active coaches only
    const activeCoaches = Array.isArray(coachesData)
      ? coachesData.filter((sc: SeasonCoach) => sc.isActive)
      : [];
    setSeasonCoaches(activeCoaches);
    setFreeAgents(faData);
    setTransactions(txData);

    // Fetch transaction counts for each team
    const counts: Record<number, TransactionCounts> = {};
    for (const coach of activeCoaches) {
      const countRes = await fetch(
        `/api/transactions?action=counts&seasonCoachId=${coach.id}`
      );
      counts[coach.id] = await countRes.json();
    }
    setTeamCounts(counts);
  }

  // Get selected team's roster (sorted alphabetically)
  const selectedTeamRoster = useMemo(() => {
    if (!faForm.seasonCoachId) return [];
    const team = seasonCoaches.find((sc) => sc.id === parseInt(faForm.seasonCoachId));
    return [...(team?.rosters || [])].sort((a, b) => {
      const nameA = a.pokemon?.displayName || a.pokemon?.name || "";
      const nameB = b.pokemon?.displayName || b.pokemon?.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [faForm.seasonCoachId, seasonCoaches]);

  // Get sorted free agents
  const sortedFreeAgents = useMemo(() => {
    return [...freeAgents].sort((a, b) => {
      const nameA = a.displayName || a.name || "";
      const nameB = b.displayName || b.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [freeAgents]);

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

  // Get tera swap team roster (sorted alphabetically)
  const teraTeamRoster = useMemo(() => {
    if (!teraForm.seasonCoachId) return [];
    const team = seasonCoaches.find((sc) => sc.id === parseInt(teraForm.seasonCoachId));
    return [...(team?.rosters || [])].sort((a, b) => {
      const nameA = a.pokemon?.displayName || a.pokemon?.name || "";
      const nameB = b.pokemon?.displayName || b.pokemon?.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [teraForm.seasonCoachId, seasonCoaches]);

  // Current tera captain
  const currentTeraCaptain = useMemo(() => {
    return teraTeamRoster.find((r) => r.isTeraCaptain);
  }, [teraTeamRoster]);

  // Handle FA Transaction (combined pickup and drop)
  async function handleFATransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeason) return;

    try {
      const payload = {
        action: "faSwap",
        seasonId: selectedSeason.id,
        seasonCoachId: parseInt(faForm.seasonCoachId),
        pickupPokemonId: faForm.pickupPokemonId ? parseInt(faForm.pickupPokemonId) : undefined,
        pickupIsTeraCaptain: faForm.isTeraCaptain,
        dropRosterId: faForm.dropRosterId ? parseInt(faForm.dropRosterId) : undefined,
        week: parseInt(faForm.week),
        countsAgainstLimit: faForm.countsAgainstLimit,
        notes: faForm.notes || undefined,
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }

      // Reset form and refresh data
      setFaForm({
        ...faForm,
        pickupPokemonId: "",
        dropRosterId: "",
        isTeraCaptain: false,
        notes: "",
      });
      fetchSeasonData(selectedSeason.id);
    } catch (error) {
      alert("Transaction failed");
    }
  }

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
        notes: "",
      });
      fetchSeasonData(selectedSeason.id);
    } catch (error) {
      alert("Trade failed");
    }
  }

  // Handle Tera Swap
  async function handleTeraSwap(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeason) return;

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "teraSwap",
          seasonId: selectedSeason.id,
          seasonCoachId: parseInt(teraForm.seasonCoachId),
          newTeraCaptainRosterId: parseInt(teraForm.newTeraCaptainRosterId),
          oldTeraCaptainRosterId: teraForm.oldTeraCaptainRosterId
            ? parseInt(teraForm.oldTeraCaptainRosterId)
            : undefined,
          week: parseInt(teraForm.week),
          countsAgainstLimit: teraForm.countsAgainstLimit,
          notes: teraForm.notes || undefined,
        }),
      });

      const result = await res.json();
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }

      // Reset form and refresh
      setTeraForm({
        ...teraForm,
        newTeraCaptainRosterId: "",
        oldTeraCaptainRosterId: "",
        notes: "",
      });
      fetchSeasonData(selectedSeason.id);
    } catch (error) {
      alert("Tera swap failed");
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
      setP2pForm((prev) => ({
        ...prev,
        team1RosterIds: prev.team1RosterIds.includes(rosterId)
          ? prev.team1RosterIds.filter((id) => id !== rosterId)
          : prev.team1RosterIds.length < 3
          ? [...prev.team1RosterIds, rosterId]
          : prev.team1RosterIds,
      }));
    } else {
      setP2pForm((prev) => ({
        ...prev,
        team2RosterIds: prev.team2RosterIds.includes(rosterId)
          ? prev.team2RosterIds.filter((id) => id !== rosterId)
          : prev.team2RosterIds.length < 3
          ? [...prev.team2RosterIds, rosterId]
          : prev.team2RosterIds,
      }));
    }
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

      {/* Season Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label>Select Season:</Label>
            <Select
              value={selectedSeason?.id || ""}
              onChange={(e) => {
                const season = seasons.find((s) => s.id === parseInt(e.target.value));
                setSelectedSeason(season || null);
              }}
              className="w-64"
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
        </CardContent>
      </Card>

      {selectedSeason && (
        <>
          {/* FA Transaction */}
          <Card>
            <CardHeader>
              <CardTitle>Free Agent Transaction</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFATransaction} className="space-y-4">
                <div>
                  <Label>Team</Label>
                  <Select
                    value={faForm.seasonCoachId}
                    onChange={(e) =>
                      setFaForm({ ...faForm, seasonCoachId: e.target.value, dropRosterId: "", pickupPokemonId: "" })
                    }
                  >
                    <option value="">Select team</option>
                    {seasonCoaches.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {formatTeamWithCounts(sc)}
                      </option>
                    ))}
                  </Select>
                </div>

                {faForm.seasonCoachId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Drop Pokemon */}
                    <div className="space-y-2">
                      <Label className="text-lg font-semibold text-[var(--error)]">Drop to FA</Label>
                      <Select
                        value={faForm.dropRosterId}
                        onChange={(e) => setFaForm({ ...faForm, dropRosterId: e.target.value })}
                      >
                        <option value="">None (pickup only)</option>
                        {selectedTeamRoster.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.pokemon?.displayName || r.pokemon?.name} ({r.price} pts)
                            {r.isTeraCaptain ? " [TC]" : ""}
                            {r.acquiredVia && r.acquiredVia !== "DRAFT" ? ` [${r.acquiredVia}]` : ""}
                          </option>
                        ))}
                      </Select>
                      {faForm.dropRosterId && (() => {
                        const selectedRoster = selectedTeamRoster.find(r => r.id === parseInt(faForm.dropRosterId));
                        const refund = selectedRoster?.price || 0;
                        return (
                          <p className="text-sm font-medium">
                            Refund: <span className="text-[var(--success)]">+{refund} pts</span>
                            {selectedRoster?.isTeraCaptain && (
                              <span className="text-[var(--foreground-muted)] ml-1">(includes TC)</span>
                            )}
                          </p>
                        );
                      })()}
                    </div>

                    {/* Pickup Pokemon */}
                    <div className="space-y-2">
                      <Label className="text-lg font-semibold text-[var(--success)]">Pickup from FA</Label>
                      <Select
                        value={faForm.pickupPokemonId}
                        onChange={(e) => setFaForm({ ...faForm, pickupPokemonId: e.target.value, isTeraCaptain: false })}
                      >
                        <option value="">None (drop only)</option>
                        {sortedFreeAgents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName || p.name} ({p.price} pts)
                            {p.teraCaptainCost ? ` [+${p.teraCaptainCost} TC]` : ""}
                            {p.teraBanned ? " [Tera Banned]" : ""}
                          </option>
                        ))}
                      </Select>
                      {faForm.pickupPokemonId && (() => {
                        const selectedPokemon = sortedFreeAgents.find(p => p.id === parseInt(faForm.pickupPokemonId));
                        const basePrice = selectedPokemon?.price || 0;
                        const tcCost = selectedPokemon?.teraCaptainCost || 0;
                        const totalCost = faForm.isTeraCaptain ? basePrice + tcCost : basePrice;
                        const isTeraBanned = selectedPokemon?.teraBanned;
                        return (
                          <div className="space-y-2">
                            {!isTeraBanned && tcCost > 0 && (
                              <Label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={faForm.isTeraCaptain}
                                  onChange={(e) => setFaForm({ ...faForm, isTeraCaptain: e.target.checked })}
                                  className="w-4 h-4"
                                />
                                <span>Tera Captain (+{tcCost} pts)</span>
                              </Label>
                            )}
                            <p className="text-sm font-medium">
                              Cost: <span className="text-[var(--error)]">-{totalCost} pts</span>
                              {faForm.isTeraCaptain && (
                                <span className="text-[var(--foreground-muted)] ml-1">
                                  ({basePrice} + {tcCost} TC)
                                </span>
                              )}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Net Budget Summary */}
                {faForm.seasonCoachId && (faForm.dropRosterId || faForm.pickupPokemonId) && (() => {
                  const dropRoster = faForm.dropRosterId ? selectedTeamRoster.find(r => r.id === parseInt(faForm.dropRosterId)) : null;
                  const pickupPokemon = faForm.pickupPokemonId ? sortedFreeAgents.find(p => p.id === parseInt(faForm.pickupPokemonId)) : null;
                  const refund = dropRoster?.price || 0;
                  const basePrice = pickupPokemon?.price || 0;
                  const tcCost = (faForm.isTeraCaptain && pickupPokemon?.teraCaptainCost) || 0;
                  const totalCost = basePrice + tcCost;
                  const netChange = refund - totalCost;
                  const team = seasonCoaches.find(sc => sc.id === parseInt(faForm.seasonCoachId));
                  const currentBudget = team?.remainingBudget || 0;
                  const newBudget = currentBudget + netChange;
                  return (
                    <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--glass-border)]">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm text-[var(--foreground-muted)]">Net Budget Change</p>
                          <p className={`text-2xl font-bold ${netChange > 0 ? "text-[var(--success)]" : netChange < 0 ? "text-[var(--error)]" : ""}`}>
                            {netChange > 0 ? "+" : ""}{netChange} pts
                          </p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-sm text-[var(--foreground-muted)]">New Budget</p>
                          <p className={`text-2xl font-bold ${newBudget < 0 ? "text-[var(--error)]" : ""}`}>
                            {newBudget} pts
                          </p>
                        </div>
                      </div>
                      {newBudget < 0 && (
                        <p className="text-sm text-[var(--error)] mt-2">Insufficient budget!</p>
                      )}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Week</Label>
                    <Select
                      value={faForm.week}
                      onChange={(e) => setFaForm({ ...faForm, week: e.target.value })}
                    >
                      {[1, 2, 3, 4, 5, 6].map((w) => (
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
                        checked={faForm.countsAgainstLimit}
                        onChange={(e) => setFaForm({ ...faForm, countsAgainstLimit: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span>Counts Against Limit</span>
                    </Label>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Input
                      value={faForm.notes}
                      onChange={(e) => setFaForm({ ...faForm, notes: e.target.value })}
                      placeholder="Transaction notes"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={!faForm.seasonCoachId || (!faForm.pickupPokemonId && !faForm.dropRosterId)}>
                  Execute FA Transaction
                </Button>
              </form>
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
                        setP2pForm({ ...p2pForm, team1SeasonCoachId: e.target.value, team1RosterIds: [] })
                      }
                    >
                      <option value="">Select team</option>
                      {seasonCoaches
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
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Team 2 */}
                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Team 2</Label>
                    <Select
                      value={p2pForm.team2SeasonCoachId}
                      onChange={(e) =>
                        setP2pForm({ ...p2pForm, team2SeasonCoachId: e.target.value, team2RosterIds: [] })
                      }
                    >
                      <option value="">Select team</option>
                      {seasonCoaches
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
                        </p>
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
                      {[1, 2, 3, 4, 5, 6].map((w) => (
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

          {/* Tera Swap */}
          <Card>
            <CardHeader>
              <CardTitle>Tera Captain Swap</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTeraSwap} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Team</Label>
                    <Select
                      value={teraForm.seasonCoachId}
                      onChange={(e) =>
                        setTeraForm({
                          ...teraForm,
                          seasonCoachId: e.target.value,
                          newTeraCaptainRosterId: "",
                          oldTeraCaptainRosterId: "",
                        })
                      }
                    >
                      <option value="">Select team</option>
                      {seasonCoaches.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {formatTeamWithCounts(sc)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {teraForm.seasonCoachId && currentTeraCaptain && (
                    <div className="flex items-center gap-2 mt-6">
                      <span className="text-sm text-[var(--foreground-muted)]">Current TC:</span>
                      {currentTeraCaptain.pokemon?.spriteUrl && (
                        <img src={currentTeraCaptain.pokemon.spriteUrl} alt="" className="w-6 h-6" />
                      )}
                      <span className="font-medium">
                        {currentTeraCaptain.pokemon?.displayName || currentTeraCaptain.pokemon?.name}
                      </span>
                    </div>
                  )}
                </div>

                {teraForm.seasonCoachId && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>New Tera Captain</Label>
                        <Select
                          value={teraForm.newTeraCaptainRosterId}
                          onChange={(e) => setTeraForm({ ...teraForm, newTeraCaptainRosterId: e.target.value })}
                        >
                          <option value="">Select new TC</option>
                          {teraTeamRoster
                            .filter((r) => !r.isTeraCaptain && !r.pokemon?.teraBanned)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.pokemon?.displayName || r.pokemon?.name} ({r.price} pts)
                                {r.pokemon?.teraCaptainCost ? ` [+${r.pokemon.teraCaptainCost} TC]` : ""}
                              </option>
                            ))}
                        </Select>
                        {teraForm.newTeraCaptainRosterId && (() => {
                          const selectedRoster = teraTeamRoster.find(r => r.id === parseInt(teraForm.newTeraCaptainRosterId));
                          const tcCost = selectedRoster?.pokemon?.teraCaptainCost || 0;
                          const team = seasonCoaches.find(sc => sc.id === parseInt(teraForm.seasonCoachId));
                          const currentBudget = team?.remainingBudget || 0;
                          return tcCost > 0 ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-medium">
                                TC Cost: <span className="text-[var(--error)]">-{tcCost} pts</span>
                              </p>
                              <p className="text-xs text-[var(--foreground-muted)]">
                                New budget: {currentBudget - tcCost} pts
                              </p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                      {currentTeraCaptain && (
                        <div>
                          <Label className="flex items-center gap-2 mt-6">
                            <input
                              type="checkbox"
                              checked={!!teraForm.oldTeraCaptainRosterId}
                              onChange={(e) =>
                                setTeraForm({
                                  ...teraForm,
                                  oldTeraCaptainRosterId: e.target.checked
                                    ? String(currentTeraCaptain.id)
                                    : "",
                                })
                              }
                              className="w-4 h-4"
                            />
                            <span>Remove current TC status</span>
                          </Label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Week</Label>
                    <Select
                      value={teraForm.week}
                      onChange={(e) => setTeraForm({ ...teraForm, week: e.target.value })}
                    >
                      {[1, 2, 3, 4, 5, 6].map((w) => (
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
                        checked={teraForm.countsAgainstLimit}
                        onChange={(e) => setTeraForm({ ...teraForm, countsAgainstLimit: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span>Counts Against Limit (1 FA point)</span>
                    </Label>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Input
                      value={teraForm.notes}
                      onChange={(e) => setTeraForm({ ...teraForm, notes: e.target.value })}
                      placeholder="Tera swap notes"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={!teraForm.seasonCoachId || !teraForm.newTeraCaptainRosterId}>
                  Execute Tera Swap
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History ({transactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-4">
                  No transactions recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
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
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-[var(--card-hover)]/50 hover:bg-[var(--card-hover)]/30">
                          <td className="p-2">
                            <span className="font-mono">{tx.week}</span>
                          </td>
                          <td className="p-2">
                            <span className={`font-medium ${getTypeColor(tx.type)}`}>
                              {getTypeLabel(tx.type)}
                            </span>
                            {!tx.countsAgainstLimit && (
                              <span className="ml-1 text-xs text-[var(--foreground-muted)]">(free)</span>
                            )}
                          </td>
                          <td className="p-2">
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
                          <td className="p-2">
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
                          <td className="p-2">
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
                          <td className="p-2">
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
    </div>
  );
}
