# Contributing

## Principles

- Reduce cognitive load. Make intent clear through file structure, code structure, and naming.
- No ad-hoc fixes. Design for long-term consistency and easy extension, without over-engineering.
- Use common conventions and standard implementations. Do not reimplement what the standard library or an existing library provides.
- Prefer deep modules: a small interface over a lot of behavior (`/codebase-design`).
- Do not weaken type checking or lint rules just to make a change pass.

## Rules that matter

- Register Tauri commands once, in `src-tauri/src/bindings.rs`. Regenerate the TypeScript bindings with `pnpm bindings`. Never edit the generated file by hand.
- A Tauri command that can wait on the playback worker, or that blocks, is `async` and uses `spawn_blocking`. A synchronous command runs on the main thread.
- Library columns that hold a state (availability, inspection, artwork status) map to Rust enums in `library/status.rs`.
  - The migration's CHECK lists the same names, and any retired ones. SQLite cannot change a CHECK without rebuilding the table.
  - Foreign keys cascade. Do not write child deletes by hand.
- Only `library/keys.rs` computes how the catalog files a track (title, artist, album and Album Artist keys, year). The key columns store the result when a track is written. Reads use the stored keys.
- Build a track's file path only through `TrackLocation`. It checks that the path stays inside its root.
- The backend never returns display strings. An unnamed album or artist is `""` and sorts last. The renderer labels it.
- Use semantic tokens for UI surfaces. Do not use raw palette values.
- Renderer code under `src/lib` is split by domain: `native`, `playback`, `library`, `lyrics`, `meters`, `settings`, `shell`, `components`, `ui`, `utils`.
  - Dependency flow: `routes → components → shell → {playback, library, lyrics, settings} → {ui, utils, native}`.
  - Only `native` may import `@tauri-apps/*`.
- Shared `lib/ui` controls provide defaults only. Keep domain-specific styling local. Playwright validates the result.
- Import icons one by one (`@lucide/svelte/icons/x`). Never import from the `@lucide/svelte` barrel. In `vite dev`, the barrel transforms every icon module and slows page loads and E2E runs.

## Documentation

- Documentation is the single source of truth. Each fact lives in one file. Link to it; do not copy it.
- Do not over-detail. Do not record what the code already shows.
- `.scratch/` holds gitignored working notes. Move anything worth keeping to a file above.
- Change the behavior and the doc in the same commit.
- Write in English, in Simplified Technical English ([ASD-STE100](https://www.asd-ste100.org/)). The rules are a guide, not a gate. In short:
  - One idea per sentence. Keep sentences short (about 20 words for steps, 25 for descriptions).
  - Use the active voice and simple verbs.
  - Prefer a list to a long sentence with semicolons or nested brackets.
  - Use one word for one thing. Use the terms in `CONTEXT.md`.

## App e2e (`tests-app/`)

- Selectors: find a region by its `aria-label` or role with CSS. Narrow from the page to the element (`$(scope).$(…)`). Define each scope once, at the top of the spec.
- Use a text selector (`button=Meters`) only as the last step of a chain. Never put it inside one selector string, because WebdriverIO cannot mix strategies.
- When two elements share a label, add the tag or role (for example, the dock's "Now Playing" button and the layer).
- Add `data-testid` only where no accessible name exists.
- Observe the app through seams the repo owns: a `VITE_E2E`-only counter or a `wdio`-feature-only command. Do not use Tauri or WebdriverIO internals. They are read-only or private, and a patch on them is silently ignored.
- After a Tauri upgrade, run `pnpm test:e2e:app`. Rationale and sources: [tauri-app-e2e-stability.md](./docs/research/tauri-app-e2e-stability.md).

## Workflow

- Commit to `main`. Use branches for big or risky changes.
- Commit message format: `<type>(<scope>): <description>` ([Conventional Commits](https://www.conventionalcommits.org/))
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`
  - Description in imperative mood, lowercase, no period. Mark breaking changes with `!` or `BREAKING CHANGE:` footer.
- Feature workflow: `/grill-with-docs` (design) → `/to-spec` → `/to-tickets` → `/implement`. Skip spec and tickets for small features.
- Run `/clear` after each workflow step (once decisions are written to docs and work is committed).

## Checks

No CI or commit hooks. Run before committing:

- All changes: `pnpm check` (includes format, type check, lint)
- Renderer logic: `pnpm test:renderer` or `pnpm test:shared`
- Rust: `pnpm check:native` and `pnpm test:native`
- Tauri bindings: `pnpm bindings` (regenerate TypeScript bindings)
- IPC/startup/routing: `pnpm test:e2e`
- Renderer and backend wiring: `pnpm test:e2e:app` (Windows)
- UI/window behavior: test with `pnpm dev`
- Release: `pnpm validate && pnpm package`

Fix format with `pnpm format`. Run slow tests in background. While iterating, use focused checks (`vitest run <file>`, `cargo check -p <crate>`).
