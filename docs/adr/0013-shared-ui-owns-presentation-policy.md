# 0013: Shared UI owns presentation policy

Accepted and implemented; enforcement simplified on 2026-10-04.

Floating surfaces, typography and controls, and time-state presentation are owned by deep
modules in `lib/ui`, within ADR 0002's dependency direction. Existing primitive-library
adapters retain their keyboard, focus, dismissal and portal behavior. The module's interface
offers purpose, density and geometry choices rather than arbitrary `class` or `style`
overrides; adapters and exports that bypass that policy stay internal. Callers retain their
domain behavior and layout. This improves locality by concentrating policy and leverage by
applying one implementation across the existing adapters.

Why: shared defaults alone do not enforce consistency when every caller can overwrite them.
Independent popup styling, caller repairs to small text, and different definitions of past
Queue ink already demonstrate the cost. Sealing the presentation seam requires migrating
callers and accepting fewer ad-hoc styling options, in exchange for checking the same small
interface callers use. Keep the existing domain folders and adapt the existing UI source;
avoid a second forwarding facade or a single generic module for every kind of row.

Type checking rejects styling props, including typed spreads, while preserving typed control
attributes, events, refs and composition snippets. Keep Oxlint for general linting. Review
checks that private adapters stay internal and ordinary native controls outside their UI
owners use shared controls; the concise rule lives in CONTRIBUTING.md. ESLint and its
dedicated lint-contract tests were removed to reduce tooling overhead. Ordinary content and
layout markup remain local. Do not create a bespoke checker script or custom lint rule.
Ordinary tests in the existing Playwright suite
verify real rendered policy; static checks alone do not prove the CSS cascade, compositing
or runtime stacking.

## Consequences

- Floating surfaces share background, stacking and ADR 0007 motion policy. Popups follow
  their caller's surface context so a popup opened within a dialog can appear above it.
  Navigation retains its own opaque surface, as defined in DESIGN.md.
- Compact control geometry is independent of text size. Allowed type roles own font size
  and weight; callers need no corrective typography classes.
- Queue and lyrics share past/present/future presentation, current semantics and state-change
  motion. They retain their own actions, density, anchor-follow and free-reading behavior;
  current lyric ink remains the artwork's readable accent.
- Distance fading respects every visible text role, including smaller Gutter and metadata
  text. Verify contrast against the composited Light or Acrylic surface at the actual font
  size, rather than assuming a large title makes its whole row large text. The reference is
  [WCAG AA contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Verify small text, state changes, nested popups, reduced motion, forced colors, narrow
  layouts and enlarged text through rendered adapters. Preserve Queue's non-modal behavior,
  focus restoration and the existing shared-element motion invariants.

The visual rules remain in DESIGN.md and domain terms in CONTEXT.md; this ADR records
ownership and enforcement, not another copy of those rules.
