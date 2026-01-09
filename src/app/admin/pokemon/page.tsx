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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSeasons();
    fetchPokemon();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchPokemon(selectedSeason);
    } else {
      fetchPokemon();
    }
  }, [selectedSeason]);

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
