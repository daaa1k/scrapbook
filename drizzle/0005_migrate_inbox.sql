DELETE FROM notebooks
WHERE title = '受信箱'
AND NOT EXISTS (
	SELECT 1 FROM sources WHERE sources.notebook_id = notebooks.id
);
--> statement-breakpoint
DROP TABLE IF EXISTS `_migrate_inbox_titles`;
--> statement-breakpoint
CREATE TABLE `_migrate_inbox_titles` (
	`ord` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `_migrate_inbox_titles` (`ord`, `title`) VALUES (1, '移行済みノート');
--> statement-breakpoint
INSERT INTO `_migrate_inbox_titles` (`ord`, `title`)
WITH RECURSIVE seq(n) AS (
	SELECT 2
	UNION ALL
	SELECT n + 1 FROM seq WHERE n < 500
)
SELECT n, '移行済みノート (' || n || ')' FROM seq;
--> statement-breakpoint
UPDATE notebooks
SET title = (
	SELECT title FROM `_migrate_inbox_titles`
	WHERE title NOT IN (SELECT title FROM notebooks)
	ORDER BY ord
	LIMIT 1
)
WHERE title = '受信箱';
--> statement-breakpoint
DROP TABLE `_migrate_inbox_titles`;
