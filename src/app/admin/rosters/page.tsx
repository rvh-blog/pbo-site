"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

interface Coach {
  id: number;
  name: string;
  seasonCoaches?: {
    teamName: string;
    teamLogoUrl: string | null;
  }[];
}

interface Division {
  id: number;
  name: string;
  seasonId: number;
}

interface Season {
  id: number;
  name: string;
  draftBudget: number;
  isCurrent: boolean;
  divisions: Division[];
}

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  types: string[];
  spriteUrl: string;
  price?: number | null;
  teraCaptainCost?: number | null;
  teraBanned?: boolean;
}

interface RosterEntry {
  id: number;
  pokemonId: number;
  price: number;
  draftOrder: number | null;
  isTeraCaptain: boolean;
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
  replacedById: number | null;
  coach: Coach;
  division: Division;
  rosters: RosterEntry[];
}

interface ExistingTeam {
  teamName: string;
  teamLogoUrl: string | null;
}

export default function AdminRostersPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [pokemonList, setPokemonList] = useState<Pokemon[]>([]);
  const [seasonCoaches, setSeasonCoaches] = useState<SeasonCoach[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Form state for adding coach to season
  const [newEntry, setNewEntry] = useState({
    coachId: "",
    divisionId: "",
    teamName: "",
    teamLogoUrl: "",
  });

  // Track existing teams for selected coach
  const [existingTeams, setExistingTeams] = useState<ExistingTeam[]>([]);
  const [useExistingTeam, setUseExistingTeam] = useState(false);

  // Form state for adding Pokemon to roster
  const [addToRoster, setAddToRoster] = useState({
    seasonCoachId: "",
    pokemonId: "",
    price: "",
    isTeraCaptain: false,
  });

  // Edit team state
  const [editingTeam, setEditingTeam] = useState<SeasonCoach | null>(null);
  const [editTeamForm, setEditTeamForm] = useState({
    teamName: "",
    teamAbbreviation: "",
    teamLogoUrl: "",
  });

  // Mid-season replacement state
  const [replacingTeam, setReplacingTeam] = useState<SeasonCoach | null>(null);
  const [replacementForm, setReplacementForm] = useState({
    newCoachId: "",
    newTeamName: "",
    newTeamAbbreviation: "",
    newTeamLogoUrl: "",
    keepTeamInfo: true,
  });

  // Get the selected pokemon's price info
  const selectedPokemon = useMemo(() => {
    if (!addToRoster.pokemonId) return null;
    return pokemonList.find((p) => p.id === parseInt(addToRoster.pokemonId));
  }, [addToRoster.pokemonId, pokemonList]);

  // Sort pokemon alphabetically
  const sortedPokemonList = useMemo(() => {
    return [...pokemonList].sort((a, b) => a.name.localeCompare(b.name));
  }, [pokemonList]);

  // Filter season coaches by selected division
  const filteredSeasonCoaches = useMemo(() => {
    if (selectedDivisionId === "all") return seasonCoaches;
    return seasonCoaches.filter((sc) => sc.divisionId === parseInt(selectedDivisionId));
  }, [seasonCoaches, selectedDivisionId]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
      fetchPokemonForSeason(selectedSeason.id);
    }
  }, [selectedSeason]);

  // When coach is selected, load their existing teams
  useEffect(() => {
    if (newEntry.coachId) {
      const coach = coaches.find((c) => c.id === parseInt(newEntry.coachId));
      if (coach?.seasonCoaches && coach.seasonCoaches.length > 0) {
        // Get unique team names
        const uniqueTeams = coach.seasonCoaches.reduce((acc: ExistingTeam[], sc) => {
          const existing = acc.find((t) => t.teamName === sc.teamName);
          if (!existing) {
            acc.push({ teamName: sc.teamName, teamLogoUrl: sc.teamLogoUrl });
          }
          return acc;
        }, []);
        setExistingTeams(uniqueTeams);
      } else {
        setExistingTeams([]);
      }
      setUseExistingTeam(false);
      setNewEntry((prev) => ({ ...prev, teamName: "", teamLogoUrl: "" }));
    }
  }, [newEntry.coachId, coaches]);

  // Auto-fill price when pokemon is selected or tera captain is toggled
  useEffect(() => {
    if (selectedPokemon?.price !== undefined && selectedPokemon?.price !== null) {
      let totalPrice = selectedPokemon.price;
      // Add tera captain cost if selected
      if (addToRoster.isTeraCaptain && selectedPokemon.teraCaptainCost) {
        totalPrice += selectedPokemon.teraCaptainCost;
      }
      setAddToRoster((prev) => ({ ...prev, price: String(totalPrice) }));
    } else {
      setAddToRoster((prev) => ({ ...prev, price: "" }));
    }
  }, [selectedPokemon, addToRoster.isTeraCaptain]);

  async function fetchData() {
    const [seasonsRes, coachesRes] = await Promise.all([
      fetch("/api/seasons"),
      fetch("/api/coaches"),
    ]);
    const seasonsData = await seasonsRes.json();
    const coachesData = await coachesRes.json();

    setSeasons(seasonsData);
    setCoaches(coachesData);

    const current = seasonsData.find((s: Season) => s.isCurrent);
    if (current) {
      setSelectedSeason(current);
    }
    setLoading(false);
  }

  async function fetchSeasonCoaches(seasonId: number) {
    const res = await fetch(`/api/rosters?seasonId=${seasonId}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      // Deduplicate
      const unique = data.filter(
        (sc: SeasonCoach, index: number, arr: SeasonCoach[]) =>
          arr.findIndex((s) => s.id === sc.id) === index
      );
      setSeasonCoaches(unique);
    }
  }

  async function fetchPokemonForSeason(seasonId: number) {
    const res = await fetch(`/api/pokemon?seasonId=${seasonId}`);
    const data = await res.json();
    setPokemonList(data);
  }

  async function handleAddCoachToSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!newEntry.coachId || !newEntry.divisionId || !newEntry.teamName) return;

    await fetch("/api/rosters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addSeasonCoach",
        coachId: parseInt(newEntry.coachId),
        divisionId: parseInt(newEntry.divisionId),
        teamName: newEntry.teamName,
        teamLogoUrl: newEntry.teamLogoUrl || null,
      }),
    });

    setNewEntry({ coachId: "", divisionId: "", teamName: "", teamLogoUrl: "" });
    setExistingTeams([]);
    setUseExistingTeam(false);
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
    }
  }

  async function handleAddPokemonToRoster(e: React.FormEvent) {
    e.preventDefault();
    if (!addToRoster.seasonCoachId || !addToRoster.pokemonId) return;

    await fetch("/api/rosters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addToRoster",
        seasonCoachId: parseInt(addToRoster.seasonCoachId),
        pokemonId: parseInt(addToRoster.pokemonId),
        price: parseInt(addToRoster.price) || 0,
        isTeraCaptain: addToRoster.isTeraCaptain,
      }),
    });

    setAddToRoster({ ...addToRoster, pokemonId: "", price: "", isTeraCaptain: false });
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
    }
  }

  async function handleRemoveFromRoster(rosterId: number) {
    await fetch(`/api/rosters?rosterId=${rosterId}`, { method: "DELETE" });
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
    }
  }

  async function handleRemoveSeasonCoach(seasonCoachId: number) {
    if (!confirm("Remove this coach from the season? This will delete their roster."))
      return;
    await fetch(`/api/rosters?seasonCoachId=${seasonCoachId}`, {
      method: "DELETE",
    });
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
    }
  }

  function startEditingTeam(sc: SeasonCoach) {
    setEditingTeam(sc);
    setEditTeamForm({
      teamName: sc.teamName,
      teamAbbreviation: sc.teamAbbreviation || "",
      teamLogoUrl: sc.teamLogoUrl || "",
    });
  }

  async function handleSaveTeamEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTeam) return;

    await fetch("/api/rosters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateSeasonCoach",
        seasonCoachId: editingTeam.id,
        teamName: editTeamForm.teamName,
        teamAbbreviation: editTeamForm.teamAbbreviation || editTeamForm.teamName.substring(0, 3).toUpperCase(),
        teamLogoUrl: editTeamForm.teamLogoUrl || null,
      }),
    });

    setEditingTeam(null);
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
    }
  }

  function startReplacement(sc: SeasonCoach) {
    setReplacingTeam(sc);
    setReplacementForm({
      newCoachId: "",
      newTeamName: sc.teamName,
      newTeamAbbreviation: sc.teamAbbreviation || "",
      newTeamLogoUrl: sc.teamLogoUrl || "",
      keepTeamInfo: true,
    });
  }

  async function handleMidSeasonReplacement(e: React.FormEvent) {
    e.preventDefault();
    if (!replacingTeam || !replacementForm.newCoachId) return;

    const res = await fetch("/api/rosters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "midSeasonReplacement",
        originalSeasonCoachId: replacingTeam.id,
        newCoachId: parseInt(replacementForm.newCoachId),
        newTeamName: replacementForm.keepTeamInfo ? replacingTeam.teamName : replacementForm.newTeamName,
        newTeamAbbreviation: replacementForm.keepTeamInfo ? replacingTeam.teamAbbreviation : replacementForm.newTeamAbbreviation,
        newTeamLogoUrl: replacementForm.keepTeamInfo ? replacingTeam.teamLogoUrl : (replacementForm.newTeamLogoUrl || null),
      }),
    });

    const result = await res.json();
    if (result.error) {
      alert(result.error);
      return;
    }

    setReplacingTeam(null);
    if (selectedSeason) {
      fetchSeasonCoaches(selectedSeason.id);
    }
  }

  // Filter out coaches already active in the selected season for replacement
  const availableCoachesForReplacement = useMemo(() => {
    if (!replacingTeam) return coaches;
    const activeCoachIds = seasonCoaches
      .filter((sc) => sc.isActive && sc.divisionId === replacingTeam.divisionId)
      .map((sc) => sc.coachId);
    return coaches.filter((c) => !activeCoachIds.includes(c.id));
  }, [coaches, seasonCoaches, replacingTeam]);

  function handleSelectExistingTeam(team: ExistingTeam) {
    setNewEntry((prev) => ({
      ...prev,
      teamName: team.teamName,
      teamLogoUrl: team.teamLogoUrl || "",
    }));
    setUseExistingTeam(true);
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manage Rosters</h1>
        <p className="text-[var(--foreground-muted)]">
          Assign coaches to seasons and manage their Pokemon rosters
        </p>
      </div>

      {/* Season & Division Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <Label>Season:</Label>
              <Select
                value={selectedSeason?.id || ""}
                onChange={(e) => {
                  const season = seasons.find(
                    (s) => s.id === parseInt(e.target.value)
                  );
                  setSelectedSeason(season || null);
                  setSelectedDivisionId("all");
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
            {selectedSeason && selectedSeason.divisions.length > 0 && (
              <div className="flex items-center gap-4">
                <Label>Division:</Label>
                <Select
                  value={selectedDivisionId}
                  onChange={(e) => setSelectedDivisionId(e.target.value)}
                  className="w-48"
                >
                  <option value="all">All Divisions ({seasonCoaches.length} teams)</option>
                  {selectedSeason.divisions.map((div) => {
                    const divTeamCount = seasonCoaches.filter((sc) => sc.divisionId === div.id).length;
                    return (
                      <option key={div.id} value={div.id}>
                        {div.name} ({divTeamCount} teams)
                      </option>
                    );
                  })}
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSeason && (
        <>
          {/* Add Coach to Season */}
          <Card>
            <CardHeader>
              <CardTitle>Add Coach to {selectedSeason.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddCoachToSeason} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Coach</Label>
                    <Select
                      value={newEntry.coachId}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, coachId: e.target.value })
                      }
                    >
                      <option value="">Select coach</option>
                      {coaches.map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Division</Label>
                    <Select
                      value={newEntry.divisionId}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, divisionId: e.target.value })
                      }
                    >
                      <option value="">Select division</option>
                      {selectedSeason.divisions.map((div) => (
                        <option key={div.id} value={div.id}>
                          {div.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Existing Teams Section */}
                {existingTeams.length > 0 && (
                  <div className="p-3 rounded-lg bg-[var(--background-secondary)]">
                    <p className="text-sm font-medium mb-2">
                      Previous teams for this coach:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {existingTeams.map((team, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectExistingTeam(team)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                            useExistingTeam && newEntry.teamName === team.teamName
                              ? "border-[var(--primary)] bg-[var(--primary)]/10"
                              : "border-[var(--card-hover)] hover:border-[var(--primary)]"
                          }`}
                        >
                          {team.teamLogoUrl && (
                            <img
                              src={team.teamLogoUrl}
                              alt={team.teamName}
                              className="w-6 h-6 object-contain"
                            />
                          )}
                          <span className="text-sm">{team.teamName}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setUseExistingTeam(false);
                          setNewEntry((prev) => ({ ...prev, teamName: "", teamLogoUrl: "" }));
                        }}
                        className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                          !useExistingTeam
                            ? "border-[var(--primary)] bg-[var(--primary)]/10"
                            : "border-[var(--card-hover)] hover:border-[var(--primary)]"
                        }`}
                      >
                        + New Team
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Team Name</Label>
                    <Input
                      value={newEntry.teamName}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, teamName: e.target.value })
                      }
                      placeholder="Team name for this season"
                    />
                  </div>
                  <div>
                    <Label>Team Logo URL</Label>
                    <Input
                      value={newEntry.teamLogoUrl}
                      onChange={(e) =>
                        setNewEntry({ ...newEntry, teamLogoUrl: e.target.value })
                      }
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                </div>

                {/* Logo Preview */}
                {newEntry.teamLogoUrl && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--foreground-muted)]">Preview:</span>
                    <img
                      src={newEntry.teamLogoUrl}
                      alt="Logo preview"
                      className="w-10 h-10 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}

                <div>
                  <Button type="submit">Add Coach to Season</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Add Pokemon to Roster */}
          <Card>
            <CardHeader>
              <CardTitle>Add Pokemon to Roster</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleAddPokemonToRoster}
                className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
              >
                <div>
                  <Label>Team</Label>
                  <Select
                    value={addToRoster.seasonCoachId}
                    onChange={(e) =>
                      setAddToRoster({
                        ...addToRoster,
                        seasonCoachId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select team</option>
                    {seasonCoaches.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.teamName} ({sc.coach?.name}) - {sc.remainingBudget} pts
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Pokemon</Label>
                  <Select
                    value={addToRoster.pokemonId}
                    onChange={(e) =>
                      setAddToRoster({
                        ...addToRoster,
                        pokemonId: e.target.value,
                        isTeraCaptain: false,
                      })
                    }
                  >
                    <option value="">Select Pokemon</option>
                    {sortedPokemonList.map((poke) => (
                      <option key={poke.id} value={poke.id}>
                        {poke.teraBanned ? "[B] " : ""}{poke.displayName || poke.name} {poke.price ? `(${poke.price} pts)` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={addToRoster.price}
                    onChange={(e) =>
                      setAddToRoster({ ...addToRoster, price: e.target.value })
                    }
                    placeholder="Draft price"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addToRoster.isTeraCaptain}
                      onChange={(e) =>
                        setAddToRoster({
                          ...addToRoster,
                          isTeraCaptain: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-[var(--card)] bg-[var(--background-secondary)] text-[var(--primary)] focus:ring-[var(--primary)]"
                      disabled={!selectedPokemon || !!selectedPokemon.teraBanned}
                    />
                    <span>
                      Tera Captain
                      {selectedPokemon && selectedPokemon.teraBanned ? (
                        <span className="text-[var(--error)]"> (Tera Banned)</span>
                      ) : (
                        selectedPokemon?.teraCaptainCost != null &&
                        selectedPokemon.teraCaptainCost > 0 && (
                          <span className="text-[var(--accent)]">
                            {" "}(+{selectedPokemon.teraCaptainCost} pts)
                          </span>
                        )
                      )}
                    </span>
                  </Label>
                </div>
                <div>
                  <Button type="submit">Add to Roster</Button>
                </div>
              </form>
              {selectedPokemon?.teraBanned && (
                <p className="text-xs text-[var(--error)] mt-2">
                  This Pokemon is Tera Banned and cannot be a Tera Captain.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Season Coaches and Rosters */}
          <Card>
            <CardHeader>
              <CardTitle>
                Teams in {selectedSeason.name}
                {selectedDivisionId !== "all" && selectedSeason.divisions.find((d) => d.id === parseInt(selectedDivisionId))
                  ? ` - ${selectedSeason.divisions.find((d) => d.id === parseInt(selectedDivisionId))?.name}`
                  : ""
                } ({filteredSeasonCoaches.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredSeasonCoaches.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-4">
                  No coaches assigned to this {selectedDivisionId === "all" ? "season" : "division"} yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {filteredSeasonCoaches.map((sc) => (
                    <div
                      key={sc.id}
                      className="p-4 rounded-lg bg-[var(--background-secondary)]"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {sc.teamLogoUrl && (
                            <img
                              src={sc.teamLogoUrl}
                              alt={sc.teamName}
                              className="w-10 h-10 object-contain rounded"
                            />
                          )}
                          <div>
                            <h3 className="font-semibold">{sc.teamName}</h3>
                            <p className="text-sm text-[var(--foreground-muted)]">
                              {sc.coach?.name} | {sc.division?.name} |{" "}
                              <span className="text-[var(--accent)]">
                                {sc.remainingBudget} pts remaining
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {sc.isActive && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => startEditingTeam(sc)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => startReplacement(sc)}
                              >
                                Replace
                              </Button>
                            </>
                          )}
                          {!sc.isActive && (
                            <span className="text-xs text-[var(--foreground-muted)] px-2 py-1 bg-[var(--card)] rounded">
                              Replaced
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveSeasonCoach(sc.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sc.rosters?.map((r) => (
                          <div
                            key={r.id}
                            className={`flex items-center gap-2 px-2 py-1 rounded group ${
                              r.isTeraCaptain
                                ? "bg-[var(--primary)]/20 border border-[var(--primary)]/30"
                                : "bg-[var(--card)]"
                            }`}
                          >
                            {r.pokemon?.spriteUrl && (
                              <img
                                src={r.pokemon.spriteUrl}
                                alt={r.pokemon.displayName || r.pokemon.name}
                                className="w-6 h-6 object-contain"
                              />
                            )}
                            <span className="text-sm">{r.pokemon?.displayName || r.pokemon?.name}</span>
                            <span className="text-xs text-[var(--foreground-muted)]">
                              {r.price}pts
                            </span>
                            {r.isTeraCaptain && (
                              <span className="text-xs text-[var(--primary)] font-medium">
                                TC
                              </span>
                            )}
                            <button
                              onClick={() => handleRemoveFromRoster(r.id)}
                              className="text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {(!sc.rosters || sc.rosters.length === 0) && (
                          <span className="text-sm text-[var(--foreground-muted)]">
                            No Pokemon drafted yet
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit Team Modal */}
      {editingTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card)] rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Edit Team</h2>
            <form onSubmit={handleSaveTeamEdit} className="space-y-4">
              <div>
                <Label>Team Name</Label>
                <Input
                  value={editTeamForm.teamName}
                  onChange={(e) =>
                    setEditTeamForm({ ...editTeamForm, teamName: e.target.value })
                  }
                  placeholder="Team name"
                />
              </div>
              <div>
                <Label>Team Abbreviation</Label>
                <Input
                  value={editTeamForm.teamAbbreviation}
                  onChange={(e) =>
                    setEditTeamForm({ ...editTeamForm, teamAbbreviation: e.target.value })
                  }
                  placeholder="e.g., ABC"
                  maxLength={5}
                />
              </div>
              <div>
                <Label>Team Logo URL</Label>
                <Input
                  value={editTeamForm.teamLogoUrl}
                  onChange={(e) =>
                    setEditTeamForm({ ...editTeamForm, teamLogoUrl: e.target.value })
                  }
                  placeholder="https://example.com/logo.png"
                />
              </div>
              {editTeamForm.teamLogoUrl && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--foreground-muted)]">Preview:</span>
                  <img
                    src={editTeamForm.teamLogoUrl}
                    alt="Logo preview"
                    className="w-10 h-10 object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingTeam(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mid-Season Replacement Modal */}
      {replacingTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card)] rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-2">Mid-Season Replacement</h2>
            <p className="text-sm text-[var(--foreground-muted)] mb-4">
              Replace <strong>{replacingTeam.teamName}</strong> ({replacingTeam.coach?.name})
              with a new coach. The new coach will inherit the team&apos;s standings and roster.
            </p>
            <form onSubmit={handleMidSeasonReplacement} className="space-y-4">
              <div>
                <Label>New Coach</Label>
                <Select
                  value={replacementForm.newCoachId}
                  onChange={(e) =>
                    setReplacementForm({ ...replacementForm, newCoachId: e.target.value })
                  }
                >
                  <option value="">Select new coach</option>
                  {availableCoachesForReplacement.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={replacementForm.keepTeamInfo}
                    onChange={(e) =>
                      setReplacementForm({
                        ...replacementForm,
                        keepTeamInfo: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-[var(--card)] bg-[var(--background-secondary)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <span>Keep existing team name and logo</span>
                </Label>
              </div>
              {!replacementForm.keepTeamInfo && (
                <>
                  <div>
                    <Label>New Team Name</Label>
                    <Input
                      value={replacementForm.newTeamName}
                      onChange={(e) =>
                        setReplacementForm({ ...replacementForm, newTeamName: e.target.value })
                      }
                      placeholder="New team name"
                    />
                  </div>
                  <div>
                    <Label>New Team Abbreviation</Label>
                    <Input
                      value={replacementForm.newTeamAbbreviation}
                      onChange={(e) =>
                        setReplacementForm({ ...replacementForm, newTeamAbbreviation: e.target.value })
                      }
                      placeholder="e.g., ABC"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label>New Team Logo URL</Label>
                    <Input
                      value={replacementForm.newTeamLogoUrl}
                      onChange={(e) =>
                        setReplacementForm({ ...replacementForm, newTeamLogoUrl: e.target.value })
                      }
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                </>
              )}
              <div className="p-3 rounded-lg bg-[var(--background-secondary)] text-sm">
                <p className="font-medium mb-1">What happens:</p>
                <ul className="list-disc list-inside text-[var(--foreground-muted)] space-y-1">
                  <li>Original coach is marked as inactive</li>
                  <li>New coach inherits all roster Pokemon</li>
                  <li>Standings position is preserved</li>
                  <li>Previous match history stays with original coach</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setReplacingTeam(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!replacementForm.newCoachId}>
                  Confirm Replacement
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
