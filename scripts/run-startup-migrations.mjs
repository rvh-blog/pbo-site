import { createClient } from "@libsql/client";

const dbPath = process.env.DATABASE_PATH || "pbo.db";
const client = createClient({ url: `file:${dbPath}` });

const migrations = [
  {
    id: "2026-09-06-coach-youtube-playlist-v1",
    statements: [
      {
        sql: "ALTER TABLE coaches ADD COLUMN youtube_playlist_id TEXT",
        whenMissingColumn: { table: "coaches", column: "youtube_playlist_id" },
      },
    ],
  },
  {
    id: "2026-08-24-match-review-state-v1",
    statements: [
      {
        sql: "ALTER TABLE matches ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0",
        whenMissingColumn: { table: "matches", column: "needs_review" },
      },
      {
        sql: "ALTER TABLE matches ADD COLUMN review_notes TEXT",
        whenMissingColumn: { table: "matches", column: "review_notes" },
      },
    ],
  },
  {
    id: "2026-08-22-read-performance-indexes-v1",
    statements: [
      "CREATE INDEX IF NOT EXISTS idx_seasons_current_public_number ON seasons(is_current, is_public, season_number)",
      "CREATE INDEX IF NOT EXISTS idx_divisions_season_order ON divisions(season_id, display_order)",
      "CREATE INDEX IF NOT EXISTS idx_season_coaches_division_active ON season_coaches(division_id, is_active)",
      "CREATE INDEX IF NOT EXISTS idx_season_coaches_replaced_by_id ON season_coaches(replaced_by_id)",
      "CREATE INDEX IF NOT EXISTS idx_rosters_season_coach_pokemon ON rosters(season_coach_id, pokemon_id)",
      "CREATE INDEX IF NOT EXISTS idx_matches_coach1_season_id ON matches(coach1_season_id)",
      "CREATE INDEX IF NOT EXISTS idx_matches_coach2_season_id ON matches(coach2_season_id)",
      "CREATE INDEX IF NOT EXISTS idx_matches_division_week ON matches(division_id, week)",
      "CREATE INDEX IF NOT EXISTS idx_matches_season_week ON matches(season_id, week)",
      "CREATE INDEX IF NOT EXISTS idx_matches_move_records_filter ON matches(is_forfeit, winner_id, played_at)",
      "CREATE INDEX IF NOT EXISTS idx_matches_completed_records ON matches(is_forfeit, winner_id, division_id, week)",
      "CREATE INDEX IF NOT EXISTS idx_match_pokemon_season_coach_pokemon ON match_pokemon(season_coach_id, pokemon_id)",
      "CREATE INDEX IF NOT EXISTS idx_match_pokemon_pokemon_match ON match_pokemon(pokemon_id, match_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_season_coach ON transactions(season_id, season_coach_id)",
      "CREATE INDEX IF NOT EXISTS idx_playoff_matches_division_id ON playoff_matches(division_id)",
      "CREATE INDEX IF NOT EXISTS idx_playoff_matches_higher_seed_id ON playoff_matches(higher_seed_id)",
      "CREATE INDEX IF NOT EXISTS idx_playoff_matches_lower_seed_id ON playoff_matches(lower_seed_id)",
      "CREATE INDEX IF NOT EXISTS idx_playoff_matches_round_division_winner ON playoff_matches(round, division_id, winner_id)",
      "CREATE INDEX IF NOT EXISTS idx_kill_events_killer_season_coach_id ON kill_events(killer_season_coach_id)",
      "CREATE INDEX IF NOT EXISTS idx_kill_events_victim_season_coach_id ON kill_events(victim_season_coach_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_trading_partner_season_coach_id ON transactions(trading_partner_season_coach_id)",
      "CREATE INDEX IF NOT EXISTS idx_pick_em_picks_predicted_winner_id ON pick_em_picks(predicted_winner_id)",
      "CREATE INDEX IF NOT EXISTS idx_bets_predicted_winner_id ON bets(predicted_winner_id)",
      "CREATE INDEX IF NOT EXISTS idx_kill_bets_season_coach_id ON kill_bets(season_coach_id)",
      "CREATE INDEX IF NOT EXISTS idx_death_bets_season_coach_id ON death_bets(season_coach_id)",
      "CREATE INDEX IF NOT EXISTS idx_season_pokemon_prices_season_pokemon ON season_pokemon_prices(season_id, pokemon_id)",
    ],
  },
];

async function main() {
  await client.execute("PRAGMA busy_timeout = 30000");
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS app_startup_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    const existing = await client.execute({
      sql: "SELECT id FROM app_startup_migrations WHERE id = ? LIMIT 1",
      args: [migration.id],
    });

    if (existing.rows.length > 0) {
      console.log(`[Migration] ${migration.id} already applied`);
      continue;
    }

    console.log(`[Migration] Applying ${migration.id}...`);
    const statements = [];
    for (const statement of migration.statements) {
      if (typeof statement === "string") {
        statements.push(statement);
        continue;
      }
      const columns = await client.execute(`PRAGMA table_info(${statement.whenMissingColumn.table})`);
      const columnExists = columns.rows.some(
        (row) => row.name === statement.whenMissingColumn.column
      );
      if (!columnExists) statements.push(statement.sql);
    }
    await client.batch(
      [
        ...statements,
        {
          sql: "INSERT INTO app_startup_migrations (id, applied_at) VALUES (?, ?)",
          args: [migration.id, new Date().toISOString()],
        },
      ],
      "write"
    );
    console.log(`[Migration] Applied ${migration.id}`);
  }
}

try {
  await main();
} catch (error) {
  console.error("[Migration] Startup migration failed:", error);
  process.exitCode = 1;
} finally {
  client.close();
}
