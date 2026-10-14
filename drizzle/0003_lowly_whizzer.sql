CREATE TABLE `assistant_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`next_index` integer DEFAULT 0 NOT NULL,
	`at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_messages_hunter_at` ON `assistant_messages` (`hunter_id`,`at`);--> statement-breakpoint
CREATE TABLE `assistant_preferences` (
	`hunter_id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
