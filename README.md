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

`pnpm dev` starts the desktop development session. `pnpm test` runs all automated
tests, including E2E coverage. `pnpm validate` is the complete local/CI
verification gate.
