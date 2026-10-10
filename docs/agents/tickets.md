# Specs and tickets

A feature lives in `.scratch/<feature-slug>/` while it is in progress.

- `/to-spec` writes `spec.md`. The spec carries the decisions from the design session to `/to-tickets`. `/to-tickets` keeps it. No skill deletes it. Tickets do not link to it.
- `/to-tickets` writes one file per ticket: `issues/<NN>-<slug>.md`, numbered from `01`.
- The tickets are done in number order. A ticket depends only on tickets with lower numbers.
- `/commit-ticket` commits a finished ticket and deletes the ticket file. The commit is the record (`.scratch/` is not tracked). When no ticket is left, it deletes the feature directory.

## Implementation-ready standard

The standard that every ticket meets is in [implementation-ready.md](implementation-ready.md).

## Ticket template

```md
# <NN>: <title>

## What to build

The behavior this ticket makes work. Use domain terms.

## How

## Contracts

## Files

## Tests

The seams to test at, and the test files.

## Acceptance criteria

- [ ] Criterion
```

When the implementer stops, it adds a `## Comments` section at the bottom and writes the problem there.
