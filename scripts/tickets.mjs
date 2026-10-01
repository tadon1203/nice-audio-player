// Lists every ticket under .scratch/*/issues with its Status and Blocked by.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = ".scratch";
const field = (text, name) =>
  text.match(new RegExp(String.raw`^\*{0,2}${name}:\*{0,2}\s*(.+)$`, "mi"))?.[1].trim() ?? "";

for (const feature of readdirSync(root, { withFileTypes: true })) {
  const dir = join(root, feature.name, "issues");
  if (!feature.isDirectory() || !existsSync(dir)) continue;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const done = files.filter((f) => field(readFileSync(join(dir, f), "utf8"), "Status") === "done");
  console.log(`${feature.name} (${done.length}/${files.length} done)`);
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const status = field(text, "Status") || "?";
    const blocked = field(text, "Blocked by");
    const extra =
      status === "done"
        ? field(text, "Commit")
        : /^none|^None/.test(blocked)
          ? ""
          : `blocked by ${blocked}`;
    console.log(`  ${f.replace(/\.md$/, "").padEnd(42)} ${status.padEnd(16)} ${extra}`);
  }
}
