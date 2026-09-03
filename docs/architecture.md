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
SvelteKit / Svelte 5 / TypeScript / GSAP + Flip
        ↓
Desktop Host
Electron / TypeScript
        ↓
Backend
Rust
```

The **Renderer** owns presentation, interaction, navigation, and frontend-local state.

The **Desktop Host** owns the desktop process and trust boundaries, application lifecycle, platform integration, and communication between the Renderer and Backend.

The **Backend** owns application domain behavior, persistent state, filesystem work, audio playback, and other native work.

## Renderer

The Renderer is the SvelteKit application running in Electron's renderer process.

SvelteKit and Svelte 5 provide application structure, navigation, rendering, and UI state. TypeScript defines frontend contracts. GSAP and Flip provide animation capabilities through the project animation boundary.

| Module     | Location             | Responsibility                                 |
| ---------- | -------------------- | ---------------------------------------------- |
| Routes     | `src/routes`         | Semantic navigation and page composition       |
| Features   | `src/lib/features`   | Feature-specific presentation and interaction  |
| API        | `src/lib/api`        | Renderer-facing native capability boundary     |
| Animation  | `src/lib/animation`  | Project animation semantics and GSAP isolation |
| Components | `src/lib/components` | Reusable UI composition                        |

Feature code consumes shared capabilities through project boundaries rather than depending directly on Electron, backend infrastructure, or external implementation details.

Persistent application surfaces are composed through SvelteKit layouts.

## Desktop Host

The Desktop Host is implemented with Electron and TypeScript.

It hosts the Renderer, defines its trust boundary, manages the desktop application lifecycle, connects the Renderer to the Backend, and owns Electron-specific platform integration.

| Module  | Location           | Responsibility                                                                                                       |
| ------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Preload | `electron/preload` | Exposes the narrow application API available to the Renderer across the trust boundary                               |
| Main    | `electron/main`    | Application and window lifecycle, Renderer IPC routing, Backend process lifecycle, and Electron-specific integration |

The Desktop Host connects processes and platform capabilities without owning application domain behavior.

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
Renderer
   ↓
Renderer API
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

The Renderer does not depend directly on Electron or Backend infrastructure.

The Desktop Host mediates trust, process, and platform boundaries without becoming a domain layer.

The Backend Protocol transports operations and events without defining domain behavior.

External dependencies are isolated behind thin project boundaries when isolation is needed. Those boundaries do not reproduce the dependency's implementation.

Each authoritative state has one owner. Other parts of the system may present, cache, or mirror that state without creating competing authority.

Renderer-owned state is limited to presentation, interaction, navigation, cached reads, and temporary user input. Mirrored Backend state preserves the identity and ordering semantics defined by its Backend owner.

## Naming

Svelte components use `PascalCase.svelte`.

TypeScript modules use `kebab-case.ts`.

Svelte-reactive TypeScript modules use `.svelte.ts`.

Rust modules and files use `snake_case`.

Modules and boundaries are named for the responsibility they represent. Equivalent responsibilities use consistent terminology and structure; differences in naming or structure should reflect meaningful differences.
