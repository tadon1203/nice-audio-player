# Architecture

## Document responsibility

This document defines system structure, ownership, and dependency direction. Product acceptance belongs in `requirements.md`; visual rules belong in `DESIGN.md`.

## System overview

```text
React Renderer → sandboxed Preload → Electron Main → NAPI-RS/Rust/SQLite
```

Rust owns domain behavior, persistence, filesystem work, and audio playback. Electron Main owns lifecycle, security, protocols, and IPC. React owns view composition only.

## Source boundaries

```text
src/app/{main,preload,renderer}  entry points and composition
src/main/{features,shared}       privileged Electron implementation
src/renderer/{pages,widgets,features,entities,shared}  FSD renderer slices
src/shared/ipc                   structured-clone IPC contract
```

Main and Renderer never import each other. Both may import `src/shared`; slice consumers use each slice's public `index.ts`. The native addon is imported only by `src/main/shared/native-backend` and is instantiated once in Main.

## Renderer state

TanStack Router owns navigation, validated search state, URL history, and scroll restoration. TanStack Query owns native read-model caching and event-driven cache updates. Zustand is restricted to push-driven playback state and never duplicates library data or Rust authority.

## IPC and distribution

`src/shared/ipc` defines allow-listed channels, Zod validation, DTOs, invoke maps, and renderer events. Preload exposes only `window.electron`; it exposes neither `ipcRenderer` nor arbitrary invocation. Every Main handler validates sender, arguments, and response.

electron-vite builds Main (ESM), sandboxed Preload (CJS), and Renderer from one configuration into `out/{main,preload,renderer}`. electron-builder packages the Windows x64 NSIS artifact, keeps the NAPI addon outside ASAR, and does not own development builds.
