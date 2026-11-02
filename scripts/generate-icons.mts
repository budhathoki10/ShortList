// Renders the PNG icon set from public/shortlist-icon.svg. Run: npx tsx scripts/generate-icons.mts
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve("public/icons");
const BG = "#11131a";
const mark = (size: number, inset: number) => {
  // The check mark on the brand tile. `inset` shrinks the artwork into the maskable safe zone.
  const s = size - inset * 2;
  const k = s / 512;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${inset} ${inset}) scale(${k})"><path d="M133 266l82 82 166-180" fill="none" stroke="#fff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
  );
};
const tile = (size: number, radius: number) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/></svg>`);

async function png(size: number, file: string, { maskable = false, square = false } = {}) {
  // Maskable and Apple icons are full-bleed squares (the OS rounds them); "any" icons keep the rounded tile.
  const full = maskable || square;
  const base = sharp(tile(size, full ? 0 : Math.round(size * 0.219)));
  const inset = maskable ? Math.round(size * 0.2) : 0;
  const buf = await base.composite([{ input: mark(size, inset) }]).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(out, file), buf);
  return buf;
}

await mkdir(out, { recursive: true });
const sizes = [16, 32, 48, 96, 128, 192, 256, 384, 512];
for (const s of sizes) await png(s, `icon-${s}.png`);
await png(192, "maskable-192.png", { maskable: true });
await png(512, "maskable-512.png", { maskable: true });
await png(180, "apple-touch-icon.png", { square: true });
console.log("icons written to", out);
