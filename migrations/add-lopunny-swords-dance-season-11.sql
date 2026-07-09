-- Add league-reviewed S11 National Dex move correction for Lopunny and Lopunny-Mega.
-- This appends swords-dance to the season-specific move override only when it is missing.
UPDATE season_pokemon_moves
SET
  moves = json_insert(moves, '$[#]', 'swords-dance'),
  source = source || '; manual additions swordsdance',
  updated_at = datetime('now')
WHERE season_id = (SELECT id FROM seasons WHERE season_number = 11)
  AND pokemon_id IN (
    SELECT id
    FROM pokemon
    WHERE display_name IN ('Lopunny', 'Lopunny-Mega')
       OR name IN ('Lopunny', 'Lopunny-mega')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(season_pokemon_moves.moves)
    WHERE json_each.value = 'swords-dance'
  );
