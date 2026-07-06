import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Coaches table - persistent identity across seasons
export const coaches = sqliteTable("coaches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  eloRating: real("elo_rating").notNull().default(1000),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  // Auth fields
  passwordHash: text("password_hash"), // null = unclaimed account
  isMod: integer("is_mod", { mode: "boolean" }).default(false),
  canPostBlog: integer("can_post_blog", { mode: "boolean" }).default(false),
  claimedAt: text("claimed_at"), // when the account was claimed
  projectMewConfirmed: integer("project_mew_confirmed", { mode: "boolean" }).default(false),
  projectMewPromptSeen: integer("project_mew_prompt_seen", { mode: "boolean" }).default(false),
  // Currency
  pboCoin: integer("pbo_coin").notNull().default(0),
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
  isSchedulePublic: integer("is_schedule_public", { mode: "boolean" }).default(true),
  draftBudget: integer("draft_budget").default(100),
  movesetFormat: text("moveset_format").notNull().default("scarlet-violet"),
}, (table) => [
  index("idx_seasons_current_public_number").on(table.isCurrent, table.isPublic, table.seasonNumber),
]);

// Divisions table
export const divisions = sqliteTable("divisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  displayOrder: integer("display_order").default(0),
}, (table) => [
  index("idx_divisions_season_id").on(table.seasonId),
  index("idx_divisions_season_order").on(table.seasonId, table.displayOrder),
]);

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
}, (table) => [
  index("idx_season_coaches_coach_id").on(table.coachId),
  index("idx_season_coaches_division_id").on(table.divisionId),
  index("idx_season_coaches_division_active").on(table.divisionId, table.isActive),
  index("idx_season_coaches_replaced_by_id").on(table.replacedById),
]);

// Pokemon table
export const pokemon = sqliteTable("pokemon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokedexId: integer("pokedex_id"),
  name: text("name").notNull().unique(), // Internal name from PokeAPI (e.g., "ogerpon-hearthflame-mask")
  displayName: text("display_name"), // Showdown-style display name (e.g., "Ogerpon-Hearthflame")
  spriteUrl: text("sprite_url"),
  artworkUrl: text("artwork_url"),
  types: text("types", { mode: "json" }).$type<string[]>(),
  moves: text("moves", { mode: "json" }).$type<string[]>(), // Gen 9 learnable moves (includes pre-evo moves)
  abilities: text("abilities", { mode: "json" }).$type<{ name: string; isHidden: boolean }[]>(),
  // Base stats
  hp: integer("hp"),
  attack: integer("attack"),
  defense: integer("defense"),
  specialAttack: integer("special_attack"),
  specialDefense: integer("special_defense"),
  speed: integer("speed"),
  baseStatTotal: integer("base_stat_total"),
});

export const pokemonNameAliases = sqliteTable("pokemon_name_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  alias: text("alias").notNull(),
  aliasKey: text("alias_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_pokemon_name_aliases_pokemon_id").on(table.pokemonId),
  index("idx_pokemon_name_aliases_alias_key").on(table.aliasKey),
]);

export const pokemonNameCollapses = sqliteTable("pokemon_name_collapses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetPokemonId: integer("target_pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  sourceName: text("source_name").notNull(),
  sourceKey: text("source_key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_pokemon_name_collapses_target_pokemon_id").on(table.targetPokemonId),
  index("idx_pokemon_name_collapses_source_key").on(table.sourceKey),
]);

// Moves table - all Pokemon moves from PokeAPI
export const moves = sqliteTable("moves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokeapiId: integer("pokeapi_id").notNull().unique(),
  name: text("name").notNull().unique(), // Internal name (e.g., "thunder-wave")
  displayName: text("display_name"), // Display name (e.g., "Thunder Wave")
  type: text("type"), // Move type (e.g., "electric")
  damageClass: text("damage_class"), // "physical", "special", "status"
  power: integer("power"), // null for status moves
  accuracy: integer("accuracy"), // null for moves that can't miss
  pp: integer("pp"),
  priority: integer("priority").default(0),
  effectChance: integer("effect_chance"), // Chance for secondary effect
  effectDescription: text("effect_description"), // Short effect text
  target: text("target"), // "selected-pokemon", "all-opponents", etc.
  generation: integer("generation"), // Gen introduced
});

// Abilities table - all Pokemon abilities from PokeAPI
export const abilities = sqliteTable("abilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokeapiId: integer("pokeapi_id").notNull().unique(),
  name: text("name").notNull().unique(), // Internal name (e.g., "levitate")
  displayName: text("display_name"), // Display name (e.g., "Levitate")
  shortEffect: text("short_effect"), // Brief description
  fullEffect: text("full_effect"), // Detailed description
  generation: integer("generation"), // Gen introduced
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
}, (table) => [
  index("idx_season_pokemon_prices_season_id").on(table.seasonId),
  index("idx_season_pokemon_prices_pokemon_id").on(table.pokemonId),
  index("idx_season_pokemon_prices_season_pokemon").on(table.seasonId, table.pokemonId),
]);

export const seasonPokemonMoves = sqliteTable("season_pokemon_moves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  moves: text("moves", { mode: "json" }).$type<string[]>().notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_season_pokemon_moves_season_id").on(table.seasonId),
]);

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
}, (table) => [
  index("idx_rosters_season_coach_id").on(table.seasonCoachId),
  index("idx_rosters_pokemon_id").on(table.pokemonId),
  index("idx_rosters_season_coach_pokemon").on(table.seasonCoachId, table.pokemonId),
]);

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
  scheduledAt: text("scheduled_at"), // ISO datetime for when match is scheduled to be played
  // Match timing from replay (for anti-cheat betting)
  startedAt: text("started_at"), // When the match started (first |t:| in replay)
  endedAt: text("ended_at"), // When the match ended (last |t:| in replay)
  // Damage tracking data from replay scraper (optional - only present when scraped)
  turnSnapshots: text("turn_snapshots"), // JSON array of {turn, p1TotalHp, p2TotalHp}
  keyEvents: text("key_events"), // JSON array of {turn, type, description}
  decidingTurnsText: text("deciding_turns_text"),
  zoroarkInvolved: integer("zoroark_involved", { mode: "boolean" }), // Warning flag for Illusion inaccuracy
  // Game of the Week - featured match for pick-ems bonus
  isGameOfTheWeek: integer("is_game_of_the_week", { mode: "boolean" }).default(false),
}, (table) => [
  index("idx_matches_season_id").on(table.seasonId),
  index("idx_matches_division_id").on(table.divisionId),
  index("idx_matches_winner_id").on(table.winnerId),
  index("idx_matches_coach1_season_id").on(table.coach1SeasonId),
  index("idx_matches_coach2_season_id").on(table.coach2SeasonId),
  index("idx_matches_division_week").on(table.divisionId, table.week),
  index("idx_matches_is_forfeit_winner_id").on(table.isForfeit, table.winnerId),
  index("idx_matches_season_winner_id").on(table.seasonId, table.winnerId),
]);

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
}, (table) => [
  index("idx_playoff_matches_division_id").on(table.divisionId),
  index("idx_playoff_matches_higher_seed_id").on(table.higherSeedId),
  index("idx_playoff_matches_lower_seed_id").on(table.lowerSeedId),
  index("idx_playoff_matches_season_winner_id").on(table.seasonId, table.winnerId),
  index("idx_playoff_matches_season_round_winner_id").on(table.seasonId, table.round, table.winnerId),
]);

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
  // Damage tracking (optional - only present when scraped from replay)
  damageDealt: integer("damage_dealt"), // Direct damage dealt (percentage points)
  damageDealtIndirect: integer("damage_dealt_indirect"), // Hazards, status, weather damage
  damageTaken: integer("damage_taken"), // Direct damage taken
  damageTakenIndirect: integer("damage_taken_indirect"), // Indirect damage taken
  turnsActive: integer("turns_active"), // Unique battle turns this Pokemon was active
  hazardDamageTaken: integer("hazard_damage_taken"), // Hazard-only damage taken
  setupMovesUsed: integer("setup_moves_used"), // Count of setup/stat-boosting moves used
  favorableCrits: integer("favorable_crits"), // Crits landed on targets above 25% HP
  favorableMisses: integer("favorable_misses"), // Opponent misses while this Pokemon is active/targeted
  favorableFlinches: integer("favorable_flinches"), // Opponent cannot move due to flinch
  favorableParalysis: integer("favorable_paralysis"), // Opponent cannot move due to paralysis
  favorableFreezes: integer("favorable_freezes"), // Opponent is frozen
  favorableBurns: integer("favorable_burns"), // Opponent is burned, excluding Will-O-Wisp
  favorableSleep: integer("favorable_sleep"), // Opponent is put to sleep by a favorable status proc
  hpRestored: integer("hp_restored"), // HP healed
}, (table) => [
  index("idx_match_pokemon_match_id").on(table.matchId),
  index("idx_match_pokemon_season_coach_id").on(table.seasonCoachId),
]);

// Kill Events - normalized table for individual kills
export const killEvents = sqliteTable("kill_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  turn: integer("turn").notNull(),
  // Killer info
  killerPokemonId: integer("killer_pokemon_id")
    .references(() => pokemon.id), // null for hazard/weather/status kills without clear owner
  killerSeasonCoachId: integer("killer_season_coach_id")
    .references(() => seasonCoaches.id),
  // Victim info
  victimPokemonId: integer("victim_pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  victimSeasonCoachId: integer("victim_season_coach_id")
    .notNull()
    .references(() => seasonCoaches.id),
  // Kill details
  moveId: integer("move_id")
    .references(() => moves.id), // null for hazard/weather/status kills or unknown moves
  moveName: text("move_name"), // Fallback text when moveId can't be resolved
  cause: text("cause").notNull(), // 'move', 'hazard', 'weather', 'status', 'recoil', 'item', etc.
}, (table) => [
  index("idx_kill_events_match_id").on(table.matchId),
  index("idx_kill_events_killer_pokemon_id").on(table.killerPokemonId),
  index("idx_kill_events_killer_season_coach_id").on(table.killerSeasonCoachId),
  index("idx_kill_events_victim_pokemon_id").on(table.victimPokemonId),
  index("idx_kill_events_victim_season_coach_id").on(table.victimSeasonCoachId),
  index("idx_kill_events_move_id").on(table.moveId),
]);

// ELO History - tracks ELO changes over time
export const eloHistory = sqliteTable("elo_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id")
    .notNull()
    .references(() => coaches.id),
  eloRating: real("elo_rating").notNull(),
  matchId: integer("match_id").references(() => matches.id),
  recordedAt: text("recorded_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_elo_history_coach_id").on(table.coachId),
  index("idx_elo_history_match_id").on(table.matchId),
]);

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
}, (table) => [
  index("idx_transactions_season_coach_id").on(table.seasonCoachId),
  index("idx_transactions_trading_partner_season_coach_id").on(table.tradingPartnerSeasonCoachId),
  index("idx_transactions_season_id").on(table.seasonId),
]);

// Division Sheet Sync - links divisions to Google Sheets for backup sync
export const divisionSheetSync = sqliteTable("division_sheet_sync", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  divisionId: integer("division_id")
    .notNull()
    .references(() => divisions.id)
    .unique(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  syncEnabled: integer("sync_enabled", { mode: "boolean" }).default(true),
  syncMatchResultsEnabled: integer("sync_match_results_enabled", { mode: "boolean" }).default(true),
  syncRostersTransactionsEnabled: integer("sync_rosters_transactions_enabled", { mode: "boolean" }).default(true),
  lastSyncAt: text("last_sync_at"),
  lastSyncStatus: text("last_sync_status"), // "success", "error", "disabled"
  lastSyncError: text("last_sync_error"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_division_sheet_sync_division_id").on(table.divisionId),
]);

// Wiglett webhook/event audit log for idempotent external integration writes
export const wiglettEvents = sqliteTable("wiglett_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  divisionId: integer("division_id").references(() => divisions.id),
  status: text("status").notNull().default("processing"), // processing, success, error
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  receivedAt: text("received_at").default("CURRENT_TIMESTAMP"),
  processedAt: text("processed_at"),
}, (table) => [
  index("idx_wiglett_events_event_type").on(table.eventType),
  index("idx_wiglett_events_division_id").on(table.divisionId),
  index("idx_wiglett_events_status").on(table.status),
]);

// Relations
export const coachesRelations = relations(coaches, ({ many }) => ({
  seasonCoaches: many(seasonCoaches),
  eloHistory: many(eloHistory),
  sessions: many(userSessions),
  bets: many(bets),
  killBets: many(killBets),
  deathBets: many(deathBets),
  purchases: many(coachPurchases),
  triviaRewards: many(triviaRewards),
  blogPosts: many(blogPosts),
  blogComments: many(blogComments),
  fantasyEntries: many(fantasyEntries),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  divisions: many(divisions),
  matches: many(matches),
  pokemonPrices: many(seasonPokemonPrices),
  playoffMatches: many(playoffMatches),
  transactions: many(transactions),
  fantasyEntries: many(fantasyEntries),
}));

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  season: one(seasons, {
    fields: [divisions.seasonId],
    references: [seasons.id],
  }),
  seasonCoaches: many(seasonCoaches),
  matches: many(matches),
  playoffMatches: many(playoffMatches),
  sheetSync: one(divisionSheetSync),
}));

export const divisionSheetSyncRelations = relations(divisionSheetSync, ({ one }) => ({
  division: one(divisions, {
    fields: [divisionSheetSync.divisionId],
    references: [divisions.id],
  }),
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
  fantasyPicks: many(fantasyEntryPicks),
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

export const killEventsRelations = relations(killEvents, ({ one }) => ({
  match: one(matches, {
    fields: [killEvents.matchId],
    references: [matches.id],
  }),
  killerPokemon: one(pokemon, {
    fields: [killEvents.killerPokemonId],
    references: [pokemon.id],
    relationName: "killerPokemon",
  }),
  killerSeasonCoach: one(seasonCoaches, {
    fields: [killEvents.killerSeasonCoachId],
    references: [seasonCoaches.id],
    relationName: "killerSeasonCoach",
  }),
  victimPokemon: one(pokemon, {
    fields: [killEvents.victimPokemonId],
    references: [pokemon.id],
    relationName: "victimPokemon",
  }),
  victimSeasonCoach: one(seasonCoaches, {
    fields: [killEvents.victimSeasonCoachId],
    references: [seasonCoaches.id],
    relationName: "victimSeasonCoach",
  }),
  move: one(moves, {
    fields: [killEvents.moveId],
    references: [moves.id],
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

// Pick-Em Participants - anyone who makes predictions
export const pickEmParticipants = sqliteTable("pick_em_participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  coachId: integer("coach_id").references(() => coaches.id), // nullable, linked if they're a coach
  userId: integer("user_id").references(() => users.id), // nullable, linked if they're a spectator
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_pick_em_participants_season_id").on(table.seasonId),
  index("idx_pick_em_participants_coach_id").on(table.coachId),
  index("idx_pick_em_participants_user_id").on(table.userId),
]);

// Pick-Em Picks - individual predictions
export const pickEmPicks = sqliteTable("pick_em_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id")
    .notNull()
    .references(() => pickEmParticipants.id),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  predictedWinnerId: integer("predicted_winner_id")
    .notNull()
    .references(() => seasonCoaches.id),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_pick_em_picks_participant_id").on(table.participantId),
  index("idx_pick_em_picks_match_id").on(table.matchId),
  index("idx_pick_em_picks_predicted_winner_id").on(table.predictedWinnerId),
]);

// Fantasy Entries - saved fantasy rosters for signed-in coaches or spectators
export const fantasyEntries = sqliteTable("fantasy_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  coachId: integer("coach_id").references(() => coaches.id),
  userId: integer("user_id").references(() => users.id),
  week: integer("week").notNull().default(1),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_fantasy_entries_season_id").on(table.seasonId),
  index("idx_fantasy_entries_coach_id").on(table.coachId),
  index("idx_fantasy_entries_user_id").on(table.userId),
  index("idx_fantasy_entries_season_week").on(table.seasonId, table.week),
]);

// Fantasy Entry Picks - Pokemon selected for a fantasy roster
export const fantasyEntryPicks = sqliteTable("fantasy_entry_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryId: integer("entry_id")
    .notNull()
    .references(() => fantasyEntries.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  seasonCoachId: integer("season_coach_id").references(() => seasonCoaches.id),
  slot: integer("slot").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_fantasy_entry_picks_entry_id").on(table.entryId),
  index("idx_fantasy_entry_picks_pokemon_id").on(table.pokemonId),
  index("idx_fantasy_entry_picks_season_coach_id").on(table.seasonCoachId),
]);

// Fantasy Rewards - tracks weekly best fantasy roster coin awards
export const fantasyRewards = sqliteTable("fantasy_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entryId: integer("entry_id")
    .notNull()
    .references(() => fantasyEntries.id),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  week: integer("week").notNull(),
  coachId: integer("coach_id").references(() => coaches.id),
  userId: integer("user_id").references(() => users.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_fantasy_rewards_entry_id").on(table.entryId),
  index("idx_fantasy_rewards_season_week").on(table.seasonId, table.week),
  index("idx_fantasy_rewards_coach_id").on(table.coachId),
  index("idx_fantasy_rewards_user_id").on(table.userId),
]);

// Pick-Em Rewards - tracks awarded coins for pick-em performance
export const pickEmRewards = sqliteTable("pick_em_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id")
    .notNull()
    .references(() => pickEmParticipants.id),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  week: integer("week").notNull(),
  divisionId: integer("division_id").references(() => divisions.id), // null for overall prizes
  matchId: integer("match_id").references(() => matches.id), // for GOTW bonuses - tracks which match
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_pick_em_rewards_season_week").on(table.seasonId, table.week),
  index("idx_pick_em_rewards_participant").on(table.participantId),
  index("idx_pick_em_rewards_match").on(table.matchId),
]);

export const pickEmRewardsRelations = relations(pickEmRewards, ({ one }) => ({
  participant: one(pickEmParticipants, {
    fields: [pickEmRewards.participantId],
    references: [pickEmParticipants.id],
  }),
  season: one(seasons, {
    fields: [pickEmRewards.seasonId],
    references: [seasons.id],
  }),
  division: one(divisions, {
    fields: [pickEmRewards.divisionId],
    references: [divisions.id],
  }),
  match: one(matches, {
    fields: [pickEmRewards.matchId],
    references: [matches.id],
  }),
}));

// Trivia Rewards - tracks coins awarded for trivia/minigame participation
export const triviaRewards = sqliteTable("trivia_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id")
    .notNull()
    .references(() => coaches.id),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  awardedBy: text("awarded_by"), // Name of the mod who awarded it
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_trivia_rewards_coach").on(table.coachId),
  index("idx_trivia_rewards_season").on(table.seasonId),
]);

export const triviaRewardsRelations = relations(triviaRewards, ({ one }) => ({
  coach: one(coaches, {
    fields: [triviaRewards.coachId],
    references: [coaches.id],
  }),
  season: one(seasons, {
    fields: [triviaRewards.seasonId],
    references: [seasons.id],
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

export const pickEmParticipantsRelations = relations(pickEmParticipants, ({ one, many }) => ({
  season: one(seasons, {
    fields: [pickEmParticipants.seasonId],
    references: [seasons.id],
  }),
  coach: one(coaches, {
    fields: [pickEmParticipants.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [pickEmParticipants.userId],
    references: [users.id],
  }),
  picks: many(pickEmPicks),
  rewards: many(pickEmRewards),
}));

export const pickEmPicksRelations = relations(pickEmPicks, ({ one }) => ({
  participant: one(pickEmParticipants, {
    fields: [pickEmPicks.participantId],
    references: [pickEmParticipants.id],
  }),
  match: one(matches, {
    fields: [pickEmPicks.matchId],
    references: [matches.id],
  }),
  predictedWinner: one(seasonCoaches, {
    fields: [pickEmPicks.predictedWinnerId],
    references: [seasonCoaches.id],
  }),
}));

export const fantasyEntriesRelations = relations(fantasyEntries, ({ one, many }) => ({
  season: one(seasons, {
    fields: [fantasyEntries.seasonId],
    references: [seasons.id],
  }),
  coach: one(coaches, {
    fields: [fantasyEntries.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [fantasyEntries.userId],
    references: [users.id],
  }),
  picks: many(fantasyEntryPicks),
}));

export const fantasyEntryPicksRelations = relations(fantasyEntryPicks, ({ one }) => ({
  entry: one(fantasyEntries, {
    fields: [fantasyEntryPicks.entryId],
    references: [fantasyEntries.id],
  }),
  pokemon: one(pokemon, {
    fields: [fantasyEntryPicks.pokemonId],
    references: [pokemon.id],
  }),
  seasonCoach: one(seasonCoaches, {
    fields: [fantasyEntryPicks.seasonCoachId],
    references: [seasonCoaches.id],
  }),
}));

// Discord Guild Configuration
export const discordGuilds = sqliteTable("discord_guilds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull().unique(), // Discord server ID (snowflake)
  name: text("name").notNull(), // Server name for reference
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// Discord Channel to Division Mapping
export const discordChannels = sqliteTable("discord_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: integer("guild_id")
    .notNull()
    .references(() => discordGuilds.id),
  channelId: text("channel_id").notNull(), // Discord channel ID (snowflake)
  channelName: text("channel_name"), // Channel name for reference
  divisionId: integer("division_id")
    .notNull()
    .references(() => divisions.id),
  isDraftEnabled: integer("is_draft_enabled", { mode: "boolean" }).default(false),
  isMatchReportEnabled: integer("is_match_report_enabled", { mode: "boolean" }).default(true),
  isScheduleEnabled: integer("is_schedule_enabled", { mode: "boolean" }).default(true),
}, (table) => [
  index("idx_discord_channels_channel_id").on(table.channelId),
  index("idx_discord_channels_division_id").on(table.divisionId),
]);

export const discordGuildsRelations = relations(discordGuilds, ({ many }) => ({
  channels: many(discordChannels),
}));

export const discordChannelsRelations = relations(discordChannels, ({ one }) => ({
  guild: one(discordGuilds, {
    fields: [discordChannels.guildId],
    references: [discordGuilds.id],
  }),
  division: one(divisions, {
    fields: [discordChannels.divisionId],
    references: [divisions.id],
  }),
}));

// Users table - for spectators (non-coaches) who want to participate in pick-ems
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isMod: integer("is_mod", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  // Currency (same as coaches)
  pboCoin: integer("pbo_coin").notNull().default(0),
});

// Blog Posts - public league posts written by coaches or mods
export const blogPosts = sqliteTable("blog_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  imageUrl: text("image_url"),
  authorCoachId: integer("author_coach_id").references(() => coaches.id),
  authorUserId: integer("author_user_id").references(() => users.id),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_blog_posts_created_at").on(table.createdAt),
  index("idx_blog_posts_author_coach_id").on(table.authorCoachId),
  index("idx_blog_posts_author_user_id").on(table.authorUserId),
]);

export const blogComments = sqliteTable("blog_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id")
    .notNull()
    .references(() => blogPosts.id),
  parentCommentId: integer("parent_comment_id"),
  content: text("content").notNull(),
  authorCoachId: integer("author_coach_id").references(() => coaches.id),
  authorUserId: integer("author_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_blog_comments_post_id").on(table.postId),
  index("idx_blog_comments_parent_comment_id").on(table.parentCommentId),
  index("idx_blog_comments_created_at").on(table.createdAt),
  index("idx_blog_comments_author_coach_id").on(table.authorCoachId),
  index("idx_blog_comments_author_user_id").on(table.authorUserId),
]);

// User Sessions - unified session management for coaches and spectators
export const userSessions = sqliteTable("user_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  coachId: integer("coach_id").references(() => coaches.id), // null for spectators
  userId: integer("user_id").references(() => users.id), // null for coaches
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("idx_user_sessions_token").on(table.token),
  index("idx_user_sessions_coach_id").on(table.coachId),
  index("idx_user_sessions_user_id").on(table.userId),
]);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  bets: many(bets),
  killBets: many(killBets),
  deathBets: many(deathBets),
  blogPosts: many(blogPosts),
  blogComments: many(blogComments),
  fantasyEntries: many(fantasyEntries),
}));

export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  authorCoach: one(coaches, {
    fields: [blogPosts.authorCoachId],
    references: [coaches.id],
  }),
  authorUser: one(users, {
    fields: [blogPosts.authorUserId],
    references: [users.id],
  }),
  comments: many(blogComments),
}));

export const blogCommentsRelations = relations(blogComments, ({ one }) => ({
  post: one(blogPosts, {
    fields: [blogComments.postId],
    references: [blogPosts.id],
  }),
  parentComment: one(blogComments, {
    fields: [blogComments.parentCommentId],
    references: [blogComments.id],
    relationName: "commentReplies",
  }),
  authorCoach: one(coaches, {
    fields: [blogComments.authorCoachId],
    references: [coaches.id],
  }),
  authorUser: one(users, {
    fields: [blogComments.authorUserId],
    references: [users.id],
  }),
}));

export const fantasyRewardsRelations = relations(fantasyRewards, ({ one }) => ({
  entry: one(fantasyEntries, {
    fields: [fantasyRewards.entryId],
    references: [fantasyEntries.id],
  }),
  season: one(seasons, {
    fields: [fantasyRewards.seasonId],
    references: [seasons.id],
  }),
  coach: one(coaches, {
    fields: [fantasyRewards.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [fantasyRewards.userId],
    references: [users.id],
  }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  coach: one(coaches, {
    fields: [userSessions.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

// Bets - PBOcoin wagers on match outcomes
export const bets = sqliteTable("bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id")
    .references(() => coaches.id), // nullable - set for coach bets
  userId: integer("user_id")
    .references(() => users.id), // nullable - set for spectator bets
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  predictedWinnerId: integer("predicted_winner_id")
    .notNull()
    .references(() => seasonCoaches.id),
  amount: integer("amount").notNull(), // coins wagered
  odds: real("odds").notNull(), // decimal odds at time of bet (e.g., 1.5 = +50%)
  status: text("status").notNull().default("pending"), // pending, won, lost, refunded
  payout: integer("payout"), // coins returned if won (includes original stake)
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  resolvedAt: text("resolved_at"),
}, (table) => [
  index("idx_bets_coach_id").on(table.coachId),
  index("idx_bets_user_id").on(table.userId),
  index("idx_bets_match_id").on(table.matchId),
  index("idx_bets_predicted_winner_id").on(table.predictedWinnerId),
  index("idx_bets_status").on(table.status),
]);

export const betsRelations = relations(bets, ({ one }) => ({
  coach: one(coaches, {
    fields: [bets.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [bets.userId],
    references: [users.id],
  }),
  match: one(matches, {
    fields: [bets.matchId],
    references: [matches.id],
  }),
  predictedWinner: one(seasonCoaches, {
    fields: [bets.predictedWinnerId],
    references: [seasonCoaches.id],
  }),
}));

// Store Items - catalog of purchasable items
export const storeItems = sqliteTable("store_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(), // e.g., "showcase-slot"
  name: text("name").notNull(), // e.g., "Showcase Slot"
  description: text("description").notNull(),
  price: integer("price").notNull(), // PBOcoin cost
  category: text("category").notNull(), // e.g., "visibility", "cosmetic"
  isActive: integer("is_active", { mode: "boolean" }).default(true), // Can be purchased
  maxPerUser: integer("max_per_user"), // NULL = unlimited
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// Coach Purchases - user inventory of purchased items
export const coachPurchases = sqliteTable("coach_purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id")
    .notNull()
    .references(() => coaches.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => storeItems.id),
  purchasedAt: text("purchased_at").notNull(),
  expiresAt: text("expires_at"), // NULL = permanent
  isActive: integer("is_active", { mode: "boolean" }).default(true), // Can be toggled off
  bonusReason: text("bonus_reason"), // NULL = paid with coins, otherwise free with reason shown
  glowColor: text("glow_color"), // For team-name-glow: selected color key (e.g., "stargazer", "gold")
  bgColor: text("bg_color"), // For row-background: selected color key
  borderColor: text("border_color"), // For row-border: selected color key
}, (table) => [
  index("idx_coach_purchases_coach_id").on(table.coachId),
  index("idx_coach_purchases_item_id").on(table.itemId),
]);

export const storeItemsRelations = relations(storeItems, ({ many }) => ({
  purchases: many(coachPurchases),
}));

export const coachPurchasesRelations = relations(coachPurchases, ({ one }) => ({
  coach: one(coaches, {
    fields: [coachPurchases.coachId],
    references: [coaches.id],
  }),
  item: one(storeItems, {
    fields: [coachPurchases.itemId],
    references: [storeItems.id],
  }),
}));

// Admin Audit Logs - append-only record of risky admin/API writes
export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorType: text("actor_type"), // coach, spectator, or null when unauthenticated/unknown
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  details: text("details"), // JSON blob with before/after counts or payload summary
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_admin_audit_logs_created_at").on(table.createdAt),
  index("idx_admin_audit_logs_entity").on(table.entityType, table.entityId),
  index("idx_admin_audit_logs_actor").on(table.actorType, table.actorId),
]);

// User Preferences - saves page settings for logged-in users
export const userPreferences = sqliteTable("user_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id").references(() => coaches.id),
  userId: integer("user_id").references(() => users.id),
  page: text("page").notNull(), // 'draft-planner' or 'matchup-prep'
  preferences: text("preferences").notNull(), // JSON blob
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_user_prefs_coach").on(table.coachId, table.page),
  index("idx_user_prefs_user").on(table.userId, table.page),
]);

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  coach: one(coaches, {
    fields: [userPreferences.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

// Kill Bets - wagers on Pokemon kill counts in matches
export const killBets = sqliteTable("kill_bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id").references(() => coaches.id), // nullable - set for coach bets
  userId: integer("user_id").references(() => users.id), // nullable - set for spectator bets
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  seasonCoachId: integer("season_coach_id")
    .notNull()
    .references(() => seasonCoaches.id), // Which team's Pokemon
  killThreshold: integer("kill_threshold").notNull(), // e.g., 3 means "3+ kills"
  betType: text("bet_type").notNull().default("over"), // "over" (3+) or "under" (<3)
  amount: integer("amount").notNull(), // coins wagered
  odds: real("odds").notNull(), // decimal odds at time of bet
  status: text("status").notNull().default("pending"), // pending, won, lost, refunded
  payout: integer("payout"), // coins returned if won
  actualKills: integer("actual_kills"), // recorded after match for audit
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  resolvedAt: text("resolved_at"),
}, (table) => [
  index("idx_kill_bets_coach_id").on(table.coachId),
  index("idx_kill_bets_user_id").on(table.userId),
  index("idx_kill_bets_match_id").on(table.matchId),
  index("idx_kill_bets_pokemon_id").on(table.pokemonId),
  index("idx_kill_bets_season_coach_id").on(table.seasonCoachId),
  index("idx_kill_bets_status").on(table.status),
]);

export const killBetsRelations = relations(killBets, ({ one }) => ({
  coach: one(coaches, {
    fields: [killBets.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [killBets.userId],
    references: [users.id],
  }),
  match: one(matches, {
    fields: [killBets.matchId],
    references: [matches.id],
  }),
  pokemon: one(pokemon, {
    fields: [killBets.pokemonId],
    references: [pokemon.id],
  }),
  seasonCoach: one(seasonCoaches, {
    fields: [killBets.seasonCoachId],
    references: [seasonCoaches.id],
  }),
}));

// Death Bets - wagers on whether Pokemon will die or survive in matches
export const deathBets = sqliteTable("death_bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coachId: integer("coach_id").references(() => coaches.id), // nullable - set for coach bets
  userId: integer("user_id").references(() => users.id), // nullable - set for spectator bets
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  pokemonId: integer("pokemon_id")
    .notNull()
    .references(() => pokemon.id),
  seasonCoachId: integer("season_coach_id")
    .notNull()
    .references(() => seasonCoaches.id), // Which team's Pokemon
  betType: text("bet_type").notNull(), // "dies" or "survives"
  amount: integer("amount").notNull(), // coins wagered
  odds: real("odds").notNull(), // decimal odds at time of bet
  status: text("status").notNull().default("pending"), // pending, won, lost, refunded
  payout: integer("payout"), // coins returned if won
  actualDied: integer("actual_died"), // 1 = died, 0 = survived, null = not brought
  wasBrought: integer("was_brought"), // 1 = brought to match, 0 = not brought
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  resolvedAt: text("resolved_at"),
}, (table) => [
  index("idx_death_bets_coach_id").on(table.coachId),
  index("idx_death_bets_user_id").on(table.userId),
  index("idx_death_bets_match_id").on(table.matchId),
  index("idx_death_bets_pokemon_id").on(table.pokemonId),
  index("idx_death_bets_season_coach_id").on(table.seasonCoachId),
  index("idx_death_bets_status").on(table.status),
]);

export const deathBetsRelations = relations(deathBets, ({ one }) => ({
  coach: one(coaches, {
    fields: [deathBets.coachId],
    references: [coaches.id],
  }),
  user: one(users, {
    fields: [deathBets.userId],
    references: [users.id],
  }),
  match: one(matches, {
    fields: [deathBets.matchId],
    references: [matches.id],
  }),
  pokemon: one(pokemon, {
    fields: [deathBets.pokemonId],
    references: [pokemon.id],
  }),
  seasonCoach: one(seasonCoaches, {
    fields: [deathBets.seasonCoachId],
    references: [seasonCoaches.id],
  }),
}));

// Site-wide settings (key-value store for global config)
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const polls = sqliteTable("polls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  question: text("question").notNull(),
  options: text("options", { mode: "json" }).$type<string[]>().notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const pollVotes = sqliteTable("poll_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pollId: integer("poll_id")
    .notNull()
    .references(() => polls.id),
  coachId: integer("coach_id")
    .notNull()
    .references(() => coaches.id),
  optionIndex: integer("option_index").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_poll_votes_poll_id").on(table.pollId),
  index("idx_poll_votes_coach_id").on(table.coachId),
]);
