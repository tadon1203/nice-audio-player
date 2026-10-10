---
name: commit-ticket
description: "Commit the implemented ticket and delete the ticket file."
disable-model-invocation: true
---

Read `docs/agents/tickets.md` and `docs/agents/git-workflow.md`. The ticket is the lowest-numbered file in `.scratch/<feature-slug>/issues/`, or the path the user gives.

1. If the working tree has no changes, stop.
2. Delete the ticket. If `issues/` is then empty, delete `.scratch/<feature-slug>/`.
3. Commit all changes. Put the ticket number and title in the message body.
