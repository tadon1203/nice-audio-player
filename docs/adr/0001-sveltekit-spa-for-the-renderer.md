# 0001: SvelteKit SPA for the renderer

The renderer moves from React to SvelteKit (Svelte 5) with `adapter-static` and `ssr = false`. We do not use plain Svelte with a router library.

- The app has 8 routes, dynamic segments, redirects, and nested layouts. Plain Svelte would need a router and a rebuild of file-based routing.
- Now Playing is a layer kept in history state over the current location. Back closes it, and the library stays mounted. SvelteKit's shallow routing (`pushState` and `page.state`) does this directly.
- Tauri's official template and docs, and Svelte's AI tooling, assume SvelteKit.
- The app uses only routing, layouts, shallow routing, `snapshot`, and `$lib`. It has no `+page.server.ts`, form actions, or `load`. TanStack Query reads native data.

The Rust side (`backend/`, `src-tauri/`) does not change.

## Porting policy

- The Playwright renderer E2E suite is the specification. When a test fails, fix the markup to match. Roles, labels, `data-slot`, `data-region` and `data-tone` are a contract.
- Change a test only if it depended on React's DOM structure.
- Keep TanStack Query. Drop zustand, TanStack Router, TanStack Table, and zod.
- Library view state (filter, sort) lives in memory, not in the URL.
