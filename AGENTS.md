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

## Git Procedure

- Start from a focused Issue using `.github/ISSUE_TEMPLATE/task.md`.
- Create `<type>/<issue-number>-<description>` from `main` and keep one Issue, branch, and pull request per outcome.
- Verify the Issue's Done items against code, tests, and manual checks.
- Review `git status`, `git diff`, and `git diff --staged` before completion or commit.
- Use `<type>: <summary>` commits.
- PRs should contain only completed scope and use `Closes #<issue-number>` when applicable.
- Never commit secrets, local environment files, build outputs, generated dependencies, or editor-specific local settings.

### Merge and cleanup (`merge and cleanup`)

Perform this procedure only when the user explicitly requests `merge and cleanup`.
Do not infer permission from a request to commit, push, merge, or finish a coding task alone.

When explicitly requested, after the feature work is committed:

1. Push the feature branch and merge it into `main`.
2. Run `pnpm check` after the merge.
3. Review the merge result with `git status`, `git log`, and `git diff` as needed.
4. Push the updated `main` branch when the post-merge checks pass.
5. Close the related Issue or PR when applicable.
6. Delete the merged feature branch locally and remotely when it is no longer needed.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Add broad lint suppressions when a narrower fix or annotation is possible
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code without a current requirement
- Introduce abstractions solely for hypothetical future implementations
- Change existing behavior unless the task explicitly requires it
