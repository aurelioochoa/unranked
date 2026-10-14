ALTER TABLE `hunters` ADD `background` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `hunters` ADD `onboarded_at` integer;--> statement-breakpoint
-- An existing hunter has already been playing; an upgrade must not drop them
-- into the Awakening. Backfill from created_at so the column reads as "when
-- this record began" for them too. Settings can replay the ritual on request.
UPDATE `hunters` SET `onboarded_at` = `created_at` WHERE `onboarded_at` IS NULL;
