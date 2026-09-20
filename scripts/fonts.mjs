import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const fontPath = "static/fonts/fontshare/Satoshi-Variable.woff2";
const licensePath = "static/fonts/fontshare/LICENSE.txt";
const fontUrl = "https://api.fontshare.com/v2/fonts/download/satoshi";
const expectedHash = "E739AFF9B4D02C264341D6D4872EDCDA28E79373AEDA936F659566A1CD3EB47F";

function check() {
  try {
    const absoluteFontPath = resolve(root, fontPath);
    const font = readFileSync(absoluteFontPath);
    const isValidFont =
      statSync(absoluteFontPath).isFile() &&
      font.length > 0 &&
      font.subarray(0, 4).toString("ascii") === "wOF2" &&
      createHash("sha256").update(font).digest("hex").toUpperCase() === expectedHash;
    return (
      isValidFont &&
      readFileSync(resolve(root, licensePath), "utf8").includes("ITF Free Font License")
    );
  } catch {
    return false;
  }
}

function findFile(directory, fileName) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(candidate, fileName);
      if (nested) return nested;
    } else if (entry.name === fileName) {
      return candidate;
    }
  }
  return undefined;
}

async function download() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "nice-audio-player-font-"));
  const archivePath = join(temporaryDirectory, "satoshi.zip");
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Fontshare returned HTTP ${response.status}`);
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
    const extraction = spawnSync("tar", ["-xf", archivePath, "-C", temporaryDirectory], {
      stdio: "inherit",
    });
    if (extraction.status !== 0) throw new Error("tar could not extract the Fontshare archive");
    const source = findFile(temporaryDirectory, "Satoshi-Variable.woff2");
    if (!source) throw new Error("Satoshi-Variable.woff2 was not found in the official archive");
    mkdirSync(resolve(root, "static/fonts/fontshare"), { recursive: true });
    copyFileSync(source, resolve(root, fontPath));
    if (!check()) throw new Error("Downloaded font or license did not pass verification");
    console.log("fonts:download: installed and verified the approved Fontshare release.");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const command = process.argv[2];
if (command === "check") {
  if (!check()) {
    console.error("fonts:check: required Satoshi Fontshare asset is missing or invalid");
    process.exitCode = 1;
  } else {
    console.log("fonts:check: required Fontshare assets are installed.");
  }
} else if (command === "ensure" || command === "download") {
  if (command === "ensure" && check()) {
    console.log("fonts:ensure: approved Fontshare assets are already installed.");
  } else {
    try {
      await download();
    } catch (error) {
      console.error(`fonts:${command}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
} else {
  console.error("Usage: node scripts/fonts.mjs <check|ensure|download>");
  process.exitCode = 2;
}
