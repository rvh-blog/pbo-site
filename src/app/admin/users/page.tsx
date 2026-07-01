"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface User {
  id: number;
  name: string;
  type: "coach" | "spectator";
  isClaimed: boolean;
  isMod: boolean;
  claimedAt: string | null;
  eloRating: number | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "coaches" | "spectators" | "claimed" | "unclaimed">("all");

  // Reset password state
  const [resettingId, setResettingId] = useState<{ id: number; type: "coach" | "spectator" } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(id: number, type: "coach" | "spectator") {
    if (!newPassword || newPassword.length < 6) {
      setActionResult({ type: "error", message: "Password must be at least 6 characters" });
      return;
    }

    setActionLoading(true);
    setActionResult(null);

    try {
      const response = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, newPassword }),
      });

      if (response.ok) {
        setActionResult({ type: "success", message: "Password reset successfully" });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id && u.type === type
              ? { ...u, isClaimed: true, claimedAt: u.claimedAt ?? new Date().toISOString() }
              : u
          )
        );
        setResettingId(null);
        setNewPassword("");
      } else {
        const data = await response.json();
        setActionResult({ type: "error", message: data.error || "Failed to reset password" });
      }
    } catch {
      setActionResult({ type: "error", message: "Failed to reset password" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleMod(id: number, type: "coach" | "spectator") {
    setActionLoading(true);
    setActionResult(null);

    try {
      const response = await fetch(`/api/admin/users/${id}/toggle-mod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const data = await response.json();
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id && u.type === type ? { ...u, isMod: data.isMod } : u
          )
        );
        setActionResult({ type: "success", message: `Mod status ${data.isMod ? "enabled" : "disabled"}` });
      } else {
        const data = await response.json();
        setActionResult({ type: "error", message: data.error || "Failed to toggle mod status" });
      }
    } catch {
      setActionResult({ type: "error", message: "Failed to toggle mod status" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnclaim(id: number) {
    if (!confirm("This will remove the password from this coach account, allowing someone else to claim it. Continue?")) {
      return;
    }

    setActionLoading(true);
    setActionResult(null);

    try {
      const response = await fetch(`/api/admin/users/${id}/unclaim`, {
        method: "POST",
      });

      if (response.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id && u.type === "coach" ? { ...u, isClaimed: false, claimedAt: null } : u
          )
        );
        setActionResult({ type: "success", message: "Coach account unclaimed" });
      } else {
        const data = await response.json();
        setActionResult({ type: "error", message: data.error || "Failed to unclaim" });
      }
    } catch {
      setActionResult({ type: "error", message: "Failed to unclaim" });
    } finally {
      setActionLoading(false);
    }
  }

  const filteredUsers = users.filter((user) => {
    switch (filter) {
      case "coaches":
        return user.type === "coach";
      case "spectators":
        return user.type === "spectator";
      case "claimed":
        return user.isClaimed;
      case "unclaimed":
        return !user.isClaimed;
      default:
        return true;
    }
  });

  const stats = {
    total: users.length,
    coaches: users.filter((u) => u.type === "coach").length,
    spectators: users.filter((u) => u.type === "spectator").length,
    claimed: users.filter((u) => u.isClaimed).length,
    mods: users.filter((u) => u.isMod).length,
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-[var(--foreground-muted)]">
          Manage coach and spectator accounts
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-[var(--foreground-muted)]">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[var(--primary)]">{stats.coaches}</p>
            <p className="text-xs text-[var(--foreground-muted)]">Coaches</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[var(--secondary)]">{stats.spectators}</p>
            <p className="text-xs text-[var(--foreground-muted)]">Spectators</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[var(--success)]">{stats.claimed}</p>
            <p className="text-xs text-[var(--foreground-muted)]">Claimed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent)]">{stats.mods}</p>
            <p className="text-xs text-[var(--foreground-muted)]">Mods</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Result */}
      {actionResult && (
        <div
          className={`p-3 rounded-lg ${
            actionResult.type === "success"
              ? "bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)]"
              : "bg-[var(--error)]/10 border border-[var(--error)]/20 text-[var(--error)]"
          }`}
        >
          {actionResult.message}
        </div>
      )}

      {/* Users List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Users ({filteredUsers.length})</CardTitle>
            <div className="flex gap-2">
              {(["all", "coaches", "spectators", "claimed", "unclaimed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-4">
              No users found
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={`${user.type}-${user.id}`}
                  className="rounded-lg bg-[var(--background-secondary)] p-4"
                >
                  {resettingId?.id === user.id && resettingId?.type === user.type ? (
                    /* Reset Password Mode */
                    <div className="space-y-3">
                      <p className="font-medium">Reset password for {user.name}</p>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password (min 6 chars)"
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleResetPassword(user.id, user.type)}
                          disabled={actionLoading}
                        >
                          {actionLoading ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setResettingId(null);
                            setNewPassword("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Normal View */
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                            user.type === "coach"
                              ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                              : "bg-[var(--secondary)]/20 text-[var(--secondary)]"
                          }`}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{user.name}</p>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                user.type === "coach"
                                  ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                                  : "bg-[var(--secondary)]/20 text-[var(--secondary)]"
                              }`}
                            >
                              {user.type.toUpperCase()}
                            </span>
                            {user.isMod && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent)]/20 text-[var(--accent)]">
                                MOD
                              </span>
                            )}
                            {!user.isClaimed && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--foreground-muted)]/20 text-[var(--foreground-muted)]">
                                UNCLAIMED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--foreground-muted)]">
                            ID: {user.id}
                            {user.eloRating && ` | ELO: ${Math.round(user.eloRating)}`}
                            {user.claimedAt && ` | Claimed: ${new Date(user.claimedAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResettingId({ id: user.id, type: user.type })}
                        >
                          Reset Password
                        </Button>
                        {user.isClaimed && (
                          <Button
                            size="sm"
                            variant={user.isMod ? "secondary" : "outline"}
                            onClick={() => handleToggleMod(user.id, user.type)}
                            disabled={actionLoading}
                          >
                            {user.isMod ? "Remove Mod" : "Make Mod"}
                          </Button>
                        )}
                        {user.type === "coach" && user.isClaimed && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleUnclaim(user.id)}
                            disabled={actionLoading}
                          >
                            Unclaim
                          </Button>
                        )}
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
