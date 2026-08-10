PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_backlog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`effort` text DEFAULT 'unknown' NOT NULL,
	`visibility` text DEFAULT 'shared' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "backlog_items_type_check" CHECK("__new_backlog_items"."type" in ('bug', 'feature', 'improvement', 'task', 'investigation')),
	CONSTRAINT "backlog_items_status_check" CHECK("__new_backlog_items"."status" in ('backlog', 'in_progress', 'in_review', 'done', 'discarded')),
	CONSTRAINT "backlog_items_priority_check" CHECK("__new_backlog_items"."priority" in ('urgent', 'high', 'medium', 'low', 'none')),
	CONSTRAINT "backlog_items_effort_check" CHECK("__new_backlog_items"."effort" in ('small', 'medium', 'large', 'unknown')),
	CONSTRAINT "backlog_items_visibility_check" CHECK("__new_backlog_items"."visibility" in ('shared', 'internal'))
);
--> statement-breakpoint
INSERT INTO `__new_backlog_items`("id", "app_id", "creator_id", "parent_id", "title", "description", "type", "status", "priority", "effort", "visibility", "created_at", "updated_at")
SELECT "id", "app_id", "creator_id", "parent_id", "title", "description", "type", "status", "priority", "effort", "visibility", "created_at", "updated_at" FROM `backlog_items`;
--> statement-breakpoint
DROP TABLE `backlog_items`;
--> statement-breakpoint
ALTER TABLE `__new_backlog_items` RENAME TO `backlog_items`;
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_app_status` ON `backlog_items` (`app_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_app_visibility` ON `backlog_items` (`app_id`,`visibility`);
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_app_priority` ON `backlog_items` (`app_id`,`priority`);
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_creator` ON `backlog_items` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_parent` ON `backlog_items` (`parent_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
