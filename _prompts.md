!IMPORTANT: THIS IS THE FILE FOR INTERNAL PROMPTS. DO NOT REFER TO THIS FILE!

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

snapshotをワークスペースに上書き展開して。

プロジェクトのドキュメントをすべて読んで。
アーキテクチャ、コード構造が把握できる程度にコードを読んで。
Project Contextからコンテキストを参照することが許可されているが、参照した情報がoutdatedでないことを保証する必要がある。

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

# Diff Review Prompt

Review the following diff against the current repository state and identify confirmed problems, regressions, design issues, and unresolved assumptions that are materially relevant to the change.

The goal is not to approve or reject the change. The goal is to determine whether the implementation is correct, appropriate for the repository, and sound at the level of behavior, architecture, state ownership, interfaces, tests, and user experience.

## Review process

Do not make a decision based only on the diff.

Examine the surrounding code, callers, types, configurations, tests, existing design, repository documentation, accepted behavior, and relevant execution paths before reaching a conclusion.

When an Issue, specification, design document, existing contract, or previously accepted behavior defines the intended result, review the diff against that contract rather than only against nearby implementation details.

If a repository snapshot archive is attached, extract it into the designated review workspace and replace the previously extracted snapshot so the review uses the supplied repository state. Do not modify repository-managed source files as part of the review.

Do not make assumptions without evidence. Do not ignore the context of the codebase.

Trace changed data and state through the actual execution path when relevant, including ownership, lifetime, initialization, replacement, stale or late results, error propagation, and cleanup.

Evaluate the appropriateness of the implementation shape itself. A change should not be considered satisfactory merely because a narrow patch could make the immediate symptom work. When evidence shows that the chosen responsibility boundary, state model, abstraction, interaction model, or architecture is the root cause of a practical problem, review that design directly.

A focused redesign, refactor, responsibility shift, or contract change is a valid recommendation when it resolves the confirmed root cause more appropriately than a local workaround. Do not prefer a smaller patch merely because it changes fewer lines.

At the same time, do not recommend broad redesign merely because another approach is cleaner, more elegant, more familiar, or personally preferable. Any redesign recommendation must remain justified by the confirmed finding, the repository's current direction, and the practical cost or risk of leaving the root cause in place.

Base findings on practical operational problems. Consider the project size, established architecture, purpose of the change, current execution paths, and likely maintenance burden.

Do not report problems only because of:

- personal preference;
- alternative design possibilities without a demonstrated advantage for the changed behavior;
- stylistic disagreement;
- theoretical concerns without evidence;
- formal principle violations that have no practical consequence;
- missing defensive checks when the relevant invariant is demonstrably guaranteed by an authoritative upstream boundary and the changed code is not responsible for re-validating it.

## UI / UX and Impeccable

When the diff affects UI, interaction, layout, motion, responsive behavior, accessibility, or visual polish, use the repository's installed Impeccable skill at `.agents/skills/impeccable`.

Read the actual workspace instructions and use only the review-oriented guidance relevant to the changed experience.

Use Impeccable together with the repository's own product and design documentation, existing components, current interaction conventions, rendered behavior, screenshots, and layout tests when available.

Evaluate not only visual defects, but also whether the chosen hierarchy, layout, interaction model, responsive behavior, accessibility, and motion are appropriate for the task.

A focused UI or interaction redesign is valid when the current structure itself is the confirmed source of the problem.

Do not use Impeccable to justify unrelated redesign, aesthetic preference, or changes that conflict with explicit repository requirements.

When rendered evidence is available, inspect it before confirming visual or interaction findings. When rendered evidence is unavailable and the source alone cannot establish the problem, do not present the matter as a confirmed finding.

## Primary review areas

Check these areas during the review:

- Correctness and expected behavior
- Behavioral regressions and compatibility
- State ownership, lifecycle, and synchronization
- Architecture and responsibility boundaries
- Security and data protection
- Performance, resource usage, and reliability
- Error handling and boundary conditions
- Public contracts, generated bindings, configuration, and persistence when affected
- Maintainability and change locality
- UI hierarchy, interaction behavior, responsiveness, accessibility, and motion when affected
- Missing tests that protect important behaviors

Do not mechanically produce a finding for every review area. Report only confirmed problems that materially apply to the diff.

## Engineering principles

Use SOLID, DRY, KISS, YAGNI, separation of concerns, loose coupling, high cohesion, and general repository conventions as tools for evaluating whether the changed design is actually appropriate.

Do not apply these principles only for the sake of compliance.

Report a principle-related problem only when it causes or realistically leads to a concrete defect, regression, repeated inconsistency, higher modification cost, dependency problem, reliability problem, or operational risk.

Pay particular attention when the diff introduces duplicated authoritative state, unclear ownership, repeated policy logic, unnecessary cross-layer knowledge, abstraction leakage, or a responsibility boundary that makes the changed behavior materially harder or riskier to evolve.

Evidence must establish why the current structure creates a practical problem for the changed behavior. The fact that another structure would be cleaner is not sufficient.

## Requirements for a confirmed finding

A valid confirmed finding must meet all of these conditions:

- The diff introduces, worsens, or newly exposes the problem.
- You can identify the root cause rather than only the visible symptom.
- You can explain the specific condition, execution path, state, input, environment, or sequence that triggers the problem.
- The problem has a realistic impact.
- You can show evidence from the code, callers, tests, configurations, types, rendered behavior, existing contracts, or repository documentation.
- You can provide a concrete and executable correction at the appropriate level of abstraction.

Do not report a possible lack of evidence or a theoretical concern as a confirmed problem.

Examine additional repository context when it is available and materially relevant.

Do not move a matter to **Questions / assumptions** merely because confirming it requires inspecting additional repository context that is available.

If a matter still cannot be confirmed after reasonable investigation, report it only under **Questions / assumptions**.

Do not use an unconfirmed matter as a confirmed finding unless the uncertainty itself creates a concrete correctness, safety, compatibility, or operational risk.

## Existing-code findings

Report a problem in existing code only when at least one of the following is true:

- the diff introduces a new execution path through the problem;
- the diff worsens the problem;
- the diff exposes the problem in a newly relevant way;
- the correctness, safety, or appropriateness of the proposed change depends on that existing behavior.

Do not report unrelated pre-existing defects.

## Test findings

Report missing tests only when the existing tests do not protect a modified important behavior, contract, failure path, state transition, or realistic regression risk.

Do not report a problem only because the diff does not modify a test file.

A missing-test finding must explain:

- which changed behavior is not protected;
- what realistic regression could escape;
- why the existing tests do not already cover it;
- what test would materially protect the behavior.

Do not require duplicate tests for behavior already protected at an authoritative boundary.

## Public contracts, generated code, and persistence

When the diff changes a public schema, IPC contract, serialized type, generated binding, configuration format, migration-sensitive behavior, or persistent data model, verify the corresponding compatibility, generation, migration, and validation behavior.

Do not require migration or compatibility work when the changed contract is demonstrably internal and no persisted or external consumer depends on it.

## Finding grouping

Combine multiple effects that come from the same root cause into one finding.

Do not split one underlying defect into separate findings merely because it produces several symptoms.

Prefer the smallest number of findings that accurately represent independent root causes.

When several local symptoms would all be resolved by correcting one unsuitable responsibility boundary, state model, abstraction, or interaction model, report the structural root cause rather than listing each symptom separately.

---

# Output format

Follow this format exactly.

Do not add other top-level sections.

## Confirmed findings

If there are no confirmed findings, write:

**None.**

Otherwise, list findings in descending severity.

Use this exact structure for every finding:

### [P0|P1|P2|P3] Short finding title

- **Location:** `<file>:<line or symbol>` or the smallest useful code scope
- **Root cause:** The underlying implementation, state, responsibility, contract, or interaction-design problem that produces the defect.
- **Condition:** The concrete execution path, state, input, environment, or sequence that triggers the problem.
- **Impact:** The realistic user, system, security, reliability, performance, compatibility, accessibility, or maintenance impact.
- **Evidence:** The surrounding code, caller, type, test, configuration, rendered behavior, repository documentation, or established contract that confirms the problem.
- **Fix:** The correction that best resolves the root cause in the context of the current repository. A local patch, refactor, responsibility shift, contract adjustment, or focused redesign is acceptable. Explain the necessary scope when the fix must be broader than the immediate symptom.

### Severity definitions

- **P0 — Critical:** Catastrophic failure such as data loss, severe security vulnerability, system-wide outage, or an equivalently unacceptable failure.
- **P1 — High:** A realistic correctness, reliability, security, accessibility, data-protection, compatibility, or structural defect in an important execution path with serious practical impact or repeated/systemic failure risk.
- **P2 — Medium:** A confirmed defect, regression, or design problem with limited current scope but meaningful practical impact, including a structure that materially increases the cost or risk of evolving the changed behavior.
- **P3 — Low:** A confirmed minor defect with limited practical impact.

Severity must reflect practical impact and likelihood, not code style, reviewer preference, or the size of the recommended fix.

A finding that requires a large redesign is not automatically high severity, and a finding fixed by one line is not automatically low severity.

## Questions / assumptions

If there are no unresolved questions or assumptions, write:

**None.**

Otherwise, list only matters that could not be confirmed after examining the available repository context.

For each item:

- explain what is unknown;
- explain why the available code or evidence does not resolve it;
- state what evidence would resolve it, when useful.

Do not present questions or assumptions as confirmed defects.

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

# Research, Design, and Implementation Planning Prompt for Issue #${ISSUE_NUMBER}

Investigate Issue #${ISSUE_NUMBER} and the current repository implementation, make the technical and product-design decisions required for implementation, and produce a self-contained implementation plan.

The final plan must allow another engineer or implementation agent to begin immediately without repeating the investigation or making additional implementation-level decisions.

Use available read-only tools, including GitHub and web search when relevant. Do not create, edit, delete, format, generate, migrate, or otherwise modify repository-managed files.

## Scope and Authorization

Exercise broad technical judgment within the confirmed Issue scope.

Independently determine repository-consistent technical choices when they preserve the confirmed product behavior, public contracts, compatibility expectations, security boundaries, and implementation scope.

Treat the following as fixed design inputs unless newer authoritative evidence applicable to the Issue explicitly supersedes them:

- explicit Issue requirements;
- acceptance conditions;
- stated exclusions;
- repository-established external contracts.

Do not infer authorization to:

- add product requirements not supported by the Issue or repository;
- weaken or reinterpret an acceptance condition;
- expand the change into unrelated cleanup or redesign;
- perform implementation changes.

Do not replace a confirmed requirement, acceptance condition, exclusion, or external contract during design selection unless authoritative evidence establishes that it has been superseded.

Introduce a user-visible behavior, acceptance condition, public contract, or compatibility guarantee only when the Issue, an existing repository contract, or an authoritative source applicable to the Issue establishes it.

Treat all other choices as internal technical decisions.

Reopen a settled decision only when new evidence shows that it is incorrect, incomplete, or incompatible with the Issue.

## Evidence and Investigation

Establish the facts needed to select one coherent implementation approach.

Determine, when relevant:

- the problem, confirmed requirements, and observable target behavior;
- the current behavior and the responsibilities that produce it;
- the affected subsystems, interfaces, data, configuration, and workflows;
- the implementation or structural cause of the affected behavior;
- the affected data flows and control flows;
- error behavior and boundary conditions;
- compatibility, migration, deployment, and operability implications;
- the tests required to establish the intended behavior;
- the actual repository commands for testing, type checking, linting, building, and other validation;
- the conditions that demonstrate completion of the Issue.

For affected state, determine the relevant ownership and lifecycle properties, including creation, initialization, mutation, replacement, synchronization, lifetime, and cleanup.

When the execution path can produce stale, late, concurrent, cancelled, or superseded results, determine how those results are identified and handled.

Trace how errors, cancellation, completion, replacement, and other relevant lifecycle transitions propagate through the actual execution path.

Identify the callers, subsystem boundaries, downstream consumers, and authoritative decision points that determine where each affected responsibility currently lives.

Determine whether the same authoritative state or policy is independently maintained in more than one place.

Determine whether the affected behavior depends on duplicated policy logic, unclear ownership, unnecessary cross-layer knowledge, or implementation details exposed across a responsibility boundary.

Determine whether the current responsibility boundary, state model, abstraction, interface, interaction model, or architectural placement materially contributes to the Issue.

Inspect the Issue, discussion, linked material, current code, callers, tests, configuration, repository documentation, and relevant history or pull requests as needed to establish these facts.

Trace each affected execution path far enough to establish the responsibilities and contracts that control the changed behavior.

Do not infer ownership or architectural boundaries from file proximity, naming, or expected diff shape when callers or downstream behavior establish them more directly.

Confirm factual claims from repository evidence or authoritative sources.

When sources conflict, evaluate their purpose, scope, authority, and recency. Select the interpretation most consistent with the Issue and current implementation, and surface the conflict when it affects design or implementation scope.

Prefer repository-specific evidence over general engineering guidance when the repository can establish the relevant behavior, contract, ownership, dependency, convention, or constraint.

Stop expanding the investigation when additional evidence is unlikely to change the selected approach, reveal a material unresolved decision, or alter the confirmed scope.

## Product and Interaction Design

When the Issue affects UI, interaction design, visual behavior, motion, responsive behavior, accessibility, or another user-facing experience, use the repository's installed Impeccable skill at `.agents/skills/impeccable` during design investigation.

Read the actual skill instructions and relevant playbooks from the current workspace. Do not rely on remembered or assumed behavior.

Follow the skill's routing and setup guidance, and select only the playbooks relevant to the Issue and the current planning phase.

Use the skill as a design and product-engineering framework rather than as a requirement to introduce visual change.

Preserve the repository's established product world, design system, interaction semantics, and documented constraints unless the confirmed Issue requires a change.

Use repository product and design documentation, existing components, rendered behavior when available, and relevant skill guidance to resolve concrete decisions about:

- hierarchy and layout;
- component responsibility;
- interaction and visual states;
- responsive behavior;
- accessibility;
- motion.

Resolve implementation-relevant user-facing design decisions during planning rather than leaving them to the implementation agent.

Do not mechanically apply every playbook, generic heuristic, or aesthetic recommendation.

When skill guidance conflicts with an explicit Issue requirement or authoritative repository-specific design documentation, preserve the confirmed product requirement or repository contract.

Surface the conflict when it materially affects the plan.

## Design Judgment and Decisions

Apply technical judgment only after establishing the relevant requirements, contracts, execution paths, ownership, constraints, and repository conventions that available evidence can determine.

Do not use design judgment to replace an answer that repository evidence, an authoritative contract, or an existing requirement already determines.

When multiple implementation designs remain compatible with the established evidence, confirmed scope, and fixed contracts, select one design using the criteria in this section.

Before selecting the approach, distinguish the observable symptom from the responsibility, state, contract, dependency, lifecycle, or interaction that produces it.

Evaluate whether the current responsibility boundary, state model, abstraction, interface, interaction model, or architectural placement is part of the cause.

Do not preserve the current implementation shape merely because a local patch can produce the immediate target behavior.

Select the narrowest coherent responsibility and behavior scope that satisfies the confirmed Issue and material quality constraints.

The selected design must:

- satisfy the confirmed requirements and completion conditions;
- resolve the identified cause of the affected behavior;
- introduce no unrelated behavior or contract changes;
- give each affected authoritative responsibility or state a defined owner;
- include the dependencies and supporting changes required for that responsibility to function through the actual execution path.

The narrowest coherent scope does not mean the fewest changed lines, files, components, or layers.

Do not preserve a responsibility boundary or implementation shape that materially causes the Issue merely to reduce the diff.

Treat change magnitude as a consequence of the selected coherent design rather than as an independent optimization target.

Do not impose an a priori limit on the number of files, lines, components, layers, or internal structures that may change when those changes are necessary to carry the selected design through the affected execution path.

Every material change must be justified by the confirmed Issue, the identified cause, the selected responsibility or contract structure, or the validation required to establish correctness.

Do not enlarge the change for unrelated cleanup, aesthetic improvement, consistency work, or general code-quality improvement.

Do not minimize the diff mechanically.

A smaller patch is not preferable when it:

- preserves the cause of the Issue;
- duplicates authoritative state or policy;
- leaves ownership materially ambiguous;
- works around an incorrect responsibility boundary;
- fails to propagate the selected design through required callers or consumers;
- weakens the ability to establish correctness at the authoritative test boundary.

A larger change is not preferable merely because it produces a cleaner or more elegant architecture.

Select the coherent implementation first, then accept the change magnitude required by that implementation.

When otherwise valid designs remain, compare their concrete effects on the confirmed Issue, responsibilities, contracts, dependencies, lifecycle, reliability, compatibility, testability, operability, and implementation risk.

A focused refactor, responsibility shift, state-model change, contract adjustment, abstraction change, or focused redesign is valid when repository evidence shows that it resolves the identified cause more directly than preserving the current structure and applying a local workaround.

Do not select structural change merely because another design is cleaner, more elegant, more familiar, more conventional, or personally preferable.

Connect each structural change to a concrete consequence for the confirmed Issue, affected execution path, ownership, dependency structure, contract, reliability, test boundary, or later modification of the changed behavior.

Evaluate maintainability, security, performance, reliability, compatibility, operability, and testability when they materially affect the selected approach.

Evaluate those qualities through repository-specific consequences such as:

- duplicated authoritative state or policy;
- dependency direction and cross-layer knowledge;
- repeated modification of the same behavior across multiple subsystems;
- changed resource or state lifetime;
- additional synchronization, concurrency, cancellation, or failure paths;
- public-contract or persistent-data compatibility;
- deployment or migration requirements;
- the location and stability of authoritative test boundaries.

Do not introduce work solely to improve an abstract quality attribute without a concrete consequence for the confirmed change.

Use SOLID, DRY, KISS, YAGNI, separation of concerns, loose coupling, high cohesion, and established engineering conventions as decision aids rather than independent goals.

Express relevant principles through concrete decisions about responsibilities, dependencies, contracts, state, flows, and tests.

Do not use principle names as substitutes for implementation decisions.

Introduce an abstraction, compatibility layer, migration, fallback, or supporting mechanism only when the current implementation and confirmed requirements establish a concrete need.

Treat missing or inadequate tests as a design constraint.

Select the coverage required to establish current behavior, protect affected contracts, and verify the change without expanding the Issue into unrelated cleanup.

### Architecture and Responsibility Decisions

For each materially affected behavior, establish:

- where the behavior or policy is currently decided;
- where affected state is created, mutated, replaced, and destroyed;
- which callers initiate the behavior;
- which consumers depend on the result;
- which component controls the relevant lifetime;
- which interface or contract crosses each relevant subsystem boundary;
- whether authoritative state or policy is independently maintained elsewhere;
- whether one layer depends on implementation details of another layer that its own responsibility does not require.

When one responsibility or authoritative value is independently maintained in multiple places, establish one explicit authority unless a confirmed contract or execution constraint requires the duplication.

When multiple symptoms or required edits share one responsibility, state, contract, ownership, or dependency cause, design the implementation around that shared cause.

Do not treat such symptoms as unrelated local modifications.

When multiple responsibility boundaries remain valid after applying established contracts and execution constraints, compare their effects on:

- authoritative ownership;
- dependency direction;
- required cross-layer knowledge;
- lifecycle control;
- modification locality;
- test boundaries.

Select the boundary that best satisfies the confirmed Issue and these concrete constraints.

### Project-Specific Decisions

For each project-specific numerical threshold, configuration default, dependency choice, public contract shape, error classification, persistent-data change, or user-visible behavior introduced by the design:

- identify why the decision is required;
- ground it in the Issue, repository constraints, measured evidence, or an authoritative source;
- evaluate material alternatives when more than one defensible choice remains;
- explain the relevant trade-off;
- distinguish an internal technical default from a product requirement, acceptance condition, public contract, or compatibility guarantee.

Select technical defaults autonomously when their effects remain within the confirmed scope and established contracts.

Do not silently convert an implementation convenience into an external guarantee.

When evidence does not uniquely determine a decision, record the evidence that constrains it and make the technical choice during planning.

Do not defer an implementation-level choice to the implementation agent when the available evidence permits a defensible decision.

## Uncertainty and Questions

Resolve uncertainty in this order:

1. Confirm the answer from repository or authoritative evidence.
2. Select the technical choice most consistent with the current design and established constraints.
3. Choose a low-impact internal default that preserves confirmed behavior, contracts, and scope.
4. Ask the user when the remaining choice requires a product or material scope decision.

For step 2, establish consistency from repository-observable properties relevant to the decision, such as ownership, dependency direction, public contracts, state lifetime, subsystem boundaries, interaction semantics, and authoritative data flow.

Do not treat superficial similarity to nearby code as sufficient when the affected existing structure is implicated in the Issue.

Consistency with the current design does not require preserving a responsibility boundary, state model, abstraction, or interaction model that the investigated execution path establishes as a cause of the Issue.

In that case, select the smallest justified structural correction that satisfies the confirmed scope and fixed contracts.

For step 3, keep the default internal to the confirmed implementation scope.

The default must preserve established external behavior and contracts and must not create a new product requirement or compatibility guarantee.

Ask a question only when reasonable read-only investigation is complete and the remaining decision cannot be established from available evidence.

Ask only when the existing design does not provide a defensible default and the decision materially changes scope or public contracts.

Write questions and answer options in English.

When a material unresolved decision prevents selection of one coherent implementation approach, do not produce a speculative or branching implementation plan.

Output only:

- the unresolved decision;
- the evidence already established;
- the materially different consequences of the available choices;
- the specific user decision required.

## Plan Generation Standard

Produce the final plan only when the necessary facts and decisions are established.

Map every explicit Issue requirement and completion condition to a concrete implementation decision.

For each requirement or completion condition that repository tests, validation, or observable behavior can verify, identify the test or validation that establishes it.

Do not defer a requirement, contract interpretation, responsibility boundary, technical default, failure behavior, or required test to the implementation agent when investigation and design can establish it.

### Detail and Specificity

State what the implementation will change, preserve, validate, return, store, reject, or establish.

Organize implementation work in dependency order when sequence matters.

Make dependencies explicit when one change establishes behavior or structure required by another.

Include file paths, symbols, and exact identifiers when they identify the implementation target, distinguish it from similar code, or clarify a connection between subsystems.

When the selected design changes or deliberately preserves a responsibility boundary, authoritative state owner, abstraction, or cross-subsystem contract, state that decision explicitly.

For each such decision, identify when relevant:

- where the responsibility or authoritative state will live;
- which callers initiate or depend on it;
- which downstream consumers use it;
- how data and control move through the resulting execution path;
- how errors, cancellation, replacement, completion, and cleanup move through that path;
- which previous duplication, coupling, cross-layer knowledge, or ambiguity is removed or intentionally retained;
- which later implementation items depend on that structural decision.

When one structural decision resolves several local symptoms, organize the plan around that structural decision and its dependent changes.

Do not present those symptoms as unrelated patches.

Do not provide code, line-level edits, detailed pseudocode, or exhaustive file and symbol inventories unless they are necessary to remove an otherwise unresolved implementation ambiguity.

Avoid decision-deferring language such as:

- `handle appropriately`;
- `add as needed`;
- `follow the existing pattern`;
- `consider`;
- `choose a suitable value`;
- `update the relevant files`.

The implementation agent must not need to:

- locate the affected implementation;
- compare competing implementation approaches;
- choose responsibility boundaries;
- invent technical defaults;
- define edge-case behavior;
- determine required tests.

## Final Output

Write the complete final output in English.

Include only the completed implementation plan.

Exclude investigation logs, tool activity, private reasoning, introductory commentary, and instructions about writing style.

Use the following structure exactly.

### Title

Use a concise implementation-oriented title.

### Summary

State the purpose of the change, the relevant current behavior, and the selected solution.

Include constraints or trade-offs only when they are necessary to understand the design.

### Implementation Changes

Describe the implementation in numbered order.

Group items by subsystem or behavior when useful.

Each item must identify:

- the responsibility being changed;
- its connection to the existing implementation;
- the resulting behavior.

Include interface, configuration, error, compatibility, migration, documentation, test, and dependency details with the implementation item they affect.

When an item changes or establishes authoritative ownership, a responsibility boundary, state lifecycle, or cross-subsystem contract, describe that structure in the same item.

### Public Interfaces

Describe changes to public APIs, types, configuration, commands, events, serialized data, and persistent formats.

When none are affected, write:

`No public interface changes.`

Describe a public interface or externally guaranteed behavior only when the Issue, an existing repository contract, or an authoritative source applicable to the Issue establishes it.

Do not present an internal technical default as a public guarantee.

### Tests and Validation

Describe tests as observable behavior.

For each test, identify the relevant starting condition, operation, and expected result.

Group cases when they verify the same design property.

List only test, type-checking, linting, build, or validation commands confirmed from the repository.

Include manual validation only when automated tests cannot fully establish the behavior.

Cover each applicable category affected by the selected design:

- changed observable acceptance behavior;
- changed public, serialized, configuration, or persistent contract;
- failure behavior introduced or modified by the design;
- state transitions whose correctness depends on changed ownership, lifetime, replacement, synchronization, or cleanup;
- stale, late, concurrent, or superseded-result behavior when the affected execution path permits it;
- regression scenarios established by the current implementation, existing tests, Issue evidence, or the selected structural change.

Place tests at the authoritative boundary that establishes the behavior.

Add integration coverage when correctness depends on interaction between owners, callers, or consumers.

Do not duplicate the same behavioral assertion across layers when an existing authoritative test already establishes the relevant contract and the change does not alter that boundary.

### Assumptions and Decisions

Record material technical defaults and design decisions selected when the available evidence did not determine a unique answer.

For each recorded decision, explain:

- the evidence that constrained the choice;
- the material alternatives when more than one remained viable;
- why the selected choice was used within the confirmed scope.

Distinguish internal technical decisions from product requirements, acceptance conditions, public contracts, and compatibility guarantees.

Omit this section when no such assumption or decision requires explicit documentation.
