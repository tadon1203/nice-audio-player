# DESIGN.md

---

## name: Nice Audio Player

## Document responsibility

This document is the source of truth for visual and interaction design rules. It does not define accepted product behavior, system architecture, or contribution workflow.

## Overview

Nice Audio Player resembles a music-library workstation on the desk of a mastering engineer: a large local collection within easy reach, precise track and file information close at hand, and the active playback session continuously understandable without leaving the library.

It is a working desktop utility, not a streaming storefront. Album artwork is allowed to be expressive, but the surrounding interface behaves like professional equipment software: compact where comparison matters, spacious where imagery matters, precisely aligned, and stable enough to operate from memory.

The interface should feel as though it has been used every day for years. Nothing is enlarged merely to attract attention, and nothing useful is hidden merely to appear simple. Familiarity should make the application faster to read, because important regions keep their meaning and controls stay where users learn to expect them.

The design is neither sparse for the sake of elegance nor dense for the sake of expertise. Density follows the work. Artwork-led browsing can breathe; tables, metadata, settings, and playback status can become compact and technical. Dense information is welcome when its relationships remain obvious.

The permanent interface is dark and mostly monochrome. Artwork provides most of the visual color. The application itself communicates precision through alignment, typography, state clarity, and stable geometry rather than decorative effects or imitation of physical hardware.

Apple's human-interface work is a reference for continuity, direct manipulation, and interaction quality. Professional audio software is a reference for operational clarity, persistent status, and information density. Neither should be copied literally.

A successful screen should answer four questions without explanation: what matters now, what belongs together, what state the system is in, and where an action will take effect.

## Design tokens

Nice Audio Player uses a deliberately small semantic token system:

```text
Tailwind built-in theme
        + minimal custom @theme values
        + shadcn semantic CSS variables
                ↓
        @theme inline adapters
                ↓
        shadcn primitives and React product UI
```

`src/app/renderer/styles.css` owns the dark-only shadcn semantic variables, the `@theme inline` adapters, the application font, and global base styles. Product code uses semantic utilities such as `bg-background`, `text-foreground`, `bg-muted`, `border-border`, and `ring-ring` rather than raw interface palette values.

When deciding whether to add a token, use this order:

```text
1. Can an existing shadcn semantic token express the meaning?
   YES → use that token directly
   NO  → continue

2. Can a Tailwind built-in utility or an arbitrary structural value express it?
   YES → use that utility directly
   NO  → continue

3. Does the custom meaning recur across the product?
   YES → add the smallest possible value to `@theme` in `styles.css`
   NO  → continue

4. Is it one-component structural implementation?
   YES → keep it beside the owning component or local primitive source
   NO  → do not tokenize it
```

The normal dependency is `shadcn semantic variable → @theme inline adapter → Tailwind utility → React component`. Tailwind built-in spacing, type, radius, motion, and z-index utilities are the default primitive layer. Structural values such as `0`, `100%`, `auto`, `none`, `inherit`, `1fr`, grid spans, arbitrary values, and media-query boundaries are allowed when they describe layout rather than appearance.

### Colors

| Token                | Role              | Use                                |
| -------------------- | ----------------- | ---------------------------------- |
| `--background`       | canvas            | workspace background               |
| `--sidebar`          | chrome            | sidebar and playback               |
| `--popover`          | control           | input, select, button, menu        |
| `--accent`           | hover             | hover                              |
| `--muted`            | selected          | selection                          |
| `--foreground`       | primary content   | important text/icon                |
| `--muted-foreground` | secondary content | metadata and supporting text       |
| `--border`           | subtle stroke     | divider and structural rule        |
| `--input`            | control stroke    | control boundary                   |
| `--ring`             | focus             | keyboard focus only                |
| `--destructive`      | danger            | error and destructive actions only |

The application is dark-only and mostly monochrome. Artwork provides the visual color. `primary`, `secondary`, and `accent` remain the standard shadcn semantic roles used by generated primitives; product compositions do not invent additional meanings for them. `outline` and `surface-container-*` are not product token roles. Playback uses glyph/state semantics to remain distinguishable from selection; it does not receive a dedicated color.

### Typography

The interface uses Satoshi for Latin, Noto Sans JP for Japanese, and `Segoe UI, system-ui, sans-serif` as fallback through the `font-interface` theme value. Use Tailwind's standard `text-sm`, `text-base`, `text-lg`, and `text-2xl` utilities for the existing hierarchy. Technical values use the `tabular-nums` modifier. Interface text is never below 14px.

### Spacing, shape, size, and state

Use Tailwind's standard spacing, radius, sizing, and duration utilities first. Exact product geometry remains explicit at the owning composition: compact controls use `h-8`, navigation rows use `h-10`, artwork uses `rounded-lg`, icons use `size-4`/`size-5`/`size-6`, and repeated shell values use standard or local arbitrary utilities. Search and sort controls use stable widths of 190px and 188px respectively.

Normal boundaries use a 1px `--border` or `--input` border. Focus uses `2px solid var(--ring)` with `2px` offset. Motion is limited to feedback 100ms, spatial 160ms, and `cubic-bezier(0.2, 0, 0, 1)`. Only `shadow-none` and `shadow-floating` exist; persistent UI has no shadow. Layers are content 0, chrome 10, floating 20, and modal 30.

### Tailwind and layout

Tailwind exposes the standard shadcn utilities such as `bg-background`, `bg-card`, `bg-muted`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-input`, and `ring-ring`. Product-specific layout is composed with utility classes in React. Only recurring values that Tailwind cannot express cleanly belong in the `@theme` block in `styles.css`.

The structural layout contract is a 1360px reference width, 12 columns, 24px column gap, and 224px desktop navigation. Page content uses a responsive inline inset of `clamp(24px, 3vw, 40px)`. The persistent playback region is 88px high, including its 24px technical status strip. Responsive layouts rearrange regions rather than scaling typography. Viewport breakpoints use the application shell breakpoint; composed detail surfaces use container queries.

The permanent application chrome is grayscale.

The near-black canvas is a neutral working surface, not an atmospheric or cinematic effect. Persistent layers separate first through luminance, spacing, and placement; borders are introduced only when those are insufficient.

Artwork is the primary source of non-semantic color. It may be vivid, muted, photographic, or graphic without changing the surrounding interface. Persistent controls, text, borders, and background surfaces do not inherit artwork color.

Chromatic interface color is reserved for semantic information that genuinely benefits from stronger distinction, especially errors. Color is never the only indication of state.

### Component primitives

Reusable controls are local shadcn components under `src/renderer/shared/ui` (the `@/renderer/shared/ui` alias). Use `Button`, `Input`, `Slider`, `Toggle`, `ToggleGroup`, and `Tooltip` for interaction surfaces instead of duplicating their focus, disabled, keyboard, and state styles in page CSS. Product-specific compositions such as the playback dock, album tile, and settings folder list may combine these primitives without becoming generic shadcn containers.

## Typography

```yaml
typography:
  latin: 'Satoshi'
  japanese: 'Noto Sans JP'
```

Typography is closer to instrumentation than editorial display: compact, aligned, readable, and understated.

Satoshi is the Latin typeface. Noto Sans JP is used for Japanese text. Mixed Japanese and Latin content may use Noto Sans JP as one coherent typographic group.

Use Regular weight for most interface text. Hierarchy comes primarily from size, luminance, spacing, alignment, and placement rather than boldness.

Technical values use tabular numerals where alignment improves scanning: time, sample rate, bit depth, bitrate, counts, durations, and level values.

Uppercase is reserved for short technical labels and compact table headings. Ordinary navigation, object names, and section titles remain naturally cased.

Do not use monospace merely to make the application look technical. A professional tool earns that character through precision and structure.

## Layout

```yaml
layout:
  reference-width: 1360px
  columns: 12
  column-gap: 24px
  sidebar-width: 224px
  adjacent-pane-default: 320px
```

The interface behaves as one continuous spatial system rather than a collection of unrelated pages.

At desktop sizes it is organized around persistent navigation, a library or media detail workspace, and persistent playback controls. These regions retain their roles across views so repeated use builds spatial memory.

Alignment is structural. Tables, artwork, panes, playback controls, and technical readouts should share alignment lines as though they belong to one piece of equipment. An edge that almost aligns is often worse than one that clearly does not.

Visual balance is functional. Adding information to one side should not casually shift the perceived center of important controls or make the screen feel weighted toward an incidental panel.

Additional width may remain unused when stretching content would reduce scanability or weaken relationships.

Responsive layouts rearrange regions rather than proportionally scaling the interface. Secondary metadata yields before primary content becomes cramped or unreadable.

Responsive content must remain inside the region that owns it. Content may reflow or scroll within that region, but it must not expand unrelated shell regions or displace persistent controls.

## Information Density

Density follows the task.

A track table should feel closer to a professional file browser than to a streaming-service playlist: compact enough to compare many rows and columns without excessive scrolling, with alignment doing most of the organizational work.

An album grid should feel closer to records laid out for browsing than to a dashboard of cards. Artwork can carry visual weight without requiring surrounding panels, badges, or inflated spacing.

Metadata, library folder settings, and technical playback status may be dense because comparison and monitoring benefit from compact presentation.

Do not use large padding as a substitute for hierarchy. Dense information remains readable through grouping, baselines, fixed columns, contrast, and predictable placement.

Do not compress everything simply to look professional either. Density that does not improve reading or operation is only noise.

Use the structure that best matches the content: grid, list, table, ledger, strip, or direct spatial composition. Do not normalize unlike content into interchangeable cards.

## Surfaces and Shape

The application uses a small number of meaningful layers:

- the application canvas;
- persistent application surfaces;
- temporary dialogs and popovers;
- temporary raised surfaces;
- modal or system overlays when truly necessary.

Depth represents actual interaction hierarchy.

Persistent surfaces do not use blur, glass, glow, or decorative shadows. Separation should feel architectural rather than atmospheric.

Borders and rules indicate real structure: a resizable boundary, a table division, a focus state, or another relationship that benefits from a visible edge. Do not outline containers merely because they exist.

Rounded geometry follows function rather than acting as a universal style. Edge-attached application surfaces remain square. Compact controls and temporary surfaces may be rounded. Tool-like controls generally use tighter radii than primary music actions.

The interface may feel technical, but it should not cosplay physical equipment. Avoid fake screws, rack panels, ornamental LEDs, decorative meters, or other hardware references without a real informational role.

## Search and Local Controls

Global and local actions should be spatially distinguishable.

The filter occupies a stable location within each library presentation and retains that presentation's query while the user switches views. Controls that modify the current collection or view belong near that content. Their placement should make their scope obvious through proximity and alignment.

## Playback

Playback controls form a persistent operational area for the active session.

Its geometry remains stable while the rest of the application changes. Primary transport controls stay visually centered, and surrounding information must not pull their perceived position away from the window's center of gravity.

Timeline, transport, volume, and technical status should read as one coherent instrument rather than several competing clusters.

Technical playback information may remain continuously visible. When it does, it belongs in a compact dedicated region so monitoring detail can be dense without disturbing the primary control row.

Volume is a direct manipulation control and should remain geometrically simple: icon, level, and numeric readout share one clear axis rather than being displaced by unrelated metadata.

The playback area can carry more information than an ordinary consumer player. Its discipline comes from fixed regions, repeatable alignment, and clear state—not from hiding data.

## Media Details

Album and artist detail views establish the selected media identity before showing related tracks or albums. Back navigation returns to the semantic parent and preserves the relationship between an artist and its albums. Playback session information remains in the persistent playback region.

## Collections and Objects

Different content types use different representations because they support different kinds of reading.

Albums can be artwork-led. Artists can be primarily textual. Tracks benefit from tabular comparison. Each representation keeps its own filter, sorting, and scroll context.

Consistency comes from shared typography, spacing logic, state behavior, and navigation—not from making every object look the same.

Detail views preserve the relationship between parent and child. Object identity is established before secondary operations and subordinate content.

Navigation should retain origin and working context whenever practical. Returning should feel like going back to where the user was, not reconstructing a generic version of that place.

## Interaction and State

Controls are visually restrained at rest but unambiguous when interactive.

Hover and press affect the object locally without shifting surrounding layout.

Selection, playback, keyboard focus, hover, disabled state, loading, and error are different concepts and should not collapse into one generic highlight. Several may coexist on the same object.

Direct manipulation—seeking, volume, scrolling, dragging, resizing—tracks input immediately.

Pointer, keyboard, and context-menu interaction should refer to the same underlying object and produce consistent state changes.

Temporary UI uses established interaction patterns for keyboard navigation, focus management, dismissal, and accessibility.

## Navigation and Motion

The interface behaves as a continuous environment.

Moving from parent to child preserves perceived relationship. Returning reverses that relationship and restores meaningful working context where practical.

When the same semantic object appears before and after a transition, it should remain visually traceable rather than disappearing and reappearing as something unrelated.

Motion explains change; it does not decorate it.

```yaml
motion:
  feedback: 100ms
  easing: 'cubic-bezier(0.2, 0, 0, 1)'
```

Transitions are short, interruptible, and mechanical.

Nothing bounces, overshoots, floats, or settles after direct manipulation. Layout movement may animate, but text, artwork, and controls should not visibly stretch or deform.

Reduced motion preserves hierarchy, state, and directional understanding without depending on animation.

## Context Menus and Temporary UI

Temporary UI should feel attached to the object or task that invoked it.

Menus are compact and minimally rounded. Whitespace is preferred over excessive divider lines. Icons appear only where they improve recognition.

Temporary controls should not become permanent visual clutter merely because a function exists.

Reversible actions prefer Undo over unnecessary confirmation dialogs. Confirmation is reserved for actions with meaningful irreversible consequences.

## Settings and System States

Settings behaves like a technical ledger rather than a stack of cards.

Related labels, values, controls, paths, and errors align so the eye can compare them quickly. Read-only information looks like information rather than a disabled input.

Changes apply immediately when that model is safe and understandable.

Errors belong near the affected object or control and provide a clear recovery action.

Empty, loading, error, and content states have clear ownership and do not compete with one another.

## Accessibility

Text and controls maintain sufficient contrast against adjacent surfaces.

Color and motion are never the only indication of meaningful state.

Keyboard navigation and visible focus are supported throughout the interface.

Logical focus order follows the visible information structure.

The application remains usable with reduced motion, forced colors, text enlargement, and Windows display scaling at 100%, 125%, 150%, and 200%.

Technical density must not depend on unreadably small text. When space becomes insufficient, rearrange or omit secondary information before shrinking the interface indiscriminately.

## Do's and Don'ts

- **Do** make the interface feel like a tool whose positions can be learned by muscle memory.
- **Do** let dense technical information sit beside large artwork without forcing both into the same rhythm.
- **Do** allow compact tables and technical readouts to look genuinely compact.
- **Do** let artwork provide most of the visual color and complexity.
- **Do** use typography, spacing, alignment, and stable geometry before adding containers or effects.
- **Do** preserve object identity and spatial direction during navigation.
- **Don't** turn the library into a dashboard of interchangeable cards.
- **Don't** hide useful playback or file information merely to manufacture visual minimalism.
- **Don't** use oversized headings, empty hero space, or exaggerated scale to manufacture importance.
- **Don't** imitate physical rack hardware with fake knobs, screws, LEDs, meters, or ornamental technical graphics.
- **Don't** let secondary information disturb the visual center of primary controls.
- **Don't** use gradients, glow, glass, or decorative shadows as a substitute for structure.
- **Don't** animate direct manipulation with spring, settling, or delayed response.
