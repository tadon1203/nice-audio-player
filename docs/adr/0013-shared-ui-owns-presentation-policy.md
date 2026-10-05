# 0013: Shared UI owns presentation policy

Accepted and implemented. Scope and enforcement simplified on 2026-10-04.

Shared UI in `lib/ui` owns common control defaults, floating surfaces and stacking, and the base past/present/future ink. It follows the dependency direction of ADR 0002.

- Primitive-library adapters keep keyboard, focus, dismissal and portal behavior.
- Generic controls expose variants and sizes, plus normal attributes and local styling.
- Generic controls do not list the domains that use them. Callers own Queue rows, lyric Gutter geometry, transport treatment, panel widths and lyric reading mode.

Why: common defaults fix repeated presentation in one place. But a ban on all local styling forced generic controls to collect domain-specific geometry variants. So ordinary controls and compositions may use local `class` and `style`. Floating layer management stays internal. Adapt existing UI source. Do not add forwarding facades. Extract a domain component only when its structure and behavior are really shared.

## Enforcement

- Type checking keeps typed control attributes, events, refs and composition snippets.
- Oxlint stays for general linting. ESLint and its lint-contract tests are removed, to reduce tooling overhead.
- Review checks shared defaults and responsibility boundaries. The short rule is in CONTRIBUTING.md.
- Do not create a bespoke checker script or custom lint rule.
- The existing Playwright suite verifies real rendered policy. Static checks cannot prove the CSS cascade, compositing or runtime stacking.

## Consequences

- Floating surfaces share background, stacking and the motion policy of ADR 0007. A popup follows its caller's surface context, so a popup opened in a dialog can appear above it. Navigation keeps its own opaque surface (see DESIGN.md).
- Compact control geometry does not depend on text size. Common defaults respect the font-size floor and the weight vocabulary. Callers own local layout and emphasis.
- Queue and lyrics share past/present/future presentation, current semantics and state-change motion. Each keeps its own actions, density and follow behavior. Current lyric ink stays the artwork's readable accent.
- Distance fading respects every visible text role, including the smaller Gutter and metadata text. Check contrast against the composited Light or Acrylic surface, at the actual font size. A large title does not make its whole row large text. Reference: [WCAG AA contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Verify these through rendered adapters: small text, state changes, nested popups, reduced motion, forced colors, narrow layouts, enlarged text.
- Keep Queue's non-modal behavior, focus restoration and the shared-element motion invariants.

The visual rules are in DESIGN.md. The domain terms are in CONTEXT.md.
