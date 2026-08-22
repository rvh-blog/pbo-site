import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const writeChanges = process.argv.includes("--write");
const checkOnly = process.argv.includes("--check");
if (!writeChanges && !checkOnly) {
  console.error("Usage: node scripts/optimize-public-images.mjs --check|--write");
  process.exit(1);
}

const publicImages = path.resolve("public/images");
const optimizedDirectories = ["teams", "divisions"].map((name) => path.join(publicImages, name));
const maxDimension = 1024;
const maxSingleFileBytes = 2 * 1024 * 1024;
const maxPublicImagesBytes = 220 * 1024 * 1024;

async function walk(directory) {
  const results = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(fullPath)));
    else results.push(fullPath);
  }
  return results;
}

async function optimizeImage(file) {
  const before = await fs.stat(file);
  const metadata = await sharp(file).metadata();
  if (metadata.format !== "png" || (metadata.pages ?? 1) > 1) return { before: before.size, after: before.size };
  const requiresResize = (metadata.width ?? 0) > maxDimension || (metadata.height ?? 0) > maxDimension;

  const tempFile = `${file}.optimized.png`;
  let pipeline = sharp(file).rotate();
  if (requiresResize) {
    pipeline = pipeline.resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toFile(tempFile);
  const optimized = await fs.stat(tempFile);
  if (requiresResize || optimized.size < before.size) await fs.rename(tempFile, file);
  else await fs.unlink(tempFile);
  return { before: before.size, after: requiresResize ? optimized.size : Math.min(before.size, optimized.size) };
}

const candidates = (await Promise.all(optimizedDirectories.map(walk)))
  .flat()
  .filter((file) => path.extname(file).toLowerCase() === ".png");

if (writeChanges) {
  let before = 0;
  let after = 0;
  for (const file of candidates) {
    const result = await optimizeImage(file);
    before += result.before;
    after += result.after;
  }
  console.log(`[Assets] Optimized ${candidates.length} logos: ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB.`);
}

const allImages = await walk(publicImages);
let totalBytes = 0;
const oversized = [];
const oversizedDimensions = [];
for (const file of allImages) {
  const stat = await fs.stat(file);
  totalBytes += stat.size;
  if (stat.size > maxSingleFileBytes) oversized.push({ file: path.relative(process.cwd(), file), bytes: stat.size });
}

for (const file of candidates) {
  const metadata = await sharp(file).metadata();
  if (metadata.format === "png" && (metadata.pages ?? 1) <= 1 && ((metadata.width ?? 0) > maxDimension || (metadata.height ?? 0) > maxDimension)) {
    oversizedDimensions.push({
      file: path.relative(process.cwd(), file),
      width: metadata.width,
      height: metadata.height,
      pages: metadata.pages,
    });
  }
}

if (oversized.length > 0 || oversizedDimensions.length > 0 || totalBytes > maxPublicImagesBytes) {
  for (const asset of oversized) {
    console.error(`[Assets] Oversized file: ${asset.file} (${(asset.bytes / 1024 / 1024).toFixed(1)} MB)`);
  }
  for (const asset of oversizedDimensions) {
    console.error(`[Assets] Oversized dimensions: ${asset.file} (${asset.width}x${asset.height}, pages=${asset.pages ?? 1})`);
  }
  if (totalBytes > maxPublicImagesBytes) {
    console.error(`[Assets] public/images is ${(totalBytes / 1024 / 1024).toFixed(1)} MB; budget is ${(maxPublicImagesBytes / 1024 / 1024).toFixed(0)} MB.`);
  }
  process.exit(1);
}

console.log(`[Assets] public/images is ${(totalBytes / 1024 / 1024).toFixed(1)} MB and within budget.`);
