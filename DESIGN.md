# DESIGN.md

This document gives the principles that every screen follows, and the reasons for them. It has no code paths and no tuned values. [requirements.md](./docs/requirements.md) decides what the app does. This document decides how the app looks, moves, and feels.

## Character

The app is a tool for a personal music library. It is not a storefront. It is dark, precise, and quiet. The music gives the color and the warmth, through its artwork. The app gives order. The app may be playful when that rewards attention to the music. It is never playful when the user tries to get something done.

## Principles

1. **The task comes first.** Users find, play, and arrange music in the fewest steps. Every action is reachable from where its object appears. The user can undo any change that replaces what the user arranged, such as the queue or a setting. Decoration and motion never delay, hide, or replace an action.
2. **It works at any size.** A library of fifty thousand tracks feels the same as one of fifty. There is no manual paging. No view has a cost that grows with the collection.
3. **Light comes from artwork. Color has meaning.** The artwork of the playing or viewed item lights and tints the surfaces. Controls and feedback use semantic colors. These colors show intent and state, including errors and destructive actions. When artwork color is drawn as ink, it means _now_: the part of time that is playing. It never marks a control's state, focus, or ordinary text. Text over light stays readable.
4. **Time has three luminances.** The past is faintest. The present is brightest. The future is in between. This applies everywhere time appears: lyrics, the queue, and the playing track. Distance from the present may dim a row further. The text stays readable. A change of state never changes size or weight, so nothing shifts.
5. **One thing, one place.** The chrome does not repeat the playing track. The objects that the user follows across screens (the Sleeve, a tile that opens into its page) move. They do not vanish and reappear. Everything else may crossfade.
6. **Geometry is stable.** Primary controls never move. Loading, playback state, and secondary information never shift the layout. When space runs out, rearrange first. Then drop secondary information. Shrink text last.
7. **Motion explains.** Motion shows where something came from, where it went, or that its data changed.
   - Direction shows hierarchy. Deeper goes up, and back comes down. Next leaves to the left. Previous leaves to the right.
   - Direct manipulation follows the input one to one.
   - A shared element (the Sleeve, a tile that opens into its page) moves by an interruptible crossfade. It does not use the View Transitions API, which ignores input while it runs.
   - Every movement follows one curve: a spring that never overshoots. It has one of three durations: feedback, move, or large.
   - A movement that input drives keeps its velocity. A movement that changes its target while it moves also keeps its velocity (opening Now Playing, lyrics scroll). It never jumps.
   - Reduced motion replaces every movement with a brief crossfade. No information is lost.
   - Progress motion runs at constant speed.
   - Calm motion (a setting) stops motion that starts on its own. Only the position marker moves. The idle motion (the Artwork glow breathing) stops.
8. **Decoration is data.** Anything that looks like an instrument shows real data and behaves truthfully. A magnifier magnifies the input. A meter measures. Do not add decoration that means nothing. An instrument may look like an instrument. It may not look like it measures what it does not measure.
9. **Density follows the task.** Browsing artwork has room to breathe. Tables, metadata, settings, and technical readouts are compact. Hierarchy comes from size, luminance, and spacing. It does not come from boxes, heavy weights, or large empty space. Use the structure that the content has: grid, list, table, or ledger. Do not build dashboards of cards that all look alike.
10. **Text is real.** Text stays real and selectable, in the flow of the page. Animated glyphs are only a layer over the text. Assistive technology does not read them.
11. **Broad targets only start things.** A large hit area (a row, a tile) may start or open something. Pausing, removing, and every destructive action belong to a specific control.
12. **State is honest.** Empty, loading, and error states each have one clear owner. They appear next to what they affect. Each one has a way to recover. Prefer undo to confirmation. Confirm only what cannot be undone.
13. **Accessible by default.** The app has AA contrast, visible keyboard focus, and full keyboard reach. Color is never the only signal. The app stays usable with reduced motion, forced colors, larger text, and Windows scaling from 100% to 200%.

## Vocabulary

Screens use five elements: Sleeve, Artwork glow, Album strip, Row index, and Signal path. Screens do not use new looks.

## Space

- The app has one continuous space: persistent navigation, one workspace, and the playback dock. Views share the same left edge and inset. No view centers itself.
- Navigation keeps the same opaque surface when it folds into a panel. Menus, selection popups, tooltips, dialogs, and task panels use Acrylic.
- Now Playing is not a page. It is the dock extended upward, a layer over the place the user was. That place stays as it was, underneath. Back closes Now Playing.
- The deeper the hierarchy, the higher the layer. The order is: workspace, Now Playing, side panels, menus, dialogs. A popup that opens in a floating surface sits above its caller. A Sleeve in flight stays beneath floating controls. Things appear from where they were called.
- The window is frameless. The app draws its own title bar. It has no menu bar. Commands appear where they take effect, or in Settings.

## Type

The app uses one sans family: Satoshi for Latin, Noto Sans JP for Japanese, then the system UI font. Use the regular weight for ordinary text. Use the medium weight only to emphasize headings and primary titles. Hierarchy comes from size, luminance, and spacing. Nothing is smaller than 14px. Selection and playback state never change weight. Use tabular figures for numbers that align or change. Use uppercase only for short technical labels. Do not use monospace for style.

## Where the details live

Values, sizes, timings, and component behavior live in the code that owns them. This includes the color and motion tokens, the Artwork glow's readability caps (a test enforces them), and the comments and tests of each component. Use semantic tokens for UI surfaces. Do not use raw palette values.

## Amending

If a feature needs an exception to a principle, change the feature or rewrite the principle. Give the reason. This document has no exception lists. The principles decide any detail that this document does not cover. Record such a detail in the code, not here.
