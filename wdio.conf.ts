import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const appBinaryPath = resolve("src-tauri/target/debug/nice-audio-player.exe");
const testDataDir = mkdtempSync(join(tmpdir(), "nice-audio-player-tauri-e2e-"));
process.env.NICE_AUDIO_PLAYER_TEST_DATA_DIR = testDataDir;

export const config = {
  runner: "local",
  specs: ["./tests/tauri/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application: appBinaryPath },
    },
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "official",
        autoInstallTauriDriver: true,
        autoDownloadEdgeDriver: true,
        captureBackendLogs: true,
        captureFrontendLogs: true,
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { timeout: 60_000 },
  logLevel: "warn",
  onComplete: () => {
    const temporaryRoot = resolve(tmpdir()).toLowerCase();
    const target = resolve(testDataDir).toLowerCase();
    if (
      target.startsWith(`${temporaryRoot}${sep}`) &&
      target.slice(temporaryRoot.length + sep.length).startsWith("nice-audio-player-tauri-e2e-")
    ) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  },
};
