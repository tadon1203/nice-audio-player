# Contributing

## Document responsibility

This document is the source of truth for engineering conventions, verification, and contribution, Git, and GitHub workflows. It does not define product behavior, visual design, or system architecture.

## Documentation

Every source document listed in `AGENTS.md` MUST begin with its title and a `## Document responsibility` section stating what it defines and does not define.

Keep each rule in its owning document and avoid duplication.

## Engineering rules

### General engineering

- Do not weaken type checking, linting, tests, security, accessibility, or performance constraints to make a change pass.
- Keep each change focused on one logical responsibility.
- New or changed product-visible behavior MUST include automated coverage in the same change.
- Generated files MUST be changed only by their owning generator or build command. The initial Spartan CLI output under `src/app/ui/spartan` becomes repo-owned source after generation and may then be changed manually; upstream updates require an explicit diff review and manual port.

### Angular

See the [Angular style guide](https://angular.dev/style-guide).

#### Components

- Use standalone components instead of NgModules. Do not set `standalone: true`; it is the default in Angular v20+.
- Do not set `changeDetection: ChangeDetectionStrategy.OnPush`; OnPush is the default in Angular v22+.
- Keep components focused on one responsibility.
- Use `input()` and `output()` instead of decorators.
- Use `model()` for `[(prop)]` two-way bindings instead of paired `input()` and `output()`.
- Prefer inline templates for small components.
- Prefer Signal Forms (`@angular/forms/signals`) for new forms; otherwise prefer Reactive Forms over template-driven forms.
- Use paths relative to the component TypeScript file for external templates and styles.

#### State management

- Use signals for local component state.
- Use `computed()` for derived state.
- Use `linkedSignal()` for derived state that must remain synchronized with multiple sources.
- Keep state transformations pure and predictable.
- Use `update()` or `set()` instead of `mutate`.

#### Templates

- Keep templates simple.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, and `*ngSwitch`.
- Use the async pipe for observables.
- Do not assume globals such as `new Date()` are available in templates.
- Use `class` and `style` bindings instead of `ngClass` and `ngStyle`.
- Do not import `CommonModule`; import only the directives and pipes used by the template.
- Use `NgOptimizedImage` for static images except inline base64 images.

#### Services

- Keep services focused on one responsibility.
- Use `providedIn: 'root'` for singleton services.
- Use `@Service` for ordinary root-provided singleton services.
- Use `@Injectable()` when constructor injection, advanced provider configuration, or another `providedIn` scope is required.
- Use route or component providers for scoped lifetimes.
- Use `inject()` instead of constructor injection.

#### Routing

- Lazy-load feature routes.
- Routed destinations MUST use Angular Router as their authoritative state.

### Renderer boundaries

- Renderer code under `src/**` MUST NOT import `electron`, `node:*`, or files under `electron/**`.
- Renderer access to native/backend capabilities MUST go through the shared native API contract.
- Direct DOM mutation is prohibited; use Angular templates and bindings.
- A shrinkable flex or grid item MUST use `min-w-0` at the boundary that owns the constraint.
- The component that owns overflowing content MUST own its overflow behavior; parent shells own shrink and scroll boundaries.

### Design system

#### Tokens

- Public product design tokens MUST be declared only in `src/styles/tokens/*.css`.
- `src/styles/theme.css` adapts product tokens to Nice Audio Player Tailwind utilities.
- `src/styles/spartan.css` adapts product tokens to Spartan semantic variables.
- Literal renderer colors MUST appear only in `src/styles/tokens/color.css`.
- Product code MUST NOT reference Spartan semantic CSS variables directly.
- Product templates MUST use Nice Audio Player semantic Tailwind utilities.
- Spartan Brain is the renderer's generic composite interaction primitive authority.
- Spartan Helm source under `src/app/ui/spartan` is owned and styled by Nice Audio Player after initial CLI generation.
- Feature code MUST import Spartan UI through local Helm entry points.
- Feature code MUST NOT import `@spartan-ng/brain`, `@spartan-ng/helm`, `@angular/aria`, or CDK component implementations directly.
- Native HTML and product/layout components remain appropriate when no composite UI primitive is required.
- Reusable colors, typography, radii, shadows, spacing, motion, and responsive breakpoints MUST use named tokens.

#### Motion

- Prefer CSS transitions for simple UI state changes.
- Add a complex animation library only when a concrete feature requires sequencing, FLIP, or dynamic interruption.
- `!important` is prohibited.

### Accessibility

- The application MUST pass AXE checks and meet WCAG AA requirements.
- Keyboard focus MUST remain visible and distinct from hover and selection.
- Color and motion MUST NOT be the only indication of meaningful state.

### Tailwind CSS

- Tailwind utility names MUST appear completely and statically in source; do not construct them dynamically.
- Use a named utility when one exists. Arbitrary values are allowed only for token-backed values or component-specific structural geometry.
- Reusable product values and component geometry MUST live in `src/styles/tokens/*.css`, be adapted through named utilities, and be referenced through those utilities. Structural expressions such as `minmax()`, `repeat()`, `calc()`, and `clamp()` may remain inline.
- Arbitrary variants and properties may be used for selectors and CSS properties, such as `aria-[current=page]:...` and `[scrollbar-gutter:stable]`.
- Do not apply two utilities that write the same CSS property in the same variant.
- If state already exists as native state, ARIA, or `data-*`, style it with the corresponding Tailwind variant instead of duplicating it with an Angular class binding.
- Repeated markup with the same structure, styling, and behavior MUST have one implementation. Use Angular control flow for repeated data and focused components for repeated interactive or semantic UI.
- Do not duplicate repeated Tailwind class lists. Consolidate them at the component, layout contract, or design-token owner.
- Do not move class strings into constants, helpers, directives, or `@apply` solely to hide duplication.
- Component extraction MUST preserve DOM semantics, accessibility, layout, responsive behavior, and state variants.
- Do not deduplicate one-off markup or geometry based on similarity alone.
- When implementations differ only by content, state, or configuration, use typed data and complete static class variants.
- Let `prettier-plugin-tailwindcss` order Tailwind classes.
- Unit tests MUST assert semantic behavior, not Tailwind class names.

## Workflow

- Use one Issue, one branch, and one pull request per change.
- Implementation Issues use `.github/ISSUE_TEMPLATE/task.yml`.
- Branch names use `<type>/<issue-number>-<kebab-case>`.
- Types are `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.
- PR and squash-merge titles use `<type>: <summary>`.
- Merge completed Issue work with Squash Merge only.

## Commit messages

Use Conventional Commits:

`<type>(<scope>): <imperative summary>`

The scope is optional. Use a type listed above, lowercase the summary, and omit the final period. Add a body only when the reason or trade-off is not clear, and use footers for issue references or breaking changes.

Example:

`fix(transport): reject malformed backend responses`

See the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).

## Local verification

Use the smallest verification command that covers the change:

- `pnpm check` — fast non-native static checks; no production build, E2E, or native compilation
- `pnpm test` — unit and integration tests; E2E is not included
- `pnpm test:renderer` — Renderer tests
- `pnpm test:electron` — Electron-side tests
- `pnpm test:native` — native backend tests
- `pnpm check:native` — Rust formatting and Clippy
- `pnpm test:e2e` — self-contained E2E; builds the required artifacts first
- `pnpm build` — production build
- `pnpm validate` — complete merge/CI verification gate

Run `pnpm test:e2e` when a change affects an end-to-end path, Electron/Preload or native integration, startup, routing, or behavior covered only by E2E tests. Renderer E2E uses Playwright's development server; Electron E2E uses the built renderer through `nice-player://renderer/`.

Use `pnpm format` to write formatting changes and `pnpm fonts:download` only when the bundled Fontshare asset must be acquired.

When the Rust NAPI surface changes, run `pnpm bindings:update`. `pnpm bindings:check` verifies the tracked contract and is included in `pnpm validate`.

## Git and GitHub

- Use `git` for local Git operations and the GitHub connector for supported GitHub operations.
- Do not use `gh`.
- Git and GitHub writes require an explicit user request.
- Do not push directly to `main`.
- Do not force-push unless explicitly requested.
- Before committing, inspect the branch and diff and include only the current Issue's changes.
- Before merging, verify the Issue acceptance conditions and required validation.
