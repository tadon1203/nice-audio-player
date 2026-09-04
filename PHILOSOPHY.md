# Development Philosophy

This document defines the software engineering principles used to evolve Nice Audio Player.

## Goals

- **Minimize cognitive load.** Reduce the number of independent concepts, rules, exceptions, and relationships needed to understand and change the project.
- **Localize change.** Keep the effects of a change within the smallest responsible part of the system.
- **Minimize uncertainty.** Make ownership, behavior, failure, and completion explicit and verifiable.

These goals apply to architecture, code, tooling, and documentation.

## Design Principles

### Structure and Boundaries

- **Use maintained capabilities.** Prefer platform, framework, and library capabilities over project-specific implementations. Add thin boundaries where isolation is needed; do not reproduce the capability behind them.

- **Structure by responsibility and ownership.** Layers and modules exist to separate real responsibilities, ownership, or dependency direction. Boundaries isolate domains, processes, trust levels, or external dependencies. Do not add structure for hypothetical reuse, replacement, or future flexibility.

- **Make structure legible.** Organize layers, modules, directories, and boundaries so responsibility, ownership, and dependency direction are apparent from the repository structure. Use consistent structural patterns for equivalent responsibilities; structural differences should reflect meaningful differences.

### Contracts and Lifecycle

- **Keep contracts and data flow explicit.** Prefer explicit dependencies, typed contracts, structured errors, and clear ownership over hidden coupling or duplicated authority.

- **Make lifecycle explicit.** Treat failure, interruption, cancellation, replacement, and shutdown as normal states where they apply. Long-lived work has an owner and a defined end.

- **Make intent legible.** Use consistent vocabulary, names, APIs, and local code patterns for the same concepts so responsibility, data flow, and lifecycle are understandable without tracing unnecessary implementation detail. Differences should communicate meaningful differences.

### Long-term Evolution

- **Optimize for continued change.** Prefer structures that remain understandable as the system, team, and requirements evolve.

- **Preserve clear ownership.** Keep responsibilities, authority, and contracts explicit so that changes do not create hidden dependencies or competing sources of truth.

- **Prefer repeatable confidence.** Favor decisions whose correctness can be checked consistently rather than relying on memory, convention, or individual judgment.

- **Localize unavoidable complexity.** When complexity or exceptions cannot be removed, isolate them behind a clear boundary so they do not spread through the system.

- **Avoid temporary permanence.** Do not turn a short-term constraint, workaround, or incidental implementation detail into an architectural commitment without deliberate justification.

- **Leave the system easier to change.** A change should reduce or preserve the effort required to understand and modify the affected area.

## Documentation

Documentation is a tree of small sources of truth. Each document owns one responsibility, information is written once and linked elsewhere, and only current decisions and behavior are documented.

Keep documentation as short as possible without losing information needed for correct implementation or use.

Prefer one broadly applicable statement over several narrow examples.

Do not repeat information that is already clear from code, types, tests, tooling, or another source of truth.
