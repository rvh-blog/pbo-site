"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

interface Division {
  id: number;
  name: string;
  seasonId: number;
  seasonName: string;
  seasonNumber: number;
}

interface Channel {
  id: number;
  channelId: string;
  channelName: string | null;
  divisionId: number;
  isDraftEnabled: boolean;
  isMatchReportEnabled: boolean;
  isScheduleEnabled: boolean;
  division?: {
    id: number;
    name: string;
    season?: {
      id: number;
      name: string;
    };
  };
}

interface Guild {
  id: number;
  guildId: string;
  name: string;
  isActive: boolean;
  channels: Channel[];
}

interface BotStatus {
  configured: boolean;
  supervised: boolean;
  running: boolean;
  pid: number | null;
}

export default function AdminDiscordPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [botStatusError, setBotStatusError] = useState("");
  const [restartingBot, setRestartingBot] = useState(false);
  const [restartMessage, setRestartMessage] = useState("");

  // New guild form
  const [newGuildId, setNewGuildId] = useState("");
  const [newGuildName, setNewGuildName] = useState("");

  // New channel form (per guild)
  const [addingChannelToGuild, setAddingChannelToGuild] = useState<number | null>(null);
  const [newChannelId, setNewChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDivision, setNewChannelDivision] = useState<number | null>(null);
  const [newChannelPurpose, setNewChannelPurpose] = useState<"both" | "draft" | "match">("both");

  // Edit channel form
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editChannelId, setEditChannelId] = useState("");
  const [editChannelName, setEditChannelName] = useState("");
  const [editChannelDivision, setEditChannelDivision] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
    fetchBotStatus();
  }, []);

  async function fetchBotStatus(): Promise<BotStatus | null> {
    try {
      const response = await fetch("/api/admin/discord-bot/restart", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load bot status.");
      }
      setBotStatus(data);
      setBotStatusError("");
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load bot status.";
      setBotStatusError(message);
      return null;
    }
  }

  async function restartBot() {
    if (!confirm("Restart the Discord bot now? The website will stay online.")) return;

    setRestartingBot(true);
    setRestartMessage("Requesting restart…");
    try {
      const response = await fetch("/api/admin/discord-bot/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "The bot restart failed.");
      }

      setRestartMessage("Restart requested. Waiting for the bot to return…");
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const nextStatus = await fetchBotStatus();
        if (nextStatus?.running && nextStatus.pid !== data.previousPid) {
          setRestartMessage("Discord bot restarted successfully.");
          return;
        }
      }
      setRestartMessage("Restart requested, but the new bot process has not appeared yet. Check again shortly.");
    } catch (error) {
      setRestartMessage(error instanceof Error ? error.message : "The bot restart failed.");
    } finally {
      setRestartingBot(false);
    }
  }

  async function fetchData(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const [guildsRes, divisionsRes] = await Promise.all([
        fetch("/api/discord?type=guilds"),
        fetch("/api/discord?type=divisions"),
      ]);

      if (guildsRes.ok) {
        const data = await guildsRes.json();
        setGuilds(data);
      }

      if (divisionsRes.ok) {
        const data = await divisionsRes.json();
        setDivisions(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  // Refetch without showing loading state (preserves scroll)
  function refetchData() {
    fetchData(false);
  }

  async function addGuild(e: React.FormEvent) {
    e.preventDefault();
    if (!newGuildId || !newGuildName) return;

    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addGuild",
          guildId: newGuildId,
          name: newGuildName,
        }),
      });

      if (res.ok) {
        setNewGuildId("");
        setNewGuildName("");
        fetchData();
      }
    } catch (error) {
      console.error("Error adding guild:", error);
    }
  }

  async function deleteGuild(id: number) {
    if (!confirm("Delete this guild and all its channel mappings?")) return;

    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteGuild", id }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting guild:", error);
    }
  }

  async function addChannel(guildId: number) {
    if (!newChannelId || !newChannelDivision) return;

    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addChannel",
          guildId,
          channelId: newChannelId,
          channelName: newChannelName || null,
          divisionId: newChannelDivision,
          isDraftEnabled: newChannelPurpose === "draft" || newChannelPurpose === "both",
          isMatchReportEnabled: newChannelPurpose === "match" || newChannelPurpose === "both",
        }),
      });

      if (res.ok) {
        setAddingChannelToGuild(null);
        setNewChannelId("");
        setNewChannelName("");
        setNewChannelDivision(null);
        setNewChannelPurpose("both");
        fetchData();
      }
    } catch (error) {
      console.error("Error adding channel:", error);
    }
  }

  async function toggleMatch(channelId: number, currentValue: boolean) {
    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateChannel",
          id: channelId,
          isMatchReportEnabled: !currentValue,
        }),
      });

      if (res.ok) {
        refetchData();
      }
    } catch (error) {
      console.error("Error toggling match:", error);
    }
  }

  function startEditChannel(channel: Channel) {
    setEditingChannel(channel);
    setEditChannelId(channel.channelId);
    setEditChannelName(channel.channelName || "");
    setEditChannelDivision(channel.divisionId);
  }

  function cancelEditChannel() {
    setEditingChannel(null);
    setEditChannelId("");
    setEditChannelName("");
    setEditChannelDivision(null);
  }

  async function saveEditChannel() {
    if (!editingChannel || !editChannelId || !editChannelDivision) return;

    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateChannel",
          id: editingChannel.id,
          channelId: editChannelId,
          channelName: editChannelName || null,
          divisionId: editChannelDivision,
        }),
      });

      if (res.ok) {
        cancelEditChannel();
        fetchData();
      }
    } catch (error) {
      console.error("Error updating channel:", error);
    }
  }

  async function deleteChannel(id: number) {
    if (!confirm("Delete this channel mapping?")) return;

    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteChannel", id }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting channel:", error);
    }
  }

  async function toggleDraft(channelId: number, currentValue: boolean) {
    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggleDraft",
          id: channelId,
          enabled: !currentValue,
        }),
      });

      if (res.ok) {
        refetchData();
      }
    } catch (error) {
      console.error("Error toggling draft:", error);
    }
  }

  async function toggleSchedule(channelId: number, currentValue: boolean) {
    try {
      const res = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateChannel",
          id: channelId,
          isScheduleEnabled: !currentValue,
        }),
      });

      if (res.ok) {
        refetchData();
      }
    } catch (error) {
      console.error("Error toggling schedule:", error);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-[var(--foreground-muted)]">
        Loading Discord configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Discord Bot Configuration</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Discord Bot Status</CardTitle>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Restart only the Discord bot process. The website and database remain online.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={restartBot}
            disabled={restartingBot || !botStatus?.running}
          >
            {restartingBot ? "Restarting…" : "Restart Bot"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                botStatus?.running ? "bg-emerald-400" : "bg-red-400"
              }`}
              aria-hidden="true"
            />
            <span className="font-semibold">
              {botStatus?.running
                ? "Online"
                : botStatus?.configured
                  ? "Offline"
                  : "Not configured"}
            </span>
            {botStatus?.pid && (
              <span className="font-mono text-xs text-[var(--foreground-muted)]">
                PID {botStatus.pid}
              </span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => fetchBotStatus()}>
              Refresh Status
            </Button>
          </div>
          {(restartMessage || botStatusError) && (
            <p
              className="mt-3 text-sm text-[var(--foreground-muted)]"
              role="status"
              aria-live="polite"
            >
              {restartMessage || botStatusError}
            </p>
          )}
          {botStatus && !botStatus.supervised && botStatus.configured && (
            <p className="mt-3 text-sm text-amber-300">
              Bot supervision is unavailable until the updated startup script is deployed.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[var(--foreground-muted)]">
          <p>
            <strong>1. Enable Developer Mode in Discord:</strong> Go to Settings → Advanced → Enable Developer Mode
          </p>
          <p>
            <strong>2. Get Guild ID:</strong> Right-click your server icon → Copy Server ID
          </p>
          <p>
            <strong>3. Get Channel ID:</strong> Right-click the channel → Copy Channel ID
          </p>
          <p>
            <strong>4. Map channels to divisions:</strong> Each channel can only be mapped to one division
          </p>
        </CardContent>
      </Card>

      {/* Add New Guild */}
      <Card>
        <CardHeader>
          <CardTitle>Add Discord Server</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addGuild} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="guildId">Server ID</Label>
              <Input
                id="guildId"
                value={newGuildId}
                onChange={(e) => setNewGuildId(e.target.value)}
                placeholder="e.g., 123456789012345678"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="guildName">Server Name</Label>
              <Input
                id="guildName"
                value={newGuildName}
                onChange={(e) => setNewGuildName(e.target.value)}
                placeholder="e.g., PBO League"
              />
            </div>
            <Button type="submit" disabled={!newGuildId || !newGuildName}>
              Add Server
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Guild List */}
      {guilds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-[var(--foreground-muted)]">
            No Discord servers configured yet. Add one above to get started.
          </CardContent>
        </Card>
      ) : (
        guilds.map((guild) => (
          <Card key={guild.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                <span>{guild.name}</span>
                <span className="text-sm font-normal text-[var(--foreground-muted)]">
                  ({guild.guildId})
                </span>
              </CardTitle>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteGuild(guild.id)}
              >
                Delete
              </Button>
            </CardHeader>
            <CardContent>
              {/* Channel Mappings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm">Channel Mappings</h4>
                  {addingChannelToGuild !== guild.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingChannelToGuild(guild.id)}
                    >
                      + Add Channel
                    </Button>
                  )}
                </div>

                {/* Add Channel Form */}
                {addingChannelToGuild === guild.id && (
                  <div className="flex flex-wrap gap-4 items-end p-4 bg-[var(--background-secondary)] rounded-lg">
                    <div className="flex-1 min-w-[150px]">
                      <Label htmlFor="channelId">Channel ID</Label>
                      <Input
                        id="channelId"
                        value={newChannelId}
                        onChange={(e) => setNewChannelId(e.target.value)}
                        placeholder="123456789012345678"
                      />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <Label htmlFor="channelName">Channel Name (optional)</Label>
                      <Input
                        id="channelName"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        placeholder="#sunset-draft"
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <Label htmlFor="division">Division</Label>
                      <Select
                        id="division"
                        value={newChannelDivision?.toString() || ""}
                        onChange={(e) =>
                          setNewChannelDivision(parseInt(e.target.value) || null)
                        }
                      >
                        <option value="">Select division...</option>
                        {divisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.seasonName} - {d.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <Label htmlFor="purpose">Purpose</Label>
                      <Select
                        id="purpose"
                        value={newChannelPurpose}
                        onChange={(e) =>
                          setNewChannelPurpose(e.target.value as "both" | "draft" | "match")
                        }
                      >
                        <option value="both">Draft & Match</option>
                        <option value="draft">Draft Only</option>
                        <option value="match">Match Only</option>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => addChannel(guild.id)}
                        disabled={!newChannelId || !newChannelDivision}
                      >
                        Add
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAddingChannelToGuild(null);
                          setNewChannelId("");
                          setNewChannelName("");
                          setNewChannelDivision(null);
                          setNewChannelPurpose("both");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Channel List */}
                {guild.channels.length === 0 ? (
                  <p className="text-sm text-[var(--foreground-muted)] py-2">
                    No channels mapped yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--background-tertiary)]">
                    {guild.channels.map((channel) => (
                      <div key={channel.id}>
                        {editingChannel?.id === channel.id ? (
                          /* Edit Mode */
                          <div className="flex flex-wrap gap-4 items-end py-3 px-4 bg-[var(--background-secondary)] rounded-lg my-2">
                            <div className="flex-1 min-w-[150px]">
                              <Label>Channel ID</Label>
                              <Input
                                value={editChannelId}
                                onChange={(e) => setEditChannelId(e.target.value)}
                                placeholder="123456789012345678"
                              />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                              <Label>Channel Name</Label>
                              <Input
                                value={editChannelName}
                                onChange={(e) => setEditChannelName(e.target.value)}
                                placeholder="#channel-name"
                              />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                              <Label>Division</Label>
                              <Select
                                value={editChannelDivision?.toString() || ""}
                                onChange={(e) =>
                                  setEditChannelDivision(parseInt(e.target.value) || null)
                                }
                              >
                                <option value="">Select division...</option>
                                {divisions.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.seasonName} - {d.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={saveEditChannel}
                                disabled={!editChannelId || !editChannelDivision}
                              >
                                Save
                              </Button>
                              <Button variant="outline" onClick={cancelEditChannel}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* View Mode */
                          <div className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="font-medium">
                                  {channel.channelName || `#${channel.channelId}`}
                                </div>
                                <div className="text-xs text-[var(--foreground-muted)]">
                                  {channel.division?.season?.name} -{" "}
                                  {channel.division?.name}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {/* Draft Toggle */}
                              <button
                                onClick={() => toggleDraft(channel.id, channel.isDraftEnabled)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  channel.isDraftEnabled
                                    ? "bg-green-600 text-white"
                                    : "bg-gray-600 text-gray-300"
                                }`}
                              >
                                Draft {channel.isDraftEnabled ? "Active" : "Inactive"}
                              </button>
                              {/* Match Toggle */}
                              <button
                                onClick={() => toggleMatch(channel.id, channel.isMatchReportEnabled)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  channel.isMatchReportEnabled
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-600 text-gray-300"
                                }`}
                              >
                                Match {channel.isMatchReportEnabled ? "Active" : "Inactive"}
                              </button>
                              {/* Schedule Toggle */}
                              <button
                                onClick={() => toggleSchedule(channel.id, channel.isScheduleEnabled)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                  channel.isScheduleEnabled
                                    ? "bg-purple-600 text-white"
                                    : "bg-gray-600 text-gray-300"
                                }`}
                              >
                                Schedule {channel.isScheduleEnabled ? "Active" : "Inactive"}
                              </button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEditChannel(channel)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteChannel(channel.id)}
                                className="text-[var(--error)]"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
