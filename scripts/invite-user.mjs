import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";

try {
  const source = await readFile(".env.local", "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {
  // Hosted administration can provide variables directly.
}

const [emailInput, nameInput, roleInput = "user"] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
const name = nameInput?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Usage: npm run user:invite -- email@example.com \"Display name\" [user|admin]");
if (!name) throw new Error("A display name is required.");
if (roleInput !== "user" && roleInput !== "admin") throw new Error("Role must be user or admin.");
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error("Turso is not configured.");

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
await client.execute({
  sql: `INSERT INTO users (id, email, name, role, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updated_at = excluded.updated_at`,
  args: [crypto.randomUUID(), email, name, roleInput, Date.now()],
});
console.log(`Invitation ready for ${email} with role ${roleInput}.`);
client.close();
