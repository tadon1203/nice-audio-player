# Coding standards

General best practices for Rust, TypeScript, and Svelte 5 take precedence over this document. If a rule here conflicts with standard community practices, change the rule.

Do not document rules that linters or formatters already enforce. Tool configuration is the single source of truth for formatting and linting.

## Documentation and general rules

- Write comments and documentation in clear, simple English (ASD-STE100 can be used as a general guide).
- Documentation is a single source of truth. Keep each fact in one place; link to it rather than duplicating it.
- Keep dependency versions locked via the package manager lockfiles.

## Design principles

- **Keep it simple and plain**: Avoid speculative enterprise abstractions, unnecessary forwarding layers, and single-implementation traits or interfaces. Introduce seams only where behavior actually varies or at I/O boundaries.
- **Single source of truth**: Each piece of state has one clear owner. Derived values should be calculated on demand rather than stored and synchronized manually.
- **Fail cleanly**: Validate data at boundaries (I/O, IPC, user input). Trust validated internal data. Do not write defensive fallbacks or silent error swallowing that masks bugs.
- **Commands vs. Queries**: A command mutates state and acknowledges completion or failure; it does not return the updated global state. Queries read data without modifying state.

## Naming

Keep naming **boring, plain, and conventional**. Do not use ornate or enterprise-style patterns.

- **Conventions by language**:
- **Rust**: Follow standard [Rust API Guidelines (Naming)](https://rust-lang.github.io/api-guidelines/naming.html).
- **TypeScript**: Standard `UpperCamelCase` for types/classes/interfaces, `lowerCamelCase` for variables and functions, and `SCREAMING_SNAKE_CASE` for constants.

- **Boring and direct**:
- Name things for what they are, not how clever they sound. Use concrete nouns for types/values and active verbs for functions.
- Avoid clever metaphors or project-specific jargon where standard, boring terms exist.
- Abbreviate only universally recognized terms. Spell out everything else.

## Errors and panics

- **Recoverable conditions**: Use `Result` for failures that can normally happen in an environment (file missing, network/device drop, invalid input).
- **Unrecoverable bugs**: Unmet internal invariants and impossible conditions should panic or abort. Avoid defensive checks that create dead code.
- **Validation**: Validate at system boundaries. Pass strongly typed, validated values inward.
- **Error chains**: Preserve error causes using standard error wrapping (`?`, `source`, or error context libraries) rather than discarding error context.

## Rust

- Standard idioms take precedence. Favor plain functions and standard structs over complex generic hierarchies.
- Use `anyhow::Result` for application-level handling where errors are simply propagated, and explicit `thiserror` enums for domain boundaries where callers must pattern-match specific variants.
- Real-time or audio threads must not allocate, block, lock, or perform I/O.
- Handle every `Result`. Log or explicitly pass errors up; do not discard errors with `let _ = ...` unless dropping the result is deliberate (e.g., sending to an optional or closed channel).

## Frontend (TypeScript & Svelte 5)

- Favor plain objects and standard functions. Use classes primarily when encapsulating reactive state and behavior together.
- Keep presentational components decoupled from global store and application logic by passing data via props.

### Svelte 5 conventions

- Follow official Svelte 5 runes guidance:
- Use `$state` for mutable values that affect the UI.
- Compute derived state using `$derived`. Do not synchronize state inside `$effect`.
- Use `$effect` only for side effects (DOM interaction, external subscriptions, analytics).
- Use `<svelte:window>` / `<svelte:document>` for window-level event listeners.
- Use standard runes mode for all new code (`$props`, `$derived`, `$effect`, snippets).

## Testing

- Test through public interfaces rather than inspecting internal or private details.
- Mock or replace dependencies only at real boundaries (e.g., OS/hardware interfaces, timers, external I/O). Do not mock internal helpers.
- Keep unit tests close to the tested code, and integration/E2E tests focused on user-visible behavior.
