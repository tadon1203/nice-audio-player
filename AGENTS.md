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

Keep project boundaries thin. Delegate existing dependency behavior instead of reproducing it.

Do not use `any` to bypass a representable type.

Do not weaken type checking, linting, tests, security, accessibility, or performance constraints to make a change pass.

Do not manually edit generated files.

Application code must not import GSAP directly. Use `$lib/animation`.

## Git and GitHub

Git and GitHub writes require an explicit user request.

Choose GitHub connector first.

Follow [CONTRIBUTING.md](./CONTRIBUTING.md).
