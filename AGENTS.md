# AGENTS.md

## Purpose and Authority

This file defines local implementation and contribution rules for this repository.

Do not duplicate a source-of-truth rule elsewhere.

## Source Documents

Read the current GitHub Issue and the documentation relevant to the change.

- [docs/requirements.md](./docs/requirements.md) — accepted product behavior.
- [DESIGN.md](./DESIGN.md) — visual and interaction rules.
- [docs/architecture.md](./docs/architecture.md) — system structure and boundaries.
- [PHILOSOPHY.md](./PHILOSOPHY.md) — development principles.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution workflow.

If source documents, repository instructions, or user requirements conflict, do not infer a precedence or choose an interpretation. Stop the affected work and report the exact conflict, the documents or instructions involved, and the decision required before continuing.

## General Engineering Rules

- Do not treat a prompt as an unquestionable source of truth. When a claim or implementation detail matters, verify it against the relevant documentation or other authoritative source before relying on it.
- Unsupported speculation is prohibited. If the available evidence is insufficient, state the uncertainty and investigate further instead of presenting an assumption as fact.
- Do not weaken type checking, linting, tests, security, accessibility, or performance constraints to make a change pass.
- Do not manually edit generated files.

## Changes and Generated Files

- New or changed product-visible behavior MUST include automated coverage in the same change.
- Generated files MUST be changed only by their owning generator or build command.
- Keep each change focused on one logical responsibility.

## Angular

See the [Angular style guide](https://angular.dev/style-guide).

### Components

- Always use standalone components over NgModules.
- Do not set `standalone: true` inside Angular decorators; it is the default in Angular v20+.
- Do not set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly; OnPush is the default in Angular v22+.
- Keep components small and focused on a single responsibility.
- Use `input()` and `output()` functions instead of decorators.
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`.
- Prefer inline templates for small components.
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation.
- When not using Signal Forms, prefer Reactive Forms over template-driven forms.
- When using external templates or styles, use paths relative to the component TypeScript file.

### State Management

- Use signals for local component state.
- Use `computed()` for derived state.
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized.
- Keep state transformations pure and predictable.
- Do not use `mutate` on signals; use `update` or `set` instead.

### Templates

- Keep templates simple and avoid complex logic.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`.
- Use the async pipe to handle observables.
- Do not assume globals such as `new Date()` are available in templates.
- Do not use `ngClass`; use `class` bindings instead.
- Do not use `ngStyle`; use `style` bindings instead.
- Do not import `CommonModule`; import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`.
- Use `NgOptimizedImage` for all static images. `NgOptimizedImage` does not work for inline base64 images.

### Services

- Design services around a single responsibility.
- Use the `providedIn: 'root'` option for singleton services.
- Use the `@Service` decorator for ordinary root-provided singleton services.
- Use `@Injectable()` when constructor injection, advanced provider configuration, or another `providedIn` scope is required.
- Use route or component providers when lifetime should be scoped to that route or component.
- Use the `inject()` function instead of constructor injection.

### Routing

- Implement lazy loading for feature routes.
- Routed destinations MUST use Angular Router as their authoritative state.

## Renderer Boundaries

- Renderer code under `src/**` MUST NOT import `electron`, `node:*`, or repository files under `electron/**`.
- Renderer access to native/backend capabilities MUST go through the shared native API contract.
- Direct DOM mutation is prohibited. DOM structure and content MUST be expressed through Angular templates and bindings.

## Design System

### Tokens

- Product design tokens MUST be declared in `src/styles/theme.css`, except motion duration and easing tokens, which MUST be declared in `src/app/core/motion/motion-tokens.ts`.
- Literal color values MUST NOT appear outside `src/styles/theme.css`.
- Reusable colors, typography, radii, shadows, spacing values, and responsive breakpoints MUST use a named token from `src/styles/theme.css`.

### Motion

- Reusable motion durations and easing curves MUST use a named token from `src/app/core/motion/motion-tokens.ts`.
- All time-based visual motion MUST go through `src/app/core/motion`; features and shell code MUST NOT depend directly on GSAP or browser animation APIs.
- `!important` is prohibited.

## Accessibility

- The application MUST pass all AXE checks.
- The application MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.
- Keyboard focus MUST remain visible and distinct from hover and selection.
- Color and motion MUST NOT be the only indication of meaningful state.

## Tailwind CSS

- Every Tailwind utility name MUST appear completely and statically in source. Utility names MUST NOT be constructed by interpolation or string concatenation.
- A named Tailwind utility MUST be used when it represents the required value. An arbitrary value MAY be used only when no equivalent named utility exists and the value is component-specific geometry.
- Two utilities that write the same CSS property MUST NOT be applied in the same variant. Overrides across different responsive, pseudo-class, ARIA, or `data-*` variants are allowed.
- If a visual state is already represented by a native state, an ARIA attribute, or a `data-*` attribute, its styling MUST use the corresponding Tailwind variant. An Angular class binding MUST NOT be created only to duplicate that state for styling.
- Repeated application markup with the same structure, styling, and behavior MUST have exactly one implementation. Render repeated data with Angular control flow; extract repeated interactive or semantic UI into a focused Angular component.
- A repeated Tailwind class list MUST NOT be copied between templates or component host metadata. First determine whether the repeated code represents a shared component responsibility, a shared layout contract, or a reusable design token; then consolidate it at that owner.
- Tailwind class strings MUST NOT be moved into a constant, helper, directive, or `@apply` rule solely to hide duplicated text. Such an abstraction is allowed only when it owns behavior, semantics, or a documented styling contract used by more than one consumer.
- A component extraction MUST preserve the replaced element's DOM semantics, accessibility attributes, sizing, placement, responsive behavior, and state variants. The component host MUST carry layout responsibilities that belonged to the replaced direct child.
- Do NOT deduplicate one-off geometry or markup that only looks similar but has a different owner, lifecycle, semantic role, or responsive contract. Similarity alone is not sufficient grounds for abstraction.
- When two implementations differ only by content, state, or configuration, use typed data and complete static class variants rather than separate copies or dynamically constructed class names.
- Tailwind class ordering MUST be produced by `prettier-plugin-tailwindcss`. Class order MUST NOT be maintained manually.
- Unit tests MUST assert semantic behavior and MUST NOT assert Tailwind class names as implementation details.

## Verification

The canonical command definitions are in `package.json`.

Detailed contributor workflow is documented in [CONTRIBUTING.md](./CONTRIBUTING.md#local-verification).

- Use `pnpm verify` for consistency checks and tests.
- Use `pnpm validate` for checks, tests, and all production builds.
- Use `pnpm format` to write formatting changes.
- Use `pnpm format:check` to check formatting without modifying files.
- Use `pnpm fonts:download` to acquire and verify the official Fontshare asset.
- ESLint, Stylelint, TypeScript, Angular compiler, Prettier, and test failures MUST be fixed at their cause. Their checks MUST NOT be disabled, suppressed, or weakened to make a change pass.

## Git and GitHub

- Git and GitHub writes require an explicit user request.
- Choose GitHub connector first.
- Follow [CONTRIBUTING.md](./CONTRIBUTING.md).
