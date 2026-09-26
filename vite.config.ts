import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [
    tanstackRouter({
      routesDirectory: resolve(root, "src/app/renderer/routes"),
      generatedRouteTree: resolve(root, "src/app/renderer/routeTree.gen.ts"),
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": resolve(root, "src") } },
  root: resolve(root, "src/app/renderer"),
  publicDir: resolve(root, "static"),
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  clearScreen: false,
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, "src/app/renderer/index.html") },
  },
});
