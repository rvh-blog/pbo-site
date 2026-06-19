CREATE TABLE `wiglett_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`division_id` integer,
	`status` text DEFAULT 'processing' NOT NULL,
	`payload` text,
	`result` text,
	`error` text,
	`received_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`processed_at` text,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiglett_events_event_id_unique` ON `wiglett_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_wiglett_events_event_type` ON `wiglett_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_wiglett_events_division_id` ON `wiglett_events` (`division_id`);--> statement-breakpoint
CREATE INDEX `idx_wiglett_events_status` ON `wiglett_events` (`status`);
