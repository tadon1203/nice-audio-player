import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { cwd } from "node:process";
import { findPolicyViolations } from "./frontend-architecture-policy.mjs";

const root = cwd();
const violations = [];
const files = [];
const allowedStyles = new Set(["app.css", "theme.css", "fonts.css", "base.css"]);

function visit(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if ([".css", ".ts", ".tsx", ".mjs"].includes(extname(path))) files.push(path);
  }
}

visit(join(root, "src"));
visit(join(root, "tests"));

const stylesDirectory = join(root, "src", "styles");
if (existsSync(stylesDirectory))
  for (const file of readdirSync(stylesDirectory))
    if (!allowedStyles.has(file))
      violations.push(`src/styles/${file}: only global policy stylesheets may remain`);

for (const path of files) {
  const source = readFileSync(path, "utf8");
  const display = relative(root, path);
  if (path.endsWith(".css") && !allowedStyles.has(path.split(/[\\/]/).pop()))
    violations.push(`${display}: component stylesheets are not allowed`);
  for (const violation of findPolicyViolations({ path: display, source }))
    violations.push(`${display}: ${violation}`);
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log("Frontend architecture checks passed.");
