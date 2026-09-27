# Redesign plan: Now Playing, lyrics, dock, and a shared visual language

Status: in progress (Steps A, B, C done, D in progress; see section 9). [DESIGN.md](../DESIGN.md) already reflects this plan.

## 1. Direction

- **The record's artwork is the app's only light source.** Blur is used as that light, and only where it carries meaning.
- **Now Playing is not a separate page. It is the dock extended upward.** The dock and Now Playing are one surface.
- Motion follows the physical continuity and spatial consistency of Apple HIG. Two rules:
  1. **One object exists in one place only.** Anything that crosses screens moves as a shared element; it is never crossfaded as two copies.
  2. **The deeper the hierarchy, the higher the layer.** Library is the floor, Now Playing sits above it, and floating UI sits above that.
- Changes to the current DESIGN.md do not need to be conservative, but these stay: the precise, technical character, a grayscale control system, and stable geometry.

## 2. Shared vocabulary (five elements)

Instead of adding new looks, every screen is rebuilt from these five elements.

| Element    | Meaning                                          | Origin                |
| ---------- | ------------------------------------------------ | --------------------- |
| **Sleeve** | The music itself. An object that moves           | Left edge of the dock |
| **Light**  | What the user is focused on right now            | Dock background       |
| **Strip**  | Time shown horizontally                          | Waveform seek bar     |
| **Gutter** | Position and order in `tabular-nums` on the left | Lyrics timestamps     |
| **Path**   | Notation for technical information               | Dock signal path      |

### 2.1 Sleeve

- The same artwork never appears in two places at once. Showing the current track in the sidebar or title bar is ruled out for this reason.
- Corner radius shows how the artwork is placed:
  - Attached to an edge (the dock): square.
  - Placed in the workspace (tiles, headers): `rounded-lg`.
  - Thumbnails inside rows (Queue): `rounded-sm`.
  - The radius is also interpolated while moving.
- There is exactly one "play" affordance. The dock's white round play button is reused as-is on tile hover, detail headers, and Queue.
- Tile hover: replace the current `opacity-80` dimming with a play button in the bottom-right of the artwork.

### 2.2 Light

| Place                            | Light source                                                                           | Strength |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Now Playing                      | Current track's artwork                                                                | Maximum  |
| Playback dock                    | Current track's artwork (brightest on the left, fading into the veil toward the right) | Strong   |
| Album details                    | That album's artwork (header band only)                                                | Medium   |
| Artist details                   | A representative album's artwork (header band only)                                    | Medium   |
| Library lists, sidebar, Settings | None                                                                                   | —        |

- Floating UI (menus, Select, Dialog, Sheet, sticky headers) uses **acrylic** instead of Light.
- Title bar: make the left 16rem `bg-sidebar` so the sidebar runs as one column up to the top of the window. While Now Playing is open the title bar turns transparent and the light reaches the top of the window.
- Implementation:
  - Draw the light as a static `<img>` layer with `filter: blur()` plus a veil on top. Cap the veil's opacity so text contrast never drops below AA.
  - Use `backdrop-filter` only for floating UI and sticky headers.
  - Never animate the blur radius. Animate only `transform`, `opacity`, and `clip-path`.
  - Put an `Artwork backdrop` on/off toggle in Settings. Turn it off automatically under `forced-colors`.
  - Extract the representative color (Ambient) in Rust when artwork is cached and store it in the DB. Use it for backgrounds only; never on controls or focus.

### 2.3 Strip, and luminance for time state

Luminance is fixed to past, present, and future.

| State   | Luminance                | Used in                                     |
| ------- | ------------------------ | ------------------------------------------- |
| Past    | Ink-3 (tuned to meet AA) | Lyric lines already sung, Queue history     |
| Present | Ink-1                    | Current lyric line, the playing track       |
| Future  | Ink-2                    | Upcoming lyric lines, upcoming Queue tracks |

The waveform is the exception: played is Ink-1 and unplayed is Ink-2, which reads better for a seek bar.

Where Strips appear:

- The dock's waveform (see below).
- The playing row in the track table: a 1px progress line along the bottom of the row.
- The bottom edge of the album details header band: segments proportional to each track's length. The playing track's segment is brighter. Hover shows the title; click plays that track.

### 2.4 Gutter

- Track table number and play slot, lyrics timestamps, Queue number and time, and Settings label column all share the same width (about 4rem) and the same left edge.
- Content is `tabular-nums` in Ink-2 and becomes Ink-1 on hover. It also acts as a button: seek for lyrics, play for the track table.
- The existing track table play slot is the reference; everything else is aligned to it.

### 2.5 Path

- Notation: `FLAC 24/96` (codec bit-depth/kHz). Lossy formats use bitrate, e.g. `AAC 256k`.
- Used in: dock signal path, track table Format column, album fact line (`Mixed` when formats differ), Settings.

## 3. Playback dock

Merge the separate 24px status bar into the dock. Height goes from 88px + 24px to one 104px band.

```
┌──────────┬▁▂▃▅▆▇▆▅▃▂▁▂▅▇█▇▆▅│▃▂▂▃▅▆▇▇▆▅▄▃▂▁▁▂▃▅▆▇█▇▅▃▂▁▁▂▃▅▆▇▆▅▃▂▁  ← waveform 24px
│          │ 1:24                                                          −2:38 │
│  sleeve  │ Night Flight          ⤮   ⏮   ( ▶ )   ⏭   ↻          ♪  ≡  ◁)━━━○──  −6.0 dB
│  104px   │ Artist Name                                    FLAC 24/96 › 48 kHz › Speakers ▾
└──────────┴──────────────────────────────────────────────────────────────────────
 Background: blurred artwork. Brightest behind the sleeve, fading into the veil toward the right.
```

- **Sleeve and waveform form an L.**
  - The sleeve fills the dock height and is attached to the left edge, square.
  - The waveform starts at the sleeve's right edge and runs across the top of the dock.
  - Clicking the sleeve opens Now Playing. Right-click offers `Go to album` and `Go to artist`.
- **Waveform seek bar**
  - Bars grow upward from a bottom baseline.
  - Played is Ink-1, unplayed is Ink-2, with a 1px vertical line at the playhead.
  - Hover shows a vertical line and a time tooltip at the cursor. Dragging tracks the pointer 1:1.
  - Size never changes for a given surface, so dock geometry stays stable while it loads.
  - Elapsed and remaining time sit at the left and right ends just below the waveform. Clicking toggles remaining-time display.
  - Before waveform data exists: a 2px line on the baseline. When analysis finishes, bars grow out of the same line (treated as the same object).
  - **It is one object, not two.** The dock's waveform is `layoutId`-shared with Now Playing's (§4): small (24px) here, it grows into a hero band there instead of a second instance existing at the same time. The dock hides its own copy while Now Playing is open, the same way the Sleeve does.
- **Transport**
  - ⤮ ⏮ ▶ ⏭ ↻, symmetric so the center never shifts.
  - On/off is shown by the icon's shape and a dot underneath, not by color. Repeat-one is `↻¹`.
- **Right side**
  - Lyrics (♪), Queue (≡), volume slider, dB readout.
  - Scrolling the wheel over the volume slider adjusts by ±1 dB.
  - Signal path: `source › processing › output`. When there is no resampling it reads just `FLAC 24/96 › Speakers`, so its length shows whether playback is bit-perfect. Switch the output device from the trailing `▾`.
- **Narrow screens (<768px)**
  - Sleeve at 64px, only ⏮ ▶ ⏭.
  - Shuffle, repeat, and signal path move to Now Playing.
- **Layout: two shared rows, not independently-centered columns.** Below the waveform, the
  title/transport/lyrics-queue-volume line and the artist/—/signal-path line are each one CSS
  grid row shared across all three columns, so everything on a row sits on the exact same
  baseline. A column with nothing for the second row (the transport buttons) just leaves it
  empty — it does not get re-centered against a taller neighbor, which is what let the signal
  path's line pull the icon row off the transport buttons' baseline in an earlier pass.

### Waveform data (Rust)

- On first playback, decode the whole file in the background and compute peak and RMS values for about 1000 buckets.
- Cache by content hash under app data and notify the frontend with a `waveformReady` event.
- Run on a low-priority thread, separate from the playback thread. This can later move to precomputation during scans.

## 4. Now Playing

```
┌──────────────────────── Artwork light (maximum blur) ──────────────────────┐
│   ┌──────────────┐        0:12   First line                                 │
│   │    sleeve    │        0:18   Second line                                │
│   │    22rem     │   ▸    0:24   Current line (Ink-1)                       │
│   │              │        0:31   Next line (Ink-2)                          │
│   └──────────────┘                                                         │
│   Night Flight                                                             │
│   Artist Name                                                              │
│   Album Title                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ▁▂▃▅▆▇▆▅▃▂▁▂▅▇▇▆▇█▇▆▅▇[███████▇▆▅]▃▂▂▃▅▆▇▇▆▅▄▃▂▁▁▂▃▅▆▇█▇▅▃▂▁▁▂▃▅▆▇▆▅▃▂▁    ← 96px hero band
│  1:24                                                              −2:38   │
├──────────┬──────────────────────────────────────────────────────────────────┤
│    ⌄     │                    ⤮  ⏮  ( ▶ )  ⏭  ↻                          │
└──────────┴─────────────────────────────────────────────────────────────────────┘
```

- **Rendering and range**
  - Now Playing is a layer kept in router history state (not a route), so Back closes it.
  - It is drawn as a layer on top of the library, not in place of it. The library stays mounted, so closing reveals it at the same scroll position.
  - It covers the full width, sidebar included, from below the title bar to the top of the dock. The boundary line with the dock disappears and the light reads as continuous.
- **Close button**: where the sleeve used to be, a `⌄` (Close Now Playing) button appears, and the sleeve returns there on close.
- **Entry points**: sleeve or title in the dock, the Lyrics button, `Ctrl+L`.
- **The waveform grows into a hero band.** It is the same object as the dock's slim meter
  (`layoutId`-shared, see §3), not a second waveform: the dock hides its 24px copy while Now
  Playing is open, and this 96px band appears along the bottom edge, above the dock's transport
  row (which stays visible below, per "the dock extended upward"). Reusing the dock's own
  seek/hover/drag logic (`PlaybackWaveformBand`) keeps scrubbing identical in both places.
- **Link between lyrics and waveform**
  - The current line's span is lit on the (now large) waveform.
  - Hovering a lyric line highlights its span on the waveform.
  - Hovering the waveform faintly marks the corresponding lyric line.
- **Narrow screens**: the sleeve shrinks to a 64px horizontal header and gives its height to the lyrics.

## 5. Lyrics (local LRC only)

### Data

- The backend `backend/src/lyrics/` is already implemented (LRC parsing, sidecar preferred with embedded fallback, `NotFound` / `SourceFailed`).
- Add a Tauri command `get_track_lyrics(trackId)` and run `pnpm bindings`.
- Fetch with TanStack Query (`staleTime: Infinity`).

### Display

- Left-aligned. Timestamp Gutter on the left.
- The Gutter timestamps are the seek buttons. Clicking the text does not seek, so text can be selected and misclicks are avoided.
- The current line is shown by luminance only; size and weight never change, so lines don't shift.
- About `text-2xl`, at most about 32 characters per line, line height 1.5 or more.
- Empty lines render as whitespace, with no decorative animation.
- Plain lyrics: no Gutter, static text, no auto-scroll. A small `Unsynced` label in the header.

### Sync

- Position arrives only every 250ms. Use the last received `{positionMs, performance.now()}` as an anchor and interpolate.
- Instead of running rAF continuously, wait with `setTimeout` until the next line's start time.
- Recompute on every snapshot. Freeze while paused; recompute immediately after a seek. Find the current line with a binary search.

### Auto-scroll and detecting user scroll

- Do not use `scroll` events for detection, because programmatic scrolling fires them too.
- Treat `wheel`, `touchstart`, `pointerdown` on the scrollbar, and PageUp/PageDown/arrows/Home/End `keydown` as user intent, and switch from **follow** to **free**.
- In free mode, show a `Jump to current line` button.
- Return to follow when:
  - about 4 seconds have passed since the last interaction **and** the pointer is not over the lyrics, or
  - the button is pressed, the track changes, or the user seeks from the Gutter.
- The follow position is about one third from the top, not the center.
- Scrolling uses `move.medium`. A large seek jumps straight there with a spring instead of scrolling through every line in between.

### Accessibility and states

- No per-line `aria-live`. The current line gets `aria-current`.

| State                        | Display                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `NotFound`                   | `No lyrics for this track` + `Add a .lrc file with the same name next to the audio file.` |
| `SourceFailed`               | `Couldn't read the lyrics file` + file path                                               |
| `SidecarFailedUsingEmbedded` | `The .lrc file couldn't be read. Showing embedded lyrics.`                                |

## 6. Other screens

### Unified WorkspaceHeader

Library, details, and Settings each build their header differently today. Merge them into one pattern.

```
[ ← Parent name ]                                ← detail screens only
Title                                 [ Actions ]
Fact line (tabular-nums, Ink-2)       [ Sort, etc. ]
```

- Fact line:
  - Library: `1,284 albums`.
  - Album: year, track count, total time, format.
  - Settings: number of folders.
- Separate items with 1em of space, not middle dots. `ArtistTile`'s `·` separator follows the same rule.
- Remove uppercase labels such as `ALBUM`.
- Scrolling down shrinks the large title into a 40px acrylic sticky band. Use CSS scroll-driven animation so it tracks scrolling 1:1.

### Album and artist details

- Header band with medium Light, album-structure Strip along its bottom edge, and `Play` / `Shuffle` buttons.

### Library

- The track table's sticky header uses acrylic.
- Show a play button on tile hover so an album can be played without opening its page.
- The playing album or row shows a static playback glyph. No equalizer-style animation.

### Queue

- A 320px acrylic panel that comes in from the right, so it can stay open while browsing the library.
- Drag to reorder, `Remove`, `Clear upcoming`. History is Ink-3, current is Ink-1, upcoming is Ink-2.

### Settings

- Add a Playback section:
  - Show the signal path stage by stage, with each stage's setting next to it (output device, etc.).
  - `Artwork backdrop` toggle.

### Keyboard

| Key                 | Action                |
| ------------------- | --------------------- |
| Space               | Play / pause          |
| `←` / `→`           | Seek                  |
| `Ctrl+←` / `Ctrl+→` | Previous / next track |
| `Ctrl+L`            | Lyrics                |
| `Ctrl+Q`            | Queue                 |

## 7. Motion

### Tokens

Keep "no bounce, no overshoot", and move from fixed-duration animation to fully damped springs (`bounce: 0`).

| Token         | Setting                     | Used for                                                                  |
| ------------- | --------------------------- | ------------------------------------------------------------------------- |
| `feedback`    | 100ms, ease                 | Hover, press, color changes                                               |
| `move.small`  | spring, visualDuration 0.2s | Tabs, Select, tooltips, lyric line luminance                              |
| `move.medium` | spring, 0.3s                | Queue panel, Sheet, lyrics scroll, track changes                          |
| `move.large`  | spring, 0.42s               | Dock ⇄ Now Playing, album tile ⇄ details                                  |
| `light`       | 400ms, ease                 | Crossfading the Light (light is illumination, not an object, so it fades) |

### Principles

1. One object exists in one place only. The only exception is Light.
2. Direction encodes hierarchy and order:
   - Going deeper moves up; going back moves down.
   - Next track exits to the left; previous track exits to the right.
   - Sibling views only crossfade.
3. Things appear from where they were summoned. Menus open from the button; Queue comes in from the right; mobile navigation from the left.
4. Direct manipulation tracks input 1:1 (seek, volume, manual lyrics scroll, header shrinking).
5. Only three things move on their own: track changes, lyrics follow, and Light crossfades.
6. Under reduced motion, every movement becomes a 100ms crossfade. State and hierarchy stay intact.

### Layers

```
  30  Dialog (acrylic, 0.98→1 from center)
  20  Menus / Select / tooltips (open from the triggering button)
  15  Queue panel (from the right) / mobile navigation (from the left)
  10  Now Playing (extends upward from the dock)
   0  Library ⇄ details (moves within the same surface; the sleeve moves as a shared element)
```

### Choreography

| Transition                                 | Motion                                                                                                                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dock → Now Playing                         | The Light's `clip-path` grows upward from the top edge of the dock. The sleeve and title move as shared elements. Lyrics fade in ~180ms later, rising 8px. The reverse replays exactly. Pressing again mid-flight reverses from the current position |
| Track change                               | The dock's title and sleeve slide out sideways. The waveform shrinks to the baseline, then grows again. Light crossfades over 400ms                                                                                                                  |
| Tile → details                             | The sleeve moves as a shared element and the header band's Light spreads out. When the original tile is off-screen, fall back to a crossfade                                                                                                         |
| Albums ⇄ Album Artists ⇄ Tracks / Settings | 100ms crossfade                                                                                                                                                                                                                                      |
| Sort, filter                               | No motion                                                                                                                                                                                                                                            |
| Queue changes                              | Remaining rows close up with a layout animation                                                                                                                                                                                                      |

### Technical choices

- Shared-element motion uses `motion` (`layoutId`), because it is strong at interruption and reversal.
- The View Transitions API is snapshot-based and cannot be interrupted, so it is not used for the main transitions.
- Small feedback stays on CSS transitions.

## 8. What to change in DESIGN.md

Rewrite DESIGN.md with this structure:

1. Overview: the artwork is the only light source
2. Vocabulary: Sleeve / Light / Strip / Gutter / Path
3. Time state and luminance
4. Spatial layers and motion
5. WorkspaceHeader
6. Playback (dock and Now Playing)
7. Views, track activation, accessibility (update the current content)

Main rules that change:

| Area                   | Current                              | New                                                                          |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Blur                   | "No gradients, glass, glow, or blur" | Allowed only in the places listed in 2.2. Not in the workspace or sidebar    |
| Chrome color           | Always grayscale                     | Only the dock carries an artwork-derived background. Controls stay grayscale |
| Playback region height | 88px + 24px                          | One 104px band                                                               |
| Motion                 | 100/160ms fixed durations            | The tokens and principles in 7                                               |

## 9. Implementation order

Four large steps. Progress is tracked in [issue #101](https://github.com/tadon1203/nice-audio-player/issues/101). Working rules: no commit per step (changes stay in the working tree until asked), each step includes its own tests (unit, Playwright, `cargo test`), and each step ends with a short report of what changed and how it was verified.

### A. Foundation (done)

- Rewrote DESIGN.md (section 8 structure).
- `motion` with tokens, `MotionProvider`, `useMotionTransition` in `shared/ui/motion`.
- `ArtworkLight`, `Acrylic`, Ink-3 (`--faint-foreground`), and the `Artwork backdrop` preference store. Light caps are enforced by `light-model.test.ts`.
- Rust: `get_track_lyrics`, and `get_artwork_accent` (representative color computed on first request and cached in `artwork_assets.accent`, instead of at scan time).
- `entities/lyrics` and `useArtworkAccent` queries; native API test mock extended with lyrics and accent.
- Now Playing scaffold: `useNowPlaying` (history state `nowPlaying`, not a `/now-playing` route, because `retainSearchParams(true)` would keep a search param open) and `NowPlayingLayer`. Not yet verified: `layoutId` shared-element motion between the dock Sleeve and the layer; check first in B.

### B. Dock (done)

- Waveform cache is keyed by BLAKE3 of the file bytes (`backend/src/audio/waveform.rs`, `<app data>/waveforms/`), so moving or renaming a file keeps it. Analysis runs on one background thread and is requested lazily by `get_playback_waveform`; `waveformReady` refetches it. It is not yet lowered in OS thread priority.
- Added commands `set_playback_shuffle`, `set_playback_repeat_mode`, `set_audio_output_selection` (a loaded track restarts on the new device at the same position), and `LibraryTrackSummary` now carries `fileFormat`, `bitDepth`, `bitrateKbps` for Path notation.
- Left for later steps: the Queue button (D), Lyrics button only opens Now Playing (C), shuffle/repeat/signal path inside Now Playing on narrow screens (C), and the dock Sleeve `layoutId` shared-element check (C, where the layer has a Sleeve to move to).

Original scope:

- Rebuild the dock as one 104px band (status bar merged; shuffle, repeat, output device, signal path). Sleeve and waveform form an L.
- Rust waveform analysis and cache, `waveformReady` event, waveform growing out of the 2px line, waveform seek.
- Dock tests: fixed height, transport stays centered, narrow layout at 767/768px, seek by click and drag.

### C. Now Playing and lyrics (done)

- `useNowPlaying` gained `toggle()`; the dock Sleeve, title, and Lyrics button all toggle Now Playing instead of only opening it.
- Dock ⇄ Now Playing shared element: the dock Sleeve slot swaps to a `⌄` close button while open (the layer's own standalone chevron is gone), and the artwork/title share `layoutId`s with `NowPlayingContent`'s sleeve/title.
- Lyrics: `use-lyrics-sync` (anchor + `setTimeout`-scheduled binary search, no continuous rAF), `use-lyrics-scroll` (follow/free, `Jump to current line`), all three states, `features/lyrics-waveform-link` linking the current/hovered line to a lit span on the dock waveform.
- Track-change motion (Sleeve and identity block slide by transport direction, default forward) and global keyboard shortcuts (`app/renderer/ui/use-playback-shortcuts.ts`: Space, `←`/`→`, `Ctrl+←`/`Ctrl+→`, `Ctrl+L`; `Ctrl+Q` waits for D's Queue panel).
- Not done: the title bar staying transparent while Now Playing is open (DESIGN.md §Light) — it would need `NowPlayingLayer` to span the title-bar row too and a stacking-order pass for the window controls; left as a known gap.
- Tests: toggle open/close from the Sleeve/title/Lyrics button, scroll position preserved, synced lyrics follow the current line, lyrics states, keyboard shortcuts, reduced motion, forced colors, axe on Now Playing.

### D. Screens (in progress)

- **Dock rework**: an earlier pass made the waveform an absolutely-positioned overlay so it
  could grow to 48px without pushing the transport row down — but overlaying it on top of an
  independently full-height-centered transport row meant the two occupied the same vertical
  space by construction, and at 48px plus its time labels they visibly overlapped the
  title/artist and signal-path text (playwright-verified). Replaced with a genuine vertical
  stack (`playback-dock.tsx`): the waveform band and the transport grid are real, non-overlapping
  flex-col rows, and the waveform went back to 24px in the dock — the 48px size is now Now
  Playing's hero band instead (see below), not something the 104px dock also has to fit. The
  transport grid itself is a 2-row CSS grid shared across all three columns (title/transport/
  icons on row 1, artist/—/signal-path on row 2) instead of three independently-centered
  columns, which is what let the signal path's presence pull the icon row off the transport
  buttons' baseline. The seek bar's played/unplayed boundary now eases with the `smallMove`
  spring (`waveform-seek.tsx`) instead of a bespoke `duration-250 ease-linear` CSS transition,
  consistent everywhere (ticking during playback, not just on manual seek) instead of only
  during playback ticks. Pointer math (`positionOf`, `onPointerMove`) now reads the seek
  element's live `getBoundingClientRect()` instead of the `width` state used for bar
  resampling, which could briefly lag the real box during a shared-element layout animation
  and threw click/hover positions off by that same lag.
- **The waveform is a shared-element object, not a fixed-size widget.** `PlaybackWaveformBand`
  (`widgets/playback-region/playback-waveform-band.tsx`) owns the seek bar, its time labels,
  and the scrub/hover state, parameterized by `height`; both the dock (24px) and Now Playing
  (96px, `NOW_PLAYING_WAVEFORM_HEIGHT`) render it with a shared `now-playing-waveform`
  `layoutId`, and only one of the two is ever mounted at a time (the dock hides its band while
  Now Playing is open — the same pattern as the Sleeve). Now Playing's band sits along the
  bottom edge, above the dock's own transport row, which stays visible below it.
- **Now Playing**: the dock's close affordance moved from the Sleeve slot (now empty, per
  above) into the transport row's identity slot, which is already empty while Now Playing is
  open. Fixed the identity wrapper's `overflow-hidden`, which clipped the `layoutId` title
  mid-flight between the dock and Now Playing. With no lyrics (`notFound`/`sourceFailed`) the
  Sleeve and its column grow (22rem/24rem → 28rem/34rem) instead of leaving the lyrics pane
  mostly empty.
- **Queue**: the backend queue mutations (`remove_queue_item`, `move_queue_item`,
  `clear_queue`) already existed in `backend/src/audio/playback.rs` and were only missing
  their Tauri commands; those are now registered and bound (`pnpm bindings`). `widgets/queue-panel`
  is a 320px Acrylic `Sheet` from the right (dock's Queue button, `Ctrl+Q`) listing the
  current track and upcoming queue, with remove and move-earlier/move-later per row and
  "Clear upcoming". Reordering is one slot at a time rather than free drag — the backend only
  exposes earlier/later moves, which is enough for a personal library's queue.
- **Acrylic floating UI**: `Sheet`, `Select`, and `AlertDialog` content used `bg-popover`
  instead of `acrylic` (DESIGN.md's Light section explicitly lists Sheet as Acrylic); fixed
  in the three shadcn primitives. The track table's sticky header now uses `acrylic` too.
- **Album/artist header band**: `MediaDetailsHeader` now bleeds to the workspace edges and
  carries a medium-strength `ArtworkLight`. Album details gained a bottom-edge Strip
  (`AlbumTrackStrip`): segments proportional to track length, the playing track brighter,
  hover names the track, click plays it.
- **Settings Playback section**: a Gutter-aligned ledger (source, processing, output with its
  device menu) plus the `Artwork backdrop` checkbox, reusing the existing preference store.
- Not done: WorkspaceHeader unification (Library/Settings still build their own headers) and
  its scroll-driven shrink-to-Acrylic band; tile → details shared-element transition; visual
  regression project and axe sweep. These are more structural (a new shared header + a
  scroll-linked animation approach) and were left for a follow-up pass rather than rushed.
- Verified with `pnpm typecheck`, `pnpm vitest run`, `pnpm lint`, `pnpm format:check`,
  `cargo clippy` (both crates), `pnpm bindings:check`, and the full `pnpm exec playwright
test --project=renderer` suite (55 passed). The dock overlap/centering fix and the Now
  Playing hero waveform were also checked visually against the mocked native API in a real
  browser (Playwright, driving `vite` directly) at 640/768/1024/1360px — this repo still has
  no `run` skill for the Tauri shell itself, so a final pass in `pnpm dev` is still worth doing
  by hand for the shared-element waveform growth animation specifically, which the e2e suite
  doesn't assert frame-by-frame.

## 10. Open questions

- Ink-3's exact value: needs a contrast check on the light and the veil.
- Precomputing the waveform during library scans (after the on-demand version works).
- A lyrics offset adjustment UI (LRC `offset` is already handled in the backend).
