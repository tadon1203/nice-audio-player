import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (process.argv.length !== 3 || !["generate", "check"].includes(mode)) {
  console.error("Usage: node scripts/bindings.mjs <generate|check>");
  process.exit(2);
}

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const targetDirectory = join(repositoryRoot, "src-tauri", "target", "tauri-specta");
const prettierIgnorePath = join(targetDirectory, "bindings-prettierignore");
const committedPath = join(repositoryRoot, "src", "bindings.ts");
const prettier = join(repositoryRoot, "node_modules", "prettier", "bin", "prettier.cjs");
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";

function rustEnvironment(outputPath) {
  const environment = { ...process.env, TAURI_SPECTA_OUTPUT: outputPath };
  if (process.platform === "win32") {
    // MockRuntime export tests need the Common Controls v6 activation context.
    const manifestFlag =
      "/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'";
    environment.CARGO_ENCODED_RUSTFLAGS = [
      process.env.CARGO_ENCODED_RUSTFLAGS,
      "-C",
      `link-arg=${manifestFlag}`,
    ]
      .filter(Boolean)
      .join(String.fromCharCode(31));
  }
  return environment;
}

function runExport(outputPath) {
  const result = spawnSync(
    cargo,
    [
      "test",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--features",
      "bindings-export",
      "export_typescript_bindings",
      "--",
      "--ignored",
      "--exact",
    ],
    {
      cwd: repositoryRoot,
      env: rustEnvironment(outputPath),
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`cargo test exited with status ${result.status ?? 1}`);
  }
}

function formatBindings(path) {
  const result = spawnSync(
    process.execPath,
    [prettier, "--write", "--ignore-path", prettierIgnorePath, path],
    {
      cwd: repositoryRoot,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`prettier exited with status ${result.status ?? 1}`);
  }
}

if (mode === "generate") {
  const outputPath = join(repositoryRoot, "src", "bindings.ts");
  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(prettierIgnorePath, "");
  try {
    runExport(outputPath);
    formatBindings(outputPath);
  } finally {
    rmSync(prettierIgnorePath, { force: true });
  }
} else {
  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(prettierIgnorePath, "");
  const temporaryPath = join(targetDirectory, `bindings-check-${process.pid}-${Date.now()}.ts`);
  try {
    runExport(temporaryPath);
    formatBindings(temporaryPath);
    const generated = readFileSync(temporaryPath);
    const committed = readFileSync(committedPath);
    if (!generated.equals(committed)) {
      throw new Error("src/bindings.ts is stale; run pnpm bindings:generate");
    }
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
    rmSync(prettierIgnorePath, { force: true });
  }
}
