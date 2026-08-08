import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function loadLocalEnvironment() {
  try {
    const source = await readFile(resolve(".env.local"), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // CI and hosted environments can provide variables directly.
  }
}

await loadLocalEnvironment();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) throw new Error("Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to .env.local first.");

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!adminEmail) throw new Error("Add ADMIN_EMAIL to .env.local and run `npm run db:setup` first.");

const client = createClient({ url, authToken });

const [admin] = (await client.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [adminEmail] })).rows;
if (!admin) throw new Error(`No user found for ${adminEmail}. Run \`npm run db:setup\` first.`);

const [app] = (await client.execute({ sql: "SELECT id FROM apps WHERE id = 'atlas'" })).rows;
if (!app) throw new Error("The 'atlas' demo app doesn't exist. Run `npm run db:setup` first.");

const now = Date.now();
const parentId = "demo-parent-task";

await client.execute({
  sql: `INSERT INTO backlog_items (id, app_id, creator_id, title, description, type, status, visibility, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'task', 'in_progress', 'shared', NULL, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
  args: [parentId, app.id, admin.id, "Plan the autumn release", "A demo task with linked subtask cards.", now, now],
});

const childSeeds = [
  ["demo-child-backlog", "Draft the release notes", "backlog"],
  ["demo-child-in-progress", "Update the onboarding screenshots", "in_progress"],
  ["demo-child-done", "Confirm translations are complete", "done"],
];

for (const [id, title, status] of childSeeds) {
  await client.execute({
    sql: `INSERT INTO backlog_items (id, app_id, creator_id, title, description, type, status, visibility, parent_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, 'task', ?, 'internal', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [id, app.id, admin.id, title, status, parentId, now, now],
  });
}

console.log(`Seeded "${parentId}" with ${childSeeds.length} subtask cards across different board columns.`);
client.close();
