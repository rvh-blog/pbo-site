"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface SheetSyncConfig {
  id: number;
  spreadsheetId: string;
  syncEnabled: boolean;
  syncMatchResultsEnabled: boolean;
  syncRostersTransactionsEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface Division {
  id: number;
  name: string;
  sheetSync: SheetSyncConfig | null;
}

interface Season {
  id: number;
  name: string;
  isCurrent: boolean;
  divisions: Division[];
}

interface SyncResult {
  divisionId: number;
  divisionName: string;
  success: boolean;
  rosterResult?: { teamsUpdated: number; errors: string[] };
  matchStatsResult?: { matchesUpdated: number; errors: string[] };
  transactionsResult?: { transactionsUpdated: number; errors: string[] };
  error?: string;
}

export default function AdminSheetsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [serviceAccountEmail, setServiceAccountEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingDivision, setSyncingDivision] = useState<number | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);

  // Edit form state
  const [editingDivision, setEditingDivision] = useState<number | null>(null);
  const [editSpreadsheetId, setEditSpreadsheetId] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sheet-sync");
      if (res.ok) {
        const data = await res.json();
        setSeasons(data.seasons);
        setServiceAccountEmail(data.serviceAccountEmail);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(divisionId: number, spreadsheetId: string) {
    try {
      const res = await fetch("/api/admin/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, spreadsheetId, syncEnabled: true }),
      });

      if (res.ok) {
        setEditingDivision(null);
        setEditSpreadsheetId("");
        fetchData();
      }
    } catch (error) {
      console.error("Error saving config:", error);
    }
  }

  async function toggleSync(divisionId: number, spreadsheetId: string, currentEnabled: boolean) {
    try {
      const res = await fetch("/api/admin/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId,
          spreadsheetId,
          syncEnabled: !currentEnabled,
        }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error toggling sync:", error);
    }
  }

  async function toggleSyncCategory(
    divisionId: number,
    spreadsheetId: string,
    category: "syncMatchResultsEnabled" | "syncRostersTransactionsEnabled",
    currentEnabled: boolean
  ) {
    try {
      const res = await fetch("/api/admin/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId,
          spreadsheetId,
          [category]: !currentEnabled,
        }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error toggling sync category:", error);
    }
  }

  async function removeConfig(divisionId: number) {
    if (!confirm("Remove sheet sync configuration for this division?")) return;

    try {
      const res = await fetch(`/api/admin/sheet-sync?divisionId=${divisionId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error removing config:", error);
    }
  }

  async function triggerSync(divisionId?: number) {
    if (divisionId) {
      setSyncingDivision(divisionId);
    } else {
      setSyncing(true);
    }
    setSyncResults(null);

    try {
      const res = await fetch("/api/admin/sheet-sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId }),
      });

      if (res.ok) {
        const data = await res.json();
        setSyncResults(data.results);
        fetchData(); // Refresh to show updated sync status
      }
    } catch (error) {
      console.error("Error triggering sync:", error);
    } finally {
      setSyncing(false);
      setSyncingDivision(null);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-[var(--foreground-muted)]">
        Loading sheet sync configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Google Sheets Sync</h1>
        <Button
          onClick={() => triggerSync()}
          disabled={syncing}
          className="bg-green-600 hover:bg-green-700"
        >
          {syncing ? "Syncing..." : "Sync All Divisions"}
        </Button>
      </div>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[var(--foreground-muted)]">
          <p>
            <strong>1. Share your Google Sheet</strong> with the service account email below (give Editor access):
          </p>
          <div className="flex items-center gap-2 p-3 bg-[var(--background-secondary)] rounded-lg">
            <code className="flex-1 text-[var(--foreground)]">{serviceAccountEmail}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(serviceAccountEmail)}
            >
              Copy
            </Button>
          </div>
          <p>
            <strong>2. Get your Sheet ID</strong> from the URL: <br />
            <code className="text-xs">https://docs.google.com/spreadsheets/d/<span className="text-yellow-400">SHEET_ID_HERE</span>/edit</code>
          </p>
          <p>
            <strong>3. Add a Config tab</strong> to your sheet with cell B2 set to TRUE/FALSE to enable/disable sync
          </p>
          <p>
            <strong>4. Configure each division</strong> below with its corresponding sheet ID
          </p>
        </CardContent>
      </Card>

      {/* Sync Results */}
      {syncResults && (
        <Card>
          <CardHeader>
            <CardTitle>Sync Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncResults.map((result) => (
                <div
                  key={result.divisionId}
                  className={`p-3 rounded-lg ${
                    result.success
                      ? "bg-green-900/30 border border-green-600"
                      : "bg-red-900/30 border border-red-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{result.divisionName}</span>
                    <span className={result.success ? "text-green-400" : "text-red-400"}>
                      {result.success ? "Success" : "Failed"}
                    </span>
                  </div>
                  {result.success && (
                    <div className="text-sm text-[var(--foreground-muted)] mt-1">
                      Rosters: {result.rosterResult?.teamsUpdated || 0} teams |
                      Transactions: {result.transactionsResult?.transactionsUpdated || 0} txs |
                      Match Stats: {result.matchStatsResult?.matchesUpdated || 0} matches
                    </div>
                  )}
                  {result.error && (
                    <div className="text-sm text-red-400 mt-1">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setSyncResults(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Divisions by Season */}
      {seasons.map((season) => (
        <Card key={season.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {season.name}
              {season.isCurrent && (
                <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded-full">
                  Current
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {season.divisions.map((division) => (
                <div
                  key={division.id}
                  className="p-4 bg-[var(--background-secondary)] rounded-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold">{division.name}</h4>
                    {division.sheetSync && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerSync(division.id)}
                          disabled={syncingDivision === division.id}
                        >
                          {syncingDivision === division.id ? "Syncing..." : "Sync Now"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {editingDivision === division.id ? (
                    /* Edit Mode */
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="flex-1 min-w-[300px]">
                        <Label>Google Sheet ID</Label>
                        <Input
                          value={editSpreadsheetId}
                          onChange={(e) => setEditSpreadsheetId(e.target.value)}
                          placeholder="1abc...xyz"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => saveConfig(division.id, editSpreadsheetId)}
                          disabled={!editSpreadsheetId}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingDivision(null);
                            setEditSpreadsheetId("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : division.sheetSync ? (
                    /* Configured */
                    <div className="space-y-3">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-[var(--foreground-muted)]">Sheet ID:</span>
                        <code className="text-xs bg-[var(--background-tertiary)] px-2 py-1 rounded">
                          {division.sheetSync.spreadsheetId}
                        </code>
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${division.sheetSync.spreadsheetId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline text-xs"
                        >
                          Open Sheet
                        </a>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() =>
                            toggleSync(
                              division.id,
                              division.sheetSync!.spreadsheetId,
                              division.sheetSync!.syncEnabled
                            )
                          }
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            division.sheetSync.syncEnabled
                              ? "bg-green-600 text-white"
                              : "bg-gray-600 text-gray-300"
                          }`}
                        >
                          Sync {division.sheetSync.syncEnabled ? "Enabled" : "Disabled"}
                        </button>
                        <span className="text-xs text-[var(--foreground-muted)]">
                          Last sync: {formatDate(division.sheetSync.lastSyncAt)}
                          {division.sheetSync.lastSyncStatus && (
                            <span
                              className={`ml-2 ${
                                division.sheetSync.lastSyncStatus === "success"
                                  ? "text-green-400"
                                  : division.sheetSync.lastSyncStatus === "disabled"
                                  ? "text-yellow-400"
                                  : "text-red-400"
                              }`}
                            >
                              ({division.sheetSync.lastSyncStatus})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wide">
                          Categories
                        </span>
                        <button
                          onClick={() =>
                            toggleSyncCategory(
                              division.id,
                              division.sheetSync!.spreadsheetId,
                              "syncRostersTransactionsEnabled",
                              division.sheetSync!.syncRostersTransactionsEnabled
                            )
                          }
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            division.sheetSync.syncRostersTransactionsEnabled
                              ? "bg-green-600 text-white"
                              : "bg-gray-600 text-gray-300"
                          }`}
                        >
                          Rosters & Transactions{" "}
                          {division.sheetSync.syncRostersTransactionsEnabled ? "On" : "Off"}
                        </button>
                        <button
                          onClick={() =>
                            toggleSyncCategory(
                              division.id,
                              division.sheetSync!.spreadsheetId,
                              "syncMatchResultsEnabled",
                              division.sheetSync!.syncMatchResultsEnabled
                            )
                          }
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            division.sheetSync.syncMatchResultsEnabled
                              ? "bg-green-600 text-white"
                              : "bg-gray-600 text-gray-300"
                          }`}
                        >
                          Match Results{" "}
                          {division.sheetSync.syncMatchResultsEnabled ? "On" : "Off"}
                        </button>
                      </div>
                      {division.sheetSync.lastSyncError && (
                        <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                          {division.sheetSync.lastSyncError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingDivision(division.id);
                            setEditSpreadsheetId(division.sheetSync!.spreadsheetId);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeConfig(division.id)}
                          className="text-[var(--error)]"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Not Configured */
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--foreground-muted)]">
                        No sheet configured
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingDivision(division.id);
                          setEditSpreadsheetId("");
                        }}
                      >
                        + Configure Sheet
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
