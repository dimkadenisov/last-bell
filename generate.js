import { readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const photos = readdirSync(join(__dirname, "preview"))
  .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
  .sort();

writeFileSync(join(__dirname, "photos.json"), JSON.stringify(photos));
console.log(`Generated photos.json with ${photos.length} photos`);
