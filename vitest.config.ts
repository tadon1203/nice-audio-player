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
          include: ["src/app/renderer/**/*.test.{ts,tsx}", "src/renderer/**/*.test.{ts,tsx}"],
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
          name: "main",
          environment: "node",
          include: ["src/main/**/*.test.{ts,tsx}", "src/app/main/**/*.test.{ts,tsx}"],
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
          include: ["src/shared/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
        },
      },
    ],
  },
});
