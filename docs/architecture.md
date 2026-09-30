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

Renderer code never imports Rust implementation details. Renderer-to-native access is restricted to named Tauri commands, the dialog plugin, window APIs, and events whose name is checked against the generated contract. Rust command handlers call the existing backend services; no N-API addon or parallel domain implementation is used.

## Backend modules

```text
backend/src/
  app/         BackendApp (composition root) and use cases that span domains; app/playback_context.rs
               resolves a PlaybackContext (album, tracks list) into a queue
  audio/       playback service and worker thread, output stream, decoding, waveform analysis
    playback/    queue.rs (pure queue: shuffle, repeat, edits), item.rs (PlaybackItem: what is playing),
                 snapshot.rs (published state), service.rs (handle and commands), worker.rs (event loop),
                 session.rs (loaded track and in-flight operations), preferences.rs
  library/     catalog queries, playback selection (playback.rs), scanner/ (discover, inspect, persist)
  lyrics/, media/   lyrics resolution; file validation, inspection, tags
  settings.rs  persistent settings (settings.json)
  events.rs    BackendEvent and the EventSink services emit to
```

The playback worker owns the queue and the output stream; everything else talks to it through commands and reads published snapshots. A queue item is a `PlaybackItem` carrying the library `track_id`, so nothing looks a playing track up by path. A file-level failure (unreadable, undecodable) skips to the next queue item; an output failure stops playback and keeps the queue.

Services never know about Tauri or each other: they hold a `SharedEventSink` and emit `BackendEvent`s, which carry no state. `src-tauri/src/events.rs` queues them, collapses bursts, reads the current snapshot, and emits `app:event`. Tauri commands that wait on the playback worker are `async` and run on a blocking thread, never on the main thread.

The library scanner works in batches, one transaction per batch: new or changed files are reconciled, inspected on several threads, and written together.

Settings (`settings.json`) hold volume, mute, output device, repeat, shuffle, and the artwork backdrop. Writes are debounced and atomic; the playback worker records its own preferences, and the renderer changes the rest through `update_settings`.

## Renderer state

TanStack Router owns navigation, validated search state, URL history, and scroll restoration. TanStack Query owns native read-model caching and event-driven cache updates. Zustand is restricted to push-driven playback state and mirrors of backend settings, and never duplicates library data or Rust authority. Playback state is read through one hook per rate of change (`usePlaybackItem`, `usePlaybackTransport`, `usePlaybackOutput`, `usePlaybackQueue`, and `usePlaybackPosition`, which changes about four times a second and is for components that print a time), so a component re-renders only for what it shows; global shortcuts read the store when a key is pressed instead of subscribing. Anything that draws the position reads the one playback clock (`playbackClock`, `usePlaybackClock` in `entities/playback`): a motion value advanced by a single animation-frame loop that runs only while some component holds it and a track is playing. The backend says when a seek completed (`ActiveSession.seekRevision`), so the clock announces a jump (`usePlaybackJump`) from a fact, never by guessing from how far the numbers moved. The queue snapshot carries only the current item, the last played items and the first upcoming ones (`upcomingCount` says how many there are); the rest of a long queue is read in windows (`get_playback_queue_window`, `useUpcomingItems`). Now Playing is a layer kept in router history state (`nowPlaying`) over the current location, so the library underneath stays mounted and Back closes it. The dock (`widgets/playback-region`) and Now Playing (`widgets/now-playing`) never import each other: `features/now-playing-transition` owns the open state, the shared `layoutId`, the open/close transitions, and the seek band both use. The seek bar itself (`shared/ui/waveform`) is presentational and draws its fill from the clock's motion value, passed in as a prop. Track energy (how loud a track is over its length, on the waveform bars' dB scale) is computed once per waveform (`trackEnergy`) and read by everything that shows it. `lastNavigation` in the playback store records whether the last item change came from Next or Previous.

`motion` is imported only through `src/renderer/shared/ui/motion` (tokens, `MotionProvider`, `useMotionTransition`) and by widgets that own a transition. Blur appears only in `ArtworkLight` and `Acrylic` (`shared/ui`). Lyrics and artwork accent colors are read through `entities/lyrics` and `entities/library` queries, never by calling commands from UI.

## IPC and distribution

Rust is authoritative for the IPC contract. Tauri commands are registered once in `src-tauri/src/bindings.rs`, and tauri-specta generates `src/shared/ipc/bindings.ts` (commands, DTOs, structured `{ code }` errors, and the `app:event` payload) with `pnpm bindings`; `pnpm bindings:check` fails when it is stale. `src/renderer/shared/lib/native.ts` is the sole frontend adapter: it wraps the generated commands, converts structured errors to `NativeCommandError`, and exposes only the typed application API. Tauri capabilities grant the main window only the native permissions required by the application.

Vite builds the React renderer into `dist`; the Tauri CLI builds and packages the Rust host and Windows NSIS installer. Tauri's `nice-artwork` URI handler (`src-tauri/src/artwork.rs`) serves only canonical content-addressed artwork beneath application data; on Windows the renderer loads it from `http://nice-artwork.localhost`. The Tauri host is split into `commands/` (IPC handlers), `events.rs` (backend event forwarding), `errors.rs` (IPC error mapping), and `artwork.rs`. The frameless Tauri window uses the app-owned 40px title surface and Tauri's explicit drag-region support.
