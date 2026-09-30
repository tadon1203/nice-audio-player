# Contributing

## Principles

- Everything comes back to reducing cognitive load. Make intent clear through file structure, code structure, and naming.
- No ad-hoc fixes. Design for long-term consistency and easy extension, without over-engineering.
- No resistance to changing existing code, and no appetite for changing it, without a clear practical reason.
- Share UI code only when it shares naturally.
- Respect the project's context, but prefer common conventions and standard implementations.
- Do not reimplement what the standard library or an existing library already provides, without a clear practical reason.
- Prefer deep modules: a small interface over a lot of behavior (`/codebase-design`).
- Documentation is the single source of truth, branching like a tree from README.md and CLAUDE.md. Do not over-detail, and do not duplicate content across documents.

## Rules that matter

- Register Tauri commands in `src-tauri/src/bindings.rs` and regenerate `src/shared/ipc/bindings.ts` with `pnpm bindings`; never edit the generated file by hand.
- Rust owns domain and persistent state. Renderer state only caches or mirrors it.
- TanStack Router owns navigation, TanStack Query owns native read caches, Zustand owns renderer-local interaction state.
- Frontend code under `src/**` reaches native features only through `src/shared/lib/native.ts`, and never imports `node:*`.
- Use shadcn primitives (`pnpm exec shadcn add <component>`) and semantic tokens; no raw palette values for UI surfaces.
- Tauri commands that can wait on the playback worker or do blocking work are `async` and use `spawn_blocking`; a synchronous command runs on the main thread.
- Backend services report changes by emitting a `BackendEvent` to their `EventSink`, never by owning a channel for the host to drain.
- High-frequency renderer data (playback position, anything drawn per frame) stays out of broad subscriptions: read it with a narrow hook, a ref, or `store.getState()`.
- Library columns that hold a state (availability, inspection, artwork status) map to Rust enums in `library/status.rs`; the migration's CHECK lists the same names. Foreign keys cascade, so deleting a parent needs no hand-written child deletes.
- The backend never returns display strings: an unnamed album or artist is `""`, sorted last, and the renderer labels it (`entities/library/model/unknown-name.ts`).
- Once a renderer slice has more than three files, group them in `model/`, `api/`, `lib/` or `ui/` segments.
- Do not weaken type checking or lint rules just to make a change pass.

## Workflow

- Commit directly to `main`. Use a branch or PR only for big or risky changes.
- Commit messages: short and descriptive. Conventional Commits are optional.
- Tests are welcome for fragile logic but not required for every change. Use `/tdd` for fragile logic.
- The feature flow (`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement`) is in [CLAUDE.md](./CLAUDE.md).

## Verification

- Usually: `pnpm check` (and `pnpm test` if logic changed).
- Backend changes: `pnpm check:native` and `pnpm test:native`.
- Startup, IPC, or routing changes: `pnpm test:e2e`.
- Before a release: `pnpm validate`, then `pnpm package`.
