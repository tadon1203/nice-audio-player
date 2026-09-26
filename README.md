# Nice Audio Player

A local-first Windows desktop music player focused on reliable playback and a calm, artwork-led library.

## Documentation

- [Requirements](./docs/requirements.md) — accepted product behavior
- [Design](./DESIGN.md) — visual and interaction system
- [Architecture](./docs/architecture.md) — Tauri and Rust boundaries and ownership
- [Development Philosophy](./PHILOSOPHY.md) — development principles
- [Contributing](./CONTRIBUTING.md) — contribution workflow

## Development

```text
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm validate
pnpm package
```

The renderer is React + TypeScript built by Vite. Tauri 2 hosts the Windows WebView and packages the desktop application; Rust owns playback, library, persistence, and native work directly, without an Electron process or N-API addon.

The renderer follows Feature-Sliced Design. Generated shadcn/ui Base UI primitives live under `src/renderer/shared/ui/shadcn`, use semantic tokens from `src/app/renderer/styles.css`, and are configured by `components.json`. Add primitives with `pnpm exec shadcn add <component>` and keep product-specific compositions in their renderer slices.
