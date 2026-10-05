# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Finished tickets stay in `issues/`. Set `Status: done` and add `Commit: <hash>`. Run `pnpm tickets` for the overview.
- Record the triage state as a `Status:` line near the top of each issue file.
- Add comments to the bottom of the file, under a `## Comments` heading.

## Triage labels

This repo uses only two labels. A label is the value of the `Status:` line in a ticket file.

| Label in mattpocock/skills | Label in our tracker | Meaning                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent |
| (none)                     | `done`               | Implemented and committed               |

This repo does not use the other roles in the skills (`needs-triage`, `needs-info`, `ready-for-human`, `wontfix`). If a skill mentions one, use `ready-for-agent`, or drop the ticket. If a skill mentions a role (for example, "apply the AFK-ready triage label"), use the string from this table.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
