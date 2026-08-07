import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

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

const client = createClient({ url, authToken });
await client.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");

const migrationFiles = (await readdir(resolve("drizzle"))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
let appliedMigrations = 0;
for (const migrationFile of migrationFiles) {
  const migrationName = basename(migrationFile, ".sql");
  const existing = await client.execute({ sql: "SELECT name FROM schema_migrations WHERE name = ?", args: [migrationName] });
  if (existing.rows.length > 0) continue;
  const migration = await readFile(resolve("drizzle", migrationFile), "utf8");
  const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
  for (const sql of statements) await client.execute(sql);
  await client.execute({ sql: "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", args: [migrationName, Date.now()] });
  console.log(`Applied ${migrationName}.`);
  appliedMigrations += 1;
}
if (appliedMigrations === 0) console.log("Database schema is already up to date.");

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (adminEmail) {
  await client.execute({
    sql: `INSERT INTO users (id, email, name, role, is_active, updated_at)
          VALUES (?, ?, ?, 'admin', 1, ?)
          ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = 'admin', is_active = 1, updated_at = excluded.updated_at`,
    args: [crypto.randomUUID(), adminEmail, process.env.ADMIN_NAME?.trim() || "Administrator", Date.now()],
  });
  console.log(`Administrator invitation ready for ${adminEmail}.`);
} else {
  console.log("Schema created. Add ADMIN_EMAIL to .env.local and run this command again to invite the administrator.");
}

const applicationSeeds = [
  ["atlas", "Atlas", "Explora països, cultures i el món que t’envolta.", 0],
  ["homebase", "Homebase", "Organització compartida per a la llar.", 1],
  ["pocket-recipes", "Pocket Recipes", "Receptes preferides sempre a mà.", 2],
];
for (const application of applicationSeeds) {
  await client.execute({
    sql: `INSERT INTO apps (id, name, description, sort_order)
          VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    args: application,
  });
}

console.log("Database setup complete.");
client.close();
