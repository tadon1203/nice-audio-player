# 0003: Rust owns domain and persistent state

Rust owns domain behavior, persistence, filesystem work, audio playback, and the privileged desktop boundary. The renderer only composes views and caches or mirrors native state. It never duplicates library data or holds a second source of truth.

- The IPC contract is authoritative in Rust. TypeScript bindings are generated (rules in [CONTRIBUTING.md](../../CONTRIBUTING.md)). The renderer reaches native features only through one adapter.
- Backend services know nothing about Tauri or each other. They emit `BackendEvent`s, which carry no state. The host reads the current snapshot and forwards it.
- The playback worker alone owns the queue and the output stream. Everything else sends it commands and reads its published snapshots.
- The library scanner works in batches, with one transaction per batch. A cancelled or failed scan never leaves a half-written batch. The scanner reconciles read-only and inspects files with no transaction open. The write lock is held only for the batch's writes.
- The Library has a read side (`LibraryStore`, built from the database alone) and a write side (`LibrarySync`, one actor that owns the folders, watchers and scanner). Opening it gives a working Library or an unavailable reason.
- Settings writes are debounced and atomic.
- The `nice-artwork` protocol serves only canonical content-addressed artwork beneath application data.
- Tauri capabilities give the main window only the native permissions that the app needs.
