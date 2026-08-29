# Frontend Architecture Contract

This document defines the implementation boundaries for React, CSS, Motion, and browser scrolling.
Product rationale and visual intent belong in `DESIGN.md`; this document states the rules that code and
tests must enforce.

## Ownership

- CSS owns final responsive geometry, including viewport and container-query results.
- React owns semantic state, navigation, focus, ARIA state, and temporary interaction state.
- Motion owns only approved visual presence, shared semantic identity, and causally meaningful movement
  between valid endpoint geometries.
- Native browser scrolling owns wheel, touch, scrollbar, and keyboard viewport movement.

No two layers may determine the same visible geometry.

## Responsive layout

- Application composition uses viewport media queries; reusable feature composition uses container queries.
- JavaScript may observe a viewport breakpoint only when semantic behavior requires it, such as `inert`,
  `aria-hidden`, or focus management.
- A viewport observation must not determine Grid tracks, element sizes, transform coordinates, or a Motion
  layout state.
- Resize and breakpoint changes are corrections, not navigation. They snap to final geometry and do not
  inherit an active layout projection.

## Motion policy

- `AnimatePresence` belongs to the component that owns a subtree's mount/remove lifetime.
- `layoutId` is allowed only when both elements represent the same semantic object; its owner also owns
  the projection box, clipping, and radius.
- `layout` is not a general responsive-layout mechanism and requires an explicitly approved use case.
- Direct manipulation never waits for spatial animation. Width, height, Grid tracks, gaps, margins, and
  padding are not time-interpolated.
- Reduced motion removes spatial translation, scale, rotation, layout projection, and icon morphing while
  preserving state, focus, and causality.

## Presence and accessibility

- Logical presence changes immediately. A visually exiting subtree becomes inert, hidden from the
  accessibility tree, and non-interactive at exit start.
- Focus follows the semantic action or navigation event, never animation completion.
- A transition is optional and must not be the only indication of selected, current, playing, loading,
  disabled, or error state.

## Enforcement

- `pnpm lint` rejects unapproved direct Motion imports, direct viewport observation, and JSX `layout` use.
- The direct-import allowlist is maintained in `eslint.config.js`; adding an owner requires a contract
  rationale and a regression test in the same change.
- `pnpm frontend:architecture:check` rejects layout-correction attributes and transform `!important`
  overrides.
- Browser tests assert final geometry, overflow, focus, ARIA, `inert`, and reduced-motion behavior rather
  than implementation-only correction flags.

Exceptions require a documented owner, a reason tied to a current interaction, and a regression test.
