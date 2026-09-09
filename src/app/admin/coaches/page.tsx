"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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
  // Auth fields
  isClaimed?: boolean;
  isMod?: boolean;
  claimedAt?: string | null;
  youtubePlaylistId?: string | null;
}

interface Spectator {
  id: number;
  name: string;
  isMod: boolean;
  createdAt: string | null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [spectators, setSpectators] = useState<Spectator[]>([]);
  const [loading, setLoading] = useState(true);

  // Add coach form
  const [newCoachName, setNewCoachName] = useState("");

  // Edit coach state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editYoutubePlaylist, setEditYoutubePlaylist] = useState("");
  const [mergeFromId, setMergeFromId] = useState("");

  // Expanded view
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedSpectatorId, setExpandedSpectatorId] = useState<number | null>(null);

  // ELO recalculation
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);

  // Account management loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchCoaches();
    fetchSpectators();
  }, []);

  async function fetchCoaches() {
    const response = await fetch("/api/coaches");
    const data = await response.json();
    setCoaches(data);
    setLoading(false);
  }

  async function fetchSpectators() {
    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json();
      // Filter to only spectators (users table, not coaches)
      setSpectators(data.spectators || []);
    } catch (error) {
      console.error("Failed to fetch spectators:", error);
    }
  }

  async function handleResetPassword(type: "coach" | "spectator", id: number) {
    const newPassword = prompt("Enter new password (min 6 characters):");
    if (!newPassword || newPassword.length < 6) {
      if (newPassword !== null) {
        alert("Password must be at least 6 characters");
      }
      return;
    }

    setActionLoading(`reset-${type}-${id}`);
    try {
      const response = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reset password");
      }

      alert("Password reset successfully");
      fetchCoaches();
    } catch (error: unknown) {
      alert(`Error: ${getErrorMessage(error)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleMod(type: "coach" | "spectator", id: number, currentIsMod: boolean) {
    const action = currentIsMod ? "remove mod status from" : "grant mod status to";
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    setActionLoading(`mod-${type}-${id}`);
    try {
      const response = await fetch(`/api/admin/users/${id}/toggle-mod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to toggle mod status");
      }

      fetchCoaches();
      fetchSpectators();
    } catch (error: unknown) {
      alert(`Error: ${getErrorMessage(error)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnclaim(coachId: number) {
    if (!confirm("Are you sure you want to unclaim this account? The coach will need to set a new password to log in again.")) {
      return;
    }

    setActionLoading(`unclaim-${coachId}`);
    try {
      const response = await fetch(`/api/admin/users/${coachId}/unclaim`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unclaim account");
      }

      fetchCoaches();
    } catch (error: unknown) {
      alert(`Error: ${getErrorMessage(error)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConvertToCoach(spectatorId: number, spectatorName: string) {
    const coachName = prompt("Enter the coach name for this user:", spectatorName);
    if (!coachName) return;

    setActionLoading(`convert-${spectatorId}`);
    try {
      // First create the coach
      const createRes = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: coachName.trim() }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to create coach");
      }

      const newCoach = await createRes.json();

      // Then transfer the spectator's auth to the new coach
      const transferRes = await fetch(`/api/admin/users/${spectatorId}/convert-to-coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: newCoach.id }),
      });

      if (!transferRes.ok) {
        const data = await transferRes.json();
        throw new Error(data.error || "Failed to convert to coach");
      }

      fetchCoaches();
      fetchSpectators();
      alert(`${spectatorName} has been converted to coach "${coachName}"`);
    } catch (error: unknown) {
      alert(`Error: ${getErrorMessage(error)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRecalculateElo() {
    if (!confirm("This will recalculate ELO ratings for all coaches based on match history. This may take a moment. Continue?")) {
      return;
    }

    setIsRecalculating(true);
    setRecalcResult(null);

    try {
      const response = await fetch("/api/elo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalculateAll" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to recalculate ELO");
      }

      setRecalcResult(data.message);
      // Refresh coaches to show updated ELO ratings
      fetchCoaches();
    } catch (error: unknown) {
      setRecalcResult(`Error: ${getErrorMessage(error)}`);
    } finally {
      setIsRecalculating(false);
    }
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
    const updateData: { id: number; name?: string; mergeFromId?: number; youtubePlaylistId?: string | null } = { id };

    if (editName.trim()) {
      updateData.name = editName.trim();
    }
    if (mergeFromId && parseInt(mergeFromId) !== id) {
      updateData.mergeFromId = parseInt(mergeFromId);
    }
    updateData.youtubePlaylistId = editYoutubePlaylist.trim() || null;

    const response = await fetch("/api/coaches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Failed to update coach");
      return;
    }

    setEditingId(null);
    setEditName("");
    setEditYoutubePlaylist("");
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
    setEditYoutubePlaylist(coach.youtubePlaylistId || "");
    setMergeFromId("");
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Manage Coaches</h1>
          <p className="text-[var(--foreground-muted)]">
            Add, edit, merge, or remove coaches from the league
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            onClick={handleRecalculateElo}
            disabled={isRecalculating}
            variant="secondary"
          >
            {isRecalculating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Recalculating...
              </>
            ) : (
              "Recalculate All ELO"
            )}
          </Button>
          {recalcResult && (
            <p className={`text-sm ${recalcResult.startsWith("Error") ? "text-[var(--error)]" : "text-[var(--accent)]"}`}>
              {recalcResult}
            </p>
          )}
        </div>
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
                        <div className="md:col-span-2">
                          <Label>YouTube Playlist</Label>
                          <Input
                            value={editYoutubePlaylist}
                            onChange={(e) => setEditYoutubePlaylist(e.target.value)}
                            placeholder="https://www.youtube.com/playlist?list=..."
                          />
                          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                            Optional. Paste a public playlist URL or playlist ID. Leave blank to remove it from this coach&apos;s page.
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

                      {/* Account Management Section */}
                      {(coach.isClaimed || editingId === coach.id) && (
                        <div className="border-t border-[var(--glass-border)] pt-4">
                          <p className="text-xs font-medium text-[var(--foreground-muted)] mb-2 uppercase tracking-wide">
                            Account Management
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResetPassword("coach", coach.id)}
                              disabled={actionLoading === `reset-coach-${coach.id}`}
                            >
                              {actionLoading === `reset-coach-${coach.id}` ? "..." : "Reset Password"}
                            </Button>
                            {coach.isClaimed && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleMod("coach", coach.id, coach.isMod || false)}
                                  disabled={actionLoading === `mod-coach-${coach.id}`}
                                >
                                  {actionLoading === `mod-coach-${coach.id}` ? "..." : coach.isMod ? "Remove Mod" : "Make Mod"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUnclaim(coach.id)}
                                  disabled={actionLoading === `unclaim-${coach.id}`}
                                >
                                  {actionLoading === `unclaim-${coach.id}` ? "..." : "Unclaim Account"}
                                </Button>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-[var(--foreground-muted)] mt-2">
                            Reset Password: Set a new password without unclaiming. For unclaimed coaches, this claims the account for login.
                            {coach.isClaimed ? " Unclaim: Remove password so they must claim again." : ""}
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
                            setEditYoutubePlaylist("");
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
                      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div>
                            <p className="font-medium">
                              {coach.name}
                              {coach.isMod && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-[var(--primary)]/20 text-[var(--primary)]">
                                  MOD
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-[var(--foreground-muted)]">
                              ID: {coach.id} | ELO: {Math.round(coach.eloRating)} | {coach.seasonCoaches.length} season{coach.seasonCoaches.length !== 1 ? 's' : ''}
                              {coach.isClaimed && (
                                <span className="ml-2 text-[var(--accent)]">• Claimed</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
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

      {/* Spectators List */}
      <Card>
        <CardHeader>
          <CardTitle>Spectators ({spectators.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {spectators.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-4">
              No spectator accounts yet.
            </p>
          ) : (
            <div className="space-y-2">
              {spectators.map((spectator) => (
                <div
                  key={spectator.id}
                  className="rounded-lg bg-[var(--background-secondary)] overflow-hidden"
                >
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {spectator.name}
                        {spectator.isMod && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-[var(--primary)]/20 text-[var(--primary)]">
                            MOD
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-[var(--foreground-muted)]">
                        ID: {spectator.id}
                        {spectator.createdAt && (
                          <span className="ml-2">
                            • Created {new Date(spectator.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedSpectatorId(expandedSpectatorId === spectator.id ? null : spectator.id)}
                    >
                      {expandedSpectatorId === spectator.id ? "Close" : "Manage"}
                    </Button>
                  </div>

                  {/* Expanded Management Section */}
                  {expandedSpectatorId === spectator.id && (
                    <div className="px-3 pb-3">
                      <div className="border-t border-[var(--glass-border)] pt-3">
                        <p className="text-xs font-medium text-[var(--foreground-muted)] mb-2 uppercase tracking-wide">
                          Account Management
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetPassword("spectator", spectator.id)}
                            disabled={actionLoading === `reset-spectator-${spectator.id}`}
                          >
                            {actionLoading === `reset-spectator-${spectator.id}` ? "..." : "Reset Password"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleMod("spectator", spectator.id, spectator.isMod)}
                            disabled={actionLoading === `mod-spectator-${spectator.id}`}
                          >
                            {actionLoading === `mod-spectator-${spectator.id}` ? "..." : spectator.isMod ? "Remove Mod" : "Make Mod"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleConvertToCoach(spectator.id, spectator.name)}
                            disabled={actionLoading === `convert-${spectator.id}`}
                          >
                            {actionLoading === `convert-${spectator.id}` ? "..." : "Convert to Coach"}
                          </Button>
                        </div>
                      </div>
                    </div>
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
