# AGENTS.md

## Project

- Windows desktop audio player built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.
- Keep audio processing in Rust and UI rendering in React.
- Treat audio stability as the highest priority. Keep the visualizer at fixed maximum quality and optimize toward 120 Hz without lowering quality dynamically.

## Commands

- Install dependencies: `pnpm install`
- Start the app: `pnpm tauri dev`
- Run all checks: `pnpm check`
- Build the frontend: `pnpm build`
- Run tests in watch mode: `pnpm test`

Run `pnpm check` before reporting a coding task complete.

## Code rules

- Use TypeScript strict mode. Do not use `any` unless unavoidable and documented.
- Prefer small, single-purpose modules and explicit types at Tauri command boundaries.
- Validate untrusted input at the Rust/Tauri boundary.
- Keep real-time visualizer data out of React state and context.
- Do not perform file I/O, database access, logging, allocation-heavy work, or IPC inside the audio callback.
- Reuse buffers and typed arrays in hot paths; avoid per-frame allocations.
- Keep generated files under `src-tauri/gen/` unchanged.
- Add or update tests for changed logic when practical.

## Git workflow

- Work in small, focused changes.
- Use Conventional Commits, such as `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, and `chore:`.
- Do not mix unrelated refactoring with feature or bug-fix commits.
- Do not commit, push, rebase, amend, reset, or force-push unless explicitly requested.
- Never commit secrets, local environment files, build outputs, or generated dependencies.
- Before a commit, run `pnpm check`. Stop commiting if failed.

## Boundaries

- Ask before adding or replacing production dependencies.
- Ask before changing database schemas, Tauri capabilities, security-sensitive configuration, or release settings.
- Do not weaken lint, type-check, test, or security rules merely to make checks pass.
- Preserve existing behavior unless the task explicitly requests a behavior change.
