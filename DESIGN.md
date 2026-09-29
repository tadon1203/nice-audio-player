# DESIGN.md

## Overview

A working desktop music-library tool, not a streaming storefront. Dark, precise, and technical. **The record's artwork is the app's only light source**: it colors the playback surface and the headers of the things it belongs to, and nothing else. Everything else communicates through alignment, typography, state clarity, and stable geometry rather than effects.

Now Playing is not a page. It is the playback dock extended upward: one surface, lit by the current artwork.

A screen should answer without explanation: what matters now, what belongs together, what state the system is in, and where an action takes effect. Density follows the task: artwork browsing can breathe; tables, metadata, settings, and playback status are compact and technical.

The full rationale and rollout order live in [docs/redesign-plan.md](./docs/redesign-plan.md). This file holds the rules.

## Tokens and styling

`src/app/renderer/styles.css` owns the dark-only shadcn semantic variables, `@theme inline` adapters, font, and global base styles. Product code uses semantic utilities (`bg-background`, `text-foreground`, `bg-muted`, `border-border`, `ring-ring`), never raw palette values.

Adding a value, in order: existing shadcn token → Tailwind built-in or structural arbitrary value → smallest `@theme` addition if it recurs → keep local to the component.

| Token                | Use                                               |
| -------------------- | ------------------------------------------------- |
| `--background`       | workspace canvas                                  |
| `--sidebar`          | sidebar and dock                                  |
| `--popover`          | input, select, button, menu, acrylic base         |
| `--accent`           | hover                                             |
| `--muted`            | selection                                         |
| `--foreground`       | Ink-1: primary text/icon, the present             |
| `--muted-foreground` | Ink-2: metadata, supporting text, the future      |
| `--faint-foreground` | Ink-3: the past (sung lyric lines, queue history) |
| `--border`           | dividers, structural rules                        |
| `--input`            | control boundary                                  |
| `--ring`             | keyboard focus only                               |
| `--destructive`      | errors and destructive actions only               |

Controls are grayscale and never take artwork color. Chromatic color is reserved for semantic info such as errors, and color is never the only state indicator. Playback state uses glyphs, not a dedicated color. The artwork's representative color (from `getArtworkAccent`) tints backgrounds, and is drawn as ink in only a few places, all of them time: the played part of the Now Playing waveform, the lit part of the current lyric line, the played groove of the record disc, and the progress ring around the dock's play button, through `--artwork-accent` (set by `ArtworkAccent`, lightened to stay AA over the brightest Light; plain foreground without artwork or with the backdrop off). Never a control's own state (the ring is a Strip wrapped round a control, not its color), other text, or focus.

- **Type**: Satoshi (Latin), Noto Sans JP (Japanese), fallback `Segoe UI, system-ui, sans-serif` via `font-sans`. Use `text-sm/base/lg/2xl`; never below 14px. Regular weight; hierarchy comes from size, luminance, and spacing. `tabular-nums` for technical values. Uppercase only for short technical labels and table headings. No monospace for style.
- **Shape**: Tailwind spacing/radius/sizing first. Icons `size-4/5/6`. 1px `--border`/`--input` borders only where they mark real structure. Corner radius says how artwork is placed (see Sleeve).
- **Depth**: only `shadow-none` and `shadow-floating`; persistent UI has no shadow. Layers are listed under Spatial layers.
- **Blur**: allowed only as Light and Acrylic (below). Never in the workspace or sidebar, never animated.
- **Components**: shadcn primitives live in `src/renderer/shared/ui/shadcn`; product UI stays outside. Use them instead of restyling focus, disabled, and keyboard states in page CSS.
- **No hardware cosplay**: no fake knobs, screws, LEDs, or decorative meters. The waveform is data, not decoration. Mechanical motion is allowed only when it draws real data changing: rolling digits, and signal-path steps that flip when (and only when) their value changes.

## Vocabulary

Every screen is built from five elements instead of new looks.

| Element    | Meaning                                         | Origin                |
| ---------- | ----------------------------------------------- | --------------------- |
| **Sleeve** | The music itself; an object that moves          | Left edge of the dock |
| **Light**  | What the user is focused on right now           | Dock background       |
| **Strip**  | Time shown horizontally                         | Waveform seek bar     |
| **Gutter** | Position and order, `tabular-nums`, on the left | Lyrics timestamps     |
| **Path**   | Notation for technical information              | Dock signal path      |

### Sleeve

- The same artwork never appears in two places at once. The current track is not repeated in the sidebar or title bar.
- Radius shows placement: attached to an edge (Now Playing, full height) is square; placed in the workspace (tiles, headers, the dock) is `rounded-lg`; a thumbnail inside a row (Queue) is `rounded-sm`. The radius is interpolated while moving.
- There is exactly one play affordance: the dock's white round play button, reused on tile hover, detail headers, and Queue. Tile hover shows it at the bottom right of the artwork instead of dimming. Its glyph is one shared `PlayPauseIcon` that morphs between play and pause; the dock's play button alone springs on press (`press`).

### Light

| Place             | Light source                                                                             | Strength |
| ----------------- | ---------------------------------------------------------------------------------------- | -------- |
| Now Playing       | Current track's artwork                                                                  | max      |
| Playback dock     | Current track's artwork, brightest at the left, fading right                             | strong   |
| Album details     | That album's artwork (header band only)                                                  | medium   |
| Artist details    | A representative album's artwork (header band only)                                      | medium   |
| Library           | The hovered or focused tile's artwork, behind the grid (one light, moving between tiles) | faint    |
| Sidebar, Settings | none                                                                                     | none     |

- Draw Light as a static blurred `<img>` under a veil: `ArtworkLight` in `shared/ui/artwork-light`. The caps in `light-model.ts` (blur, brightness, veil, strength) keep Ink-1 and Ink-2 at AA and Ink-3 at 3:1 (large text) over even pure white artwork; `light-model.test.ts` enforces it. Change them only with the test.
- Now Playing's Light breathes: its opacity dims by up to 15% and its scale swells 3% with the playing position's loudness (read from the waveform peaks, smoothed 80ms up / 400ms down; fixed at a middle level while paused; off under reduced motion). It never gets brighter than its strength, so the caps below hold. The library's faint Light is one image that springs between tiles (`mediumMove`) and fades 400ms after the pointer leaves the grid.
- Animate only `transform`, `opacity`, and `clip-path`. Never animate the blur radius. Changing artwork crossfades over the `light` token (illumination is not an object). The two exceptions are the dock and Now Playing, where the new image is wiped in over the old one from the side the track came from (`mediumMove`), so the light travels with the Sleeve.
- Light can be turned off with the `Artwork backdrop` preference and is hidden under `forced-colors`.
- Floating UI (menus, Select, Dialog, Sheet, sticky headers) uses **Acrylic** (`acrylic` utility, `Acrylic` component), not Light. It is solid `Canvas` under `forced-colors`.
- The title bar's left 16rem is `bg-sidebar` so the sidebar reads as one column to the top of the window. While Now Playing is open the title bar is transparent and the Light reaches the top.

### Strip

Time is drawn horizontally (the dock's play button wears a thin ring in the artwork color that fills clockwise as the track plays, the same Strip bent into a circle): a plain progress line across the top of the dock, the full waveform in Now Playing, a 1px progress line along the bottom of the playing track row, and segments proportional to track length along the bottom of an album header band (they grow in left to right; for the playing album, past tracks are brighter and the playing segment fills as it plays; hover names the track; click plays it).

### Gutter

Track number and play slot, lyric timestamps, Queue number and time, and the Settings label column share one width (about 4rem) and one left edge. Content is `tabular-nums` in Ink-2 and becomes Ink-1 on hover. A Gutter is also the button for its row: play for a track, seek for a lyric. The track-table play slot is the reference.

### Path

`FLAC 24/96` is codec, bit depth, kHz. Lossy formats show bitrate: `AAC 256k`. Used by the dock signal path (`source › processing › output`; with no resampling it is just `FLAC 24/96 › Speakers`, so its length says whether playback is bit-perfect), the track table format column, album fact lines (`Mixed` when they differ), and Settings.

## Time state and luminance

Luminance is fixed to past, present, and future.

| State   | Ink   | Used in                                     |
| ------- | ----- | ------------------------------------------- |
| Past    | Ink-3 | lyric lines already sung, queue history     |
| Present | Ink-1 | current lyric line, the playing track       |
| Future  | Ink-2 | upcoming lyric lines, upcoming queue tracks |

The waveform is the exception: played is Ink-1, unplayed is Ink-2. State changes never change size or weight, so nothing shifts. Transforms that do not move layout are fine: lyric lines shrink by up to 4% with their distance from the current line, and the lyrics list fades at its top and bottom edges.

## Spatial layers and motion

**One object exists in one place only**: anything that crosses screens moves as a shared element and is never crossfaded as two copies (Light is the one exception). **The deeper the hierarchy, the higher the layer.**

```
30  Dialog (acrylic, 0.98 → 1 from center)
20  Menus / Select / tooltips (open from the triggering button)
15  Queue panel (from the right) / mobile navigation (from the left)
10  Now Playing (extends upward from the dock)
 0  Library ⇄ details (same surface; the Sleeve moves as a shared element)
```

Motion tokens live in `shared/ui/motion`. Springs are fully damped (`bounce: 0`): no bounce, no overshoot. The one exception is `press`, the play button's press.

| Token        | Setting                       | Used for                                         |
| ------------ | ----------------------------- | ------------------------------------------------ |
| `feedback`   | 100ms, ease                   | hover, press, color                              |
| `smallMove`  | spring, 0.2s                  | tabs, Select, tooltips, lyric line luminance     |
| `mediumMove` | spring, 0.3s                  | Queue panel, Sheet, lyrics scroll, track changes |
| `largeMove`  | spring, 0.42s                 | dock ⇄ Now Playing, tile ⇄ details               |
| `roll`       | spring, 0.35s                 | rolling digits (`RollingNumber`)                 |
| `spin`       | spring, 0.6s                  | digits or a disc turning several times (a seek)  |
| `press`      | spring, 0.15s, `bounce: 0.25` | the play button's press (the only overshoot)     |
| `light`      | 400ms, ease                   | crossfading Light                                |

1. Direction encodes hierarchy: deeper moves up, back moves down. Next track exits left, previous exits right. Sibling views only crossfade (100ms). Filtering does not animate; the library count rolls as it changes, and a sort slides the tiles in view to their new places (`mediumMove`, no stagger; a filter change never does).
2. Things appear from where they were summoned.
3. Direct manipulation (seek, volume, manual scroll, header shrink) tracks input 1:1.
4. Only these move on their own: track changes, lyrics follow and fill, the playhead, Light crossfades, the record disc's turning, and numbers that tick (rolling digits; dragging a control shows them 1:1 instead).
5. Reduced motion turns every movement into a 100ms crossfade. Hierarchy and state stay intact.

Shared elements use `motion` (`layoutId`), which interrupts and reverses cleanly. Small feedback stays on CSS transitions. The View Transitions API is snapshot-based and not used for main transitions.

## Layout

- One continuous spatial system: persistent navigation, library/detail workspace, and one 104px playback dock. Now Playing covers the workspace and sidebar, from below the title bar to the top of the dock.
- Workspace views share the same horizontal inset and left edge. Grids fill left to right and may leave space on the right; no per-view centering.
- Tables, artwork, panes, and readouts share alignment lines.
- Prefer intrinsic layout (flex wrap, content sizing) before breakpoints; use container queries for width-dependent components. Shell breakpoint is `md` (768px).
- Responsive layouts rearrange rather than scale. Secondary metadata yields first. Content stays inside its owning region and never displaces shell controls.
- Use the structure that fits the content (grid, list, table, ledger); don't turn everything into cards. Don't use big padding as a substitute for hierarchy.

## Application chrome

- Frameless window with a 40px app-owned title surface: text `Nice Audio Player`, minimize/maximize/close controls, and below 768px the mobile navigation trigger. No app icon. Empty space is draggable; controls are not. Standard Windows resize borders and Snap Layout work.
- No `File / Edit / View / Window` menu bar. Commands live in their workspace or Settings.
- At 768px and above the sidebar is persistent and not collapsible; below it, navigation is a sheet with an explicit close control.

## WorkspaceHeader

Library, detail, and Settings screens share one header pattern:

```
[ ← Parent name ]                     (detail screens only)
Title                                 [ Actions ]
Fact line (tabular-nums, Ink-2)       [ Sort, etc. ]
```

- Fact line: library `1,284 albums`; album year, track count, total time, format (on first showing, the track count and time count up from zero once the artwork has landed); Settings the number of folders. Separate items with 1em of space, not middle dots.
- No uppercase kind labels such as `ALBUM`.
- Scrolling shrinks the large title into a 40px Acrylic sticky band, tracking the scroll 1:1 (CSS scroll-driven animation).

## Views

- **Library**: Albums (artwork-led), Album Artists (textual), Tracks (tabular). While the album or artist grid scrolls (and 800ms after), its sort key (a letter, or a year that rolls) shows huge and barely visible in the empty space to its right, when the view is 40rem or wider. Each keeps its own filter, sort, and scroll. The filter sits in a stable spot per view and keeps its query when switching views. The track table's sticky header is Acrylic. The playing album or row shows a static playback glyph, never an animated equalizer.
- **Details**: album and artist views establish identity before related content, with a medium-Light header band (album: with the track Strip along its bottom edge, and `Play` / `Shuffle`). Back returns to the semantic parent and restores context. The same object stays visually traceable across transitions.
- **Queue**: a 320px Acrylic panel entering from the right, so it can stay open while browsing. Drag to reorder (the dragged row lifts with a small tilt and shadow, and rows below the drop line make room). Switching shuffle on with the panel open makes the rows settle top to bottom (15ms apart, the first 12), `Remove`, `Clear upcoming`.
- **Settings**: a technical ledger, not cards. Labels, values, controls, paths, and errors align on the Gutter. Read-only info doesn't look like a disabled input. Changes apply immediately where safe. The Playback section shows the signal path stage by stage with each stage's setting, and the `Artwork backdrop` toggle.
- **States**: empty, loading, error, and content states have clear ownership. Errors appear near the affected object with a recovery action. Prefer Undo over confirmation dialogs; confirm only for meaningful irreversible actions.
- **Temporary UI** (menus, popovers) is attached to its trigger, compact, minimally rounded, and uses standard keyboard/focus/dismissal patterns. Icons only where they aid recognition.

## Playback

### Dock

One 104px band with stable geometry. Primary transport stays centered and nothing shifts it.

- **Two full-width rows.** A plain progress line runs edge to edge across the top — position only, no waveform data; the waveform itself is drawn only in Now Playing. Below it, the transport grid's two side columns are equal width, so transport sits on the dock's true horizontal center regardless of what the identity block or volume controls weigh on each side.
- **Sleeve is inset, not edge-filling.** A small `rounded-lg` tile sits at the start of the identity block, beside the title/artist — placed like any other artwork in the workspace, not attached to the dock's edge. Clicking it opens Now Playing; its context menu offers `Go to album` and `Go to artist`. The whole identity block, the transport, and the volume group share one vertical center.
- **Progress line**: a slim fixed-height track, filled Ink-1 up to the current position over an Ink-2 unplayed remainder. Hover shows a line and a time tooltip; dragging tracks the pointer 1:1. Elapsed and remaining time sit at its ends; clicking toggles remaining time.
- **Transport**: ⤮ ⏮ ▶ ⏭ ↻, symmetric, centered on the dock. On/off is shown by icon shape and a dot, not color. Repeat-one is `↻¹` (the icon turns once per mode change and the `¹` drops in).
- **Next track**: in the last 3 seconds, the next track's artwork (24px, `rounded-sm`) slides in beside the right-hand group and goes when the track changes; not for repeat-one, at the end of the queue, or when it is the artwork already on the Sleeve.
- **Right side**: lyrics, queue, volume with a dB readout (wheel adjusts ±1 dB; the readout nudges when the wheel pushes past 0 dB or silence).
- **Signal path**: right-aligned under the volume row, holding the output-device menu. It hangs out of flow, so the row stays on the transport's centre line.
- **Narrow (<768px)**: only ⏮ ▶ ⏭. Shuffle, repeat, and the signal path are hidden.
- Volume is icon, level, and numeric readout on one axis.

### Now Playing

A layer over the current location, not a route: the library stays mounted underneath (scroll position included), and Back closes it. The dock's own surface lifts first (its waveform slot closes, so its top edge rises 16px), then the Now Playing surface lifts and fades in over it, the Sleeve lands from the dock unclipped, and the text and waveform follow. Closing plays the same motion in about 70% of the time. Nothing on the layer clips its children (only the Light clips itself), and the title is faded in rather than shared, since stretching type between sizes distorts it. On a track change (not on first open) the title's characters slide in from the track's direction. Entry: the dock Sleeve or title, the lyrics button, `Ctrl+L`. The `⌄` close button sits where the Sleeve was, and the Sleeve returns there on close. Beneath it, the underlying shell is `inert`.

- **Waveform seek bar**: the only place the waveform is drawn. Bars grow upward from a baseline; played Ink-1, unplayed Ink-2, a 1px playhead. Hover shows a line and a time tooltip; dragging tracks the pointer 1:1 and magnifies the bars within 48px of the pointer (up to 2.2 times wider) for fine seeking. Its size never changes. Before data exists it is a 2px baseline line, and the bars grow out of that same line from left to right when the data arrives. The dock's progress line is a separate, simpler bar. Played and unplayed differ clearly (unplayed is about 35% ink), and the fill and playhead advance every frame from the last reported position; only a seek or track change springs. Elapsed and remaining time sit at its ends; clicking toggles remaining time.
- **Lyrics** (local LRC only): left-aligned with a timestamp Gutter; the Gutter is the seek button, the text is selectable. The current line starts unlit (Ink-2) and is filled left to right in the artwork color as it is sung, over the time it takes to read it (capped, so a long instrumental gap does not crawl); size and weight never change. The fill goes one character at a time, so a wrapped line lights its upper row before its lower one; each character lifts 2px as it lights and settles back (skipped under reduced motion and on lines over 100 characters). Without lyrics, the Sleeve and info are centered and large. About `text-2xl`, ≤ ~32 characters per line. Plain lyrics have no Gutter, no auto-scroll, and an `Unsynced` label. Position arrives every 250ms, so time is interpolated from the last anchor. Follow mode keeps the current line about a third from the top; wheel, touch, scrollbar, and navigation keys switch to free mode with a `Jump to current line` button, and follow resumes after ~4s idle away from the lyrics, on the button, on track change, or on Gutter seek. The current line gets `aria-current`; there is no per-line `aria-live`.
- **Record disc** (`md` and up; hidden under `forced-colors`): once the Sleeve has landed, a flat, front-on disc rolls out from behind it (45% of its width with lyrics, 50% without; the Sleeve is 18rem with lyrics, and the disc rolls as far as it slides). It is the track's waveform as a map, not a picture of a record: no gloss, reflection, shadow, thickness, or tonearm, and no label artwork. The groove is a 30-turn spiral from the outer edge (track start) inwards, drawn once on a canvas; its width follows the peak, and quiet stretches leave a dark ring, so the shape of the song shows. The disc turns with the playback position (never at a constant speed), so the groove under the fixed needle at 3 o'clock is what is sounding; a seek spins it one turn plus the remainder (`spin`). Unplayed groove is 22% ink, played groove is `--artwork-accent` (the third place artwork color is drawn as ink), and the current lyric line's groove is brighter. The label is a flat circle in the artwork's color with the track's facts round its edge and the track number in the middle. A waveform arriving carves the groove from the outside in over 320ms; a track change keeps the disc, re-colors the label, and carves again. Closing rolls it back in about 70% of the time. Under reduced motion it neither rolls nor turns and only fades; the played fill and needle dot still follow the position. It is decorative and `aria-hidden`; seeking stays with the waveform.
- The current lyric line's span is lit on the waveform; hovering a line highlights its span there, and hovering the waveform faintly marks its line.
- **Lyrics states**: no lyrics → `No lyrics for this track` with `Add a .lrc file with the same name next to the audio file.`; unreadable → `Couldn't read the lyrics file` with the path; sidecar failed → `The .lrc file couldn't be read. Showing embedded lyrics.`

## Track activation

- A track row is one playback object. Pointer activation uses the whole row except nested controls. Keyboard and assistive tech use a real button in a fixed action/state slot (the Gutter).
- The slot is always reserved: before the title in the Library table, in the track-number column in Album tables. Inactive tracks show Play on hover/focus; the active playing track shows Pause; the active paused track shows Resume.
- Row activation of the active playing track is inert, so a broad hit area can't accidentally pause.
- Hover, playback state, selection, and keyboard focus are separate visual states and may coexist. Changing playback state must not move the title baseline or columns.

## Keyboard

| Key                 | Action                |
| ------------------- | --------------------- |
| Space               | Play / pause          |
| `←` / `→`           | Seek                  |
| `Ctrl+←` / `Ctrl+→` | Previous / next track |
| `Ctrl+L`            | Lyrics (Now Playing)  |
| `Ctrl+Q`            | Queue                 |

## Accessibility

- Sufficient contrast (WCAG AA), visible keyboard focus, logical focus order, keyboard support everywhere. Text over Light meets AA (Ink-3 lyrics: 3:1 as large text).
- Usable with reduced motion, forced colors (Light off, Acrylic solid), text enlargement, and Windows scaling at 100/125/150/200%.
- When space runs out, rearrange or drop secondary info before shrinking text.

## Don'ts

- Don't build a dashboard of interchangeable cards.
- Don't hide useful playback/file info just to look minimal.
- Don't use oversized headings or hero space to manufacture importance.
- Don't let secondary info disturb the center of primary controls.
- Don't blur outside Light and Acrylic, and never animate a blur.
- Don't show the same artwork in two places at once.
