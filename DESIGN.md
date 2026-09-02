# DESIGN.md

---

## name: Nice Audio Player

This document describes how Nice Audio Player looks, feels, and behaves.

## Overview

Nice Audio Player is a dark, artwork-led desktop music player designed for long listening sessions.

It resembles a carefully typeset music-library interface displayed on a nearly black desktop surface: album artwork is the primary visual object, typography carries hierarchy, controls stay quiet until needed, and unused space is allowed to remain empty.

The interface is monochrome outside the music itself. Artwork provides visual richness; application chrome does not compete with it.

Apple's human-interface work is a reference for interaction quality and spatial continuity, not for visual styling. Nice Audio Player does not imitate macOS, current Apple materials, or another product's surface appearance.

## Colors

```yaml
colors:
  canvas: "#050505"
  surface: "#0C0C0C"
  surface-raised: "#121212"
  surface-hover: "#181818"
  surface-pressed: "#202020"
  border-subtle: "#2A2A2A"
  text-primary: "#F4F4F4"
  text-secondary: "#A5A5A5"
  text-muted: "#7A7A7A"
  focus-ring: "#FFFFFF"
  error: "#FF5C68"
```

The permanent interface is grayscale.

`canvas` is the application background. Persistent and raised surfaces differ through luminance rather than decorative effects.

Chromatic color is reserved for semantic state such as errors. Artwork does not tint persistent controls, text, borders, or surfaces.

## Typography

```yaml
typography:
  latin: "Satoshi"
  japanese: "Noto Sans JP"
```

Satoshi is the Latin typeface. Noto Sans JP is used for Japanese text.

Mixed Japanese and Latin text uses Noto Sans JP as one coherent typographic group.

Hierarchy comes from size, weight, spacing, and placement rather than additional type families.

## Layout

```yaml
layout:
  content-max: 1360px
  columns: 12
  column-gap: 24px
  horizontal-padding: "clamp(24px, 5vw, 80px)"
```

Artwork, typography, alignment, and distance establish the composition before containers do.

Wide layouts use the shared content measure and grid. Additional width may remain empty rather than stretching content to fill the window.

Responsive layouts rearrange the composition instead of scaling the whole interface. Semantic order and navigation relationships remain the same when the geometry changes.

## Surfaces

The application uses a small number of visually distinct layers:

- the application canvas;
- persistent application surfaces;
- temporary raised surfaces;
- modal or system overlays.

Depth represents actual layering. Persistent surfaces do not use blur, glass, glow, or decorative shadows.

Borders appear only when space and luminance are insufficient to communicate a meaningful boundary.

Rounded shapes follow the object rather than acting as a universal style. Edge-attached application surfaces remain square; compact controls and temporary surfaces may be rounded.

## Interaction

Controls remain visually quiet at rest.

Hover and press change luminance or another local visual state without moving surrounding layout.

Direct manipulation such as seeking, volume changes, and scrolling follows the user's input immediately.

Keyboard focus is clearly visible and remains distinct from hover and selection.

Temporary UI uses maintained interaction primitives for keyboard behavior, focus management, dismissal, and accessibility.

## Navigation and Motion

The interface behaves as one continuous spatial environment.

Moving from a parent to a child preserves their perceived relationship. Returning reverses that relationship.

When the same semantic object appears before and after a transition, it remains visually traceable rather than disappearing and reappearing as an unrelated object.

Layout movement may animate, but text, artwork, and controls do not visibly stretch or deform to explain that movement.

A new valid interaction may interrupt an active transition.

Direct manipulation does not use settling motion.

Motion is supplementary. Navigation, state, hierarchy, and feedback remain understandable when motion is reduced or absent.

## Accessibility

Text and controls maintain sufficient contrast against adjacent surfaces.

Color and motion are never the only indication of meaningful state.

Keyboard navigation and visible focus are supported throughout the interface.

The interface remains usable with reduced motion, forced colors, text enlargement, and Windows display scaling at 100%, 125%, 150%, and 200%.

## Do's and Don'ts

- **Do** let artwork be the strongest source of color and visual complexity.
- **Do** allow unused space to remain empty.
- **Do** preserve object identity and spatial direction during navigation.
- **Do** use spacing, alignment, and typography before adding containers.
- **Don't** add gradients, glow, decorative shadows, or glass materials to permanent application chrome.
- **Don't** tint the application from album artwork.
- **Don't** animate direct manipulation with spring or settling behavior.
- **Don't** add visual decoration merely to occupy empty space.
