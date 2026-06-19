-- Add is_game_of_the_week column to matches table
ALTER TABLE matches ADD COLUMN is_game_of_the_week INTEGER DEFAULT 0;
