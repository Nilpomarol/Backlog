import { readFile, writeFile } from "node:fs/promises";

try {
  const source = await readFile(".env.local", "utf8");
  const values = Object.fromEntries(source.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2]]));
  const names = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "FIREBASE_PROJECT_ID"];
  if (!values.FIREBASE_PROJECT_ID) values.FIREBASE_PROJECT_ID = values.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const output = names.filter((name) => values[name]).map((name) => `${name}=${values[name]}`).join("\n");
  await writeFile(".dev.vars", `${output}\n`, { mode: 0o600 });
} catch {
  // Hosted and CI environments provide runtime values directly.
}
