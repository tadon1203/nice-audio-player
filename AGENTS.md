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
- Use explicit types at Tauri command boundaries.
- Validate untrusted input at the Rust/Tauri boundary.
- Keep real-time visualizer data out of React state and context.
- Do not perform file I/O, database access, logging, allocation-heavy work, or IPC inside the audio callback.
- Reuse buffers and typed arrays in hot paths.
- Avoid per-frame allocations.
- Do not manually edit generated files under `src-tauri/gen/`.
- Add or update tests for changed logic when practical.

## Git Workflow

- Work from a focused GitHub Issue whenever an issue exists for the task.
- Keep one issue and one pull request focused on one outcome.
- Create branches from `main`.
- Use the branch format `<type>/<issue-number>-<description>`.
- Examples:

  - `feat/12-audio-file-validation`
  - `fix/18-device-disconnect`
  - `docs/21-architecture-rules`

- Do not commit directly to `main`.
- Use Conventional Commits, including `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, and `chore:`.
- Do not mix unrelated refactoring with feature or bug-fix changes.
- Run `pnpm check` before creating a commit or reporting the task complete.
- Do not commit while `pnpm check` is failing.
- Include `Closes #<issue-number>` in the pull request description when the pull request fully resolves the issue.
- Prefer squash merging so that each pull request produces one focused commit on `main`.
- Delete the feature branch after the pull request is merged.
- Do not create, close, or modify Issues or pull requests unless explicitly requested.
- Do not commit, push, merge, rebase, amend, reset, or force-push unless explicitly requested.
- Never commit secrets, local environment files, build outputs, generated dependencies, or editor-specific local settings.
- Use the GitHub connector for GitHub issues and pull requests when available.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass
- Suppress errors without documenting the reason
- Change public command or event contracts without updating their consumers
- Preserve temporary compatibility code unless it is required
- Change existing behavior unless the task explicitly requires it
