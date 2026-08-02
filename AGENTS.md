# AGENTS.md

## Project

- **Product**: Nice Audio Player is a Windows desktop audio player built with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS.
- **Priority**: Treat audio stability as the highest runtime priority.
- **State**: Keep authoritative audio and persistent application state in Rust.
- **UI**: Keep presentation and user interaction in React.

## Documentation

Read the relevant document before changing behavior or boundaries:

- `README.md`: Project entry point and development guide.
- `DESIGN.md`: Shared visual tokens and interaction principles.
- `docs/requirements.md`: Accepted product requirements.
- `docs/architecture.md`: Implementation rules and boundaries.
- **GitHub Issues**: Individual features, experiments, and implementation scope.

Update a long-lived document only when a change intentionally modifies its accepted requirements or rules. Do not copy Issue-specific plans or temporary implementation details into documentation.

`DESIGN.md` is the normative visual reference. Its prose, specific references, and intentional Do's and Don'ts describe the design intent; token values support that context and are not, by themselves, rendering instructions. `src/styles/theme.css` is the manually maintained implementation of the currently supported design decisions, translated into Tailwind and CSS variables rather than mechanically generated from `DESIGN.md`. Do not add durable colors, typography values, spacing values, radii, shadows, or motion values outside `theme.css`. When a durable visual decision changes, update `DESIGN.md` to describe the intent and update `theme.css` to implement it in the same change. Feature-specific layout values remain local to the feature.

## Commands

Use `pwsh` for PowerShell commands.

- **Install dependencies**: `pnpm install`
- **Start the app**: `pnpm tauri dev`
- **Build the frontend**: `pnpm build`
- **Run frontend tests once and exit**: `pnpm test`
- **Run browser layout tests**: `pnpm test:layout`
- **Run all checks**: `pnpm check`
- **Format frontend, tooling, and Rust**: `pnpm format`
- **Validate the design system**: `pnpm design:lint`
- **Check local licensed fonts**: `pnpm fonts:check`
- **Build a release package**: `pnpm package`
- **Generate IPC bindings**: `pnpm bindings:generate`
- **Check IPC bindings**: `pnpm bindings:check`
- **Package the app when explicitly required**: `pnpm tauri build`

Run `pnpm check` before reporting a task complete or merging a change. It is the repository's
single comprehensive validation command.

Run `pnpm check` before reporting a coding task as complete.

## Code Rules

- **Strictness**: Use TypeScript strict mode. Do not use `any` unless unavoidable and documented.
- **Structure**: Prefer small, single-purpose modules. Use relative imports within the same feature and `@/` imports for shared code.
- **IPC Boundaries**: Use explicit types at Tauri command boundaries and validate untrusted input at the Rust/Tauri boundary.
- **Audio Thread Safety**: Do not perform file I/O, database access, logging, IPC, sleeping, blocking synchronization, or allocation-heavy work inside an audio callback.
- **Performance**: Reuse buffers and typed arrays in hot paths; avoid per-frame allocations.
- **React State**: Keep high-frequency audio and visualization data out of React state and context.
- **Generated Code**: Do not manually edit generated files under `src-tauri/gen/` or `src/bindings.ts`.
  When changing a Rust Tauri command or IPC type, run `pnpm bindings:generate` and verify the
  result with `pnpm bindings:check`.
- **Testing**: Add or update tests for changed logic when practical.

### Responsive layout review

- Application-wide changes use viewport queries.
- Reusable components use container queries.
- Flexible Grid tracks use `minmax(0, 1fr)`.
- Flexible children use `min-inline-size: 0`.
- Fixed controls preserve 40×40px or 48×48px targets.
- Long user data has a defined wrap, clamp, or scroll behavior.
- 640px and 800px layout tests pass.
- Horizontal overflow and doubled text-token stress tests pass.
- DOM order matches reading and keyboard order.

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
  - Remote/GitHub operations: Primary choice is the **GitHub connector**. If unavailable or failing, fall back to **`gh` CLI** automatically.
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
3. **Update Issue**: Mark verified `- [ ]` as `- [x]` (via GitHub connector or `gh`). Ensure all required items are checked.
4. **Push & PR**: Commit/push any remaining work. Open or update PR with `Closes #<issue-number>` in the body.
5. **Squash Merge**: Squash-merge PR into `main` using `<type>: <summary>`.
6. **Clean Up**: Delete remote branch (via GitHub connector or `gh`), delete local branch, sync local `main` with `origin/main`, and ensure clean worktree.

## Boundaries

Do not:

- Weaken lint, type-check, test, or security rules merely to make checks pass.
- Add broad lint suppressions when a narrower fix or annotation is possible.
- Change public command or event contracts without updating their consumers.
- Preserve temporary compatibility code without a current requirement.
- Introduce abstractions solely for hypothetical future implementations.
- Change existing behavior unless the task explicitly requires it.
