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
