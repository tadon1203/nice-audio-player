---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Read `docs/agents/implementation-ready.md`. Before you start, compare the ticket's Files with the current tree. Stop and ask the user if a Files entry does not match the code, or if the spec and the ticket do not tell you where, what, or how. Write the problem under `## Comments` in the ticket. Decide all other things yourself.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Delete the finished ticket file in the same commit (see `docs/agents/issue-tracker.md`). Commit your work to the current branch.
