# Contributing

## Principles

- Everything comes back to reducing cognitive load. Make intent clear through file structure, code structure, and naming.
- No ad-hoc fixes. Design for long-term consistency and easy extension, without over-engineering.
- No resistance to changing existing code, and no appetite for changing it, without a clear practical reason.
- Prefer common conventions and standard implementations. Do not reimplement what the standard library or an existing library provides, without a clear practical reason.
- Share UI code only when it shares naturally.
- Prefer deep modules: a small interface over a lot of behavior (`/codebase-design`).
- Documentation is the single source of truth, branching like a tree from README.md and CLAUDE.md. Do not over-detail, and do not duplicate content across documents.

## Rules that matter

- Tauri commands are registered once in `src-tauri/src/bindings.rs`; regenerate the TypeScript bindings with `pnpm bindings` and never edit the generated file by hand.
- Tauri commands that can wait on the playback worker or do blocking work are `async` and use `spawn_blocking`; a synchronous command runs on the main thread.
- Library columns that hold a state (availability, inspection, artwork status) map to Rust enums in `library/status.rs`; the migration's CHECK lists the same names, plus any retired ones (SQLite cannot change a CHECK without rebuilding the table). Foreign keys cascade, so deleting a parent needs no hand-written child deletes.
- Library migrations must be non-destructive: the database is copied to `library.sqlite3.v<N>.bak` before one runs, and a migration must not make that copy the only place data survives.
- What the catalog files a track under (title, artist, album and Album Artist keys, year) is computed only in `library/keys.rs`, stored in key columns when a track is written, and read back from them. A track's file path is built only through `TrackLocation`, which checks it stays inside its root.
- The backend never returns display strings: an unnamed album or artist is `""`, sorted last, and the renderer labels it.
- Use semantic tokens for UI surfaces; no raw palette values.
- Shared `lib/ui` controls provide common defaults. Keep domain-specific names, layout and playback state in their callers; use local `class`/`style` where needed instead of adding domain variants to generic controls. Check this in review, without ESLint or custom checker scripts; see [ADR 0013](./docs/adr/0013-shared-ui-owns-presentation-policy.md).
- Import icons one by one (`@lucide/svelte/icons/x`), never from the `@lucide/svelte` barrel: in `vite dev` the barrel transforms every icon module and slows page loads and E2E runs.
- Do not weaken type checking or lint rules just to make a change pass.

## Workflow

- Commit directly to `main`. Use a branch or PR only for big or risky changes.
- Tests are welcome for fragile logic (`/tdd`) but not required for every change.
