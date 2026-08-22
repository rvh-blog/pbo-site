"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  EARNED_LOGO_FRAME_ITEMS,
  getDefaultLogoFrameColors,
  getLogoFrameStyle,
  isCustomizableLogoFrameSlug,
  isLogoFrameSlug,
  parseLogoFrameColors,
} from "@/lib/logo-frame-items";

// Glow color options
const GLOW_COLORS = {
  // Division colors
  stargazer: { name: "Stargazer", color: "#3b82f6", glow: "rgba(59, 130, 246, 0.6)" },
  sunset: { name: "Sunset", color: "#fb923c", glow: "rgba(251, 146, 60, 0.6)" },
  crystal: { name: "Crystal", color: "#c084fc", glow: "rgba(192, 132, 252, 0.6)" },
  neon: { name: "Neon", color: "#4ade80", glow: "rgba(74, 222, 128, 0.6)" },
  // Other cool colors
  gold: { name: "Gold", color: "#fbbf24", glow: "rgba(251, 191, 36, 0.6)" },
  ruby: { name: "Ruby", color: "#f43f5e", glow: "rgba(244, 63, 94, 0.6)" },
  cyan: { name: "Cyan", color: "#22d3ee", glow: "rgba(34, 211, 238, 0.6)" },
  pink: { name: "Pink", color: "#f472b6", glow: "rgba(244, 114, 182, 0.6)" },
  white: { name: "White", color: "#f8fafc", glow: "rgba(248, 250, 252, 0.5)" },
};

type GlowColorKey = keyof typeof GLOW_COLORS;
type ColorSelection = GlowColorKey | `#${string}`;
type StoreMobileSection = "buy" | "owned" | "colors" | "frames";

const COLOR_CUSTOMIZER_SLUGS = new Set(["team-name-glow", "row-background", "row-border"]);

interface StoreItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: number;
  category: string;
  maxPerUser: number | null;
}

interface Purchase {
  id: number;
  itemSlug: string;
  itemName: string;
  itemDescription: string;
  purchasedAt: string;
  expiresAt: string | null;
  isActive: boolean;
  glowColor?: string | null;
  bgColor?: string | null;
  borderColor?: string | null;
}

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  onBalanceChange: (newBalance: number) => void;
}

function PboCoinIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#facc15" />
      <circle cx="12" cy="12" r="8" fill="#f59e0b" opacity="0.55" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#fde68a" strokeWidth="1.5" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="11"
        fontWeight="900"
        fill="#713f12"
      >
        P
      </text>
    </svg>
  );
}

export function StoreModal({ isOpen, onClose, balance, onBalanceChange }: StoreModalProps) {
  const router = useRouter();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [inventory, setInventory] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [savingColor, setSavingColor] = useState(false);
  const [error, setError] = useState("");
  const [mobileSection, setMobileSection] = useState<StoreMobileSection>("buy");
  const [previewColors, setPreviewColors] = useState<Partial<Record<string, ColorSelection>>>({});

  const getDeactivatedPurchaseIds = (data: { deactivatedPurchaseId?: number | null; deactivatedPurchaseIds?: number[] }) => {
    const ids = new Set<number>();
    if (data.deactivatedPurchaseId) ids.add(data.deactivatedPurchaseId);
    for (const id of data.deactivatedPurchaseIds || []) ids.add(id);
    return ids;
  };

  // Fetch store items and inventory on open
  useEffect(() => {
    if (!isOpen) return;

    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, inventoryRes] = await Promise.all([
          fetch("/api/store"),
          fetch("/api/store/inventory"),
        ]);

        if (itemsRes.ok) {
          const data = await itemsRes.json();
          setItems(data.items || []);
        }

        if (inventoryRes.ok) {
          const data = await inventoryRes.json();
          setInventory(data.purchases || []);
          if (data.balance !== undefined) {
            onBalanceChange(data.balance);
          }
        }
      } catch (err) {
        console.error("Failed to fetch store data:", err);
        setError("Failed to load store");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only re-fetch when modal opens, not when onBalanceChange changes

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handlePurchase = async (itemSlug: string) => {
    setPurchasing(itemSlug);
    setError("");

    try {
      const res = await fetch("/api/store/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemSlug }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Purchase failed");
        return;
      }

      // Update balance and inventory
      onBalanceChange(data.newBalance);
      setInventory((prev) => {
        // If a mutually exclusive item was deactivated, update it locally.
        let updated = prev;
        const deactivatedPurchaseIds = getDeactivatedPurchaseIds(data);
        if (deactivatedPurchaseIds.size > 0) {
          updated = prev.map((p) =>
            deactivatedPurchaseIds.has(p.id) ? { ...p, isActive: false } : p
          );
        }
        return [
          {
            id: data.purchase.id,
            itemSlug: data.item.slug,
            itemName: data.item.name,
            itemDescription: "",
            purchasedAt: data.purchase.purchasedAt,
            expiresAt: data.purchase.expiresAt,
            isActive: data.purchase.isActive,
            glowColor: data.purchase.glowColor,
            bgColor: data.purchase.bgColor,
            borderColor: data.purchase.borderColor,
          },
          ...updated,
        ];
      });
      router.refresh();
    } catch {
      setError("Purchase failed. Please try again.");
    } finally {
      setPurchasing(null);
    }
  };

  const handleBgColorChange = async (color: ColorSelection) => {
    setSavingColor(true);
    setError("");

    try {
      const res = await fetch("/api/store/bg-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save color");
        return;
      }

      // Update inventory with new color
      setInventory((prev) =>
        prev.map((p) =>
          p.itemSlug === "row-background" ? { ...p, bgColor: color } : p
        )
      );
      router.refresh();
    } catch {
      setError("Failed to save color. Please try again.");
    } finally {
      setSavingColor(false);
    }
  };

  const handleBorderColorChange = async (color: ColorSelection) => {
    setSavingColor(true);
    setError("");

    try {
      const res = await fetch("/api/store/border-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save color");
        return;
      }

      // Update inventory with new color
      setInventory((prev) =>
        prev.map((p) =>
          p.itemSlug === "row-border" ? { ...p, borderColor: color } : p
        )
      );
      router.refresh();
    } catch {
      setError("Failed to save color. Please try again.");
    } finally {
      setSavingColor(false);
    }
  };

  const handleToggle = async (purchaseId: number, newState: boolean) => {
    setToggling(purchaseId);
    setError("");

    try {
      const res = await fetch("/api/store/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, isActive: newState }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Toggle failed");
        return;
      }

      // Update inventory and any item disabled by mutual exclusivity.
      const deactivatedPurchaseIds = getDeactivatedPurchaseIds(data);
      setInventory((prev) =>
        prev.map((p) => {
          if (p.id === purchaseId) {
            return { ...p, isActive: newState };
          }
          if (deactivatedPurchaseIds.has(p.id)) {
            return { ...p, isActive: false };
          }
          return p;
        })
      );
      router.refresh();
    } catch {
      setError("Failed to toggle item. Please try again.");
    } finally {
      setToggling(null);
    }
  };

  const handleGlowColorChange = async (color: ColorSelection) => {
    setSavingColor(true);
    setError("");

    try {
      const res = await fetch("/api/store/glow-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save color");
        return;
      }

      // Update inventory with new color
      setInventory((prev) =>
        prev.map((p) =>
          p.itemSlug === "team-name-glow" ? { ...p, glowColor: color } : p
        )
      );
      router.refresh();
    } catch {
      setError("Failed to save color. Please try again.");
    } finally {
      setSavingColor(false);
    }
  };

  const handleLogoFrameColorChange = async (
    itemSlug: string,
    colorIndex: number,
    color: string
  ) => {
    if (!isCustomizableLogoFrameSlug(itemSlug)) return;

    const purchase = getPurchase(itemSlug);
    if (!purchase) return;

    const currentColors =
      parseLogoFrameColors(purchase.borderColor) ||
      getDefaultLogoFrameColors(itemSlug);
    const nextColors = currentColors.map((currentColor, index) =>
      index === colorIndex ? color : currentColor
    );

    setSavingColor(true);
    setError("");

    try {
      const res = await fetch("/api/store/logo-frame-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemSlug, colors: nextColors }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save logo frame colors");
        return;
      }

      setInventory((prev) =>
        prev.map((p) =>
          p.itemSlug === itemSlug
            ? { ...p, borderColor: JSON.stringify(nextColors) }
            : p
        )
      );
      router.refresh();
    } catch {
      setError("Failed to save logo frame colors. Please try again.");
    } finally {
      setSavingColor(false);
    }
  };

  const isOwned = (itemSlug: string) =>
    inventory.some((p) => p.itemSlug === itemSlug);

  const getPurchase = (itemSlug: string) =>
    inventory.find((p) => p.itemSlug === itemSlug);

  const isCustomHexColor = (color: string | null | undefined): color is `#${string}` =>
    Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));

  const getColorValue = (color: ColorSelection) =>
    color in GLOW_COLORS ? GLOW_COLORS[color as GlowColorKey].color : color;

  const handlePreviewColorChange = (itemSlug: string, color: ColorSelection) => {
    setPreviewColors((prev) => ({ ...prev, [itemSlug]: color }));
  };

  const getPreviewColor = (itemSlug: string, savedColor?: string | null): ColorSelection => {
    const color = savedColor || previewColors[itemSlug] || "stargazer";
    return color in GLOW_COLORS || isCustomHexColor(color) ? (color as ColorSelection) : "stargazer";
  };

  const logoFrameItems = items.filter((item) => isLogoFrameSlug(item.slug));
  const earnedLogoFrameItems = EARNED_LOGO_FRAME_ITEMS.filter(
    (earnedItem) => !logoFrameItems.some((item) => item.slug === earnedItem.slug)
  ).map((item, index) => ({
    ...item,
    id: -1000 - index,
  }));
  const displayLogoFrameItems = [...logoFrameItems, ...earnedLogoFrameItems];
  const standardItems = items.filter((item) => !isLogoFrameSlug(item.slug));
  const purchasableStandardCount = standardItems.filter((item) => !isOwned(item.slug)).length;
  const ownedStandardCount = standardItems.filter(
    (item) => isOwned(item.slug) && !COLOR_CUSTOMIZER_SLUGS.has(item.slug)
  ).length;
  const colorCustomizerCount = standardItems.filter(
    (item) => isOwned(item.slug) && COLOR_CUSTOMIZER_SLUGS.has(item.slug)
  ).length;
  const mobileSectionHasItems =
    mobileSection === "buy"
      ? purchasableStandardCount > 0
      : mobileSection === "owned"
      ? ownedStandardCount > 0
      : mobileSection === "colors"
      ? colorCustomizerCount > 0
      : displayLogoFrameItems.length > 0;

  const mobileTabs: Array<{ id: StoreMobileSection; label: string; count: number }> = [
    { id: "buy", label: "Buy", count: purchasableStandardCount },
    { id: "owned", label: "Owned", count: ownedStandardCount },
    { id: "colors", label: "Colors", count: colorCustomizerCount },
    { id: "frames", label: "Frames", count: displayLogoFrameItems.length },
  ];

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop - covers full viewport */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="fixed inset-0 flex items-end justify-center pointer-events-none sm:items-start sm:overflow-y-auto sm:px-4 sm:pb-8 sm:pt-20">
        {/* Modal */}
        <div className="relative flex h-[100dvh] w-full flex-col bg-[var(--card)] border border-[var(--card-border)] shadow-2xl pointer-events-auto sm:h-auto sm:max-h-[calc(100dvh-7rem)] sm:max-w-7xl sm:rounded-xl">
        {/* Header */}
        <div className="p-4 pr-12 border-b border-[var(--card-border)] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h2 className="text-xl font-bold">PBO Store</h2>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30">
              <PboCoinIcon className="h-4 w-4" />
              <span className="text-sm font-bold text-[var(--accent)]">{balance}</span>
            </div>
          </div>
        </div>

        {!loading && items.length > 0 && (
          <div className="sm:hidden flex-shrink-0 border-b border-[var(--card-border)] bg-[var(--background-secondary)]">
            <div className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-thin">
              {mobileTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileSection(tab.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    mobileSection === tab.id
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground-muted)]"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      mobileSection === tab.id
                        ? "bg-white/20 text-white"
                        : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)]"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              {items.length === 0 ? (
                <p className="text-center text-[var(--foreground-muted)] py-8">
                  No items available yet. Check back soon!
                </p>
              ) : (
                <>
                  {!mobileSectionHasItems && (
                    <div className="sm:hidden rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-4 text-center">
                      <p className="text-sm font-medium">Nothing here yet</p>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Switch sections or check back after earning or buying more store items.
                      </p>
                    </div>
                  )}

                  {displayLogoFrameItems.length > 0 && (
                    <div className={`${mobileSection === "frames" ? "block" : "hidden"} p-4 rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] sm:block`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-slate-200/25 via-cyan-400/20 to-amber-300/25 text-cyan-200">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h8v8H8z" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Logo Frames</h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">
                              {logoFrameItems.filter((item) => isOwned(item.slug)).length}/{logoFrameItems.length} owned
                            </span>
                          </div>
                          <p className="text-sm text-[var(--foreground-muted)] mt-1">
                            Permanent logo cosmetics. Only one logo frame can be active at a time.
                          </p>

                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                            {displayLogoFrameItems.map((item) => {
                              const owned = isOwned(item.slug);
                              const purchase = getPurchase(item.slug);
                              const canAfford = balance >= item.price;
                              const isEarnedOnly = item.slug === "logo-frame-champion-gold";
                              const logoFrameColors = isCustomizableLogoFrameSlug(item.slug)
                                ? parseLogoFrameColors(purchase?.borderColor) ||
                                  getDefaultLogoFrameColors(item.slug)
                                : null;
                              const frameStyle = getLogoFrameStyle(item.slug, logoFrameColors);

                              return (
                                <div
                                  key={item.id}
                                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    purchase?.isActive
                                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                                      : owned
                                      ? "border-[var(--success)]/30 bg-[var(--success)]/5"
                                      : "border-[var(--card-border)] bg-[var(--background-tertiary)]/40"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 text-center">
                                    <p className="text-sm font-semibold leading-tight">{item.name.replace(" Logo Frame", "")}</p>
                                    <p className="mt-1 text-xs leading-snug text-[var(--foreground-muted)]">{item.description}</p>
                                  </div>

                                  <div className="shrink-0 flex flex-col items-center gap-2">
                                    <div
                                      className={`w-12 h-12 rounded-xl p-1.5 shrink-0 ${frameStyle.ringClass}`}
                                      style={"ringStyle" in frameStyle ? frameStyle.ringStyle : undefined}
                                    >
                                      <div
                                        className={`w-full h-full rounded-lg bg-[var(--background-secondary)] flex items-center justify-center ${frameStyle.innerClass}`}
                                      >
                                        <span className="text-[8px] font-bold text-white">LOGO</span>
                                      </div>
                                    </div>

                                    <div className="flex flex-col items-center gap-1.5">
                                      {purchase?.isActive ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">
                                          Active
                                        </span>
                                      ) : isEarnedOnly && owned ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300">
                                          Earned
                                        </span>
                                      ) : isEarnedOnly ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                                          Earned-only
                                        </span>
                                      ) : owned ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--success)]/20 text-[var(--success)]">
                                          Owned
                                        </span>
                                      ) : null}
                                      {isEarnedOnly && owned && purchase ? (
                                        <button
                                          onClick={() => handleToggle(purchase.id, !purchase.isActive)}
                                          disabled={toggling === purchase.id}
                                          className={`relative w-10 h-5 rounded-full transition-colors ${
                                            purchase.isActive
                                              ? "bg-[var(--success)]"
                                              : "bg-[var(--background-secondary)]"
                                          } ${toggling === purchase.id ? "opacity-50" : ""}`}
                                          title={purchase.isActive ? "Turn off" : "Make active"}
                                        >
                                          <span
                                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                              purchase.isActive ? "left-5" : "left-0.5"
                                            }`}
                                          />
                                        </button>
                                      ) : isEarnedOnly ? (
                                        <div className="text-center text-[10px] leading-tight text-[var(--foreground-muted)] max-w-20">
                                          Win a championship
                                        </div>
                                      ) : owned && purchase ? (
                                        <button
                                          onClick={() => handleToggle(purchase.id, !purchase.isActive)}
                                          disabled={toggling === purchase.id}
                                          className={`relative w-10 h-5 rounded-full transition-colors ${
                                            purchase.isActive
                                            ? "bg-[var(--success)]"
                                            : "bg-[var(--background-secondary)]"
                                          } ${toggling === purchase.id ? "opacity-50" : ""}`}
                                          title={purchase.isActive ? "Turn off" : "Make active"}
                                        >
                                          <span
                                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                              purchase.isActive ? "left-5" : "left-0.5"
                                            }`}
                                          />
                                        </button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          onClick={() => handlePurchase(item.slug)}
                                          disabled={!canAfford || purchasing === item.slug}
                                          className={`px-2.5 h-7 ${!canAfford ? "opacity-50 cursor-not-allowed" : ""}`}
                                        >
                                          {purchasing === item.slug ? (
                                            <span className="flex items-center gap-1">
                                              <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                              ...
                                            </span>
                                          ) : (
                                            <span className="flex items-center gap-1">
                                              <PboCoinIcon className="h-3.5 w-3.5" />
                                              {item.price}
                                            </span>
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {owned && purchase && isCustomizableLogoFrameSlug(item.slug) && logoFrameColors && (
                                    <div className="pt-2 border-t border-[var(--card-border)]">
                                      <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                                        Custom Colors
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {logoFrameColors.map((color, index) => (
                                          <label
                                            key={`${item.slug}-${index}`}
                                            className="flex items-center gap-1.5 text-[10px] text-[var(--foreground-muted)]"
                                          >
                                            <input
                                              type="color"
                                              value={color}
                                              disabled={savingColor}
                                              onChange={(event) =>
                                                handleLogoFrameColorChange(
                                                  item.slug,
                                                  index,
                                                  event.target.value
                                                )
                                              }
                                              className="h-7 w-8 rounded border border-[var(--card-border)] bg-transparent p-0.5"
                                            />
                                            {index + 1}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {standardItems.map((item) => {
                  const owned = isOwned(item.slug);
                  const purchase = getPurchase(item.slug);
                  const canAfford = balance >= item.price;
                  const isColorCustomizer = COLOR_CUSTOMIZER_SLUGS.has(item.slug);
                  const glowPreviewColor = getPreviewColor(item.slug, purchase?.glowColor);
                  const bgPreviewColor = getPreviewColor(item.slug, purchase?.bgColor);
                  const borderPreviewColor = getPreviewColor(item.slug, purchase?.borderColor);
                  const showOnMobile =
                    mobileSection === "buy"
                      ? !owned
                      : mobileSection === "owned"
                      ? owned && !isColorCustomizer
                      : mobileSection === "colors"
                      ? owned && isColorCustomizer
                      : false;

                  return (
                    <div
                      key={item.id}
                      className={`${showOnMobile ? "block" : "hidden"} p-4 rounded-lg border sm:block ${
                        owned
                          ? "border-[var(--success)]/30 bg-[var(--success)]/5"
                          : "border-[var(--card-border)] bg-[var(--background-secondary)]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Item Icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          item.slug === "blue-team"
                            ? "bg-blue-500/20 text-blue-400"
                            : item.slug === "red-team"
                            ? "bg-red-500/20 text-red-400"
                            : item.slug === "team-name-glow"
                            ? "bg-gradient-to-br from-purple-500/30 to-pink-500/30 text-purple-300"
                            : item.slug === "row-background"
                            ? "bg-gradient-to-br from-cyan-500/30 to-blue-500/30 text-cyan-300"
                            : item.slug === "row-border"
                            ? "bg-gradient-to-br from-amber-500/30 to-orange-500/30 text-amber-300"
                            : item.slug === "victory-animation"
                            ? "bg-gradient-to-br from-yellow-500/30 to-green-500/30 text-yellow-300"
                            : item.slug === "mister-moneybags"
                            ? "bg-gradient-to-br from-yellow-400/30 to-amber-600/30 text-yellow-400"
                            : isLogoFrameSlug(item.slug)
                            ? "bg-gradient-to-br from-slate-200/25 via-cyan-400/20 to-amber-300/25 text-cyan-200"
                            : item.category === "visibility"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-[var(--primary)]/20 text-[var(--primary)]"
                        }`}>
                          {item.slug === "blue-team" ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                            </svg>
                          ) : item.slug === "red-team" ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                            </svg>
                          ) : item.slug === "team-name-glow" ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                          ) : item.slug === "row-background" ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                          ) : item.slug === "row-border" ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                          ) : item.slug === "victory-animation" ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                            </svg>
                          ) : item.slug === "mister-moneybags" ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" />
                            </svg>
                          ) : isLogoFrameSlug(item.slug) ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h8v8H8z" />
                            </svg>
                          ) : item.category === "visibility" ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                          )}
                        </div>

                        {/* Item Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{item.name}</h3>
                            {owned && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--success)]/20 text-[var(--success)]">
                                Owned
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[var(--foreground-muted)] mt-1">
                            {item.description}
                          </p>

                          {/* Showcase Slot Explainer */}
                          {item.slug === "showcase-slot" && (
                            <div className="mt-2 p-2 rounded bg-[var(--background-tertiary)]/50 text-xs text-[var(--foreground-muted)]">
                              <p className="font-medium text-[var(--foreground)] mb-1">Type Display Rules:</p>
                              <ul className="space-y-0.5 list-disc list-inside">
                                <li>The top three trainers display their two most-used types for free</li>
                                <li>Ranks 4–5 display their most-used type</li>
                                <li>Ranks 6+ display &quot;Normal&quot; by default</li>
                                <li className="text-purple-400">With this upgrade, display your two most-used types at any rank</li>
                              </ul>
                            </div>
                          )}

                          {/* PBO Whale Badge Preview */}
                          {item.slug === "mister-moneybags" && (
                            <div className="mt-2 p-3 rounded bg-[var(--background-tertiary)]/50">
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Badge Preview</p>
                              <div className="flex items-center gap-3">
                                <img
                                  src="/images/divisions/whale-badge3.png"
                                  alt="PBO Whale Badge"
                                  className="w-16 h-16 object-contain drop-shadow-[0_2px_4px_rgba(255,215,0,0.3)]"
                                />
                                <p className="text-xs text-[var(--foreground-muted)]">
                                  Displayed on your coach profile alongside your championship badges
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Logo Frame Preview */}
                          {isLogoFrameSlug(item.slug) && (
                            <div className="mt-2 p-3 rounded bg-[var(--background-tertiary)]/50">
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Frame Preview</p>
                              <div className="flex items-center gap-3">
                                {(() => {
                                  const frameStyle = getLogoFrameStyle(item.slug);
                                  return (
                                    <div className={`w-16 h-16 rounded-xl p-1.5 ${frameStyle.ringClass}`}>
                                      <div className={`w-full h-full rounded-lg bg-[var(--background-secondary)] flex items-center justify-center ${frameStyle.innerClass}`}>
                                        <span className="text-[10px] font-bold text-white">LOGO</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <p className="text-xs text-[var(--foreground-muted)]">
                                  Logo frames are permanent purchases. Turning one on will turn your other logo frames off.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Team Name Glow Color Selector */}
                          {item.slug === "team-name-glow" && (
                            <div className="mt-3 p-3 rounded-lg bg-[var(--background-tertiary)]/50">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-medium text-[var(--foreground)]">
                                  {owned ? "Select Glow Color:" : "Preview Glow Color:"}
                                </p>
                                {owned && savingColor && (
                                  <div className="animate-spin h-3 w-3 border-2 border-purple-400 border-t-transparent rounded-full" />
                                )}
                              </div>

                              {/* Division Colors */}
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Division Colors</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(["stargazer", "sunset", "crystal", "neon"] as GlowColorKey[]).map((colorKey) => {
                                  const colorData = GLOW_COLORS[colorKey];
                                  const isSelected = glowPreviewColor === colorKey;
                                  return (
                                    <button
                                      key={colorKey}
                                      onClick={() =>
                                        owned && purchase
                                          ? handleGlowColorChange(colorKey)
                                          : handlePreviewColorChange(item.slug, colorKey)
                                      }
                                      disabled={owned && savingColor}
                                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isSelected
                                          ? "ring-2 ring-offset-2 ring-offset-[var(--background-secondary)]"
                                          : "hover:scale-105"
                                      }`}
                                      style={{
                                        backgroundColor: `${colorData.color}20`,
                                        color: colorData.color,
                                        boxShadow: isSelected ? `0 0 12px ${colorData.glow}` : undefined,
                                        outline: isSelected ? `2px solid ${colorData.color}` : undefined,
                                      }}
                                    >
                                      {colorData.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Other Colors */}
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Other Colors</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(["gold", "ruby", "cyan", "pink", "white"] as GlowColorKey[]).map((colorKey) => {
                                  const colorData = GLOW_COLORS[colorKey];
                                  const isSelected = glowPreviewColor === colorKey;
                                  return (
                                    <button
                                      key={colorKey}
                                      onClick={() =>
                                        owned && purchase
                                          ? handleGlowColorChange(colorKey)
                                          : handlePreviewColorChange(item.slug, colorKey)
                                      }
                                      disabled={owned && savingColor}
                                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isSelected
                                          ? "ring-2 ring-offset-2 ring-offset-[var(--background-secondary)]"
                                          : "hover:scale-105"
                                      }`}
                                      style={{
                                        backgroundColor: `${colorData.color}20`,
                                        color: colorData.color,
                                        boxShadow: isSelected ? `0 0 12px ${colorData.glow}` : undefined,
                                        outline: isSelected ? `2px solid ${colorData.color}` : undefined,
                                      }}
                                    >
                                      {colorData.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Custom Color */}
                              <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Custom Color</p>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={isCustomHexColor(glowPreviewColor) ? glowPreviewColor : getColorValue(glowPreviewColor)}
                                    onChange={(event) => {
                                      const color = event.target.value as `#${string}`;
                                      if (owned && purchase) {
                                        handleGlowColorChange(color);
                                      } else {
                                        handlePreviewColorChange(item.slug, color);
                                      }
                                    }}
                                    disabled={owned && savingColor}
                                    className="h-9 w-12 rounded border border-[var(--card-border)] bg-transparent p-0.5"
                                    aria-label="Custom team name glow color"
                                  />
                                  <input
                                    type="text"
                                    value={isCustomHexColor(glowPreviewColor) ? glowPreviewColor : getColorValue(glowPreviewColor)}
                                    onChange={(event) => {
                                      const value = event.target.value.trim();
                                      if (!isCustomHexColor(value)) {
                                        handlePreviewColorChange(item.slug, value.startsWith("#") ? (value as `#${string}`) : glowPreviewColor);
                                        return;
                                      }
                                      if (owned && purchase) {
                                        handleGlowColorChange(value);
                                      } else {
                                        handlePreviewColorChange(item.slug, value);
                                      }
                                    }}
                                    disabled={owned && savingColor}
                                    className="w-28 rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-2 py-1.5 text-xs font-mono text-white"
                                    aria-label="Custom team name glow hex color"
                                  />
                                </div>
                              </div>

                              {/* Preview */}
                              <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)]">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Preview</p>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="font-bold text-sm team-name-glow"
                                    style={{
                                      "--shimmer-color": getColorValue(glowPreviewColor),
                                    } as React.CSSProperties}
                                  >
                                    Your Team Name
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Row Background Color Selector */}
                          {item.slug === "row-background" && (
                            <div className="mt-3 p-3 rounded-lg bg-[var(--background-tertiary)]/50">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-medium text-[var(--foreground)]">
                                  {owned ? "Select Background Color:" : "Preview Background Color:"}
                                </p>
                                {owned && savingColor && (
                                  <div className="animate-spin h-3 w-3 border-2 border-cyan-400 border-t-transparent rounded-full" />
                                )}
                              </div>

                              {/* Division Colors */}
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Division Colors</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(["stargazer", "sunset", "crystal", "neon"] as GlowColorKey[]).map((colorKey) => {
                                  const colorData = GLOW_COLORS[colorKey];
                                  const isSelected = bgPreviewColor === colorKey;
                                  return (
                                    <button
                                      key={colorKey}
                                      onClick={() =>
                                        owned && purchase
                                          ? handleBgColorChange(colorKey)
                                          : handlePreviewColorChange(item.slug, colorKey)
                                      }
                                      disabled={owned && savingColor}
                                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isSelected
                                          ? "ring-2 ring-offset-2 ring-offset-[var(--background-secondary)]"
                                          : "hover:scale-105"
                                      }`}
                                      style={{
                                        backgroundColor: `${colorData.color}20`,
                                        color: colorData.color,
                                        boxShadow: isSelected ? `0 0 12px ${colorData.glow}` : undefined,
                                        outline: isSelected ? `2px solid ${colorData.color}` : undefined,
                                      }}
                                    >
                                      {colorData.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Other Colors */}
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Other Colors</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(["gold", "ruby", "cyan", "pink", "white"] as GlowColorKey[]).map((colorKey) => {
                                  const colorData = GLOW_COLORS[colorKey];
                                  const isSelected = bgPreviewColor === colorKey;
                                  return (
                                    <button
                                      key={colorKey}
                                      onClick={() =>
                                        owned && purchase
                                          ? handleBgColorChange(colorKey)
                                          : handlePreviewColorChange(item.slug, colorKey)
                                      }
                                      disabled={owned && savingColor}
                                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isSelected
                                          ? "ring-2 ring-offset-2 ring-offset-[var(--background-secondary)]"
                                          : "hover:scale-105"
                                      }`}
                                      style={{
                                        backgroundColor: `${colorData.color}20`,
                                        color: colorData.color,
                                        boxShadow: isSelected ? `0 0 12px ${colorData.glow}` : undefined,
                                        outline: isSelected ? `2px solid ${colorData.color}` : undefined,
                                      }}
                                    >
                                      {colorData.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Custom Color */}
                              <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Custom Color</p>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={isCustomHexColor(bgPreviewColor) ? bgPreviewColor : getColorValue(bgPreviewColor)}
                                    onChange={(event) => {
                                      const color = event.target.value as `#${string}`;
                                      if (owned && purchase) {
                                        handleBgColorChange(color);
                                      } else {
                                        handlePreviewColorChange(item.slug, color);
                                      }
                                    }}
                                    disabled={owned && savingColor}
                                    className="h-9 w-12 rounded border border-[var(--card-border)] bg-transparent p-0.5"
                                    aria-label="Custom row background color"
                                  />
                                  <input
                                    type="text"
                                    value={isCustomHexColor(bgPreviewColor) ? bgPreviewColor : getColorValue(bgPreviewColor)}
                                    onChange={(event) => {
                                      const value = event.target.value.trim();
                                      if (!isCustomHexColor(value)) {
                                        handlePreviewColorChange(item.slug, value.startsWith("#") ? (value as `#${string}`) : bgPreviewColor);
                                        return;
                                      }
                                      if (owned && purchase) {
                                        handleBgColorChange(value);
                                      } else {
                                        handlePreviewColorChange(item.slug, value);
                                      }
                                    }}
                                    disabled={owned && savingColor}
                                    className="w-28 rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-2 py-1.5 text-xs font-mono text-white"
                                    aria-label="Custom row background hex color"
                                  />
                                </div>
                              </div>

                              {/* Preview */}
                              <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)]">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Preview</p>
                                <div
                                  className="row-background rounded-lg p-3"
                                  style={{
                                    "--row-bg-color": getColorValue(bgPreviewColor),
                                  } as React.CSSProperties}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded bg-[var(--background-tertiary)]" />
                                    <span className="font-bold text-sm">Your Team Name</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Row Border Color Selector */}
                          {item.slug === "row-border" && (
                            <div className="mt-3 p-3 rounded-lg bg-[var(--background-tertiary)]/50">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-medium text-[var(--foreground)]">
                                  {owned ? "Select Border Color:" : "Preview Border Color:"}
                                </p>
                                {owned && savingColor && (
                                  <div className="animate-spin h-3 w-3 border-2 border-amber-400 border-t-transparent rounded-full" />
                                )}
                              </div>

                              {/* Division Colors */}
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Division Colors</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(["stargazer", "sunset", "crystal", "neon"] as GlowColorKey[]).map((colorKey) => {
                                  const colorData = GLOW_COLORS[colorKey];
                                  const isSelected = borderPreviewColor === colorKey;
                                  return (
                                    <button
                                      key={colorKey}
                                      onClick={() =>
                                        owned && purchase
                                          ? handleBorderColorChange(colorKey)
                                          : handlePreviewColorChange(item.slug, colorKey)
                                      }
                                      disabled={owned && savingColor}
                                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isSelected
                                          ? "ring-2 ring-offset-2 ring-offset-[var(--background-secondary)]"
                                          : "hover:scale-105"
                                      }`}
                                      style={{
                                        backgroundColor: `${colorData.color}20`,
                                        color: colorData.color,
                                        boxShadow: isSelected ? `0 0 12px ${colorData.glow}` : undefined,
                                        outline: isSelected ? `2px solid ${colorData.color}` : undefined,
                                      }}
                                    >
                                      {colorData.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Other Colors */}
                              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Other Colors</p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {(["gold", "ruby", "cyan", "pink", "white"] as GlowColorKey[]).map((colorKey) => {
                                  const colorData = GLOW_COLORS[colorKey];
                                  const isSelected = borderPreviewColor === colorKey;
                                  return (
                                    <button
                                      key={colorKey}
                                      onClick={() =>
                                        owned && purchase
                                          ? handleBorderColorChange(colorKey)
                                          : handlePreviewColorChange(item.slug, colorKey)
                                      }
                                      disabled={owned && savingColor}
                                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isSelected
                                          ? "ring-2 ring-offset-2 ring-offset-[var(--background-secondary)]"
                                          : "hover:scale-105"
                                      }`}
                                      style={{
                                        backgroundColor: `${colorData.color}20`,
                                        color: colorData.color,
                                        boxShadow: isSelected ? `0 0 12px ${colorData.glow}` : undefined,
                                        outline: isSelected ? `2px solid ${colorData.color}` : undefined,
                                      }}
                                    >
                                      {colorData.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Custom Color */}
                              <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Custom Color</p>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={isCustomHexColor(borderPreviewColor) ? borderPreviewColor : getColorValue(borderPreviewColor)}
                                    onChange={(event) => {
                                      const color = event.target.value as `#${string}`;
                                      if (owned && purchase) {
                                        handleBorderColorChange(color);
                                      } else {
                                        handlePreviewColorChange(item.slug, color);
                                      }
                                    }}
                                    disabled={owned && savingColor}
                                    className="h-9 w-12 rounded border border-[var(--card-border)] bg-transparent p-0.5"
                                    aria-label="Custom row border color"
                                  />
                                  <input
                                    type="text"
                                    value={isCustomHexColor(borderPreviewColor) ? borderPreviewColor : getColorValue(borderPreviewColor)}
                                    onChange={(event) => {
                                      const value = event.target.value.trim();
                                      if (!isCustomHexColor(value)) {
                                        handlePreviewColorChange(item.slug, value.startsWith("#") ? (value as `#${string}`) : borderPreviewColor);
                                        return;
                                      }
                                      if (owned && purchase) {
                                        handleBorderColorChange(value);
                                      } else {
                                        handlePreviewColorChange(item.slug, value);
                                      }
                                    }}
                                    disabled={owned && savingColor}
                                    className="w-28 rounded border border-[var(--card-border)] bg-[var(--background-secondary)] px-2 py-1.5 text-xs font-mono text-white"
                                    aria-label="Custom row border hex color"
                                  />
                                </div>
                              </div>

                              {/* Preview */}
                              <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)]">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Preview</p>
                                <div
                                  className="row-border rounded-lg p-3 bg-[var(--background-secondary)]"
                                  style={{
                                    "--row-border-color": getColorValue(borderPreviewColor),
                                  } as React.CSSProperties}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded bg-[var(--background-tertiary)]" />
                                    <span className="font-bold text-sm">Your Team Name</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Action Row */}
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
                              <PboCoinIcon className="h-3.5 w-3.5" />
                              <span className="font-bold">{item.price}</span>
                            </div>

                            {owned && purchase ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--foreground-muted)]">
                                  {purchase.isActive ? "Active" : "Inactive"}
                                </span>
                                <button
                                  onClick={() => handleToggle(purchase.id, !purchase.isActive)}
                                  disabled={toggling === purchase.id}
                                  className={`relative w-10 h-5 rounded-full transition-colors ${
                                    purchase.isActive
                                      ? "bg-[var(--success)]"
                                      : "bg-[var(--background-tertiary)]"
                                  } ${toggling === purchase.id ? "opacity-50" : ""}`}
                                >
                                  <span
                                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                      purchase.isActive ? "left-5" : "left-0.5"
                                    }`}
                                  />
                                </button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handlePurchase(item.slug)}
                                disabled={!canAfford || purchasing === item.slug}
                                className={!canAfford ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                {purchasing === item.slug ? (
                                  <span className="flex items-center gap-2">
                                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                    Buying...
                                  </span>
                                ) : (
                                  "Buy"
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </>
              )}

              {/* Coming Soon */}
              <p className="text-center text-xs text-[var(--foreground-muted)] pt-4 border-t border-[var(--card-border)]">
                More items coming soon...
              </p>
            </div>
          )}
        </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--glass)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
