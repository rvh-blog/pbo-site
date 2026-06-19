CREATE TABLE `death_bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer,
	`user_id` integer,
	`match_id` integer NOT NULL,
	`pokemon_id` integer NOT NULL,
	`season_coach_id` integer NOT NULL,
	`bet_type` text NOT NULL,
	`amount` integer NOT NULL,
	`odds` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payout` integer,
	`actual_died` integer,
	`was_brought` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`resolved_at` text,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pokemon_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_coach_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_death_bets_coach_id` ON `death_bets` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_death_bets_user_id` ON `death_bets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_death_bets_match_id` ON `death_bets` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_death_bets_pokemon_id` ON `death_bets` (`pokemon_id`);--> statement-breakpoint
CREATE INDEX `idx_death_bets_status` ON `death_bets` (`status`);--> statement-breakpoint
CREATE TABLE `division_sheet_sync` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`division_id` integer NOT NULL,
	`spreadsheet_id` text NOT NULL,
	`sync_enabled` integer DEFAULT true,
	`last_sync_at` text,
	`last_sync_status` text,
	`last_sync_error` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `division_sheet_sync_division_id_unique` ON `division_sheet_sync` (`division_id`);--> statement-breakpoint
CREATE INDEX `idx_division_sheet_sync_division_id` ON `division_sheet_sync` (`division_id`);--> statement-breakpoint
CREATE TABLE `kill_bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer,
	`user_id` integer,
	`match_id` integer NOT NULL,
	`pokemon_id` integer NOT NULL,
	`season_coach_id` integer NOT NULL,
	`kill_threshold` integer NOT NULL,
	`bet_type` text DEFAULT 'over' NOT NULL,
	`amount` integer NOT NULL,
	`odds` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payout` integer,
	`actual_kills` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`resolved_at` text,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pokemon_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_coach_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kill_bets_coach_id` ON `kill_bets` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_kill_bets_user_id` ON `kill_bets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_kill_bets_match_id` ON `kill_bets` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_kill_bets_pokemon_id` ON `kill_bets` (`pokemon_id`);--> statement-breakpoint
CREATE INDEX `idx_kill_bets_status` ON `kill_bets` (`status`);--> statement-breakpoint
CREATE TABLE `pick_em_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`week` integer NOT NULL,
	`division_id` integer,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`participant_id`) REFERENCES `pick_em_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pick_em_rewards_season_week` ON `pick_em_rewards` (`season_id`,`week`);--> statement-breakpoint
CREATE INDEX `idx_pick_em_rewards_participant` ON `pick_em_rewards` (`participant_id`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer,
	`user_id` integer,
	`page` text NOT NULL,
	`preferences` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_user_prefs_coach` ON `user_preferences` (`coach_id`,`page`);--> statement-breakpoint
CREATE INDEX `idx_user_prefs_user` ON `user_preferences` (`user_id`,`page`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer,
	`user_id` integer,
	`match_id` integer NOT NULL,
	`predicted_winner_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`odds` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payout` integer,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`resolved_at` text,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`predicted_winner_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_bets`("id", "coach_id", "user_id", "match_id", "predicted_winner_id", "amount", "odds", "status", "payout", "created_at", "resolved_at") SELECT "id", "coach_id", "user_id", "match_id", "predicted_winner_id", "amount", "odds", "status", "payout", "created_at", "resolved_at" FROM `bets`;--> statement-breakpoint
DROP TABLE `bets`;--> statement-breakpoint
ALTER TABLE `__new_bets` RENAME TO `bets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_bets_coach_id` ON `bets` (`coach_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_user_id` ON `bets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_match_id` ON `bets` (`match_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_status` ON `bets` (`status`);--> statement-breakpoint
ALTER TABLE `coach_purchases` ADD `bonus_reason` text;--> statement-breakpoint
ALTER TABLE `coach_purchases` ADD `glow_color` text;--> statement-breakpoint
ALTER TABLE `coach_purchases` ADD `bg_color` text;--> statement-breakpoint
ALTER TABLE `coach_purchases` ADD `border_color` text;--> statement-breakpoint
ALTER TABLE `discord_channels` ADD `is_schedule_enabled` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `matches` ADD `scheduled_at` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `ended_at` text;--> statement-breakpoint
ALTER TABLE `pick_em_participants` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `idx_pick_em_participants_user_id` ON `pick_em_participants` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `pbo_coin` integer DEFAULT 0 NOT NULL;