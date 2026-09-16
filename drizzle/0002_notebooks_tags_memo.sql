CREATE TABLE `_organization_title_guard` (
	`ok` integer NOT NULL,
	CHECK (`ok` = 1)
);
--> statement-breakpoint
INSERT INTO `_organization_title_guard` (`ok`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1 FROM `notebooks`
		WHERE `title` != '受信箱'
		GROUP BY `title`
		HAVING COUNT(*) > 1
	) THEN 0
	ELSE 1
END;
--> statement-breakpoint
DROP TABLE `_organization_title_guard`;
--> statement-breakpoint
DROP TABLE IF EXISTS `_inbox_keep`;
--> statement-breakpoint
DROP TABLE IF EXISTS `_inbox_drop`;
--> statement-breakpoint
CREATE TABLE `_inbox_keep` AS
SELECT `id` FROM `notebooks`
WHERE `title` = '受信箱'
ORDER BY `created_at` ASC, `id` ASC
LIMIT 1;
--> statement-breakpoint
CREATE TABLE `_inbox_drop` AS
SELECT `id` FROM `notebooks`
WHERE `title` = '受信箱'
AND `id` NOT IN (SELECT `id` FROM `_inbox_keep`);
--> statement-breakpoint
UPDATE `sources`
SET `notebook_id` = (SELECT `id` FROM `_inbox_keep`)
WHERE `notebook_id` IN (SELECT `id` FROM `_inbox_drop`);
--> statement-breakpoint
DELETE FROM `notebooks`
WHERE `id` IN (SELECT `id` FROM `_inbox_drop`);
--> statement-breakpoint
DROP TABLE `_inbox_keep`;
--> statement-breakpoint
DROP TABLE `_inbox_drop`;
--> statement-breakpoint
CREATE TABLE `source_tags` (
	`source_id` text NOT NULL,
	`tag_name` text NOT NULL,
	PRIMARY KEY(`source_id`, `tag_name`),
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_tags_tag_source_idx` ON `source_tags` (`tag_name`,`source_id`);--> statement-breakpoint
ALTER TABLE `sources` ADD `memo` text;--> statement-breakpoint
CREATE INDEX `sources_notebook_created_idx` ON `sources` (`notebook_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notebooks_title_unique` ON `notebooks` (`title`);
