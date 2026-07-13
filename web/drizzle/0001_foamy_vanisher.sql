CREATE TABLE `grades` (
	`subject_slug` text NOT NULL,
	`problem_id` text NOT NULL,
	`score` integer NOT NULL,
	`verdict` text NOT NULL,
	`summary` text NOT NULL,
	`strengths` text NOT NULL,
	`improvements` text NOT NULL,
	`next_step` text NOT NULL,
	`confidence` text NOT NULL,
	`model` text NOT NULL,
	`solution_snapshot` text NOT NULL,
	`graded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`subject_slug`, `problem_id`)
);
