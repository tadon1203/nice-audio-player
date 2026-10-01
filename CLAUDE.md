# CLAUDE.md

Personal project. Keep things simple and just get it done.

- [CONTEXT.md](./CONTEXT.md) — glossary; use these terms in code, docs, and tickets
- [docs/adr/](./docs/adr/) — decisions and their reasons
- [docs/requirements.md](./docs/requirements.md) — product behavior
- [DESIGN.md](./DESIGN.md) — UI principles (no implementation details)
- [CONTRIBUTING.md](./CONTRIBUTING.md) — engineering rules and principles

## Workflow

Small change or tweak: just do it and commit. Bug: `/diagnosing-bugs`. Unsure about a state model or UI feel: `/prototype`. Unsure about a fact: `/research`.

Non-trivial feature:

```
/grill-with-docs → /to-spec → /to-tickets → /implement
```

- `/grill-with-docs` settles the design; new terms go to `CONTEXT.md`, hard-to-reverse decisions to `docs/adr/`, in the same commit.
- `/to-spec` and `/to-tickets` write to `.scratch/<feature>/` (gitignored working notes). Anything worth keeping moves to `CONTEXT.md`, an ADR, or `requirements.md`.
- `/implement` runs `/tdd`, then `/code-review`, then commits. For a feature small enough to hold in one head, skip the spec and tickets and go from `/grill-with-docs` straight to `/implement`.

`/clear` after each step above finishes (grill, spec, tickets, each ticket), once decisions are written to docs and work is committed. Not mid-grill or mid-implement.

## Token efficiency

Offload large or exploratory searches (broad `grep`/`glob` sweeps, multi-file investigations) to a Haiku subagent so the raw results stay out of the main context; bring back only the conclusion.

Code search: use `LSP` (references, definition, hover) for symbols with ambiguous names, rename/delete impact, and types. Use `Grep` for strings, config keys, comments, and unique names.

Delegate creating and editing `.svelte` / `.svelte.ts` files to the `svelte-file-editor` subagent, and fix until `svelte-autofixer` reports no issues before finishing.

## Language

Documents that stay in the repo (docs, ADRs, specs, tickets, `CONTEXT.md`) are written in English.

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels, recorded as a `Status:` line in each ticket. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.
