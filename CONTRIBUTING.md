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
- Library columns that hold a state (availability, inspection, artwork status) map to Rust enums in `library/status.rs`; the migration's CHECK lists the same names. Foreign keys cascade, so deleting a parent needs no hand-written child deletes.
- The backend never returns display strings: an unnamed album or artist is `""`, sorted last, and the renderer labels it.
- Use semantic tokens for UI surfaces; no raw palette values.
- Do not weaken type checking or lint rules just to make a change pass.

## Workflow

- Commit directly to `main`. Use a branch or PR only for big or risky changes.
- Tests are welcome for fragile logic (`/tdd`) but not required for every change.

## Verification

- Usually: `pnpm check` (and `pnpm test` if logic changed).
- Backend changes: `pnpm check:native` and `pnpm test:native`.
- Startup, IPC, or routing changes: `pnpm test:e2e`.
- Before a release: `pnpm validate`, then `pnpm package`.
