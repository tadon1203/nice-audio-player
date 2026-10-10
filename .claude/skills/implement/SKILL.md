---
name: implement
description: "Implement the next ticket, review it, and stop before the commit."
disable-model-invocation: true
---

Read `docs/agents/tickets.md`. The ticket is the lowest-numbered file in `.scratch/<feature-slug>/issues/`, or the path the user gives. If a ticket with a lower number exists, stop.

1. If the ticket does not give the What or the How, stop and write the problem under `## Comments` in the ticket. Decide all other things yourself, also when the Files list is not exact.
2. Implement with /tdd at the seams in the ticket.
3. Run only the lightest checks that cover the change (see the commands in `CLAUDE.md`).
4. Run /code-review with the ticket path. Fix every Spec finding and every hard Standards violation. Decide each smell yourself, and give a one-line reason for each smell that you do not fix. Run the checks again. Do not review again.

Do not commit and do not delete the ticket. The user does this with `/commit-ticket`.
