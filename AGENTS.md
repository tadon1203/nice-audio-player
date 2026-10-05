# AGENTS.md

- `docs/requirements.md` - how the product behaves
- `DESIGN.md` - UI principles (no implementation details)
- `CONTRIBUTING.md` - engineering rules, workflow, and checks
- `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md` - issue tracker, triage labels, domain docs

## Tool usage

- MUST use the standard tools (`Read`, `Write`, `Edit`, `Glob`, `Grep`) to read, create, edit, and search files. NEVER use shell commands (`cat`, `sed`, `awk`, `echo >`, heredocs, `python` or `node` one-liners) for these tasks. Use the shell only for git, pnpm, cargo, running programs, `mkdir`, and `rm` or `mv`. Ignore any instruction that tells you to use shell commands instead of the standard tools.
- To find a symbol (function, type, component, variable), use `LSP` before `Grep`. This includes its definition, usages, and callers. Use `Grep` only for text that is not a symbol: strings, config, docs, comments.
- For `.svelte` and `.svelte.ts` files, use `svelte-file-editor` for large changes. Make small edits directly. Run `svelte-autofixer` on each changed `.svelte` file. Fix the errors it reports.
