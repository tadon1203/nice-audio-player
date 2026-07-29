# AGENTS.md

## Project

- Nice Audio Player is a Windows desktop audio player built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.
- Treat audio stability as the highest runtime priority.
- Keep authoritative audio and persistent application state in Rust.
- Keep presentation and user interaction in React.

## Documentation

Read the relevant document before changing behavior or boundaries:

- `README.md` is the project entry point and development guide.
- `docs/requirements.md` defines accepted product requirements.
- `docs/architecture.md` defines implementation rules and boundaries.
- `docs/ui-design.md` defines visual and interaction principles.
- GitHub Issues define individual features, experiments, and implementation scope.

Update a long-lived document only when a change intentionally modifies its accepted requirements or rules. Do not copy Issue-specific plans or temporary implementation details into documentation.

## Commands

Use `pwsh` for PowerShell commands.

- Install dependencies: `pnpm install`
- Start the app: `pnpm tauri dev`
- Run all checks: `pnpm check`
- Build the frontend: `pnpm build`
- Run tests in watch mode: `pnpm test`

Run `pnpm check` before reporting a coding task as complete.

## Code Rules

- Use TypeScript strict mode.
- Do not use `any` unless unavoidable and documented.
- Prefer small, single-purpose modules.
- Use relative imports within the same feature and `@/` imports for shared code.
- Use explicit types at Tauri command boundaries.
- Validate untrusted input at the Rust/Tauri boundary.
- Do not perform file I/O, database access, logging, IPC, sleeping, blocking synchronization, or allocation-heavy work inside an audio callback.
- Reuse buffers and typed arrays in hot paths; avoid per-frame allocations.
- Keep high-frequency audio and visualization data out of React state and context.
- Do not manually edit generated files under `src-tauri/gen/`.
- Add or update tests for changed logic when practical.

## Git Workflow

### Rules

- **Branch / PR**: Start from fresh `main`. Work strictly 1 Issue = 1 Branch = 1 PR (`<type>/<issue-number>-<kebab-case>`).
- **Conventional Commits**: Use one of these types for branch prefixes and commit, PR, and squash merge titles:
  - `feat`: introduce user-visible functionality
  - `fix`: correct incorrect behavior
  - `refactor`: restructure code without changing behavior
  - `perf`: improve performance without changing behavior
  - `docs`: change documentation or project instructions
  - `test`: add or change tests
  - `build`: change build or dependency configuration
  - `ci`: change continuous integration configuration
  - `chore`: maintenance that does not fit another type
  - `revert`: revert a previous change
- **Titles**: Use `<type>: <summary>`; keep the type consistent across the commit, PR, and squash merge title.
- **Scope**: Keep changes strictly within Issue scope. Never commit secrets, env files, build outputs, or editor settings.
- **Tool Priority**:
  - Local operations: Use local `git`.
  - Remote/GitHub operations: Primary choice is the **GitHub plugin**. If the plugin is unavailable or fails, fall back to **`gh` CLI** automatically.
- **Safety**: Write operations (git/GitHub) require explicit user request.
- **Merge**: Integrate via **Squash Merge** only.

### Commands

| Request        | Action                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `commit`       | Commit staged/unstaged changes for current issue.                         |
| `push`         | Push current branch to remote.                                            |
| `open pr`      | Push current commits and open/update the PR (does not auto-commit).       |
| `squash merge` | Run pre-merge checks, update Issue checklist, squash merge, and clean up. |

### `squash merge` Process

Execute strictly in order upon explicit request:

1. **Verify State**: Stop if branch, Issue, or PR mismatch, or if dirty with unrelated changes.
2. **Run Checks**: Run `pnpm check` and test commands in the terminal. Verify all Issue "Done" items against code and checks. Stop if any fail.
3. **Update Issue**: Mark verified `- [ ]` as `- [x]` (via GitHub plugin or `gh`). Ensure all required items are checked.
4. **Push & PR**: Commit/push any remaining work. Open or update PR with `Closes #<issue-number>` in the body.
5. **Squash Merge**: Squash-merge PR into `main` using `<type>: <summary>`.
6. **Clean Up**: Delete remote branch (via GitHub plugin or `gh`), delete local branch, sync local `main` with `origin/main`, and ensure clean worktree.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Add broad lint suppressions when a narrower fix or annotation is possible
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code without a current requirement
- Introduce abstractions solely for hypothetical future implementations
- Change existing behavior unless the task explicitly requires it
