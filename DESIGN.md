---
version: alpha
name: Nice Audio Player
description: A dark-only visual system built from grayscale surfaces, large unoccupied regions, restrained typography, and localized chromatic light.

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
  text-muted: "#787878"
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
  typeScale:
    character-xl: 92px / 0.94
    character-lg: 72px / 0.96
    character-md: 56px / 0.98
    character-sm: 44px / 1.00
    display-lg: 44px / 1.12
    display-md: 34px / 1.18
    title: 22px / 1.30
    body-lg: 18px / 1.50
    body-md: 16px / 1.45
    body-sm: 14px / 1.40
    caption: 13px / 1.35

  fontRoles:
    interface: "Switzer / Noto Sans JP / system fallback"
    character: "Zodiak / Noto Sans JP / serif fallback"

  weights:
    regular: 400
    medium: 500
    semibold: 600

  tracking:
    character-tight: -0.02em
    character-snug: -0.015em
    label: 0.01em

  semanticRoles:
    character-xl-lg-md: character + regular + character-tight
    character-sm: character + regular + character-snug
    display-lg-md: interface + semibold
    title: interface + semibold
    body-lg-md-sm: interface + regular
    label: caption + interface + medium + label
    numeric: caption + interface + medium + tabular nums

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

This document defines visual rules that apply across features and screens.

It does not define product capabilities, screen contents, application states, data contracts, command behavior, source-code structure, or implementation architecture.

A feature addition does not require this document to change unless it introduces a visual rule intended for reuse across multiple features or screens.

## Overview

The interface uses the composition of a monochrome type specimen displayed on a black screen:

- grayscale fields provide the permanent structure;
- alignment and distance separate content groups;
- unoccupied regions remain empty after required content has been placed;
- typography and visible media carry more visual weight than containers;
- chromatic color appears only as localized reflected light from a visible image or as a semantic status color.

The interface does not use a permanent chromatic brand accent.

The product supports one palette: dark. The operating-system light or dark preference does not replace this palette. Forced-color, contrast, motion, and display-scaling preferences remain independent from palette selection.

## Colors

### Permanent palette

`canvas`, surfaces, borders, text, controls, and focus indicators use grayscale tokens. The red, green, and blue channel values of each permanent grayscale token are equal.

Use the tokens by role:

- `canvas` is the lowest permanent layer.
- `surface` separates a persistent region from `canvas`.
- `surface-raised` identifies content temporarily placed above the current layer.
- `surface-hover` identifies pointer hover without changing geometry.
- `surface-pressed` identifies active pointer or keyboard press without changing geometry.
- `border-subtle` separates adjacent dark surfaces.
- `border-control` outlines controls whose boundary is otherwise not visible.
- `text-primary` carries the highest text contrast.
- `text-secondary` carries supporting text that remains continuously readable.
- `text-muted` carries metadata that is not required to identify the current task.
- `text-disabled` is used only when an element cannot be operated.
- `focus-ring` identifies keyboard focus.

Do not substitute raw color values for these roles.

### Chromatic color

Chromatic color is permitted in two cases:

1. a visible image in the same viewport supplies the hue of localized reflected light;
2. a semantic status uses a documented status token such as `error`.

Chromatic reflected light must satisfy all of the following:

- one source maximum per viewport;
- opacity from 6% through 10%;
- saturation no greater than 65%;
- coverage no greater than 30% of the content region;
- no overlap behind text required to identify an item, understand a message, or operate a control;
- no recoloring of typography, borders, or controls;
- no display when its source image is absent.

Do not use fixed chromatic gradients, gradient text, colored canvas tints, colored control glows, or a second chromatic light source.

### Contrast

- Text below 24px and text below 18.5px at weight 700 or greater must have contrast of at least 4.5:1 against its background.
- Text at least 24px, or at least 18.5px at weight 700 or greater, must have contrast of at least 3:1.
- Icons, control boundaries, and focus indicators must have contrast of at least 3:1 against adjacent colors.
- Color must not be the only visible difference between two states.

## Typography

### Font roles

- Switzer carries Latin-script interface text, changing content, labels, and numbers.
- Noto Sans JP supplies Japanese glyphs in the same roles as Switzer.
- Zodiak carries static Latin-script editorial text that does not communicate an operation, status, instruction, or changing value.

Approved font files are bundled with the application. Remote font loading is not part of this system.

### Zodiak

A Zodiak text group:

- contains one through six Latin-script words;
- occupies one or two lines;
- does not contain user-provided data, media metadata, status values, measurements, or instructions;
- uses one solid grayscale color;
- has no outline, gradient, blur, glow, or text shadow.

Zodiak must not create more than one primary typographic focal point in the visible viewport.

A primary typographic focal point is a text group using the largest typography token visible in that viewport.

A smaller Zodiak group may coexist with the primary focal point when it uses a smaller typography token and does not become the largest text group in the viewport.

### Scale and text behavior

Use the typography tokens without creating intermediate sizes.

- Use sentence case for interface text.
- Do not apply letter spacing to Japanese text or mixed Japanese–Latin content.
- Use tabular numerals for time, percentages, measurements, and values that update in place.
- Changing text must not move an unrelated content group or interactive target.
- Truncated text must preserve access to the complete value through an accessible name, description, or adjacent detail view.

## Layout

### Grid

Wide compositions use a twelve-column fluid grid.

- maximum content width: 1360px;
- column gap: 24px;
- horizontal outer padding: `clamp(24px, 5vw, 80px)`;
- vertical section spacing: 48px, 64px, 80px, or 96px;
- spacing inside a related content group: 8px, 12px, 16px, 20px, 24px, or 32px.

After content reaches 1360px, additional horizontal space remains empty. It does not increase text measure, control dimensions, surface padding, or media size.

### Negative space

Unoccupied space is assigned before decorative content is considered.

A wide composition containing one large visual object and one associated text group reserves at least one complete grid column between the two groups.

A large visual object is the single image, illustration, or visualization with the greatest displayed area in the viewport.

Do not place explanatory copy, navigation, badges, cards, gradients, or decorative symbols solely to occupy an empty region.

### Grouping

Separate content in this order:

1. distance;
2. alignment;
3. type size or weight;
4. surface luminance;
5. a 1px border;
6. a container.

Do not create a container when the first five methods communicate the grouping.

A viewport contains no more than two content groups using the largest available visual scale. Remaining groups use smaller typography, smaller image area, or lower contrast.

### Reflow

When available width decreases:

1. remove intentional empty columns;
2. reduce outer padding to 24px;
3. move adjacent groups into a vertical sequence;
4. reduce display typography to the next documented token;
5. preserve interactive target dimensions.

Do not scale an entire composition with a transform. Do not reduce body text below 13px.

## Elevation & Depth

### Layer order

Use no more than four simultaneous depth levels:

1. `canvas`;
2. `surface`;
3. `surface-raised`;
4. a modal or system-owned overlay.

Persistent regions use solid backgrounds. Backdrop blur is restricted to temporary menus, popovers, and dialogs.

### Borders and shadows

Use a 1px border before adding a shadow.

Permitted shadows:

```css
/* Large visible media */
box-shadow: 0 24px 80px rgb(0 0 0 / 32%);

/* Temporary raised surface */
box-shadow: 0 16px 48px rgb(0 0 0 / 45%);
```

Do not apply shadows to every row, action, or content group.

### Light

A light effect must have a visible source in the same viewport. The light remains adjacent to that source and follows the chromatic limits in the Colors section.

Light does not pulse, rotate, travel across the viewport, or animate while the source remains unchanged.

Typography remains flat. Do not apply emissive effects to Zodiak, Switzer, or Noto Sans JP.

The Album Detail title is the sole media-identity exception that may use the character face; the
album artist, metadata, controls, and track information use the interface face. Album artwork is
foreground media only; it does not create a persistent background or propagated accent on controls,
text, borders, or actions.

## Shapes

Use the radius tokens by visual role:

- `none`: viewport-level regions and edge-attached persistent surfaces;
- `control`: interactive targets and compact notices;
- `surface`: menus, popovers, dialogs, and temporary raised groups;
- `media`: images and visualizations;
- `full`: circular targets and states whose geometry requires a circle.

Primary text actions use the `surface` radius. A pill shape is reserved for binary selection, compact status, or controls whose semantic shape is explicitly pill-like.

Do not apply the same radius to every element. Do not combine a large radius, chromatic glow, gradient, backdrop blur, and shadow on one element.

## Components

Component entries in the YAML define reusable visual archetypes, not product features.

### Filled action

- A related action group contains no more than one filled action.
- It uses `action-filled` at rest.
- Hover uses `action-filled-hover`; pressed uses `action-filled-pressed`; its foreground uses `action-filled-foreground` in every state.
- Its fill remains grayscale.
- It does not receive a permanent glow.

### Neutral action

- It uses `action-neutral` at rest.
- Hover uses `action-neutral-hover`.
- Pressed uses `action-neutral-pressed`.
- Hover and pressed states do not change width, height, alignment, or surrounding layout.

### Raised surface

- It uses `surface-raised`.
- It appears above an existing view and is removed when its task ends.
- A persistent page region must not use this archetype solely to appear elevated.

### Error notice

- It uses `notice-error`.
- Error color occupies a border, icon, or compact surface area rather than the full viewport.
- The notice does not remove, resize, or reposition unrelated content.

## Interaction States

These states apply to interactive elements regardless of feature.

### Rest

Use the component's base tokens. Do not add animation while the element remains at rest.

### Hover

Change background or border color only. Do not move, rotate, resize, or raise the element.

### Pressed

Use `surface-pressed`. A scale reduction of no more than 2% is permitted for a direct pointer press. Remove the scale change when reduced motion is active.

### Focus-visible

Use a 2px `focus-ring` outline with a 2px offset. The indicator remains visible against every adjacent surface and is not replaced by hover styling.

### Selected

Use at least two visible differences from rest. One difference may be color or luminance. The second difference must be shape, border, icon, text weight, or position of a non-layout-affecting marker.

### Current / active

Use this for the destination or application state currently being displayed. It is distinct from a selected item in a collection and must use the same two-difference rule as selected state. Keyboard focus identifies location only; it never supplies current state by itself.

### Playing

Use this only for the authoritative playback identity. It remains distinct from selected and current state, and must not be inferred from keyboard focus.

### Disabled

Use `text-disabled` for foreground content. Preserve the element's outer dimensions. Do not communicate disabled state by opacity alone.

### Loading

Preserve the element's outer width and height. Do not replace an entire view with a centered progress indicator when existing content can remain visible.

### Error

Use `error` only in the affected region. Preserve unrelated content and its position.

### Range controls

Range controls use separate unfilled and filled tracks with a 4px visible track and a 16px thumb inside a minimum 40px interactive surface. The native range remains semantic. Fill and thumb share one visual progress source: pointer tracking uses `feedback` settling, while non-pointer value changes use `state` settling and interface easing. Hover, focus, press, and drag feedback use `feedback` timing independently of position motion and do not change control geometry.

An explicitly muted Volume control keeps its stored non-zero position while its fill and thumb use the subdued treatment over state timing. The Volume icon changes only between `silent`, `low`, and `high` presentation states. Audible waves remain independent from the cancellation slash; normal motion contracts waves while expanding the slash. Reduced motion uses final-state groups with an opacity-only crossfade limited to 120ms.

## Motion

```yaml
motion:
  feedback: 160ms
  state: 220ms
  content: 320ms
  image: 600ms
  reduced: 120ms
  easing: cubic-bezier(0.22, 1, 0.36, 1)
```

Use motion only when a visible element changes state, appears, disappears, or is replaced.

- Hover, focus, and pressed feedback use `feedback`.
- State-indicator changes use `state`.
- Text-group and region replacement use `content`.
- Main-region transitions may use restrained opacity and translation; persistent navigation and playback surfaces remain stable.
- Visible-image replacement uses `image`.
- Image replacement uses `image`; reflected-light changes follow the timing of the element they belong to.
- Nothing bounces or overshoots.
- Idle elements do not animate.
- Animate opacity and transform before layout dimensions or filter values.
- Reflected-light changes animate opacity only; blur and saturation remain constant during the transition.

When reduced motion is active:

- remove translation, scale, rotation, and morphing;
- limit opacity transitions to 120ms;
- preserve focus, selected, loading, and error distinctions.

Raised modal surfaces remain visually distinct from the canvas. Their reduced-motion equivalent is opacity only.

## Accessibility

- Interactive targets are at least 40×40px. A single highest-emphasis target in a group may use 48×48px or larger.
- Focus-visible follows the Interaction States section.
- Text and non-text contrast follow the Colors section.
- Meaning does not depend on color, light, animation, or media imagery.
- Content remains usable at Windows display scaling of 100%, 125%, 150%, and 200%.
- At each scaling level, text does not clip, interactive targets do not overlap, and focus indicators remain visible.
- Forced-color mode uses system colors for text, borders, backgrounds, and focus indicators.
- Reduced-motion behavior follows the Motion section.
- Decorative SVGs and light layers are excluded from the accessibility tree.
- Changing content does not move keyboard focus unless the user initiates navigation to another view or dialog.

## Do's and Don'ts

### Do

- Keep permanent surfaces, typography, borders, and controls grayscale.
- Leave unused regions empty after required content is placed.
- Use one visible source for chromatic reflected light.
- Use distance and alignment before adding a container.
- Keep one primary typographic focal point per viewport.
- Keep persistent regions solid and temporary overlays visually distinct.
- Preserve dimensions when content enters loading, disabled, or error states.

### Don't

- Do not add a hero card, marketing headline, supporting subtitle, feature badge, or call-to-action cluster by default.
- Do not place every content group inside a rounded surface.
- Do not introduce a permanent chromatic accent.
- Do not add chromatic gradients or multiple colored glows.
- Do not use Zodiak for changing data, controls, statuses, measurements, or instructions.
- Do not center every content group or align every group to one shared edge.
- Do not fill unoccupied space with decorative content.
- Do not blur persistent surfaces.
- Do not animate while the interface is idle.
- Do not add feature names, application-state names, command names, source-code identifiers, or issue numbers to this document.
