# Nice Audio Player

A local-first Windows desktop music player focused on reliable playback and a calm, artwork-led library.

## Documentation

- [Requirements](./docs/requirements.md) — accepted product behavior
- [Design](./DESIGN.md) — UI principles
- [Context](./CONTEXT.md) — glossary
- [Decisions](./docs/adr/) — ADRs
- [Contributing](./CONTRIBUTING.md) — principles and engineering rules
- [CPU measurement](./docs/cpu-measurement.md) — comparing CPU cost during playback

## Development

```text
pnpm install
pnpm dev
```

The checks to run are in [CONTRIBUTING.md](./CONTRIBUTING.md#checks).

## Stack

- Renderer: SvelteKit (Svelte 5, `adapter-static`, SPA), built by Vite. Code is in `src/routes` and `src/lib`. See [ADR 0002](./docs/adr/0002-domain-folders-instead-of-fsd.md) for the folders.
- Host: Tauri 2 runs the Windows WebView and packages the app.
- Backend: Rust owns playback, library, persistence, and native work.

shadcn-svelte primitives are in `src/lib/ui/shadcn`. Add one with `pnpm dlx shadcn-svelte@latest add <component>`. Put product-specific compositions in `src/lib/components` or beside their route.

## Agent skills

Skills are in `.agents/skills`, pinned by `skills-lock.json`. `npx skills add` creates machine-specific links in `.claude/skills`. Git ignores them. Create them again after a fresh clone.
