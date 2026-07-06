"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  types: string[];
  spriteUrl: string;
  price?: number | null;
}

interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
}

interface PokemonAlias {
  id: number;
  pokemonId: number;
  alias: string;
  aliasKey: string;
}

interface HardcodedAlias {
  alias: string;
  aliasKey: string;
  source: "hardcoded";
}

interface PokemonCollapse {
  id?: number;
  targetPokemonId?: number;
  pokemonId?: number;
  sourceName: string;
  sourceKey: string;
  targetName?: string;
  normalizedTargetName?: string;
  source?: "hardcoded";
}

const POKEMON_TYPES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
];

export default function AdminPokemonPage() {
  const [pokemonList, setPokemonList] = useState<Pokemon[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [newPokemon, setNewPokemon] = useState({
    name: "",
    type1: "",
    type2: "",
  });
  const [aliasSearch, setAliasSearch] = useState("");
  const [selectedAliasPokemonId, setSelectedAliasPokemonId] = useState<number | null>(null);
  const [builtinAliasKeys, setBuiltinAliasKeys] = useState<string[]>([]);
  const [hardcodedAliases, setHardcodedAliases] = useState<HardcodedAlias[]>([]);
  const [customAliases, setCustomAliases] = useState<PokemonAlias[]>([]);
  const [hardcodedCollapses, setHardcodedCollapses] = useState<PokemonCollapse[]>([]);
  const [customCollapses, setCustomCollapses] = useState<PokemonCollapse[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [newCollapse, setNewCollapse] = useState("");
  const [aliasStatus, setAliasStatus] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSeasons() {
    const response = await fetch("/api/seasons");
    const data = await response.json();
    setSeasons(data);
    const current = data.find((s: Season) => s.isCurrent);
    if (current) {
      setSelectedSeason(current.id);
    }
  }

  async function fetchPokemon(seasonId?: number) {
    const url = seasonId
      ? `/api/pokemon?seasonId=${seasonId}`
      : "/api/pokemon";
    const response = await fetch(url);
    const data = await response.json();
    setPokemonList(data);
    setLoading(false);
  }

  async function fetchPokemonAliases(pokemonId: number) {
    setAliasError(null);
    const response = await fetch(`/api/admin/pokemon-name-aliases?pokemonId=${pokemonId}`);
    const data = await response.json();
    if (!response.ok) {
      setAliasError(data.error || "Failed to load aliases");
      return;
    }
    setBuiltinAliasKeys(data.builtinKeys || []);
    setHardcodedAliases(data.hardcodedAliases || []);
    setCustomAliases(data.aliases || []);
    setHardcodedCollapses(data.hardcodedCollapses || []);
    setCustomCollapses(data.customCollapses || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSeasons();
    fetchPokemon();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPokemon(selectedSeason);
    } else {
      fetchPokemon();
    }
  }, [selectedSeason]);

  useEffect(() => {
    if (selectedAliasPokemonId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPokemonAliases(selectedAliasPokemonId);
    } else {
      setBuiltinAliasKeys([]);
      setHardcodedAliases([]);
      setCustomAliases([]);
      setHardcodedCollapses([]);
      setCustomCollapses([]);
    }
  }, [selectedAliasPokemonId]);

  async function handleAddPokemon(e: React.FormEvent) {
    e.preventDefault();
    if (!newPokemon.name.trim()) return;

    const types = [newPokemon.type1, newPokemon.type2].filter(Boolean);

    await fetch("/api/pokemon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPokemon.name.trim(),
        types,
      }),
    });

    setNewPokemon({ name: "", type1: "", type2: "" });
    fetchPokemon(selectedSeason || undefined);
  }

  async function handleUpdatePrice(pokemonId: number, price: string) {
    if (!selectedSeason) return;

    await fetch("/api/pokemon", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pokemonId,
        seasonId: selectedSeason,
        price: parseInt(price) || 0,
      }),
    });

    fetchPokemon(selectedSeason);
  }

  async function handleDeletePokemon(id: number) {
    if (!confirm("Are you sure you want to delete this Pokemon?")) return;

    await fetch(`/api/pokemon?id=${id}`, {
      method: "DELETE",
    });

    fetchPokemon(selectedSeason || undefined);
  }

  async function handleAddAlias(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAliasPokemonId || !newAlias.trim()) return;

    setAliasStatus(null);
    setAliasError(null);
    const response = await fetch("/api/admin/pokemon-name-aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pokemonId: selectedAliasPokemonId,
        alias: newAlias.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setAliasError(data.error || "Failed to add alias");
      return;
    }

    setNewAlias("");
    setAliasStatus(data.alreadyExists ? "Alias already exists for this Pokemon." : "Alias added.");
    await fetchPokemonAliases(selectedAliasPokemonId);
  }

  async function handleDeleteAlias(aliasId: number) {
    if (!selectedAliasPokemonId) return;
    if (!confirm("Delete this name alias?")) return;

    setAliasStatus(null);
    setAliasError(null);
    const response = await fetch(`/api/admin/pokemon-name-aliases?id=${aliasId}&pokemonId=${selectedAliasPokemonId}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAliasError(data.error || "Failed to delete alias");
      return;
    }

    setAliasStatus("Alias deleted.");
    await fetchPokemonAliases(selectedAliasPokemonId);
  }

  async function handleAddCollapse(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAliasPokemonId || !newCollapse.trim()) return;

    setAliasStatus(null);
    setAliasError(null);
    const response = await fetch("/api/admin/pokemon-name-collapses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetPokemonId: selectedAliasPokemonId,
        sourceName: newCollapse.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setAliasError(data.error || "Failed to add collapse");
      return;
    }

    setNewCollapse("");
    setAliasStatus(data.alreadyExists ? "Collapse already exists for this Pokemon." : "Collapse added.");
    await fetchPokemonAliases(selectedAliasPokemonId);
  }

  async function handleDeleteCollapse(collapseId: number, targetPokemonId?: number | null) {
    const deleteTargetId = targetPokemonId || selectedAliasPokemonId;
    if (!deleteTargetId) return;
    if (!confirm("Delete this name collapse?")) return;

    setAliasStatus(null);
    setAliasError(null);
    const response = await fetch(`/api/admin/pokemon-name-collapses?id=${collapseId}&targetPokemonId=${deleteTargetId}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAliasError(data.error || "Failed to delete collapse");
      return;
    }

    setAliasStatus("Collapse deleted.");
    if (selectedAliasPokemonId) {
      await fetchPokemonAliases(selectedAliasPokemonId);
    }
  }

  const selectedAliasPokemon = pokemonList.find((poke) => poke.id === selectedAliasPokemonId) || null;
  const aliasSearchLower = aliasSearch.trim().toLowerCase();
  const aliasSearchResults = aliasSearchLower
    ? pokemonList
        .filter((poke) => {
          const label = `${poke.displayName || ""} ${poke.name}`.toLowerCase();
          return label.includes(aliasSearchLower);
        })
        .slice(0, 12)
    : [];

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manage Pokemon</h1>
        <p className="text-[var(--foreground-muted)]">
          Add Pokemon and set prices for each season
        </p>
      </div>

      {/* Add Pokemon Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add New Pokemon</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPokemon} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="name">Pokemon Name</Label>
                <Input
                  id="name"
                  value={newPokemon.name}
                  onChange={(e) =>
                    setNewPokemon({ ...newPokemon, name: e.target.value })
                  }
                  placeholder="e.g., Pikachu"
                />
              </div>
              <div>
                <Label htmlFor="type1">Primary Type</Label>
                <Select
                  id="type1"
                  value={newPokemon.type1}
                  onChange={(e) =>
                    setNewPokemon({ ...newPokemon, type1: e.target.value })
                  }
                >
                  <option value="">Select type</option>
                  {POKEMON_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="type2">Secondary Type</Label>
                <Select
                  id="type2"
                  value={newPokemon.type2}
                  onChange={(e) =>
                    setNewPokemon({ ...newPokemon, type2: e.target.value })
                  }
                >
                  <option value="">None</option>
                  {POKEMON_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit">Add Pokemon</Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Name Normalizer Aliases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="space-y-3">
              <div>
                <Label htmlFor="alias-search">Search Pokemon</Label>
                <Input
                  id="alias-search"
                  value={aliasSearch}
                  onChange={(e) => setAliasSearch(e.target.value)}
                  placeholder="e.g., Landorus-Therian"
                />
              </div>
              {aliasSearchResults.length > 0 && (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-2">
                  {aliasSearchResults.map((poke) => (
                    <button
                      key={poke.id}
                      type="button"
                      onClick={() => {
                        setSelectedAliasPokemonId(poke.id);
                        setAliasSearch(poke.displayName || poke.name);
                        setAliasStatus(null);
                        setAliasError(null);
                      }}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--background-tertiary)] ${
                        selectedAliasPokemonId === poke.id ? "bg-[var(--background-tertiary)]" : ""
                      }`}
                    >
                      {poke.spriteUrl && (
                        <img
                          src={poke.spriteUrl}
                          alt=""
                          className="h-8 w-8 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{poke.displayName || poke.name}</span>
                        {poke.displayName && poke.displayName !== poke.name && (
                          <span className="block truncate text-xs text-[var(--foreground-muted)]">{poke.name}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selectedAliasPokemon ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                        Hardcoded aliases
                      </p>
                      <span className="rounded bg-[var(--background)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--foreground-muted)]">
                        Built in
                      </span>
                    </div>
                    {hardcodedAliases.length === 0 ? (
                      <p className="rounded-md bg-[var(--background)] px-2 py-2 text-sm text-[var(--foreground-muted)]">
                        No hardcoded aliases found.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {hardcodedAliases.map((alias) => (
                          <div key={`${alias.alias}:${alias.aliasKey}`} className="max-w-full rounded-md bg-[var(--background)] px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-bold">{alias.alias}</span>
                              <span className="shrink-0 rounded bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                                Hardcoded
                              </span>
                            </div>
                            <p className="truncate font-mono text-[10px] text-[var(--foreground-muted)]">{alias.aliasKey}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                      Custom aliases
                    </p>
                    {customAliases.length === 0 ? (
                      <p className="rounded-md bg-[var(--background)] px-2 py-2 text-sm text-[var(--foreground-muted)]">
                        No custom aliases yet.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {customAliases.map((alias) => (
                          <div key={alias.id} className="flex max-w-full items-center gap-2 rounded-md bg-[var(--background)] px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{alias.alias}</p>
                              <p className="truncate font-mono text-[10px] text-[var(--foreground-muted)]">{alias.aliasKey}</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteAlias(alias.id)}
                            >
                              X
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                      Hardcoded collapses
                    </p>
                    {hardcodedCollapses.length === 0 ? (
                      <p className="rounded-md bg-[var(--background)] px-2 py-2 text-sm text-[var(--foreground-muted)]">
                        No hardcoded collapses point here.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {hardcodedCollapses.map((collapse) => (
                          <div key={`hardcoded-${collapse.sourceKey}`} className="max-w-full rounded-md bg-[var(--background)] px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-bold">
                                {collapse.sourceName}
                                <span className="mx-1 text-[var(--foreground-subtle)]">-&gt;</span>
                                {collapse.targetName || selectedAliasPokemon.displayName || selectedAliasPokemon.name}
                              </p>
                              <span className="shrink-0 rounded bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                                Hardcoded
                              </span>
                            </div>
                            <p className="truncate font-mono text-[10px] text-[var(--foreground-muted)]">{collapse.sourceKey}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                      Custom collapses
                    </p>
                    {customCollapses.length === 0 ? (
                      <p className="rounded-md bg-[var(--background)] px-2 py-2 text-sm text-[var(--foreground-muted)]">
                        No custom collapses yet.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {customCollapses.map((collapse) => (
                          <div key={collapse.id} className="flex max-w-full items-center gap-2 rounded-md bg-[var(--background)] px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">
                                {collapse.sourceName}
                                <span className="mx-1 text-[var(--foreground-subtle)]">-&gt;</span>
                                {collapse.targetName || selectedAliasPokemon.displayName || selectedAliasPokemon.name}
                              </p>
                              <p className="truncate font-mono text-[10px] text-[var(--foreground-muted)]">{collapse.sourceKey}</p>
                            </div>
                            {collapse.id && (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteCollapse(collapse.id!, collapse.targetPokemonId)}
                              >
                                X
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                      Collapsed built-in lookup keys
                    </p>
                    <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                      {builtinAliasKeys.map((key) => (
                        <span key={key} className="rounded bg-[var(--background)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--foreground-muted)]">
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--foreground-muted)]">
                  Select a Pokemon to view or add normalizer aliases. Custom aliases are used by server-side normalization and lookup paths.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3">
              {selectedAliasPokemon ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {selectedAliasPokemon.spriteUrl && (
                      <img
                        src={selectedAliasPokemon.spriteUrl}
                        alt=""
                        className="h-10 w-10 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-bold">{selectedAliasPokemon.displayName || selectedAliasPokemon.name}</p>
                      <p className="truncate text-xs text-[var(--foreground-muted)]">ID {selectedAliasPokemon.id}</p>
                    </div>
                  </div>

                  <form onSubmit={handleAddAlias} className="flex gap-2">
                    <Input
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      placeholder="Add accepted name variation"
                    />
                    <Button type="submit">Add</Button>
                  </form>

                  <form onSubmit={handleAddCollapse} className="flex gap-2">
                    <Input
                      value={newCollapse}
                      onChange={(e) => setNewCollapse(e.target.value)}
                      placeholder="Collapse incoming name to this Pokemon"
                    />
                    <Button type="submit">Collapse</Button>
                  </form>

                  {aliasError && <p className="text-sm text-[var(--error)]">{aliasError}</p>}
                  {aliasStatus && <p className="text-sm text-[var(--success)]">{aliasStatus}</p>}
                </div>
              ) : (
                <p className="text-sm text-[var(--foreground-muted)]">
                  Select a Pokemon to add aliases or collapses.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Season Price Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Pokemon Prices ({pokemonList.length} Pokemon)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="season" className="mb-0">
                Season:
              </Label>
              <Select
                id="season"
                value={selectedSeason || ""}
                onChange={(e) =>
                  setSelectedSeason(
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className="w-48"
              >
                <option value="">All Pokemon (no prices)</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                    {season.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pokemonList.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-4">
              No Pokemon added yet. Add your first Pokemon above.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pokemonList.map((poke) => (
                <div
                  key={poke.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--background-secondary)]"
                >
                  {poke.spriteUrl && (
                    <img
                      src={poke.spriteUrl}
                      alt={poke.displayName || poke.name}
                      className="w-12 h-12 pixelated"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{poke.displayName || poke.name}</p>
                    <div className="flex gap-1">
                      {poke.types?.map((type) => (
                        <span
                          key={type}
                          className={`type-badge type-${type.toLowerCase()}`}
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                  {selectedSeason && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={poke.price || ""}
                        onChange={(e) =>
                          handleUpdatePrice(poke.id, e.target.value)
                        }
                        placeholder="Price"
                        className="w-20"
                      />
                      <span className="text-xs text-[var(--foreground-muted)]">
                        pts
                      </span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeletePokemon(poke.id)}
                  >
                    X
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
