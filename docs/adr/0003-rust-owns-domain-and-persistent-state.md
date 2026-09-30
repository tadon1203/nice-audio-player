# 0003: Rust owns domain and persistent state

Rust owns domain behavior, persistence, filesystem work, and audio playback. The renderer only composes views and caches or mirrors native state; it never duplicates library data or holds a second source of truth.

- The IPC contract is authoritative in Rust: commands are registered once in `src-tauri/src/bindings.rs` and TypeScript bindings are generated.
- The renderer reaches native features only through one adapter.
- Backend services emit `BackendEvent`s, which carry no state; the host reads the current snapshot and forwards it.

This is why the React to Svelte migration changes no Rust behavior (see [0001](./0001-sveltekit-spa-for-the-renderer.md)). Details: [architecture.md](../architecture.md).
