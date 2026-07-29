# AGENTS.md

## Project

- **Product**: Nice Audio Player is a Windows desktop audio player built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.
- **Priority**: Treat audio stability as the highest runtime priority.
- **State**: Keep authoritative audio and persistent application state in Rust.
- **UI**: Keep presentation and user interaction in React.

## Documentation

Read the relevant document before changing behavior or boundaries:

- `README.md`: Project entry point and development guide.
- `docs/requirements.md`: Accepted product requirements.
- `docs/architecture.md`: Implementation rules and boundaries.
- `docs/ui-design.md`: Visual and interaction principles.
- **GitHub Issues**: Individual features, experiments, and implementation scope.

Update a long-lived document only when a change intentionally modifies its accepted requirements or rules. Do not copy Issue-specific plans or temporary implementation details into documentation.

## Commands

Use `pwsh` for PowerShell commands.

- **Install dependencies**: `pnpm install`
- **Start the app**: `pnpm tauri dev`
- **Run all checks**: `pnpm check`
- **Build the frontend**: `pnpm build`
- **Run tests in watch mode**: `pnpm test`

Run `pnpm check` before reporting a coding task as complete.

## Code Rules

- **Strictness**: Use TypeScript strict mode. Do not use `any` unless unavoidable and documented.
- **Structure**: Prefer small, single-purpose modules. Use relative imports within the same feature and `@/` imports for shared code.
- **IPC Boundaries**: Use explicit types at Tauri command boundaries and validate untrusted input at the Rust/Tauri boundary.
- **Audio Thread Safety**: Do not perform file I/O, database access, logging, IPC, sleeping, blocking synchronization, or allocation-heavy work inside an audio callback.
- **Performance**: Reuse buffers and typed arrays in hot paths; avoid per-frame allocations.
- **React State**: Keep high-frequency audio and visualization data out of React state and context.
- **Generated Code**: Do not manually edit generated files under `src-tauri/gen/`.
- **Testing**: Add or update tests for changed logic when practical.

## Git Workflow

### Rules

- **Branch / PR**: Start from fresh `main`. Work strictly 1 Issue = 1 Branch = 1 PR (`<type>/<issue-number>-<kebab-case>`).
- **Conventional Commits**: Use a valid type for branches, commits, PRs, and squash merge titles:
  - `feat`: User-visible functionality
  - `fix`: Incorrect behavior fix
  - `refactor`: Code restructuring without behavior changes
  - `perf`: Performance improvements
  - `docs`: Documentation changes
  - `test`: Test additions or modifications
  - `build`: Build system or dependency changes
  - `ci`: CI configuration changes
  - `chore`: Maintenance tasks
  - `revert`: Reverting previous changes
- **Titles**: Use `<type>: <summary>`. Keep the type consistent across the commit, PR, and squash merge title.
- **Scope**: Keep changes strictly within Issue scope. Never commit secrets, env files, build outputs, or editor settings.
- **Tool Priority**:
  - Local operations: Use local `git`.
  - Remote/GitHub operations: Primary choice is the **GitHub plugin**. If unavailable or failing, fall back to **`gh` CLI** automatically.
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

- Weaken lint, type-check, test, or security rules merely to make checks pass.
- Add broad lint suppressions when a narrower fix or annotation is possible.
- Change public command or event contracts without updating their consumers.
- Preserve temporary compatibility code without a current requirement.
- Introduce abstractions solely for hypothetical future implementations.
- Change existing behavior unless the task explicitly requires it.
