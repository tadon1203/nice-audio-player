import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: true,
  // The default worker count (half of the CPU cores) overloads the machine: each worker runs a
  // browser, and the load makes tests time out. Override with `--workers=N`.
  workers: "25%",
  reporter: "list",
  snapshotPathTemplate:
    "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
  webServer: [
    {
      // The built bundle, not `vite dev`: dev serves hundreds of unbundled modules to every test's
      // empty-cache browser, so page load grows with the worker count and eats the expect timeout.
      command: "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "pnpm exec vite --config tests/fixtures/presentation.vite.config.ts",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
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
