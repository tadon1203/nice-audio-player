# Architecture

This document is the map of the system. It also lists the rules that keep the system in shape.

## About this document

This document changes rarely. Keep it stable.

- Keep the sections fixed, as in the template below. Do not add, remove, or rename a section. Put new content in one of the existing sections.
- Do not put information here that changes often.
- Do not name a file in the Code map. Name a directory.
- Do not describe an implementation detail. The code and its comments describe it.
- Change this document only when the structure or a rule changes.

The template for this document. Replace each placeholder in `<>`. Keep all other text.

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

The system has three layers. Control moves in one direction. The terms are defined in [CONTEXT.md](./CONTEXT.md).

- **Renderer** (`src`): SvelteKit (Svelte 5, `adapter-static`, SPA), built by Vite. It composes views. It caches native state. It holds no second source of truth.
- **Host** (`src-tauri`): Tauri 2. It runs the Windows WebView. It connects the Backend to the window and to the operating system. It holds no domain rules.
- **Backend** (`backend`): a Rust crate. It owns the domain and the persistent state: the Library, Playback, and settings. It does not know about Tauri.

Communication has two directions. A request gets an answer. The Backend pushes its state.

- **Renderer → Backend:** a command or a query. The Renderer calls a Host command through the area objects in `src/lib/native/commands.ts` (`player`, `library`, `lyrics`, `meter`, `appearance`, `app`). The Host calls the Backend. A command answers only whether the Backend accepted it, or refused it with an Error code. A query answers with data, such as a window of the queue, or with an Error code.
- **Backend → Renderer:** one channel. It sends `BackendMessage` on the `app_connect` channel. The channel carries four kinds of message:
  1. **State:** the whole value of each state. The states are the transport (`player`), the queue (`queue`, with its version), the Library (its availability, its version, its directories, and its scan), the waveform, and the appearance. The owner of a state sends it when the state changes. The Library sends the Unavailable state itself when its database did not open. It then runs no worker and answers each command with `LibraryUnavailable`.
  2. **Position:** the playing position. The Backend sends it once a second while a track plays. It also sends it after a seek or a start.
  3. **Backend event:** a fact that happened once, such as a skipped track.
  4. **Measurement:** meter frames, as JSON. They travel on the channel that `meter_start` takes. The Meter measures only while the Player runs.

On connect, the Backend first sends the latest value of each state. So the Renderer has the current state before any change. The Renderer updates its caches and views from these values.

## Code map

| Directory                | What it holds                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes`             | SvelteKit routes and the app frame.                                                                                                                                                                                                                                                                     |
| `src/lib/native`         | The only adapter to Tauri, with the generated bindings.                                                                                                                                                                                                                                                 |
| `src/lib/player`         | Renderer side of Playback and the Queue.                                                                                                                                                                                                                                                                |
| `src/lib/library`        | Renderer side of the Library.                                                                                                                                                                                                                                                                           |
| `src/lib/lyrics`         | Renderer side of lyrics.                                                                                                                                                                                                                                                                                |
| `src/lib/meter`          | Renderer side of the Spectrum and the Level meter.                                                                                                                                                                                                                                                      |
| `src/lib/appearance`     | Renderer side of the appearance settings.                                                                                                                                                                                                                                                               |
| `src/lib/app`            | The Renderer App: app state that spans Renderer domains.                                                                                                                                                                                                                                                |
| `src/lib/components`     | Product-specific compositions of Renderer domains, such as the Dock and Now Playing.                                                                                                                                                                                                                    |
| `src/lib/ui`             | Shared controls, with the shadcn-svelte primitives.                                                                                                                                                                                                                                                     |
| `src/lib/utils`          | Small helpers with no domain knowledge.                                                                                                                                                                                                                                                                 |
| `backend/src/app`        | The composition root. It joins the services and holds the use cases that span domains.                                                                                                                                                                                                                  |
| `backend/src/player`     | Playback. `worker`: the Player's worker thread and the state it publishes. `audio`: the decode, output, pcm, processing and waveform stages. `playback`: the queue, the transport and the volume. `types`: the basic types that `audio` and `playback` share. `meter`: the Meter. `lyrics`: the Lyrics. |
| `backend/src/library`    | The Library: its storage (the database), its read side (lists, track lookups, Playback selections), and its sync side (directories, the Scan, albums, artwork).                                                                                                                                         |
| `backend/src`            | Also holds the small modules that serve many domains (settings, messages, errors, threads, ids).                                                                                                                                                                                                        |
| `src-tauri/src/commands` | Host commands, grouped by domain.                                                                                                                                                                                                                                                                       |
| `src-tauri/src`          | Also holds command registration, message delivery, and the artwork protocol.                                                                                                                                                                                                                            |
| `tests`                  | Renderer E2E tests (Playwright, with a scripted native API).                                                                                                                                                                                                                                            |
| `tests-app`              | App E2E tests (WebdriverIO, on the real app).                                                                                                                                                                                                                                                           |

## Invariants

- The IPC contract is defined once, in the Backend. The generated Renderer bindings come from it. Nobody edits the bindings by hand.
- A Host command that blocks does not run on the main thread.
- A Backend service does not know about the Host. The Player reads tracks from the Library. It writes its preferences to the settings store. Each state value has one owner thread. That thread holds the value and sends the whole value when it changes. A position or a backend event goes the same way, on the same channel.
- A command never answers with Backend state. It answers only with `Ok` or with an Error code. The state that a command causes arrives as a push.
- A command answers at once. It answers `Ok` when the Backend accepted it. It answers with an Error code when the Backend refused it, such as for a bad input.
- A failure after the Backend accepted a command arrives as state. It is not the answer to the command.
- A query answers with its data or with an Error code. It never answers with Backend state.
- The Backend sends no text for the user. The Renderer maps each Error code to text.
- The Host reaches the Backend only through `BackendApp`, the area objects it hands out (`player()`, `library()`, `settings()`, `meter()`, `data_dir()`), and the public modules that name the types it uses. `BackendApp` has no method that only forwards to one area.
- The Renderer reads and writes settings through the IPC of the area that owns them. Appearance is read from `app_connect` and written with `appearanceUpdate`. Player preferences are read and written through the player commands.
- The Backend pushes a state whole. Each push replaces the value that the Renderer holds.
- A backend event is a fact. It does not build state in the Renderer.
- `app_connect` registers the channel. The latest value of each state arrives on it before any change.
- Every state that the Library stores is a closed set of values. The code and the database enforce the same set.
- One place decides how the Library files a track (its Album Artist and album). Reads use the stored result.
- An Album is identified by its `AlbumId`. No query, command, or route identifies an Album by its title, Album Artist, or directory. A URL carries IDs. It never carries a name or a directory.
- A value goes in page state only if it cannot go in the URL, Back must undo it, and it belongs to the app frame. A modal that Back closes uses shallow routing. The SvelteKit documentation describes shallow routing.
- One place builds the path of a track's file. That place keeps the path inside its Library directory.
- The Backend never returns display strings. An unnamed album or artist returns empty. The Renderer adds the label.
- Renderer dependencies flow one way: routes, then components, then the Renderer app, then the Renderer domains, then the shared layers (ui, utils, native). A Renderer domain does not import another Renderer domain.
- Only the native adapter imports Tauri packages.
- Shared controls set defaults only. Styling that belongs to one Renderer domain stays in that domain.
