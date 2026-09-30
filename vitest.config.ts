import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "src"),
          },
        },
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/shared/ipc/**"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "src"),
          },
        },
        test: {
          name: "shared",
          environment: "node",
          include: ["src/shared/ipc/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
        },
      },
    ],
  },
});
