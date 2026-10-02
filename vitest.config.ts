import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: { conditions: ["browser"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          exclude: ["src/lib/native/**"],
          setupFiles: ["tests/renderer-setup.ts"],
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
