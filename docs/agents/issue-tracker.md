# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- A finished ticket is deleted in the commit that implements it. The commit is the record.
- Add comments to the bottom of the file, under a `## Comments` heading.

## Ticket template

This is the only definition of the ticket format. Skills link here.

```md
Status: ready-for-agent

# <NN>: <Ticket title>

**Parent:** `.scratch/<feature-slug>/spec.md`

**Blocked by:** <numbers of the tickets that gate this one, or "None">

## What to build

The end-to-end behavior this ticket makes work. Use domain terms. Put design details in the spec and link to them. Do not list file paths or code.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
```

## Ticket size

A ticket fits in one 200k-token context. The agent reads, builds, checks and reviews it without a `/clear` or a compaction. See `to-tickets` for how to judge this.

## Triage label

The only value of the `Status:` line is `ready-for-agent`: fully specified, ready for an AFK agent. This repo does not use the other roles in the skills (`needs-triage`, `needs-info`, `ready-for-human`, `wontfix`). If a skill mentions a role, use `ready-for-agent`, or drop the ticket.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
