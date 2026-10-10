# Coding standards

These are the rules for code that lint cannot check. Do not write a rule here if a lint or format tool enforces it. The tool configuration is the source of truth for those rules. The reasons are in the ADRs that each rule links.

## All code

- Write comments and documentation in English. Follow ASD-STE100 (Simplified Technical English).

## Renderer

- Do not write `create…` factories. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Do not use the `private` keyword. Use `#` for private members. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Put one public class in each file. The file name is the class name in kebab-case. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Pass members to the template directly only as arrow-function fields. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Construct a class that uses `$effect` during component initialization. Do not use `$effect.root`. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- State transitions are value objects. Calculations are static-only classes. See [ADR 0006](adr/0006-renderer-logic-in-classes-svelte-declarative.md).
- Failures are typed exceptions. See [ADR 0007](adr/0007-failures-are-typed-exceptions-caught-in-three-places.md).
- Import icons one by one (`@lucide/svelte/icons/x`). Never import from the `@lucide/svelte` barrel. The barrel slows `vite dev` and the E2E runs.

## Backend tests

- A test of one small function stays in its file, in `#[cfg(test)] mod tests`.
- A test of a module's behavior goes in `<module dir>/tests/<behavior>.rs`. `<module dir>/tests/mod.rs` holds only shared helpers and the `mod` lines.
- A test of the `BackendApp` public surface goes in `backend/src/app/tests/<behavior>.rs`.

## E2E tests (`tests-app/`)

- Find regions by `aria-label` or role with CSS. Narrow from page to element: `$(scope).$(…)`.
- Use a text selector only as the final step of a chain. Do not mix strategies in one selector string.
- Add `data-testid` only where no accessible name exists.
- Do not use Tauri or WebdriverIO internals.
