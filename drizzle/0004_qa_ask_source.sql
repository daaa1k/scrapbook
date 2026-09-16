CREATE TABLE `qa_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`job_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
);
--> statement-breakpoint
CREATE INDEX `qa_answers_source_created_idx` ON `qa_answers` (`source_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `qa_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`qa_answer_id` text NOT NULL,
	`locator` text NOT NULL,
	`excerpt` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`qa_answer_id`) REFERENCES `qa_answers`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qa_citations_answer_created_idx` ON `qa_citations` (`qa_answer_id`,`created_at`);
