# Specs and tickets

A feature lives in `.scratch/<feature-slug>/` while it is in progress.

- `/to-spec` writes `spec.md`. The spec only carries the decisions from the design session to `/to-tickets`. `/to-tickets` deletes it.
- `/to-tickets` writes one file per ticket: `issues/<NN>-<slug>.md`, numbered from `01`.
- The tickets are done in number order. A ticket depends only on tickets with lower numbers.
- `/commit-ticket` commits a finished ticket and deletes the ticket file. The commit is the record (`.scratch/` is not tracked). When no ticket is left, it deletes the feature directory.

## Implementation-ready standard

A ticket is complete by itself. The implementer reads the ticket and the code, not the spec. The implementer can start without a design decision:

- **How** (most important): the approach in a few lines. For example, where the state lives and which mechanism does the work.
- **What**: the public types and signatures, and the commands and messages that cross a process boundary, as code. No function bodies. **Public** means used from outside the file that defines it.
- **Where**: the files to create, change, and delete, test files included. This is a guide, not a contract. A glob or "all callers of `X`" is correct.

A decision is **open** when the What or the How is not known. Open decisions go to the user, never to the implementer. The implementer decides all other things.

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
