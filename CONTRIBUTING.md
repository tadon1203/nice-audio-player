# `CONTRIBUTING.md`

# Contributing

This document defines the repository contribution and Git/GitHub workflow.

## Workflow

Use one Issue, one branch, and one pull request for each change.

Implementation Issues use `.github/ISSUE_TEMPLATE/task.yml`.

Branch names use `<type>/<issue-number>-<kebab-case>`.

Use one of:

`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.

PR and squash-merge titles use `<type>: <summary>`.

Individual commits use the Conventional Commit type that describes that commit.

Merge completed Issue work with Squash Merge only.

## Commit messages

Use this format:

`<type>(<scope>): <imperative summary>`

The scope is optional. Use the type list above, keep the summary concise, start it
with a lowercase verb, and omit the final period. Use the body when the reason or
trade-off is not clear from the summary. Use footers for issue references or
breaking-change details. Keep each commit focused on one logical change.

For example:

`fix(transport): reject malformed backend responses`

This follows the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).

## Local verification

Use `pnpm validate` for consistency checks, tests, and production builds:

- generated binding consistency
- Angular, Electron, shared TypeScript, and generated binding checks
- Prettier, ESLint, and Stylelint
- Rust formatting, Clippy, and tests
- unit and end-to-end tests
- production renderer, Electron, backend, and runtime builds

Use `pnpm test` when only the test suites are needed. End-to-end tests build a
temporary renderer to serve the application. `pnpm format` writes formatting
changes; formatting is checked as part of `pnpm validate`.

## Git and GitHub

Use `git` for local Git operations and the GitHub connector for supported GitHub operations.

Do not use `gh`.

Git and GitHub writes require an explicit user request and authorize only the requested operation.

Do not push directly to `main`.

Do not force-push unless explicitly requested.

Before committing, inspect the current branch and diff and include only the current Issue's changes.

Before merging, verify the Issue acceptance conditions and run all validation required by the repository.
