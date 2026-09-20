import { copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const generated = resolve(root, "build/native/native-backend.d.ts");
const tracked = resolve(root, "src/main/shared/native-backend/native-backend.d.ts");
if (process.argv[2] === "update") {
  await copyFile(generated, tracked);
} else if (process.argv[2] === "check") {
  const [a, b] = await Promise.all([readFile(generated, "utf8"), readFile(tracked, "utf8")]);
  if (a !== b) {
    console.error("bindings:check: generated bindings are stale");
    process.exit(1);
  }
} else {
  console.error("Usage: node scripts/bindings.mjs <update|check>");
  process.exit(2);
}
