import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/playwright",
  fullyParallel: true,
  reporter: "list",
  snapshotPathTemplate:
    "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "renderer",
      testMatch: "**/*.e2e.{ts,js}",
      testIgnore: "**/tauri/**",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
  ],
});
