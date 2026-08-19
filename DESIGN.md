---
version: alpha

name: Nice Audio Player

description: "A dark, artwork-led desktop interface built as one coherent physical and perceptual world: monochrome structure, disciplined typography, deliberate negative space, direct control, and semantic status color."

colors:
  canvas: "#050505"
  surface: "#0C0C0C"
  surface-raised: "#121212"
  surface-hover: "#181818"
  surface-pressed: "#202020"
  border-subtle: "#2A2A2A"
  border-control: "#6A6A6A"
  text-primary: "#F4F4F4"
  text-secondary: "#A5A5A5"
  text-muted: "#7A7A7A"
  text-disabled: "#707070"
  focus-ring: "#FFFFFF"
  action-filled: "#F4F4F4"
  action-filled-hover: "#DDDDDD"
  action-filled-pressed: "#C8C8C8"
  action-filled-foreground: "#050505"
  error: "#FF5C68"
  error-surface: "#2A1014"
  transparent: "transparent"

typography:
  application-heading:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1.12
  media-title:
    fontFamily: "Zodiak, Georgia, Times New Roman, serif"
    fontSize: 44px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.015em
  media-title-interface:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1.12
  media-artist:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.18
  section-title:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.3
  body-lg:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "Switzer, Noto Sans JP, Segoe UI, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.35

spacing:
  s1: 4px
  s2: 8px
  s3: 12px
  s4: 16px
  s5: 20px
  s6: 24px
  s8: 32px
  s10: 40px
  s12: 48px
  s16: 64px
  s20: 80px
  s24: 96px

rounded:
  none: 0px
  control: 8px
  surface: 12px
  media: 16px
  full: 9999px

components:
  action-filled:
    backgroundColor: "{colors.action-filled}"
    textColor: "{colors.action-filled-foreground}"
    rounded: "{rounded.surface}"

  action-filled-hover:
    backgroundColor: "{colors.action-filled-hover}"

  action-filled-pressed:
    backgroundColor: "{colors.action-filled-pressed}"

  action-neutral:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"

  action-neutral-hover:
    backgroundColor: "{colors.surface-hover}"

  action-neutral-pressed:
    backgroundColor: "{colors.surface-pressed}"

  surface-raised:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.surface}"

  notice-error:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
---

This document defines how Nice Audio Player looks, feels, and behaves across features and screens.

The prose carries the design. Tokens provide shared reference values for that design; they are not a substitute for judgment.

This document does not define product capabilities, domain state, data contracts, persistence, command behavior, backend architecture, or source-code structure. A feature does not require a change here unless it introduces a visual or interaction law intended to hold beyond that feature.

## Overview

Nice Audio Player is a dark, artwork-led Windows music player whose interface behaves as one coherent world.

Its visual character resembles a monochrome type specimen displayed on a black screen: large areas are allowed to remain empty; typography, artwork, alignment, and distance carry more weight than containers; permanent chrome is grayscale; color appears only when it has semantic work to do.

The interface is designed for long, attentive listening sessions. It does not ask for attention merely because screen space is available. Controls become evident when needed, state remains legible when nothing is moving, and the music retains visual priority over the machinery that operates it.

Apple's enduring human-interface philosophy is an explicit reference for this design. The reference is philosophical rather than stylistic. Nice Audio Player adopts the qualities that have survived changes in Apple's appearance — purpose, agency, familiarity, consistency, direct manipulation, intelligible feedback, spatial continuity, simplicity, and craft — without reproducing the current appearance of macOS, iOS, or any particular generation of Apple software.

Apple-specific chrome, SF typography, SF Symbols, Liquid Glass, glass materials, contemporary Apple radii, decorative depth, and other fashion-dependent surface treatments are not part of the design merely because Apple uses them. Every visible decision must make sense for Nice Audio Player itself: a dark, local-first Windows desktop player centered on music, artwork, and direct control.

## Physical and perceptual model

The interface behaves as though its surfaces and controls occupy one continuous, learnable space.

A panel that belongs to the right arrives from the right and returns there. A child surface advances from its parent and returns along the inverse path. An object that remains semantically the same remains perceptually traceable instead of disappearing and being recreated elsewhere. Responsive layouts may rearrange those relationships, but a breakpoint does not create a different interaction universe.

Objects do not teleport, stretch, reverse direction, or acquire a new apparent physical character without a reason established by the interaction. Layout changes move objects through space; they do not make text, artwork, icons, or controls appear elastically deformed.

Direct manipulation stays attached to the user's action. Seek, volume, scrollbar, touch, and other directly manipulated values respond without perceptible settling lag. A new valid user action may supersede an in-progress transition immediately.

Different phenomena are allowed to feel different because they are physically different. Layout movement, viewport scrolling, optical state changes, direct manipulation, icon-state continuity, and corrective positioning do not need one universal motion behavior. What matters is that each phenomenon is internally coherent and does not compete with another authority for the same visible state.

Physical consistency is a prerequisite for perceptual clarity.

The interface must also make its state knowable. A person should be able to determine where they are, what is current, selected, playing, disabled, loading, or unavailable, what can be operated, what changed after an action, and whether the current state can be interrupted, reversed, left, or recovered from.

Feedback exists to reduce uncertainty, not to decorate an action. Motion, typography, contrast, position, spacing, borders, and markers are information channels. Essential state never depends on animation alone, and no effect may imply a causal, spatial, or semantic relationship that does not actually exist.

## Beauty, simplicity, and craft

Nice Audio Player does not treat beauty as a decorative layer.

Beauty is the perceptual result of correct proportions, precise alignment, intentional rhythm, clear hierarchy, disciplined typography, stable object relationships, negative space, immediate feedback, and the absence of unnecessary parts.

Simplicity therefore does not mean removing function. It means reducing independent rules, unnecessary representation, and avoidable decisions. A large interface can remain simple when the same few laws explain its layout, interaction, typography, state, and motion everywhere.

When a surface feels weak, repair it in this order:

1. information priority;
2. geometry and alignment;
3. grouping and spacing;
4. typography;
5. state clarity;
6. interaction behavior;
7. only then, additional visual treatment when that treatment communicates something necessary.

An effect earns its place only when removing it would make hierarchy, state, feedback, operability, or spatial understanding worse.

Craft means resolving ordinary states with the same care as showcase states: long metadata, empty libraries, loading, failure, disabled controls, reduced motion, forced colors, narrow windows, display scaling, focus order, repeated interaction, interruption, and recovery are all part of the design.

## Colors

The permanent interface is monochrome.

`canvas`, surfaces, borders, typography, controls, and focus indicators use grayscale roles. The grayscale is structural rather than decorative: differences in luminance establish hierarchy, grouping, affordance, and state without introducing a permanent brand accent.

- `canvas` is the lowest permanent layer.
- `surface` separates a persistent region from the canvas.
- `surface-raised` identifies content temporarily placed above the current layer.
- `surface-hover` and `surface-pressed` acknowledge interaction without moving the control.
- `border-subtle` separates adjacent dark regions only when proximity and luminance are insufficient.
- `border-control` makes a necessary control or state boundary legible.
- `text-primary`, `text-secondary`, and `text-muted` express information priority.
- `text-disabled` is reserved for unavailable interaction.
- `focus-ring` is reserved for keyboard focus.

Do not replace these semantic roles with arbitrary raw colors.

Chromatic color is scarce and semantic. It is reserved for states such as error and does not become a permanent accent, artwork-derived tint, reflected light, gradient, glow, or decorative atmosphere.

Artwork is foreground media. It does not leak its palette into persistent controls, text, borders, or surfaces.

Text contrast follows 4.5:1 for ordinary text and 3:1 for qualifying large text. Icons, control boundaries, and focus indicators maintain at least 3:1 against adjacent colors. Color is never the sole distinction between two meaningful states.

The product supports one permanent palette: dark. Operating-system light/dark preference does not replace it. Forced-color, contrast, motion, and display-scaling preferences remain independent accessibility concerns.

## Typography

Typography provides much of the interface's character, hierarchy, and rhythm. Repeated roles must therefore remain recognizably identical across features rather than being retuned screen by screen.

Switzer carries Latin interface text, controls, changing values, ordinary media metadata, status, instructions, filenames, device names, and numbers. Noto Sans JP supplies Japanese glyphs in those same roles.

Zodiak is intentionally exceptional. It is reserved for a short, stable Latin-script media title on a dedicated identity surface, where a display voice does not compete with controls or changing state. Application headings remain in the interface family.

A Zodiak text group:

- contains one to six Latin-script words;
- occupies no more than two lines;
- is a stable media title, noninteractive, and noneditable;
- contains no filename, device value, status, measurement, or instruction;
- uses a solid grayscale color without outline, gradient, blur, glow, or shadow;
- is at least 36px;
- does not compete with another primary typographic focal point in the same viewport.

Japanese, non-Latin, and mixed-script media titles use the interface stack as one coherent typographic group rather than combining Zodiak with fallback glyphs.

Use the documented scale rather than creating arbitrary intermediate sizes. Interface text uses sentence case. Japanese and mixed Japanese–Latin text does not receive Latin-oriented tracking. Time, percentages, measurements, and values that update in place use tabular numerals.

Feature composition may control a text block's placement, measure, wrapping, truncation, and overflow. It does not redefine the family, weight, line height, and tracking of a shared semantic role.

Truncation must not make the full value inaccessible; the complete value remains available through an accessible name, description, or appropriate detail surface. Changing text must not unexpectedly move unrelated content or interactive targets.

## Layout and negative space

Layout is the primary expression of hierarchy.

Wide compositions use a fluid twelve-column structure with a maximum content width of 1360px, a 24px column gap, and horizontal outer padding of `clamp(24px, 5vw, 80px)`. Additional width beyond the content measure remains empty rather than stretching text, controls, media, or surface padding.

The page gutter and the content measure are different spatial responsibilities. The outer frame relates content to the viewport; the inner frame defines the maximum readable/compositional measure. Feature-specific grids and topology live inside that shared relationship.

Spacing follows the documented scale. Related content normally uses 8, 12, 16, 20, 24, or 32px relationships; major sections use 48, 64, 80, or 96px separation. The goal is not uniform spacing but a legible rhythm of tight and generous intervals.

Empty space is intentional. Once required content has been placed, unused regions may remain empty. Do not add copy, badges, cards, symbols, gradients, or decorative objects merely to make the composition look occupied.

When one large visual object and one associated text group dominate a wide composition, preserve a meaningful separation between them; where the grid permits it, reserve at least one full column of negative space.

Group content in this order:

1. proximity and distance;
2. alignment;
3. typography;
4. luminance;
5. a thin functional border;
6. a container only when the earlier methods are insufficient.

Do not create a rounded surface merely to prove that a group exists.

No viewport should contain more than two groups competing at the largest visual scale. Secondary information recedes through smaller type, smaller media, lower contrast, or reduced area rather than additional enclosure.

### Responsive behavior

Responsive design restructures the composition instead of scaling it.

As width decreases:

1. intentional empty columns disappear first;
2. outer padding contracts toward 24px;
3. adjacent groups reflow according to their semantic relationship;
4. display typography may step down to the next documented role;
5. interaction targets retain their usable dimensions.

Responsive topology may change, but semantic identity, reading order, focus order, navigation direction, and cause-and-effect remain coherent.

A child surface that replaces its parent on a narrow layout is still the same child relationship that appears alongside that parent in a wider split layout. The spatial expression may differ, but the meaning does not.

Corrective changes caused purely by window resize or breakpoint crossing may resolve immediately; they do not need to masquerade as user-authored navigation.

Never scale the entire composition with a transform. Body text never drops below 13px.

## Surfaces, depth, and shape

Depth exists only to explain real layering.

There are at most four simultaneous conceptual levels:

1. `canvas`;
2. persistent `surface`;
3. temporary `surface-raised`;
4. modal or system-owned overlay.

Persistent regions use solid backgrounds. Backdrop blur is not a product material.

Separation comes primarily from space, alignment, and luminance. Borders appear only when a boundary would otherwise become ambiguous, such as focus, dense-list separation, an interactive boundary, selected/current state, or a true overlay/menu/modal boundary.

Shared decorative shadows are not part of the visual language.

Shape follows role:

- viewport-level and edge-attached persistent regions use `none`;
- compact controls use `control`;
- temporary raised groups use `surface`;
- artwork and visual media use `media`;
- circles use `full` only when the geometry is genuinely circular.

Primary text actions use the `surface` radius. Pills are reserved for binary selection, compact status, or semantics that are naturally pill-like.

Do not derive shape from current Apple styling and do not round every element into the same generic visual vocabulary.

## Components and interaction states

Shared controls establish a common interaction grammar. A feature may compose and position them, but the same type of control should not acquire different hover, pressed, focus, selected, or disabled physics merely because it appears on another screen.

### Actions

A related action group contains at most one filled action.

Filled actions use `action-filled`, `action-filled-hover`, and `action-filled-pressed`, always with `action-filled-foreground`. They remain grayscale and receive no permanent glow.

Neutral actions remain transparent at rest and use the corresponding hover/pressed surfaces.

Hover and pressed feedback never changes the control's width, height, alignment, hit target, or surrounding layout.

### Rest, hover, and press

Idle controls do not animate.

Hover changes background, border, or foreground luminance. It does not move, rotate, resize, scale, or raise the element.

Pressed state acknowledges input through the pressed visual treatment. It does not introduce a second physical event such as shrinking or lifting the control.

### Focus

Keyboard focus uses a 2px `focus-ring` with a 2px offset. It remains visible over hover, selected, current, and pressed states and is never substituted by those states.

### Selected and current

Selected and current are semantic states, not stronger hover states.

Both use at least two visible differences from rest. One may be color or luminance; the other is expressed through shape, border, icon, text weight, or a stable non-layout-affecting positional marker.

`Current` identifies the destination or application state being displayed. `Selected` identifies a choice within a collection or control. Keyboard focus identifies only the user's current focus position and never acts as a substitute for either.

These treatments preserve the control's outer geometry.

### Playing

Playing identifies the authoritative playback identity and remains semantically distinct from selected and current state.

A compact monochrome static marker may replace a track number for the playing item. It remains identifiable while paused and under reduced motion. It is not a visualizer and does not consume audio data.

### Disabled, loading, and error

Disabled controls use `text-disabled`, retain their normal outer dimensions, and are not communicated by opacity alone.

Loading preserves the occupied geometry whenever existing content can remain visible; avoid replacing an otherwise useful screen with a generic centered spinner.

Errors stay local to the affected region and do not unnecessarily resize or move unrelated content.

### Range controls

Range controls use a 4px visible track and a 16px thumb inside a minimum 40px interactive surface. The native range remains the semantic control.

Fill and thumb represent the authoritative value. Direct pointer and keyboard manipulation updates them immediately. Non-direct external value changes may settle using the normal state effect.

Hover, focus, press, and drag may change contrast or ring visibility, but never track thickness, thumb size, hit-target size, or surrounding geometry.

Muted Volume preserves its stored non-zero position while its fill and thumb use the subdued treatment. The icon communicates `silent`, `low`, or `high` as a state of the same control rather than as unrelated glyphs.

## Motion

Motion explains state, relationship, and causality. It is not an ambient layer of personality applied to otherwise static UI.

```yaml
motion:
  feedback: 160ms
  state: 220ms
  content: 320ms
  image: 600ms
  reduced: 120ms
  easing: cubic-bezier(0.22, 1, 0.36, 1)
```

These values describe effects motion. Feedback is immediate enough to remain attached to an action. State effects settle quickly. Content takes additional time only when the user benefits from seeing how one state relates to another. Image replacement may take longer because visual media needs less urgent acknowledgement.

Nothing bounces, overshoots, lingers after its meaning is understood, or animates merely because it is idle.

Neutral replacement is effects-only. Ordered navigation may use restrained directional movement. Entering a child follows the forward relationship; returning follows its inverse. Responsive versions of the same relationship preserve that meaning.

A same semantic object may move continuously between layouts or states when continuity makes identity clearer. Unrelated controls, destinations, or objects do not morph merely because animation is available.

Structural geometry is defined by valid before-and-after layouts. Intermediate motion must not visibly stretch text, icons, controls, or artwork, and it must not be created by time-interpolating width, height, inline/block size, edge positions, margins, padding, gaps, or grid-track dimensions.

Direct manipulation never waits for spatial animation.

Corrective re-anchoring, exact scroll restoration, breakpoint correction, and other discontinuous positioning are instant.

An unanchored modal has no assumed physical origin. Its generic entrance is therefore effects-only. Translation, scaling, or shared spatial continuity is appropriate only when an actual source or directional relationship exists.

The same principle applies to tooltips and other temporary feedback: do not invent movement simply to make them feel animated.

### Reduced motion

Reduced motion is an intentional alternate experience, not normal motion made faster.

When reduced motion is active:

- spatial translation, scale, rotation, layout animation, and icon morphing are removed;
- corrective and programmatic positioning is immediate;
- opacity transitions are limited to 120ms;
- focus, selected, current, playing, loading, disabled, and error distinctions remain intact.

Meaningful feedback remains visible even when spatial movement is absent.

## Scrolling

Scrolling behaves as one coherent physical system.

Wheel movement, programmatic movement, follow behavior, and interruption must not compete for ownership of the same viewport. A feature expresses what should become visible — nearest, centered, restored, or re-anchored — without inventing a new scrolling feel for itself.

Direct scrollbar and touch manipulation remain direct.

User intent supersedes programmatic movement. Automatic following detaches when the user intentionally browses away where that feature requires such behavior, and it does not silently reattach until the corresponding interaction explicitly calls for it.

Exact restoration and corrective re-anchoring are instant. Programmatic smooth scrolling becomes immediate under reduced motion.

Do not combine multiple smooth-scroll authorities for one viewport.

## Icons

Application control icons belong to one consistent geometric language.

Repeated icon size, stroke, alignment, and accessibility behavior are shared rather than redrawn feature by feature.

A control may transition between related icon shapes when both shapes represent states of the same control, such as Play/Pause, volume state, or Repeat/Repeat One. That continuity expresses preserved semantic identity.

Unrelated destinations or commands do not morph simply because they are both icons.

Icon state remains understandable without animation.

## Browser and native interaction surfaces

Browser-native semantics remain intact even when their visual treatment is customized.

Selection uses primary text over the canvas.

Scrollbars use a 12px canvas track with a 3px inset around a `border-control` thumb; hover increases the thumb to `text-secondary`. Forced-colors mode restores system scrollbar treatment.

Native form and range controls retain their semantic behavior. Visual replacement does not remove keyboard operation, accessible names, or platform interaction expectations.

## Accessibility

Accessibility is part of the same coherence expected from every other state.

Interactive targets are at least 40×40px. A single highest-emphasis control in a group may use 48×48px or larger.

Content remains usable at Windows display scaling of 100%, 125%, 150%, and 200%. At those scales, text does not clip, controls do not overlap, focus remains visible, and important state does not depend on motion, color, light, or media imagery alone.

Forced-colors mode uses system colors for text, borders, backgrounds, and focus indicators.

Reduced-motion behavior follows the Motion section.

Decorative SVGs remain outside the accessibility tree.

Changing content does not move keyboard focus unless the user initiates navigation to another view or dialog. If an exiting visual surface remains temporarily mounted after its semantic state has ended, it must already be noninteractive and absent from active accessibility state.

Responsive visual order and keyboard/focus order remain logically compatible.

## Do's and Don'ts

### Do

- **Do** treat Apple as a reference for durable human-interface thinking, not as a visual template.
- **Do** let music, artwork, typography, geometry, and negative space carry the composition.
- **Do** preserve identity, causality, direction, and directness through state and layout changes.
- **Do** use the same interaction and typographic laws across features.
- **Do** leave space empty when the task does not require content there.
- **Do** remove a visual element or effect when its absence does not harm hierarchy, state recognition, operability, feedback, or spatial understanding.
- **Do** resolve loading, error, disabled, focus, localization, scaling, reduced-motion, and responsive states as part of the primary design.

### Don't

- **Don't** imitate macOS, iOS, Liquid Glass, SF typography, SF Symbols, Apple chrome, or another current Apple surface treatment merely because Apple is the philosophical reference.
- **Don't** use decoration to compensate for weak information priority, geometry, grouping, typography, state clarity, or interaction.
- **Don't** fill negative space with cards, copy, badges, gradients, glows, reflected light, propagated artwork color, or ornamental objects.
- **Don't** turn every group into a rounded container or every state into a new material treatment.
- **Don't** invent motion without a real state, causal, or spatial relationship, and don't let responsive breakpoints change the meaning of the same interaction.
- **Don't** create feature-local visual or physical dialects when the product already has a shared rule for that phenomenon.
- **Don't** use Zodiak for application headings, supporting media metadata, changing data, controls, statuses, measurements, filenames, device values, or instructions.
- **Don't** animate while the interface is idle or make the user wait for motion before performing the next valid action.
- **Don't** add feature names, command names, source-code identifiers, issue numbers, or implementation-library names to this document.
