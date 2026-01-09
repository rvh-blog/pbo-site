CREATE TABLE `playoff_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`division_id` integer NOT NULL,
	`round` integer NOT NULL,
	`bracket_position` integer NOT NULL,
	`higher_seed_id` integer,
	`lower_seed_id` integer,
	`winner_id` integer,
	`higher_seed_wins` integer DEFAULT 0,
	`lower_seed_wins` integer DEFAULT 0,
	`played_at` text,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`higher_seed_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lower_seed_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_id`) REFERENCES `season_coaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `coaches` ADD `elo_rating` real DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `divisions` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `divisions` ADD `display_order` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `matches` ADD `replay_url` text;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `pokedex_id` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `artwork_url` text;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `hp` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `attack` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `defense` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `special_attack` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `special_defense` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `speed` integer;--> statement-breakpoint
ALTER TABLE `pokemon` ADD `base_stat_total` integer;--> statement-breakpoint
ALTER TABLE `season_coaches` ADD `team_abbreviation` text;--> statement-breakpoint
ALTER TABLE `season_coaches` ADD `team_logo_url` text;--> statement-breakpoint
ALTER TABLE `season_pokemon_prices` ADD `tera_banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `season_pokemon_prices` ADD `tera_captain_cost` integer;--> statement-breakpoint
ALTER TABLE `season_pokemon_prices` ADD `complex_ban_reason` text;