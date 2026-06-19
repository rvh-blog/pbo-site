-- Add trivia_rewards table for tracking trivia/minigame coin awards
CREATE TABLE `trivia_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coach_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`awarded_by` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `idx_trivia_rewards_coach` ON `trivia_rewards` (`coach_id`);
CREATE INDEX `idx_trivia_rewards_season` ON `trivia_rewards` (`season_id`);
