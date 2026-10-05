# DESIGN.md

The principles every screen follows, and why. It holds no implementation. [requirements.md](./docs/requirements.md) decides what the app does. This document decides how it looks, moves, and feels.

## Character

A tool for a personal music library, not a storefront. Dark, precise, and quiet. The music supplies the color and the warmth, through its artwork; the app supplies order. It may be playful where that rewards attention paid to the music, never where the user is trying to get something done.

## Principles

1. **The task comes first.** Finding, playing, and arranging music take the fewest possible steps, and every action is reachable from where its object is shown. Anything that replaces what the user arranged (the queue, a setting) can be undone. Decoration and motion never delay, hide, or stand in for an action.
2. **It works at any size.** A library of fifty thousand tracks feels the same as one of fifty: no manual paging, and no view whose cost grows with the collection.
3. **Light comes from artwork; color has meaning.** The artwork of what is playing or being looked at lights and tints surfaces. Controls and feedback use semantic colors to communicate intent and state, including errors and destructive actions. When artwork color is drawn as ink, it means _now_: the part of time that is playing. It never marks a control's state, focus, or ordinary text. Text over light stays readable.
4. **Time has three luminances.** The past is faintest, the present brightest, the future in between, everywhere time appears (lyrics, the queue, the playing track). Distance from the present may dim a row further only while its text stays readable. A change of state never changes size or weight, so nothing shifts.
5. **One thing, one place.** The playing track is not repeated in the chrome. The objects the user follows across screens (the Sleeve, a tile opening into its page) move there instead of vanishing and reappearing. Everything else may simply crossfade.
6. **Geometry is stable.** Primary controls never move. Loading, playback state, and secondary information never shift the layout. When space runs out: rearrange first, then drop secondary information, and shrink text last.
7. **Motion explains.** Motion shows where something came from, where it went, or that its data changed.
   - Direction encodes hierarchy. Deeper goes up, and back comes down. Next leaves left, and previous leaves right.
   - Direct manipulation follows the input one to one.
   - Every movement follows one curve: a spring that never overshoots. It has one of three durations (feedback, move, large).
   - A movement that input drives, or that retargets while moving (opening Now Playing, lyrics scroll), keeps its velocity. It never jumps.
   - Reduced motion replaces every movement with a brief crossfade. No information is lost.
   - Progress motion runs at constant speed.
   - Calm motion (a setting) stops motion that starts on its own. Only the position marker moves. The idle motion (the Light breathing) stops.
8. **Decoration is data.** Anything that looks like an instrument shows real data and behaves truthfully: a magnifier magnifies the input, a meter measures. Nothing decorative that means nothing. An instrument may look like an instrument; it may not look like it measures what it does not.
9. **Density follows the task.** Browsing artwork breathes; tables, metadata, settings, and technical readouts are compact. Hierarchy comes from size, luminance, and spacing, not from boxes, heavy weights, or large empty space. Use the structure the content has (grid, list, table, ledger); no dashboards of interchangeable cards.
10. **Text is real.** Text stays real, selectable text in the flow of the page. Animated glyphs are only a layer drawn over it and hidden from assistive technology.
11. **Broad targets only start things.** A large hit area (a row, a tile) may start or open something. Pausing, removing, and anything destructive belong to a specific control.
12. **State is honest.** Empty, loading, and error states each have one clear owner and appear next to what they affect, with a way to recover. Prefer undo to confirmation; confirm only what cannot be undone.
13. **Accessible by default.** AA contrast, visible keyboard focus, everything reachable by keyboard, color never the only signal. It stays usable with reduced motion, forced colors, enlarged text, and Windows scaling from 100% to 200%.

## Vocabulary

Screens are built from five elements (Sleeve, Light, Strip, Gutter, Path) rather than new looks. Their definitions are in [CONTEXT.md](./CONTEXT.md).

## Space

- One continuous space: persistent navigation, one workspace, and the playback dock. Views share the same left edge and inset; nothing is centered per view.
- Navigation keeps the same opaque surface when folded into a panel. Menus, selection popups, tooltips, dialogs, and panels for tasks use Acrylic.
- Now Playing is not a page. It is the dock extended upward, a layer over the place the user was, which is kept as it was underneath. Back closes it.
- The deeper the hierarchy, the higher the layer: workspace, then Now Playing, then side panels, then menus, then dialogs. A popup opened within a floating surface sits above its caller. A Sleeve in flight stays beneath floating controls. Things appear from where they were summoned.
- The window is frameless with an app-owned title bar and no menu bar. Commands live where they take effect or in Settings.

## Type

One sans family: Satoshi for Latin, Noto Sans JP for Japanese, then the system UI font. Regular weight for ordinary text; medium may emphasize headings and primary titles. Hierarchy comes from size, luminance, and spacing. Nothing smaller than 14px. Selection and playback state never change weight. Tabular figures for numbers that align or change. Uppercase only for short technical labels. No monospace for style.

## Where the details live

Values, sizes, timings, and component behavior are in the code that owns them.

- Color tokens: `src/app.css` (semantic tokens only).
- Motion tokens: `src/lib/ui/motion/tokens.ts`.
- Light's readability caps: `src/lib/ui/artwork-light/light-model.ts`, enforced by its test.
- Component behavior: the comment and tests of the component.

## Amending

If a feature needs an exception to a principle, change the feature or rewrite the principle, and give the reason. There are no exception lists. The principles decide any detail this document does not cover. Record that detail in the code, not here.
