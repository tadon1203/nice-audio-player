# DESIGN.md

## Overview

A working desktop music-library tool, not a streaming storefront. Dark, mostly monochrome, precise. Artwork provides the color; the interface communicates through alignment, typography, state clarity, and stable geometry rather than effects. Density follows the task: artwork browsing can breathe, tables, metadata, settings, and playback status are compact and technical.

A screen should answer without explanation: what matters now, what belongs together, what state the system is in, and where an action takes effect.

## Tokens and styling

`src/app/renderer/styles.css` owns the dark-only shadcn semantic variables, `@theme inline` adapters, font, and global base styles. Product code uses semantic utilities (`bg-background`, `text-foreground`, `bg-muted`, `border-border`, `ring-ring`), never raw palette values.

Adding a value, in order: existing shadcn token → Tailwind built-in or structural arbitrary value → smallest `@theme` addition if it recurs → keep local to the component.

| Token                | Use                                 |
| -------------------- | ----------------------------------- |
| `--background`       | workspace canvas                    |
| `--sidebar`          | sidebar and playback chrome         |
| `--popover`          | input, select, button, menu         |
| `--accent`           | hover                               |
| `--muted`            | selection                           |
| `--foreground`       | primary text/icon                   |
| `--muted-foreground` | metadata, supporting text           |
| `--border`           | dividers, structural rules          |
| `--input`            | control boundary                    |
| `--ring`             | keyboard focus only                 |
| `--destructive`      | errors and destructive actions only |

Chrome is grayscale and never inherits artwork color. Chromatic color is reserved for semantic info such as errors, and color is never the only state indicator. Playback state uses glyphs, not a dedicated color.

- **Type**: Satoshi (Latin), Noto Sans JP (Japanese), fallback `Segoe UI, system-ui, sans-serif` via `font-sans`. Use `text-sm/base/lg/2xl`; never below 14px. Regular weight; hierarchy comes from size, luminance, and spacing. `tabular-nums` for technical values. Uppercase only for short technical labels and table headings. No monospace for style.
- **Shape**: Tailwind spacing/radius/sizing first. Artwork `rounded-lg`; icons `size-4/5/6`. Edge-attached surfaces are square. 1px `--border`/`--input` borders only where they mark real structure.
- **Depth**: only `shadow-none` and `shadow-floating`; persistent UI has no shadow. Layers: content 0, chrome 10, floating 20, modal 30. No gradients, glass, glow, or blur.
- **Motion**: feedback 100ms, spatial 160ms, `cubic-bezier(0.2, 0, 0, 1)`. Short, interruptible, no bounce or overshoot. Direct manipulation tracks input immediately. Reduced motion must preserve hierarchy and state.
- **Components**: shadcn primitives live in `src/renderer/shared/ui/shadcn`; product UI stays outside. Use them instead of restyling focus, disabled, and keyboard states in page CSS.
- **No hardware cosplay**: no fake knobs, screws, LEDs, or decorative meters.

## Layout

- One continuous spatial system: persistent navigation, library/detail workspace, persistent playback region (88px high).
- Workspace views share the same horizontal inset and left edge. Grids fill left to right and may leave space on the right; no per-view centering.
- Tables, artwork, panes, and readouts share alignment lines.
- Prefer intrinsic layout (flex wrap, content sizing) before breakpoints; use container queries for width-dependent components. Shell breakpoint is `md` (768px).
- Responsive layouts rearrange rather than scale. Secondary metadata yields first. Content stays inside its owning region and never displaces shell controls.
- Use the structure that fits the content (grid, list, table, ledger); don't turn everything into cards. Don't use big padding as a substitute for hierarchy.

## Application chrome

- Frameless window with a 40px app-owned title surface: text `Nice Audio Player`, minimize/maximize/close controls, and below 768px the mobile navigation trigger. No app icon. Empty space is draggable; controls are not. Standard Windows resize borders and Snap Layout work.
- No `File / Edit / View / Window` menu bar. Commands live in their workspace or Settings.
- At 768px and above the sidebar is persistent and not collapsible; below it, navigation is a sheet with an explicit close control.

## Views

- **Library**: Albums (artwork-led), Album Artists (textual), Tracks (tabular). Each keeps its own filter, sort, and scroll. The filter sits in a stable spot per view and keeps its query when switching views.
- **Details**: album and artist views establish identity before related content. Back returns to the semantic parent and restores context. The same object stays visually traceable across transitions.
- **Settings**: a technical ledger, not cards. Labels, values, controls, paths, and errors align. Read-only info doesn't look like a disabled input. Changes apply immediately where safe.
- **States**: empty, loading, error, and content states have clear ownership. Errors appear near the affected object with a recovery action. Prefer Undo over confirmation dialogs; confirm only for meaningful irreversible actions.
- **Temporary UI** (menus, popovers) is attached to its trigger, compact, minimally rounded, and uses standard keyboard/focus/dismissal patterns. Icons only where they aid recognition.

## Playback

- A persistent region with stable geometry. Primary transport stays centered; other info must not shift it.
- Timeline, transport, volume, and technical status read as one instrument. Technical status (format, sample rate, bit depth, bitrate) lives in a compact dedicated region.
- Volume is icon, level, and numeric readout on one axis.

## Track activation

- A track row is one playback object. Pointer activation uses the whole row except nested controls. Keyboard and assistive tech use a real button in a fixed action/state slot.
- The slot is always reserved: before the title in the Library table, in the track-number column in Album tables. Inactive tracks show Play on hover/focus; the active playing track shows Pause; the active paused track shows Resume.
- Row activation of the active playing track is inert, so a broad hit area can't accidentally pause.
- Hover, playback state, selection, and keyboard focus are separate visual states and may coexist. Changing playback state must not move the title baseline or columns.

## Accessibility

- Sufficient contrast (WCAG AA), visible keyboard focus, logical focus order, keyboard support everywhere.
- Usable with reduced motion, forced colors, text enlargement, and Windows scaling at 100/125/150/200%.
- When space runs out, rearrange or drop secondary info before shrinking text.

## Don'ts

- Don't build a dashboard of interchangeable cards.
- Don't hide useful playback/file info just to look minimal.
- Don't use oversized headings or hero space to manufacture importance.
- Don't let secondary info disturb the center of primary controls.
