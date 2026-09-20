import { existsSync } from "node:fs";
import { once } from "node:events";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const executable = resolve("release", "win-unpacked", "Nice Audio Player.exe");
if (!existsSync(executable)) {
  console.error(`Packaged executable not found: ${executable}`);
  process.exit(1);
}

const child = spawn(executable, [], { windowsHide: true, stdio: "ignore" });
const exited = once(child, "exit").then(([code, signal]) => ({
  kind: "exit",
  code,
  signal,
}));
const failedToStart = once(child, "error").then(([error]) => ({
  kind: "error",
  error,
}));
let startupTimer;
const aliveAfterWindow = new Promise((resolveAfterTimeout) => {
  startupTimer = setTimeout(() => resolveAfterTimeout({ kind: "alive" }), 8_000);
});
const startup = await Promise.race([exited, failedToStart, aliveAfterWindow]);
clearTimeout(startupTimer);

if (startup.kind === "exit") {
  console.error(
    `Packaged executable exited before the smoke window (code ${startup.code}, signal ${startup.signal}).`,
  );
  process.exitCode = 1;
} else if (startup.kind === "error") {
  console.error(startup.error);
  process.exitCode = 1;
} else {
  if (child.exitCode !== null || child.signalCode !== null) {
    console.error("Packaged executable exited before the smoke window completed.");
    process.exitCode = 1;
  } else {
    child.kill();
    let closeTimer;
    const closeTimeout = new Promise((resolveAfterTimeout) => {
      closeTimer = setTimeout(() => resolveAfterTimeout(false), 5_000);
    });
    const closed = await Promise.race([once(child, "close").then(() => true), closeTimeout]);
    clearTimeout(closeTimer);
    if (!closed) {
      console.error("Packaged executable did not close after the smoke window.");
      process.exitCode = 1;
    }
  }
}
