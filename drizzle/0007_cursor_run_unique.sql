DELETE FROM `cursor_runs`
WHERE `rowid` NOT IN (
  SELECT MIN(`rowid`) FROM `cursor_runs` GROUP BY `job_id`, `run_id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cursor_runs_job_run_unique` ON `cursor_runs` (`job_id`, `run_id`);
