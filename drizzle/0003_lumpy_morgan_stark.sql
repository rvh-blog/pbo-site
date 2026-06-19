CREATE TABLE `abilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pokeapi_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`short_effect` text,
	`full_effect` text,
	`generation` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abilities_pokeapi_id_unique` ON `abilities` (`pokeapi_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `abilities_name_unique` ON `abilities` (`name`);--> statement-breakpoint
CREATE TABLE `bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer NOT NULL,
	`match_id` integer NOT NULL,
	`predicted_winner_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`odds` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payout` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`resolved_at` text,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predicted_winner_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bets_coach_id` ON `bets` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_match_id` ON `bets` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_status` ON `bets` (`status`);--> statement-breakpoint
CREATE TABLE `coach_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`purchased_at` text NOT NULL,
	`expires_at` text,
	`is_active` integer DEFAULT true,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `store_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_coach_purchases_coach_id` ON `coach_purchases` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_coach_purchases_item_id` ON `coach_purchases` (`item_id`);--> statement-breakpoint
CREATE TABLE `discord_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` integer NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text,
	`division_id` integer NOT NULL,
	`is_draft_enabled` integer DEFAULT false,
	`is_match_report_enabled` integer DEFAULT true,
	FOREIGN KEY (`guild_id`) REFERENCES `discord_guilds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_discord_channels_channel_id` ON `discord_channels` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_discord_channels_division_id` ON `discord_channels` (`division_id`);--> statement-breakpoint
CREATE TABLE `discord_guilds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_guilds_guild_id_unique` ON `discord_guilds` (`guild_id`);--> statement-breakpoint
CREATE TABLE `moves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pokeapi_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`type` text,
	`damage_class` text,
	`power` integer,
	`accuracy` integer,
	`pp` integer,
	`priority` integer DEFAULT 0,
	`effect_chance` integer,
	`effect_description` text,
	`target` text,
	`generation` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moves_pokeapi_id_unique` ON `moves` (`pokeapi_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `moves_name_unique` ON `moves` (`name`);--> statement-breakpoint
CREATE TABLE `pick_em_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`season_id` integer NOT NULL,
	`coach_id` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pick_em_participants_season_id` ON `pick_em_participants` (`season_id`);--> statement-breakpoint
CREATE INDEX `idx_pick_em_participants_coach_id` ON `pick_em_participants` (`coach_id`);--> statement-breakpoint
CREATE TABLE `pick_em_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`match_id` integer NOT NULL,
	`predicted_winner_id` integer NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`participant_id`) REFERENCES `pick_em_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predicted_winner_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pick_em_picks_participant_id` ON `pick_em_picks` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_pick_em_picks_match_id` ON `pick_em_picks` (`match_id`);--> statement-breakpoint
CREATE TABLE `store_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`category` text NOT NULL,
	`is_active` integer DEFAULT true,
	`max_per_user` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_items_slug_unique` ON `store_items` (`slug`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`type` text NOT NULL,
	`week` integer NOT NULL,
	`season_coach_id` integer NOT NULL,
	`team_abbreviation` text,
	`trading_partner_season_coach_id` integer,
	`trading_partner_abbreviation` text,
	`pokemon_in` text,
	`pokemon_out` text,
	`new_tera_captain_id` integer,
	`old_tera_captain_id` integer,
	`budget_change` integer DEFAULT 0,
	`counts_against_limit` integer DEFAULT true,
	`notes` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_coach_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trading_partner_season_coach_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_tera_captain_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`old_tera_captain_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_season_coach_id` ON `transactions` (`season_coach_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_season_id` ON `transactions` (`season_id`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`coach_id` integer,
	`user_id` integer,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_token_unique` ON `user_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_token` ON `user_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_coach_id` ON `user_sessions` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_user_id` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_mod` integer DEFAULT false,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `coaches` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `coaches` ADD `is_mod` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `coaches` ADD `claimed_at` text;--> statement-breakpoint
ALTER TABLE `coaches` ADD `pbo_coin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `playoff_matches` ADD `match_id` integer REFERENCES matches(id);--> statement-breakpoint
ALTER TABLE `pokemon` ADD `moves` text;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `abilities` text;--> statement-breakpoint
ALTER TABLE `rosters` ADD `acquired_week` integer;--> statement-breakpoint
ALTER TABLE `rosters` ADD `acquired_via` text;--> statement-breakpoint
ALTER TABLE `rosters` ADD `acquired_transaction_id` integer;--> statement-breakpoint
CREATE INDEX `idx_rosters_season_coach_id` ON `rosters` (`season_coach_id`);--> statement-breakpoint
CREATE INDEX `idx_rosters_pokemon_id` ON `rosters` (`pokemon_id`);--> statement-breakpoint
ALTER TABLE `seasons` ADD `season_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `seasons` ADD `is_schedule_public` integer DEFAULT true;--> statement-breakpoint
CREATE INDEX `idx_divisions_season_id` ON `divisions` (`season_id`);--> statement-breakpoint
CREATE INDEX `idx_elo_history_coach_id` ON `elo_history` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_elo_history_match_id` ON `elo_history` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_match_pokemon_match_id` ON `match_pokemon` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_match_pokemon_season_coach_id` ON `match_pokemon` (`season_coach_id`);--> statement-breakpoint
CREATE INDEX `idx_matches_season_id` ON `matches` (`season_id`);--> statement-breakpoint
CREATE INDEX `idx_matches_division_id` ON `matches` (`division_id`);--> statement-breakpoint
CREATE INDEX `idx_matches_winner_id` ON `matches` (`winner_id`);--> statement-breakpoint
CREATE INDEX `idx_season_coaches_coach_id` ON `season_coaches` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_season_coaches_division_id` ON `season_coaches` (`division_id`);--> statement-breakpoint
CREATE INDEX `idx_season_pokemon_prices_season_id` ON `season_pokemon_prices` (`season_id`);--> statement-breakpoint
CREATE INDEX `idx_season_pokemon_prices_pokemon_id` ON `season_pokemon_prices` (`pokemon_id`);