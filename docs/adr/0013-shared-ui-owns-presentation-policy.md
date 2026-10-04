# 0013: Shared UI owns presentation policy

Accepted and implemented; scope and enforcement simplified on 2026-10-04.

Shared UI in `lib/ui` owns common control defaults, floating surfaces and stacking, and base
past/present/future ink, within ADR 0002's dependency direction. Primitive-library adapters
retain keyboard, focus, dismissal and portal behavior. Generic controls expose variants and
sizes, plus normal attributes and local styling. They do not enumerate the domains that use
them: Queue rows, lyric Gutter geometry, transport treatment, panel widths and lyric reading
mode belong to their callers.

Why: common defaults correct repeated presentation in one place, but banning all styling
forced generic controls to accumulate domain-specific geometry variants. Allow local
`class`/`style` for ordinary controls and composition; keep floating layer management internal.
Adapt existing UI source rather than adding forwarding facades, and extract domain components
only when their structure and behavior are actually shared.

Type checking preserves typed control attributes, events, refs and composition snippets.
Keep Oxlint for general linting. Review checks shared defaults and responsibility boundaries;
the concise rule lives in CONTRIBUTING.md. ESLint and its
dedicated lint-contract tests were removed to reduce tooling overhead. Ordinary content and
layout markup remain local. Do not create a bespoke checker script or custom lint rule.
Ordinary tests in the existing Playwright suite
verify real rendered policy; static checks alone do not prove the CSS cascade, compositing
or runtime stacking.

## Consequences

- Floating surfaces share background, stacking and ADR 0007 motion policy. Popups follow
  their caller's surface context so a popup opened within a dialog can appear above it.
  Navigation retains its own opaque surface, as defined in DESIGN.md.
- Compact control geometry is independent of text size. Common defaults respect the font-size
  floor and weight vocabulary; callers own their local layout and emphasis.
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
