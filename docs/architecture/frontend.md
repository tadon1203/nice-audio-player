# Frontend Architecture Contract

This document defines the implementation boundaries for React, CSS, Base UI, and browser behavior.
Product rationale and visual intent belong in `DESIGN.md`.

## Ownership

- CSS owns final responsive geometry, visual styling, and non-spatial effects.
- React owns domain state, semantic navigation, data orchestration, and feature-specific focus intent.
- Repository-owned shadcn/Base UI primitives own reusable dialog, menu, tabs, slider, checkbox, tooltip,
  and toggle keyboard, focus, pointer, and ARIA semantics.
- `src/components/ui` is the project-owned modified shadcn source layer: preserve upstream anatomy,
  public APIs, and `data-slot` state attributes; adapt visual classes to DESIGN tokens; keep domain
  state and feature orchestration outside primitives. Feature code consumes these public components
  and never imports Base UI internals directly.
- `src/components/ui` primitives own their interaction geometry. Feature stylesheets do not reach into
  primitive internals or hidden inputs; Popup placement belongs to Base UI Positioner, slider value
  geometry belongs to Base UI Slider, and button sizing belongs to the Button variant.
- The browser owns native scrolling and native form semantics.

No two layers may determine the same visible geometry or interaction lifecycle.

## Responsive layout

- Application composition uses viewport media queries; reusable feature composition uses container queries.
- JavaScript may observe a viewport breakpoint only when semantic behavior requires it, such as `inert`,
  `aria-hidden`, or focus management.
- Viewport observation must not determine Grid tracks, element sizes, or transform coordinates.
- Breakpoint changes snap to CSS endpoint geometry without correction state or structural transitions.

## Interaction and accessibility

- Logical presence changes immediately through normal conditional rendering.
- Focus follows the semantic action or navigation event and never waits for a visual lifecycle.
- Direct manipulation is immediate; native range controls remain the semantic control.
- Reduced-motion preference is observed only for accessibility behavior such as choosing instant scrolling.
- A visual effect is optional and never the only indication of selected, current, playing, loading,
  disabled, or error state.

## Enforcement

- `pnpm lint` rejects Motion imports and direct Base UI imports outside `src/components/ui`.
- `pnpm frontend:architecture:check` rejects layout-correction attributes, transform overrides, and
  authored structural geometry transitions, feature CSS selectors that reach into slider internals,
  and Dock transport offset rules.
- Browser tests assert final geometry, overflow, focus, ARIA, `inert`, keyboard behavior, and media
  lifecycle rather than intermediate frames.

Exceptions require a documented owner, a current interaction reason, and a regression test.
