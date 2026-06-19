BEGIN TRANSACTION;

-- Reset only the fake S11 test season if this script is rerun.
DELETE FROM wiglett_events
WHERE division_id IN (
  SELECT d.id
  FROM divisions d
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
);

DELETE FROM pick_em_rewards
WHERE season_id IN (SELECT id FROM seasons WHERE season_number = 11);

DELETE FROM pick_em_picks
WHERE participant_id IN (
  SELECT id
  FROM pick_em_participants
  WHERE season_id IN (SELECT id FROM seasons WHERE season_number = 11)
)
OR match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM pick_em_participants
WHERE season_id IN (SELECT id FROM seasons WHERE season_number = 11);

DELETE FROM bets
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM kill_bets
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM death_bets
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM elo_history
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM match_pokemon
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM kill_events
WHERE match_id IN (
  SELECT m.id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE s.season_number = 11
);

DELETE FROM matches
WHERE season_id IN (SELECT id FROM seasons WHERE season_number = 11);

DELETE FROM rosters
WHERE season_coach_id IN (
  SELECT sc.id
  FROM season_coaches sc
  JOIN divisions d ON d.id = sc.division_id
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
);

DELETE FROM season_coaches
WHERE division_id IN (
  SELECT d.id
  FROM divisions d
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
);

DELETE FROM season_pokemon_prices
WHERE season_id IN (SELECT id FROM seasons WHERE season_number = 11);

DELETE FROM division_sheet_sync
WHERE division_id IN (
  SELECT d.id
  FROM divisions d
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
);

DELETE FROM divisions
WHERE season_id IN (SELECT id FROM seasons WHERE season_number = 11);

DELETE FROM seasons
WHERE season_number = 11;

-- Keep S10 non-current and create a private fake S11 for local integration tests.
UPDATE seasons SET is_current = 0;

INSERT INTO seasons (
  name,
  season_number,
  start_date,
  end_date,
  is_current,
  is_public,
  is_schedule_public,
  draft_budget
)
SELECT
  '[TEST] Season 11',
  11,
  date('now'),
  NULL,
  1,
  0,
  1,
  draft_budget
FROM seasons
WHERE season_number = 10
LIMIT 1;

-- Copy S10 divisions.
INSERT INTO divisions (season_id, name, logo_url, display_order)
SELECT
  (SELECT id FROM seasons WHERE season_number = 11),
  name,
  logo_url,
  display_order
FROM divisions
WHERE season_id = (SELECT id FROM seasons WHERE season_number = 10)
ORDER BY display_order, id;

-- Copy all S10 prices to S11.
INSERT INTO season_pokemon_prices (
  season_id,
  pokemon_id,
  price,
  tera_banned,
  tera_captain_cost,
  complex_ban_reason
)
SELECT
  (SELECT id FROM seasons WHERE season_number = 11),
  pokemon_id,
  price,
  tera_banned,
  tera_captain_cost,
  complex_ban_reason
FROM season_pokemon_prices
WHERE season_id = (SELECT id FROM seasons WHERE season_number = 10);

-- Copy S10 team assignments into empty S11 rosters, including inactive
-- predecessor teams so the copied S10 schedule maps cleanly.
INSERT INTO season_coaches (
  coach_id,
  division_id,
  team_name,
  is_active,
  replaced_by_id,
  remaining_budget,
  team_abbreviation,
  team_logo_url
)
SELECT
  sc.coach_id,
  d11.id,
  sc.team_name,
  sc.is_active,
  NULL,
  (SELECT draft_budget FROM seasons WHERE season_number = 11),
  sc.team_abbreviation,
  sc.team_logo_url
FROM season_coaches sc
JOIN divisions d10 ON d10.id = sc.division_id
JOIN divisions d11
  ON d11.name = d10.name
 AND d11.season_id = (SELECT id FROM seasons WHERE season_number = 11)
WHERE d10.season_id = (SELECT id FROM seasons WHERE season_number = 10)
ORDER BY d10.display_order, sc.id;

-- Re-map S10 replacement links to the copied S11 season-coach rows.
UPDATE season_coaches
SET replaced_by_id = (
  SELECT replacement11.id
  FROM season_coaches original10
  JOIN season_coaches replacement10
    ON replacement10.id = original10.replaced_by_id
  JOIN divisions d10
    ON d10.id = original10.division_id
  JOIN seasons s10
    ON s10.id = d10.season_id
   AND s10.season_number = 10
  JOIN divisions d11
    ON d11.name = d10.name
  JOIN seasons s11
    ON s11.id = d11.season_id
   AND s11.season_number = 11
  JOIN season_coaches replacement11
    ON replacement11.division_id = d11.id
   AND replacement11.team_name = replacement10.team_name
  WHERE original10.team_name = season_coaches.team_name
    AND d11.id = season_coaches.division_id
)
WHERE division_id IN (
  SELECT d.id
  FROM divisions d
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
)
AND EXISTS (
  SELECT 1
  FROM season_coaches original10
  JOIN divisions d10
    ON d10.id = original10.division_id
  JOIN seasons s10
    ON s10.id = d10.season_id
   AND s10.season_number = 10
  JOIN divisions d11
    ON d11.name = d10.name
  JOIN seasons s11
    ON s11.id = d11.season_id
   AND s11.season_number = 11
  WHERE original10.replaced_by_id IS NOT NULL
    AND original10.team_name = season_coaches.team_name
    AND d11.id = season_coaches.division_id
);

-- Copy the S10 regular-season schedule into S11, but leave all results and
-- replay fields empty for testing.
INSERT INTO matches (
  season_id,
  division_id,
  week,
  coach1_season_id,
  coach2_season_id,
  is_game_of_the_week
)
SELECT
  s11.id,
  d11.id,
  m10.week,
  coach1.id,
  coach2.id,
  0
FROM matches m10
JOIN seasons s10
  ON s10.id = m10.season_id
 AND s10.season_number = 10
JOIN divisions d10
  ON d10.id = m10.division_id
JOIN divisions d11
  ON d11.name = d10.name
JOIN seasons s11
  ON s11.id = d11.season_id
 AND s11.season_number = 11
JOIN season_coaches c1_10
  ON c1_10.id = m10.coach1_season_id
JOIN season_coaches c2_10
  ON c2_10.id = m10.coach2_season_id
JOIN season_coaches coach1
  ON coach1.division_id = d11.id
 AND coach1.team_name = c1_10.team_name
JOIN season_coaches coach2
  ON coach2.division_id = d11.id
 AND coach2.team_name = c2_10.team_name
WHERE m10.week <= 100
ORDER BY d10.display_order, m10.week, m10.id;

-- Copy the rosters that existed at the time of that S10 Week 1 match into
-- the fake S11 teams. Caborca intentionally remains empty for draft testing.
DELETE FROM rosters
WHERE season_coach_id IN (
  SELECT sc.id
  FROM season_coaches sc
  JOIN divisions d ON d.id = sc.division_id
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
    AND sc.team_name IN ('Ottawa Donphans', 'Richmond Ragingbolts', 'Caborca Gengars')
);

WITH copied_rosters(team_name, pokemon_id, draft_order, is_tera_captain) AS (
  VALUES
    ('Ottawa Donphans', 1023, 1, 0),
    ('Ottawa Donphans', 987, 2, 1),
    ('Ottawa Donphans', 390, 3, 0),
    ('Ottawa Donphans', 404, 4, 0),
    ('Ottawa Donphans', 1298, 5, 0),
    ('Ottawa Donphans', 244, 6, 0),
    ('Ottawa Donphans', 700, 7, 0),
    ('Ottawa Donphans', 255, 8, 1),
    ('Ottawa Donphans', 1195, 9, 1),
    ('Ottawa Donphans', 1189, 10, 0),
    ('Richmond Ragingbolts', 1002, 1, 0),
    ('Richmond Ragingbolts', 978, 2, 1),
    ('Richmond Ragingbolts', 858, 3, 0),
    ('Richmond Ragingbolts', 18, 4, 0),
    ('Richmond Ragingbolts', 5, 5, 0),
    ('Richmond Ragingbolts', 388, 6, 1),
    ('Richmond Ragingbolts', 361, 7, 0),
    ('Richmond Ragingbolts', 643, 8, 0),
    ('Richmond Ragingbolts', 1299, 9, 1),
    ('Richmond Ragingbolts', 209, 10, 0)
)
INSERT INTO rosters (
  season_coach_id,
  pokemon_id,
  price,
  draft_order,
  is_tera_captain,
  acquired_week,
  acquired_via
)
SELECT
  sc.id,
  cr.pokemon_id,
  COALESCE(spp.price, 0),
  cr.draft_order,
  cr.is_tera_captain,
  NULL,
  'TEST_S10_WEEK1_COPY'
FROM copied_rosters cr
JOIN season_coaches sc
  ON sc.team_name = cr.team_name
JOIN divisions d
  ON d.id = sc.division_id
JOIN seasons s
  ON s.id = d.season_id
LEFT JOIN season_pokemon_prices spp
  ON spp.season_id = s.id
 AND spp.pokemon_id = cr.pokemon_id
WHERE s.season_number = 11;

-- Recompute fake S11 budgets from the test rosters. Empty draft-test teams keep
-- the full draft budget; copied match-test teams get their real remaining budget.
UPDATE season_coaches
SET remaining_budget = (
  SELECT s.draft_budget - COALESCE(SUM(
    r.price +
    CASE
      WHEN r.is_tera_captain THEN COALESCE(spp.tera_captain_cost, 0)
      ELSE 0
    END
  ), 0)
  FROM divisions d
  JOIN seasons s ON s.id = d.season_id
  LEFT JOIN rosters r ON r.season_coach_id = season_coaches.id
  LEFT JOIN season_pokemon_prices spp
    ON spp.season_id = s.id
   AND spp.pokemon_id = r.pokemon_id
  WHERE d.id = season_coaches.division_id
)
WHERE division_id IN (
  SELECT d.id
  FROM divisions d
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
);

COMMIT;
