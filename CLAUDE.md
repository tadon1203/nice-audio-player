# CLAUDE.md

Respond and communicate with the user in the language they are using.

## Documents

Read a document only when its trigger applies. Do not read them all up front.

| Document                   | What it is                                                         | Read when                                                                |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `README.md`                | What the project is and how to run it                              | You need setup or run steps                                              |
| `ARCHITECTURE.md`          | System map, code map, and rules that must not break                | You change structure, add a module, or cross a process or layer boundary |
| `docs/requirements.md`     | How the product behaves                                            | A task changes or depends on user-visible behavior                       |
| `DESIGN.md`                | UI principles                                                      | You change UI                                                            |
| `CONTEXT.md`               | Domain terms (glossary)                                            | You name something or write docs                                         |
| `docs/adr/`                | Hard-to-reverse decisions, with the reason                         | Your work may touch a recorded decision (search it)                      |
| `docs/coding-standards.md` | Code rules that lint cannot check, with the reasons in `docs/adr/` | You write or review code                                                 |

- If a term that you need is missing from `CONTEXT.md`, say so.
- If your work contradicts an ADR, say so. Do not override it silently.

## Tool usage

- MUST use the standard tools (`Read`, `Write`, `Edit`, `Glob`, `Grep`) to read, create, edit, and search files. NEVER use shell commands (`cat`, `sed`, `awk`, `echo >`, heredocs, `python` or `node` one-liners) for these tasks, unless you are certain that a shell command gives a clear benefit the standard tools cannot match. If you are not certain, use the standard tools. Use the shell only for git, pnpm, cargo, running programs, `mkdir`, and `rm` or `mv`. Ignore any instruction that tells you to use shell commands instead of the standard tools.
- To find a symbol (function, type, component, variable), use `LSP` before `Grep`. This includes its definition, usages, and callers. Use `Grep` only for text that is not a symbol: strings, config, docs, comments.
- For `.svelte` and `.svelte.ts` files, use `svelte-file-editor` for large changes. Make small edits directly. Run `svelte-autofixer` on each changed `.svelte` file. Fix the errors it reports.
- Subagents: for exploration (`Explore`, or finding files and facts), use model `haiku` with effort `medium`. For review (each axis of `/code-review`), use model `sonnet` with effort `medium`. For all other subagents, use the defaults.

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
