import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";

const root = import.meta.dirname;

export default defineConfig({
  main: {
    resolve: {
      alias: { "@": resolve(root, "src") },
    },
    build: {
      outDir: resolve(root, "out/main"),
      target: "node24",
      lib: { entry: resolve(root, "src/app/main/index.ts") },
      rollupOptions: {
        external: ["electron"],
        output: { format: "es", entryFileNames: "index.js" },
      },
    },
  },
  preload: {
    resolve: {
      alias: { "@": resolve(root, "src") },
    },
    build: {
      outDir: resolve(root, "out/preload"),
      target: "node24",
      externalizeDeps: { exclude: ["zod"] },
      lib: { entry: resolve(root, "src/app/preload/index.ts"), formats: ["cjs"] },
      rollupOptions: {
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: resolve(root, "src/app/renderer"),
    publicDir: resolve(root, "static"),
    plugins: [
      tanstackRouter({
        routesDirectory: resolve(root, "src/app/renderer/routes"),
        generatedRouteTree: resolve(root, "src/app/renderer/routeTree.gen.ts"),
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { "@": resolve(root, "src") },
    },
    server: { host: "127.0.0.1", port: 5173 },
    build: {
      outDir: resolve(root, "out/renderer"),
      rollupOptions: { input: resolve(root, "src/app/renderer/index.html") },
    },
  },
});
