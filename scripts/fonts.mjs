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

const satoshi = {
  path: "static/fonts/fontshare/Satoshi-Variable.woff2",
  licensePath: "static/fonts/fontshare/LICENSE.txt",
  url: "https://api.fontshare.com/v2/fonts/download/satoshi",
  expectedHash: "E739AFF9B4D02C264341D6D4872EDCDA28E79373AEDA936F659566A1CD3EB47F",
};

const notoSansJp = {
  path: "static/fonts/notosansjp/NotoSansJP-VF.ttf",
  url: "https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/Variable/TTF/Subset/NotoSansJP-VF.ttf",
  release: "Sans2.004",
};

function checkSatoshi() {
  try {
    const absoluteFontPath = resolve(root, satoshi.path);
    const font = readFileSync(absoluteFontPath);
    const isValidFont =
      statSync(absoluteFontPath).isFile() &&
      font.length > 0 &&
      font.subarray(0, 4).toString("ascii") === "wOF2" &&
      createHash("sha256").update(font).digest("hex").toUpperCase() === satoshi.expectedHash;
    return (
      isValidFont &&
      readFileSync(resolve(root, satoshi.licensePath), "utf8").includes("ITF Free Font License")
    );
  } catch {
    return false;
  }
}

function checkNotoSansJp() {
  try {
    const absoluteFontPath = resolve(root, notoSansJp.path);
    const font = readFileSync(absoluteFontPath);
    const signature = font.subarray(0, 4);
    const isTrueType = signature.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]));
    const isOpenType = signature.toString("ascii") === "OTTO";
    return (
      statSync(absoluteFontPath).isFile() && font.length > 1_000_000 && (isTrueType || isOpenType)
    );
  } catch {
    return false;
  }
}

function check() {
  return checkSatoshi() && checkNotoSansJp();
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

async function downloadSatoshi() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "nice-audio-player-font-"));
  const archivePath = join(temporaryDirectory, "satoshi.zip");
  try {
    const response = await fetch(satoshi.url);
    if (!response.ok) throw new Error(`Fontshare returned HTTP ${response.status}`);
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
    const extraction = spawnSync("tar", ["-xf", archivePath, "-C", temporaryDirectory], {
      stdio: "inherit",
    });
    if (extraction.status !== 0) throw new Error("tar could not extract the Fontshare archive");
    const source = findFile(temporaryDirectory, "Satoshi-Variable.woff2");
    if (!source) throw new Error("Satoshi-Variable.woff2 was not found in the official archive");
    mkdirSync(resolve(root, "static/fonts/fontshare"), { recursive: true });
    copyFileSync(source, resolve(root, satoshi.path));
    if (!checkSatoshi()) throw new Error("Downloaded Satoshi asset did not pass verification");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function downloadNotoSansJp() {
  const response = await fetch(notoSansJp.url);
  if (!response.ok)
    throw new Error(`Noto Sans JP ${notoSansJp.release} returned HTTP ${response.status}`);
  mkdirSync(resolve(root, "static/fonts/notosansjp"), { recursive: true });
  writeFileSync(resolve(root, notoSansJp.path), Buffer.from(await response.arrayBuffer()));
  if (!checkNotoSansJp())
    throw new Error("Downloaded Noto Sans JP asset did not pass verification");
}

async function download() {
  if (!checkSatoshi()) await downloadSatoshi();
  if (!checkNotoSansJp()) await downloadNotoSansJp();
  if (!check()) throw new Error("Required font assets are missing or invalid after download");
  console.log(
    "fonts:download: installed and verified the approved Satoshi and Noto Sans JP releases.",
  );
}

const command = process.argv[2];
if (command === "check") {
  if (!check()) {
    console.error("fonts:check: required Satoshi or Noto Sans JP asset is missing or invalid");
    process.exitCode = 1;
  } else {
    console.log("fonts:check: required font assets are installed.");
  }
} else if (command === "ensure" || command === "download") {
  if (command === "ensure" && check()) {
    console.log("fonts:ensure: approved font assets are already installed.");
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
