-- Demo workspace for public README screenshots.
-- The Turso dashboard executes ONE SQL statement at a time. Run each numbered
-- INSERT block separately there (do not select and run this whole file at once).
-- It is safe to run every block more than once; all identifiers use `demo-luma-`.

-- 1. Create the fictional app.
INSERT INTO apps (id, name, description, sort_order, is_active)
VALUES (
  'demo-luma',
  'Luma',
  'A fictional daily-planning app used only for public screenshots.',
  999,
  1
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- 2. Create fictional people. They have no Firebase identities or avatar photos.
-- Fictional people make the board look realistic without exposing real accounts.
INSERT INTO users (id, email, name, role, is_active)
VALUES
  ('demo-luma-ava', 'ava.demo@example.test', 'Ava Chen', 'user', 1),
  ('demo-luma-benoit', 'benoit.demo@example.test', 'Benoit Martin', 'user', 1),
  ('demo-luma-camila', 'camila.demo@example.test', 'Camila Reyes', 'user', 1)
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  name = excluded.name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = unixepoch() * 1000;

-- 3. Create the main board cards.
INSERT OR IGNORE INTO backlog_items
  (id, app_id, creator_id, title, description, type, status, priority, effort, visibility)
VALUES
  (
    'demo-luma-briefing', 'demo-luma', 'demo-luma-ava',
    'Personalize the daily briefing',
    'Let people choose the information and order shown in their morning summary.',
    'feature', 'backlog', 'high', 'medium', 'shared'
  ),
  (
    'demo-luma-share', 'demo-luma', 'demo-luma-benoit',
    'Share a plan with a single link',
    'Create a read-only link that can be sent without requiring an account.',
    'feature', 'backlog', 'medium', 'small', 'shared'
  ),
  (
    'demo-luma-empty-state', 'demo-luma', 'demo-luma-camila',
    'Clarify the empty-state guidance',
    'Make the first step obvious when a new workspace has no plans yet.',
    'improvement', 'backlog', 'low', 'small', 'shared'
  ),
  (
    'demo-luma-performance', 'demo-luma', 'demo-luma-benoit',
    'Reduce dashboard load time',
    'Improve the perceived loading time for workspaces with many plans.',
    'improvement', 'in_progress', 'high', 'large', 'shared'
  ),
  (
    'demo-luma-timezone', 'demo-luma', 'demo-luma-ava',
    'Make reminder time zones explicit',
    'Show the time zone next to scheduled reminders to prevent travel-related mistakes.',
    'bug', 'in_progress', 'urgent', 'small', 'shared'
  ),
  (
    'demo-luma-weekly-summary', 'demo-luma', 'demo-luma-camila',
    'Send a weekly progress snapshot',
    'Summarize completed plans, open items, and momentum at the end of each week.',
    'feature', 'in_review', 'medium', 'medium', 'shared'
  ),
  (
    'demo-luma-focus-states', 'demo-luma', 'demo-luma-benoit',
    'Improve keyboard focus states',
    'Make focus order and focus visibility clear throughout the workspace.',
    'task', 'in_review', 'high', 'small', 'shared'
  ),
  (
    'demo-luma-onboarding', 'demo-luma', 'demo-luma-ava',
    'Add guided onboarding',
    'Help a first-time user create a plan and schedule their first reminder.',
    'feature', 'done', 'medium', 'medium', 'shared'
  ),
  (
    'demo-luma-mobile-nav', 'demo-luma', 'demo-luma-camila',
    'Support compact mobile navigation',
    'Keep the essential actions close at hand on small screens.',
    'improvement', 'done', 'high', 'medium', 'shared'
  ),
  (
    'demo-luma-health', 'demo-luma', 'demo-luma-benoit',
    'Add API health monitoring',
    'Expose a lightweight health endpoint for deployment checks.',
    'task', 'done', 'low', 'small', 'shared'
  );

-- 4. Add linked cards for the detail view.
-- A linked card and checklist demonstrate two kinds of progress in the detail view.
INSERT OR IGNORE INTO backlog_items
  (id, app_id, creator_id, parent_id, title, description, type, status, priority, effort, visibility)
VALUES
  (
    'demo-luma-summary-template', 'demo-luma', 'demo-luma-camila', 'demo-luma-weekly-summary',
    'Draft the summary email template',
    'Create a concise template with clear progress highlights.',
    'task', 'done', 'medium', 'small', 'shared'
  ),
  (
    'demo-luma-summary-chart', 'demo-luma', 'demo-luma-camila', 'demo-luma-weekly-summary',
    'Add a completion-trend chart',
    'Show week-over-week completion momentum.',
    'task', 'in_review', 'medium', 'medium', 'shared'
  );

-- 5. Add checklist progress.
INSERT OR IGNORE INTO checklist_items (id, request_id, title, done, sort_order)
VALUES
  ('demo-luma-check-brief', 'demo-luma-weekly-summary', 'Choose the headline metrics', 1, 0),
  ('demo-luma-check-copy', 'demo-luma-weekly-summary', 'Review the summary copy', 1, 1),
  ('demo-luma-check-email', 'demo-luma-weekly-summary', 'Test the email layout', 0, 2);

-- 6. Add votes.
INSERT OR IGNORE INTO votes (item_id, user_id)
VALUES
  ('demo-luma-briefing', 'demo-luma-benoit'),
  ('demo-luma-briefing', 'demo-luma-camila'),
  ('demo-luma-share', 'demo-luma-ava'),
  ('demo-luma-timezone', 'demo-luma-benoit'),
  ('demo-luma-weekly-summary', 'demo-luma-ava'),
  ('demo-luma-weekly-summary', 'demo-luma-benoit'),
  ('demo-luma-weekly-summary', 'demo-luma-camila'),
  ('demo-luma-mobile-nav', 'demo-luma-ava');

-- Cleanup (run each statement separately later to remove the demo workspace):
-- DELETE FROM apps WHERE id = 'demo-luma';
-- DELETE FROM users WHERE id IN ('demo-luma-ava', 'demo-luma-benoit', 'demo-luma-camila');
