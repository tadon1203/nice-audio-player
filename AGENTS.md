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

### Basic flow

Issue → branch → commit → push → pull request → squash merge → delete branch → update `main`

The related Issue is normally closed automatically when the pull request containing `Closes #<issue-number>` is squash-merged into `main`.

### Rules

- Start each change from one focused Issue.
- Use one branch and one pull request per Issue.
- Create the branch from an up-to-date local `main` that matches `origin/main`.
- Name the branch:
  `<type>/<issue-number>-<description>`
- Take the Issue number from the current branch name.
- Use lowercase kebab-case for `<description>`.
- Use the Issue type when available; otherwise choose an appropriate conventional type such as `feat`, `fix`, `refactor`, `docs`, `test`, or `chore`.
- Use `<type>: <summary>` for commit messages, pull request titles, and the final squash commit title.
- Keep changes within the related Issue's scope.
- Before merging:
  - verify the Issue's Done items;
  - run tests affected by the change;
  - run any test command required by the Issue;
  - perform manual checks explicitly listed in the Issue;
  - run `pnpm check`.
- Do not invent additional mandatory checks that are not justified by the change or the Issue.
- Manual checks may be accepted when the user explicitly reports that they passed. If a required manual check has not been completed, report it and stop before merging.
- Integrate pull requests into `main` with squash merge.
- Do not use regular merge commits.
- Do not commit secrets, local environment files, build outputs, generated dependencies, or editor-specific settings.
- Git and GitHub write operations require an explicit user request.

### Commands

| Request        | Action                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `commit`       | Commit the current branch changes.                                                                                               |
| `push`         | Push the current branch.                                                                                                         |
| `open pr`      | Push existing commits if necessary and open or update the current branch's pull request. It does not commit uncommitted changes. |
| `squash merge` | Continue the current Issue workflow from its present state through squash merge and cleanup.                                     |

Each command authorizes only the action it describes. The `squash merge` command is the exception: it authorizes the remaining delivery and cleanup steps listed below.

Do not repeat steps that are already complete. Reuse an existing commit, pushed branch, or pull request only when it matches the current feature branch, targets `main`, and refers to the same Issue.

### `squash merge`

When explicitly requested:

1. Confirm the current branch, related Issue, pull request, and worktree state.
2. Read the Issue number from the branch name.
3. Stop if:
   - the branch name does not follow the required format;
   - the branch Issue number conflicts with the pull request;
   - the pull request does not target `main`;
   - unrelated changes would be included.
4. Verify the Issue's Done items.
5. Run the relevant tests, required manual checks, and `pnpm check`.
6. Commit and push any remaining intended changes.
7. Open or update the pull request with:
   - a title in the form `<type>: <summary>`;
   - `Closes #<issue-number>` in the body.
8. Squash-merge the pull request into `main` using `<type>: <summary>` as the squash commit title.
9. Confirm that the squash commit exists on `origin/main`.
10. Confirm that the related Issue was closed automatically. Close it manually only if necessary.
11. Delete the remote branch if it still exists.
12. Delete the local feature branch.
13. Switch to `main` and update it to match `origin/main`.
14. Confirm the worktree is clean.

Stop before merging if tests fail, a required manual check is incomplete, the branch does not match the Issue, or the repository state is ambiguous.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Add broad lint suppressions when a narrower fix or annotation is possible
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code without a current requirement
- Introduce abstractions solely for hypothetical future implementations
- Change existing behavior unless the task explicitly requires it
