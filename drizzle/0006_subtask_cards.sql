ALTER TABLE `backlog_items` ADD `parent_id` text REFERENCES backlog_items(id) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `idx_backlog_items_parent` ON `backlog_items` (`parent_id`);
--> statement-breakpoint
INSERT INTO backlog_items (id, app_id, creator_id, title, description, type, status, visibility, parent_id, created_at, updated_at)
SELECT s.id, b.app_id, b.creator_id, s.title, NULL, 'task',
    CASE WHEN s.completed = 1 THEN 'done' ELSE 'backlog' END,
    'internal', s.item_id, s.created_at, s.updated_at
FROM subtasks s JOIN backlog_items b ON b.id = s.item_id;
--> statement-breakpoint
DROP TABLE `subtasks`;
