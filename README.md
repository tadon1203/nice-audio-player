# Nice Audio Player

Nice Audio Player is a local-first Windows desktop music player. It plays reliably. Its library shows album artwork.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — the list of documents
- [Architecture](./ARCHITECTURE.md) — system map and engineering rules

## Development

Node is pinned by `.nvmrc`. With nvm-windows, run `nvm use` in the repo directory before you run `pnpm install`.

Rust links with LLVM's `lld-link` (set in `.cargo/config.toml`). Install [LLVM](https://releases.llvm.org/). Add its `bin` directory to `PATH`.

```text
pnpm install
pnpm dev
```

The checks to run are in [CLAUDE.md](./CLAUDE.md#commands).

## Stack

- Renderer: SvelteKit (Svelte 5, `adapter-static`, SPA), built by Vite. The code is in `src/routes` and `src/lib`. The dependency rules between directories are in [ARCHITECTURE.md](./ARCHITECTURE.md).
- Host: Tauri 2 runs the Windows WebView and packages the app.
- Backend: Rust owns playback, the library, persistence, and native work.

The shadcn-svelte primitives are in `src/lib/ui/shadcn`. To add one, run `pnpm dlx shadcn-svelte@latest add <component>`. Put product-specific compositions in `src/lib/components` or beside their route.

## Agent skills

The skills are in `.claude/skills`.
