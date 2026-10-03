---
name: implement-spec-serial
description: "Implement a spec ticket by ticket. The parent owns the ticket graph; each ticket runs in a fresh subagent, one at a time, on the current branch."
disable-model-invocation: true
---

Implement the spec at `.scratch/<feature>/spec.md` via its tickets in `.scratch/<feature>/issues/NN-<slug>.md` (see `docs/agents/issue-tracker.md`).

You are the **parent**. You own the ticket graph; you do not implement tickets yourself. Each ticket goes to a fresh **implementer subagent**, strictly one at a time, on the current branch. No worktrees, no branches, no PR, no merging.

Communicate with subagents through **context pointers** (paths, commit hashes), not copied text.

## Steps

1. Read the spec and every ticket's `Status:` and `Blocked by:` lines. Read ticket bodies only as needed to pick the next one. Confirm the working tree is clean.

2. Loop until no ticket is open:
   1. Pick the **frontier** ticket: `Status` is open, and every `Blocked by` ticket is `done`. Lowest number wins. If none is ready but some are open, stop and report the blockage.
   2. Spawn one implementer subagent (foreground, `general-purpose`) with a short prompt:
      - Paths to `CLAUDE.md`, the spec, and this ticket.
      - Hashes of the commits of its `Blocked by` tickets, so it can read what they did.
      - Instructions: implement only this ticket; follow `CLAUDE.md` (use `/tdd` where it fits, run only the checks the diff needs, `pnpm format`); commit to the current branch; set the ticket to `Status: done` with `Commit: <hash>` in the same commit; reply with the hash and a 2-3 line summary, plus anything that affects later tickets.
   3. Verify: `git status` is clean and the ticket file says `done` with a commit hash. If the subagent failed or left a mess, fix the ticket's instructions or spawn a fresh implementer to finish it; do not patch the code yourself. If it is stuck on a design question, ask the user.
   4. If the summary changes later tickets (a renamed seam, a dropped assumption), edit those ticket files now.

3. When all tickets are done, run `/code-review` against the commit you started from. Fix everything it raises in a single fresh implementer subagent, then commit.

4. Report: tickets done, commits, and anything left over. Do not push.
