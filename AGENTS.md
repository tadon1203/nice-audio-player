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

- Start from a focused Issue using `.github/ISSUE_TEMPLATE/task.md`.
- Create `<type>/<issue-number>-<description>` from `main`; keep one Issue, branch, and pull request per outcome.
- During implementation, track the Issue's Done items and verify them against code, tests, and manual checks before completion.
- Run `pnpm check` before completion or commit. Review `git status`, `git diff`, and `git diff --staged`.
- Use `<type>: <summary>` commits. Perform Git and GitHub operations only when explicitly requested. Use the GitHub connector; if `gh` is required, stop and report it.
- PRs should include only completed Done items and `Closes #<issue-number>` when applicable. Use Squash and merge, then delete the remote branch, update `main`, and delete the local branch.
- Never commit secrets, local environment files, build outputs, generated dependencies, or editor-specific local settings.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Suppress errors without documenting the reason
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code unless it is required
- Change existing behavior unless the task explicitly requires it
