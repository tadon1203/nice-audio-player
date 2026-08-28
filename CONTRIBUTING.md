# CONTRIBUTING.md

## Workflow

Use one Issue, one branch, and one pull request for each change.

New implementation Issues use `.github/ISSUE_TEMPLATE/task.yml`.

Branch names use `<type>/<issue-number>-<kebab-case>`, where `type` is one of `feat`, `fix`,
`refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, or `revert`.

The Issue's primary change type determines the branch name, PR title, and squash-merge title. PR and
squash-merge titles use `<type>: <summary>`. Individual commits use the Conventional Commit type that
truthfully describes that commit.

Completed Issue work is integrated with Squash Merge only.

## Git and GitHub

Use `git` for local repository and Git transport operations. Use the GitHub connector for supported
GitHub operations such as Issues, pull requests, and reviews.

DO NOT use `gh`. GitHub CLI authentication and permissions can be unreliable inside the Codex
sandbox because host credentials or required network access may not be available to sandboxed
processes.

If a required GitHub operation is unavailable through the GitHub connector, report it as blocked.
DO NOT fall back to `gh`.

Git and GitHub writes require an explicit user request, and authorization is limited to the requested
operation. DO NOT modify, stage, commit, discard, push, merge, or otherwise rewrite unrelated work.

DO NOT push directly to `main`. DO NOT force-push unless explicitly requested.

## Operations

When asked to `commit`, inspect the current branch and complete diff, then commit only the current
Issue's changes. Stop if unrelated changes cannot be safely excluded. A commit request does not
authorize push, branch, PR, Issue, merge, or amend operations.

When asked to `push`, push the existing commits on the current Issue branch and establish its upstream
when required. Do not implicitly commit uncommitted work.

When asked to `open pr`, require the intended Issue changes to be committed, push the branch when
required, then create or update the PR for the same branch and Issue. Include
`Closes #<issue-number>` in the PR body. Do not create a new commit as part of opening the PR.

When asked to `squash merge`, verify that the Issue, branch, PR, working tree, required acceptance
conditions, and the exact commit to be merged are consistent. Run `pnpm check` before merging and
stop if it fails or a required Issue item remains unverified. Update only Issue checklist items that
have actually been verified.

Any source change after the successful pre-merge `pnpm check` invalidates that result and requires
`pnpm check` to be run again before merge.

After a successful Squash Merge, remove only the merged Issue branch, synchronize local `main` by
fast-forward only, and finish with a clean working tree. DO NOT reset or otherwise rewrite local
`main` if it cannot fast-forward.
