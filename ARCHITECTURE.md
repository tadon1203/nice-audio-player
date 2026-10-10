# Architecture

This document is the map of the system and the rules that keep it in shape. The reasons for the large decisions are in [docs/adr/](./docs/adr/).

## About this document

This document changes rarely. Keep it stable.

- The sections are fixed. Do not add, remove, or rename a section. Put new content in one of them:
  - **Mental model:** the technology stack, and how data flows through it.
  - **Code map:** where each part lives, by directory.
  - **Invariants:** the rules that must never break, so the design does not decay.

- Do not put information here that changes often.
- Do not name a file in the Code map. Name a directory.
- Do not describe an implementation detail. The code and its comments do that.
- Change this document only when the structure or a rule changes.

## Mental model

Three layers, one direction of control.

- **Renderer:** SvelteKit (Svelte 5, `adapter-static`, SPA), built by Vite. It composes views and caches native state. It holds no second source of truth.
- **Host:** Tauri 2. It runs the Windows WebView and connects the Backend to the window and the operating system. It holds no domain rules.
- **Backend:** a Rust crate. It owns the domain and the persistent state: the Library, Playback, and settings. It knows nothing about Tauri. See [ADR 0001](./docs/adr/0001-rust-owns-domain-and-persistent-state.md).

Data flow:

1. The Renderer calls a Host command through the `native` adapter.
2. The Host command calls the Backend.
3. A Backend service changes state and emits an event. The event carries no state.
4. The Host reads the current snapshot and sends it to the Renderer.
5. The Renderer updates its caches and views.

## Code map

| Directory                | What it holds                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `src/routes`             | SvelteKit routes and the app frame.                                                  |
| `src/lib/native`         | The only adapter to Tauri, with the generated bindings.                              |
| `src/lib/playback`       | Renderer side of Playback and the Queue.                                             |
| `src/lib/library`        | Renderer side of the Library.                                                        |
| `src/lib/lyrics`         | Renderer side of lyrics.                                                             |
| `src/lib/meters`         | Renderer side of the Spectrum and the Level meter.                                   |
| `src/lib/settings`       | Renderer side of settings.                                                           |
| `src/lib/shell`          | The Renderer shell: app state that spans Renderer domains.                           |
| `src/lib/components`     | Product-specific compositions of Renderer domains, such as the Dock and Now Playing. |
| `src/lib/ui`             | Shared controls, with the shadcn-svelte primitives.                                  |
| `src/lib/utils`          | Small helpers with no domain knowledge.                                              |
| `backend/src/app`        | The composition root. It joins the services and holds the cross-domain use cases.    |
| `backend/src/audio`      | Playback, the Output stream, the Waveform, the Spectrum, and the Level meter.        |
| `backend/src/library`    | The Library: its database, the Scan, and artwork.                                    |
| `backend/src/lyrics`     | Lyrics parsing and service.                                                          |
| `backend/src/media`      | Reading tags, embedded lyrics, and file checks.                                      |
| `backend/src`            | Also holds the small modules that serve many domains (settings, events).             |
| `src-tauri/src/commands` | Host commands, grouped by domain.                                                    |
| `src-tauri/src`          | Also holds command registration, event forwarding, and the artwork protocol.         |
| `tests`                  | Renderer E2E tests (Playwright, with a scripted native API).                         |
| `tests-app`              | App E2E tests (WebdriverIO, on the real app).                                        |

## Invariants

- The IPC contract is defined once, in the Backend. The Renderer's bindings are generated from it. Nobody edits them by hand.
- A Host command that blocks does not run on the main thread.
- Backend services know nothing about the Host or each other. They emit events, which carry no state.
- Every state that the Library stores is a closed set of values. The code and the database enforce the same set.
- One place decides how the Library files a track (its Album Artist and album). Reads use the stored result.
- One place builds the path of a track's file, and it keeps the path inside its Library folder.
- The Backend never returns display strings. An unnamed album or artist is empty, and the Renderer labels it.
- Renderer dependencies flow one way: routes, then components, then the Renderer shell, then the Renderer domains, then the shared layers (ui, utils, native). A Renderer domain does not import another Renderer domain.
- Only the native adapter imports Tauri packages.
- Shared controls give defaults only. Styling that belongs to one Renderer domain stays in that domain.
