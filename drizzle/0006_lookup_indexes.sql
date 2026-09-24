CREATE INDEX `jobs_source_created_idx` ON `jobs` (`source_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `citations_source_created_idx` ON `citations` (`source_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `cursor_runs_run_idx` ON `cursor_runs` (`run_id`);
