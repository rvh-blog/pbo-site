"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface SeasonCoach {
  id: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  division: {
    name: string;
    season: {
      name: string;
    } | null;
  } | null;
}

interface Coach {
  id: number;
  name: string;
  eloRating: number;
  createdAt: string;
  seasonCoaches: SeasonCoach[];
}

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);

  // Add coach form
  const [newCoachName, setNewCoachName] = useState("");

  // Edit coach state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergeFromId, setMergeFromId] = useState("");

  // Expanded view
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchCoaches();
  }, []);

  async function fetchCoaches() {
    const response = await fetch("/api/coaches");
    const data = await response.json();
    setCoaches(data);
    setLoading(false);
  }

  async function handleAddCoach(e: React.FormEvent) {
    e.preventDefault();
    if (!newCoachName.trim()) return;

    await fetch("/api/coaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCoachName.trim() }),
    });

    setNewCoachName("");
    fetchCoaches();
  }

  async function handleUpdateCoach(id: number) {
    const updateData: { id: number; name?: string; mergeFromId?: number } = { id };

    if (editName.trim()) {
      updateData.name = editName.trim();
    }
    if (mergeFromId && parseInt(mergeFromId) !== id) {
      updateData.mergeFromId = parseInt(mergeFromId);
    }

    await fetch("/api/coaches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    setEditingId(null);
    setEditName("");
    setMergeFromId("");
    fetchCoaches();
  }

  async function handleDeleteCoach(id: number) {
    const coach = coaches.find(c => c.id === id);
    if (!coach) return;

    if (coach.seasonCoaches.length > 0) {
      if (!confirm(`This coach has ${coach.seasonCoaches.length} season entries. Deleting will remove all associated data. Are you sure?`)) {
        return;
      }
    } else if (!confirm("Are you sure you want to delete this coach?")) {
      return;
    }

    await fetch(`/api/coaches?id=${id}`, {
      method: "DELETE",
    });

    fetchCoaches();
  }

  function startEdit(coach: Coach) {
    setEditingId(coach.id);
    setEditName(coach.name);
    setMergeFromId("");
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manage Coaches</h1>
        <p className="text-[var(--foreground-muted)]">
          Add, edit, merge, or remove coaches from the league
        </p>
      </div>

      {/* Add Coach Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add New Coach</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddCoach} className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="name">Coach Name</Label>
              <Input
                id="name"
                value={newCoachName}
                onChange={(e) => setNewCoachName(e.target.value)}
                placeholder="Enter coach name"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit">Add Coach</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Coaches List */}
      <Card>
        <CardHeader>
          <CardTitle>All Coaches ({coaches.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-4">
              No coaches yet. Add your first coach above.
            </p>
          ) : (
            <div className="space-y-2">
              {coaches.map((coach) => (
                <div
                  key={coach.id}
                  className="rounded-lg bg-[var(--background-secondary)] overflow-hidden"
                >
                  {editingId === coach.id ? (
                    /* Edit Mode */
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Coach Name</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Coach name"
                          />
                        </div>
                        <div>
                          <Label>Merge From Coach ID</Label>
                          <Input
                            type="number"
                            value={mergeFromId}
                            onChange={(e) => setMergeFromId(e.target.value)}
                            placeholder="Leave empty to skip"
                          />
                          <p className="text-xs text-[var(--foreground-muted)] mt-1">
                            Transfer all data from another coach to this one
                          </p>
                        </div>
                      </div>

                      {mergeFromId && parseInt(mergeFromId) !== coach.id && (
                        <div className="p-3 rounded bg-[var(--error)]/10 border border-[var(--error)]/30">
                          <p className="text-sm text-[var(--error)]">
                            Warning: This will transfer all season entries and ELO history from Coach #{mergeFromId} to this coach, then delete Coach #{mergeFromId}.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateCoach(coach.id)}
                        >
                          Save Changes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(null);
                            setEditName("");
                            setMergeFromId("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-medium">{coach.name}</p>
                            <p className="text-sm text-[var(--foreground-muted)]">
                              ID: {coach.id} | ELO: {Math.round(coach.eloRating)} | {coach.seasonCoaches.length} season{coach.seasonCoaches.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {coach.seasonCoaches.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedId(expandedId === coach.id ? null : coach.id)}
                            >
                              {expandedId === coach.id ? "Hide" : "Show"} Seasons
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(coach)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteCoach(coach.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Season Details */}
                      {expandedId === coach.id && coach.seasonCoaches.length > 0 && (
                        <div className="px-3 pb-3">
                          <div className="border-t border-[var(--glass-border)] pt-3">
                            <p className="text-xs font-medium text-[var(--foreground-muted)] mb-2 uppercase tracking-wide">
                              Season Entries
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {coach.seasonCoaches.map((sc) => (
                                <div
                                  key={sc.id}
                                  className="flex items-center gap-2 p-2 rounded bg-[var(--background-tertiary)]"
                                >
                                  {sc.teamLogoUrl ? (
                                    <img
                                      src={sc.teamLogoUrl}
                                      alt={sc.teamName}
                                      className="w-8 h-8 object-contain rounded"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded bg-[var(--primary)]/20 flex items-center justify-center text-xs font-bold">
                                      {sc.teamAbbreviation || sc.teamName.substring(0, 2)}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{sc.teamName}</p>
                                    <p className="text-xs text-[var(--foreground-muted)]">
                                      {sc.division?.season?.name} - {sc.division?.name}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
