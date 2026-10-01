import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  snapshotPathTemplate:
    "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
  webServer: {
    command: "pnpm exec vite dev --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "renderer",
      testMatch: "**/*.e2e.{ts,js}",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173",
        trace: "retain-on-failure",
        // Tests read geometry and state, not motion; `motion.e2e.ts` turns this back off.
        reducedMotion: "reduce",
        screenshot: "only-on-failure",
      },
    },
  ],
});
