CREATE TABLE `coaches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `divisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `elo_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer NOT NULL,
	`elo_rating` real NOT NULL,
	`match_id` integer,
	`recorded_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_pokemon` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`season_coach_id` integer NOT NULL,
	`pokemon_id` integer NOT NULL,
	`kills` integer DEFAULT 0,
	`deaths` integer DEFAULT 0,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_coach_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pokemon_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`division_id` integer NOT NULL,
	`week` integer NOT NULL,
	`coach1_season_id` integer NOT NULL,
	`coach2_season_id` integer NOT NULL,
	`winner_id` integer,
	`coach1_differential` integer DEFAULT 0,
	`coach2_differential` integer DEFAULT 0,
	`is_forfeit` integer DEFAULT false,
	`played_at` text,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach1_season_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach2_season_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pokemon` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sprite_url` text,
	`types` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pokemon_name_unique` ON `pokemon` (`name`);--> statement-breakpoint
CREATE TABLE `rosters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_coach_id` integer NOT NULL,
	`pokemon_id` integer NOT NULL,
	`price` integer NOT NULL,
	`draft_order` integer,
	FOREIGN KEY (`season_coach_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pokemon_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `season_coaches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer NOT NULL,
	`division_id` integer NOT NULL,
	`team_name` text NOT NULL,
	`is_active` integer DEFAULT true,
	`replaced_by_id` integer,
	`remaining_budget` integer,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `season_pokemon_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`pokemon_id` integer NOT NULL,
	`price` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pokemon_id`) REFERENCES `pokemon`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`is_current` integer DEFAULT false,
	`draft_budget` integer DEFAULT 100
);
