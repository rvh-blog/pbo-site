const { createClient } = require("@libsql/client");

const databasePath = process.argv[2] || process.env.DATABASE_PATH || "pbo.db";
const client = createClient({ url: `file:${databasePath}` });

async function rows(sql) {
  return (await client.execute(sql)).rows;
}

async function tableExists(name) {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [name],
  });
  return result.rows.length > 0;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    databasePath,
    seasonSummary: await rows(`
      SELECT
        s.id AS season_id,
        s.season_number,
        s.name,
        (SELECT COUNT(*) FROM divisions d WHERE d.season_id = s.id) AS divisions,
        (SELECT COUNT(*) FROM season_coaches sc JOIN divisions d ON d.id = sc.division_id WHERE d.season_id = s.id) AS season_teams,
        (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id) AS scheduled_matches,
        (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id AND m.winner_id IS NOT NULL) AS resolved_matches,
        (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id AND m.winner_id IN (m.coach1_season_id, m.coach2_season_id)) AS valid_results,
        (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id AND COALESCE(m.is_forfeit, 0) = 1) AS forfeits,
        (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id AND m.week <= 100 AND m.winner_id IN (m.coach1_season_id, m.coach2_season_id)) AS regular_results,
        (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id AND m.week > 100 AND m.winner_id IN (m.coach1_season_id, m.coach2_season_id)) AS playoff_results,
        (SELECT COUNT(*) FROM match_pokemon mp JOIN matches m ON m.id = mp.match_id WHERE m.season_id = s.id) AS pokemon_appearances,
        (SELECT COUNT(*) FROM (SELECT mp.season_coach_id, mp.pokemon_id FROM match_pokemon mp JOIN matches m ON m.id = mp.match_id WHERE m.season_id = s.id GROUP BY mp.season_coach_id, mp.pokemon_id)) AS team_pokemon_entries
      FROM seasons s
      WHERE s.season_number BETWEEN 5 AND 11
      ORDER BY s.season_number DESC
    `),
    matchIntegrity: await rows(`
      SELECT
        s.season_number,
        SUM(CASE WHEN m.winner_id IS NOT NULL AND m.winner_id NOT IN (m.coach1_season_id, m.coach2_season_id) THEN 1 ELSE 0 END) AS invalid_winners,
        SUM(CASE WHEN m.coach1_season_id = m.coach2_season_id THEN 1 ELSE 0 END) AS self_matches,
        SUM(CASE WHEN m.winner_id IS NULL AND COALESCE(m.is_forfeit, 0) = 0 AND m.played_at IS NOT NULL THEN 1 ELSE 0 END) AS played_without_result,
        SUM(CASE WHEN m.winner_id IN (m.coach1_season_id, m.coach2_season_id) AND COALESCE(m.is_forfeit, 0) = 0 AND (m.coach1_differential IS NULL OR m.coach2_differential IS NULL) THEN 1 ELSE 0 END) AS missing_differentials,
        SUM(CASE WHEN m.winner_id IN (m.coach1_season_id, m.coach2_season_id) AND COALESCE(m.is_forfeit, 0) = 0 AND m.coach1_differential + m.coach2_differential <> 0 THEN 1 ELSE 0 END) AS asymmetric_differentials
      FROM seasons s
      LEFT JOIN matches m ON m.season_id = s.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    matchPokemonIntegrity: await rows(`
      SELECT
        s.season_number,
        COUNT(mp.id) AS rows,
        COUNT(DISTINCT mp.match_id) AS matches_with_stats,
        SUM(CASE WHEN mp.season_coach_id NOT IN (m.coach1_season_id, m.coach2_season_id) THEN 1 ELSE 0 END) AS wrong_team_rows,
        SUM(CASE WHEN mp.kills < 0 OR mp.deaths < 0 THEN 1 ELSE 0 END) AS negative_kill_death_rows,
        SUM(CASE WHEN mp.deaths > 1 THEN 1 ELSE 0 END) AS multi_death_rows,
        SUM(CASE WHEN mp.damage_dealt IS NOT NULL THEN 1 ELSE 0 END) AS damage_tracked_rows,
        SUM(CASE WHEN mp.moves_used IS NOT NULL THEN 1 ELSE 0 END) AS move_tracked_rows,
        SUM(CASE WHEN mp.revealed_items IS NOT NULL AND mp.revealed_items <> '[]' THEN 1 ELSE 0 END) AS item_tracked_rows
      FROM seasons s
      LEFT JOIN matches m ON m.season_id = s.id
      LEFT JOIN match_pokemon mp ON mp.match_id = m.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    aggregateReconciliation: await rows(`
      WITH valid AS (
        SELECT m.*
        FROM matches m
        JOIN seasons s ON s.id = m.season_id
        WHERE s.season_number BETWEEN 5 AND 11
          AND m.winner_id IN (m.coach1_season_id, m.coach2_season_id)
      ), participants AS (
        SELECT season_id, week, id AS match_id, coach1_season_id AS season_coach_id, winner_id FROM valid
        UNION ALL
        SELECT season_id, week, id, coach2_season_id, winner_id FROM valid
      ), appearances AS (
        SELECT v.season_id, v.week, mp.match_id, mp.season_coach_id, mp.pokemon_id, mp.kills, mp.deaths, v.winner_id
        FROM valid v
        JOIN match_pokemon mp ON mp.match_id = v.id
        WHERE mp.season_coach_id IN (v.coach1_season_id, v.coach2_season_id)
      )
      SELECT
        s.season_number,
        (SELECT COUNT(DISTINCT p.match_id) FROM participants p WHERE p.season_id = s.id) AS matches,
        (SELECT COUNT(*) FROM participants p WHERE p.season_id = s.id) AS participant_games,
        (SELECT SUM(CASE WHEN p.winner_id = p.season_coach_id THEN 1 ELSE 0 END) FROM participants p WHERE p.season_id = s.id) AS team_wins,
        (SELECT SUM(CASE WHEN p.winner_id <> p.season_coach_id THEN 1 ELSE 0 END) FROM participants p WHERE p.season_id = s.id) AS team_losses,
        (SELECT COUNT(*) FROM appearances a WHERE a.season_id = s.id) AS pokemon_appearances,
        (SELECT SUM(CASE WHEN a.winner_id = a.season_coach_id THEN 1 ELSE 0 END) FROM appearances a WHERE a.season_id = s.id) AS pokemon_wins,
        (SELECT SUM(CASE WHEN a.winner_id <> a.season_coach_id THEN 1 ELSE 0 END) FROM appearances a WHERE a.season_id = s.id) AS pokemon_losses,
        (SELECT COALESCE(SUM(a.kills), 0) FROM appearances a WHERE a.season_id = s.id) AS pokemon_kills,
        (SELECT COALESCE(SUM(a.deaths), 0) FROM appearances a WHERE a.season_id = s.id) AS pokemon_deaths
      FROM seasons s
      WHERE s.season_number BETWEEN 5 AND 11
      ORDER BY s.season_number DESC
    `),
    duplicateAppearances: await rows(`
      SELECT s.season_number, COUNT(*) AS duplicate_groups, SUM(copies - 1) AS extra_rows
      FROM (
        SELECT m.season_id, mp.match_id, mp.season_coach_id, mp.pokemon_id, COUNT(*) AS copies
        FROM match_pokemon mp
        JOIN matches m ON m.id = mp.match_id
        GROUP BY m.season_id, mp.match_id, mp.season_coach_id, mp.pokemon_id
        HAVING COUNT(*) > 1
      ) duplicates
      JOIN seasons s ON s.id = duplicates.season_id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    orphanSummary: await rows(`
      SELECT
        (SELECT COUNT(*) FROM match_pokemon mp LEFT JOIN matches m ON m.id = mp.match_id WHERE m.id IS NULL) AS orphan_match_pokemon,
        (SELECT COUNT(*) FROM kill_events ke LEFT JOIN matches m ON m.id = ke.match_id WHERE m.id IS NULL) AS orphan_kill_events,
        (SELECT COUNT(*) FROM elo_history eh LEFT JOIN matches m ON m.id = eh.match_id WHERE eh.match_id IS NOT NULL AND m.id IS NULL) AS orphan_elo_history,
        (SELECT COUNT(*) FROM rosters r LEFT JOIN season_coaches sc ON sc.id = r.season_coach_id WHERE sc.id IS NULL) AS orphan_rosters
    `),
    jsonIntegrity: await rows(`
      SELECT
        s.season_number,
        SUM(CASE WHEN mp.moves_used IS NOT NULL AND json_valid(mp.moves_used) = 0 THEN 1 ELSE 0 END) AS invalid_moves_json,
        SUM(CASE WHEN mp.revealed_items IS NOT NULL AND json_valid(mp.revealed_items) = 0 THEN 1 ELSE 0 END) AS invalid_items_json
      FROM seasons s
      LEFT JOIN matches m ON m.season_id = s.id
      LEFT JOIN match_pokemon mp ON mp.match_id = m.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    itemIntegrity: await rows(`
      WITH item_events AS (
        SELECT
          s.season_number,
          mp.id AS match_pokemon_id,
          lower(trim(json_extract(j.value, '$.item'))) AS item_key,
          trim(json_extract(j.value, '$.source')) AS source
        FROM match_pokemon mp
        JOIN matches m ON m.id = mp.match_id
        JOIN seasons s ON s.id = m.season_id,
        json_each(CASE WHEN json_valid(mp.revealed_items) THEN mp.revealed_items ELSE '[]' END) j
        WHERE s.season_number BETWEEN 5 AND 11
      ), held_events AS (
        SELECT * FROM item_events
        WHERE lower(source) NOT LIKE 'move: trick%'
          AND lower(source) NOT LIKE 'move: switcheroo%'
      )
      SELECT
        season_number,
        COUNT(*) AS reveal_events,
        COUNT(DISTINCT CASE
          WHEN item_key <> ''
            AND lower(source) NOT LIKE 'move: trick%'
            AND lower(source) NOT LIKE 'move: switcheroo%'
          THEN CAST(match_pokemon_id AS TEXT) || ':' || item_key
        END) AS distinct_held_uses,
        SUM(CASE WHEN lower(source) LIKE 'move: trick%' OR lower(source) LIKE 'move: switcheroo%' THEN 1 ELSE 0 END) AS transferred_events,
        SUM(CASE WHEN item_key = '' OR item_key IS NULL THEN 1 ELSE 0 END) AS blank_item_events,
        (SELECT COUNT(*) FROM (SELECT match_pokemon_id, item_key FROM held_events h2 WHERE h2.season_number = item_events.season_number GROUP BY match_pokemon_id, item_key HAVING COUNT(*) > 1)) AS repeated_held_reveal_groups
      FROM item_events
      GROUP BY season_number
      ORDER BY season_number DESC
    `),
    moveIntegrity: await rows(`
      WITH move_events AS (
        SELECT
          s.season_number,
          mp.id AS match_pokemon_id,
          trim(j.key) AS move_name,
          CAST(j.value AS REAL) AS uses
        FROM match_pokemon mp
        JOIN matches m ON m.id = mp.match_id
        JOIN seasons s ON s.id = m.season_id,
        json_each(CASE WHEN json_valid(mp.moves_used) THEN mp.moves_used ELSE '{}' END) j
        WHERE s.season_number BETWEEN 5 AND 11
      )
      SELECT
        season_number,
        COUNT(*) AS tracked_move_entries,
        SUM(CASE WHEN move_name = '' THEN 1 ELSE 0 END) AS blank_moves,
        SUM(CASE WHEN uses <= 0 THEN 1 ELSE 0 END) AS nonpositive_uses,
        SUM(CASE WHEN uses <> CAST(uses AS INTEGER) THEN 1 ELSE 0 END) AS fractional_uses
      FROM move_events
      GROUP BY season_number
      ORDER BY season_number DESC
    `),
    killEventIntegrity: await rows(`
      SELECT
        s.season_number,
        COUNT(ke.id) AS kill_events,
        SUM(CASE WHEN ke.victim_season_coach_id NOT IN (m.coach1_season_id, m.coach2_season_id) THEN 1 ELSE 0 END) AS wrong_victim_team,
        SUM(CASE WHEN ke.killer_season_coach_id IS NOT NULL AND ke.killer_season_coach_id NOT IN (m.coach1_season_id, m.coach2_season_id) THEN 1 ELSE 0 END) AS wrong_killer_team,
        SUM(CASE WHEN ke.turn < 0 THEN 1 ELSE 0 END) AS negative_turns
      FROM seasons s
      LEFT JOIN matches m ON m.season_id = s.id
      LEFT JOIN kill_events ke ON ke.match_id = m.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    killEventReconciliation: await rows(`
      WITH mp AS (
        SELECT m.season_id, m.id AS match_id, COALESCE(SUM(match_pokemon.kills), 0) AS kills
        FROM matches m
        JOIN match_pokemon ON match_pokemon.match_id = m.id
        GROUP BY m.season_id, m.id
      ), ke AS (
        SELECT match_id, COUNT(*) AS events,
          SUM(CASE WHEN killer_pokemon_id IS NOT NULL THEN 1 ELSE 0 END) AS attributed_events
        FROM kill_events
        GROUP BY match_id
      )
      SELECT
        s.season_number,
        COUNT(mp.match_id) AS matches_with_pokemon_stats,
        SUM(CASE WHEN mp.kills > 0 AND COALESCE(ke.events, 0) = 0 THEN 1 ELSE 0 END) AS matches_missing_kill_events,
        SUM(CASE WHEN ke.events IS NOT NULL AND mp.kills <> ke.attributed_events THEN 1 ELSE 0 END) AS attributed_kill_mismatches,
        SUM(mp.kills) AS match_pokemon_kills,
        SUM(COALESCE(ke.attributed_events, 0)) AS attributed_kill_events,
        SUM(COALESCE(ke.events, 0)) AS all_kill_events
      FROM seasons s
      LEFT JOIN mp ON mp.season_id = s.id
      LEFT JOIN ke ON ke.match_id = mp.match_id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    eloIntegrity: await rows(`
      SELECT
        s.season_number,
        COUNT(DISTINCT m.id) AS result_matches,
        COUNT(eh.id) AS match_elo_rows,
        SUM(CASE WHEN counts.entries <> 2 THEN 1 ELSE 0 END) AS matches_without_two_entries
      FROM seasons s
      LEFT JOIN matches m ON m.season_id = s.id AND (m.winner_id IS NOT NULL OR COALESCE(m.is_forfeit, 0) = 1)
      LEFT JOIN (SELECT match_id, COUNT(*) AS entries FROM elo_history WHERE match_id IS NOT NULL GROUP BY match_id) counts ON counts.match_id = m.id
      LEFT JOIN elo_history eh ON eh.match_id = m.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    playoffIntegrity: await rows(`
      SELECT
        s.season_number,
        COUNT(pm.id) AS bracket_rows,
        SUM(CASE WHEN pm.winner_id IS NOT NULL AND pm.winner_id NOT IN (pm.higher_seed_id, pm.lower_seed_id) THEN 1 ELSE 0 END) AS invalid_winners,
        SUM(CASE WHEN pm.winner_id IS NOT NULL AND sc.division_id <> pm.division_id THEN 1 ELSE 0 END) AS winner_wrong_division,
        SUM(CASE WHEN pm.match_id IS NOT NULL AND m.id IS NULL THEN 1 ELSE 0 END) AS missing_linked_matches
      FROM seasons s
      LEFT JOIN playoff_matches pm ON pm.season_id = s.id
      LEFT JOIN season_coaches sc ON sc.id = pm.winner_id
      LEFT JOIN matches m ON m.id = pm.match_id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
    rosterIntegrity: await rows(`
      SELECT
        s.season_number,
        COUNT(r.id) AS roster_rows,
        SUM(CASE WHEN r.price < 0 THEN 1 ELSE 0 END) AS negative_prices,
        (SELECT COUNT(*) FROM (
          SELECT r2.season_coach_id, r2.pokemon_id
          FROM rosters r2
          JOIN season_coaches sc2 ON sc2.id = r2.season_coach_id
          JOIN divisions d2 ON d2.id = sc2.division_id
          WHERE d2.season_id = s.id
          GROUP BY r2.season_coach_id, r2.pokemon_id
          HAVING COUNT(*) > 1
        )) AS duplicate_team_pokemon
      FROM seasons s
      LEFT JOIN divisions d ON d.season_id = s.id
      LEFT JOIN season_coaches sc ON sc.division_id = d.id
      LEFT JOIN rosters r ON r.season_coach_id = sc.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `),
  };

  if (await tableExists("fantasy_weekly_stats")) {
    report.fantasyIntegrity = await rows(`
      SELECT
        s.season_number,
        COUNT(fws.id) AS rows,
        COALESCE(SUM(fws.games), 0) AS games,
        COALESCE(SUM(fws.kills), 0) AS kills,
        COALESCE(SUM(fws.deaths), 0) AS deaths,
        COALESCE(SUM(fws.wins), 0) AS wins,
        COALESCE(SUM(fws.losses), 0) AS losses,
        COALESCE(SUM(fws.damage), 0) AS damage,
        COALESCE(SUM(fws.indirect_damage), 0) AS indirect_damage,
        SUM(CASE WHEN fws.score <> fws.kills * 5 - fws.deaths + fws.wins * 2 - fws.losses * 2 THEN 1 ELSE 0 END) AS score_formula_mismatches,
        SUM(CASE WHEN fws.kills < 0 OR fws.deaths < 0 OR fws.damage < 0 OR fws.indirect_damage < 0 THEN 1 ELSE 0 END) AS negative_stats
      FROM seasons s
      LEFT JOIN fantasy_weekly_stats fws ON fws.season_id = s.id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `);
    report.fantasyReconciliation = await rows(`
      WITH direct AS (
        SELECT
          m.season_id,
          m.week,
          mp.pokemon_id,
          mp.season_coach_id,
          COUNT(*) AS games,
          SUM(COALESCE(mp.kills, 0)) AS kills,
          SUM(COALESCE(mp.deaths, 0)) AS deaths,
          SUM(CASE WHEN m.winner_id = mp.season_coach_id THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN m.winner_id <> mp.season_coach_id THEN 1 ELSE 0 END) AS losses,
          SUM(COALESCE(mp.damage_dealt, 0)) AS damage,
          SUM(COALESCE(mp.damage_dealt_indirect, 0)) AS indirect_damage
        FROM matches m
        JOIN match_pokemon mp ON mp.match_id = m.id
        JOIN seasons s ON s.id = m.season_id
        WHERE s.season_number BETWEEN 5 AND 11 AND m.winner_id IS NOT NULL
        GROUP BY m.season_id, m.week, mp.pokemon_id, mp.season_coach_id
      ), keys AS (
        SELECT season_id, week, pokemon_id, season_coach_id FROM direct
        UNION
        SELECT season_id, week, pokemon_id, season_coach_id FROM fantasy_weekly_stats
      )
      SELECT
        s.season_number,
        COUNT(*) AS aggregate_keys,
        SUM(CASE WHEN d.season_id IS NULL THEN 1 ELSE 0 END) AS stale_persisted_rows,
        SUM(CASE WHEN f.id IS NULL THEN 1 ELSE 0 END) AS missing_persisted_rows,
        SUM(CASE WHEN d.season_id IS NOT NULL AND f.id IS NOT NULL AND (
          d.games <> f.games OR d.kills <> f.kills OR d.deaths <> f.deaths OR
          d.wins <> f.wins OR d.losses <> f.losses OR d.damage <> f.damage OR
          d.indirect_damage <> f.indirect_damage
        ) THEN 1 ELSE 0 END) AS value_mismatches
      FROM keys k
      JOIN seasons s ON s.id = k.season_id
      LEFT JOIN direct d ON d.season_id = k.season_id AND d.week = k.week
        AND d.pokemon_id = k.pokemon_id AND d.season_coach_id = k.season_coach_id
      LEFT JOIN fantasy_weekly_stats f ON f.season_id = k.season_id AND f.week = k.week
        AND f.pokemon_id = k.pokemon_id AND f.season_coach_id = k.season_coach_id
      WHERE s.season_number BETWEEN 5 AND 11
      GROUP BY s.id, s.season_number
      ORDER BY s.season_number DESC
    `);
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
