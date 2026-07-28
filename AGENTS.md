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

- Start each change from one focused Issue, using one branch and one pull request per Issue.
- Create the branch from an up-to-date local `main` matching `origin/main`.
- Name it `<type>/<issue-number>-<lowercase-kebab-case-description>` and use `<type>: <summary>` for commit, PR, and squash-commit titles.
- Keep the change within the Issue scope. Do not commit secrets, local environment files, build outputs, generated dependencies, or editor settings.
- Use local `git` for branches, staging, commits, pushes, and local cleanup. Use the GitHub plugin for Issues, pull requests, reviews, merges, and remote branch operations.
- Do not run `gh` automatically, including for authentication or repository lookup. If the GitHub plugin cannot perform a required operation, stop and ask the user before using `gh`.
- Git and GitHub writes require an explicit user request.
- Integrate pull requests into `main` with squash merge only; do not use regular merge commits.

### Commands

| Request        | Action                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `commit`       | Commit the current branch changes.                                                                                               |
| `push`         | Push the current branch.                                                                                                         |
| `open pr`      | Push existing commits if necessary and open or update the current branch's pull request. It does not commit uncommitted changes. |
| `squash merge` | Continue the current Issue workflow through validation, Issue checklist update, squash merge, and cleanup.                       |

Each command authorizes only the action it describes. Do not repeat completed steps or reuse a PR unless it matches the current branch, targets `main`, and refers to the same Issue.

### `squash merge`

When explicitly requested:

1. Confirm the branch, Issue, PR, target `main`, worktree, and intended scope. Stop for a branch/Issue/PR mismatch, unrelated changes, or ambiguous state.
2. Read the Issue number from the branch name and fetch the complete Issue body with the GitHub plugin.
3. Verify every required Done item against the code, relevant tests, required manual checks, and `pnpm check`. A user report may satisfy a manual check. Stop if any required check is incomplete or fails.
4. Update the Issue body with the GitHub plugin: preserve the title, description, formatting, links, and unverified items; change only verified `- [ ]` items to `- [x]`. Confirm no required Done item remains unchecked.
5. Commit and push all intended changes that are still uncommitted.
6. Use the GitHub plugin to open or update the PR with a `<type>: <summary>` title and `Closes #<issue-number>` in the body.
7. Use the GitHub plugin to squash-merge the PR into `main` using the same title.
8. Confirm the squash commit exists on `origin/main`, the Issue is closed, and all verified Done items remain checked.
9. Delete the remote branch with the GitHub plugin when supported; otherwise stop and ask before using `gh`. Delete the local branch with `git`, update local `main` to `origin/main`, and confirm the worktree is clean.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Add broad lint suppressions when a narrower fix or annotation is possible
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code without a current requirement
- Introduce abstractions solely for hypothetical future implementations
- Change existing behavior unless the task explicitly requires it
