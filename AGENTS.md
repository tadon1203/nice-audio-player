# AGENTS.md

## Purpose

This file defines repository-wide operating instructions for coding agents.

Do not duplicate product, design, requirements, or architecture rules here.
The linked documents below are the single sources of truth for their respective domains.

## Sources of Truth

Before changing a domain, read its source of truth.

- [PRODUCT.md](./PRODUCT.md)
  - Product purpose, positioning, operating context, brand commitments, and durable product principles.

- [docs/requirements.md](./docs/requirements.md)
  - Accepted product requirements and user-visible capabilities.

- [DESIGN.md](./DESIGN.md)
  - Visual design, interaction behavior, typography, layout, responsive behavior, motion, accessibility, and design-system rules.

- [docs/architecture.md](./docs/architecture.md)
  - State ownership, dependency direction, IPC, persistence, concurrency, audio, frontend boundaries, and durable implementation rules.

- [README.md](./README.md)
  - Repository setup and development entry points.

The current GitHub Issue defines the scope and acceptance conditions of the current change.

An Issue does not override a source of truth unless the Issue explicitly changes that contract.

Current code and tests establish the current implementation and regression behavior. They do not
silently override a source of truth.

Do not duplicate a durable rule from one source-of-truth document into another.

If two sources of truth conflict about the same responsibility, STOP before implementation.
Report the conflicting statements. Do not choose, merge, or reinterpret them.

## Task Authorization

### Read-only requests

Review, research, investigation, diagnosis, critique, explanation, and planning are read-only.

For a read-only request, MUST NOT:

- modify repository-managed files;
- format files;
- regenerate files;
- modify the Git worktree, index, branches, or refs;
- perform GitHub writes.

### Implementation requests

An explicit request to implement, fix, refactor, update, or build authorizes repository-managed file
edits within the requested scope and non-destructive validation.

It does NOT authorize:

- branch creation or switching;
- staging;
- commits or amendments;
- stashing;
- rebasing;
- resets;
- restoring or discarding changes;
- fetching or pulling;
- pushing;
- PR or Issue writes;
- merges;
- branch deletion.

Do not modify unrelated code.

Do not change an accepted product, design, requirement, public contract, persistence contract, or
architecture rule unless the requested task explicitly changes that contract.

## Before Editing Existing Behavior

Before changing existing behavior, identify:

1. the caller that initiates the behavior;
2. the authoritative state or policy;
3. downstream consumers affected by the result;
4. where affected state or resources are created, mutated, replaced, and destroyed;
5. whether the operation can overlap, be cancelled, be superseded, or complete late;
6. existing tests for the behavior;
7. the applicable source of truth.

Do not infer ownership from filenames, directory placement, or the location of the visible symptom.

If multiple symptoms have one confirmed root cause, fix that root cause instead of adding independent
local workarounds.

## Repository Rules

Use TypeScript strict mode.

MUST NOT use `any` unless the type cannot be represented otherwise and the reason is documented at
the use site.

MUST NOT manually edit:

- `src/bindings.ts`;
- files under `src-tauri/gen/`.

When a Rust Tauri command or IPC type changes:

1. edit the authoritative Rust definition;
2. run `pnpm bindings:generate`;
3. update affected consumers;
4. run `pnpm bindings:check`.

MUST NOT weaken lint, type-check, test, security, accessibility, or real-time-audio rules to make a
change pass validation.

MUST NOT add a compatibility layer, abstraction, fallback, migration, or persistent mechanism unless
a current requirement or existing consumer requires it.

## UI Work

For any change affecting UI, interaction, layout, responsive behavior, motion, typography,
accessibility, or visual design:

1. read [DESIGN.md](./DESIGN.md);
2. read the applicable frontend boundaries in [docs/architecture.md](./docs/architecture.md);
3. use the installed [Impeccable skill](./.agents/skills/impeccable/SKILL.md) according to its current instructions.

Do not claim an Impeccable playbook was used unless its current instructions were actually read and
applied.

Do not copy DESIGN.md or architecture rules into this file.

## Testing and Validation

Changed behavior MUST be protected by automated tests when the repository has an automated boundary
capable of proving that behavior.

When correctness depends on unavailable Windows, audio hardware, display scaling, or another physical
environment, report the exact manual validation that remains required.

Do not claim a test, visual inspection, hardware check, or environment-specific validation that was
not actually performed.

Use `pwsh` for PowerShell commands.

| Purpose                            | Command                  |
| ---------------------------------- | ------------------------ |
| Install dependencies               | `pnpm install`           |
| Start application                  | `pnpm tauri dev`         |
| Build frontend                     | `pnpm build`             |
| Frontend tests                     | `pnpm test`              |
| Layout tests                       | `pnpm test:layout`       |
| Validate DESIGN.md                 | `pnpm design:lint`       |
| Check local licensed fonts         | `pnpm fonts:check`       |
| Generate IPC bindings              | `pnpm bindings:generate` |
| Check IPC bindings                 | `pnpm bindings:check`    |
| Format frontend, tooling, and Rust | `pnpm format`            |
| Build release package              | `pnpm package`           |
| Comprehensive validation           | `pnpm check`             |

Before reporting an implementation task complete, MUST run:

`pnpm check`

If `pnpm check` fails, MUST NOT report the implementation as complete.

If `pnpm check` cannot complete because the required environment is unavailable, report:

- the command that did not complete;
- the failing or unavailable dependency;
- the validation that remains unverified.

## Git and GitHub Authorization

Read-only Git inspection is allowed when required for the task.

Allowed without additional authorization:

- `git status`;
- `git diff`;
- `git log`;
- `git show`;
- `git branch --show-current`.

Any Git operation that changes the worktree, index, branches, refs, or remote state requires explicit
user authorization.

Any GitHub write requires explicit user authorization.

Without explicit authorization, MUST NOT:

- create or switch branches;
- stage files;
- commit or amend;
- stash;
- restore or discard changes;
- reset;
- rebase;
- fetch or pull;
- push or force-push;
- delete branches;
- create or modify Issues;
- create or modify PRs;
- submit GitHub comments or reviews;
- merge.

MUST NOT modify, stage, discard, or commit unrelated user changes.

MUST NOT use `git reset --hard`, `git clean -fd`, force-push, or destructive restoration unless the
user explicitly requests that exact destructive operation after its consequences are known.

## Git Workflow

Use exactly:

`1 Issue = 1 Branch = 1 PR`

Branch name:

`<type>/<issue-number>-<kebab-case>`

Allowed types:

- `feat`
- `fix`
- `refactor`
- `perf`
- `docs`
- `test`
- `build`
- `ci`
- `chore`
- `revert`

The branch, PR title, and squash-merge title use the Issue's primary change type.

PR and squash-merge title:

`<type>: <summary>`

Individual commits use the Conventional Commit type that truthfully describes that commit.

Completed Issue work is integrated using Squash Merge only.

### Start Issue branch

Only perform this workflow when the user explicitly requests creation or start of the Issue branch.

1. require a clean worktree;
2. run `git fetch origin`;
3. inspect local `main` and `origin/main`;
4. STOP if local `main` contains commits not in `origin/main` or has diverged;
5. switch to `main`;
6. fast-forward local `main` to `origin/main` only;
7. create the Issue branch from that exact commit.

MUST NOT reset or rewrite local `main` to make it match `origin/main`.

### `commit`

When the user explicitly requests `commit`:

1. verify the current branch;
2. inspect the complete diff;
3. stage only files belonging to the current task;
4. create the commit.

`commit` does not authorize:

- push;
- branch creation or switching;
- PR writes;
- Issue writes;
- merge;
- amendment of an existing commit.

If unrelated changes cannot be safely excluded, STOP.

### `push`

When the user explicitly requests `push`:

- push the current Issue branch;
- establish its upstream if required.

`push` does not authorize creating a commit from uncommitted changes.

MUST NOT push directly to `main`.

MUST NOT force-push unless the user explicitly requests a force-push.

### `open pr`

When the user explicitly requests `open pr`:

1. verify the current Issue branch;
2. require intended changes to be committed;
3. push existing commits if required;
4. create the PR, or update the PR for the same branch and Issue;
5. include `Closes #<issue-number>` in the PR body.

`open pr` does not authorize creating a new commit.

If intended Issue changes remain uncommitted, STOP.

### `squash merge`

When the user explicitly requests `squash merge`, that request authorizes the Git and GitHub writes
listed in this workflow only.

Execute in this order:

1. verify that the current branch, PR, and Issue match;
2. STOP if unrelated working-tree changes exist;
3. commit any remaining in-scope changes;
4. require a clean worktree;
5. run `pnpm check` on the exact commit to be merged;
6. STOP if validation fails;
7. verify every required Issue acceptance or Done item;
8. STOP if any required item is unverified;
9. push the validated commit;
10. create or update the PR if required;
11. ensure the PR body contains `Closes #<issue-number>`;
12. mark only verified Issue checklist items complete;
13. STOP if any required Issue item remains incomplete;
14. squash-merge the PR using `<type>: <summary>`;
15. confirm that the merge succeeded;
16. delete the merged remote Issue branch if it still exists;
17. switch local checkout to `main`;
18. run `git fetch origin`;
19. fast-forward local `main` to `origin/main` only;
20. STOP if local `main` cannot fast-forward; MUST NOT reset it;
21. delete only the merged local Issue branch;
22. verify a clean worktree.

Any source change after step 5 invalidates the validation result.
Run `pnpm check` again before merge.
