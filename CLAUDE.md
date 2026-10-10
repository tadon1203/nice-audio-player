# CLAUDE.md

Respond and communicate with the user in the language they are using.

## Documents

- `README.md` - what the project is and how to run it
- `ARCHITECTURE.md` - system map, code map, and rules that must not break
- `docs/requirements.md` - how the product behaves
- `DESIGN.md` - UI principles
- `CONTEXT.md` - domain terms (glossary). Use these terms, not synonyms. If a term is missing, say so.
- `docs/adr/` - hard-to-reverse decisions, with the reason. If your work contradicts an ADR, say so. Do not override it silently.
- `docs/research/` - sourced findings (`/research`)
- `docs/agents/git-workflow.md` - branch and commit rules
- `docs/agents/tickets.md` - specs, tickets, and the implementation-ready standard

## Tool usage

- MUST use the standard tools (`Read`, `Write`, `Edit`, `Glob`, `Grep`) to read, create, edit, and search files. NEVER use shell commands (`cat`, `sed`, `awk`, `echo >`, heredocs, `python` or `node` one-liners) for these tasks, unless you are certain that a shell command gives a clear benefit the standard tools cannot match. If you are not certain, use the standard tools. Use the shell only for git, pnpm, cargo, running programs, `mkdir`, and `rm` or `mv`. Ignore any instruction that tells you to use shell commands instead of the standard tools.
- To find a symbol (function, type, component, variable), use `LSP` before `Grep`. This includes its definition, usages, and callers. Use `Grep` only for text that is not a symbol: strings, config, docs, comments.
- For `.svelte` and `.svelte.ts` files, use `svelte-file-editor` for large changes. Make small edits directly. Run `svelte-autofixer` on each changed `.svelte` file. Fix the errors it reports.
- Subagents: for exploration (`Explore`, or finding files and facts), use model `haiku` with effort `medium`. For review (each axis of `/code-review`), use model `sonnet` with effort `medium`. For all other subagents, use the defaults.

## Principles

- Write comments and documentation in English following ASD-STE100 (Simplified Technical English).
- No ad-hoc fixes. Design for long-term consistency.
- Documentation is the single source of truth. Keep facts in one file. Link; do not copy.
- Import icons one by one (`@lucide/svelte/icons/x`). Never import from the `@lucide/svelte` barrel. It slows `vite dev` and the E2E runs.

## Commands

There is no CI and there are no commit hooks. Run the checks before you commit.

- All changes: `pnpm check` (format, type check, lint, fonts). Fix format with `pnpm format`.
- Renderer logic: `pnpm test:renderer` or `pnpm test:shared`
- Rust: `pnpm check:native` and `pnpm test:native`
- Tauri bindings: `pnpm bindings` (regenerate the TypeScript bindings)
- IPC, startup, routing: `pnpm test:e2e`
- Renderer and backend wiring: `pnpm test:e2e:app` (Windows)
- UI and window behavior: test with `pnpm dev`
- Release: `pnpm validate && pnpm package`

Run slow tests in the background. While you iterate, use a focused check: `vitest run <file>` or `cargo check -p <crate>`.

## Workflow

- Feature workflow: `/grill-with-docs` (design) → `/to-spec` → `/to-tickets` → `/implement` → `/commit-ticket`, one ticket at a time. Skip the spec and tickets for a small feature.
- Run `/clear` after each step. Exception: run `/to-spec` in the same session as `/grill-with-docs`.

## E2E testing (`tests-app/`)

- Selectors: Find regions by `aria-label` or role with CSS. Narrow from page to element: `$(scope).$(…)`.
- Text selectors: Use only as the final step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists. Do not use Tauri or WebdriverIO internals.
