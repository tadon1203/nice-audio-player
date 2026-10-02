// Tauri has no Node.js server, so this is a client-only SPA (adapter-static with a fallback page).
// See: https://svelte.dev/docs/kit/single-page-apps
export const ssr = false;
export const prerender = false;

// The app-level E2E build (`tests-app/`, built with `VITE_E2E=1`) lets WebdriverIO reach the app.
// Vite replaces the flag with a constant, so a normal build drops the import.
if (import.meta.env.VITE_E2E) void import("@wdio/tauri-plugin");
