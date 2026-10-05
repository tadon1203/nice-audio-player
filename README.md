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

Which checks to run is in [AGENTS.md](./AGENTS.md#commands).

Agent skills are tracked in `.agents/skills` (pinned by `skills-lock.json`). `.claude/skills` holds machine-specific links created by `npx skills add` and is gitignored, so recreate them after a fresh clone.

The renderer is SvelteKit (Svelte 5, `adapter-static`, SPA) built by Vite. Tauri 2 hosts the Windows WebView and packages the desktop application; Rust owns playback, library, persistence, and native work directly, without an Electron process or N-API addon.

The renderer lives in `src/routes` (screens and the app shell) and `src/lib`, split by domain: `native`, `playback`, `library`, `lyrics`, `meters`, `settings`, `shell`, `components`, `ui`, `utils` (see [ADR 0002](./docs/adr/0002-domain-folders-instead-of-fsd.md)). shadcn-svelte primitives live under `src/lib/ui/shadcn`, use semantic tokens from `src/app.css`, and are configured by `components.json`. Add primitives with `pnpm dlx shadcn-svelte@latest add <component>` and keep product-specific compositions in `src/lib/components` or beside their route.
