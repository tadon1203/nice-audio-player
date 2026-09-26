# Architecture

## System overview

```text
React Renderer → Tauri commands/events → Rust backend/SQLite
```

Rust owns domain behavior, persistence, filesystem work, audio playback, and the privileged desktop boundary. Tauri owns the Windows WebView host, command/event transport, capability policy, window lifecycle, and local artwork protocol. React owns view composition only.

## Source boundaries

```text
src/app/renderer                 renderer entry point and composition
src/renderer/{pages,widgets,features,entities,shared}  FSD renderer slices
src/shared/ipc                   generated command, DTO, and event contract
src-tauri                        Tauri shell, commands, capabilities, packaging
backend                          Rust domain services, persistence, and audio
```

Renderer code never imports Rust implementation details. Renderer-to-native access is restricted to named Tauri commands, the dialog plugin, window APIs, and validated events. Rust command handlers call the existing backend services; no N-API addon or parallel domain implementation is used.

## Renderer state

TanStack Router owns navigation, validated search state, URL history, and scroll restoration. TanStack Query owns native read-model caching and event-driven cache updates. Zustand is restricted to push-driven playback state and never duplicates library data or Rust authority.

## IPC and distribution

Rust is authoritative for the IPC contract. Tauri commands are registered once in `src-tauri/src/bindings.rs`, and tauri-specta generates `src/shared/ipc/bindings.ts` (commands, DTOs, structured `{ code }` errors, and the `app:event` payload) with `pnpm bindings`; `pnpm bindings:check` fails when it is stale. `src/renderer/shared/lib/native.ts` is the sole frontend adapter: it wraps the generated commands, converts structured errors to `NativeCommandError`, and exposes only the typed application API. Tauri capabilities grant the main window only the native permissions required by the application.

Vite builds the React renderer into `dist`; the Tauri CLI builds and packages the Rust host and Windows NSIS installer. Tauri's `nice-artwork` URI handler (`src-tauri/src/artwork.rs`) serves only canonical content-addressed artwork beneath application data; on Windows the renderer loads it from `http://nice-artwork.localhost`. The Tauri host is split into `commands/` (IPC handlers), `events.rs` (backend event forwarding), `errors.rs` (IPC error mapping), and `artwork.rs`. The frameless Tauri window uses the app-owned 40px title surface and Tauri's explicit drag-region support.
