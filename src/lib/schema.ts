import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Coaches table - persistent identity across seasons
export const coaches = sqliteTable("coaches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  eloRating: real("elo_rating").notNull().default(1000),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// Seasons table
export const seasons = sqliteTable("seasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  seasonNumber: integer("season_number").notNull().default(1),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isCurrent: integer("is_current", { mode: "boolean" }).default(false),
  isPublic: integer("is_public", { mode: "boolean" }).default(true),
  draftBudget: integer("draft_budget").default(100),
});

// Divisions table
export const divisions = sqliteTable("divisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  displayOrder: integer("display_order").default(0),
});

// Season Coaches - links coaches to divisions per season
export const seasonCoaches = sqliteTable("season_coaches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id")
    .notNull()
    .references(() => coaches.id),
  divisionId: integer("division_id")
    .notNull()
    .references(() => divisions.id),
  teamName: text("team_name").notNull(),
  teamAbbreviation: text("team_abbreviation"),
  teamLogoUrl: text("team_logo_url"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  replacedById: integer("replaced_by_id"),
  remainingBudget: integer("remaining_budget"),
});

// Pokemon table
export const pokemon = sqliteTable("pokemon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokedexId: integer("pokedex_id"),
  name: text("name").notNull().unique(), // Internal name from PokeAPI (e.g., "ogerpon-hearthflame-mask")
  displayName: text("display_name"), // Showdown-style display name (e.g., "Ogerpon-Hearthflame")
  spriteUrl: text("sprite_url"),
  artworkUrl: text("artwork_url"),
  types: text("types", { mode: "json" }).$type<string[]>(),
  // Base stats
  hp: integer("hp"),
  attack: integer("attack"),
  defense: integer("defense"),
  specialAttack: integer("special_attack"),
  specialDefense: integer("special_defense"),
  speed: integer("speed"),
  baseStatTotal: integer("base_stat_total"),
});

// Season Pokemon Prices - prices can vary per season
export const seasonPokemonPrices = sqliteTable("season_pokemon_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  price: integer("price").notNull(), // -1 = complex ban (ability/move banned, Pokemon usable)
  teraBanned: integer("tera_banned", { mode: "boolean" }).default(false),
  teraCaptainCost: integer("tera_captain_cost"), // null = not available as captain, 0+ = cost
  complexBanReason: text("complex_ban_reason"), // e.g., "Arena Trap" or "Shed Tail" for complex bans
});

// Rosters - pokemon owned by coaches per season
export const rosters = sqliteTable("rosters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonCoachId: integer("season_coach_id")
    .notNull()
    .references(() => seasonCoaches.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  price: integer("price").notNull(),
  draftOrder: integer("draft_order"),
  isTeraCaptain: integer("is_tera_captain", { mode: "boolean" }).default(false),
  // Transaction tracking
  acquiredWeek: integer("acquired_week"), // null = draft, otherwise week acquired via trade/FA
  acquiredVia: text("acquired_via"), // "DRAFT", "FA_PICKUP", "P2P_TRADE", or null
  acquiredTransactionId: integer("acquired_transaction_id"), // Link to transaction record
});

// Matches table
export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  divisionId: integer("division_id")
    .notNull()
    .references(() => divisions.id),
  week: integer("week").notNull(),
  coach1SeasonId: integer("coach1_season_id")
    .notNull()
    .references(() => seasonCoaches.id),
  coach2SeasonId: integer("coach2_season_id")
    .notNull()
    .references(() => seasonCoaches.id),
  winnerId: integer("winner_id").references(() => seasonCoaches.id),
  coach1Differential: integer("coach1_differential").default(0),
  coach2Differential: integer("coach2_differential").default(0),
  isForfeit: integer("is_forfeit", { mode: "boolean" }).default(false),
  playedAt: text("played_at"),
  replayUrl: text("replay_url"),
});

// Playoff Matches - bracket structure for playoffs
// Top 8 make playoffs, top seeds choose opponents
export const playoffMatches = sqliteTable("playoff_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  divisionId: integer("division_id")
    .notNull()
    .references(() => divisions.id),
  round: integer("round").notNull(), // 1 = Quarterfinals, 2 = Semifinals, 3 = Finals
  bracketPosition: integer("bracket_position").notNull(), // Position in bracket (1-4 for QF, 1-2 for SF, 1 for F)
  higherSeedId: integer("higher_seed_id").references(() => seasonCoaches.id),
  lowerSeedId: integer("lower_seed_id").references(() => seasonCoaches.id),
  winnerId: integer("winner_id").references(() => seasonCoaches.id),
  higherSeedWins: integer("higher_seed_wins").default(0), // For Bo3
  lowerSeedWins: integer("lower_seed_wins").default(0),
  playedAt: text("played_at"),
  matchId: integer("match_id").references(() => matches.id), // Link to matches table for preview/details
});

// Match Pokemon - tracks each pokemon brought to a match
export const matchPokemon = sqliteTable("match_pokemon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  seasonCoachId: integer("season_coach_id")
    .notNull()
    .references(() => seasonCoaches.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  kills: integer("kills").default(0),
  deaths: integer("deaths").default(0),
});

// ELO History - tracks ELO changes over time
export const eloHistory = sqliteTable("elo_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id")
    .notNull()
    .references(() => coaches.id),
  eloRating: real("elo_rating").notNull(),
  matchId: integer("match_id").references(() => matches.id),
  recordedAt: text("recorded_at").default("CURRENT_TIMESTAMP"),
});

// Transactions - tracks mid-season roster changes (FA swaps, P2P trades, tera swaps)
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  type: text("type").notNull(), // FA_PICKUP, FA_DROP, P2P_TRADE, TERA_SWAP
  week: integer("week").notNull(),

  // Primary team (always set)
  seasonCoachId: integer("season_coach_id")
    .notNull()
    .references(() => seasonCoaches.id),
  teamAbbreviation: text("team_abbreviation"),

  // Trading partner (for P2P trades)
  tradingPartnerSeasonCoachId: integer("trading_partner_season_coach_id")
    .references(() => seasonCoaches.id),
  tradingPartnerAbbreviation: text("trading_partner_abbreviation"),

  // Pokemon involved (JSON arrays for multi-pokemon trades)
  pokemonIn: text("pokemon_in", { mode: "json" }).$type<number[]>(),
  pokemonOut: text("pokemon_out", { mode: "json" }).$type<number[]>(),

  // Tera captain changes
  newTeraCaptainId: integer("new_tera_captain_id")
    .references(() => pokemon.id),
  oldTeraCaptainId: integer("old_tera_captain_id")
    .references(() => pokemon.id),

  // Budget/tracking
  budgetChange: integer("budget_change").default(0),
  countsAgainstLimit: integer("counts_against_limit", { mode: "boolean" }).default(true),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// Relations
export const coachesRelations = relations(coaches, ({ many }) => ({
  seasonCoaches: many(seasonCoaches),
  eloHistory: many(eloHistory),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  divisions: many(divisions),
  matches: many(matches),
  pokemonPrices: many(seasonPokemonPrices),
  playoffMatches: many(playoffMatches),
  transactions: many(transactions),
}));

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  season: one(seasons, {
    fields: [divisions.seasonId],
    references: [seasons.id],
  }),
  seasonCoaches: many(seasonCoaches),
  matches: many(matches),
  playoffMatches: many(playoffMatches),
}));

export const seasonCoachesRelations = relations(
  seasonCoaches,
  ({ one, many }) => ({
    coach: one(coaches, {
      fields: [seasonCoaches.coachId],
      references: [coaches.id],
    }),
    division: one(divisions, {
      fields: [seasonCoaches.divisionId],
      references: [divisions.id],
    }),
    rosters: many(rosters),
    matchPokemon: many(matchPokemon),
    transactions: many(transactions, { relationName: "primaryTeam" }),
    receivedTrades: many(transactions, { relationName: "tradingPartner" }),
  })
);

export const pokemonRelations = relations(pokemon, ({ many }) => ({
  seasonPrices: many(seasonPokemonPrices),
  rosters: many(rosters),
  matchPokemon: many(matchPokemon),
}));

export const seasonPokemonPricesRelations = relations(
  seasonPokemonPrices,
  ({ one }) => ({
    season: one(seasons, {
      fields: [seasonPokemonPrices.seasonId],
      references: [seasons.id],
    }),
    pokemon: one(pokemon, {
      fields: [seasonPokemonPrices.pokemonId],
      references: [pokemon.id],
    }),
  })
);

export const rostersRelations = relations(rosters, ({ one }) => ({
  seasonCoach: one(seasonCoaches, {
    fields: [rosters.seasonCoachId],
    references: [seasonCoaches.id],
  }),
  pokemon: one(pokemon, {
    fields: [rosters.pokemonId],
    references: [pokemon.id],
  }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  season: one(seasons, {
    fields: [matches.seasonId],
    references: [seasons.id],
  }),
  division: one(divisions, {
    fields: [matches.divisionId],
    references: [divisions.id],
  }),
  coach1: one(seasonCoaches, {
    fields: [matches.coach1SeasonId],
    references: [seasonCoaches.id],
    relationName: "coach1",
  }),
  coach2: one(seasonCoaches, {
    fields: [matches.coach2SeasonId],
    references: [seasonCoaches.id],
    relationName: "coach2",
  }),
  winner: one(seasonCoaches, {
    fields: [matches.winnerId],
    references: [seasonCoaches.id],
    relationName: "winner",
  }),
  matchPokemon: many(matchPokemon),
}));

export const matchPokemonRelations = relations(matchPokemon, ({ one }) => ({
  match: one(matches, {
    fields: [matchPokemon.matchId],
    references: [matches.id],
  }),
  seasonCoach: one(seasonCoaches, {
    fields: [matchPokemon.seasonCoachId],
    references: [seasonCoaches.id],
  }),
  pokemon: one(pokemon, {
    fields: [matchPokemon.pokemonId],
    references: [pokemon.id],
  }),
}));

export const eloHistoryRelations = relations(eloHistory, ({ one }) => ({
  coach: one(coaches, {
    fields: [eloHistory.coachId],
    references: [coaches.id],
  }),
  match: one(matches, {
    fields: [eloHistory.matchId],
    references: [matches.id],
  }),
}));

export const playoffMatchesRelations = relations(playoffMatches, ({ one }) => ({
  season: one(seasons, {
    fields: [playoffMatches.seasonId],
    references: [seasons.id],
  }),
  division: one(divisions, {
    fields: [playoffMatches.divisionId],
    references: [divisions.id],
  }),
  higherSeed: one(seasonCoaches, {
    fields: [playoffMatches.higherSeedId],
    references: [seasonCoaches.id],
    relationName: "higherSeed",
  }),
  lowerSeed: one(seasonCoaches, {
    fields: [playoffMatches.lowerSeedId],
    references: [seasonCoaches.id],
    relationName: "lowerSeed",
  }),
  winner: one(seasonCoaches, {
    fields: [playoffMatches.winnerId],
    references: [seasonCoaches.id],
    relationName: "playoffWinner",
  }),
  match: one(matches, {
    fields: [playoffMatches.matchId],
    references: [matches.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  season: one(seasons, {
    fields: [transactions.seasonId],
    references: [seasons.id],
  }),
  seasonCoach: one(seasonCoaches, {
    fields: [transactions.seasonCoachId],
    references: [seasonCoaches.id],
    relationName: "primaryTeam",
  }),
  tradingPartner: one(seasonCoaches, {
    fields: [transactions.tradingPartnerSeasonCoachId],
    references: [seasonCoaches.id],
    relationName: "tradingPartner",
  }),
  newTeraCaptain: one(pokemon, {
    fields: [transactions.newTeraCaptainId],
    references: [pokemon.id],
    relationName: "newTC",
  }),
  oldTeraCaptain: one(pokemon, {
    fields: [transactions.oldTeraCaptainId],
    references: [pokemon.id],
    relationName: "oldTC",
  }),
}));
