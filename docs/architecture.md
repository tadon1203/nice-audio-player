# Architecture

## Document responsibility

This document is the source of truth for system structure, boundaries, ownership, and dependencies. It does not define product acceptance, visual design, or local implementation details.

This document describes the system-level architecture of Nice Audio Player. It defines the major technologies, components, modules, boundaries, responsibilities, ownership, and dependency relationships that shape the system.

Its purpose is to provide a stable shared mental model of how the project is structured and how its major parts relate.

It may describe durable system components, responsibility boundaries, dependency direction, authoritative state ownership, shared contracts, and stable directory boundaries. Use abstract responsibilities first and add only the smallest concrete directory examples needed to make a boundary unambiguous, such as `src/app/playback`, `backend/src/audio`, or `shared/protocol`.

It must not describe individual files, file names, selectors, local component structure, token values, route-by-route details, or other short-lived implementation choices. For example, `src/app/playback` is an appropriate architectural location; a path to one implementation item inside that directory is not.

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

Angular Router is the navigation authority. Feature services and stores own renderer-local state, while components present that state.

The Renderer is organized around application ownership and stable directory boundaries:

```
src/
├── styles/
│   └── tokens/
└── app/
    ├── core/
    │   ├── backend/
    │   └── shell/
    ├── ui/
    ├── library/
    ├── playback/
    └── settings/
```

Renderer styling is owned by the `styles/` directory. The `styles/tokens/` directory owns raw primitives and public semantic tokens, while the style entry boundary owns Tailwind adapters and base rules. A component-specific contract belongs beside the component that owns it and must not be consumed by another component. Token decisions remain owned by the visual design source document.

| Area     | Location             | Responsibility                                            |
| -------- | -------------------- | --------------------------------------------------------- |
| Core     | `src/app/core`       | Cross-feature services and application boundaries         |
| Shell    | `src/app/core/shell` | Persistent surfaces and application chrome                |
| UI       | `src/app/ui`         | Reusable renderer presentation and interaction primitives |
| Library  | `src/app/library`    | Library UI, state, and interactions                       |
| Playback | `src/app/playback`   | Playback UI, state, and interactions                      |
| Settings | `src/app/settings`   | Settings UI, state, and interactions                      |

The UI area owns reusable renderer primitives and their presentation contracts. UI primitives may depend on Angular platform facilities, accessibility primitives, and shared semantic tokens, but they must not depend on feature state or feature directories. Feature areas compose UI primitives and remain responsible for domain-specific state, labels, and event handling.

Persistent application surfaces are owned by the root application shell and composed around the Angular Router outlet. The shell owns persistent navigation and playback surfaces around the routed workspace; feature routes own the content presented in that workspace.

Library presentations are sibling views within the Library feature. Album Details is a child view of Albums. The Library owns presentation-specific cached data, filters, and scroll positions, while playback remains shell-owned so playback state stays visible while routes change.

The Renderer does not import Electron or Node APIs. Native and backend capabilities are accessed through the shared native API contract exposed by Preload.

## Shared Contracts

Shared contracts are not runtime components, but they define the system boundary between Renderer and Desktop Host and therefore belong in the architecture:

```
shared/
└── protocol/
```

The `shared/` directory defines the narrow native API available to the Renderer through Preload. Its `protocol/` directory contains the manually maintained typed transport contract consumed by Electron and the shared boundary code, while Electron owns the runtime Zod schema for incoming backend frames.

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

| Module      | Location               | Responsibility                                                  |
| ----------- | ---------------------- | --------------------------------------------------------------- |
| Protocol    | `backend/src/protocol` | Transport between the Desktop Host and Backend                  |
| Application | `backend/src`          | Coordination across backend responsibilities and activity state |
| Audio       | `backend/src/audio`    | Playback and audio processing                                   |
| Library     | `backend/src/library`  | Music catalog, filesystem reconciliation, and persistence       |
| Lyrics      | `backend/src/lyrics`   | Lyrics resolution and parsing                                   |
| Media       | `backend/src/media`    | Media-file validation and inspection                            |

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

Build and packaging responsibilities are separated by runtime boundary: the Angular application produces the Renderer, the Desktop Host and Preload are bundled independently, the Backend is compiled by Cargo, and Electron Forge assembles the distributable application. Development loads the Renderer through its dev server; packaged applications serve the built Renderer through the desktop protocol.
