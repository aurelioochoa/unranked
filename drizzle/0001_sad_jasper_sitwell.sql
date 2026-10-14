ALTER TABLE `hunters` ADD `ai_provider` text;--> statement-breakpoint
ALTER TABLE `hunters` ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE `hunters` ADD `ai_base_url` text;--> statement-breakpoint
ALTER TABLE `hunters` ADD `ai_thinking` integer;--> statement-breakpoint
ALTER TABLE `hunters` ADD `ai_reasoning_tokens` integer;--> statement-breakpoint
ALTER TABLE `hunters` ADD `ai_thinking_timeout_ms` integer;--> statement-breakpoint
ALTER TABLE `hunters` ADD `ai_max_output_tokens` integer;--> statement-breakpoint
ALTER TABLE `hunters` ADD `webllm_model` text;