import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Mounted public adapters for compositions the application does not yet contain.
export default defineConfig({
  root: fileURLToPath(new URL("./presentation", import.meta.url)),
  plugins: [svelte(), tailwindcss()],
  resolve: { alias: { $lib: fileURLToPath(new URL("../../src/lib", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
