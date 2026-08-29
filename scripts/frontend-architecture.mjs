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
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Frontend architecture checks passed.");
}
