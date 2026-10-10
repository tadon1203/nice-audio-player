---
name: to-spec
description: "Write the decisions of the current design session into a spec for /to-tickets."
disable-model-invocation: true
---

Run this in the same session as the design discussion. Read `docs/agents/tickets.md`.

1. Explore the code as necessary. Read `CONTEXT.md` and the ADRs for the area. If the design contradicts an ADR, say so.
2. Find the seams to test at. Prefer existing seams and the highest seam possible. The fewer seams, the better. Confirm them with the user.
3. Make sure that the What and the How of each change are known. Ask the user about each open decision.
4. Write `.scratch/<feature-slug>/spec.md`:

<spec-template>

## Problem

The problem, from the user's perspective.

## Solution

The solution, from the user's perspective.

## Decisions

Decisions that apply to more than one change, then one subsection per module with its Files, Contracts, and Approach.

## Seams

The seams to test at, with prior art in the codebase.

## Docs

The changes to `docs/requirements.md`, `ARCHITECTURE.md`, and other durable docs.

## Out of scope

</spec-template>
