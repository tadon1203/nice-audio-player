# Architecture

This document describes the system-level architecture of Nice Audio Player. It defines the major technologies, components, modules, boundaries, responsibilities, ownership, and dependency relationships that shape the system.

Its purpose is to provide a stable shared mental model of how the project is structured and how its major parts relate.

## Maintaining This Document

Update this document when a change alters that system-level mental model. Local implementation details remain expressed in code.

If understanding a change requires revising how the major parts of the system are structured, owned, or connected, update this document.

## System Overview

Nice Audio Player consists of three system-level components:

```
Renderer
Angular / TypeScript
        ↓
Desktop Host
Electron / TypeScript
        ↓
Backend
Rust
```

The **Renderer** owns presentation, interaction, navigation, and renderer-local state.

The **Desktop Host** owns the desktop process and trust boundaries, application lifecycle, platform integration, and communication between the Renderer and Backend.

The **Backend** owns application domain behavior, persistent state, filesystem work, audio playback, and other native work.

## Renderer

The Renderer is the standalone Angular application running in Electron's renderer process.

Angular Router is the navigation authority. Hierarchical dependency injection defines service ownership and lifetime. Signals represent current renderer state, while RxJS represents event and stream semantics. Angular components should remain small and focused; feature behavior belongs in feature services and stores rather than in templates.

The Renderer is organized around application ownership rather than framework-specific route files:

```
src/
├── main.ts
├── styles/
└── app/
    ├── core/
    │   ├── backend/
    │   └── shell/
    ├── library/
    ├── playback/
    ├── settings/
    ├── app.config.ts
    └── app.routes.ts
```

| Area     | Location             | Responsibility                                    |
| -------- | -------------------- | ------------------------------------------------- |
| Core     | `src/app/core`       | Cross-feature services and application boundaries |
| Shell    | `src/app/core/shell` | Persistent surfaces and application chrome        |
| Library  | `src/app/library`    | Library UI, state, and interactions               |
| Playback | `src/app/playback`   | Playback UI, state, and interactions              |
| Settings | `src/app/settings`   | Settings UI, state, and interactions              |

Feature routes should be lazy-loaded. Route-level providers are used when a service lifetime belongs to a lazy route; component-level providers are used when a lifetime belongs to a component subtree. Root providers are reserved for application-wide services.

Persistent application surfaces are owned by the root application shell and composed around the Angular Router outlet. The desktop shell is a flexible workspace followed by a 128px playback area composed of a 104px Playback Dock and a 24px playback signal-status bar. At wide widths the workspace uses a fixed 224px navigation column beside the routed main area; narrow widths rearrange navigation above the main area without changing route ownership.

Library presentations are peer child routes rather than tab-local navigation:

```
/library             → /library/albums
/library/albums
/library/albums/:albumArtist/:albumTitle
/library/album-artists
/library/tracks
/settings
```

The Library feature owns presentation-specific cached data, filters, and scroll positions. Album Details is a child route of Albums and owns a route-scoped album details workspace for album metadata and paged album tracks. The Router owns the active presentation and the navigation links expose that state through `aria-current`. Playback Dock and signal-status UI remain shell-owned so playback state stays visible while routes change.

Time-based visual motion is owned by the component or directive that owns the state being changed. Simple state transitions use CSS and named motion tokens from `src/styles/theme.css`. A complex animation library may be introduced locally when a concrete feature requires sequencing, FLIP, or dynamic interruption; motion does not create a second state store or cross-feature service.

The Renderer does not import Electron or Node APIs. Native and backend capabilities are accessed through the shared native API contract exposed by Preload.

## Shared Contracts

Shared contracts are not runtime components, but they define the system boundary between Renderer and Desktop Host and therefore belong in the architecture:

```
shared/
├── native-app-api.ts
└── protocol/
    └── generated.ts
```

`native-app-api.ts` defines the narrow API available to the Renderer through Preload. `protocol/generated.ts` is generated from the Rust protocol and defines the typed transport contract consumed by Electron and the shared boundary code.

Renderer and Electron both consume these contracts. Neither side owns them; changes to the contracts are boundary changes and must preserve the trust and type boundaries between the processes.

## Desktop Host

The Desktop Host is implemented with Electron and TypeScript.

It hosts the Renderer, defines its trust boundary, manages the desktop application lifecycle, connects the Renderer to the Backend, and owns Electron-specific platform integration.

| Module  | Location           | Responsibility                                                                                     |
| ------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| Preload | `electron/preload` | Exposes the narrow application API available to the Renderer across the trust boundary             |
| Main    | `electron/main`    | Application and window lifecycle, Renderer IPC routing, Backend process lifecycle, and integration |

The packaged Renderer runs with context isolation and sandboxing, receives only narrow Preload capabilities, and privileged IPC validates its sender. The Desktop Host connects processes and platform capabilities without owning application domain behavior.

## Backend

The Backend is a separate native process implemented in Rust.

It owns domain behavior and native work that does not belong to the Renderer or Desktop Host.

| Module      | Location                  | Responsibility                                            |
| ----------- | ------------------------- | --------------------------------------------------------- |
| Protocol    | `backend/src/protocol`    | Transport between the Desktop Host and Backend            |
| Application | `backend/src/app.rs`      | Coordination across backend responsibilities              |
| Audio       | `backend/src/audio`       | Playback and audio processing                             |
| Library     | `backend/src/library`     | Music catalog, filesystem reconciliation, and persistence |
| Lyrics      | `backend/src/lyrics`      | Lyrics resolution and parsing                             |
| Media       | `backend/src/media`       | Media-file validation and inspection                      |
| Activity    | `backend/src/activity.rs` | Long-running backend activity state                       |

The Protocol handles requests, responses, events, serialization, and message correlation without owning domain behavior.

The Application coordinates operations that span backend modules without replacing the responsibilities they own.

## Boundaries, Dependencies, and Ownership

The primary dependency flow is:

```
Angular Feature
    ↓
Renderer Backend Boundary
    ↓
Shared Native API Contract
    ↓
Preload
    ↓
Electron Main
    ↓
Backend Protocol
    ↓
Backend Application
    ↓
Backend Modules
```

Dependencies follow responsibility boundaries toward the code that owns the required capability.

The Renderer does not depend directly on Electron or Backend infrastructure. The Desktop Host mediates trust, process, and platform boundaries without becoming a domain layer. The Backend Protocol transports operations and events without defining domain behavior.

Each authoritative state has one owner. Rust is authoritative for domain and persistent state:

```
Rust authoritative state
        ↓ events / responses
Renderer service/store
        ↓ Signal mirrors
Angular components
```

Renderer services and stores may cache or mirror backend state, but they must not become a competing authority. Signal propagation should use `computed()` and `linkedSignal()` where appropriate; `effect()` is not used to propagate state between signals.

Renderer-owned state is limited to presentation, interaction, navigation, cached reads, and temporary user input. Mirrored Backend state preserves the identity and ordering semantics defined by its Backend owner.

## Build and Distribution

Build and packaging responsibilities are deliberately separated:

```
Angular CLI     → Renderer build/dev server
esbuild         → Electron main/preload
Cargo           → Rust Backend
Electron Forge  → package / make / signing / distribution
```

Angular CLI owns the Renderer application build using the standard `@angular/build:application` builder. esbuild owns the Electron main and Preload bundles. Cargo owns the Rust Backend binary. Electron Forge packages the completed artifacts and produces distribution outputs; it is not the Renderer or Backend build system.

The `pnpm build` pipeline has one producer per artifact and one assembly step:

```
binding generation → shared/protocol/generated.ts
Angular CLI        → build/renderer
esbuild             → build/electron
Cargo               → build/backend
runtime staging     → build/runtime
Forge package       → build/forge
```

`pnpm build` runs all producers in dependency order and then assembles the packaged runtime. Runtime staging does not compile code; it copies the already-built Electron and Renderer artifacts and writes the packaged runtime manifest. Forge's `prePackage` invokes `pnpm build`, while `packageAfterCopy` only replaces Forge's temporary application directory with `build/runtime`.

Development runtime:

```
Angular dev server → Electron
```

The Electron window loads the Angular dev server during development. In a packaged application, the custom `nice-player://renderer/` protocol serves the Angular static build from the staged `renderer/browser/` directory.

Angular Router uses `withHashLocation()` for Electron routing:

Hash routing keeps navigation state in the URL fragment, so the static Renderer protocol does not need a server-side SPA fallback for Angular routes.
