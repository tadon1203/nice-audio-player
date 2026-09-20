import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright",
  fullyParallel: true,
  reporter: "list",
  snapshotPathTemplate:
    "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
  webServer: {
    command: "pnpm exec electron-vite dev --rendererOnly",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "renderer",
      testMatch: "**/*.e2e.{ts,js}",
      testIgnore: "**/electron/**/*.e2e.{ts,js}",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
    {
      name: "electron",
      testMatch: "**/electron/**/*.e2e.{ts,js}",
      workers: 1,
      use: {
        baseURL: "http://127.0.0.1:5173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
  ],
});
