CREATE TABLE `solutions` (
	`subject_slug` text NOT NULL,
	`problem_id` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'not-started' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`subject_slug`, `problem_id`)
);
