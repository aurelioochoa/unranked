CREATE TABLE `ai_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`operation` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`ok` integer DEFAULT true NOT NULL,
	`fell_back` integer DEFAULT false NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `ai_calls_at` ON `ai_calls` (`at`);--> statement-breakpoint
CREATE TABLE `dungeon_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`objective` text NOT NULL,
	`track` text NOT NULL,
	`started_at` integer NOT NULL,
	`planned_ms` integer NOT NULL,
	`ended_at` integer,
	`outcome` text,
	`awarded_xp` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dungeon_runs_hunter_started` ON `dungeon_runs` (`hunter_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text,
	`url` text,
	`note` text,
	`sha256` text,
	`bytes` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hunters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`daily_reset_hour` integer DEFAULT 4 NOT NULL,
	`rotating_quest_count` integer DEFAULT 2 NOT NULL,
	`difficulty` text DEFAULT 'NORMAL' NOT NULL,
	`theme` text DEFAULT 'hologram' NOT NULL,
	`voice_adapter` text DEFAULT 'webspeech' NOT NULL,
	`voice_id` text,
	`voice_rate` integer DEFAULT 100 NOT NULL,
	`voice_pitch` integer DEFAULT 100 NOT NULL,
	`voice_volume` integer DEFAULT 100 NOT NULL,
	`voice_policy` text DEFAULT 'EVENTS' NOT NULL,
	`rank` text DEFAULT 'UNRANKED' NOT NULL,
	`total_xp` integer DEFAULT 0 NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`spent_points` integer DEFAULT 0 NOT NULL,
	`allocated` text DEFAULT '{}' NOT NULL,
	`excelia` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`loot_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`source_id` text,
	`consumed_at` integer,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_hunter_unconsumed` ON `inventory` (`hunter_id`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `penalties` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`source_quest_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`requirement` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`resolved_at` integer,
	`evidence_id` text,
	`escalation` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `penalties_hunter_status` ON `penalties` (`hunter_id`,`status`);--> statement-breakpoint
CREATE TABLE `quest_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`track` text NOT NULL,
	`tier` integer DEFAULT 2 NOT NULL,
	`stat_rewards` text DEFAULT '{}' NOT NULL,
	`base_xp` integer NOT NULL,
	`base_gold` integer DEFAULT 0 NOT NULL,
	`is_core` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quest_templates_hunter` ON `quest_templates` (`hunter_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `quests` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`template_id` text NOT NULL,
	`day_key` text NOT NULL,
	`issued_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'ISSUED' NOT NULL,
	`completed_at` integer,
	`evidence_id` text,
	`awarded_xp` integer DEFAULT 0 NOT NULL,
	`multiplier_milli` integer DEFAULT 1000 NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `quest_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quests_one_per_template_per_day` ON `quests` (`hunter_id`,`template_id`,`day_key`);--> statement-breakpoint
CREATE INDEX `quests_hunter_status_due` ON `quests` (`hunter_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `stat_events` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`at` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`xp` integer DEFAULT 0 NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`excelia` text DEFAULT '{}' NOT NULL,
	`allocated` text DEFAULT '{}' NOT NULL,
	`note` text,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stat_events_hunter_at` ON `stat_events` (`hunter_id`,`at`);--> statement-breakpoint
CREATE TABLE `system_log` (
	`id` text PRIMARY KEY NOT NULL,
	`hunter_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`generated` integer DEFAULT false NOT NULL,
	`spoken` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`hunter_id`) REFERENCES `hunters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `system_log_hunter_at` ON `system_log` (`hunter_id`,`at`);