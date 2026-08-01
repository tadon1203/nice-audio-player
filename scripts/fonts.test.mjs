import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";

import { EXPECTED_FONT_FILES, checkFonts } from "./fonts.mjs";

const temporaryDirectories = [];

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "nice-audio-player-fonts-"));
  mkdirSync(join(root, "public", "fonts", "fontshare"), { recursive: true });
  temporaryDirectories.push(root);
  return root;
}

function writeFonts(root, contents = Buffer.from("wOF2font")) {
  for (const relativePath of EXPECTED_FONT_FILES) {
    const path = join(root, relativePath);
    writeFileSync(path, contents);
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("fonts:check", () => {
  it("accepts four non-empty WOFF2 files", () => {
    const root = createRoot();
    writeFonts(root);
    expect(checkFonts(root)).toEqual([]);
  });

  it("reports every missing file with its expected destination", () => {
    const root = createRoot();
    const errors = checkFonts(root);
    expect(errors).toHaveLength(4);
    expect(errors.every((error, index) => error.includes(EXPECTED_FONT_FILES[index]))).toBe(true);
  });

  it("rejects directories, empty files, and non-WOFF2 files", () => {
    const root = createRoot();
    writeFonts(root);
    const directoryPath = join(root, EXPECTED_FONT_FILES[0]);
    rmSync(directoryPath);
    mkdirSync(directoryPath);
    writeFileSync(join(root, EXPECTED_FONT_FILES[1]), "");
    writeFileSync(join(root, EXPECTED_FONT_FILES[2]), "not-a-font");

    const errors = checkFonts(root);
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toContain(EXPECTED_FONT_FILES[0]);
    expect(errors.join("\n")).toContain(EXPECTED_FONT_FILES[1]);
    expect(errors.join("\n")).toContain(EXPECTED_FONT_FILES[2]);
  });
});
