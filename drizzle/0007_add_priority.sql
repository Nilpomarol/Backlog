ALTER TABLE `backlog_items` ADD `priority` text DEFAULT 'none' NOT NULL CONSTRAINT "backlog_items_priority_check" CHECK("backlog_items"."priority" in ('urgent', 'high', 'medium', 'low', 'none'));
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_app_priority` ON `backlog_items` (`app_id`,`priority`);
