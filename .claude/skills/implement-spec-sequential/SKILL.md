---
name: implement-spec-sequential
description: "Implement a spec sequentially, with a fresh subagent for each ticket on the current branch."
disable-model-invocation: true
---

Implement the spec at `.scratch/<feature>/spec.md` via its tickets in `.scratch/<feature>/issues/NN-<slug>.md` (see `docs/agents/issue-tracker.md`).

You are the **parent**. You own the ticket graph; you do not implement tickets yourself. Each ticket goes to a fresh **implementer subagent**, strictly one at a time, in the current checkout and on the current branch. Wait for that ticket to finish and verify it before starting the next one.

Communicate with subagents through **context pointers** (paths, commit hashes), not copied text.

## Steps

1. Read the spec and every ticket's `Status:` and `Blocked by:` lines. Read ticket bodies only as needed to pick the next one. Confirm the working tree is clean and record the starting commit for the final review.

2. Loop until no ticket is open:
   1. Pick the **frontier** ticket: `Status` is open, and every `Blocked by` ticket is `done`. Lowest number wins. If none is ready but some are open, stop and report the blockage.
   2. Spawn one **implementer subagent** with a short prompt:
      - Paths to the spec, and this ticket.
      - Hashes of the commits of its `Blocked by` tickets, so it can read what they did.
      - Instructions: implement only this ticket; follow the repository's engineering rules and run the checks required by the diff; commit to the current branch; then set the ticket to `Status: done` with `Commit: <hash>` pointing to that implementation commit, following the issue tracker's conventions; reply with the hash and a 2-3 line summary, plus anything that affects later tickets.
   3. Verify: `git status` is clean and the ticket file says `done` with a commit hash. If the subagent failed or left a mess, fix the ticket's instructions or spawn a fresh implementer to finish it; do not patch the code yourself. If it is stuck on a design question, ask the user.
   4. If the summary changes later tickets (a renamed seam, a dropped assumption), edit those ticket files now. Commit tracked ticket updates before starting the next implementer; local gitignored tickets stay in the issue tracker.

3. When all tickets are done, run `/code-review` against the commit you started from. Fix everything it raises in a single fresh implementer subagent, then commit.

4. Report: tickets done, commits, and anything left over. Do not push.
