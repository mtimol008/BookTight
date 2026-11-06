// Turns the 1170×2532 PNG captures into the WebP files the landing page
// serves: full size (1170) and two-thirds (780). Never upscales.
// Runs at the end of capture; also on its own: node scripts/landing-screenshots/export.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DIR, OUT_DIR } from "./shared.mjs";

const PUBLIC_DIR = path.join(DIR, "../../public/landing");
const NAMES = ["screenshot-week", "screenshot-add"];
const WIDTHS = [1170, 780];

export async function exportWebp() {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const name of NAMES) {
    const src = path.join(OUT_DIR, `${name}.png`);
    const { width, height } = await sharp(src).metadata();
    if (width !== 1170 || height !== 2532) {
      throw new Error(`${name}.png is ${width}×${height}, expected 1170×2532`);
    }
    for (const w of WIDTHS) {
      const out = path.join(PUBLIC_DIR, `${name}-${w}.webp`);
      await sharp(src)
        .resize({ width: w, withoutEnlargement: true, kernel: "lanczos3" })
        .webp({ quality: 90, effort: 6, smartSubsample: true })
        .toFile(out);
      const meta = await sharp(out).metadata();
      console.log(`  ${path.basename(out)}  ${meta.width}×${meta.height}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await exportWebp();
}
