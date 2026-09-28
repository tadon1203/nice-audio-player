# Contributing

## Rules that matter

- Register Tauri commands in `src-tauri/src/bindings.rs` and regenerate `src/shared/ipc/bindings.ts` with `pnpm bindings`; never edit the generated file by hand.
- Rust owns domain and persistent state. Renderer state only caches or mirrors it.
- TanStack Router owns navigation, TanStack Query owns native read caches, Zustand owns renderer-local interaction state.
- Renderer code under `src/renderer/**` reaches native features only through `src/renderer/shared/lib/native.ts`, and never imports `node:*`.
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
- Tests are welcome for fragile logic but not required for every change.

## Verification

- Usually: `pnpm check` (and `pnpm test` if logic changed).
- Backend changes: `pnpm check:native` and `pnpm test:native`.
- Startup, IPC, or routing changes: `pnpm test:e2e`.
- Before a release: `pnpm validate`, then `pnpm package`.
