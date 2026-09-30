// Tauri has no Node.js server, so this is a client-only SPA (adapter-static with a fallback page).
// See: https://svelte.dev/docs/kit/single-page-apps
export const ssr = false;
export const prerender = false;
