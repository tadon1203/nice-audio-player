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

### Policy

- Start from a focused Issue using `.github/ISSUE_TEMPLATE/task.md`.
- Create `<type>/<issue-number>-<description>` from `main` and keep one Issue, branch, and pull request per outcome.
- Verify the Issue's Done items against code, tests, and manual checks.
- Git/GitHub write operations require an explicit user request.
- The ordinary merge workflow is not used; feature branches are always integrated by squash.
- Use `<type>: <summary>` commit messages.
- Never commit secrets, local environment files, build outputs, generated dependencies, or editor-specific local settings.

### Commands

| Keyword            | Scope                                             |
| ------------------ | ------------------------------------------------- |
| `commit`           | Commit the current branch changes only.           |
| `push`             | Push the explicitly specified branch only.        |
| `merge and squash` | Run the complete feature delivery workflow below. |

Do not infer permission to commit, push, merge, squash, or delete branches from a general coding request.

### Delivery workflow

When the user explicitly requests `merge and squash`:

1. Inspect the current branch, worktree, local branches, and remote branches.
2. Verify the Issue's Done items, run the relevant tests, and run `pnpm check`.
3. Commit with `<type>: <summary>`.
4. Push the feature branch.
5. Switch to `main` and verify that the target branch is based on the current `main`.
6. Integrate with `git merge --squash <feature-branch>`; do not create a regular merge commit.
7. Create one squash commit on `main` using `<type>: <summary>`.
8. Run `pnpm check` after the squash commit.
9. Push `main`.
10. Close the related Issue or PR when applicable.
11. Delete the feature branch locally and remotely only after the squash commit is present on the remote `main`.

### Resume rules

When `continue merge and squash` is explicitly requested:

- Inspect `git status`, `git log`, local branches, and remote branches before taking action.
- Determine the first incomplete phase and resume from there.
- Do not recreate an existing commit, repeat a completed squash, or push an already synchronized branch unnecessarily.
- If there are conflicts, unexpected uncommitted changes, or remote divergence, stop and report them before writing.
- If a completed check is followed by new changes, run the check again.
- CI verification is optional when the repository has no CI configured.
- Release tags, builds, and other release actions require a separate explicit request.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Add broad lint suppressions when a narrower fix or annotation is possible
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code without a current requirement
- Introduce abstractions solely for hypothetical future implementations
- Change existing behavior unless the task explicitly requires it
