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

Application code must not import GSAP directly. Use `$lib/animation`.

## Frontend

- Renderer code under `src/**` MUST NOT import `electron`, `node:*`, or repository files under `electron/**`.
- Code outside `src/lib/animation/**` MUST NOT import `gsap` or `gsap/*`.
- Renderer access to native/backend capabilities MUST go through `$lib/api`.
- Product design tokens MUST be declared in `src/lib/styles/theme.css`.
- Literal color values MUST NOT appear outside `src/lib/styles/theme.css`.
- Reusable colors, typography, radii, shadows, easing curves, spacing values, and responsive breakpoints MUST use a named token.
- Component-specific layout geometry MAY use Tailwind arbitrary values.
- An arbitrary value MUST NOT be used when an equivalent named Tailwind utility exists.
- `!important` is prohibited.
- Routed destinations MUST use SvelteKit routing as their authoritative state.
- A component MUST NOT duplicate routed destination state in `$state`.
- Direct DOM mutation is prohibited. DOM structure and content MUST be expressed through Svelte rendering.
- New or changed product-visible behavior MUST include automated coverage in the same change.
- ESLint, Stylelint, TypeScript, Svelte compiler, Prettier, and test failures MUST be fixed at their cause. Their checks MUST NOT be disabled, suppressed, or weakened to make a change pass.

## Git and GitHub

Git and GitHub writes require an explicit user request.

Choose GitHub connector first.

Follow [CONTRIBUTING.md](./CONTRIBUTING.md).

## Svelte MCP and skills

You are able to use the Svelte MCP server, with comprehensive Svelte 5 and SvelteKit documentation.

- When asked about Svelte or SvelteKit, use `list-sections` first.
- Analyze the returned use cases and use `get-documentation` for every relevant section.
- Whenever writing Svelte code, use `svelte-autofixer` before presenting the result and continue until it reports no issues or suggestions.
- Use `playground-link` only after the code is complete, after asking the user for confirmation, and never for code written to project files.

## Commands

The canonical command definitions are in [package.json](./package.json).
Detailed contributor workflow is documented in [CONTRIBUTING.md](./CONTRIBUTING.md#local-verification).

- Use `pnpm verify` for consistency checks and tests.
- Use `pnpm validate` for checks, tests, and all production builds.
- Use `pnpm format` to write formatting changes.
- Use `pnpm lint:format` to check formatting without modifying files.
- Use `pnpm fonts:download` to acquire and verify the official Fontshare asset.
