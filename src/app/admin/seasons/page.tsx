"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface Division {
  id: number;
  name: string;
  logoUrl: string | null;
  seasonId: number;
}

interface Season {
  id: number;
  name: string;
  draftBudget: number;
  isCurrent: boolean;
  isPublic: boolean;
  divisions: Division[];
}

interface DraftBoardEntry {
  name: string;
  price: number;
  teraBanned: boolean;
  teraCaptainCost: number | null;
  complexBanReason: string | null;
}

export default function AdminSeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);

  // New season form state
  const [newSeason, setNewSeason] = useState({
    name: "",
    draftBudget: 100,
    isCurrent: false,
    isPublic: false,
    divisionNames: ["Stargazer", "Sunset", "Crystal", "Neon"],
  });
  const [newSeasonDraftBoard, setNewSeasonDraftBoard] = useState<DraftBoardEntry[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit season state
  const [editSeason, setEditSeason] = useState<Season | null>(null);
  const [editDraftBoard, setEditDraftBoard] = useState<DraftBoardEntry[]>([]);
  const [editCsvFileName, setEditCsvFileName] = useState("");
  const [editCsvError, setEditCsvError] = useState("");
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSeasons();
  }, []);

  async function fetchSeasons() {
    const response = await fetch("/api/seasons");
    const data = await response.json();
    setSeasons(data);
    setLoading(false);
  }

  function parseCSV(csvText: string): { entries: DraftBoardEntry[]; error: string | null } {
    try {
      const lines = csvText.trim().split("\n");
      if (lines.length < 2) {
        return { entries: [], error: "CSV must have a header row and at least one data row" };
      }

      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const nameIdx = header.findIndex((h) => h === "name" || h === "pokemon");
      const priceIdx = header.findIndex((h) => h === "price" || h === "cost");
      const teraBannedIdx = header.findIndex((h) => h === "tera_banned" || h === "terabanned" || h === "tera banned");
      const teraCaptainCostIdx = header.findIndex((h) => h === "tera_captain_cost" || h === "teracaptaincost" || h === "captain cost");
      const complexBanReasonIdx = header.findIndex((h) => h === "complex_ban_reason" || h === "complexbanreason" || h === "ban reason");

      if (nameIdx === -1) {
        return { entries: [], error: "CSV must have a 'name' or 'pokemon' column" };
      }
      if (priceIdx === -1) {
        return { entries: [], error: "CSV must have a 'price' or 'cost' column" };
      }

      const entries: DraftBoardEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0 || !values[nameIdx]?.trim()) continue;

        const name = values[nameIdx].trim();
        const price = parseInt(values[priceIdx]) || 0;
        const teraBanned = teraBannedIdx >= 0 ?
          (values[teraBannedIdx]?.toLowerCase() === "true" || values[teraBannedIdx] === "1") : false;
        const teraCaptainCost = teraCaptainCostIdx >= 0 && values[teraCaptainCostIdx]?.trim() ?
          parseInt(values[teraCaptainCostIdx]) : null;
        const complexBanReason = complexBanReasonIdx >= 0 ?
          values[complexBanReasonIdx]?.trim() || null : null;

        entries.push({ name, price, teraBanned, teraCaptainCost, complexBanReason });
      }

      return { entries, error: null };
    } catch (e) {
      return { entries: [], error: "Failed to parse CSV file" };
    }
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    setDraftBoard: (entries: DraftBoardEntry[]) => void,
    setFileName: (name: string) => void,
    setError: (error: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { entries, error } = parseCSV(text);
      if (error) {
        setError(error);
        setDraftBoard([]);
      } else {
        setError("");
        setDraftBoard(entries);
      }
    };
    reader.readAsText(file);
  }

  async function handleAddSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!newSeason.name.trim()) return;

    await fetch("/api/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newSeason,
        divisionNames: newSeason.divisionNames.filter((d) => d.trim()),
        draftBoard: newSeasonDraftBoard.length > 0 ? newSeasonDraftBoard : undefined,
      }),
    });

    setNewSeason({
      name: "",
      draftBudget: 100,
      isCurrent: false,
      isPublic: false,
      divisionNames: ["Stargazer", "Sunset", "Crystal", "Neon"],
    });
    setNewSeasonDraftBoard([]);
    setCsvFileName("");
    setCsvError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchSeasons();
  }

  async function handleUpdateSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!editSeason) return;

    await fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editSeason.id,
        name: editSeason.name,
        draftBudget: editSeason.draftBudget,
        isCurrent: editSeason.isCurrent,
        isPublic: editSeason.isPublic,
        draftBoard: editDraftBoard.length > 0 ? editDraftBoard : undefined,
      }),
    });

    setEditingId(null);
    setEditSeason(null);
    setEditDraftBoard([]);
    setEditCsvFileName("");
    setEditCsvError("");
    if (editFileInputRef.current) editFileInputRef.current.value = "";
    fetchSeasons();
  }

  async function handleTogglePublic(id: number, currentValue: boolean) {
    await fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isPublic: !currentValue }),
    });
    fetchSeasons();
  }

  async function handleSetCurrent(id: number) {
    await fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isCurrent: true }),
    });
    fetchSeasons();
  }

  async function handleDeleteSeason(id: number) {
    if (
      !confirm(
        "Are you sure you want to delete this season? This will delete all associated data including draft board, matches, and rosters."
      )
    )
      return;

    await fetch(`/api/seasons?id=${id}`, {
      method: "DELETE",
    });
    fetchSeasons();
  }

  function startEdit(season: Season) {
    setEditingId(season.id);
    setEditSeason({ ...season });
    setEditDraftBoard([]);
    setEditCsvFileName("");
    setEditCsvError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditSeason(null);
    setEditDraftBoard([]);
    setEditCsvFileName("");
    setEditCsvError("");
  }

  function updateDivisionName(index: number, value: string) {
    const newDivisions = [...newSeason.divisionNames];
    newDivisions[index] = value;
    setNewSeason({ ...newSeason, divisionNames: newDivisions });
  }

  function addDivision() {
    setNewSeason({
      ...newSeason,
      divisionNames: [
        ...newSeason.divisionNames,
        `Division ${String.fromCharCode(65 + newSeason.divisionNames.length)}`,
      ],
    });
  }

  function removeDivision(index: number) {
    const newDivisions = newSeason.divisionNames.filter((_, i) => i !== index);
    setNewSeason({ ...newSeason, divisionNames: newDivisions });
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manage Seasons</h1>
        <p className="text-[var(--foreground-muted)]">
          Create and manage league seasons, divisions, and draft boards
        </p>
      </div>

      {/* Add Season Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Season</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddSeason} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="name">Season Name</Label>
                <Input
                  id="name"
                  value={newSeason.name}
                  onChange={(e) =>
                    setNewSeason({ ...newSeason, name: e.target.value })
                  }
                  placeholder="e.g., Season 10"
                />
              </div>
              <div>
                <Label htmlFor="budget">Draft Budget</Label>
                <Input
                  id="budget"
                  type="number"
                  value={newSeason.draftBudget}
                  onChange={(e) =>
                    setNewSeason({
                      ...newSeason,
                      draftBudget: parseInt(e.target.value) || 100,
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2 justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSeason.isCurrent}
                    onChange={(e) =>
                      setNewSeason({
                        ...newSeason,
                        isCurrent: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[var(--primary)]"
                  />
                  <span>Set as current season</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSeason.isPublic}
                    onChange={(e) =>
                      setNewSeason({
                        ...newSeason,
                        isPublic: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[var(--primary)]"
                  />
                  <span>Visible to public</span>
                </label>
              </div>
            </div>

            <div>
              <Label>Divisions (in order of prestige)</Label>
              <div className="space-y-2">
                {newSeason.divisionNames.map((div, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <span className="text-sm text-[var(--foreground-muted)] w-6">
                      {index + 1}.
                    </span>
                    <Input
                      value={div}
                      onChange={(e) => updateDivisionName(index, e.target.value)}
                      placeholder={`Division ${index + 1}`}
                    />
                    {newSeason.divisionNames.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeDivision(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addDivision}>
                  + Add Division
                </Button>
              </div>
            </div>

            {/* CSV Upload Section */}
            <div className="p-4 rounded-lg bg-[var(--background-secondary)] space-y-3">
              <div>
                <Label>Draft Board (CSV Upload)</Label>
                <p className="text-sm text-[var(--foreground-muted)] mb-2">
                  Upload a CSV with columns: name, price, tera_banned, tera_captain_cost, complex_ban_reason
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) =>
                    handleFileUpload(e, setNewSeasonDraftBoard, setCsvFileName, setCsvError)
                  }
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose CSV File
                </Button>
                {csvFileName && (
                  <span className="text-sm">
                    {csvFileName} ({newSeasonDraftBoard.length} Pokemon)
                  </span>
                )}
              </div>
              {csvError && (
                <p className="text-sm text-[var(--error)]">{csvError}</p>
              )}
              {newSeasonDraftBoard.length > 0 && (
                <div className="text-sm text-[var(--foreground-muted)]">
                  Preview: {newSeasonDraftBoard.slice(0, 5).map((p) => p.name).join(", ")}
                  {newSeasonDraftBoard.length > 5 && ` and ${newSeasonDraftBoard.length - 5} more...`}
                </div>
              )}
            </div>

            <Button type="submit">Create Season</Button>
          </form>
        </CardContent>
      </Card>

      {/* Seasons List */}
      <Card>
        <CardHeader>
          <CardTitle>All Seasons ({seasons.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {seasons.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-4">
              No seasons yet. Create your first season above.
            </p>
          ) : (
            <div className="space-y-4">
              {seasons.map((season) => (
                <div
                  key={season.id}
                  className={`rounded-lg border overflow-hidden ${
                    season.isCurrent
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-[var(--card)] bg-[var(--background-secondary)]"
                  }`}
                >
                  {editingId === season.id && editSeason ? (
                    /* Edit Mode */
                    <form onSubmit={handleUpdateSeason} className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label>Season Name</Label>
                          <Input
                            value={editSeason.name}
                            onChange={(e) =>
                              setEditSeason({ ...editSeason, name: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label>Draft Budget</Label>
                          <Input
                            type="number"
                            value={editSeason.draftBudget}
                            onChange={(e) =>
                              setEditSeason({
                                ...editSeason,
                                draftBudget: parseInt(e.target.value) || 100,
                              })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2 justify-end">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editSeason.isCurrent}
                              onChange={(e) =>
                                setEditSeason({
                                  ...editSeason,
                                  isCurrent: e.target.checked,
                                })
                              }
                              className="w-4 h-4 accent-[var(--primary)]"
                            />
                            <span>Current season</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editSeason.isPublic}
                              onChange={(e) =>
                                setEditSeason({
                                  ...editSeason,
                                  isPublic: e.target.checked,
                                })
                              }
                              className="w-4 h-4 accent-[var(--primary)]"
                            />
                            <span>Visible to public</span>
                          </label>
                        </div>
                      </div>

                      {/* CSV Upload for Edit */}
                      <div className="p-3 rounded-lg bg-[var(--card)] space-y-2">
                        <Label>Update Draft Board (Optional)</Label>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Upload a new CSV to replace the existing draft board
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            ref={editFileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={(e) =>
                              handleFileUpload(
                                e,
                                setEditDraftBoard,
                                setEditCsvFileName,
                                setEditCsvError
                              )
                            }
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => editFileInputRef.current?.click()}
                          >
                            Choose CSV
                          </Button>
                          {editCsvFileName && (
                            <span className="text-sm">
                              {editCsvFileName} ({editDraftBoard.length} Pokemon)
                            </span>
                          )}
                        </div>
                        {editCsvError && (
                          <p className="text-sm text-[var(--error)]">{editCsvError}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button type="submit" size="sm">
                          Save Changes
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    /* View Mode */
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg">{season.name}</h3>
                            {season.isCurrent && (
                              <span className="px-2 py-0.5 text-xs rounded bg-[var(--primary)] text-white">
                                Current
                              </span>
                            )}
                            {!season.isPublic && (
                              <span className="px-2 py-0.5 text-xs rounded bg-[var(--warning)]/20 text-[var(--warning)]">
                                Hidden
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[var(--foreground-muted)]">
                            Budget: {season.draftBudget} points
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {season.divisions.map((div) => (
                              <span
                                key={div.id}
                                className="px-2 py-1 text-xs rounded bg-[var(--card)] text-[var(--foreground-muted)]"
                              >
                                {div.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTogglePublic(season.id, season.isPublic)}
                          >
                            {season.isPublic ? "Hide" : "Show"}
                          </Button>
                          {!season.isCurrent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSetCurrent(season.id)}
                            >
                              Set Current
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(season)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteSeason(season.id)}
                          >
                            Delete
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
