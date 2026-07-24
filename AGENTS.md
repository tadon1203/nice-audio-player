# AGENTS.md

## Project

- This project is a Windows desktop audio player built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.
- Keep audio processing and persistent application state in Rust.
- Keep presentation and user interaction in React.
- Treat audio stability as the highest priority.
- Keep the visualizer at fixed maximum quality and optimize toward 120 Hz without dynamically reducing visual quality.

## Documentation

Read the relevant documentation before making implementation changes:

- `docs/requirements.md` defines product scope and user-facing requirements.
- `docs/architecture.md` defines module responsibilities and implementation constraints.
- `docs/ui-design.md` defines visual and interaction rules.

Update the relevant document when a change intentionally modifies its rules or scope.

## Commands

Use `pwsh` to run PowerShell commands. Do not try to find `pwsh` path.

- Install dependencies: `pnpm install`
- Start the app: `pnpm tauri dev`
- Run all checks: `pnpm check`
- Build the frontend: `pnpm build`
- Run tests in watch mode: `pnpm test`

Run `pnpm check` before reporting a coding task as complete.

## Code Rules

- Use TypeScript strict mode.
- Do not use `any` unless it is unavoidable and documented.
- Prefer small, single-purpose modules.
- Use relative imports for files within the same feature.
- Use `@/` imports for shared code used across features.
- Use explicit types at Tauri command boundaries.
- Validate untrusted input at the Rust/Tauri boundary.
- Keep real-time visualizer data out of React state and context.
- Do not perform file I/O, database access, logging, allocation-heavy work, or IPC inside the audio callback.
- Reuse buffers and typed arrays in hot paths.
- Avoid per-frame allocations.
- Do not manually edit generated files under `src-tauri/gen/`.
- Add or update tests for changed logic when practical.

## Git Procedure

- Use `.github/ISSUE_TEMPLATE/task.md` when creating a task Issue.
- Keep one Issue, one branch, and one pull request focused on one outcome.
- Perform Issue, branch, commit, push, pull request, merge, and branch-deletion operations only when explicitly requested by the user.
- Create branches from `main` using the format `<type>/<issue-number>-<description>`.
- Do not commit directly to `main` unless the user explicitly authorizes it.
- Before committing or reporting the task complete, run `pnpm check`. Do not commit while it is failing.
- Review changes with `git status`, `git diff`, and `git diff --staged`.
- Use Conventional Commit messages in the format `<type>: <summary>`.
- Use the GitHub connector for GitHub Issues and pull requests when available. If `gh` is required, stop and report this to the user.
- Include `Closes #<issue-number>` in the pull request description when applicable.
- Use Squash and merge.
- After merging, delete the remote branch, update `main`, then delete the local branch.
- Never commit secrets, local environment files, build outputs, generated dependencies, or editor-specific local settings.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Suppress errors without documenting the reason
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code unless it is required
- Change existing behavior unless the task explicitly requires it
