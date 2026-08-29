import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { cwd } from "node:process";

const root = cwd();
const sourceRoots = [join(root, "src"), join(root, "tests")];
const forbidden = ["data-context-layout", "data-layout-correcting"];
const files = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if ([".css", ".ts", ".tsx"].includes(extname(path))) files.push(path);
  }
}

for (const sourceRoot of sourceRoots) visit(sourceRoot);

const violations = [];
for (const path of files) {
  const source = readFileSync(path, "utf8");
  for (const token of forbidden) {
    if (source.includes(token))
      violations.push(`${path}: forbidden layout-correction token ${token}`);
  }
  if (/transform\s*:[^;{}]*!important/.test(source)) {
    violations.push(`${path}: transform !important is not allowed`);
  }
  if (
    path.includes(`${join("src", "styles")}${join("", "")}`) &&
    /playback(?:-queue)?\.css$/.test(path)
  ) {
    if (/\.range-control__/.test(source)) {
      violations.push(`${path}: feature styles must not own slider internal geometry`);
    }
    if (/\.range-control[^\n{]*input/.test(source)) {
      violations.push(`${path}: feature styles must not reach hidden slider inputs`);
    }
    if (/\.playback-dock__transport[^\n{]*\{[^}]*translate/.test(source)) {
      violations.push(`${path}: Dock transport offset rules are not allowed`);
    }
  }
  if (path.endsWith("playback-queue.css") && /\.playback-queue__menu\s+button/.test(source)) {
    violations.push(`${path}: queue menu styles must not depend on button tag selectors`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Frontend architecture checks passed.");
}
