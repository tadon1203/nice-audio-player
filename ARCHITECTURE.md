# Architecture

This document is the map of the system and the rules that keep it in shape.

## About this document

This document changes rarely. Keep it stable.

- The sections are fixed, as in the template below. Do not add, remove, or rename a section. Put new content in one of them.
- Do not put information here that changes often.
- Do not name a file in the Code map. Name a directory.
- Do not describe an implementation detail. The code and its comments do that.
- Change this document only when the structure or a rule changes.

The template of this document. Text in `<>` is a placeholder: replace it, and keep everything else.

```markdown
# Architecture

<What this document is.>

## About this document

<The rules for changing this document.>

## Mental model

<The technology stack, by layer: its directory, its technology, what it owns, and what it must not hold.>

<How data flows through the layers: each path, its direction, and what it carries.>

## Code map

<Where each part lives, by directory.>

| Directory     | What it holds              |
| ------------- | -------------------------- |
| `<directory>` | <What it holds, in a line> |

## Invariants

- <A rule that must never break, so the design does not decay.>
```

## Mental model

Three layers, one direction of control. The terms are defined in [CONTEXT.md](./CONTEXT.md).

- **Renderer** (`src`): SvelteKit (Svelte 5, `adapter-static`, SPA), built by Vite. It composes views and caches native state. It holds no second source of truth.
- **Host** (`src-tauri`): Tauri 2. It runs the Windows WebView and connects the Backend to the window and the operating system. It holds no domain rules.
- **Backend** (`backend`): a Rust crate. It owns the domain and the persistent state: the Library, Playback, and settings. It knows nothing about Tauri.

Communication: one path for requests, four for pushes.

- **Renderer → Backend (1 path):** a command. The Renderer calls a Host command through the area objects in `src/lib/native/commands.ts` (`player`, `library`, `lyrics`, `meter`, `appearance`, `app`), and the Host calls the Backend. The answer is the command's return value. State answers are `Versioned`.
- **Backend → Renderer (4 paths):**
  1. **State:** a topic's whole value with its version, on the `app_connect` channel. The Backend keeps every topic's value in its state store. The Library topic carries the Library state: its availability, its version, its directories, and its scan. The Library worker publishes it; `BackendApp` publishes the Unavailable state when the Library did not open, since there is no worker then.
  2. **Backend event:** a fact that happened once, such as a skipped track, on the `app_connect` channel.
  3. **Position:** the playing position, on the `app_connect` channel.
  4. **Measurement:** meter frames, as JSON, on the channel that `meter_start` takes. The Meter measures only while the Player runs.

The Renderer updates its caches and views from these.

## Code map

| Directory                | What it holds                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes`             | SvelteKit routes and the app frame.                                                                                                                          |
| `src/lib/native`         | The only adapter to Tauri, with the generated bindings.                                                                                                      |
| `src/lib/player`         | Renderer side of Playback and the Queue.                                                                                                                     |
| `src/lib/library`        | Renderer side of the Library.                                                                                                                                |
| `src/lib/lyrics`         | Renderer side of lyrics.                                                                                                                                     |
| `src/lib/meter`          | Renderer side of the Spectrum and the Level meter.                                                                                                           |
| `src/lib/appearance`     | Renderer side of the appearance settings.                                                                                                                    |
| `src/lib/app`            | The Renderer App: app state that spans Renderer domains.                                                                                                     |
| `src/lib/components`     | Product-specific compositions of Renderer domains, such as the Dock and Now Playing.                                                                         |
| `src/lib/ui`             | Shared controls, with the shadcn-svelte primitives.                                                                                                          |
| `src/lib/utils`          | Small helpers with no domain knowledge.                                                                                                                      |
| `backend/src/app`        | The composition root. It joins the services and holds the cross-domain use cases.                                                                            |
| `backend/src/player`     | Playback: the Player, its queue and worker, the Output stream, the Waveform, and the decode and processing stages.                                           |
| `backend/src/library`    | The Library: its database, the sync worker, the Scan, the albums, the media files it reads, and artwork.                                                     |
| `backend/src/lyrics`     | Lyrics parsing and service.                                                                                                                                  |
| `backend/src`            | Also holds the small modules that serve many domains (settings, messages, state store, errors, threads, ids), and the Level and Spectrum meter (`meter.rs`). |
| `src-tauri/src/commands` | Host commands, grouped by domain.                                                                                                                            |
| `src-tauri/src`          | Also holds command registration, message delivery, and the artwork protocol.                                                                                 |
| `tests`                  | Renderer E2E tests (Playwright, with a scripted native API).                                                                                                 |
| `tests-app`              | App E2E tests (WebdriverIO, on the real app).                                                                                                                |

## Invariants

- The IPC contract is defined once, in the Backend. The Renderer's bindings are generated from it. Nobody edits them by hand.
- A Host command that blocks does not run on the main thread.
- Backend services know nothing about the Host or each other. They set state in the state store, and report a position or a backend event through the notifier.
- The Host reaches the Backend only through `BackendApp` and its public modules.
- Settings are read and written through the IPC of the area that owns them. Appearance is read from `app_connect` and written with `appearanceUpdate`; player preferences are read and written through the player commands.
- A state is its whole value with a version. The Renderer keeps a value only if its version is newer than the one it holds, whether it came on the channel or as a command answer.
- A backend event is a fact. It builds no state in the Renderer.
- The Renderer subscribes, then fetches: `app_connect` registers the channel and returns the current values.
- Every state that the Library stores is a closed set of values. The code and the database enforce the same set.
- One place decides how the Library files a track (its Album Artist and album). Reads use the stored result.
- An Album is identified by its `AlbumId`; no query, command, or route identifies one by its title, Album Artist, or directory. A URL carries IDs, never a name or a directory.
- A value goes in page state only if it cannot be in the URL, Back must undo it, and it belongs to the app frame. A modal that Back closes uses shallow routing, which SvelteKit describes.
- One place builds the path of a track's file, and it keeps the path inside its Library directory.
- The Backend never returns display strings. An unnamed album or artist is empty, and the Renderer labels it.
- Renderer dependencies flow one way: routes, then components, then the Renderer app, then the Renderer domains, then the shared layers (ui, utils, native). A Renderer domain does not import another Renderer domain.
- Only the native adapter imports Tauri packages.
- Shared controls give defaults only. Styling that belongs to one Renderer domain stays in that domain.
