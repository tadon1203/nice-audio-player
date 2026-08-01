import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EXPECTED_FONT_FILES = [
  "public/fonts/fontshare/Switzer-Regular.woff2",
  "public/fonts/fontshare/Switzer-Medium.woff2",
  "public/fonts/fontshare/Switzer-Semibold.woff2",
  "public/fonts/fontshare/Zodiak-Regular.woff2",
];

const instructionPath = "public/fonts/fontshare/README.md";

export function checkFonts(repositoryRoot) {
  const errors = [];
  for (const relativePath of EXPECTED_FONT_FILES) {
    const absolutePath = join(repositoryRoot, relativePath);
    try {
      const stats = statSync(absolutePath);
      if (!stats.isFile()) {
        errors.push(`${relativePath}: expected a regular file at ${absolutePath}`);
        continue;
      }
      if (stats.size === 0) {
        errors.push(`${relativePath}: file is empty; expected ${absolutePath}`);
        continue;
      }
      const signature = readFileSync(absolutePath).subarray(0, 4).toString("ascii");
      if (signature !== "wOF2") {
        errors.push(`${relativePath}: invalid WOFF2 signature; expected ${absolutePath}`);
      }
    } catch {
      errors.push(`${relativePath}: missing or unreadable; expected ${absolutePath}`);
    }
  }
  return errors;
}

export function main(repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const errors = checkFonts(repositoryRoot);
  if (errors.length > 0) {
    for (const error of errors) console.error(`fonts:check: ${error}`);
    console.error(`Install the licensed assets according to ${instructionPath}.`);
    return 1;
  }
  console.log(`fonts:check: ${EXPECTED_FONT_FILES.length} Fontshare WOFF2 assets are installed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== "check") {
    console.error("Usage: node scripts/fonts.mjs check");
    process.exit(2);
  }
  process.exit(main());
}
