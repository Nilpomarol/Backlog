ALTER TABLE `backlog_items` ADD `effort` text DEFAULT 'unknown' NOT NULL CONSTRAINT "backlog_items_effort_check" CHECK("backlog_items"."effort" in ('small', 'medium', 'large', 'unknown'));
