// Runs the Svelte MCP autofixer on every changed `.svelte` / `.svelte.ts` file.
// Any `issues` fail the run; `suggestions` are printed only. Needs network (npx).
import { execFileSync, spawnSync } from "node:child_process";

const changed = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((line) => line && !line.startsWith("D ") && !line.startsWith(" D"))
  .map((line) =>
    line
      .slice(3)
      .trim()
      .replace(/^.* -> /, ""),
  )
  .filter((path) => /\.svelte(\.ts)?$/.test(path) && path.startsWith("src/"));

let failed = false;
for (const path of changed) {
  const run = spawnSync("npx", ["@sveltejs/mcp", "svelte-autofixer", path], {
    encoding: "utf8",
    shell: true,
  });
  let result;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    console.error(`${path}: autofixer output was not JSON\n${run.stdout}${run.stderr}`);
    failed = true;
    continue;
  }
  const issues = result.issues ?? [];
  const suggestions = result.suggestions ?? [];
  console.log(`${path}: ${issues.length} issues, ${suggestions.length} suggestions`);
  for (const item of issues) console.error(`  issue: ${item}`);
  for (const item of suggestions) console.log(`  suggestion: ${item}`);
  if (issues.length > 0) failed = true;
}

if (changed.length === 0) console.log("No changed Svelte files.");
process.exit(failed ? 1 : 0);
