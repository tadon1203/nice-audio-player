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

## Git and GitHub

Use `git` for local Git operations and the GitHub connector for supported GitHub operations.

Do not use `gh`.

Git and GitHub writes require an explicit user request and authorize only the requested operation.

Do not push directly to `main`.

Do not force-push unless explicitly requested.

Before committing, inspect the current branch and diff and include only the current Issue's changes.

Before merging, verify the Issue acceptance conditions and run all validation required by the repository.
