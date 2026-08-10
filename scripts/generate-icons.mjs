import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const iconsDir = path.join(root, "public", "icons");

async function render(svgName, outName, size) {
  const svg = await readFile(path.join(iconsDir, svgName));
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await writeFile(path.join(iconsDir, outName), png);
  console.log(`wrote ${outName} (${size}x${size})`);
}

await render("icon-mark.svg", "icon-192.png", 192);
await render("icon-mark.svg", "icon-512.png", 512);
await render("icon-maskable.svg", "icon-mask-512.png", 512);
await render("icon-maskable.svg", "apple-touch-icon.png", 180);
