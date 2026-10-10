---
name: to-tickets
description: Break a spec into numbered tracer-bullet tickets that each meet the implementation-ready standard.
disable-model-invocation: true
---

Read `docs/agents/tickets.md`. The input is `.scratch/<feature-slug>/spec.md`, or the path the user gives.

## Process

1. Read the spec. Explore the code that it touches. Look for a prefactoring that makes the change easy.
2. Draft the tickets:
   - Each ticket is a vertical slice through every layer that it needs, and it is verifiable by itself. A prefactoring comes first.
   - Number the tickets in the order of work.
   - Copy into each ticket the decisions, contracts, and seams from the spec that it needs. Put each change from the spec's Docs section into the ticket that implements that behavior.
   - If a ticket needs a What or a How that the spec does not give, it is an open decision. Write it down for step 3.
   - Apply the size rule.
3. Show the user the numbered list: title, what it delivers, size estimate with the files behind it, and the open decisions. Iterate until the user approves. Do not ask whether the granularity feels right. The size rule decides it.
4. Write the tickets with the template in `docs/agents/tickets.md`. Then delete the spec.

## Size rule

The agent reads, builds, checks, and reviews one ticket in one 200k-token context, without `/clear` or compaction.

**total = 40k + read + write + checks**

- 40k: the start of every session.
- read: about 12 tokens per line, for the ticket and each file read in full. Count each file once.
- write: about 12 tokens per line added or changed, times 2.
- checks: 5k per check command, 3 runs each. Count one E2E run or a Rust build as 15k.

If the total is over 200k, split the ticket where each part is still verifiable. If no such place exists, add a prefactoring ticket first. Never merge tickets to reduce their number.

A **wide refactor** (one mechanical change with call sites across the codebase) cannot be one vertical slice. Number it expand → migrate in batches → contract, so that each ticket leaves the old form working until the last one.
