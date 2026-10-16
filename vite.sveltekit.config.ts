import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { Config } from "@sveltejs/kit/vite";

// Shared by the app (vite.config.ts) and the unit tests (vitest.config.ts), so both compile
// Svelte the same way. Tauri has no Node.js server, so the renderer is a client-only SPA.
// See: https://svelte.dev/docs/kit/single-page-apps
export const svelteKitOptions: Config = {
  preprocess: vitePreprocess(),
  adapter: adapter({ fallback: "index.html" }),
};
