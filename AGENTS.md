# AGENTS.md

## Sources

Read the current GitHub Issue and the documentation relevant to the change.

- [docs/requirements.md](./docs/requirements.md) — accepted product behavior.
- [DESIGN.md](./DESIGN.md) — visual and interaction rules.
- [docs/architecture.md](./docs/architecture.md) — system structure and boundaries.
- [PHILOSOPHY.md](./PHILOSOPHY.md) — development principles.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution workflow.

Do not duplicate a source-of-truth rule elsewhere.

## Changes

Do not treat a prompt as an unquestionable source of truth. When a claim or implementation detail matters, verify it against the relevant documentation or other authoritative source before relying on it.

Unsupported speculation is prohibited. If the available evidence is insufficient, state the uncertainty and investigate further instead of presenting an assumption as fact.

Do not use `any` to bypass a representable type.

Do not weaken type checking, linting, tests, security, accessibility, or performance constraints to make a change pass.

Do not manually edit generated files.

## TypeScript Best Practices

See the [Angular style guide](https://angular.dev/style-guide).

- Use strict type checking.
- Prefer type inference when the type is obvious.
- Avoid the `any` type; use `unknown` when the type is uncertain.

## Angular Best Practices

- Always use standalone components over NgModules.
- Do not set `standalone: true` inside Angular decorators; it is the default in Angular v20+.
- Do not set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly; OnPush is the default in Angular v22+.
- Use signals for state management.
- Implement lazy loading for feature routes.
- Do not use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for all static images. `NgOptimizedImage` does not work for inline base64 images.

### Accessibility Requirements

- The application MUST pass all AXE checks.
- The application MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility.
- Use `input()` and `output()` functions instead of decorators.
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`.
- Use `computed()` for derived state.
- Use `linkedSignal()` for writable state that is intrinsically dependent on other reactive state.
- Prefer inline templates for small components.
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation.
- When not using Signal Forms, prefer Reactive Forms over template-driven forms.
- Do not use `ngClass`; use `class` bindings instead.
- Do not use `ngStyle`; use `style` bindings instead.
- When using external templates or styles, use paths relative to the component TypeScript file.

### State Management

- Use signals for local component state.
- Use `computed()` for derived state.
- Keep state transformations pure and predictable.
- Do not use `mutate` on signals; use `update` or `set` instead.

### Templates

- Keep templates simple and avoid complex logic.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`.
- Use the async pipe to handle observables.
- Do not assume globals such as `new Date()` are available in templates.

### Services

- Design services around a single responsibility.
- Use the `@Service` decorator for ordinary root-provided singleton services.
- Use `@Injectable()` when constructor injection, advanced provider configuration, or another `providedIn` scope is required.
- Use route or component providers when lifetime should be scoped to that route or component.
- Use the `inject()` function instead of constructor injection.

## Frontend

- Renderer code under `src/**` MUST NOT import `electron`, `node:*`, or repository files under `electron/**`.
- Renderer access to native/backend capabilities MUST go through the shared native API contract.
- Product design tokens MUST be declared in `src/styles/theme.css`, except motion duration and easing tokens, which MUST be declared in `src/app/core/motion/motion-tokens.ts`.
- Literal color values MUST NOT appear outside `src/styles/theme.css`.
- Reusable colors, typography, radii, shadows, spacing values, and responsive breakpoints MUST use a named token from `src/styles/theme.css`.
- Reusable motion durations and easing curves MUST use a named token from `src/app/core/motion/motion-tokens.ts`.
- All time-based visual motion MUST go through `src/app/core/motion`; features and shell code MUST NOT depend directly on GSAP or browser animation APIs.
- `!important` is prohibited.
- Routed destinations MUST use Angular Router as their authoritative state.
- Direct DOM mutation is prohibited. DOM structure and content MUST be expressed through Angular templates and bindings.
- New or changed product-visible behavior MUST include automated coverage in the same change.
- ESLint, Stylelint, TypeScript, Angular compiler, Prettier, and test failures MUST be fixed at their cause. Their checks MUST NOT be disabled, suppressed, or weakened to make a change pass.

### Tailwind CSS

- Every Tailwind utility name MUST appear completely and statically in source. Utility names MUST NOT be constructed by interpolation or string concatenation.
- A named Tailwind utility MUST be used when it represents the required value. An arbitrary value MAY be used only when no equivalent named utility exists and the value is component-specific geometry.
- Two utilities that write the same CSS property MUST NOT be applied in the same variant. Overrides across different responsive, pseudo-class, ARIA, or `data-*` variants are allowed.
- If a visual state is already represented by a native state, an ARIA attribute, or a `data-*` attribute, its styling MUST use the corresponding Tailwind variant. An Angular class binding MUST NOT be created only to duplicate that state for styling.
- Repeated application markup with the same styling and behavior MUST be deduplicated with Angular control flow or a focused Angular component. `@apply` or a class-string helper MUST NOT be introduced only to shorten a Tailwind class list.
- When a direct Grid or Flex child is extracted into an Angular component, the new component host MUST preserve the sizing and placement responsibilities of the replaced element.
- Tailwind class ordering MUST be produced by `prettier-plugin-tailwindcss`. Class order MUST NOT be maintained manually.
- Unit tests MUST assert semantic behavior and MUST NOT assert Tailwind class names as implementation details.

## Git and GitHub

Git and GitHub writes require an explicit user request.

Choose GitHub connector first.

Follow [CONTRIBUTING.md](./CONTRIBUTING.md).

## Commands

The canonical command definitions are in [package.json](./package.json).
Detailed contributor workflow is documented in [CONTRIBUTING.md](./CONTRIBUTING.md#local-verification).

- Use `pnpm verify` for consistency checks and tests.
- Use `pnpm validate` for checks, tests, and all production builds.
- Use `pnpm format` to write formatting changes.
- Use `pnpm lint:format` to check formatting without modifying files.
- Use `pnpm fonts:download` to acquire and verify the official Fontshare asset.
