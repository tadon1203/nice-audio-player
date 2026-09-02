# Architecture

This document describes the system-level architecture of Nice Audio Player. It defines the major technologies, layers, modules, boundaries, responsibilities, ownership, and dependency relationships that shape the system.

It exists to provide a stable shared mental model of how the project is structured and how its major parts relate.

Update this document when a change alters that system-level mental model. Changes that affect only local implementation details should remain expressed in code.

As a practical test: if understanding the change requires a reader to revise how they think the major parts of the system are structured, owned, or connected, the architecture documentation should change with it.

## Technology Stack

- Electron
- SvelteKit / Svelte 5
- TypeScript
- Rust
- GSAP + Flip

## System Structure

```text
SvelteKit renderer
        ↓
preload boundary
        ↓
Electron main
        ↓
backend protocol
        ↓
Rust backend
```

The renderer owns presentation, interaction, and navigation.

Electron owns the desktop process boundary and application lifecycle.

Rust owns application domain behavior, persistent state, filesystem work, and audio playback.

## Frontend

```text
routes
  ↓
features
  ├─→ api
  ├─→ animation
  └─→ components
```

### Routes

`src/routes`

Owns semantic destinations, navigation, and page composition through SvelteKit.

Persistent application surfaces are composed by layouts.

### Features

`src/lib/features`

Owns feature-specific presentation and interaction state.

Initial feature boundaries are:

- `playback`
- `library`
- `settings`

Feature modules consume backend capabilities through `$lib/api`.

### API Boundary

`src/lib/api`

Owns the renderer-facing backend API.

It converts application operations into calls through the preload bridge and hides Electron IPC and backend transport details from feature code.

### Animation Boundary

`src/lib/animation`

Owns application animation recipes and isolates application code from GSAP.

```text
Svelte / SvelteKit
        ↓
$lib/animation
        ↓
GSAP + Flip
        ↓
DOM
```

GSAP owns animation mechanics including FLIP, position interpolation, velocity, interruption, and presence-related animation behavior.

The project boundary provides only thin adapters and reusable application recipes.

### UI Components

`src/lib/components`

Owns reusable presentation components.

`src/lib/components/ui` contains shared interaction primitives composed from maintained UI libraries.

## Desktop Boundary

### Preload

`electron/preload`

Exposes the narrow application API available to the renderer.

It is the renderer trust boundary and hides Electron primitives.

### Main

`electron/main`

Owns:

- application and window lifecycle;
- renderer IPC routing;
- Rust backend process lifecycle;
- Electron-specific desktop integration.

It does not own application domain behavior.

## Backend

```text
protocol
    ↓
application
    ↓
domain modules
    ↓
infrastructure
```

### Protocol

`backend/src/protocol`

Owns the process transport contract between Electron and Rust.

It handles request, response, event, serialization, and message correlation.

### Application

`backend/src/app.rs`

Owns operations that coordinate multiple backend modules.

It is the entry point from the protocol layer into application behavior.

### Audio

`backend/src/audio`

Owns playback and audio processing.

Its internal responsibilities include playback state, playback queue, decoding, output, devices, PCM processing, and volume.

### Library

`backend/src/library`

Owns the local music catalog and its persistence.

Its internal responsibilities include catalog queries, library roots, scanning, filesystem reconciliation, artwork, database access, and migrations.

### Lyrics

`backend/src/lyrics`

Owns lyrics resolution and parsing.

### Media

`backend/src/media`

Owns reusable media-file validation and inspection.

### Activity

`backend/src/activity.rs`

Owns application-level state for long-running backend activity.

## Boundaries and Dependencies

```text
routes
  ↓
features
  ↓
api ───────────────→ preload
  │                     ↓
  │                Electron main
  │                     ↓
  │               backend protocol
  │                     ↓
  └──────────────── application
                        ↓
                  backend modules
                        ↓
                  infrastructure
```

Frontend feature modules do not depend on Electron or backend infrastructure.

Electron does not become an application domain layer.

The protocol layer does not own domain behavior.

Dependency-specific APIs remain inside the module responsible for that dependency.

Thin project boundaries isolate maintained libraries without reproducing their implementation.

## State Ownership

Backend domain state has one authoritative owner.

Frontend state represents presentation, interaction, navigation, cached reads, and temporary user input.

Mirrored backend state preserves the identity and revision semantics supplied by its authoritative backend owner.

## Naming

Svelte components use `PascalCase.svelte`.

TypeScript modules use `kebab-case.ts`.

Svelte-reactive TypeScript modules use `.svelte.ts`.

Frontend feature directories use domain names such as `playback` and `library`.

Rust modules and files use `snake_case`.

Boundary names describe their responsibility rather than their underlying library or transport mechanism.
