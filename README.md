# Nice Audio Player

A local-first Windows desktop music player focused on reliable playback and a calm, artwork-led library.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — the list of documents
- [Contributing](./CONTRIBUTING.md) — principles and engineering rules

## Development

```text
pnpm install
pnpm dev
```

The checks to run are in [CONTRIBUTING.md](./CONTRIBUTING.md#checks).

## Stack

- Renderer: SvelteKit (Svelte 5, `adapter-static`, SPA), built by Vite. Code is in `src/routes` and `src/lib`. The dependency rules between folders are in [CONTRIBUTING.md](./CONTRIBUTING.md).
- Host: Tauri 2 runs the Windows WebView and packages the app.
- Backend: Rust owns playback, library, persistence, and native work.

shadcn-svelte primitives are in `src/lib/ui/shadcn`. Add one with `pnpm dlx shadcn-svelte@latest add <component>`. Put product-specific compositions in `src/lib/components` or beside their route.

## Agent skills

Skills are in `.claude/skills`.
