ALTER TABLE `pokemon` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `rosters` ADD `is_tera_captain` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `seasons` ADD `is_public` integer DEFAULT true;