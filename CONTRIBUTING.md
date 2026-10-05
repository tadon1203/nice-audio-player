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
- Library migrations must not destroy data. The database is copied to `library.sqlite3.v<N>.bak` before a migration runs. A migration must not make that copy the only place where data survives.
- Only `library/keys.rs` computes how the catalog files a track (title, artist, album and Album Artist keys, year). The key columns store the result when a track is written. Reads use the stored keys.
- Build a track's file path only through `TrackLocation`. It checks that the path stays inside its root.
- The backend never returns display strings. An unnamed album or artist is `""` and sorts last. The renderer labels it.
- Use semantic tokens for UI surfaces. Do not use raw palette values.
- Shared `lib/ui` controls provide common defaults only. Keep domain-specific names, layout and playback state in their callers, with a local `class` or `style`. Do not add domain variants to generic controls. Check this in review. Do not add ESLint rules or checker scripts. See [ADR 0013](./docs/adr/0013-shared-ui-owns-presentation-policy.md).
- Import icons one by one (`@lucide/svelte/icons/x`). Never import from the `@lucide/svelte` barrel. In `vite dev`, the barrel transforms every icon module and slows page loads and E2E runs.

## Documentation

- Documentation is the single source of truth. Each fact lives in one file. Link to it; do not copy it.
- Do not over-detail. Do not record what the code already shows.
- Where things go:
  - `README.md`: what the project is and how to run it.
  - `docs/requirements.md`: how the product behaves.
  - `DESIGN.md`: UI principles. No implementation details.
  - `CONTEXT.md`: domain terms. Add a term in the commit that first uses it.
  - `docs/adr/`: hard-to-reverse decisions, with the reason. Add one in the same commit as the decision.
  - `docs/research/`: sourced findings (`/research`).
  - `CONTRIBUTING.md`: engineering rules, workflow and checks.
  - `.scratch/`: gitignored working notes. Move anything worth keeping to a file above.
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

- Commit directly to `main`. Use a branch or PR only for big or risky changes.
- Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>(<scope>): <description>`.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`.
  - The scope is optional. Use the area of the change (for example, `library`, `player`, `ui`).
  - Write the description in the imperative mood, in lower case, without a final period.
  - Mark a breaking change with `!` after the type or scope, or with a `BREAKING CHANGE:` footer.
- Tests are welcome for fragile logic (`/tdd`) but not required for every change.
- Small change or tweak: just do it and commit. Bug: `/diagnosing-bugs`. Unsure about a fact: `/research`.
- Non-trivial feature: `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement`. For a feature small enough to hold in one head, skip the spec and tickets.
  - `/grill-with-docs` settles the design. Record new terms and decisions as described in Documentation.
  - `/to-spec` and `/to-tickets` write to `.scratch/<feature>/`.
- `/clear` after each step finishes (grill, spec, tickets, each ticket), once decisions are written to docs and work is committed. Not mid-grill or mid-implement.

## Checks

There is no CI, so the pre-commit check is the only gate.

- Run the cheapest command that covers the diff, once. Do not run a check again if it passed on the same tree.
- Run slow checks (`test:e2e*`, `package`, `validate`) in the background.
- Fix format with `pnpm format`.

| Change                                                            | Run                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Docs or comments only                                             | Nothing                                                                                                               |
| Renderer (`src/`)                                                 | `pnpm check`. If logic changed, add `pnpm test:renderer` or `pnpm test:shared`. While iterating: `vitest run <file>`  |
| Rust                                                              | `pnpm check:native` and `pnpm test:native`. While iterating: `cargo check -p <crate>`, `cargo test -p <crate> <name>` |
| Tauri command signature or event                                  | `pnpm bindings`, then the Renderer and Rust checks                                                                    |
| Startup, IPC, routing                                             | Add `pnpm test:e2e`                                                                                                   |
| Renderer and backend wiring (commands, events, startup, playback) | Add `pnpm test:e2e:app` (Windows, local only, plays silent files on the real output device)                           |
| Release                                                           | `pnpm validate`, then `pnpm package`                                                                                  |
| Tauri window, capabilities, titlebar controls                     | By hand with `pnpm dev`                                                                                               |
