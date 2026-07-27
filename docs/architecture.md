# Architecture

This document defines implementation rules and boundaries for Nice Audio Player.

It describes constraints that should remain valid as the codebase evolves. It does not prescribe a final class diagram, list future features, or duplicate Issue-specific implementation plans. Product behavior belongs in `requirements.md`; visual and interaction rules belong in `ui-design.md`.

## 1. Core Principles

- Rust owns authoritative audio state, persistent application state, credentials, and long-running native work.
- React owns presentation, navigation, forms, and temporary interaction state.
- Audio stability has priority over UI and visualization work.
- Real-time code must be bounded, non-blocking, and allocation-conscious.
- Infrastructure-specific types must remain behind the boundary that uses them.
- Data crossing Tauri IPC must use stable, explicit transport types.
- Long-running work must have clear ownership, termination, and error behavior.
- Generated files under `src-tauri/gen/` must not be edited manually.

## 2. Responsibility and Ownership

Ownership must follow the lifetime and authority of the state.

- Long-lived playback state, when introduced, belongs in Rust.
- React may mirror Rust state for display but must not independently reconstruct authoritative playback state.
- A resource-owning operation must make the owner of streams, threads, tasks, buffers, database transactions, and cancellation handles clear.
- Drop-based cleanup is preferred when ownership alone can guarantee release.
- Explicit shutdown is required when a long-lived worker or external resource cannot be safely released by ordinary ownership.

Do not introduce a playback controller, worker, service, repository, provider registry, or shared interface until the current feature requires that responsibility.

## 3. Dependency Direction

Dependencies must point from policy and application behavior toward narrower infrastructure boundaries, not the reverse.

```text
React UI
    ↓
Frontend API adapters and transport types
    ↓
Tauri command and event adapters
    ↓
Rust application and domain logic
    ↓
Infrastructure such as CPAL, Symphonia, filesystem, SQLite, OS APIs, and HTTP
```

Rules:

- React must not depend on Rust infrastructure details.
- Tauri commands must not expose CPAL, Symphonia, SQL, operating-system, or provider-specific types.
- Audio policy must not depend directly on backend-specific stream or device types.
- Persistence models must not become universal application transport types.
- Provider-specific response models must be converted at the provider boundary.
- Circular module dependencies are not allowed.

## 4. Abstraction Rules

Do not introduce an abstraction solely for a hypothetical future implementation.

A shared interface is justified when at least one of the following is demonstrated:

- Multiple implementations must coexist
- Multiple independent consumers need the same boundary
- A backend must be replaceable for a current requirement
- Testing requires separation from a real external dependency
- Existing duplication represents the same stable policy rather than coincidental code

Prefer a concrete, narrow module until that evidence exists. Architecture documentation describes constraints, not a forecast of the final module structure.

## 5. Tauri Commands and Events

Tauri commands are transport adapters.

A command should:

1. Accept an explicit request
2. Validate untrusted transport input
3. Delegate substantial work to Rust modules
4. Convert results into stable response and error types
5. Move blocking or CPU-heavy work off the async executor

Commands must not:

- Execute SQL or control an audio callback directly
- Own long-lived playback state
- Return secret values
- Return infrastructure-specific errors or objects

Tauri events are appropriate for asynchronous, low-frequency notifications such as state changes, progress, completion, or device changes.

High-frequency PCM, FFT, waveform, peak, or RMS data must not be serialized as large JSON event streams. Event producers must use bounded or replace-latest delivery so slow consumers cannot create unbounded queues.

## 6. Real-Time Audio Rules

An audio callback must not:

- Perform file or network I/O
- Access a database
- Decode compressed audio
- Allocate or grow collections in the steady-state callback path
- Log
- Invoke Tauri IPC
- Sleep
- Wait on a blocking mutex, condition variable, or blocking channel
- Perform unbounded work
- Call UI code

An audio callback may:

- Read prepared PCM or bounded lock-free state
- Perform bounded sample conversion or gain processing
- Advance local or atomic positions
- Fill unused output with silence
- Publish bounded, non-blocking completion or error signals

All callback inputs must be prepared before the callback needs them. Callback failure handling must transfer only minimal state to non-real-time code.

## 7. PCM and Decode Boundaries

Decoded PCM must use an owned representation with explicit sample rate, channel count, layout contract, and validated invariants.

- Decoder-specific types stay inside the decode infrastructure.
- Output-backend types stay inside the output infrastructure.
- Decoding occurs outside the audio callback.
- Errors and cancellation must not return partial PCM unless an API explicitly promises partial results.
- Resampling, remixing, normalization, or gain changes must not occur implicitly.
- A processing-bypass or bit-perfect claim may be reported only when every application-controlled condition has been verified.

## 8. Concurrency and Background Work

Each task, thread, or worker must have:

- A clear owner
- A defined start condition
- A defined completion or shutdown condition
- Bounded communication
- Structured error reporting
- Cancellation where abandoning work is a current requirement

Do not add a persistent worker for a one-shot operation unless persistence is required by current behavior.

Do not hold a lock across I/O, decoding, IPC, or callbacks. Prefer immutable ownership transfer, atomics for simple flags and counters, and bounded channels for discrete control messages.

## 9. Persistence and Filesystem Rules

React and Tauri transport adapters must not execute SQL directly.

When persistence is introduced:

- Schema changes use migrations
- Multi-step writes use transactions when partial completion would be invalid
- Queries used by large lists support bounded pagination or streaming
- Database records are converted into application-facing models at a boundary

Filesystem operations must validate paths and expected file types at the Rust boundary. Source audio and metadata files must not be modified without explicit user intent.

## 10. Provider and Credential Rules

External providers must remain optional and isolated from local playback.

- Provider failures must not prevent unrelated providers or local functionality from working.
- Provider-specific models must be converted before leaving the provider boundary.
- Network access must be explicit and attributable to an enabled feature.
- Secret values must stay in Rust and must never be included in IPC, logs, database records, plain-text settings, or debug output.

A shared provider interface should be introduced only when current providers share a meaningful stable capability.

## 11. UI and Visualization Boundaries

React must not store per-frame PCM, FFT bins, waveform samples, peaks, or RMS values in ordinary component state or context.

High-frequency visualization should use a dedicated rendering path such as a worker or canvas-owned state when current functionality justifies it. The renderer must keep only current useful data; stale snapshots should be replaced or dropped rather than queued.

Visualization delays must not propagate back into audio production.

## 12. Error Handling

Infrastructure errors must be converted at their boundary into stable application errors.

Errors should preserve useful categories without exposing unstable implementation details. Raw error strings may be logged outside real-time code when they do not contain secrets, but transport contracts should use structured codes and fields.

Do not silently ignore an error when it changes user-visible state, data integrity, or an explicitly selected mode. Automatic fallback must be intentional and user-visible when it changes behavior or quality.

## 13. Logging

Logging must not occur inside audio callbacks or other strict real-time paths.

Logs must not contain:

- Credentials or tokens
- Full provider responses containing private data
- Raw PCM or high-frequency analysis data
- Unnecessary personal file information

Use logs to record lifecycle changes, recoverable failures, and diagnostic context outside performance-critical code.

## 14. Testing Boundaries

Prefer deterministic tests around pure policy and boundary logic.

- Test validation, conversion, configuration selection, buffer behavior, state transitions, and error mapping without requiring hardware where possible.
- Generate narrow fixtures rather than depending on user files.
- Do not make automated test success depend on a particular audio device, driver, display, network service, or credential store.
- Keep hardware- or operating-system-dependent behavior in explicit manual verification steps.
- Tests must not weaken production invariants merely to simplify fixtures.

## 15. Change Rules

A change that modifies an accepted product requirement must update `requirements.md`.

A change that modifies a durable implementation rule or boundary must update this document.

A change that modifies visual or interaction principles must update `ui-design.md`.

Issue scope, branch names, temporary structures, migration steps, and implementation plans belong in GitHub Issues or pull requests, not here.
