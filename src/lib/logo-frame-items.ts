export type LogoFrameItem = {
  slug: string;
  name: string;
  description: string;
  price: number;
  category: "logo_frame";
  maxPerUser: 1;
};

export const CHAMPION_GOLD_LOGO_FRAME_SLUG = "logo-frame-champion-gold";

export const LOGO_FRAME_ITEMS = [
  {
    slug: "logo-frame-classic-chrome",
    name: "Classic Chrome Logo Frame",
    description: "A clean chrome border for a polished team logo display.",
    price: 150,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-division",
    name: "Custom Colors Logo Frame",
    description: "A customizable frame where you choose the exact colors.",
    price: 400,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-pokeball",
    name: "Pokeball Ring Logo Frame",
    description: "A Pokeball-inspired ring that makes your logo feel match-ready.",
    price: 200,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-holo-rare",
    name: "Holo Rare Logo Frame",
    description: "A prismatic holographic frame with a rare-card shine.",
    price: 300,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-retro-pixel",
    name: "Retro Pixel Logo Frame",
    description: "A chunky pixel frame that fits the PBO retro interface.",
    price: 200,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-dark-elite",
    name: "Dark Mode Logo Frame",
    description: "A sleek dark frame with subtle elite-tier contrast.",
    price: 250,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-inferno",
    name: "Inferno Logo Frame",
    description: "A red and orange frame with a fiery glow.",
    price: 375,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-icy",
    name: "Icy Logo Frame",
    description: "A light blue frame with an icy glow.",
    price: 375,
    category: "logo_frame",
    maxPerUser: 1,
  },
  {
    slug: "logo-frame-chromatic-flow",
    name: "Chromatic Flow Logo Frame",
    description: "A continuously shifting rainbow gradient.",
    price: 375,
    category: "logo_frame",
    maxPerUser: 1,
  },
] as const satisfies readonly LogoFrameItem[];

export const EARNED_LOGO_FRAME_ITEMS = [
  {
    slug: CHAMPION_GOLD_LOGO_FRAME_SLUG,
    name: "Champion Gold Logo Frame",
    description: "Earned by winning a championship in any division.",
    price: 0,
    category: "logo_frame",
    maxPerUser: 1,
  },
] as const satisfies readonly LogoFrameItem[];

export type LogoFrameSlug =
  | (typeof LOGO_FRAME_ITEMS)[number]["slug"]
  | (typeof EARNED_LOGO_FRAME_ITEMS)[number]["slug"];

export const LOGO_FRAME_SLUGS = [
  ...LOGO_FRAME_ITEMS.map((item) => item.slug),
  ...EARNED_LOGO_FRAME_ITEMS.map((item) => item.slug),
];

export function isLogoFrameSlug(slug: string): slug is LogoFrameSlug {
  return LOGO_FRAME_SLUGS.includes(slug as LogoFrameSlug);
}

export const CUSTOMIZABLE_LOGO_FRAME_COLORS = {
  "logo-frame-division": ["#3b82f6", "#f97316", "#a855f7", "#22c55e"],
} as const;

export type CustomizableLogoFrameSlug = keyof typeof CUSTOMIZABLE_LOGO_FRAME_COLORS;

export function isCustomizableLogoFrameSlug(slug: string): slug is CustomizableLogoFrameSlug {
  return slug in CUSTOMIZABLE_LOGO_FRAME_COLORS;
}

export function getDefaultLogoFrameColors(slug: CustomizableLogoFrameSlug) {
  return [...CUSTOMIZABLE_LOGO_FRAME_COLORS[slug]];
}

export function parseLogoFrameColors(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const colors = parsed.filter(
      (color): color is string =>
        typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    );
    return colors.length > 0 ? colors : null;
  } catch {
    return null;
  }
}

export function getLogoFrameStyle(slug: string, customColors?: string[] | null) {
  switch (slug) {
    case "logo-frame-classic-chrome":
      return {
        ringClass: "bg-gradient-to-br from-slate-100 via-slate-400 to-slate-800",
        innerClass: "border border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
      };
    case "logo-frame-division":
      if (customColors?.length) {
        return {
          ringClass: "",
          ringStyle: {
            background: `conic-gradient(from 180deg, ${[...customColors, customColors[0]].join(", ")})`,
          },
          innerClass: "border border-white/25 shadow-[0_0_16px_rgba(59,130,246,0.35)]",
        };
      }
      return {
        ringClass: "bg-[conic-gradient(from_180deg,#3b82f6,#f97316,#a855f7,#22c55e,#3b82f6)]",
        innerClass: "border border-white/25 shadow-[0_0_16px_rgba(59,130,246,0.35)]",
      };
    case "logo-frame-pokeball":
      return {
        ringClass: "bg-[radial-gradient(circle_at_50%_50%,#ffffff_0_10%,#111827_10%_15%,transparent_15%),linear-gradient(180deg,#ef4444_0_44%,#111827_44%_56%,#f8fafc_56%_100%)]",
        innerClass: "border-2 border-slate-950 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.45)]",
      };
    case "logo-frame-holo-rare":
      return {
        ringClass: "bg-[conic-gradient(from_90deg,#f0abfc,#67e8f9,#bef264,#fde68a,#f0abfc)]",
        innerClass: "border border-white/45 shadow-[0_0_18px_rgba(103,232,249,0.45)]",
      };
    case "logo-frame-champion-gold":
      return {
        ringClass: "relative overflow-hidden bg-[radial-gradient(circle_at_16%_20%,rgba(255,255,255,0.75)_0_3px,transparent_5px),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.75)_0_2px,transparent_4px),radial-gradient(circle_at_74%_76%,rgba(255,255,255,0.75)_0_3px,transparent_5px),radial-gradient(circle_at_28%_84%,rgba(255,255,255,0.75)_0_2px,transparent_4px),linear-gradient(115deg,transparent_0_34%,rgba(255,255,255,0.65)_45%,transparent_56%),linear-gradient(to_bottom_right,#fef08a,#f59e0b,#a16207)] shadow-[0_0_20px_rgba(251,191,36,0.6),0_0_9px_rgba(255,255,255,0.5)]",
        innerClass: "border border-yellow-100/70 shadow-[0_0_18px_rgba(251,191,36,0.45)]",
      };
    case "logo-frame-retro-pixel":
      return {
        ringClass: "bg-slate-200",
        innerClass: "border-4 border-slate-950 shadow-[6px_6px_0_rgba(0,0,0,0.45)]",
      };
    case "logo-frame-dark-elite":
      return {
        ringClass: "bg-gradient-to-br from-zinc-950 via-slate-700 to-zinc-950",
        innerClass: "border border-violet-300/35 shadow-[0_0_18px_rgba(139,92,246,0.35)]",
      };
    case "logo-frame-inferno":
      return {
        ringClass: "bg-[radial-gradient(circle_at_25%_80%,#fde047_0_7%,transparent_22%),radial-gradient(circle_at_72%_74%,#fb923c_0_12%,transparent_28%),conic-gradient(from_210deg,#450a0a,#ef4444,#f97316,#facc15,#7f1d1d,#450a0a)] shadow-[0_0_22px_rgba(249,115,22,0.65),0_0_8px_rgba(239,68,68,0.65)]",
        innerClass: "border border-orange-100/45 shadow-[inset_0_0_8px_rgba(251,146,60,0.3)]",
      };
    case "logo-frame-icy":
      return {
        ringClass: "bg-[conic-gradient(from_45deg,#ecfeff,#67e8f9,#1d4ed8,#cffafe,#38bdf8,#f8fafc,#0e7490,#ecfeff)] shadow-[0_0_22px_rgba(103,232,249,0.65),inset_0_0_8px_rgba(255,255,255,0.75)]",
        innerClass: "border border-cyan-50/70 shadow-[inset_0_0_8px_rgba(207,250,254,0.45)]",
      };
    case "logo-frame-chromatic-flow":
      return {
        ringClass: "animate-gradient bg-[linear-gradient(120deg,#22d3ee,#6366f1,#f472b6,#facc15,#4ade80,#22d3ee)] shadow-[0_0_24px_rgba(99,102,241,0.55)]",
        innerClass: "border border-white/45 shadow-[inset_0_0_8px_rgba(255,255,255,0.3)]",
      };
    default:
      return {
        ringClass: "bg-[var(--primary)]/20",
        innerClass: "border border-[var(--primary)]/30",
      };
  }
}
