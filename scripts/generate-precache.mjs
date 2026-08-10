import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const clientDirectory = path.resolve("dist/client");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

const excluded = new Set(["/sw.js", "/precache-manifest.js", "/.assetsignore", "/_headers"]);
const files = (await filesBelow(clientDirectory))
  .map((absolute) => ({ absolute, url: `/${path.relative(clientDirectory, absolute).replaceAll(path.sep, "/")}` }))
  .filter(({ url }) => !excluded.has(url) && !url.startsWith("/.vite/"))
  .sort((left, right) => left.url.localeCompare(right.url));

const hash = createHash("sha256");
for (const file of files) {
  hash.update(file.url);
  hash.update(await readFile(file.absolute));
}
const digest = hash.digest("hex").slice(0, 12);
const source = `self.__BACKLOG_CACHE_VERSION = ${JSON.stringify(digest)};\nself.__BACKLOG_PRECACHE = ${JSON.stringify(files.map(({ url }) => url), null, 2)};\n`;
await writeFile(path.join(clientDirectory, "precache-manifest.js"), source, "utf8");

// Guard against a broken build silently publishing an empty offline shell.
const generated = await readFile(path.join(clientDirectory, "precache-manifest.js"), "utf8");
if (!generated.includes("/assets/")) throw new Error("The generated offline precache contains no application assets.");
