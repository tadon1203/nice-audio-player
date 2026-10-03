# CLAUDE.md

Personal project. Keep things simple and just get it done.

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
- For a feature small enough to hold in one head, skip the spec and tickets and go from `/grill-with-docs` straight to `/implement`.

`/clear` after each step above finishes (grill, spec, tickets, each ticket), once decisions are written to docs and work is committed. Not mid-grill or mid-implement.

## Commands

Run the cheapest command that covers the change, once, when it can fail. There is no CI, so the pre-commit check is the only gate.

| Changed                                                           | While iterating                                                 | Before commit                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Docs, comments only                                               | nothing                                                         | nothing                                                                                     |
| Renderer (`src/`)                                                 | `svelte-autofixer` for `.svelte`; `vitest run <file>` for logic | `pnpm check`; `pnpm test:renderer` or `pnpm test:shared` if logic changed                   |
| Rust                                                              | `cargo check -p <crate>`; `cargo test -p <crate> <name>`        | `pnpm check:native` and `pnpm test:native`                                                  |
| Tauri command signature or event                                  | `pnpm bindings`                                                 | the Renderer and Rust rows                                                                  |
| Startup, IPC, routing                                             |                                                                 | add `pnpm test:e2e`                                                                         |
| Renderer and backend wiring (commands, events, startup, playback) |                                                                 | add `pnpm test:e2e:app` (Windows, local only, plays silent files on the real output device) |
| Release                                                           |                                                                 | `pnpm validate`, then `pnpm package`                                                        |

- Run only the rows the diff touches, and don't re-run a check that already passed on the same tree. Fix, then re-run only what failed.
- Prefer `pnpm test:renderer` / `pnpm test:shared` / `pnpm test:native` over `pnpm test`. `pnpm validate` is for releases only.
- Fix format with `pnpm format` instead of by hand.
- Run slow commands (`test:e2e*`, `package`, `validate`) in the background.
- The Tauri window, its capabilities, and the titlebar controls are checked by hand with `pnpm dev`.

## Tool usage

- On Windows, prefer PowerShell. Use Bash only when a POSIX shell is required.
- Use `Edit` for existing project files and `Write` for new or full-replacement files. Do not use heredocs, here-strings, `sed -i`, or shell redirection to create or modify project files.
- Prefer `LSP` for symbol definitions, references, types, and diagnostics when available; use `Grep` for text, strings, and config keys.
- For `.svelte` / `.svelte.ts`, use `svelte-file-editor` for non-trivial component work; make small local edits directly. Run `svelte-autofixer` on changed `.svelte` files and fix reported issues.
- Offload large or exploratory searches to a Haiku subagent when that avoids pulling substantial context into the main session; bring back only the conclusion.
- Keep tool output small: narrow searches by path, type, or pattern.

## Conventions

- Documents that stay in the repo (docs, ADRs, specs, tickets, `CONTEXT.md`) are written in English.
- Issue tracker, triage labels, and domain docs: see `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`.
