# Nice Audio Player

A local-first Windows desktop music player focused on reliable playback and a calm, artwork-led listening experience.

## Documentation

- [Requirements](./docs/requirements.md) — accepted product behavior
- [Design](./DESIGN.md) — visual and interaction system
- [Architecture](./docs/architecture.md) — system structure and boundaries
- [Development Philosophy](./PHILOSOPHY.md) — development principles
- [Contributing](./CONTRIBUTING.md) — contribution workflow

## Development

```text
pnpm install
pnpm dev
pnpm test
pnpm validate
```

Use `pnpm dev` for the Angular development server and Electron shell. Use `pnpm test`
to run tests only. Use `pnpm validate` for the complete consistency, lint, type-check,
Rust, test, and production-build gate.
