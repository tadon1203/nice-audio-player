---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

Read `docs/agents/issue-tracker.md` and `docs/agents/implementation-ready.md`. The spec must meet the implementation-ready standard.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Read `CONTEXT.md` and the ADRs for the area you work in.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker.
<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

Decisions that apply to more than one module (architecture, schema, protocols, order of work) come first, each in its own subsection. Then one subsection per module that will be built or changed:

### <Module>

**Files:** the paths to create, change, and delete.

**Contracts:**

```ts
// Public types and signatures, IPC commands and DTOs. No function bodies.
```

**Approach:** a few lines on how the module works. For example, where the state lives and which mechanism does the work.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested, and the test files
- Prior art for the tests (i.e. similar types of tests in the codebase), with paths

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
