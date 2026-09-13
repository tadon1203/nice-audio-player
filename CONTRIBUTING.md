# Contributing

## Document responsibility

This document is the source of truth for engineering conventions and contribution, verification, Git, and GitHub workflow. It does not define product behavior, visual design, or system architecture.

This document defines the repository engineering conventions and contribution/Git/GitHub workflow.

## Documentation

Every source document listed in `AGENTS.md` MUST begin with its document title, followed by a `## Document responsibility` heading. That section MUST state what the document is authoritative for and what it does not define.

Keep responsibility definitions concise, and keep each rule in the document that owns it rather than duplicating rules across documents.

## Engineering rules

These rules are the shared implementation contract for contributors and coding agents. Product behavior, visual direction, and system architecture remain defined in the documents listed in `AGENTS.md`.

### General engineering

- Do not weaken type checking, linting, tests, security, accessibility, or performance constraints to make a change pass.
- Keep each change focused on one logical responsibility.
- New or changed product-visible behavior MUST include automated coverage in the same change.
- Generated files MUST be changed only by their owning generator or build command.
- Do not manually edit generated files.

### Angular

See the [Angular style guide](https://angular.dev/style-guide).

#### Components

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

#### State management

- Use signals for local component state.
- Use `computed()` for derived state.
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized.
- Keep state transformations pure and predictable.
- Do not use `mutate` on signals; use `update` or `set` instead.

#### Templates

- Keep templates simple and avoid complex logic.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`.
- Use the async pipe to handle observables.
- Do not assume globals such as `new Date()` are available in templates.
- Do not use `ngClass`; use `class` bindings instead.
- Do not use `ngStyle`; use `style` bindings instead.
- Do not import `CommonModule`; import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`.
- Use `NgOptimizedImage` for all static images. `NgOptimizedImage` does not work for inline base64 images.

#### Services

- Design services around a single responsibility.
- Use the `providedIn: 'root'` option for singleton services.
- Use the `@Service` decorator for ordinary root-provided singleton services.
- Use `@Injectable()` when constructor injection, advanced provider configuration, or another `providedIn` scope is required.
- Use route or component providers when lifetime should be scoped to that route or component.
- Use the `inject()` function instead of constructor injection.

#### Routing

- Implement lazy loading for feature routes.
- Routed destinations MUST use Angular Router as their authoritative state.

### Renderer boundaries

- Renderer code under `src/**` MUST NOT import `electron`, `node:*`, or repository files under `electron/**`.
- Renderer access to native/backend capabilities MUST go through the shared native API contract.
- Direct DOM mutation is prohibited. DOM structure and content MUST be expressed through Angular templates and bindings.
- At a flex or grid boundary, an item that is allowed to shrink MUST use `min-w-0` so descendant min-content sizes cannot expand an unrelated parent region. Apply this at the layout boundary that owns the constraint, not indiscriminately to every descendant.
- The component that owns overflowing content MUST own its overflow behavior; parent shell components establish shrink and scroll boundaries without feature pages compensating for them.

### Design system

#### Tokens

- Product design tokens, including motion durations and easing curves, MUST be declared in `src/styles/theme.css`.
- Literal color values MUST NOT appear outside `src/styles/theme.css`.
- Reusable colors, typography, radii, shadows, spacing values, and responsive breakpoints MUST use a named token from `src/styles/theme.css`.

#### Motion

- Prefer CSS transitions for simple UI state changes.
- Reusable motion durations and easing curves MUST use named tokens from `src/styles/theme.css`.
- Introduce a complex animation library only when a concrete feature requires sequencing, FLIP, or dynamic interruption; the feature or component that owns that behavior owns the implementation.
- `!important` is prohibited.

### Accessibility

- The application MUST pass all AXE checks.
- The application MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.
- Keyboard focus MUST remain visible and distinct from hover and selection.
- Color and motion MUST NOT be the only indication of meaningful state.

### Tailwind CSS

- Every Tailwind utility name MUST appear completely and statically in source. Utility names MUST NOT be constructed by interpolation or string concatenation.
- A named Tailwind utility MUST be used when it represents the required value. An arbitrary value MAY be used only when no equivalent named utility exists and the value is component-specific geometry.
- Arbitrary values are restricted to token-backed values and structural layout expressions. Arbitrary colors, typography, spacing, radii, shadows, and motion values MUST NOT be written directly in templates or component styles.
- Reusable product values and component geometry MUST be declared in `src/styles/theme.css` and referenced through a named utility or `var(--...)`. Structural expressions such as `minmax()`, `repeat()`, `calc()`, and `clamp()` MAY remain inline when they describe layout structure rather than a reusable visual value.
- Arbitrary variants and arbitrary properties, such as `aria-[current=page]:...` and `[scrollbar-gutter:stable]`, MAY remain inline because they express selectors or CSS properties rather than design values.
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

## Workflow

Use one Issue, one branch, and one pull request for each change.

Implementation Issues use `.github/ISSUE_TEMPLATE/task.yml`.

Branch names use `<type>/<issue-number>-<kebab-case>`.

Use one of:

`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.

PR and squash-merge titles use `<type>: <summary>`.

Individual commits use the Conventional Commit type that describes that commit.

Merge completed Issue work with Squash Merge only.

## Commit messages

Use this format:

`<type>(<scope>): <imperative summary>`

The scope is optional. Use the type list above, keep the summary concise, start it
with a lowercase verb, and omit the final period. Use the body when the reason or
trade-off is not clear from the summary. Use footers for issue references or
breaking-change details. Keep each commit focused on one logical change.

For example:

`fix(transport): reject malformed backend responses`

This follows the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).

## Local verification

Use `pnpm validate` for consistency checks, tests, and production builds:

- generated binding consistency
- Angular, Electron, shared TypeScript, and generated binding checks
- Prettier, ESLint, and Stylelint
- Rust formatting, Clippy, and tests
- unit and end-to-end tests
- production renderer, Electron, backend, and runtime builds

Use `pnpm test` when only the test suites are needed. End-to-end tests build a
temporary renderer to serve the application. `pnpm format` writes formatting
changes; formatting is checked as part of `pnpm validate`.

Use `pnpm fonts` to verify the bundled Fontshare asset. Use `pnpm fonts -- download`
to acquire the official Fontshare asset when required.

ESLint, Stylelint, TypeScript, Angular compiler, Prettier, and test failures MUST
be fixed at their cause. Checks MUST NOT be disabled, suppressed, or weakened to
make a change pass.

## Git and GitHub

Use `git` for local Git operations and the GitHub connector for supported GitHub operations.

Do not use `gh`.

Git and GitHub writes require an explicit user request and authorize only the requested operation.

Do not push directly to `main`.

Do not force-push unless explicitly requested.

Before committing, inspect the current branch and diff and include only the current Issue's changes.

Before merging, verify the Issue acceptance conditions and run all validation required by the repository.
