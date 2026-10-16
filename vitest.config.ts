import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import { svelteKitOptions } from "./vite.sveltekit.config.js";

export default defineConfig({
  plugins: [sveltekit(svelteKitOptions)],
  resolve: { conditions: ["browser"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "happy-dom",
          include: ["src/**/*.test.ts"],
          exclude: ["src/lib/native/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "shared",
          environment: "node",
          include: ["src/lib/native/**/*.test.ts", "tests/**/*.test.ts"],
        },
      },
    ],
  },
});
