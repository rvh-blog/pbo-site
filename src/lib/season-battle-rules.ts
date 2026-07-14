export interface SeasonBattleRules {
  usesStatPoints: boolean;
  friendlyMegaNames: boolean;
  battleLevel: number;
  showdownFormats: string[];
}

const DEFAULT_RULES: SeasonBattleRules = {
  usesStatPoints: false,
  friendlyMegaNames: false,
  battleLevel: 100,
  showdownFormats: [],
};

const SEASON_RULES: Record<number, SeasonBattleRules> = {
  11: {
    usesStatPoints: true,
    friendlyMegaNames: true,
    battleLevel: 50,
    showdownFormats: ["gen9championsnatdexdraft"],
  },
};

export function getSeasonBattleRules(seasonNumber: number | null | undefined): SeasonBattleRules {
  return SEASON_RULES[seasonNumber ?? 0] || DEFAULT_RULES;
}
