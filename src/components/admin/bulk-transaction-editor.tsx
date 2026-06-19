"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { PokemonAutocomplete, findPokemonMatch } from "./pokemon-autocomplete";

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl?: string | null;
}

interface RosterEntry {
  id: number;
  pokemonId: number;
  price: number;
  isTeraCaptain: boolean;
  pokemon: Pokemon;
}

interface FreeAgent extends Pokemon {
  price: number;
  teraCaptainCost: number | null;
  teraBanned: boolean;
}

interface BulkTransactionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  seasonId: number;
  divisionId: number;
  seasonCoachId: number;
  teamName: string;
  remainingBudget: number;
  faRemaining: number;
  currentRoster: RosterEntry[];
  freeAgents: FreeAgent[];
  seasonPrices: Map<number, { price: number; teraCaptainCost: number | null; teraBanned: boolean }>;
  onSave: () => void;
}

interface RosterSlot {
  originalRosterId: number | null; // Original roster entry ID (null if was empty)
  originalPokemonId: number | null;
  originalPokemonName: string;
  originalPrice: number;
  originalIsTeraCaptain: boolean;
  // Current state
  pokemonId: number | null;
  pokemonName: string;
  isTeraCaptain: boolean;
  hasWarning: boolean;
  warningText: string;
}

interface TransactionPreview {
  type: "drop" | "pickup" | "swap" | "tc_add" | "tc_remove" | "tc_swap";
  pokemonName: string;
  pokemonId: number | null;
  budgetChange: number;
  details?: string;
  /** TC transfer is bundled with a swap (doesn't cost an extra FA point) */
  tcTransferIncluded?: boolean;
}

export function BulkTransactionEditor({
  isOpen,
  onClose,
  seasonId,
  divisionId,
  seasonCoachId,
  teamName,
  remainingBudget,
  currentRoster,
  freeAgents,
  seasonPrices,
  faRemaining,
  onSave,
}: BulkTransactionEditorProps) {
  // Form state
  const [week, setWeek] = useState(0);
  const [countsAgainstLimit, setCountsAgainstLimit] = useState(true);

  // Roster slots (12 max)
  const [slots, setSlots] = useState<RosterSlot[]>([]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize slots from current roster
  useEffect(() => {
    if (isOpen) {
      const initialSlots: RosterSlot[] = Array(12)
        .fill(null)
        .map((_, i) => {
          const roster = currentRoster[i];
          if (roster) {
            return {
              originalRosterId: roster.id,
              originalPokemonId: roster.pokemonId,
              originalPokemonName: roster.pokemon?.displayName || roster.pokemon?.name || "",
              originalPrice: roster.price,
              originalIsTeraCaptain: roster.isTeraCaptain,
              pokemonId: roster.pokemonId,
              pokemonName: roster.pokemon?.displayName || roster.pokemon?.name || "",
              isTeraCaptain: roster.isTeraCaptain,
              hasWarning: false,
              warningText: "",
            };
          }
          return {
            originalRosterId: null,
            originalPokemonId: null,
            originalPokemonName: "",
            originalPrice: 0,
            originalIsTeraCaptain: false,
            pokemonId: null,
            pokemonName: "",
            isTeraCaptain: false,
            hasWarning: false,
            warningText: "",
          };
        });
      setSlots(initialSlots);
      setError(null);
    }
  }, [isOpen, currentRoster]);

  // All Pokemon for autocomplete (current roster + free agents)
  const allPokemon = useMemo(() => {
    const pokemonMap = new Map<number, Pokemon>();

    // Add current roster Pokemon
    for (const r of currentRoster) {
      if (r.pokemon) {
        pokemonMap.set(r.pokemonId, r.pokemon);
      }
    }

    // Add free agents
    for (const fa of freeAgents) {
      if (!pokemonMap.has(fa.id)) {
        pokemonMap.set(fa.id, fa);
      }
    }

    return Array.from(pokemonMap.values());
  }, [currentRoster, freeAgents]);

  // Diff-based transaction computation: compares overall before/after team state
  // (ignoring slot positions) to find the minimum-cost set of transactions.
  function computeOptimalTransactions(
    originalRoster: RosterEntry[],
    currentSlots: RosterSlot[],
    prices: Map<number, { price: number; teraCaptainCost: number | null; teraBanned: boolean }>
  ) {
    // Step 1: Build before/after sets keyed by pokemonId
    const originalMap = new Map<number, { rosterId: number; price: number; isTeraCaptain: boolean; name: string }>();
    for (const r of originalRoster) {
      originalMap.set(r.pokemonId, {
        rosterId: r.id,
        price: r.price,
        isTeraCaptain: r.isTeraCaptain,
        name: r.pokemon?.displayName || r.pokemon?.name || "",
      });
    }

    const newMap = new Map<number, { isTeraCaptain: boolean; name: string }>();
    for (const slot of currentSlots) {
      if (slot.pokemonId !== null) {
        newMap.set(slot.pokemonId, { isTeraCaptain: slot.isTeraCaptain, name: slot.pokemonName });
      }
    }

    // Derive dropped, picked up, kept
    const dropped: { pokemonId: number; rosterId: number; price: number; isTeraCaptain: boolean; name: string }[] = [];
    const kept: { pokemonId: number; rosterId: number; price: number; oldTC: boolean; newTC: boolean; name: string }[] = [];
    for (const [pokemonId, orig] of Array.from(originalMap)) {
      if (!newMap.has(pokemonId)) {
        dropped.push({ pokemonId, rosterId: orig.rosterId, price: orig.price, isTeraCaptain: orig.isTeraCaptain, name: orig.name });
      } else {
        const newEntry = newMap.get(pokemonId)!;
        kept.push({ pokemonId, rosterId: orig.rosterId, price: orig.price, oldTC: orig.isTeraCaptain, newTC: newEntry.isTeraCaptain, name: orig.name });
      }
    }

    const pickedUp: { pokemonId: number; isTeraCaptain: boolean; name: string }[] = [];
    for (const [pokemonId, entry] of Array.from(newMap)) {
      if (!originalMap.has(pokemonId)) {
        pickedUp.push({ pokemonId, isTeraCaptain: entry.isTeraCaptain, name: entry.name });
      }
    }

    // TC tracking: collect all TC removes and adds
    // From kept mons with TC changes
    const tcRemoved: { pokemonId: number; name: string; refund: number }[] = [];
    const tcAdded: { pokemonId: number; name: string; cost: number }[] = [];

    for (const k of kept) {
      if (k.oldTC && !k.newTC) {
        const tcCost = prices.get(k.pokemonId)?.teraCaptainCost || 0;
        tcRemoved.push({ pokemonId: k.pokemonId, name: k.name, refund: tcCost });
      } else if (!k.oldTC && k.newTC) {
        const tcCost = prices.get(k.pokemonId)?.teraCaptainCost || 0;
        tcAdded.push({ pokemonId: k.pokemonId, name: k.name, cost: tcCost });
      }
    }

    // From dropped mons that had TC — track them for pairing purposes but
    // DON'T add to tcRemoved, because roster.price already includes the TC cost.
    // The TC refund is already part of the drop refund.
    const droppedWithTC = dropped.filter(d => d.isTeraCaptain);
    const droppedWithoutTC = dropped.filter(d => !d.isTeraCaptain);

    // From picked-up mons that have TC
    const pickedUpWithTC = pickedUp.filter(p => p.isTeraCaptain);
    const pickedUpWithoutTC = pickedUp.filter(p => !p.isTeraCaptain);
    for (const p of pickedUpWithTC) {
      const tcCost = prices.get(p.pokemonId)?.teraCaptainCost || 0;
      tcAdded.push({ pokemonId: p.pokemonId, name: p.name, cost: tcCost });
    }

    // Step 2: Pair drops with pickups as swaps
    const txs: TransactionPreview[] = [];
    const swapSaveData: { dropRosterId: number; pickupPokemonId: number; isTeraCaptain: boolean }[] = [];
    const remainingDrops: typeof dropped = [];
    const remainingPickups: typeof pickedUp = [];

    // 2a: Pair TC-drop + TC-pickup first (free TC transfer)
    const unmatchedTCDrops = [...droppedWithTC];
    const unmatchedTCPickups = [...pickedUpWithTC];

    while (unmatchedTCDrops.length > 0 && unmatchedTCPickups.length > 0) {
      const drop = unmatchedTCDrops.shift()!;
      const pickup = unmatchedTCPickups.shift()!;

      const pickupPriceInfo = prices.get(pickup.pokemonId);
      const pickupCost = pickupPriceInfo?.price || 0;
      const tcCost = pickupPriceInfo?.teraCaptainCost || 0;

      // drop.price already includes TC cost (roster price = base + TC when acquired as TC)
      txs.push({
        type: "swap",
        pokemonName: `${drop.name} → ${pickup.name}`,
        pokemonId: pickup.pokemonId,
        budgetChange: drop.price - (pickupCost + tcCost),
        details: `+${drop.price} (drop+TC) -${pickupCost + tcCost} (pickup+TC)`,
        tcTransferIncluded: true,
      });
      swapSaveData.push({
        dropRosterId: drop.rosterId,
        pickupPokemonId: pickup.pokemonId,
        isTeraCaptain: true,
      });

      // Remove pickup TC from tcAdded since transfer is bundled with the swap
      const tcAddIdx = tcAdded.findIndex(t => t.pokemonId === pickup.pokemonId);
      if (tcAddIdx >= 0) tcAdded.splice(tcAddIdx, 1);
    }

    // Remaining unmatched TC drops/pickups go back to general pool
    remainingDrops.push(...unmatchedTCDrops, ...droppedWithoutTC);
    remainingPickups.push(...unmatchedTCPickups, ...pickedUpWithoutTC);

    // 2b: Pair remaining drops with remaining pickups
    while (remainingDrops.length > 0 && remainingPickups.length > 0) {
      const drop = remainingDrops.shift()!;
      const pickup = remainingPickups.shift()!;

      const pickupPriceInfo = prices.get(pickup.pokemonId);
      const pickupCost = pickupPriceInfo?.price || 0;

      txs.push({
        type: "swap",
        pokemonName: `${drop.name} → ${pickup.name}`,
        pokemonId: pickup.pokemonId,
        budgetChange: drop.price - pickupCost,
        details: `+${drop.price} (drop) -${pickupCost} (pickup)`,
      });
      swapSaveData.push({
        dropRosterId: drop.rosterId,
        pickupPokemonId: pickup.pokemonId,
        isTeraCaptain: false,
      });
    }

    // 2c: Leftover drops
    const dropSaveData: number[] = [];
    for (const drop of remainingDrops) {
      txs.push({
        type: "drop",
        pokemonName: drop.name,
        pokemonId: drop.pokemonId,
        budgetChange: drop.price,
      });
      dropSaveData.push(drop.rosterId);
    }

    // 2d: Leftover pickups
    const pickupSaveData: { pokemonId: number; isTeraCaptain: boolean }[] = [];
    for (const pickup of remainingPickups) {
      const pickupPriceInfo = prices.get(pickup.pokemonId);
      const pickupCost = pickupPriceInfo?.price || 0;

      txs.push({
        type: "pickup",
        pokemonName: pickup.name,
        pokemonId: pickup.pokemonId,
        budgetChange: -pickupCost,
      });
      // TC on standalone pickups is handled separately (already in tcAdded)
      pickupSaveData.push({ pokemonId: pickup.pokemonId, isTeraCaptain: false });
    }

    // Step 3: Pair remaining TC changes
    const tcSwapSaveData: { oldPokemonId: number; newPokemonId: number }[] = [];
    const tcChangeSaveData: { pokemonId: number; newStatus: boolean }[] = [];

    const tcPairedCount = Math.min(tcAdded.length, tcRemoved.length);
    for (let i = 0; i < tcPairedCount; i++) {
      const remove = tcRemoved[i];
      const add = tcAdded[i];
      txs.push({
        type: "tc_swap",
        pokemonName: `${remove.name} → ${add.name}`,
        pokemonId: add.pokemonId,
        budgetChange: remove.refund - add.cost,
        details: `+${remove.refund} (remove TC) -${add.cost} (add TC)`,
      });
      tcSwapSaveData.push({ oldPokemonId: remove.pokemonId, newPokemonId: add.pokemonId });
    }

    for (let i = tcPairedCount; i < tcRemoved.length; i++) {
      const remove = tcRemoved[i];
      txs.push({
        type: "tc_remove",
        pokemonName: remove.name,
        pokemonId: remove.pokemonId,
        budgetChange: remove.refund,
      });
      tcChangeSaveData.push({ pokemonId: remove.pokemonId, newStatus: false });
    }

    for (let i = tcPairedCount; i < tcAdded.length; i++) {
      const add = tcAdded[i];
      txs.push({
        type: "tc_add",
        pokemonName: add.name,
        pokemonId: add.pokemonId,
        budgetChange: -add.cost,
      });
      tcChangeSaveData.push({ pokemonId: add.pokemonId, newStatus: true });
    }

    return {
      previews: txs,
      saveData: {
        swaps: swapSaveData,
        drops: dropSaveData,
        pickups: pickupSaveData,
        tcSwaps: tcSwapSaveData,
        tcChanges: tcChangeSaveData,
      },
    };
  }

  // Calculate transactions from diff
  const optimalResult = useMemo(
    () => computeOptimalTransactions(currentRoster, slots, seasonPrices),
    [slots, currentRoster, seasonPrices]
  );
  const transactions = optimalResult.previews;

  // Calculate totals
  const totalBudgetChange = useMemo(() => {
    return transactions.reduce((sum, tx) => sum + tx.budgetChange, 0);
  }, [transactions]);

  // Get current team budget (sum of roster prices)
  const currentBudgetUsed = useMemo(() => {
    return currentRoster.reduce((sum, r) => sum + r.price, 0);
  }, [currentRoster]);

  // Has changes?
  const hasChanges = transactions.length > 0;

  if (!isOpen) return null;

  function handleSlotChange(
    slotIndex: number,
    pokemonId: number | null,
    pokemonName: string
  ) {
    const newSlots = [...slots];
    const slot = newSlots[slotIndex];

    // If clearing the slot, also clear TC
    if (!pokemonId) {
      newSlots[slotIndex] = {
        ...slot,
        pokemonId: null,
        pokemonName: "",
        isTeraCaptain: false,
        hasWarning: false,
        warningText: "",
      };
    } else {
      // Check if this Pokemon can be TC
      const priceInfo = seasonPrices.get(pokemonId);
      const canBeTC = priceInfo && !priceInfo.teraBanned && priceInfo.teraCaptainCost !== null;

      newSlots[slotIndex] = {
        ...slot,
        pokemonId,
        pokemonName,
        // If switching to a new Pokemon, reset TC (unless original was this pokemon with TC)
        isTeraCaptain: slot.originalPokemonId === pokemonId ? slot.originalIsTeraCaptain : false,
        hasWarning: pokemonName !== "" && !pokemonId,
        warningText: pokemonId ? "" : `No match for "${pokemonName}"`,
      };
    }

    setSlots(newSlots);
  }

  function handleTCChange(slotIndex: number, isTeraCaptain: boolean) {
    const newSlots = [...slots];
    newSlots[slotIndex] = {
      ...newSlots[slotIndex],
      isTeraCaptain,
    };
    setSlots(newSlots);
  }

  function handleMultiLinePaste(startIndex: number, lines: string[]) {
    const newSlots = [...slots];

    for (let i = 0; i < lines.length && startIndex + i < 12; i++) {
      const line = lines[i];
      const match = findPokemonMatch(line, allPokemon);
      const slot = newSlots[startIndex + i];

      newSlots[startIndex + i] = {
        ...slot,
        pokemonId: match?.id || null,
        pokemonName: match ? match.displayName || match.name : line,
        isTeraCaptain: false,
        hasWarning: line !== "" && !match,
        warningText: match ? "" : `No match for "${line}"`,
      };
    }

    setSlots(newSlots);
  }

  async function handleSave() {
    if (!hasChanges) {
      onClose();
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const { saveData } = computeOptimalTransactions(currentRoster, slots, seasonPrices);

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkFATransaction",
          seasonId,
          divisionId,
          seasonCoachId,
          week,
          countsAgainstLimit,
          swaps: saveData.swaps,
          drops: saveData.drops,
          pickups: saveData.pickups,
          tcSwaps: saveData.tcSwaps,
          tcChanges: saveData.tcChanges,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save transactions");
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  // Get price for display
  function getSlotPrice(slot: RosterSlot): number {
    if (!slot.pokemonId) return 0;
    const priceInfo = seasonPrices.get(slot.pokemonId);
    const basePrice = priceInfo?.price || 0;
    const tcCost = slot.isTeraCaptain && priceInfo?.teraCaptainCost ? priceInfo.teraCaptainCost : 0;
    return basePrice + tcCost;
  }

  // Check if Pokemon can be TC
  function canBeTC(pokemonId: number | null): boolean {
    if (!pokemonId) return false;
    const priceInfo = seasonPrices.get(pokemonId);
    return !!priceInfo && !priceInfo.teraBanned && priceInfo.teraCaptainCost !== null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-8">
      <div className="bg-[var(--background)] rounded-lg w-full max-w-[900px] max-h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--background-tertiary)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              Bulk Edit: {teamName}
            </h2>
            <p className="text-sm text-[var(--foreground-muted)]">
              Edit roster and preview transactions
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--foreground-muted)] hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Team Roster */}
          <div className="w-1/2 border-r border-[var(--background-tertiary)] flex flex-col">
            <div className="p-3 border-b border-[var(--background-tertiary)] bg-[var(--card)]">
              <h3 className="font-bold text-sm">Team Roster</h3>
              <p className="text-xs text-[var(--foreground-muted)]">Type to replace, clear to drop</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div>
                {slots.map((slot, i) => {
                  const isModified = slot.pokemonId !== slot.originalPokemonId ||
                                     slot.isTeraCaptain !== slot.originalIsTeraCaptain;
                  const slotCanBeTC = canBeTC(slot.pokemonId);
                  const price = getSlotPrice(slot);

                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-1 py-0.5 px-1 rounded ${
                        isModified ? "bg-[var(--primary)]/10 border border-[var(--primary)]/30" : ""
                      }`}
                    >
                      <span className="text-xs text-[var(--foreground-muted)] w-4 text-right">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <PokemonAutocomplete
                          value={slot.pokemonName}
                          pokemonId={slot.pokemonId}
                          allPokemon={allPokemon}
                          onChange={(id, name) => handleSlotChange(i, id, name)}
                          onMultiLinePaste={(lines) => handleMultiLinePaste(i, lines)}
                          hasWarning={slot.hasWarning}
                          warningText={slot.warningText}
                          placeholder="Type Pokemon name..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTCChange(i, !slot.isTeraCaptain)}
                        disabled={!slotCanBeTC}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                          slot.isTeraCaptain
                            ? "bg-[var(--accent)] text-black"
                            : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                        title={slot.isTeraCaptain ? "Remove TC" : "Make TC"}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2L2 12l10 10 10-10L12 2z" />
                        </svg>
                      </button>
                      <span className="text-xs text-[var(--foreground-muted)] w-8 text-right">
                        {price > 0 ? price : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Settings & Preview */}
          <div className="w-1/2 flex flex-col">
            {/* Settings */}
            <div className="p-3 border-b border-[var(--background-tertiary)] bg-[var(--card)]">
              <h3 className="font-bold text-sm mb-2">Transaction Settings</h3>
              <p className="text-xs text-[var(--warning)] mb-3 flex items-center gap-1">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Select the week when these transactions become ACTIVE (not the week they were requested)
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Week:</Label>
                  <Select
                    value={week.toString()}
                    onChange={(e) => setWeek(parseInt(e.target.value))}
                    className="w-20 text-sm py-1"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                      <option key={w} value={w}>W{w}</option>
                    ))}
                  </Select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={countsAgainstLimit}
                    onChange={(e) => setCountsAgainstLimit(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs">Counts against FA limit</span>
                </label>
                {!countsAgainstLimit && (
                  <span className="text-xs text-[var(--foreground-muted)] italic">(grace)</span>
                )}
              </div>
            </div>

            {/* Transaction Preview */}
            <div className="flex-1 overflow-y-auto p-3">
              <h3 className="font-bold text-sm mb-2">Transaction Preview</h3>
              {transactions.length === 0 ? (
                <p className="text-sm text-[var(--foreground-muted)] text-center py-8">
                  No changes made yet
                </p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded text-sm ${
                        tx.type === "drop" || tx.type === "tc_remove"
                          ? "bg-[var(--error)]/10 border border-[var(--error)]/30"
                          : tx.type === "pickup" || tx.type === "tc_add"
                          ? "bg-[var(--success)]/10 border border-[var(--success)]/30"
                          : "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`font-medium ${
                            tx.type === "drop" || tx.type === "tc_remove"
                              ? "text-[var(--error)]"
                              : tx.type === "pickup" || tx.type === "tc_add"
                              ? "text-[var(--success)]"
                              : "text-[var(--accent)]"
                          }`}>
                            {tx.type === "drop" && "Drop: "}
                            {tx.type === "pickup" && "Pickup: "}
                            {tx.type === "swap" && (tx.tcTransferIncluded ? "Swap + TC Transfer: " : "Swap: ")}
                            {tx.type === "tc_swap" && "TC Swap: "}
                            {tx.type === "tc_add" && "Add TC: "}
                            {tx.type === "tc_remove" && "Remove TC: "}
                          </span>
                          <span>{tx.pokemonName}</span>
                        </div>
                        <span className={`font-mono ${
                          tx.budgetChange > 0 ? "text-[var(--success)]" : tx.budgetChange < 0 ? "text-[var(--error)]" : ""
                        }`}>
                          {tx.budgetChange > 0 ? "+" : ""}{tx.budgetChange}
                        </span>
                      </div>
                      {tx.details && (
                        <p className="text-xs text-[var(--foreground-muted)] mt-1">{tx.details}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Budget Summary */}
            <div className="p-3 border-t border-[var(--background-tertiary)] bg-[var(--card)]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-[var(--foreground-muted)]">Current Budget:</span>
                <span className="font-mono text-sm">{remainingBudget} pts</span>
              </div>
              {hasChanges && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[var(--foreground-muted)]">Change:</span>
                    <span className={`font-mono text-sm ${
                      totalBudgetChange > 0 ? "text-[var(--success)]" : totalBudgetChange < 0 ? "text-[var(--error)]" : ""
                    }`}>
                      {totalBudgetChange > 0 ? "+" : ""}{totalBudgetChange} pts
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2 pt-1 border-t border-[var(--background-tertiary)]">
                    <span className="text-sm font-medium">New Budget:</span>
                    <span className={`font-mono font-bold ${
                      remainingBudget + totalBudgetChange < 0 ? "text-[var(--error)]" : "text-[var(--success)]"
                    }`}>
                      {remainingBudget + totalBudgetChange} pts
                    </span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)]">
                <div>
                  {transactions.filter(t => t.type === "drop").length > 0 && (
                    <span className="mr-3">{transactions.filter(t => t.type === "drop").length} drops</span>
                  )}
                  {transactions.filter(t => t.type === "pickup").length > 0 && (
                    <span className="mr-3">{transactions.filter(t => t.type === "pickup").length} pickups</span>
                  )}
                  {transactions.filter(t => t.type === "swap").length > 0 && (
                    <span className="mr-3">{transactions.filter(t => t.type === "swap").length} swaps</span>
                  )}
                  {transactions.filter(t => t.type === "tc_swap").length > 0 && (
                    <span className="mr-3">{transactions.filter(t => t.type === "tc_swap").length} TC swaps</span>
                  )}
                  {transactions.filter(t => t.type === "tc_add" || t.type === "tc_remove").length > 0 && (
                    <span>{transactions.filter(t => t.type === "tc_add" || t.type === "tc_remove").length} TC changes</span>
                  )}
                </div>
                {(() => {
                  const faPointsUsed = countsAgainstLimit ? transactions.filter(t =>
                    t.type === "pickup" || t.type === "swap" || t.type === "tc_swap" || t.type === "tc_add"
                  ).length : 0;
                  const remaining = faRemaining - faPointsUsed;
                  return (
                    <span className={`font-mono font-bold ${remaining < 0 ? "text-[var(--error)]" : remaining <= 1 ? "text-[var(--warning)]" : ""}`}>
                      FA: {remaining}/6
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--background-tertiary)] flex items-center justify-between shrink-0">
          <div>
            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
