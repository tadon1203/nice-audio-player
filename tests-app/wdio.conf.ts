import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { silentWav } from "./silent-wav.ts";

// Follows https://v2.tauri.app/develop/tests/webdriver/: WebdriverIO and `@wdio/tauri-service`
// with its embedded WebDriver server. The plugins it needs are compiled in only by the `wdio`
// cargo feature, so a shipped build never has them.

// Everything the app writes goes to one throwaway directory, never the real profile. The launcher
// and its workers share it; the app and WebView2 inherit these variables.
const scratch = (process.env.E2E_SCRATCH ??= mkdtempSync(join(tmpdir(), "nice-audio-player-e2e-")));
const musicDir = join(scratch, "Music");
process.env.E2E_MUSIC_DIR = musicDir;
process.env.NICE_AUDIO_PLAYER_DATA_DIR = join(scratch, "data");
process.env.WEBVIEW2_USER_DATA_FOLDER = join(scratch, "webview2");

const appBinaryPath = resolve("src-tauri/target/debug/nice-audio-player.exe");

export const config: WebdriverIO.Config = {
  runner: "local",
  logLevel: "warn",
  specs: ["./*.e2e.ts"],
  maxInstances: 1,
  services: [["tauri", { appBinaryPath, driverProvider: "embedded" }]],
  capabilities: [{ browserName: "tauri" }],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60_000 },

  // The binary has to exist before a session starts, and the fixture library is written once.
  onPrepare: () => {
    mkdirSync(musicDir, { recursive: true });
    for (const name of ["First", "Second"]) {
      writeFileSync(join(musicDir, `${name}.wav`), silentWav(120, 8_000));
    }
    const build = spawnSync(
      "pnpm",
      [
        "exec",
        "tauri",
        "build",
        "--debug",
        "--no-bundle",
        "--features",
        "wdio",
        "--config",
        "src-tauri/tauri.e2e.conf.json",
      ],
      { stdio: "inherit", shell: true, env: { ...process.env, VITE_E2E: "1" } },
    );
    if (build.status !== 0) throw new Error("building the app failed");
  },
};
