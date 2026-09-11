!IMPORTANT: THIS IS THE FILE FOR INTERNAL PROMPTS. DO NOT REFER TO THIS FILE!

the dev workflow is like:
a nice model like gpt5.6 sol high on chatgpt web interface with entire codebase on its workspace generates super clear plan, cheap models luna mid or high impl it on codex.
"the web" is defined here as ChatGPT web inferface.
use `python scripts/create-project-snapshot.py` to provide the web the entire codebase. currently we use `Project` sources. use `git diff HEAD` or `git diff` to update the codebase on the web.
use the web, which is not included in codex usage, to save the codex usage (money as well).
set /goal and the below prompt for cheap models to prevent it from stop implementing even it's not complete.
"user" is defined here as the manual interop-er between codex and the web.
during long Codex implementation runs, user reports Codex logs to the web so progress can be monitored without interrupting the work.
after a plan implemented, user reports diff by above commands with the diff review prompt below. So this is kinda Plan->Impl->Review loop until Review reports no problem.
the review report may include comments by user like explaining UI/UX problem which is difficult to be found just reviewing code.
before report, the web must apply provided diff to its workspace.

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

this prompt prevents cheap models like gpt5.6 luna

IMPLEMENT the plan completely from start to finish.
DO NOT use placeholders.
DO NOT write comments instead of code.

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

snapshotをワークスペースに上書き展開して。

AGENTS.mdと、そこからすべてのdocsを読んで。
アーキテクチャ、コード構造、実行経路が把握できる程度に、現在のコード・caller・testを読んで。

Project Contextからコンテキストを参照することが許可されているが、参照した情報がoutdatedでないことを、提供されたsnapshotやdiffに対して保証する必要がある。

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

# Web Diff Review Prompt

Review the following diff against the current repository state. Your goal is to identify confirmed problems, regressions, and structural design issues backed strictly by repository evidence.

## The Investigation Loop

Do not finalize your review after the first plausible finding. You must continuously iterate your investigation (tracing execution paths, checking contracts, and verifying callers) until the following exit conditions are met:

1. Every candidate finding has been verified against actual repository code, tests, or established contracts.
2. The true root cause (not just the visible symptom) and the authoritative owner of the state are identified.
3. Additional evidence is unlikely to confirm, refute, or materially change your findings.

## Core Principles

- **Structural Integrity:** Evaluate changes against both repository conventions and established engineering principles. Do not blindly accept or propagate existing architectural flaws, anti-patterns, or technical debt merely because they already exist in the codebase.
- **Constructive Evolution:** If the current repository design is structurally unsound (e.g., tight coupling, improper state ownership, security risks), highlight it and propose a robust alternative.
- **Pragmatism over Pedantry:** While structural redesigns are encouraged when justified by concrete technical risk, do not report findings based purely on aesthetic preferences, naming conventions, or theoretical over-engineering (YAGNI). Every structural critique must state the concrete future risk it prevents.
- **Root Cause over Symptom:** Reject fixes that only treat the visible symptom (e.g., adding arbitrary null checks or defensive fallbacks). Correct the problem at the appropriate architectural boundary.

## Output Format

Follow this exact format. Do not add other top-level sections.

### Confirmed findings

(If none, write: **None.**)

#### [P0|P1|P2|P3] <Short finding title>

- **Location:** `<file>:<line>`
- **Root cause:** The underlying architectural, state, or contract problem.
- **Condition:** The concrete state, execution path, or input that triggers it.
- **Impact:** Practical impact on the system.
- **Evidence:** The code or established contract that confirms the problem.
- **Fix:** A concrete executable correction at the correct responsibility boundary.

### Questions / assumptions

(If none, write: **None.**)
List only matters that require user clarification or missing evidence.

//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////

# Web Research, Design, and Implementation Planning Prompt for Issue #${ISSUE_NUMBER}

Investigate Issue #${ISSUE_NUMBER} and the current repository, make the required technical decisions, and produce a self-contained implementation plan for the implementation agent (Codex).

This planning task runs in ChatGPT Web. Because this environment lacks an iterative execution harness, you must actively loop your research and design phases before outputting the final plan.

## The Planning Loop

Do not finalize the plan simply because you found one plausible approach. Iterate your investigation and internally audit your candidate design until:

1. Every explicit Issue requirement and completion condition is accounted for.
2. All implementation-relevant decisions (architecture, interfaces, state ownership) are resolved using repository evidence.
3. **No Band-Aid Fixes:** You have traced the execution path far enough upstream to identify the true root cause. You are fixing the core issue, not applying a local workaround or defensive check.
4. **No Ambiguity:** You are not leaving open choices for the implementation agent (Codex). If a material decision cannot be resolved via evidence, you must halt and request a user decision.

## Authority and Scope

- **Architectural Soundness:** Treat explicit Issue requirements and external public contracts as fixed. However, do not blindly replicate existing internal implementation patterns if they are structurally flawed, fragile, or inadequate for the requested feature.
- **Establish Best Practices:** You have the authority to introduce established, structurally sound engineering patterns when the existing codebase foundation is weak. Design the implementation to be robust and scalable.
- **Reject Superficial Fixes:** If a bug is caused by a violated upstream invariant, fix the upstream logic. Do not patch the downstream consumer with defensive code.

## Output Format (The Final Plan)

Transfer your settled decisions into this exact structure. Exclude your internal investigation logs or conversational filler.

### Title

A concise, implementation-oriented title.

### Summary

The purpose of the change, current behavior, and selected solution.

### Implementation Changes

1. [Numbered steps in dependency order]. Detail what changes, where, and how. Include affected state lifecycle, error behavior, and exact landmarks so the agent can execute without re-investigating.

### Public Interfaces

Describe changes to public APIs, types, configuration, etc. If none, write: `No public interface changes.`

### Tests and Validation

List the specific observable test cases, validation commands, or required manual checks to prove the implementation is fully correct.

### Assumptions and Decisions

(Optional) Record any material technical defaults chosen. If you intentionally broke from an existing repository convention to fix a structural flaw, briefly document it here so the implementation agent understands the shift.
