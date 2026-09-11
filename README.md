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
pnpm verify
pnpm validate
```

Use `pnpm dev` for the Angular development server and Electron shell. Use `pnpm verify`
for the full consistency, lint, type-check, Rust, unit, and end-to-end gate. Use
`pnpm validate` when production renderer, Electron, backend, and runtime artifacts
must also be built.
