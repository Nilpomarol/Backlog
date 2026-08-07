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

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error("Turso is not configured.");
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const result = await client.execute("SELECT email, name, role, CASE WHEN is_active = 0 THEN 'revoked' WHEN firebase_uid IS NULL THEN 'pending' ELSE 'linked' END AS status FROM users ORDER BY is_active DESC, role, email");
console.table(result.rows.map((row) => ({ email: String(row.email), name: String(row.name), role: String(row.role), status: String(row.status) })));
client.close();
