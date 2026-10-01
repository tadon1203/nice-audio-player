# 0001: SvelteKit SPA for the renderer

The renderer moves from React to SvelteKit (Svelte 5) with `adapter-static` and `ssr = false`. We do not use plain Svelte plus a router library.

- The app has 8 routes, dynamic segments, redirects, and nested layouts. Plain Svelte would mean picking a router and rebuilding file-based routing.
- Now Playing is a layer kept in history state over the current location (Back closes it, the library stays mounted). SvelteKit's shallow routing (`pushState` and `page.state`) provides this directly.
- Tauri's official template and docs, and Svelte's AI tooling, assume SvelteKit.
- Only routing, layouts, shallow routing, `snapshot`, and `$lib` are used. No `+page.server.ts`, form actions, or `load`; native data is read through TanStack Query.

The Rust side (`backend/`, `src-tauri/`) does not change.

Porting policy: the Playwright renderer E2E suite is the specification; when it fails, the markup is fixed to match (roles, labels, `data-slot` / `data-region` / `data-tone` are a contract), and a test is changed only when it depended on React's DOM structure. TanStack Query stays; zustand, TanStack Router, TanStack Table, and zod are dropped. Library view state (filter, sort) lives in memory, not in the URL.
