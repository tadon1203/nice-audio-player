# Conventions

These are the rules that lint cannot check. The reasons are in the ADRs that each rule links.

## Renderer

- Do not write `create…` factories. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not use the `private` keyword. Use `#` for private members. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Put one public class in each file. The file name is the class name in kebab-case. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Pass members to the template directly only as arrow-function fields. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- State transitions are value objects. Calculations are static-only classes. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Failures are typed exceptions. See [ADR 0007](adr/0007-failures-are-typed-exceptions-caught-in-three-places.md).

## Backend tests

Placement rule:

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in `<module dir>/tests/<behavior>.rs`. `<module dir>/tests/mod.rs` holds only shared helpers and the `mod` lines.
- A test of the `BackendApp` public surface goes in `backend/src/app/tests/<behavior>.rs`.
