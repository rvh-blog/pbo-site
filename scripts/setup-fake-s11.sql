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

-- Copy S10 team assignments into empty S11 rosters.
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

-- Clear fake copied rosters so Season 11 starts undrafted.
DELETE FROM rosters
WHERE season_coach_id IN (
  SELECT sc.id
  FROM season_coaches sc
  JOIN divisions d ON d.id = sc.division_id
  JOIN seasons s ON s.id = d.season_id
  WHERE s.season_number = 11
    AND sc.team_name IN ('Ottawa Donphans', 'Richmond Ragingbolts', 'Caborca Gengars')
);

-- Recompute fake S11 budgets from current roster state. Empty teams keep
-- the full draft budget.
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
