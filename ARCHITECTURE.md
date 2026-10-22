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
- **Backend** (`backend`): a Rust crate. It owns the domain and the persistent state: the Library, Playback, and settings. It knows nothing about Tauri. See [ADR 0001](./docs/adr/0001-rust-owns-domain-and-persistent-state.md).

Communication: one path for requests, four for pushes.

- **Renderer → Backend (1 path):** a command. The Renderer calls a Host command through the `NativeClients` that `TauriNative` builds, and the Host calls the Backend. The answer is the command's return value. State answers are `Versioned`.
- **Backend → Renderer (4 paths):**
  1. **State:** a topic's whole value with its revision, on the `connect` channel.
  2. **Occurrence:** a fact with its value, never merged, on the `connect` channel.
  3. **Position:** the playing position, on the `connect` channel.
  4. **Measurement:** meter frames, in binary, on a channel for each subscription.

The Renderer updates its caches and views from these.

## Code map

| Directory                | What it holds                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/routes`             | SvelteKit routes and the app frame.                                                                            |
| `src/lib/native`         | The only adapter to Tauri, with the generated bindings.                                                        |
| `src/lib/playback`       | Renderer side of Playback and the Queue.                                                                       |
| `src/lib/library`        | Renderer side of the Library.                                                                                  |
| `src/lib/lyrics`         | Renderer side of lyrics.                                                                                       |
| `src/lib/meters`         | Renderer side of the Spectrum and the Level meter.                                                             |
| `src/lib/settings`       | Renderer side of settings.                                                                                     |
| `src/lib/shell`          | The Renderer shell: app state that spans Renderer domains.                                                     |
| `src/lib/components`     | Product-specific compositions of Renderer domains, such as the Dock and Now Playing.                           |
| `src/lib/ui`             | Shared controls, with the shadcn-svelte primitives.                                                            |
| `src/lib/utils`          | Small helpers with no domain knowledge.                                                                        |
| `backend/src/app`        | The composition root. It joins the services and holds the cross-domain use cases.                              |
| `backend/src/audio`      | Playback, the Output stream, the Waveform, the Spectrum, and the Level meter.                                  |
| `backend/src/library`    | The Library: its database, the Scan, and artwork.                                                              |
| `backend/src/lyrics`     | Lyrics parsing and service.                                                                                    |
| `backend/src/media`      | Reading tags, embedded lyrics, and file checks.                                                                |
| `backend/src`            | Also holds the small modules that serve many domains (settings, messages, errors, threads, ids). |
| `src-tauri/src/commands` | Host commands, grouped by domain.                                                                              |
| `src-tauri/src`          | Also holds command registration, message delivery, and the artwork protocol.                                   |
| `tests`                  | Renderer E2E tests (Playwright, with a scripted native API).                                                   |
| `tests-app`              | App E2E tests (WebdriverIO, on the real app).                                                                  |

## Invariants

- The IPC contract is defined once, in the Backend. The Renderer's bindings are generated from it. Nobody edits them by hand.
- A Host command that blocks does not run on the main thread.
- Backend services know nothing about the Host or each other. They report through a message sink, and what each message carries is in [ADR 0008](./docs/adr/0008-backend-state-occurrences-and-measurements.md).
- The Host reaches the Backend only through `BackendApp` and its public modules.
- Settings are read and written through the IPC of the area that owns them. Appearance is read from `connect` and written with `updateAppearance`; playback preferences are read and written through the playback commands.
- A state is its whole value with a revision. The Renderer keeps a value only if its revision is newer than the one it holds, whether it came on the channel or as a command answer.
- An occurrence is a fact. It builds no state in the Renderer.
- The Renderer subscribes, then fetches: `connect` registers the channel and returns the current values.
- Every state that the Library stores is a closed set of values. The code and the database enforce the same set.
- One place decides how the Library files a track (its Album Artist and album). Reads use the stored result.
- An Album is identified by its `AlbumId`; no query, command, or route identifies one by its title, Album Artist, or folder. A URL carries IDs, never a name or a folder.
- A value goes in page state only if it cannot be in the URL, Back must undo it, and it belongs to the app frame. A modal that Back closes uses shallow routing, which SvelteKit describes.
- One place builds the path of a track's file, and it keeps the path inside its Library folder.
- The Backend never returns display strings. An unnamed album or artist is empty, and the Renderer labels it.
- Renderer dependencies flow one way: routes, then components, then the Renderer shell, then the Renderer domains, then the shared layers (ui, utils, native). A Renderer domain does not import another Renderer domain.
- Only the native adapter imports Tauri packages.
- Shared controls give defaults only. Styling that belongs to one Renderer domain stays in that domain.
