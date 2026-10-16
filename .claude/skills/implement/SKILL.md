---
name: implement
description: "Implement the next ticket, review it, and stop before the commit."
disable-model-invocation: true
---

Read `docs/agents/tickets.md`. The ticket is the lowest-numbered file in `.scratch/<feature-slug>/issues/`, or the path the user gives. If a ticket with a lower number exists, stop.

1. If the ticket does not give the What or the How, stop and write the problem under `## Comments` in the ticket. Do the same if the How proves wrong during the work. Decide all other things yourself, also when the Files list is not exact.
2. Implement with /tdd at the seams in the ticket.
   - When one identical change goes into five or more files, make it with one scripted replace. Do not read each file. Check it with `git diff --stat` and the checks.
   - Read a file in full only to edit it. Read a file that you only look at with Grep or a ranged Read, and never dump several files at once.
3. Run only the lightest checks that cover the change (see the commands in `CLAUDE.md`). Write the output of each run to a file. Show only the exit code and the failing lines.
4. Run /code-review with the ticket path. Fix every Spec finding and every hard Standards violation. Decide each smell yourself, and give a one-line reason for each smell that you do not fix. Run the checks again. Do not review again.

Do not commit and do not delete the ticket. The user does this with `/commit-ticket`.
