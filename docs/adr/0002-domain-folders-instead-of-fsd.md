# 0002: Domain folders instead of Feature-Sliced Design

The renderer drops the six FSD layers for SvelteKit's standard `src/routes` + `src/lib`, with `lib/` split by domain: `native`, `playback`, `library`, `lyrics`, `settings`, `shell`, `components`, `ui`, `utils`.

Dependencies point one way: `routes → components → shell → {playback, library, lyrics, settings} → {ui, utils, native}`. Domains never import each other; code joining two domains lives in `components/`. `oxlint`'s `no-restricted-imports` enforces this, replacing the FSD rule.

Why: screen-specific parts live beside their route, and the layer/slice rules no longer cost more than they prevented. See [svelte-migration-plan.md](../svelte-migration-plan.md) §2 and S1.
