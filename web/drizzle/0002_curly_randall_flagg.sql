CREATE TABLE `model_usage_daily` (
	`usage_date` text NOT NULL,
	`model` text NOT NULL,
	`used_tokens` integer DEFAULT 0 NOT NULL,
	`reserved_tokens` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`usage_date`, `model`)
);
