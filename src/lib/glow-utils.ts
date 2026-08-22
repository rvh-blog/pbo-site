import { db } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { coachPurchases, playoffMatches, seasonCoaches, storeItems } from "@/lib/schema";
import { CHAMPION_GOLD_LOGO_FRAME_SLUG, isLogoFrameSlug, parseLogoFrameColors } from "@/lib/logo-frame-items";

// Glow color definitions - keep in sync with store-modal.tsx and glow-color route
export const GLOW_COLORS: Record<string, { name: string; color: string; glow: string }> = {
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

export type GlowColorKey = keyof typeof GLOW_COLORS;

export const DEFAULT_COSMETIC_COLOR: GlowColorKey = "stargazer";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidCustomColor(color: string): boolean {
  return HEX_COLOR_PATTERN.test(color);
}

export function getCosmeticColorData(color: string | null | undefined): { name: string; color: string; glow: string } | null {
  if (!color) return null;

  const preset = GLOW_COLORS[color];
  if (preset) return preset;

  if (isValidCustomColor(color)) {
    return {
      name: "Custom",
      color,
      glow: `${color}99`,
    };
  }

  return null;
}

export interface GlowData {
  coachId: number;
  glowColor: string;
  colorData: { name: string; color: string; glow: string };
}

/**
 * Get glow data for a single coach
 */
export async function getCoachGlow(coachId: number): Promise<GlowData | null> {
  const glowItem = await db.query.storeItems.findFirst({
    where: eq(storeItems.slug, "team-name-glow"),
  });

  if (!glowItem) return null;

  const purchase = await db.query.coachPurchases.findFirst({
    where: and(
      eq(coachPurchases.coachId, coachId),
      eq(coachPurchases.itemId, glowItem.id),
      eq(coachPurchases.isActive, true)
    ),
  });

  if (!purchase) return null;

  const glowColor = purchase.glowColor || DEFAULT_COSMETIC_COLOR;
  const colorData = getCosmeticColorData(glowColor);
  if (!colorData) return null;

  return {
    coachId,
    glowColor,
    colorData,
  };
}

/**
 * Get glow data for multiple coaches at once (optimized batch fetch)
 */
export async function getCoachesGlow(coachIds: number[]): Promise<Map<number, GlowData>> {
  const result = new Map<number, GlowData>();

  if (coachIds.length === 0) return result;

  const glowItem = await db.query.storeItems.findFirst({
    where: eq(storeItems.slug, "team-name-glow"),
  });

  if (!glowItem) return result;

  const purchases = await db.query.coachPurchases.findMany({
    where: and(
      inArray(coachPurchases.coachId, coachIds),
      eq(coachPurchases.itemId, glowItem.id),
      eq(coachPurchases.isActive, true)
    ),
  });

  for (const purchase of purchases) {
    const glowColor = purchase.glowColor || DEFAULT_COSMETIC_COLOR;
    const colorData = getCosmeticColorData(glowColor);
    if (colorData) {
      result.set(purchase.coachId, {
        coachId: purchase.coachId,
        glowColor,
        colorData,
      });
    }
  }

  return result;
}

// Row Background types and functions
export interface RowBgData {
  coachId: number;
  bgColor: string;
  colorData: { name: string; color: string; glow: string };
}

/**
 * Get row background data for multiple coaches at once (optimized batch fetch)
 */
export async function getCoachesRowBg(coachIds: number[]): Promise<Map<number, RowBgData>> {
  const result = new Map<number, RowBgData>();

  if (coachIds.length === 0) return result;

  const bgItem = await db.query.storeItems.findFirst({
    where: eq(storeItems.slug, "row-background"),
  });

  if (!bgItem) return result;

  const purchases = await db.query.coachPurchases.findMany({
    where: and(
      inArray(coachPurchases.coachId, coachIds),
      eq(coachPurchases.itemId, bgItem.id),
      eq(coachPurchases.isActive, true)
    ),
  });

  for (const purchase of purchases) {
    const bgColor = purchase.bgColor || DEFAULT_COSMETIC_COLOR;
    const colorData = getCosmeticColorData(bgColor);
    if (colorData) {
      result.set(purchase.coachId, {
        coachId: purchase.coachId,
        bgColor,
        colorData,
      });
    }
  }

  return result;
}

/**
 * Get row background style for a coach
 */
export function getRowBgStyle(bgData?: RowBgData | null): React.CSSProperties | undefined {
  if (!bgData || !bgData.colorData) return undefined;

  return {
    "--row-bg-color": bgData.colorData.color,
  } as React.CSSProperties;
}

// Row Border types and functions
export interface RowBorderData {
  coachId: number;
  borderColor: string;
  colorData: { name: string; color: string; glow: string };
}

/**
 * Get row border data for multiple coaches at once (optimized batch fetch)
 */
export async function getCoachesRowBorder(coachIds: number[]): Promise<Map<number, RowBorderData>> {
  const result = new Map<number, RowBorderData>();

  if (coachIds.length === 0) return result;

  const borderItem = await db.query.storeItems.findFirst({
    where: eq(storeItems.slug, "row-border"),
  });

  if (!borderItem) return result;

  const purchases = await db.query.coachPurchases.findMany({
    where: and(
      inArray(coachPurchases.coachId, coachIds),
      eq(coachPurchases.itemId, borderItem.id),
      eq(coachPurchases.isActive, true)
    ),
  });

  for (const purchase of purchases) {
    const borderColor = purchase.borderColor || DEFAULT_COSMETIC_COLOR;
    const colorData = getCosmeticColorData(borderColor);
    if (colorData) {
      result.set(purchase.coachId, {
        coachId: purchase.coachId,
        borderColor,
        colorData,
      });
    }
  }

  return result;
}

/**
 * Get row border style for a coach
 */
export function getRowBorderStyle(borderData?: RowBorderData | null): React.CSSProperties | undefined {
  if (!borderData || !borderData.colorData) return undefined;

  return {
    "--row-border-color": borderData.colorData.color,
  } as React.CSSProperties;
}

/**
 * Combined result type for all cosmetics
 */
export interface AllCosmeticsResult {
  glow: Map<number, GlowData>;
  rowBg: Map<number, RowBgData>;
  rowBorder: Map<number, RowBorderData>;
  logoFrame: Map<number, LogoFrameData>;
}

export interface LogoFrameData {
  coachId: number;
  slug: string;
  colors: string[] | null;
}

/**
 * Fetch all cosmetic data (glow, row-bg, row-border) in just 2 queries
 * instead of 6 queries (2 per cosmetic type)
 */
export async function getAllCoachCosmetics(coachIds: number[]): Promise<AllCosmeticsResult> {
  const result: AllCosmeticsResult = {
    glow: new Map(),
    rowBg: new Map(),
    rowBorder: new Map(),
    logoFrame: new Map(),
  };

  if (coachIds.length === 0) return result;

  // Fetch all 3 store items in one query
  const storeItemsList = await db.query.storeItems.findMany({
    where: (items, { or, inArray, like }) =>
      or(
        inArray(items.slug, ["team-name-glow", "row-background", "row-border"]),
        like(items.slug, "logo-frame-%")
      ),
  });

  if (storeItemsList.length === 0) return result;

  // Build slug -> id map
  const slugToId = new Map<string, number>();
  for (const item of storeItemsList) {
    slugToId.set(item.slug, item.id);
  }

  const itemIds = storeItemsList.map(i => i.id);

  const [purchases, seasonCoachTeams] = await Promise.all([
    db.query.coachPurchases.findMany({
      where: and(
        inArray(coachPurchases.coachId, coachIds),
        inArray(coachPurchases.itemId, itemIds),
        eq(coachPurchases.isActive, true)
      ),
    }),
    db.query.seasonCoaches.findMany({
      where: inArray(seasonCoaches.coachId, coachIds),
      columns: {
        id: true,
        coachId: true,
      },
    }),
  ]);

  const seasonCoachIdToCoachId = new Map(
    seasonCoachTeams.map((team) => [team.id, team.coachId])
  );
  const seasonCoachIds = seasonCoachTeams.map((team) => team.id);
  const championCoachIds = new Set<number>();

  if (seasonCoachIds.length > 0) {
    const finalsWins = await db.query.playoffMatches.findMany({
      where: and(
        eq(playoffMatches.round, 3),
        inArray(playoffMatches.winnerId, seasonCoachIds)
      ),
      columns: {
        winnerId: true,
      },
    });

    for (const win of finalsWins) {
      if (!win.winnerId) continue;
      const coachId = seasonCoachIdToCoachId.get(win.winnerId);
      if (coachId) {
        championCoachIds.add(coachId);
      }
    }
  }

  // Process purchases into their respective maps
  const glowItemId = slugToId.get("team-name-glow");
  const rowBgItemId = slugToId.get("row-background");
  const rowBorderItemId = slugToId.get("row-border");
  const idToSlug = new Map(storeItemsList.map((item) => [item.id, item.slug]));

  for (const purchase of purchases) {
    if (purchase.itemId === glowItemId) {
      const glowColor = purchase.glowColor || DEFAULT_COSMETIC_COLOR;
      const colorData = getCosmeticColorData(glowColor);
      if (colorData) {
        result.glow.set(purchase.coachId, {
          coachId: purchase.coachId,
          glowColor,
          colorData,
        });
      }
    } else if (purchase.itemId === rowBgItemId) {
      const bgColor = purchase.bgColor || DEFAULT_COSMETIC_COLOR;
      const colorData = getCosmeticColorData(bgColor);
      if (colorData) {
        result.rowBg.set(purchase.coachId, {
          coachId: purchase.coachId,
          bgColor,
          colorData,
        });
      }
    } else if (purchase.itemId === rowBorderItemId) {
      const borderColor = purchase.borderColor || DEFAULT_COSMETIC_COLOR;
      const colorData = getCosmeticColorData(borderColor);
      if (colorData) {
        result.rowBorder.set(purchase.coachId, {
          coachId: purchase.coachId,
          borderColor,
          colorData,
        });
      }
    } else {
      const slug = idToSlug.get(purchase.itemId);
      if (slug && isLogoFrameSlug(slug)) {
        result.logoFrame.set(purchase.coachId, {
          coachId: purchase.coachId,
          slug,
          colors: parseLogoFrameColors(purchase.borderColor),
        });
      }
    }
  }

  for (const coachId of championCoachIds) {
    if (!result.logoFrame.has(coachId)) {
      result.logoFrame.set(coachId, {
        coachId,
        slug: CHAMPION_GOLD_LOGO_FRAME_SLUG,
        colors: null,
      });
    }
  }

  return result;
}
