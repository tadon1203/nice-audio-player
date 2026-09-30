# DESIGN.md

The constitution of the UI: the principles every screen follows and why. It holds no implementation. Values, sizes, timings, and how a particular component behaves live in the code that owns them (tokens, component comments, tests). [requirements.md](./docs/requirements.md) decides what the app does; this decides how it looks, moves, and feels.

## Character

A tool for a personal music library, not a storefront. Dark, precise, and quiet. The music supplies the color and the warmth, through its artwork; the app supplies order. It may be playful where that rewards attention paid to the music, never where the user is trying to get something done.

## Principles

1. **The task comes first.** Finding, playing, and arranging music take the fewest possible steps, and every action is reachable from where its object is shown. Anything that replaces what the user arranged (the queue, a setting) can be undone. Decoration and motion never delay, hide, or stand in for an action.
2. **It works at any size.** A library of fifty thousand tracks feels the same as one of fifty: no manual paging, and no view whose cost grows with the collection.
3. **Artwork is the only light.** Color comes from the artwork of what is playing or being looked at, and it tints surfaces. Controls are grayscale. When artwork color is drawn as ink, it means _now_: the part of time that is playing. It never marks a control's state, focus, or ordinary text. Text over light stays readable.
4. **Time has three luminances.** The past is faintest, the present brightest, the future in between, everywhere time appears (lyrics, the queue, the playing track). A change of state never changes size or weight, so nothing shifts.
5. **One thing, one place.** The playing track is not repeated in the chrome. The objects the user follows across screens (the Sleeve, a tile opening into its page) move there instead of vanishing and reappearing. Everything else may simply crossfade.
6. **Geometry is stable.** Primary controls never move. Loading, playback state, and secondary information never shift the layout. When space runs out: rearrange first, then drop secondary information, and shrink text last.
7. **Motion explains, within a budget.** Motion shows where something came from, where it went, or that its data changed. Direction encodes hierarchy: deeper goes up, back comes down; next leaves left, previous leaves right. Direct manipulation follows the input one to one. At any moment at most one thing moves continuously on its own, the thing that shows the playing position; everything else moves only when something changes. Nothing bounces except a press. With reduced motion, every movement becomes a brief crossfade and no information is lost. `Calm motion` (a setting) goes further than the budget's default: only the position marker moves on its own, and the idle motion that is otherwise allowed (the Light breathing, a lit lyric character lifting) stops.
8. **Decoration is data.** Anything that looks like an instrument shows real data and behaves truthfully: a magnifier magnifies the input, a meter measures. No fake hardware, and nothing decorative that means nothing.
9. **Density follows the task.** Browsing artwork breathes; tables, metadata, settings, and technical readouts are compact. Hierarchy comes from size, luminance, and spacing, not from boxes, heavy weights, or large empty space. Use the structure the content has (grid, list, table, ledger); no dashboards of interchangeable cards.
10. **Text is real.** Text stays real, selectable text in the flow of the page. Animated glyphs are only a layer drawn over it and hidden from assistive technology.
11. **Broad targets only start things.** A large hit area (a row, a tile) may start or open something. Pausing, removing, and anything destructive belong to a specific control.
12. **State is honest.** Empty, loading, and error states each have one clear owner and appear next to what they affect, with a way to recover. Prefer undo to confirmation; confirm only what cannot be undone.
13. **Accessible by default.** AA contrast, visible keyboard focus, everything reachable by keyboard, color never the only signal. It stays usable with reduced motion, forced colors, enlarged text, and Windows scaling from 100% to 200%.

## Vocabulary

Screens are built from five elements rather than new looks.

- **Sleeve**: the music as an object, its artwork. Its corner radius says how it is placed: square when attached to an edge, rounded when placed in the workspace, smaller inside a row.
- **Light**: the artwork, blurred, lighting a surface. Its strength follows the user's focus: strongest in Now Playing, then the dock, then the header of a detail page, faint in the library, absent in navigation and Settings. Floating UI (menus, dialogs, panels) uses Acrylic, not Light. Blur appears only in Light and Acrylic and is never animated.
- **Strip**: time drawn horizontally.
- **Gutter**: position and order on the left, in tabular figures. It is also the button of its row.
- **Path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length alone says whether playback is bit-perfect.

## Space

- One continuous space: persistent navigation, one workspace, and the playback dock. Views share the same left edge and inset; nothing is centered per view.
- Now Playing is not a page. It is the dock extended upward, a layer over the place the user was, which is kept as it was underneath. Back closes it.
- The deeper the hierarchy, the higher the layer: workspace, then Now Playing, then side panels, then menus, then dialogs. Things appear from where they were summoned.
- The window is frameless with an app-owned title bar and no menu bar. Commands live where they take effect or in Settings.

## Type

One sans family: Satoshi for Latin, Noto Sans JP for Japanese, then the system UI font. Regular weight; hierarchy from size and luminance. Nothing smaller than 14px. Tabular figures for numbers that align or change. Uppercase only for short technical labels. No monospace for style.

## Where the details live

- Color tokens: `src/app/renderer/styles.css` (semantic tokens only).
- Motion tokens: `src/renderer/shared/ui/motion/tokens.ts`.
- Light's readability caps: `src/renderer/shared/ui/artwork-light/light-model.ts`, enforced by its test.
- Component behavior: the comment and tests of the component.

## Amending

A feature that needs an exception to a principle changes the feature or rewrites the principle, with the reason. There are no exception lists. A detail this document does not cover is decided by the principles and recorded in the code, not here.
